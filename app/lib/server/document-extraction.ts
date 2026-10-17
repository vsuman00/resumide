import { createHash } from "node:crypto";
import {
  extractPdfTextLayers,
  detectPdfTextProfile,
} from "./ocr/pdf-detection";
import { buildNativeEvidence } from "./native-evidence";
import {
  reconcileDocumentEvidence,
  type DocumentEvidenceContext,
} from "./document-evidence";
import {
  runSelectiveLocalOcr,
  type LocalOcrAdapter,
  type SelectiveOcrRequest,
} from "./ocr/selective";

/** Production callers supply no OCR adapter. Synthetic tests explicitly supply
 * the approved local request; source bytes and every request binding are checked. */
export async function extractDocumentForReview(
  args: {
    bytes: Uint8Array;
    context: DocumentEvidenceContext;
    maxBytes: number;
    maxPages: number;
    maxCharacters: number;
    timeoutMs: number;
    syntheticOcr?: { adapter: LocalOcrAdapter; request: SelectiveOcrRequest };
  },
  extractor = extractPdfTextLayers,
) {
  if (args.bytes.byteLength > args.maxBytes)
    throw new Error("Document exceeds byte limit");
  if (
    createHash("sha256").update(args.bytes).digest("hex") !==
    args.context.inputSha256
  )
    throw new Error("Document checksum mismatch");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const layers = await extractor(args.bytes, {
          maxPages: args.maxPages,
          maxCharacters: args.maxCharacters,
        });
        if (controller.signal.aborted)
          throw new Error("Document extraction timeout");
        const native = buildNativeEvidence(layers.pageTexts);
        const profile = detectPdfTextProfile(layers);
        if (!profile.pagesNeedingOcr.length)
          return reconcileDocumentEvidence(args.context, native);
        if (!args.syntheticOcr)
          return reconcileDocumentEvidence(args.context, native, null, {
            code: "unsupported",
          });
        const { request, adapter } = args.syntheticOcr;
        if (
          request.ownerId !== args.context.ownerId ||
          request.analysisId !== args.context.analysisId ||
          request.sourceId !== args.context.sourceId ||
          request.sourceSha256 !== args.context.inputSha256 ||
          JSON.stringify(request.nativePageTexts) !==
            JSON.stringify(layers.pageTexts)
        )
          throw new Error("OCR request source mismatch");
        const result = await runSelectiveLocalOcr(
          request,
          adapter,
          controller.signal,
        );
        if (result.status === "not_needed")
          throw new Error("OCR selection mismatch");
        return result.status === "failed"
          ? reconcileDocumentEvidence(args.context, native, null, {
              code: result.code,
            })
          : reconcileDocumentEvidence(args.context, native, result);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Document extraction timeout"));
        }, args.timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
