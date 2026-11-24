/** One local-only cancellation proof. Preparation never starts a build. */
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants, closeSync, openSync, writeSync } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  statfs,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertExecutingCheckout,
  buildClientEnvironment,
  createOwnedGroupGuard,
  dockerSocketIdentity,
  observeDocker,
  redactBuildLog,
} from "./build-latex-verified";

export const BASE_MANIFEST =
  "sha256:68fc9a009077c09a5a892030656a23ce2e8a503d1618c38e73511b820f0d6f41";
const LAYOUT_HASH =
  "d367b3bbb11e7485923db3179d318594fda84b4f1d5e579ce667613310f2738d";
export const PROBE_BUDGET = Object.freeze({
  totalMs: 45000,
  readyMs: 20000,
  signalMs: 2000,
  historyMs: 8000,
  observationMs: 1000,
  logBytes: 1048576,
  initialFreeBytes: 12 * 1024 ** 3,
  abortFreeBytes: 8 * 1024 ** 3,
});
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const canonical = (value: unknown): string =>
  value && typeof value === "object" && !Array.isArray(value)
    ? "{" +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => JSON.stringify(key) + ":" + canonical(item))
        .join(",") +
      "}"
    : Array.isArray(value)
      ? "[" + value.map(canonical).join(",") + "]"
      : JSON.stringify(value);
const fail = (code: string): never => {
  throw Error(code);
};
const refPattern = /^default\/default\/[a-z0-9]{16,64}$/;
type Stamp = {
  device: number;
  inode: number;
  size: number;
  mode: number;
  mtime: number;
  ctime: number;
};
function stamp(info: Awaited<ReturnType<typeof lstat>>): Stamp {
  return {
    device: Number(info.dev),
    inode: Number(info.ino),
    size: Number(info.size),
    mode: Number(info.mode),
    mtime: Number(info.mtimeMs),
    ctime: Number(info.ctimeMs),
  };
}
async function metadata(path: string, readonly = false) {
  const info = await lstat(path);
  if (
    info.isSymbolicLink() ||
    (!info.isFile() && !info.isDirectory()) ||
    ![0, process.getuid?.()].includes(Number(info.uid)) ||
    Number(info.mode) & 0o022 ||
    (readonly && Number(info.mode) & 0o222)
  )
    fail("input_unsafe");
  return info;
}
async function bytes(path: string, maximum = 262144, readonly = false) {
  await metadata(path, readonly);
  const fd = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await fd.stat();
    if (
      !info.isFile() ||
      info.size > maximum ||
      ![0, process.getuid?.()].includes(info.uid) ||
      (readonly && info.mode & 0o222)
    )
      fail("input_unsafe");
    return await fd.readFile();
  } finally {
    await fd.close();
  }
}
async function json(path: string, readonly = false) {
  return JSON.parse((await bytes(path, 262144, readonly)).toString());
}
async function bounded<T>(
  operation: () => Promise<T>,
  milliseconds: number = PROBE_BUDGET.observationMs,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(Error("observation_deadline")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export function probeSourcePolicy() {
  return {
    version: 1,
    rules: [
      { action: "DENY", selector: { identifier: "*", match_type: "WILDCARD" } },
      {
        action: "ALLOW",
        selector: { identifier: "local://context", match_type: "EXACT" },
      },
      {
        action: "ALLOW",
        selector: { identifier: "local://dockerfile", match_type: "EXACT" },
      },
      {
        action: "ALLOW",
        selector: {
          identifier:
            "oci-layout://docker.io/library/probe-base@" + BASE_MANIFEST,
          match_type: "EXACT",
        },
      },
    ],
  };
}
export function probeDockerfile(marker: string) {
  if (!/^RESUMIDE_PROBE_[a-f0-9]{16,32}$/.test(marker)) fail("invalid_marker");
  return (
    "FROM probe-base\nRUN --network=none " +
    JSON.stringify([
      "/usr/bin/python3",
      "-I",
      "-B",
      "-c",
      `import time; print('${marker}', flush=True); time.sleep(120)`,
    ]) +
    "\n"
  );
}
export function probeReadyLine(line: string, marker: string) {
  return new RegExp("^#\\d+\\s+\\d+(?:\\.\\d+)?\\s+" + marker + "\\s*$").test(
    line,
  );
}
export function probeBuildArgs(
  output: string,
  endpoint: string,
  layout: string,
) {
  return [
    "--config",
    join(output, "docker-config"),
    "--host",
    endpoint,
    "buildx",
    "build",
    "--builder",
    "default",
    "--platform",
    "linux/arm64",
    "--build-context",
    `probe-base=oci-layout://${layout}@${BASE_MANIFEST}`,
    "--file",
    join(output, "context/Dockerfile"),
    "--network",
    "none",
    "--progress",
    "plain",
    "--output",
    "type=cacheonly",
    "--no-cache",
    join(output, "context"),
  ];
}
export async function readProbeRef(
  output: string,
): Promise<string | undefined> {
  try {
    const directory = join(output, "buildx/refs/default/default");
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    if (names.length === 0) return undefined;
    if (names.length !== 1 || !/^[a-z0-9]{16,64}$/.test(names[0]))
      fail("reference_unbound");
    const value = await json(join(directory, names[0])),
      context = join(output, "context");
    if (
      value.LocalPath !== context ||
      value.DockerfilePath !== join(context, "Dockerfile") ||
      ![undefined, "", "default"].includes(value.Target)
    )
      fail("reference_unbound");
    return `default/default/${names[0]}`;
  } catch {
    return fail("reference_unbound");
  }
}
export function probeHistoryArgs(
  output: string,
  endpoint: string,
  qualifiedRef: string,
) {
  if (!refPattern.test(qualifiedRef)) fail("reference_unbound");
  return [
    "--config",
    join(output, "docker-config"),
    "--host",
    endpoint,
    "buildx",
    "history",
    "inspect",
    "--builder",
    "default",
    "--format",
    "json",
    qualifiedRef.split("/").at(-1)!,
  ];
}
export function probeHistoryStatus(
  record: Record<string, unknown>,
  qualifiedRef: string,
  context: string,
): string | undefined {
  if (
    !refPattern.test(qualifiedRef) ||
    record.Ref !== qualifiedRef.split("/").at(-1) ||
    record.Context !== context ||
    record.Dockerfile !== "Dockerfile"
  )
    fail("reference_unbound");
  if (
    typeof record.CompletedAt !== "string" ||
    !Number.isFinite(Date.parse(record.CompletedAt))
  )
    return undefined;
  return typeof record.Status === "string" ? record.Status : undefined;
}

type Evidence = {
  markerSeen: boolean;
  cancelSignalSent: boolean;
  refBound: boolean;
  groupExited: boolean;
  ownershipUnknown: boolean;
  daemonStatus: string;
  exitCode: number | null;
};
export function classifyCancellation(value: Evidence) {
  if (
    !value.groupExited ||
    value.ownershipUnknown ||
    !value.refBound ||
    !["canceled", "failed", "completed"].includes(value.daemonStatus)
  )
    return "unknown";
  return value.markerSeen &&
    value.cancelSignalSent &&
    value.exitCode !== 0 &&
    ["canceled", "failed"].includes(value.daemonStatus)
    ? "pass"
    : "failed";
}
export type ProbePorts = {
  now(): number;
  wait(ms: number): Promise<unknown>;
  checkInputs(): Promise<void>;
  freeBytes(): Promise<number>;
  ref(): Promise<string | undefined>;
  history(ref: string): Promise<string | undefined>;
  appendLog(text: string): void;
  canceled(): boolean;
  spawn(onData: (value: Buffer) => void): {
    signal(signal: NodeJS.Signals): boolean;
    result():
      | {
          code: number | null;
          groupExited: boolean;
          ownershipUnknown: boolean;
          startIdentity?: string;
        }
      | undefined;
  };
};
export async function runProbeLifecycle(
  marker: string,
  ports: ProbePorts,
  operationStarted?: number,
) {
  const started = operationStarted ?? ports.now();
  let markerSeen = false,
    cancelSignalSent = false,
    ownedRef: string | undefined,
    daemonStatus = "unknown",
    reason = "",
    rawBytes = 0,
    retained = 0,
    pending = "",
    discard = false;
  try {
    await bounded(() => ports.checkInputs());
    if (
      (await bounded(() => ports.freeBytes())) < PROBE_BUDGET.initialFreeBytes
    )
      fail("disk_preflight");
  } catch {
    return {
      status: "not_started",
      reason: "preflight_failed",
      durationMs: ports.now() - started,
    };
  }
  const child = ports.spawn((chunk) => {
    rawBytes += chunk.length;
    if (rawBytes > PROBE_BUDGET.logBytes) {
      reason = "log_cap";
      return;
    }
    let text = chunk.toString();
    if (discard) {
      const at = text.indexOf("\n");
      if (at < 0) return;
      text = text.slice(at + 1);
      discard = false;
    }
    pending += text;
    let at: number;
    while ((at = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, at);
      pending = pending.slice(at + 1);
      if (line.length <= 16384) {
        markerSeen ||= probeReadyLine(line, marker);
        const clean = redactBuildLog(line + "\n"),
          value = Buffer.from(clean).subarray(
            0,
            Math.max(0, PROBE_BUDGET.logBytes - retained),
          );
        const safe = new TextDecoder().decode(value, { stream: true });
        try {
          ports.appendLog(safe);
          retained += Buffer.byteLength(safe);
        } catch {
          reason = "log_write_failed";
        }
      }
    }
    if (pending.length > 16384) {
      pending = "";
      discard = true;
    }
  });
  const stopBeforeReady = () => {
    if (!reason && ports.now() - started >= PROBE_BUDGET.readyMs)
      reason = "ready_deadline";
    if (!reason && ports.canceled()) reason = "operator_canceled";
    return reason !== "";
  };
  while (!child.result() && !reason) {
    await ports.wait(100);
    if (stopBeforeReady()) break;
    try {
      ownedRef ??= await bounded(() => ports.ref());
      await bounded(() => ports.checkInputs());
      if (
        (await bounded(() => ports.freeBytes())) < PROBE_BUDGET.abortFreeBytes
      )
        fail("disk_floor");
    } catch {
      reason ||= "observation_failed";
      break;
    }
    if (stopBeforeReady()) break;
    if (markerSeen && ownedRef) {
      reason = "ready_cancel";
      break;
    }
  }
  if (child.result()?.ownershipUnknown) reason = "ownership_unknown";
  if (!child.result()?.groupExited) {
    for (const signal of ["SIGINT", "SIGTERM", "SIGKILL"] as const) {
      if (child.result()?.groupExited) break;
      const sent = child.signal(signal);
      if (signal === "SIGINT") cancelSignalSent = sent;
      const until = Math.min(
        started + PROBE_BUDGET.totalMs - 12000,
        ports.now() + PROBE_BUDGET.signalMs,
      );
      while (!child.result()?.groupExited && ports.now() < until)
        await ports.wait(50);
    }
  }
  try {
    ownedRef ??= await bounded(() => ports.ref());
  } catch {
    reason ||= "reference_unbound";
  }
  const historyUntil = Math.min(
    started + PROBE_BUDGET.totalMs - 2000,
    ports.now() + PROBE_BUDGET.historyMs,
  );
  while (ownedRef && refPattern.test(ownedRef) && ports.now() < historyUntil) {
    try {
      daemonStatus =
        (await bounded(() => ports.history(ownedRef!))) ?? "unknown";
    } catch {
      daemonStatus = "unknown";
    }
    if (["canceled", "failed", "completed"].includes(daemonStatus)) break;
    await ports.wait(100);
  }
  const result = child.result(),
    evidence = {
      markerSeen,
      cancelSignalSent,
      refBound: !!ownedRef && refPattern.test(ownedRef),
      groupExited: result?.groupExited ?? false,
      ownershipUnknown: result?.ownershipUnknown ?? true,
      daemonStatus,
      exitCode: result?.code ?? null,
    };
  return {
    ...evidence,
    status:
      reason === "ready_cancel"
        ? classifyCancellation(evidence)
        : classifyCancellation(evidence) === "unknown"
          ? "unknown"
          : "failed",
    ownedRef: ownedRef ?? null,
    reason,
    rawBytes,
    retainedBytes: retained,
    durationMs: ports.now() - started,
    clientStartIdentity: result?.startIdentity ?? null,
  };
}

const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
type Binding = {
  sourceRoot: string;
  output: string;
  marker: string;
  docker: Awaited<ReturnType<typeof observeDocker>>["docker"];
  pluginDirectory: string;
  stamps: Record<string, Stamp>;
  hashes: Record<string, string>;
  contextHashes: Record<string, string>;
  policy: ReturnType<typeof probeSourcePolicy>;
  layout: string;
  layoutHash: string;
};
async function freeBytes(path: string) {
  const value = await statfs(path, { bigint: true });
  return Number(value.bavail * value.bsize);
}
async function checkStamps(binding: Binding) {
  for (const [path, value] of Object.entries(binding.stamps)) {
    const info = await metadata(
      path,
      path.startsWith(binding.layout) ||
        path.startsWith(join(binding.output, "context")) ||
        path === join(binding.output, "source-policy.json"),
    );
    if (canonical(stamp(info)) !== canonical(value)) fail("input_changed");
  }
}
async function writeJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
    mode: 0o444,
  });
}
async function fileHash(path: string, maximum = 64 * 1024 ** 2) {
  const fd = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await fd.stat();
    if (!info.isFile() || info.size > maximum || info.mode & 0o022)
      fail("input_unsafe");
    let count = 0;
    const digest = createHash("sha256"),
      buffer = Buffer.alloc(65536);
    while (true) {
      const { bytesRead } = await fd.read(
        buffer,
        0,
        Math.min(buffer.length, maximum - count + 1),
        null,
      );
      if (!bytesRead) break;
      count += bytesRead;
      if (count > maximum) fail("input_unsafe");
      digest.update(buffer.subarray(0, bytesRead));
    }
    return digest.digest("hex");
  } finally {
    await fd.close();
  }
}
async function inspectLayout(layout: string) {
  if ((await realpath(layout)) !== layout) fail("layout_mismatch");
  const files: Record<string, string> = {};
  const stamps: Record<string, Stamp> = {};
  let size = 0;
  let directories = 0;
  async function visit(directory: string) {
    const directoryInfo = await metadata(directory, true);
    if (!directoryInfo.isDirectory()) fail("layout_mismatch");
    stamps[directory] = stamp(directoryInfo);
    directories += 1;
    for (const name of await readdir(directory)) {
      const path = join(directory, name);
      const info = await metadata(path, true);
      const key = relative(layout, path).split("\\").join("/");
      if (info.isDirectory()) {
        if (!["blobs", "blobs/sha256"].includes(key)) fail("layout_mismatch");
        await visit(path);
      } else {
        size += info.size;
        if (
          Object.keys(files).length >= 11 ||
          size > 128 * 1024 ** 2 ||
          !/^(?:oci-layout|index\.json|blobs\/sha256\/[a-f0-9]{64})$/.test(key)
        )
          fail("layout_mismatch");
        const digest = await fileHash(path);
        if (key.startsWith("blobs/") && !key.endsWith(digest))
          fail("layout_mismatch");
        files[key] = digest;
        stamps[path] = stamp(info);
      }
    }
  }
  await visit(layout);
  if (
    directories !== 3 ||
    Object.keys(files).length !== 11 ||
    hash(canonical(files)) !== LAYOUT_HASH
  )
    fail("layout_mismatch");
  return stamps;
}
async function prepare(output: string, layout: string) {
  await assertExecutingCheckout(sourceRoot);
  output = await realpath(output);
  const info = await metadata(output);
  if (
    Number(info.mode) & 0o077 ||
    !info.isDirectory() ||
    (await readdir(output)).length ||
    !relative(sourceRoot, output).startsWith("..")
  )
    fail("output_unsafe");
  const stamps = await inspectLayout(layout);
  const { docker, pluginPath } = await observeDocker();
  const pluginDirectory = dirname(pluginPath);
  const plugin = join(pluginDirectory, "docker-buildx");
  if ((await fileHash(plugin)) !== docker.buildxBinarySha256)
    fail("toolchain_mismatch");
  if ((await freeBytes(output)) < PROBE_BUDGET.initialFreeBytes)
    fail("disk_preflight");
  const hashes: Record<string, string> = {};
  const paths = [
    fileURLToPath(import.meta.url),
    join(sourceRoot, "scripts/build-latex-verified.ts"),
    plugin,
  ];
  for (const path of paths) {
    hashes[path] = await fileHash(path);
    stamps[path] = stamp(await metadata(path));
  }
  const marker =
      "RESUMIDE_PROBE_" + randomUUID().replaceAll("-", "").slice(0, 24),
    context = join(output, "context");
  await mkdir(context, { mode: 0o700 });
  await mkdir(join(output, "docker-config"), { mode: 0o700 });
  const contents = {
    Dockerfile: probeDockerfile(marker),
    ".dockerignore": "*\n!Dockerfile\n!.dockerignore\n",
  };
  for (const [name, content] of Object.entries(contents))
    await writeFile(join(context, name), content, { flag: "wx", mode: 0o444 });
  await chmod(context, 0o555);
  await writeJson(join(output, "source-policy.json"), probeSourcePolicy());
  await writeJson(join(output, "docker-config/config.json"), {
    cliPluginsExtraDirs: [pluginDirectory],
  });
  for (const path of [
    context,
    ...Object.keys(contents).map((name) => join(context, name)),
    join(output, "source-policy.json"),
    join(output, "docker-config/config.json"),
  ])
    stamps[path] = stamp(
      await metadata(path, path !== join(output, "docker-config")),
    );
  const binding: Binding = {
    sourceRoot: await realpath(sourceRoot),
    output,
    marker,
    docker,
    pluginDirectory,
    stamps,
    hashes,
    contextHashes: Object.fromEntries(
      Object.entries(contents).map(([key, value]) => [key, hash(value)]),
    ),
    policy: probeSourcePolicy(),
    layout,
    layoutHash: LAYOUT_HASH,
  };
  const fingerprint = hash(canonical(binding));
  await writeJson(join(output, "probe-packet.json"), {
    schemaVersion: "latex-cancellation-review/v1",
    fingerprint,
    binding,
  });
  return {
    status: "review_required",
    fingerprint,
    marker,
    contextHashes: binding.contextHashes,
    policySha256: hash(JSON.stringify(probeSourcePolicy(), null, 2) + "\n"),
    layout,
    layoutHash: LAYOUT_HASH,
    budget: PROBE_BUDGET,
    docker,
    probeStarted: false,
  };
}
function readDocker(args: string[], env: NodeJS.ProcessEnv) {
  const value = spawnSync("docker", args, {
    env,
    encoding: "utf8",
    timeout: 1000,
    maxBuffer: 262144,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (value.error || value.status !== 0) fail("docker_observation_failed");
  return value.stdout;
}
async function verifyToolchain(binding: Binding, env: NodeJS.ProcessEnv) {
  if (
    (await dockerSocketIdentity(binding.docker.endpoint)) !==
    binding.docker.socketIdentity
  )
    fail("toolchain_mismatch");
  const prefix = [
      "--config",
      join(binding.output, "docker-config"),
      "--host",
      binding.docker.endpoint,
    ],
    version = JSON.parse(
      readDocker([...prefix, "version", "--format", "{{json .}}"], env),
    ),
    info = JSON.parse(
      readDocker(
        [
          ...prefix,
          "info",
          "--format",
          "[{{json .NCPU}},{{json .MemTotal}},{{json .OSType}},{{json .Architecture}},{{json .ID}}]",
        ],
        env,
      ),
    ),
    inspection = readDocker(
      [...prefix, "buildx", "inspect", "default", "--timeout", "1s"],
      env,
    );
  if (
    version.Client.Version !== binding.docker.clientVersion ||
    version.Server.Version !== binding.docker.serverVersion ||
    canonical(info) !==
      canonical([
        binding.docker.cpus,
        binding.docker.memoryBytes,
        binding.docker.osType,
        binding.docker.architecture,
        binding.docker.daemonId,
      ]) ||
    !/^Driver:\s+docker\s*$/m.test(inspection) ||
    !/^Status:\s+running\s*$/m.test(inspection) ||
    /^BuildKit version:\s+(\S+)/m.exec(inspection)?.[1] !==
      binding.docker.buildkitVersion ||
    (await dockerSocketIdentity(binding.docker.endpoint)) !==
      binding.docker.socketIdentity
  )
    fail("toolchain_mismatch");
  return prefix;
}
async function execute(packetPath: string, approved: string) {
  const operationStarted = performance.now();
  const packet = await bounded(() => json(packetPath, true)),
    binding = packet.binding as Binding;
  if (
    packet.schemaVersion !== "latex-cancellation-review/v1" ||
    packet.fingerprint !== approved ||
    hash(canonical(binding)) !== approved ||
    binding.sourceRoot !== (await realpath(sourceRoot)) ||
    packetPath !== join(binding.output, "probe-packet.json") ||
    binding.layoutHash !== LAYOUT_HASH ||
    canonical(binding.policy) !== canonical(probeSourcePolicy())
  )
    fail("admission_mismatch");
  await assertExecutingCheckout(sourceRoot);
  const layoutStamps = await bounded(() => inspectLayout(binding.layout), 5000);
  for (const [path, value] of Object.entries(layoutStamps))
    if (canonical(binding.stamps[path]) !== canonical(value))
      fail("input_changed");
  await bounded(() => checkStamps(binding));
  for (const [path, value] of Object.entries(binding.hashes))
    if ((await bounded(() => fileHash(path))) !== value) fail("input_changed");
  const env = {
    ...buildClientEnvironment(binding.output),
    EXPERIMENTAL_BUILDKIT_SOURCE_POLICY: join(
      binding.output,
      "source-policy.json",
    ),
  };
  if ((await readdir(binding.output)).includes("buildx"))
    fail("admission_mismatch");
  await verifyToolchain(binding, env);
  if (await readProbeRef(binding.output)) fail("admission_mismatch");
  const attempt = openSync(join(binding.output, "attempt.json"), "wx", 0o444);
  writeSync(
    attempt,
    JSON.stringify({ fingerprint: approved, maximumAttempts: 1 }) + "\n",
  );
  closeSync(attempt);
  const log = openSync(join(binding.output, "probe.log"), "wx", 0o400);
  let canceled = false,
    clearWatchdog = () => undefined as void;
  const cancel = () => {
    canceled = true;
  };
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    const result = await runProbeLifecycle(
      binding.marker,
      {
        now: () => performance.now(),
        wait,
        checkInputs: () => checkStamps(binding),
        freeBytes: () => freeBytes(binding.output),
        ref: () => readProbeRef(binding.output),
        canceled: () => canceled,
        appendLog: (text) => {
          writeSync(log, text);
        },
        history: async (ref) =>
          probeHistoryStatus(
            JSON.parse(
              readDocker(
                probeHistoryArgs(binding.output, binding.docker.endpoint, ref),
                env,
              ),
            ),
            ref,
            join(binding.output, "context"),
          ),
        spawn: (onData) => {
          const child = spawn(
            "docker",
            probeBuildArgs(
              binding.output,
              binding.docker.endpoint,
              binding.layout,
            ),
            {
              cwd: binding.output,
              env,
              detached: true,
              stdio: ["ignore", "pipe", "pipe"],
            },
          );
          let done = false,
            code: number | null = null,
            delivered = 0;
          child.stdout.on("data", onData);
          child.stderr.on("data", onData);
          child.on("error", () => {
            done = true;
          });
          child.on("close", (value) => {
            done = true;
            code = value;
          });
          const guard = createOwnedGroupGuard(child.pid ?? 0, {
            identity: (pid) => {
              const value = spawnSync(
                "ps",
                ["-o", "pid=,pgid=,lstart=", "-p", String(pid)],
                {
                  env,
                  encoding: "utf8",
                  timeout: 1000,
                  maxBuffer: 4096,
                  stdio: ["ignore", "pipe", "pipe"],
                },
              );
              return value.status === 0
                ? value.stdout.trim().replace(/\s+/g, " ")
                : "";
            },
            groupAlive: (pid) => {
              try {
                process.kill(-pid, 0);
                return true;
              } catch (error) {
                return (error as NodeJS.ErrnoException).code !== "ESRCH";
              }
            },
            signalGroup: (pid, signal) => {
              process.kill(-pid, signal);
              delivered++;
            },
          });
          const signal = (value: NodeJS.Signals) => {
            const before = delivered;
            guard.signal(value);
            return delivered > before;
          };
          const timers = (["SIGINT", "SIGTERM", "SIGKILL"] as const).map(
            (value, index) => {
              const timer = setTimeout(
                () => {
                  if (!guard.exited()) {
                    canceled = true;
                    signal(value);
                  }
                },
                Math.max(
                  0,
                  operationStarted +
                    PROBE_BUDGET.readyMs +
                    index * 3000 -
                    performance.now(),
                ),
              );
              timer.unref();
              return timer;
            },
          );
          clearWatchdog = () => {
            for (const timer of timers) clearTimeout(timer);
          };
          return {
            signal,
            result: () =>
              done || guard.ownershipUnknown()
                ? {
                    code,
                    groupExited: guard.exited(),
                    ownershipUnknown: guard.ownershipUnknown(),
                    startIdentity: guard.startIdentity(),
                  }
                : undefined,
          };
        },
      },
      operationStarted,
    );
    await writeJson(join(binding.output, "probe-result.json"), {
      schemaVersion: "latex-cancellation-result/v1",
      fingerprint: approved,
      ...result,
      runtimeAccepted: false,
    });
    if (result.status === "pass" && "ownedRef" in result) {
      await verifyToolchain(binding, env);
      await writeJson(join(binding.output, "cancellation-proof.json"), {
        schemaVersion: "latex-build-cancellation/v1",
        docker: binding.docker,
        ref: result.ownedRef,
        status: result.daemonStatus,
        completedAt: new Date().toISOString(),
        clientGroupExited: true,
        ownedRefBound: true,
        sourceFingerprint: approved,
        markerSeen: result.markerSeen,
        cancelSignalSent: result.cancelSignalSent,
        clientStartIdentity: result.clientStartIdentity,
        runtimeAccepted: false,
      });
    }
    return { ...result, fingerprint: approved, runtimeAccepted: false };
  } finally {
    clearWatchdog();
    closeSync(log);
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}
export async function runCancellationCli(argv: readonly string[]) {
  if (process.versions.node.split(".")[0] !== "22") fail("unsupported_runtime");
  if (argv.length === 4 && argv[0] === "--output-dir" && argv[2] === "--layout")
    return prepare(resolve(argv[1]), resolve(argv[3]));
  if (
    argv.length === 5 &&
    argv[0] === "--execute" &&
    argv[1] === "--packet" &&
    argv[3] === "--approved" &&
    /^[a-f0-9]{64}$/.test(argv[4])
  )
    return execute(resolve(argv[2]), argv[4]);
  return fail("invalid_arguments");
}
const viteEntry =
  /\/vite-node(?:\.mjs)?$/.test(process.argv[1] ?? "") &&
  process.argv[2] === "--probe-cli";
if (
  (process.argv[1] &&
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url) ||
  viteEntry
) {
  try {
    const value = await runCancellationCli(
      process.argv.slice(viteEntry ? 3 : 2),
    );
    process.stdout.write(JSON.stringify(value, null, 2) + "\n");
    process.exitCode = ["review_required", "pass"].includes(value.status)
      ? 0
      : 1;
  } catch (error) {
    const codes = [
        "invalid_arguments",
        "unsupported_runtime",
        "input_unsafe",
        "output_unsafe",
        "input_changed",
        "evidence_mismatch",
        "toolchain_mismatch",
        "admission_mismatch",
        "disk_preflight",
        "docker_observation_failed",
      ],
      message = error instanceof Error ? error.message : "";
    process.stdout.write(
      JSON.stringify({
        status: "failed",
        code: codes.includes(message) ? message : "probe_unavailable",
        probeAccepted: false,
        runtimeAccepted: false,
      }) + "\n",
    );
    process.exitCode = 1;
  }
}
