import { Worker } from "node:worker_threads";
import { resolve } from "node:path";
import {
  ArtifactOptionsSchema,
  buildRenderPlan,
  TEMPLATE,
  verifyArtifact,
  type ArtifactObservation,
  type ArtifactReport,
} from "./artifact-contract";
let active = 0;
export const ARTIFACT_LIMITS = {
  timeoutMs: 10000,
  concurrency: 2,
  heapMb: 128,
} as const;
export async function renderArtifact(
  raw: unknown,
  rawOptions: unknown,
  signal?: AbortSignal,
): Promise<{ report: ArtifactReport; bytes: Uint8Array | null }> {
  const options = ArtifactOptionsSchema.parse(rawOptions),
    plan = buildRenderPlan(raw);
  if (options.versionId !== plan.versionId)
    throw Error(
      "The saved resume changed. Review the current version before exporting.",
    );
  if (active >= ARTIFACT_LIMITS.concurrency)
    throw Error("The renderer is busy. Try again shortly.");
  if (signal?.aborted) throw Error("Rendering cancelled.");
  active++;
  const started = performance.now();
  try {
    const result = await new Promise<{
      bytes?: Uint8Array;
      observation?: ArtifactObservation;
      error?: string;
    }>((resolveResult, reject) => {
      const worker = new Worker(
        resolve(process.cwd(), "app/lib/server/artifact-worker.mjs"),
        {
          workerData: {
            plan,
            options,
            fontPath: resolve(
              process.cwd(),
              "assets/fonts/NotoSans-Regular.ttf",
            ),
            fallbackFontPath: resolve(
              process.cwd(),
              "assets/fonts/NotoSansMath-Regular.ttf",
            ),
          },
          resourceLimits: {
            maxOldGenerationSizeMb: ARTIFACT_LIMITS.heapMb,
            maxYoungGenerationSizeMb: 16,
            stackSizeMb: 4,
          },
          // Never inherit environment credentials or flags into renderer workers.
          env: {},
          execArgv: [],
        },
      );
      let finished = false;
      const finish = (
        error?: Error,
        value?: {
          bytes?: Uint8Array;
          observation?: ArtifactObservation;
          error?: string;
        },
      ) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        void worker.terminate();
        if (error) reject(error);
        else resolveResult(value!);
      };
      const abort = () => finish(Error("Rendering cancelled."));
      const timer = setTimeout(
        () =>
          finish(
            Error("Rendering timed out. Shorten the resume and try again."),
          ),
        ARTIFACT_LIMITS.timeoutMs,
      );
      signal?.addEventListener("abort", abort, { once: true });
      worker.once("message", (value) => finish(undefined, value));
      worker.once("error", () =>
        finish(Error("Rendering failed safely. Try again later.")),
      );
      worker.once("exit", () =>
        finish(Error("Rendering stopped safely. Try again later.")),
      );
    });
    if (
      !result.bytes ||
      !result.observation ||
      result.bytes.length > TEMPLATE.maxBytes
    ) {
      const report = verifyArtifact(
        plan,
        options,
        {
          text: "",
          links: [],
          linkBindings: [],
          pages: null,
          layoutPass: false,
          structuralAccessibility: false,
          diagnostics: [result.error ?? "Rendering failed safely."],
        },
        new Uint8Array(),
        performance.now() - started,
      );
      report.transitions = ["queued", "export_verification_failed"];
      report.artifactSha256 = null;
      return { report, bytes: null };
    }
    const report = verifyArtifact(
      plan,
      options,
      result.observation,
      result.bytes,
      performance.now() - started,
    );
    return { report, bytes: report.state === "verified" ? result.bytes : null };
  } finally {
    active--;
  }
}
