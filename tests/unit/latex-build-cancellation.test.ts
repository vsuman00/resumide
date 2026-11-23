import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  PROBE_BUDGET,
  BASE_MANIFEST,
  probeSourcePolicy,
  probeDockerfile,
  probeBuildArgs,
  probeReadyLine,
  readProbeRef,
  classifyCancellation,
  runProbeLifecycle,
  probeHistoryArgs,
  probeHistoryStatus,
  runCancellationCli,
} from "../../scripts/probe-latex-build-cancellation";
import type { ProbePorts } from "../../scripts/probe-latex-build-cancellation";

const marker = "RESUMIDE_PROBE_0123456789abcdef";
const ref = "default/default/abcdefghijklmnopqrstuvwxyz";
function allowed(identifier: string) {
  let permit = true;
  for (const rule of probeSourcePolicy().rules) {
    const selector = rule.selector;
    const match =
      selector.match_type === "REGEX"
        ? new RegExp(selector.identifier).test(identifier)
        : selector.identifier === "*" || selector.identifier === identifier;
    if (match) permit = rule.action === "ALLOW";
  }
  return permit;
}

describe("closed cancellation probe source/argument contracts", () => {
  it("admits an explicit layout path only after verifying the pinned file map", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "probe-layout-")));
    try {
      const output = join(root, "output");
      const layout = join(root, "layout");
      await mkdir(output, { mode: 0o700 });
      await mkdir(layout, { mode: 0o555 });
      await expect(
        runCancellationCli(["--output-dir", output, "--layout", layout]),
      ).rejects.toThrow("layout_mismatch");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("defaults every source to denied and permits only owned local aliases and the exact local OCI digest", () => {
    expect(probeSourcePolicy().rules[0]).toMatchObject({
      action: "DENY",
      selector: { identifier: "*" },
    });
    expect(allowed("local://context")).toBe(true);
    expect(allowed("local://dockerfile")).toBe(true);
    expect(
      allowed("oci-layout://docker.io/library/probe-base@" + BASE_MANIFEST),
    ).toBe(true);
    for (const identifier of [
      "docker-image://docker.io/library/probe-base:latest",
      "https://unit.test/blob",
      "http://unit.test/blob",
      "git://unit.test/repo",
      "ssh://unit.test/repo",
      "local://unowned",
      "oci-layout://abcdefghijklmnopqrstuvwxyz@sha256:" + "0".repeat(64),
      "oci-layout://abcdefghijklmnopqrstuvwxyz@" + BASE_MANIFEST + "?remote=1",
    ])
      expect(allowed(identifier), identifier).toBe(false);
  });
  it("generates only the local base and a non-root inherited, no-network Python sleep; no external frontend", () => {
    const text = probeDockerfile(marker);
    expect(text).toMatch(/^FROM probe-base\nRUN --network=none /);
    expect(text).toContain('"/usr/bin/python3","-I","-B"');
    expect(text).toContain("time.sleep(120)");
    expect(text).not.toMatch(/#\s*syntax|ADD |COPY |--mount|USER root|https?:/);
    expect(() => probeDockerfile("PRIVATE_UNIT_CANARY\nFROM other")).toThrow(
      "invalid_marker",
    );
  });
  it("recognizes actual timed RUN output rather than the Dockerfile command text", () => {
    expect(probeReadyLine("#5 0.102 " + marker, marker)).toBe(true);
    expect(probeReadyLine('#5 [2/2] RUN print("' + marker + '")', marker)).toBe(
      false,
    );
    expect(probeReadyLine("warning: " + marker, marker)).toBe(false);
  });
  it("fixes a cache-only build without tags, image export, arbitrary remote contexts or privileges", () => {
    const args = probeBuildArgs(
      "/owned/probe",
      "unix:///owned/docker.sock",
      "/owned/layout",
    );
    expect(args).toContain(
      "probe-base=oci-layout:///owned/layout@" + BASE_MANIFEST,
    );
    expect(args).toContain("type=cacheonly");
    expect(args).toContain("none");
    expect(args).toContain("linux/arm64");
    expect(args.at(-1)).toBe("/owned/probe/context");
    for (const bad of [
      "--tag",
      "--load",
      "--push",
      "--pull",
      "--allow",
      "--secret",
      "--ssh",
      "--cache-to",
      "--cache-from",
    ])
      expect(args).not.toContain(bad);
  });
  it("binds a total45-second and1MiB boundary", () => {
    expect(PROBE_BUDGET).toMatchObject({
      totalMs: 45000,
      readyMs: 20000,
      logBytes: 1048576,
    });
  });
});

async function temporary(body: (root: string) => Promise<void>) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "resumide-probe-ref-")),
  );
  try {
    await body(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
describe("exact private probe reference admission", () => {
  it.each(["", "default"])(
    "admits only one exact owned ref with observed target %s",
    async (target) => {
      await temporary(async (root) => {
        const dir = join(root, "buildx/refs/default/default"),
          context = join(root, "context");
        await mkdir(dir, { recursive: true });
        expect(await readProbeRef(root)).toBeUndefined();
        await writeFile(
          join(dir, ref.split("/").at(-1)!),
          JSON.stringify({
            LocalPath: context,
            DockerfilePath: join(context, "Dockerfile"),
            Target: target,
          }),
        );
        expect(await readProbeRef(root)).toBe(ref);
        await writeFile(join(dir, "anotherabcdefghijklmnopq"), "{}");
        await expect(readProbeRef(root)).rejects.toThrow("reference_unbound");
      });
    },
  );
  it.each(["context", "symlink", "target"])(
    "rejects a mismatched %s ref before inspecting any daemon history",
    async (kind) => {
      await temporary(async (root) => {
        const dir = join(root, "buildx/refs/default/default");
        await mkdir(dir, { recursive: true });
        const path = join(dir, ref.split("/").at(-1)!);
        if (kind === "context")
          await writeFile(
            path,
            JSON.stringify({
              LocalPath: "/unowned",
              DockerfilePath: "/unowned/Dockerfile",
            }),
          );
        else if (kind === "target")
          await writeFile(
            path,
            JSON.stringify({
              LocalPath: join(root, "context"),
              DockerfilePath: join(root, "context/Dockerfile"),
              Target: "unowned-target",
            }),
          );
        else {
          await writeFile(join(root, "unowned"), "{}");
          await symlink(join(root, "unowned"), path);
        }
        await expect(readProbeRef(root)).rejects.toThrow("reference_unbound");
      });
    },
  );
});

const accepted = {
  markerSeen: true,
  cancelSignalSent: true,
  refBound: true,
  groupExited: true,
  ownershipUnknown: false,
  daemonStatus: "canceled",
  exitCode: 1,
};
describe("actual cancellation acceptance cannot be inferred from client exit", () => {
  it("requires a canceled or failed terminal daemon record after the timed RUN marker and delivered signal", () => {
    expect(classifyCancellation(accepted)).toBe("pass");
    expect(classifyCancellation({ ...accepted, daemonStatus: "failed" })).toBe(
      "pass",
    );
    for (const bad of [
      { markerSeen: false },
      { cancelSignalSent: false },
      { refBound: false },
      { groupExited: false },
      { ownershipUnknown: true },
      { daemonStatus: "running" },
      { daemonStatus: "completed" },
      { exitCode: 0 },
    ])
      expect(classifyCancellation({ ...accepted, ...bad })).not.toBe("pass");
  });
});
function simulated(
  options: {
    commandOnly?: boolean;
    status?: string;
    ownershipUnknown?: boolean;
    delivered?: boolean;
    logCap?: boolean;
    noRef?: boolean;
  } = {},
) {
  let clock = 0,
    done = false;
  const signals: string[] = [],
    logs: string[] = [];
  const ports: ProbePorts = {
    now: () => clock,
    wait: async (ms) => {
      clock += ms;
    },
    checkInputs: async () => undefined,
    freeBytes: async () => 20 * 1024 ** 3,
    ref: async () => (options.noRef ? undefined : ref),
    history: async () => options.status ?? "canceled",
    appendLog: (text) => logs.push(text),
    spawn: (onData) => {
      onData(
        Buffer.from(
          options.logCap
            ? "x".repeat(PROBE_BUDGET.logBytes + 1)
            : options.commandOnly
              ? '#4 [2/2] RUN print("' + marker + '")\n'
              : "#4 0.123 " + marker + "\n",
        ),
      );
      return {
        signal: (signal) => {
          signals.push(signal);
          if (!options.ownershipUnknown) done = true;
          return options.delivered !== false && !options.ownershipUnknown;
        },
        result: () =>
          done || options.ownershipUnknown
            ? {
                code: 1,
                groupExited: done,
                ownershipUnknown: !!options.ownershipUnknown,
              }
            : undefined,
      };
    },
    canceled: () => false,
  };
  return { ports, signals, logs };
}
describe("bounded single-probe lifecycle with injected process/history", () => {
  it("cancels its own ready build, then proves group absence and exact daemon cancellation", async () => {
    const test = simulated();
    const result = await runProbeLifecycle(marker, test.ports);
    expect(result).toMatchObject({
      status: "pass",
      markerSeen: true,
      cancelSignalSent: true,
      groupExited: true,
      ownedRef: ref,
      daemonStatus: "canceled",
    });
    expect(test.signals).toEqual(["SIGINT"]);
  });
  it("preserves the log budget failure that arrives during a readiness observation", async () => {
    const test = simulated();
    const spawn = test.ports.spawn;
    let emit!: Parameters<typeof spawn>[0];
    test.ports.spawn = (onData) => {
      emit = onData;
      return spawn(onData);
    };
    test.ports.ref = async () => {
      emit(Buffer.alloc(PROBE_BUDGET.logBytes, 65));
      return ref;
    };
    const result = await runProbeLifecycle(marker, test.ports);
    expect(result).toMatchObject({ status: "failed", reason: "log_cap" });
    expect(Buffer.byteLength(test.logs.join(""))).toBeLessThanOrEqual(
      PROBE_BUDGET.logBytes,
    );
  });
  it.each([
    { commandOnly: true },
    { status: "completed" },
    { status: "running" },
    { ownershipUnknown: true },
    { delivered: false },
    { logCap: true },
    { noRef: true },
  ])("cannot accept incomplete proof: %j", async (options) => {
    const test = simulated(options);
    const result = await runProbeLifecycle(marker, test.ports);
    expect(result.status).not.toBe("pass");
    expect(result.durationMs).toBeLessThanOrEqual(PROBE_BUDGET.totalMs);
    expect(Buffer.byteLength(test.logs.join(""))).toBeLessThanOrEqual(
      PROBE_BUDGET.logBytes,
    );
  });
  it("returns conservatively when an input observation never settles", async () => {
    vi.useFakeTimers();
    try {
      const test = simulated();
      test.ports.now = () => Date.now();
      test.ports.wait = (ms) =>
        new Promise((resolve) => setTimeout(resolve, ms));
      let reads = 0;
      test.ports.checkInputs = async () => {
        if (++reads > 1) await new Promise<void>(() => undefined);
      };
      let result: Awaited<ReturnType<typeof runProbeLifecycle>> | undefined;
      void runProbeLifecycle(marker, test.ports).then((value) => {
        result = value;
      });
      await vi.advanceTimersByTimeAsync(PROBE_BUDGET.totalMs);
      expect(result).toBeDefined();
      expect(result?.status).not.toBe("pass");
    } finally {
      vi.useRealTimers();
    }
  });
});

it("uses its own CLI marker without activating the imported compiler wrapper", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const result = spawnSync(
    process.execPath,
    [
      join(root, "node_modules/.bin/vite-node"),
      "--config",
      join(root, "vitest.config.ts"),
      join(root, "scripts/probe-latex-build-cancellation.ts"),
      "--probe-cli",
      "--PRIVATE_UNIT_CANARY",
    ],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 5000,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        RESUMIDE_PRIVATE_VERIFY: "aa7-owned-synthetic",
        OPENAI_API_KEY: "PRIVATE_UNIT_CANARY",
      },
    },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toBe("");
  expect(result.stdout).not.toContain("PRIVATE_UNIT_CANARY");
  expect(JSON.parse(result.stdout)).toMatchObject({
    status: "failed",
    code: "invalid_arguments",
    probeAccepted: false,
    runtimeAccepted: false,
  });
});

describe("observed Buildx0.38.1 exact history contract", () => {
  const observedRef = "default/default/qx42uyaghp7g0tkt8dqqm0drp";
  const record = {
    Ref: "qx42uyaghp7g0tkt8dqqm0drp",
    Context: "/owned/probe/context",
    Dockerfile: "Dockerfile",
    Status: "failed",
    CompletedAt: "2026-11-09T17:08:45.567909177+05:30",
  };
  it("uses the exact CLI ID with explicit builder while retaining the qualified private binding", () => {
    const args = probeHistoryArgs(
      "/owned/probe",
      "unix:///owned/docker.sock",
      observedRef,
    );
    expect(args.slice(-3)).toEqual([
      "--format",
      "json",
      "qx42uyaghp7g0tkt8dqqm0drp",
    ]);
    expect(args).toContain("--builder");
    expect(args).not.toContain(observedRef);
    expect(
      probeHistoryStatus(record, observedRef, "/owned/probe/context"),
    ).toBe("failed");
    for (const other of [
      { ...record, Ref: "other" },
      { ...record, Ref: observedRef },
      { ...record, Context: "/unowned" },
      { ...record, Dockerfile: "other.tex" },
    ])
      expect(() =>
        probeHistoryStatus(other, observedRef, "/owned/probe/context"),
      ).toThrow("reference_unbound");
    expect(
      classifyCancellation({
        ...accepted,
        markerSeen: false,
        cancelSignalSent: false,
        daemonStatus: "failed",
      }),
    ).toBe("failed");
  });
  it("allows only the exact observed OCI alias and digest, retaining remote/default deny", () => {
    expect(
      allowed("oci-layout://docker.io/library/probe-base@" + BASE_MANIFEST),
    ).toBe(true);
    for (const identifier of [
      "oci-layout://abcdefghijklmnopqrstuvwxyz@" + BASE_MANIFEST,
      "oci-layout://docker.io/library/other@" + BASE_MANIFEST,
      "docker-image://docker.io/library/probe-base@" + BASE_MANIFEST,
    ])
      expect(allowed(identifier)).toBe(false);
  });
});
