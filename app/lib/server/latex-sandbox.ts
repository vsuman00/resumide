import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { LATEX_LIMITS, LATEX_POLICY_VERSION } from "../latex-converter";
import {
  validatePreparedLatexDocument,
  type PreparedLatexDocument,
} from "./latex-source";
export const LATEX_SANDBOX_LIMITS = Object.freeze({
  ...LATEX_LIMITS,
  memoryBytes: 536870912,
  scratchBytes: 134217728,
  pids: 64,
  openFiles: 64,
  fileBytes: 8388608,
  cpuSeconds: 10,
});
export type LatexSandboxCode =
  | "runtime_unavailable"
  | "busy"
  | "cancelled"
  | "timeout"
  | "compile_failed"
  | "missing_glyph"
  | "layout_overflow"
  | "output_invalid"
  | "cleanup_failed";
const messages: Record<LatexSandboxCode, string> = {
  runtime_unavailable: "The isolated compiler is unavailable.",
  busy: "The compiler is busy. Try again shortly.",
  cancelled: "Compilation was cancelled.",
  timeout: "Compilation exceeded its time limit.",
  compile_failed: "The document could not compile. Check the LaTeX source.",
  missing_glyph: "The document contains unsupported characters.",
  layout_overflow: "Content exceeds the supported page layout.",
  output_invalid: "The generated PDF did not pass output checks.",
  cleanup_failed: "The compiler is unavailable while cleanup is checked.",
};
export class LatexSandboxError extends Error {
  constructor(public readonly code: LatexSandboxCode) {
    super(messages[code]);
    this.name = "LatexSandboxError";
  }
}
let active = 0;
let quarantined = false;
let startupChecked: Promise<void> | undefined;
let verifiedLocalDockerHost: string | undefined;
export function buildLatexContainerArgs(
  name: string,
  imageId: string,
): string[] {
  if (
    !/^resumide-latex-[a-f0-9-]{36}$/.test(name) ||
    !/^sha256:[a-f0-9]{64}$/.test(imageId)
  )
    throw new LatexSandboxError("runtime_unavailable");
  return [
    "run",
    "--pull=never",
    "--name",
    name,
    "--label",
    `resumide.latex.policy=${LATEX_POLICY_VERSION}`,
    "--label",
    "resumide.latex.service=converter",
    "--user",
    "65532:65532",
    "--read-only",
    "--network",
    "none",
    "--ipc",
    "private",
    "--cgroupns",
    "private",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--cpus",
    "2",
    "--memory",
    "512m",
    "--memory-swap",
    "512m",
    "--pids-limit",
    "64",
    "--ulimit",
    "nofile=64:64",
    "--ulimit",
    "fsize=8388608:8388608",
    "--ulimit",
    "cpu=10:10",
    "--log-driver",
    "none",
    "--tmpfs",
    "/scratch:rw,noexec,nosuid,nodev,size=128m,mode=700,uid=65532,gid=65532",
    "--workdir",
    "/scratch",
    "-i",
    imageId,
  ];
}
type CliResult = { code: number | null; stdout: Buffer; stderr: string };
function docker(
  args: string[],
  input: string | undefined,
  signal: AbortSignal | undefined,
  timeoutMs: number,
  maxBytes: number,
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: process.env.HOME ?? "/nonexistent",
        ...((verifiedLocalDockerHost ?? process.env.DOCKER_HOST)
          ? { DOCKER_HOST: verifiedLocalDockerHost ?? process.env.DOCKER_HOST }
          : {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let stderr = "";
    let failure: LatexSandboxCode | undefined;
    const stop = (code: LatexSandboxCode) => {
      failure ??= code;
      child.kill("SIGKILL");
    };
    const abort = () => stop("cancelled");
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(() => stop("timeout"), Math.max(1, timeoutMs));
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) stop("output_invalid");
      else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 4096)
        stderr += chunk.toString("utf8").slice(0, 4096 - stderr.length);
    });
    child.stdin.on("error", () => {
      /* Closed input is classified by process exit. */
    });
    child.on("error", () => {
      failure = "runtime_unavailable";
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (failure) reject(new LatexSandboxError(failure));
      else resolve({ code, stdout: Buffer.concat(chunks), stderr });
    });
    child.stdin.end(input);
  });
}
async function cleanup(name: string) {
  try {
    await docker(["rm", "-f", name], undefined, undefined, 5000, 4096);
    const result = await docker(
      ["container", "inspect", "--format", "{{.Id}}", name],
      undefined,
      undefined,
      5000,
      4096,
    );
    if (result.code !== 1 || !/No such (object|container)/i.test(result.stderr))
      throw new Error("cleanup");
  } catch {
    quarantined = true;
    throw new LatexSandboxError("cleanup_failed");
  }
}
async function checkStartup() {
  startupChecked ??= (async () => {
    if (
      process.env.DOCKER_HOST &&
      !/^unix:\/\/\/[^\r\n]+$/.test(process.env.DOCKER_HOST)
    )
      throw new LatexSandboxError("runtime_unavailable");
    if (!process.env.DOCKER_HOST) {
      const endpoint = await docker(
        ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
        undefined,
        undefined,
        5000,
        4096,
      );
      if (
        endpoint.code !== 0 ||
        !/^unix:\/\/\/[^\r\n]+\s*$/.test(endpoint.stdout.toString())
      )
        throw new LatexSandboxError("runtime_unavailable");
      verifiedLocalDockerHost = endpoint.stdout.toString().trim();
    } else {
      verifiedLocalDockerHost = process.env.DOCKER_HOST;
    }
    // Pin the verified local socket for every later CLI call, even if the user's
    // default Docker context changes while this server is running.
    const result = await docker(
      ["ps", "-aq", "--filter", "label=resumide.latex.service=converter"],
      undefined,
      undefined,
      5000,
      4096,
    );
    if (result.code !== 0) throw new LatexSandboxError("runtime_unavailable");
    // An abandoned or another process-owned job is never removed speculatively.
    // Refuse new admission until an operator reconciles those exact resources.
    if (result.stdout.toString().trim()) {
      quarantined = true;
      throw new LatexSandboxError("cleanup_failed");
    }
  })().catch((error: unknown) => {
    // A transient daemon failure may recover; cleanup quarantine requires an operator.
    if (!quarantined) startupChecked = undefined;
    throw error;
  });
  await startupChecked;
}
export type LatexCompileResult = {
  pdf: Uint8Array;
  pages: number;
  text: string;
  diagnostics: string[];
  durationMs: number;
};
export async function compileLatex(
  raw: PreparedLatexDocument,
  options: { imageId: string; signal?: AbortSignal },
): Promise<LatexCompileResult> {
  const prepared = validatePreparedLatexDocument(raw);
  const name = `resumide-latex-${randomUUID()}`;
  const args = buildLatexContainerArgs(name, options.imageId);
  if (options.signal?.aborted) throw new LatexSandboxError("cancelled");
  await checkStartup();
  if (quarantined) throw new LatexSandboxError("cleanup_failed");
  if (options.signal?.aborted) throw new LatexSandboxError("cancelled");
  if (active >= LATEX_LIMITS.concurrency) throw new LatexSandboxError("busy");
  active++;
  const started = performance.now();
  try {
    // Create is awaited before start: cancellation cannot leave a late-created run behind.
    // The bounded create itself is not aborted; cleanup owns its exact name on all exits.
    const created = await docker(
      ["create", ...args.slice(1)],
      undefined,
      undefined,
      5000,
      4096,
    ).catch(() => {
      // A killed/disconnected create client may leave a late-created idle container.
      // No source has been sent, but immediate absence cannot prove reconciliation.
      quarantined = true;
      throw new LatexSandboxError("cleanup_failed");
    });
    if (
      created.code !== 0 ||
      !/^[a-f0-9]{64}\s*$/.test(created.stdout.toString())
    ) {
      quarantined = true;
      throw new LatexSandboxError("cleanup_failed");
    }
    if (options.signal?.aborted) throw new LatexSandboxError("cancelled");
    const remaining = LATEX_LIMITS.timeoutMs - (performance.now() - started);
    const result = await docker(
      ["start", "-a", "-i", name],
      JSON.stringify({ source: prepared.source }),
      options.signal,
      remaining,
      Math.ceil((LATEX_LIMITS.pdfBytes * 4) / 3) + 700000,
    );
    if (result.code !== 0) throw new LatexSandboxError("compile_failed");
    let value: unknown;
    try {
      value = JSON.parse(result.stdout.toString("utf8"));
    } catch {
      throw new LatexSandboxError("output_invalid");
    }
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new LatexSandboxError("output_invalid");
    const data = value as Record<string, unknown>;
    if (typeof data.error === "string" && Object.hasOwn(messages, data.error))
      throw new LatexSandboxError(data.error as LatexSandboxCode);
    if (
      Object.keys(data).sort().join(",") !== "diagnostics,pages,pdf,text" ||
      typeof data.pdf !== "string" ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(data.pdf) ||
      typeof data.pages !== "number" ||
      !Number.isInteger(data.pages) ||
      data.pages < 1 ||
      data.pages > LATEX_LIMITS.pages ||
      typeof data.text !== "string" ||
      data.text.length > 100000 ||
      !data.text.trim() ||
      !Array.isArray(data.diagnostics) ||
      data.diagnostics.length
    )
      throw new LatexSandboxError("output_invalid");
    const pdf = Buffer.from(data.pdf, "base64");
    if (
      pdf.length > LATEX_LIMITS.pdfBytes ||
      pdf.length < 100 ||
      pdf.subarray(0, 5).toString() !== "%PDF-" ||
      pdf.toString("base64") !== data.pdf
    )
      throw new LatexSandboxError("output_invalid");
    return {
      pdf: new Uint8Array(pdf),
      pages: data.pages,
      text: data.text,
      diagnostics: [],
      durationMs: Math.round(performance.now() - started),
    };
  } finally {
    try {
      await cleanup(name);
    } finally {
      active--;
    }
  }
}
