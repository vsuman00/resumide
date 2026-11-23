import {
  extractPdfTextLayers,
  detectPdfTextProfile,
} from "./ocr/pdf-detection";
import { buildNativeEvidence } from "./native-evidence";
import { assertResumeSource, ResumeExtractionError } from "./extract";
import {
  reconcileDocumentEvidence,
  type DocumentEvidenceContext,
} from "./document-evidence";
import {
  runSelectiveLocalOcr,
  type LocalOcrAdapter,
  type SelectiveOcrRequest,
} from "./ocr/selective";

type ReviewExtractionArgs = {
  bytes: Uint8Array;
  context: DocumentEvidenceContext;
  maxBytes: number;
  maxPages: number;
  maxCharacters: number;
  timeoutMs: number;
  signal?: AbortSignal;
  assertOcrAdmission?: () => Promise<void>;
  syntheticOcr?: { adapter: LocalOcrAdapter; request: SelectiveOcrRequest };
};

/** Legacy envelope API; metadata is not added to the immutable envelope. */
export async function extractDocumentForReview(
  args: ReviewExtractionArgs,
  extractor = extractPdfTextLayers,
) {
  return (await extractDocumentForReviewWithMetadata(args, extractor)).envelope;
}

/** Declared PDF total comes from the same controlled parser invocation, never
 * the number of materialized evidence pages. Production supplies no OCR adapter. */
export async function extractDocumentForReviewWithMetadata(
  args: ReviewExtractionArgs,
  extractor = extractPdfTextLayers,
) {
  const cancelled = () =>
    new DOMException("Document review extraction was cancelled.", "AbortError");
  if (args.signal?.aborted) throw cancelled();
  if (!Number.isSafeInteger(args.maxPages) || args.maxPages < 1)
    throw new ResumeExtractionError("INVALID_PDF");
  assertResumeSource(args.bytes, args.maxBytes, args.context.inputSha256);
  const controller = new AbortController();
  const deadline = performance.now() + args.timeoutMs;
  const timeout = () =>
    new ResumeExtractionError("TIMEOUT", "Document extraction timeout");
  const requireTime = () => {
    if (args.signal?.aborted) throw cancelled();
    if (controller.signal.aborted || performance.now() >= deadline) {
      controller.abort();
      throw timeout();
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onCancel: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    onCancel = () => {
      controller.abort();
      reject(cancelled());
    };
    args.signal?.addEventListener("abort", onCancel, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      reject(timeout());
    }, args.timeoutMs);
  });
  try {
    return await Promise.race([
      interrupted,
      (async () => {
        const layers = await extractor(args.bytes, {
          maxPages: args.maxPages,
          maxCharacters: args.maxCharacters,
          signal: controller.signal,
        });
        requireTime();
        const profile = detectPdfTextProfile(layers);
        if (layers.totalPages > args.maxPages)
          throw new ResumeExtractionError("PAGE_LIMIT");
        const result = (
          envelope: ReturnType<typeof reconcileDocumentEvidence>,
        ) => {
          requireTime();
          return { envelope, pageCount: layers.totalPages };
        };
        const pageTexts = layers.pageTexts ?? [layers.text];
        const native = buildNativeEvidence(pageTexts);
        if (!profile.pagesNeedingOcr.length)
          return result(reconcileDocumentEvidence(args.context, native));
        if (!args.syntheticOcr)
          return result(
            reconcileDocumentEvidence(args.context, native, null, {
              code: "unsupported",
            }),
          );
        const request = structuredClone(args.syntheticOcr.request);
        const { adapter } = args.syntheticOcr;
        if (
          request.ownerId !== args.context.ownerId ||
          request.analysisId !== args.context.analysisId ||
          request.sourceId !== args.context.sourceId ||
          request.sourceSha256 !== args.context.inputSha256 ||
          request.retentionPolicyId !== args.context.retentionPolicyId ||
          JSON.stringify(request.nativePageTexts) !== JSON.stringify(pageTexts)
        )
          throw new Error("OCR request source mismatch");
        if (args.assertOcrAdmission) await args.assertOcrAdmission();
        requireTime();
        const remainingMs = Math.floor(deadline - performance.now());
        if (remainingMs < 1) throw timeout();
        const ocrResult = await runSelectiveLocalOcr(
          {
            ...request,
            remainingDeadlineMs: Math.min(
              request.remainingDeadlineMs,
              remainingMs,
            ),
          },
          adapter,
          controller.signal,
        );
        requireTime();
        if (ocrResult.status === "not_needed")
          throw new Error("OCR selection mismatch");
        return result(
          ocrResult.status === "failed"
            ? reconcileDocumentEvidence(args.context, native, null, {
                code: ocrResult.code,
              })
            : reconcileDocumentEvidence(args.context, native, ocrResult),
        );
      })(),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (onCancel) args.signal?.removeEventListener("abort", onCancel);
  }
}
