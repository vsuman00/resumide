import { createHash } from "node:crypto";
import { ResumeExtractionError } from "../extract";
import { extractPdfTextLayers, type PdfTextExtraction } from "./pdf-detection";
import {
  runPaddleOcrReview,
  type PaddleOcrReviewOutcome,
  type PaddleOcrReviewRequest,
} from "./paddle";
import type { PaddleOcrConfig } from "./paddle-config";

/** Native PDF parser followed by hosted review only for missing text layers.
 * This entry point is not connected to production workers or score persistence.
 * It provides the source-bound contract for that later integration.
 */
export async function extractPaddleOcrReview(
  input: Omit<PaddleOcrReviewRequest, "nativePageTexts"> & {
    maxPdfPages: number;
  },
  config: PaddleOcrConfig,
  dependencies: Parameters<typeof runPaddleOcrReview>[2],
  extractor = extractPdfTextLayers,
): Promise<PaddleOcrReviewOutcome> {
  const failed = (
    code: Extract<PaddleOcrReviewOutcome, { status: "failed" }>["code"],
  ): PaddleOcrReviewOutcome => ({
    schemaVersion: "paddle-review/1.0.0",
    status: "failed",
    code,
    nativePageTexts: [],
    scoringEligible: false,
    attempts: [],
  });
  if (
    !Number.isInteger(input.maxPdfPages) ||
    input.maxPdfPages < 1 ||
    input.maxPdfPages > 20
  )
    return failed("invalid_input");
  if (input.bytes.byteLength > config.PADDLEOCR_MAX_UPLOAD_BYTES)
    return failed("resource_limit");
  const bytes = new Uint8Array(input.bytes);
  const source = { ...input, consent: { ...input.consent } };
  if (createHash("sha256").update(bytes).digest("hex") !== input.sourceSha256)
    return failed("invalid_input");
  if (dependencies.signal?.aborted) return failed("cancelled");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  dependencies.signal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error("Native extraction interrupted"));
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  const started = performance.now();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.PADDLEOCR_TIMEOUT_MS);
  let layers: PdfTextExtraction;
  try {
    layers = await Promise.race([
      extractor(bytes, {
        maxPages: input.maxPdfPages,
        maxCharacters: config.PADDLEOCR_MAX_CHARACTERS,
      }),
      aborted,
    ]);
  } catch (error) {
    if (controller.signal.aborted)
      return failed(timedOut ? "timeout" : "cancelled");
    if (error instanceof ResumeExtractionError)
      return failed(
        error.code === "PAGE_LIMIT" || error.code === "TEXT_LIMIT"
          ? "resource_limit"
          : "invalid_input",
      );
    return failed("outage");
  } finally {
    clearTimeout(timer);
    dependencies.signal?.removeEventListener("abort", cancel);
    if (onAbort) controller.signal.removeEventListener("abort", onAbort);
  }
  const remaining = Math.floor(
    config.PADDLEOCR_TIMEOUT_MS - (performance.now() - started),
  );
  if (remaining <= 0) return failed("timeout");
  // Only the adapter races the hosted phase: its cancellation/timeout outcome
  // retains acknowledged and ambiguous provider receipts for reconciliation.
  return runPaddleOcrReview(
    { ...source, bytes, nativePageTexts: layers.pageTexts },
    { ...config, PADDLEOCR_TIMEOUT_MS: remaining },
    dependencies,
  );
}
