import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildLatexContainerArgs } from "../app/lib/server/latex-sandbox";
export async function docker(
  args: string[],
  input?: string,
  maximum = 8_000_000,
  timeoutMs = 25000,
) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolveResult, reject) => {
      const child = spawn("docker", args, {
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const chunks: Buffer[] = [];
      let length = 0,
        stderr = "",
        failure: Error | undefined;
      const timer = setTimeout(() => {
        failure = Error("Verification CLI deadline exceeded");
        child.kill("SIGKILL");
      }, timeoutMs);
      child.stdout.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > maximum) {
          failure = Error("Verification output cap exceeded");
          child.kill("SIGKILL");
        } else chunks.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (stderr.length < 4096)
          stderr += chunk.toString().slice(0, 4096 - stderr.length);
      });
      child.stdin.on("error", () => {
        /* Process close supplies the classified result. */
      });
      child.on("error", (error) => {
        failure = error;
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (failure) reject(failure);
        else
          resolveResult({
            code,
            stdout: Buffer.concat(chunks).toString(),
            stderr,
          });
      });
      child.stdin.end(input);
    },
  );
}
export async function assertNoOwnedContainers() {
  const result = await docker(
    ["ps", "-a", "-q", "--filter", "label=resumide.latex.service=converter"],
    undefined,
    4096,
    5000,
  );
  assert.equal(result.code, 0);
  assert.equal(
    result.stdout.trim(),
    "",
    "Converter containers remain; never prune unrelated resources",
  );
}
export function assertLatexIsolation(container: Record<string, any>) {
  const host = container.HostConfig,
    config = container.Config;
  assert.equal(config.User, "65532:65532");
  assert.equal(host.ReadonlyRootfs, true);
  assert.equal(host.Privileged, false);
  assert.equal(host.NetworkMode, "none");
  assert.ok(!host.PidMode || host.PidMode === "private");
  assert.equal(host.IpcMode, "private");
  assert.equal(host.CgroupnsMode, "private");
  assert.deepEqual(host.CapDrop, ["ALL"]);
  assert.ok(!host.CapAdd?.length);
  assert.ok(host.SecurityOpt.includes("no-new-privileges"));
  assert.ok(
    !host.SecurityOpt.some((option: string) => /unconfined/.test(option)),
  );
  assert.equal(host.NanoCpus, 2_000_000_000);
  assert.equal(host.Memory, 536870912);
  assert.equal(host.MemorySwap, 536870912);
  assert.equal(host.PidsLimit, 64);
  for (const [name, value] of [
    ["nofile", 64],
    ["fsize", 8388608],
    ["cpu", 10],
  ] as const)
    assert.ok(
      host.Ulimits.some(
        (limit: { Name: string; Soft: number; Hard: number }) =>
          limit.Name === name && limit.Soft === value && limit.Hard === value,
      ),
    );
  assert.equal(host.LogConfig.Type, "none");
  assert.ok(!host.Binds?.length);
  assert.ok(!host.Devices?.length);
  assert.ok(!host.PortBindings || !Object.keys(host.PortBindings).length);
  assert.deepEqual(Object.keys(host.Tmpfs), ["/scratch"]);
  assert.match(host.Tmpfs["/scratch"], /size=128m/);
  assert.match(host.Tmpfs["/scratch"], /noexec/);
  assert.ok(
    container.Mounts.every(
      (mount: { Type: string; Destination: string }) =>
        mount.Type === "tmpfs" && mount.Destination === "/scratch",
    ),
  );
  assert.ok(
    config.Env.every(
      (entry: string) =>
        !/^(SUPABASE|OPENAI|METRICS|TOKEN|PASSWORD|SECRET|AWS|GOOGLE)/i.test(
          entry,
        ),
    ),
  );
}
export async function rawLatexAttempt(
  imageId: string,
  source: string,
  command?: { entrypoint: string; args: string[]; input?: string },
) {
  assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
  const name = `resumide-latex-${randomUUID()}`,
    args = buildLatexContainerArgs(name, imageId);
  if (command) {
    args.splice(args.length - 1, 0, "--entrypoint", command.entrypoint);
    args.push(...command.args);
  }
  const started = performance.now();
  try {
    const created = await docker(
      ["create", ...args.slice(1)],
      undefined,
      4096,
      5000,
    );
    assert.equal(
      created.code,
      0,
      "Owned verification container creation failed",
    );
    const inspected = await docker(["inspect", name], undefined, 64000, 5000);
    assert.equal(inspected.code, 0);
    const config = JSON.parse(inspected.stdout)[0];
    assertLatexIsolation(config);
    const result = await docker(
      ["start", "-a", "-i", name],
      command ? command.input : JSON.stringify({ source }),
    );
    assert.equal(
      result.code,
      0,
      "Isolated runner failed before its bounded result",
    );
    const value: Record<string, any> = JSON.parse(result.stdout);
    return {
      value,
      durationMs: Math.round(performance.now() - started),
      configuration: {
        user: config.Config.User,
        network: config.HostConfig.NetworkMode,
        memory: config.HostConfig.Memory,
        memorySwap: config.HostConfig.MemorySwap,
        cpus: config.HostConfig.NanoCpus,
        pids: config.HostConfig.PidsLimit,
        readOnly: config.HostConfig.ReadonlyRootfs,
        mounts: config.Mounts,
        security: config.HostConfig.SecurityOpt,
        logDriver: config.HostConfig.LogConfig.Type,
      },
    };
  } finally {
    await docker(["rm", "-f", name], undefined, 4096, 5000);
    const absent = await docker(
      ["container", "inspect", name],
      undefined,
      4096,
      5000,
    );
    assert.equal(absent.code, 1);
    assert.match(absent.stderr, /No such (object|container)/i);
  }
}
export async function latexSourceHashes() {
  const files = [
    "app/lib/server/latex-source.ts",
    "app/lib/server/latex-sandbox.ts",
    "scripts/latex-runtime/Dockerfile",
    "scripts/latex-runtime/landlock.c",
    "scripts/latex-runtime/supervisor.py",
    "scripts/latex-runtime/inspect_pdf.py",
    "scripts/latex-runtime/verify-jbig2.py",
    "scripts/latex-runtime/verify-image-admission.py",
    "scripts/latex-runtime/verify-image-boundaries-mock.py",
    "scripts/latex-runtime/verify-fontconfig-home.py",
    "scripts/latex-runtime/verify-native-frame.py",
    "scripts/latex-runtime/build-closure.py",
    "scripts/latex-runtime/build-fontconfig.py",
    "scripts/latex-runtime/native-expat/pins.json",
    "scripts/latex-runtime/native-expat/prepare.py",
    "scripts/latex-runtime/native-expat/build.py",
    "scripts/latex-runtime/native-expat/apt-transport.py",
    "scripts/latex-runtime/native-expat/abi-smoke.c",
    "scripts/latex-runtime/native-expat/native-utf16-tests.patch",
    "scripts/latex-runtime/native-expat/utf16-adapter-check.c",
    "scripts/latex-runtime/native-expat/provenance/trixie-security.InRelease",
    "scripts/latex-runtime/native-expat/provenance/sid.InRelease",
    "scripts/latex-runtime/texmf.cnf",
    "scripts/latex-runtime/requirements.lock",
    "scripts/latex-runtime/native_geometry.py",
    "scripts/latex-runtime/native-poppler/install-runtime.py",
    "scripts/latex-runtime/native-poppler/pins.json",
    "scripts/latex-runtime/native-poppler/build-pins.json",
    "scripts/latex-runtime/native-poppler/prepare_build.py",
    "scripts/latex-runtime/native-poppler/build-v5.py",
    "scripts/latex-runtime/native-poppler/verify_native_v6.py",
    "scripts/latex-runtime/native-poppler/verify_install.py",
    "scripts/latex-runtime/native-poppler/native_geometry.py",
    "scripts/latex-runtime/native-poppler/verify_consumer.py",
    "scripts/latex-runtime/native-poppler/abi-smoke.cc",
    "scripts/latex-runtime/native-poppler/disable-openjpeg-packaging.diff",
    "scripts/latex-runtime/native-poppler/changelog-proposal.diff",
    "scripts/latex-runtime/native-poppler/series-proposal.diff",
    "scripts/latex-runtime/native-poppler/patches/resumide-native-geometry-v1.patch",
    "scripts/latex-runtime/native-poppler/provenance/trixie-main.InRelease",
    "scripts/latex-runtime/native-poppler/provenance/testdata-files.json",
    "scripts/latex-runtime/native-poppler/inputs/poppler-testdata.tar.xz",
    "scripts/latex-runtime/native-poppler/Dockerfile.plan-lock-v6",
    "scripts/latex-runtime/native-poppler/Dockerfile.plan-lock-v6.dockerignore",
    "scripts/latex-runtime/native-poppler/apt_transport_poppler.py",
    "scripts/latex-runtime/native-poppler/dependency-plan.lock.json",
    "scripts/latex-runtime/native-poppler/ctest_v5.py",
    "scripts/latex-runtime/native-poppler/ctest_v5_baseline.json",
    "scripts/latex-runtime/verify-native-freetype.py",
    "scripts/latex-runtime/native-freetype/Dockerfile.v4",
    "scripts/latex-runtime/native-freetype/Dockerfile.v4.dockerignore",
    "scripts/latex-runtime/native-freetype/pins-v3.json",
    "scripts/latex-runtime/native-freetype/prepare.py",
    "scripts/latex-runtime/native-freetype/build-v4.py",
    "scripts/latex-runtime/native-freetype/budget_adapter.py",
    "scripts/latex-runtime/native-freetype/abi-fonts.c",
    "scripts/latex-runtime/native-freetype/verify_install.py",
    "scripts/latex-runtime/native-freetype/install-runtime-v3.py",
    "scripts/latex-runtime/native-freetype/patches/CVE-2026-95512.patch",
    "scripts/latex-runtime/native-freetype/provenance/trixie-security.InRelease",
    "scripts/latex-runtime/native-freetype/provenance/budget-adapter-source-binding.json",
  ];
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file,
        createHash("sha256")
          .update(await readFile(file))
          .digest("hex"),
      ]),
    ),
  );
}
