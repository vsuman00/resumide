import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  LocalOcrExecutionError,
  SelectiveOcrRequestSchema,
  type LocalOcrAdapter,
  type LocalOcrRawResult,
} from "./selective";
import { BEST_LANGUAGE_DATA, TEXT_FUSION_VERSIONS } from "./profiles";

const OWNER_LABEL = "resumide.ocr.attempt";
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
let activeAttempts = 0;
export const LOCAL_OCR_VERSIONS = Object.freeze({
  engine: "tesseract-5.3.0-2",
  renderer: "poppler-22.12.0-2+deb12u3",
  languageData:
    "sha256:7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2",
});

export type DockerCommand = (
  args: readonly string[],
  options: {
    input?: Uint8Array;
    signal?: AbortSignal;
    timeoutMs: number;
    maxOutputBytes?: number;
  },
) => Promise<string>;

export type LocalOcrEvaluationConfig = {
  psm: 3 | 6;
  maxDpi: 150 | 300;
  thresholdingMethod?: 1 | 2;
  model?: "best" | "text-fusion";
};

// No shell, caller-controlled executable or environment forwarding into the container.
const runDocker: DockerCommand = (args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn("docker", [...args], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let failed = false;
    const fail = (
      code: "timeout" | "cancelled" | "resource_limit" | "engine_failure",
    ) => {
      if (failed) return;
      failed = true;
      child.kill("SIGKILL");
      reject(new LocalOcrExecutionError(code));
    };
    const abort = () => fail("cancelled");
    const timer = setTimeout(() => fail("timeout"), options.timeoutMs);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > (options.maxOutputBytes ?? MAX_OUTPUT_BYTES))
        fail("resource_limit");
      else chunks.push(chunk);
    });
    // Diagnostics may contain document text: count and discard, never return/log them.
    child.stderr.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > (options.maxOutputBytes ?? MAX_OUTPUT_BYTES))
        fail("resource_limit");
    });
    child.on("error", () => fail("engine_failure"));
    child.stdin.on("error", () => fail("engine_failure"));
    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (!failed) {
        if (code === 0) resolve(Buffer.concat(chunks).toString("utf8"));
        else reject(new LocalOcrExecutionError("engine_failure"));
      }
    });
    child.stdin.end(options.input);
  });

export function createLocalContainerOcrAdapter(options: {
  bytes: Uint8Array;
  imageId: string;
  command?: DockerCommand;
  /** Explicit engineering comparison only; no production settings are changed. */
  evaluationConfig?: LocalOcrEvaluationConfig;
}): LocalOcrAdapter {
  if (!/^sha256:[a-f0-9]{64}$/.test(options.imageId))
    throw new LocalOcrExecutionError("engine_failure");
  const config = options.evaluationConfig ?? { psm: 3, maxDpi: 300 };
  const hasThreshold = Object.prototype.hasOwnProperty.call(
    config ?? {},
    "thresholdingMethod",
  );
  const hasModel = Object.prototype.hasOwnProperty.call(config ?? {}, "model");
  const fusion = config?.model === "text-fusion";
  if (
    !config ||
    Object.keys(config).length !==
      2 + Number(hasThreshold) + Number(hasModel) ||
    !(config.psm === 3 || config.psm === 6) ||
    !(config.maxDpi === 150 || config.maxDpi === 300) ||
    (hasThreshold &&
      config.thresholdingMethod !== 1 &&
      config.thresholdingMethod !== 2) ||
    (hasModel && config.model !== "best" && !fusion) ||
    (fusion && (config.psm !== 3 || config.maxDpi !== 150 || hasThreshold))
  )
    throw new LocalOcrExecutionError("engine_failure");
  const psm = config.psm;
  const maxDpi = config.maxDpi;
  const evaluationArgs =
    hasThreshold || hasModel || psm !== 3 || maxDpi !== 300
      ? [
          String(psm),
          String(maxDpi),
          ...(hasThreshold ? [String(config.thresholdingMethod)] : []),
          ...(hasModel ? [config.model!] : []),
        ]
      : [];
  const bytes = options.bytes.slice();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const command = options.command ?? runDocker;
  return {
    versions: fusion
      ? TEXT_FUSION_VERSIONS
      : Object.freeze({
          ...LOCAL_OCR_VERSIONS,
          languageData: hasModel
            ? BEST_LANGUAGE_DATA
            : LOCAL_OCR_VERSIONS.languageData,
          engine:
            LOCAL_OCR_VERSIONS.engine +
            (psm === 3 ? "" : "/psm-6") +
            (hasModel ? "/lstm-best" : "") +
            (hasThreshold
              ? config.thresholdingMethod === 1
                ? "/leptonica-otsu"
                : "/sauvola"
              : ""),
          renderer:
            LOCAL_OCR_VERSIONS.renderer + (maxDpi === 300 ? "" : "/dpi-150"),
        }),
    async recognize(request, signal) {
      if (!SelectiveOcrRequestSchema.safeParse(request).success)
        throw new LocalOcrExecutionError("engine_failure");
      if (signal.aborted) throw new LocalOcrExecutionError("cancelled");
      if (
        request.sourceSha256 !== sha256 ||
        bytes.byteLength > 10 * 1024 * 1024 ||
        !Buffer.from(bytes.subarray(0, 5)).equals(Buffer.from("%PDF-"))
      )
        throw new LocalOcrExecutionError("engine_failure");
      if (
        !request.selectedPages.length ||
        request.selectedPages.length > 10 ||
        request.selectedPages.some(
          (page) =>
            !Number.isInteger(page.pageNumber) ||
            page.pageNumber < 1 ||
            page.pageNumber > request.nativePageTexts.length ||
            page.pageId !== `page-${page.pageNumber}`,
        ) ||
        new Set(request.selectedPages.map((page) => page.pageNumber)).size !==
          request.selectedPages.length
      )
        throw new LocalOcrExecutionError("engine_failure");
      if (activeAttempts >= 2)
        throw new LocalOcrExecutionError("resource_limit");
      const budget = Math.min(
        request.remainingDeadlineMs,
        request.allocation.maxWallTimeMs,
        10_000,
      );
      if (
        !Number.isFinite(budget) ||
        budget <= 0 ||
        request.policy.executionMode !== "self_hosted" ||
        request.policy.purpose !== "synthetic_local_test" ||
        request.policy.allowThirdPartyProcessing ||
        request.allocation.externalApiFeeMicros !== 0
      )
        throw new LocalOcrExecutionError("engine_failure");
      const ownership = randomUUID();
      const name = `resumide-ocr-${ownership}`;
      let id: string | undefined;
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(abort, budget);
      const ownedId = async (target: string) => {
        const inspected = await command(
          [
            "inspect",
            "--format",
            `{{.Id}} {{index .Config.Labels "${OWNER_LABEL}"}}`,
            target,
          ],
          { timeoutMs: 3_000, maxOutputBytes: 1024 },
        );
        const [actualId, label] = inspected.trim().split(" ");
        if (
          !/^[a-f0-9]{64}$/.test(actualId) ||
          label !== ownership ||
          (id && id !== actualId)
        )
          throw new LocalOcrExecutionError("engine_failure");
        return actualId;
      };
      activeAttempts++;
      try {
        const created = await command(
          [
            "create",
            "--pull=never",
            "--interactive",
            "--name",
            name,
            "--label",
            `${OWNER_LABEL}=${ownership}`,
            "--user=10001:10001",
            "--read-only",
            "--network=none",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--cpus=2",
            "--memory=1g",
            "--memory-swap=1g",
            "--pids-limit=64",
            "--ulimit=core=0:0",
            "--log-driver=none",
            "--tmpfs=/scratch:rw,noexec,nosuid,nodev,size=268435456,mode=700,uid=10001,gid=10001",
            options.imageId,
            request.selectedPages.map((page) => page.pageNumber).join(","),
            ...evaluationArgs,
          ],
          { timeoutMs: budget, signal: controller.signal },
        );
        const createdId = created.trim();
        if (!/^[a-f0-9]{64}$/.test(createdId))
          throw new LocalOcrExecutionError("engine_failure");
        id = createdId;
        await ownedId(id);
        if (controller.signal.aborted)
          throw new LocalOcrExecutionError(
            signal.aborted ? "cancelled" : "timeout",
          );
        const result = await command(
          ["start", "--attach", "--interactive", id],
          { input: bytes, timeoutMs: budget, signal: controller.signal },
        );
        if (controller.signal.aborted)
          throw new LocalOcrExecutionError(
            signal.aborted ? "cancelled" : "timeout",
          );
        return JSON.parse(result) as LocalOcrRawResult;
      } catch (error) {
        if (controller.signal.aborted)
          throw new LocalOcrExecutionError(
            signal.aborted ? "cancelled" : "timeout",
          );
        if (error instanceof LocalOcrExecutionError) throw error;
        throw new LocalOcrExecutionError("engine_failure");
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        // Inspect exact creation identity before destructive cleanup, including interrupted create.
        try {
          const cleanupId = await ownedId(id ?? name);
          await command(["rm", "--force", cleanupId], {
            timeoutMs: 3_000,
            maxOutputBytes: 1024,
          });
        } finally {
          activeAttempts--;
        }
      }
    },
  };
}
