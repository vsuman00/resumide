/** Public-source compiler build orchestration. No database or app environment loading. */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, constants, openSync, writeSync } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  statfs,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { latexSourceHashes } from "./latex-test-fixtures";

export const PINNED_EXPAT = Object.freeze({
  name: "expat-2.10.0.tar.xz",
  size: 543404,
  sha256: "c624ba2998fc65df1163a49641ff3f9ab73138b11641d92c86bee0fb01b1bc7f",
});
export const BUILD_BUDGET = Object.freeze({
  wallMs: 2_400_000,
  cleanupReserveMs: 60_000,
  logBytes: 32 * 1024 ** 2,
  initialFreeBytes: 12 * 1024 ** 3,
  abortFreeBytes: 8 * 1024 ** 3,
  monitorMs: 1000,
  observationMs: 2000,
  signalGraceMs: 5000,
  historyGraceMs: 15000,
});
type Asset = Readonly<{ name: string; size: number; sha256: string }>;
type Hashes = Record<string, string>;
type DockerObservation = {
  endpoint: string;
  daemonId: string;
  socketIdentity: string;
  clientVersion: string;
  serverVersion: string;
  buildxVersion: string;
  buildxBinarySha256: string;
  buildkitVersion: string;
  architecture: string;
  osType: string;
  cpus: number;
  memoryBytes: number;
  builder: string;
  node: string;
};
type PreparedArguments = {
  mode: "prepare";
  workspace: string;
  assetDirectory: string;
  outputDirectory: string;
};
type ExecuteArguments = {
  mode: "execute";
  packet: string;
  approved: string;
  cancellationReceipt: string;
};
type Frozen = {
  contextDirectory: string;
  assetDirectory: string;
  contextHashes: Hashes;
};
type Binding = {
  workspace: string;
  outputDirectory: string;
  sourceHashes: Hashes;
  contextHashes: Hashes;
  asset: Asset;
  docker: DockerObservation;
  imageTag: string;
  budget: typeof BUILD_BUDGET;
};
type Packet = {
  schemaVersion: "latex-build-review/v1";
  fingerprint: string;
  binding: Binding;
  hostFreeBytes: number;
};
const fail = (code: string): never => {
  throw Error(code);
};
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const canonical = (value: unknown): string => {
  if (value && typeof value === "object" && !Array.isArray(value))
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ":" + canonical(item))
        .join(",") +
      "}"
    );
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return JSON.stringify(value);
};
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const isHash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const refPattern = /^default\/default\/[a-z0-9]{16,64}$/;

export function parseBuildArguments(
  argv: readonly string[],
): PreparedArguments | ExecuteArguments {
  const flags = new Map<string, string>();
  let execute = false;
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === "--execute" && !execute) {
      execute = true;
      continue;
    }
    if (
      ![
        "--workspace",
        "--asset-dir",
        "--output-dir",
        "--packet",
        "--approved",
        "--cancellation-receipt",
      ].includes(flag) ||
      flags.has(flag) ||
      !argv[index + 1] ||
      argv[index + 1].startsWith("--")
    )
      fail("invalid_arguments");
    flags.set(flag, argv[++index]);
  }
  const expected = execute
    ? ["--packet", "--approved", "--cancellation-receipt"]
    : ["--workspace", "--asset-dir", "--output-dir"];
  if (
    flags.size !== expected.length ||
    !expected.every((flag) => flags.has(flag))
  )
    fail("invalid_arguments");
  if (execute) {
    if (!isHash(flags.get("--approved"))) fail("invalid_arguments");
    return {
      mode: "execute",
      packet: resolve(flags.get("--packet")!),
      approved: flags.get("--approved")!,
      cancellationReceipt: resolve(flags.get("--cancellation-receipt")!),
    };
  }
  return {
    mode: "prepare",
    workspace: resolve(flags.get("--workspace")!),
    assetDirectory: resolve(flags.get("--asset-dir")!),
    outputDirectory: resolve(flags.get("--output-dir")!),
  };
}

export async function assertExecutingCheckout(workspace: string) {
  const executingRoot = await realpath(
    fileURLToPath(new URL("../", import.meta.url)),
  );
  if ((await realpath(workspace)) !== executingRoot)
    fail("wrong_execution_checkout");
}

async function safePath(
  path: string,
  kind: "file" | "directory",
  readonly = false,
) {
  const absolute = resolve(path);
  if ((await realpath(absolute)) !== absolute) fail("path_unsafe");
  const info = await lstat(absolute);
  if (
    (kind === "file" ? !info.isFile() : !info.isDirectory()) ||
    info.isSymbolicLink() ||
    info.uid !== process.getuid?.() ||
    info.mode & 0o022 ||
    (readonly && info.mode & 0o222)
  )
    fail("path_unsafe");
  return info;
}
export async function verifyExpatContext(
  directory: string,
  asset: Asset = PINNED_EXPAT,
): Promise<Asset> {
  try {
    await safePath(directory, "directory");
    if (!same(await readdir(directory), [asset.name]))
      fail("asset_context_unsafe");
    const path = join(directory, asset.name);
    await safePath(path, "file", true);
    const handle = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const info = await handle.stat();
      if (
        !info.isFile() ||
        info.uid !== process.getuid?.() ||
        info.mode & 0o222 ||
        info.size !== asset.size ||
        sha256(await handle.readFile()) !== asset.sha256
      )
        fail("asset_context_unsafe");
    } finally {
      await handle.close();
    }
    return asset;
  } catch {
    return fail("asset_context_unsafe");
  }
}

export async function freezeBuildInputs(
  input: {
    workspace: string;
    outputDirectory: string;
    assetDirectory: string;
    sourceHashes: Hashes;
  },
  asset: Asset = PINNED_EXPAT,
): Promise<Frozen> {
  const { workspace, outputDirectory, sourceHashes } = input;
  // Validate the entire allowlist before creating a snapshot; never glob the repository.
  for (const [path, hash] of Object.entries(sourceHashes))
    if (
      !/^(app|scripts|tests)\//.test(path) ||
      path.split("/").some((part) => ["", ".", ".."].includes(part)) ||
      !isHash(hash)
    )
      fail("source_unsafe");
  await safePath(outputDirectory, "directory");
  if (
    (await lstat(outputDirectory)).mode & 0o077 ||
    (await readdir(outputDirectory)).length
  )
    fail("output_not_empty_private");
  if (
    !relative(workspace, outputDirectory).startsWith(".." + sep) &&
    relative(workspace, outputDirectory) !== ".."
  )
    fail("output_inside_workspace");
  await verifyExpatContext(input.assetDirectory, asset);
  const contents = new Map<string, Buffer>();
  for (const [path, hash] of Object.entries(sourceHashes)) {
    const absolute = join(workspace, path);
    await safePath(absolute, "file");
    const bytes = await readFile(absolute);
    if (sha256(bytes) !== hash) fail("source_drift");
    if (path.startsWith("scripts/latex-runtime/"))
      contents.set(path.slice("scripts/latex-runtime/".length), bytes);
  }
  const contextDirectory = join(outputDirectory, "context"),
    assetDirectory = join(outputDirectory, "verified-expat");
  await mkdir(contextDirectory, { mode: 0o700 });
  await mkdir(assetDirectory, { mode: 0o700 });
  const directories = new Set([contextDirectory, assetDirectory]);
  const contextHashes: Hashes = {};
  for (const [name, bytes] of contents) {
    const destination = join(contextDirectory, name);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    for (
      let directory = dirname(destination);
      directory.startsWith(contextDirectory);
      directory = dirname(directory)
    ) {
      directories.add(directory);
      if (directory === contextDirectory) break;
    }
    await writeFile(destination, bytes, { flag: "wx", mode: 0o444 });
    contextHashes[name] = sha256(bytes);
  }
  await writeFile(
    join(assetDirectory, asset.name),
    await readFile(join(input.assetDirectory, asset.name)),
    { flag: "wx", mode: 0o444 },
  );
  for (const directory of [...directories].sort((a, b) => b.length - a.length))
    await chmod(directory, 0o555);
  await verifyExpatContext(assetDirectory, asset);
  return { contextDirectory, assetDirectory, contextHashes };
}

export function admitDocker(value: DockerObservation): DockerObservation {
  try {
    const endpoint = new URL(value.endpoint);
    if (
      endpoint.protocol !== "unix:" ||
      endpoint.host ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      !endpoint.pathname.startsWith("/") ||
      typeof value.daemonId !== "string" ||
      !/^[a-z0-9][a-z0-9:-]{15,99}$/i.test(value.daemonId) ||
      typeof value.socketIdentity !== "string" ||
      !/^\d+:[1-9]\d*$/.test(value.socketIdentity) ||
      value.osType !== "linux" ||
      !["aarch64", "arm64"].includes(value.architecture) ||
      !Number.isSafeInteger(value.cpus) ||
      value.cpus < 1 ||
      !Number.isSafeInteger(value.memoryBytes) ||
      value.memoryBytes < 1 ||
      value.builder !== "default" ||
      value.node !== "default" ||
      !isHash(value.buildxBinarySha256) ||
      ![
        value.clientVersion,
        value.serverVersion,
        value.buildxVersion,
        value.buildkitVersion,
      ].every(
        (x) =>
          typeof x === "string" &&
          /^v?\d+\.\d+\.\d+(?:[-+.][a-zA-Z0-9.-]+)?$/.test(x),
      )
    )
      fail("docker_not_admitted");
    return value;
  } catch {
    return fail("docker_not_admitted");
  }
}
function ownedImageTag(output: string) {
  return `resumide-latex:local-${sha256(output).slice(0, 24)}`;
}
export function buildArguments(output: string, endpoint: string): string[] {
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
    `verified-expat=${join(output, "verified-expat")}`,
    "--file",
    join(output, "context/Dockerfile"),
    "--progress",
    "plain",
    "--tag",
    ownedImageTag(output),
    "--metadata-file",
    join(output, "build-metadata.json"),
    "--iidfile",
    join(output, "image-id.txt"),
    join(output, "context"),
  ];
}
export function validateCancellationProof(
  value: unknown,
  docker: DockerObservation,
  now = Date.now(),
) {
  const proof = value as Record<string, unknown>;
  if (
    !proof ||
    proof.schemaVersion !== "latex-build-cancellation/v1" ||
    !same(proof.docker, docker) ||
    typeof proof.ref !== "string" ||
    !refPattern.test(proof.ref) ||
    !["canceled", "failed", "completed"].includes(String(proof.status)) ||
    proof.clientGroupExited !== true ||
    proof.ownedRefBound !== true ||
    typeof proof.completedAt !== "string" ||
    !Number.isFinite(Date.parse(proof.completedAt)) ||
    now - Date.parse(proof.completedAt) < 0 ||
    now - Date.parse(proof.completedAt) > 24 * 3600_000
  )
    fail("cancellation_unproven");
}
export function redactBuildLog(value: string): string {
  let printable = "";
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 27 && value[index + 1] === "[") {
      index += 2;
      while (index < value.length && !/[@-~]/.test(value[index])) index++;
      continue;
    }
    if ((code < 32 && code !== 9 && code !== 10) || code === 127) continue;
    printable += value[index];
  }
  return printable.replace(/https?:\/\/[^\s"'<>]+/g, (raw) => {
    try {
      const url = new URL(raw);
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.href;
    } catch {
      return "[redacted-url]";
    }
  });
}

/** Independent of async filesystem monitors; daemon state still requires history proof. */
export function armOwnedDeadline(
  signal: (value: NodeJS.Signals) => void,
  exited: () => boolean,
) {
  const timers = (["SIGINT", "SIGTERM", "SIGKILL"] as const).map(
    (value, index) => {
      const timer = setTimeout(
        () => {
          if (!exited()) signal(value);
        },
        BUILD_BUDGET.wallMs -
          BUILD_BUDGET.cleanupReserveMs +
          index * BUILD_BUDGET.signalGraceMs,
      );
      timer.unref();
      return timer;
    },
  );
  return () => {
    for (const timer of timers) clearTimeout(timer);
  };
}

type OwnershipPorts = {
  identity(pid: number): string;
  groupAlive(pid: number): boolean;
  signalGroup(pid: number, signal: NodeJS.Signals): void;
};
/** Recheck the original detached leader before every signal; PID existence alone is insufficient. */
export function createOwnedGroupGuard(
  pid: number,
  ports: OwnershipPorts = {
    identity: (target) => {
      if (!Number.isSafeInteger(target) || target <= 1) return "";
      const result = spawnSync(
        "ps",
        ["-o", "pid=,pgid=,lstart=", "-p", String(target)],
        {
          env: cleanEnvironment(),
          encoding: "utf8",
          timeout: 1000,
          maxBuffer: 4096,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      return result.error || result.status !== 0
        ? ""
        : result.stdout.trim().replace(/\s+/g, " ");
    },
    groupAlive: (target) => target > 1 && !groupExited(target),
    signalGroup: (target, signal) => {
      process.kill(-target, signal);
    },
  },
) {
  const initial =
    Number.isSafeInteger(pid) && pid > 1 ? ports.identity(pid) : "";
  const pieces = initial.split(/\s+/);
  let unknown =
    !initial ||
    pieces[0] !== String(pid) ||
    pieces[1] !== String(pid) ||
    pieces.length < 5;
  return {
    startIdentity: () => initial,
    ownershipUnknown: () => unknown,
    exited: () => !unknown && !ports.groupAlive(pid),
    signal: (signal: NodeJS.Signals) => {
      if (!ports.groupAlive(pid)) return;
      if (unknown || ports.identity(pid) !== initial) {
        unknown = true;
        return;
      }
      try {
        ports.signalGroup(pid, signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") unknown = true;
      }
    },
  };
}

export type BuildPorts = {
  now(): number;
  wait(ms: number): Promise<unknown>;
  freeBytes(): Promise<number>;
  checkIntegrity(): Promise<void>;
  ownedRef(): Promise<string | undefined>;
  historyStatus(ref: string): Promise<string | undefined>;
  appendLog(text: string): void;
  canceled(): boolean;
  spawn(onData: (data: Buffer) => void): {
    signal(signal: NodeJS.Signals): void;
    result():
      | {
          code: number | null;
          groupExited: boolean;
          ownershipUnknown?: boolean;
          startIdentity?: string;
        }
      | undefined;
  };
};
async function boundedObservation<T>(
  operation: () => Promise<T>,
  maximumMs = BUILD_BUDGET.observationMs,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(Error("observation_deadline")),
          maximumMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Signals an owned client only. Daemon termination is separately evidenced by exact-ref history. */
export async function runOwnedBuild(ports: BuildPorts) {
  try {
    if (
      (await boundedObservation(() => ports.freeBytes())) <
      BUILD_BUDGET.initialFreeBytes
    )
      return {
        status: "not_started",
        reason: "disk_preflight",
        clientStarted: false,
      };
  } catch {
    return {
      status: "not_started",
      reason: "resource_preflight_failed",
      clientStarted: false,
    };
  }
  try {
    await boundedObservation(() => ports.checkIntegrity());
  } catch {
    return {
      status: "not_started",
      reason: "source_preflight_failed",
      clientStarted: false,
    };
  }

  const started = ports.now();
  let reason: string | undefined,
    rawLogBytes = 0,
    retainedBytes = 0,
    pending = "",
    discardLine = false,
    ownedRef: string | undefined;
  const retain = (text: string) => {
    const bytes = Buffer.from(redactBuildLog(text));
    const remaining = Math.max(0, BUILD_BUDGET.logBytes - retainedBytes);
    if (remaining) {
      const part = new TextDecoder().decode(bytes.subarray(0, remaining), {
        stream: true,
      });
      ports.appendLog(part);
      retainedBytes += Buffer.byteLength(part);
    }
  };
  const child = ports.spawn((data) => {
    rawLogBytes += data.length;
    if (rawLogBytes > BUILD_BUDGET.logBytes) {
      reason ??= "log_cap";
      return;
    }
    try {
      let text = data.toString("utf8");
      if (discardLine) {
        const newline = text.indexOf("\n");
        if (newline === -1) return;
        text = text.slice(newline + 1);
        discardLine = false;
      }
      pending += text;
      let newline: number;
      while ((newline = pending.indexOf("\n")) !== -1) {
        retain(
          newline > 65536
            ? "[overlong public build log line omitted]\n"
            : pending.slice(0, newline + 1),
        );
        pending = pending.slice(newline + 1);
      }
      if (pending.length > 65536) {
        retain("[overlong public build log line omitted]\n");
        pending = "";
        discardLine = true;
      }
    } catch {
      reason ??= "log_write_failed";
      pending = "";
    }
  });
  while (!child.result() && !reason) {
    await ports.wait(BUILD_BUDGET.monitorMs);
    if (
      ports.now() - started >=
      BUILD_BUDGET.wallMs - BUILD_BUDGET.cleanupReserveMs
    )
      reason = "deadline";
    else if (ports.canceled()) reason = "canceled";
    else {
      try {
        if (
          (await boundedObservation(() => ports.freeBytes())) <
          BUILD_BUDGET.abortFreeBytes
        )
          reason = "disk_floor";
      } catch {
        reason ??= "resource_monitor_failed";
      }
    }
    if (!reason) {
      try {
        await boundedObservation(() => ports.checkIntegrity());
      } catch {
        reason ??= "source_drift";
      }
    }
    if (!reason) {
      try {
        ownedRef ??= await boundedObservation(() => ports.ownedRef());
      } catch {
        reason ??= "build_reference_unbound";
      }
    }
  }
  if (child.result() && !child.result()?.groupExited)
    reason ??= "client_group_remaining";
  if (reason) {
    for (const signal of ["SIGINT", "SIGTERM", "SIGKILL"] as const) {
      if (child.result()?.groupExited) break;
      child.signal(signal);
      const until = ports.now() + BUILD_BUDGET.signalGraceMs;
      while (!child.result()?.groupExited && ports.now() < until)
        await ports.wait(100);
    }
  }
  try {
    retain(pending);
  } catch {
    reason ??= "log_write_failed";
  }
  try {
    ownedRef ??= await boundedObservation(() => ports.ownedRef());
  } catch {
    /* Classified as unknown below; never inferred from client exit. */
  }
  let daemonOutcome: string | undefined;
  const until = ports.now() + BUILD_BUDGET.historyGraceMs;
  if (ownedRef && refPattern.test(ownedRef)) {
    do {
      try {
        daemonOutcome = await boundedObservation(() =>
          ports.historyStatus(ownedRef!),
        );
      } catch {
        daemonOutcome = undefined;
      }
      if (["canceled", "failed", "completed"].includes(daemonOutcome ?? ""))
        break;
      await ports.wait(500);
    } while (ports.now() < until);
  }
  const result = child.result();
  return {
    status:
      !result?.groupExited ||
      !["canceled", "failed", "completed"].includes(daemonOutcome ?? "")
        ? "daemon_outcome_unknown"
        : reason
          ? "aborted"
          : result.code === 0 && daemonOutcome === "completed"
            ? "candidate_built"
            : "build_failed",
    reason: reason ?? null,
    clientStarted: true,
    clientGroupExited: result?.groupExited ?? false,
    clientOwnershipUnknown: result?.ownershipUnknown ?? false,
    clientStartIdentity: result?.startIdentity ?? null,
    daemonOutcome: daemonOutcome ?? "unknown",
    ownedRef: ownedRef ?? null,
    exitCode: result?.code ?? null,
    durationMs: ports.now() - started,
    rawLogBytes,
    retainedBytes,
  };
}

// A clean environment and private Docker/Buildx config exclude app secrets, registry credentials and ambient builders.
function cleanEnvironment(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: process.env.HOME,
  };
}
export function buildClientEnvironment(
  outputDirectory: string,
): NodeJS.ProcessEnv {
  return {
    ...cleanEnvironment(),
    DOCKER_CONFIG: join(outputDirectory, "docker-config"),
    BUILDX_CONFIG: join(outputDirectory, "buildx"),
    BUILDX_GIT_INFO: "false",
  };
}

function readDocker(
  args: string[],
  environment = cleanEnvironment(),
  maximumMs = 10000,
): string {
  const result = spawnSync("docker", args, {
    env: environment,
    encoding: "utf8",
    timeout: maximumMs,
    maxBuffer: 256 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) fail("docker_observation_failed");
  return result.stdout;
}
export async function dockerSocketIdentity(endpoint: string) {
  if (!/^unix:\/\/\/[^?#\r\n]+$/.test(endpoint)) fail("docker_not_admitted");
  const info = await lstat(decodeURIComponent(new URL(endpoint).pathname), {
    bigint: true,
  });
  if (
    !info.isSocket() ||
    ![0n, BigInt(process.getuid?.() ?? -1)].includes(info.uid)
  )
    fail("docker_not_admitted");
  return `${info.dev}:${info.ino}`;
}
export async function observeDocker() {
  const endpoint = JSON.parse(
    readDocker([
      "context",
      "inspect",
      "desktop-linux",
      "--format",
      "{{json .Endpoints.docker.Host}}",
    ]),
  );
  if (typeof endpoint !== "string" || !endpoint.startsWith("unix:///"))
    fail("docker_not_admitted");
  const socketIdentity = await dockerSocketIdentity(endpoint);
  const prefix = ["--host", endpoint];
  const version = JSON.parse(
    readDocker([...prefix, "version", "--format", "{{json .}}"]),
  );
  const [cpus, memoryBytes, osType, architecture, plugins, daemonId] =
    JSON.parse(
      readDocker([
        ...prefix,
        "info",
        "--format",
        "[{{json .NCPU}},{{json .MemTotal}},{{json .OSType}},{{json .Architecture}},{{json .ClientInfo.Plugins}},{{json .ID}}]",
      ]),
    );
  const buildx = plugins.find(
    (item: Record<string, unknown>) => item.Name === "buildx",
  );
  if (!buildx || typeof buildx.Path !== "string") fail("docker_not_admitted");
  const pluginPath = await realpath(buildx.Path),
    info = await lstat(pluginPath);
  if (
    !info.isFile() ||
    info.mode & 0o022 ||
    ![0, process.getuid?.()].includes(info.uid)
  )
    fail("docker_not_admitted");
  const inspection = readDocker([
    "buildx",
    "inspect",
    "desktop-linux",
    "--timeout",
    "5s",
  ]);
  if (
    !/^Driver:\s+docker\s*$/m.test(inspection) ||
    !/^Status:\s+running\s*$/m.test(inspection) ||
    (await dockerSocketIdentity(endpoint)) !== socketIdentity
  )
    fail("docker_not_admitted");
  const buildkitVersion = /^BuildKit version:\s+(\S+)/m.exec(inspection)?.[1];
  const docker = admitDocker({
    endpoint,
    daemonId,
    socketIdentity,
    clientVersion: version.Client.Version,
    serverVersion: version.Server.Version,
    buildxVersion: buildx.Version,
    buildxBinarySha256: sha256(await readFile(pluginPath)),
    buildkitVersion,
    architecture,
    osType,
    cpus,
    memoryBytes,
    builder: "default",
    node: "default",
  } as DockerObservation);
  return { docker, pluginPath };
}
async function hostFree(path: string) {
  const info = await statfs(path, { bigint: true });
  const available = info.bavail * info.bsize;
  if (available > BigInt(Number.MAX_SAFE_INTEGER))
    fail("disk_observation_failed");
  return Number(available);
}
async function contextHashes(directory: string): Promise<Hashes> {
  const values: Hashes = {};
  async function visit(path: string) {
    const info = await safePath(path, "directory", true);
    if (!info.isDirectory()) fail("source_drift");
    for (const name of await readdir(path)) {
      const absolute = join(path, name),
        entry = await lstat(absolute);
      if (entry.isDirectory()) await visit(absolute);
      else {
        await safePath(absolute, "file", true);
        values[relative(directory, absolute).split(sep).join("/")] = sha256(
          await readFile(absolute),
        );
      }
    }
  }
  await visit(directory);
  return values;
}
async function assertIntegrity(binding: Binding) {
  if (
    !same(await latexSourceHashes(binding.workspace), binding.sourceHashes) ||
    !same(
      await contextHashes(join(binding.outputDirectory, "context")),
      binding.contextHashes,
    )
  )
    fail("source_drift");
  await verifyExpatContext(join(binding.outputDirectory, "verified-expat"));
}
async function writeJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
    mode: 0o444,
  });
}
async function jsonFile(path: string, maximum = 1024 * 1024) {
  const info = await safePath(path, "file", true);
  if (info.size > maximum) fail("receipt_unsafe");
  return JSON.parse(await readFile(path, "utf8"));
}
async function prepare(options: PreparedArguments) {
  if (
    process.versions.node.split(".")[0] !== "22" ||
    !["darwin", "linux"].includes(process.platform)
  )
    fail("unsupported_runtime");
  options = {
    ...options,
    workspace: await realpath(options.workspace),
    assetDirectory: await realpath(options.assetDirectory),
    outputDirectory: await realpath(options.outputDirectory),
  };
  await assertExecutingCheckout(options.workspace);
  await safePath(options.workspace, "directory");
  const { docker, pluginPath } = await observeDocker();
  const hostFreeBytes = await hostFree(options.outputDirectory);
  if (hostFreeBytes < BUILD_BUDGET.initialFreeBytes) fail("disk_preflight");
  const sourceHashes = await latexSourceHashes(options.workspace);
  const frozen = await freezeBuildInputs({ ...options, sourceHashes });
  const binding: Binding = {
    workspace: options.workspace,
    outputDirectory: options.outputDirectory,
    sourceHashes,
    contextHashes: frozen.contextHashes,
    asset: PINNED_EXPAT,
    docker,
    imageTag: ownedImageTag(options.outputDirectory),
    budget: BUILD_BUDGET,
  };
  const config = join(options.outputDirectory, "docker-config");
  await mkdir(config, { mode: 0o700 });
  await writeJson(join(config, "config.json"), {
    cliPluginsExtraDirs: [dirname(pluginPath)],
  });
  const packet: Packet = {
    schemaVersion: "latex-build-review/v1",
    fingerprint: sha256(canonical(binding)),
    binding,
    hostFreeBytes,
  };
  await writeJson(join(options.outputDirectory, "review-packet.json"), packet);
  await assertIntegrity(binding);
  return {
    schemaVersion: packet.schemaVersion,
    status: "review_required",
    fingerprint: packet.fingerprint,
    buildStarted: false,
    hostFreeBytes,
    sourceCount: Object.keys(sourceHashes).length,
    contextCount: Object.keys(frozen.contextHashes).length,
    docker,
    asset: PINNED_EXPAT,
    budget: BUILD_BUDGET,
    imageTag: binding.imageTag,
  };
}
export async function readLatexBuildRef(
  output: string,
): Promise<string | undefined> {
  const root = join(output, "buildx/refs/default/default");
  let names: string[];
  try {
    names = await readdir(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return fail("build_reference_unbound");
  }
  if (names.length === 0) return undefined;
  if (names.length !== 1 || !/^[a-z0-9]{16,64}$/.test(names[0]))
    fail("build_reference_unbound");
  const path = join(root, names[0]),
    info = await safePath(path, "file");
  if (info.size > 8192) fail("build_reference_unbound");
  const record = JSON.parse(await readFile(path, "utf8"));
  if (
    record.LocalPath !== join(output, "context") ||
    record.DockerfilePath !== join(output, "context/Dockerfile") ||
    ![undefined, "", "default"].includes(record.Target)
  )
    fail("build_reference_unbound");
  return `default/default/${names[0]}`;
}
export function latexBuildHistoryArgs(
  output: string,
  endpoint: string,
  qualifiedRef: string,
) {
  if (!refPattern.test(qualifiedRef)) fail("build_reference_unbound");
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
export function latexBuildHistoryStatus(
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
    fail("build_reference_unbound");
  if (
    typeof record.CompletedAt !== "string" ||
    !Number.isFinite(Date.parse(record.CompletedAt))
  )
    return undefined;
  return typeof record.Status === "string" ? record.Status : undefined;
}

function groupExited(pid: number) {
  try {
    process.kill(-pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}
async function execute(options: ExecuteArguments) {
  if (
    process.versions.node.split(".")[0] !== "22" ||
    !["darwin", "linux"].includes(process.platform)
  )
    fail("unsupported_runtime");
  const packet = (await jsonFile(options.packet)) as Packet;
  if (
    packet.schemaVersion !== "latex-build-review/v1" ||
    packet.fingerprint !== options.approved ||
    sha256(canonical(packet.binding)) !== options.approved ||
    !same(packet.binding.asset, PINNED_EXPAT) ||
    !same(packet.binding.budget, BUILD_BUDGET) ||
    packet.binding.imageTag !== ownedImageTag(packet.binding.outputDirectory) ||
    options.packet !==
      join(packet.binding.outputDirectory, "review-packet.json")
  )
    fail("admission_mismatch");
  const binding = packet.binding,
    output = binding.outputDirectory;
  await assertExecutingCheckout(binding.workspace);
  await safePath(output, "directory");
  if ((await lstat(output)).mode & 0o077) fail("output_not_private");
  const { docker, pluginPath } = await observeDocker();
  if (!same(docker, binding.docker)) fail("admission_mismatch");
  const config = await jsonFile(
    join(output, "docker-config/config.json"),
    8192,
  );
  if (!same(config, { cliPluginsExtraDirs: [dirname(pluginPath)] }))
    fail("admission_mismatch");
  validateCancellationProof(
    await jsonFile(options.cancellationReceipt, 16384),
    docker,
  );
  await assertIntegrity(binding);
  const marker = openSync(join(output, "build-attempt.json"), "wx", 0o444);
  writeSync(
    marker,
    JSON.stringify({
      schemaVersion: "latex-build-attempt/v1",
      fingerprint: packet.fingerprint,
      maximumAttempts: 1,
    }) + "\n",
  );
  closeSync(marker);
  // A failed preflight after this marker consumes the attempt: never retry automatically.
  const environment = buildClientEnvironment(output);
  const prefix = [
    "--config",
    join(output, "docker-config"),
    "--host",
    docker.endpoint,
  ];
  const existing = spawnSync(
    "docker",
    [...prefix, "image", "inspect", binding.imageTag, "--format", "{{.Id}}"],
    { env: environment, encoding: "utf8", timeout: 10000, maxBuffer: 8192 },
  );
  if (
    existing.error ||
    existing.status !== 1 ||
    !/No such (image|object)/i.test(existing.stderr)
  )
    fail("owned_image_tag_unavailable");
  const log = openSync(join(output, "build.log"), "wx", 0o400);
  let canceled = false;
  const cancel = () => {
    canceled = true;
  };
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  let disarmWatchdog: () => void = () => undefined;
  try {
    const receipt = await runOwnedBuild({
      now: () => performance.now(),
      wait,
      freeBytes: () => hostFree(output),
      checkIntegrity: () => assertIntegrity(binding),
      ownedRef: () => readLatexBuildRef(output),
      canceled: () => canceled,
      appendLog: (text) => {
        writeSync(log, text);
      },
      historyStatus: async (ref) =>
        latexBuildHistoryStatus(
          JSON.parse(
            readDocker(
              latexBuildHistoryArgs(output, docker.endpoint, ref),
              environment,
              BUILD_BUDGET.observationMs,
            ),
          ),
          ref,
          join(output, "context"),
        ),
      spawn: (onData) => {
        const child = spawn("docker", buildArguments(output, docker.endpoint), {
          env: environment,
          cwd: output,
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let done = false,
          code: number | null = null;
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("error", () => {
          done = true;
        });
        child.on("close", (value) => {
          done = true;
          code = value;
        });
        const ownership = createOwnedGroupGuard(child.pid ?? 0);
        disarmWatchdog = armOwnedDeadline((signal) => {
          canceled = true;
          ownership.signal(signal);
        }, ownership.exited);
        return {
          signal: ownership.signal,
          result: () =>
            done || ownership.ownershipUnknown()
              ? {
                  code,
                  groupExited: ownership.exited(),
                  ownershipUnknown: ownership.ownershipUnknown(),
                  startIdentity: ownership.startIdentity(),
                }
              : undefined,
        };
      },
    });
    // Preserve lifecycle evidence separately; identity is still unproved at this point.
    await writeJson(join(output, "process-lifecycle.json"), {
      schemaVersion: "latex-build-lifecycle/v1",
      fingerprint: packet.fingerprint,
      ...receipt,
    });
    let final = {
      ...receipt,
      fingerprint: packet.fingerprint,
      imageId: null as string | null,
      runtimeAccepted: false,
    };
    if (receipt.status === "candidate_built") {
      try {
        if (!same((await observeDocker()).docker, binding.docker))
          fail("admission_mismatch");
        await assertIntegrity(binding);
        const imageId = (
          await readFile(join(output, "image-id.txt"), "utf8")
        ).trim();
        const metadata = JSON.parse(
          await readFile(join(output, "build-metadata.json"), "utf8"),
        );
        const actualId = readDocker(
          [
            ...prefix,
            "image",
            "inspect",
            binding.imageTag,
            "--format",
            "{{.Id}}",
          ],
          environment,
        ).trim();
        if (
          !/^sha256:[a-f0-9]{64}$/.test(imageId) ||
          actualId !== imageId ||
          metadata["buildx.build.ref"] !== receipt.ownedRef
        )
          fail("image_identity_unproven");
        final = { ...final, imageId };
      } catch {
        final = {
          ...final,
          status: "candidate_identity_unproven",
          reason: "final_admission_failed",
        };
      }
    }
    await writeJson(join(output, "build-receipt.json"), {
      schemaVersion: "latex-build-result/v1",
      ...final,
    });
    return final;
  } finally {
    disarmWatchdog();
    closeSync(log);
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}
export async function runVerifiedBuild(argv: readonly string[]) {
  const options = parseBuildArguments(argv);
  return options.mode === "prepare" ? prepare(options) : execute(options);
}
// vite-node preserves its own argv[1]; an explicit marker keeps utility imports inert.
const directEntry =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
const viteEntry =
  /\/vite-node(?:\.mjs)?$/.test(process.argv[1] ?? "") &&
  process.argv[2] === "--cli";
if (directEntry || viteEntry) {
  try {
    const result = await runVerifiedBuild(
      process.argv.slice(viteEntry ? 3 : 2),
    );
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    process.exitCode = ["review_required", "candidate_built"].includes(
      result.status,
    )
      ? 0
      : 1;
  } catch (error) {
    const allowed = [
      "invalid_arguments",
      "wrong_execution_checkout",
      "unsupported_runtime",
      "path_unsafe",
      "asset_context_unsafe",
      "source_unsafe",
      "source_drift",
      "output_not_empty_private",
      "output_inside_workspace",
      "output_not_private",
      "docker_not_admitted",
      "docker_observation_failed",
      "disk_preflight",
      "disk_observation_failed",
      "receipt_unsafe",
      "admission_mismatch",
      "cancellation_unproven",
      "owned_image_tag_unavailable",
      "image_identity_unproven",
    ];
    const message = error instanceof Error ? error.message : "";
    process.stdout.write(
      JSON.stringify({
        schemaVersion: "latex-build-result/v1",
        status: "failed",
        code: allowed.includes(message) ? message : "build_unavailable",
        runtimeAccepted: false,
      }) + "\n",
    );
    process.exitCode = 1;
  }
}
