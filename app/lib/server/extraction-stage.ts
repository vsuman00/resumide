import { createHash, randomUUID } from "node:crypto";
import { getAnalysisConfig } from "./config";
import {
  assertResumeSource,
  extractResumeText,
  ResumeExtractionError,
  type ResumeExtractionErrorCode,
} from "./extract";
import {
  DEFAULT_OCR_RUNTIME,
  resolveOcr,
  type OcrFailureReason,
  type OcrRuntime,
} from "./ocr/adapter";
import {
  detectPdfTextProfile,
  extractPdfTextLayers,
  type PdfTextExtraction,
} from "./ocr/pdf-detection";
import { createResumeStorage } from "./storage";
import { buildNativeEvidence } from "./native-evidence";
import { createSupabaseAdminClient } from "./supabase";
import { NativeLayoutSchema } from "../native-layout-schema";

import { extractDocumentForReviewWithMetadata } from "./document-extraction";
import {
  AnalysisStageFenceError,
  assertAnalysisStageActive,
  assertAnalysisStageLease,
  persistAnalysisStage,
  type AnalysisStageOptions,
} from "./analysis-stage-fence";

const EXTRACTOR_VERSION = "unpdf-v1";

type ResumeExtractor = typeof extractResumeText;
type PdfLayerExtractor = typeof extractPdfTextLayers;

export type ExtractionFailureCode =
  ResumeExtractionErrorCode | "OVERSIZED" | "TIMEOUT";

export class ExtractionStageFailure extends Error {
  readonly code: ExtractionFailureCode;

  constructor(code: ExtractionFailureCode) {
    super(code);
    this.name = "ExtractionStageFailure";
    this.code = code;
  }
}

export class OcrRequiredError extends Error {
  readonly reason: OcrFailureReason;

  constructor(reason: OcrFailureReason, warning: string) {
    super(warning);
    this.name = "OcrRequiredError";
    this.reason = reason;
  }
}

export function extractionFailureStatus(
  error: unknown,
): "needs_ocr" | "failed" | null {
  if (error instanceof ResumeExtractionError) {
    return error.code === "EMPTY_TEXT" ? "needs_ocr" : "failed";
  }
  if (error instanceof OcrRequiredError) return "needs_ocr";
  if (error instanceof ExtractionStageFailure) {
    return "failed";
  }
  return null;
}

export async function extractPdfForAnalysis(
  args: {
    bytes: Uint8Array;
    maxBytes: number;
    maxPages: number;
    maxCharacters: number;
    timeoutMs: number;
    includeLayout?: boolean;
  },
  extractor: PdfLayerExtractor = extractPdfTextLayers,
  ocrRuntime: OcrRuntime = DEFAULT_OCR_RUNTIME,
) {
  if (args.bytes.byteLength > args.maxBytes) {
    throw new ExtractionStageFailure("OVERSIZED");
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const startedAt = performance.now();
  const controller = new AbortController();
  try {
    return await Promise.race([
      (async () => {
        const extracted = await extractor(args.bytes, {
          maxPages: args.maxPages,
          maxCharacters: args.maxCharacters,
          includeLayout: args.includeLayout,
          signal: controller.signal,
        });
        const remainingMs = args.timeoutMs - (performance.now() - startedAt);
        if (controller.signal.aborted || remainingMs <= 0) {
          throw new ExtractionStageFailure("TIMEOUT");
        }
        const result = await resolveExtraction(
          extracted,
          args,
          {
            ...ocrRuntime,
            policy: {
              ...ocrRuntime.policy,
              timeoutMs: Math.min(ocrRuntime.policy.timeoutMs, remainingMs),
            },
          },
          startedAt,
          controller.signal,
        );
        if (
          controller.signal.aborted ||
          performance.now() - startedAt >= args.timeoutMs
        ) {
          throw new ExtractionStageFailure("TIMEOUT");
        }
        return result;
      })(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new ExtractionStageFailure("TIMEOUT"));
        }, args.timeoutMs);
        timeout.unref?.();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function resolveExtraction(
  extracted: PdfTextExtraction,
  args: { bytes: Uint8Array; maxCharacters: number },
  ocrRuntime: OcrRuntime,
  startedAt: number,
  signal: AbortSignal,
) {
  const profile = detectPdfTextProfile(extracted);
  let text = extracted.text;
  let pageTexts = extracted.pageTexts;
  let extractorVersion = EXTRACTOR_VERSION;
  const warnings: string[] = [];

  if (profile.documentType !== "text") {
    const ocr = await resolveOcr(
      { bytes: args.bytes, pageCount: extracted.totalPages, signal },
      ocrRuntime,
    );
    if (ocr.status === "needs_ocr") {
      throw new OcrRequiredError(
        ocr.reason,
        warningForOcrRequirement(profile.documentType, ocr.reason),
      );
    }
    text = ocr.text;
    pageTexts = ocr.pageTexts;
    extractorVersion = ocr.adapterVersion;
    warnings.push(
      profile.documentType === "scanned"
        ? "OCR was used because no usable PDF text layer was detected."
        : `OCR was used for PDF pages ${profile.pagesNeedingOcr.join(", ")}.`,
    );
  }
  if (text.length > args.maxCharacters) {
    throw new ResumeExtractionError("TEXT_LIMIT");
  }
  if (text.trim().length === 0) {
    throw new OcrRequiredError(
      "low_confidence",
      "The PDF text could not be read reliably; OCR is required before scoring.",
    );
  }

  return {
    totalPages: extracted.totalPages,
    text,
    pageTexts,
    textChecksum: createHash("sha256").update(text).digest("hex"),
    warnings,
    durationMs: Math.round(performance.now() - startedAt),
    extractorVersion,
    // OCR replaces the source text, so native offsets must not be attached to it.
    ...(extractorVersion === EXTRACTOR_VERSION && extracted.nativeLayout
      ? { nativeLayout: extracted.nativeLayout }
      : {}),
  };
}

function warningForOcrRequirement(
  documentType: "scanned" | "mixed",
  reason: OcrFailureReason,
) {
  const type = documentType === "scanned" ? "scanned" : "mixed text-layer";
  if (reason === "unsupported") {
    return `This ${type} PDF cannot be scored because OCR is not approved for this workspace.`;
  }
  return `This ${type} PDF requires OCR before scoring (${reason.replaceAll("_", " ")}).`;
}

export async function extractBoundedInput(
  args: {
    bytes: Uint8Array;
    maxBytes: number;
    maxPages: number;
    maxCharacters: number;
    timeoutMs: number;
  },
  extractor: ResumeExtractor = extractResumeText,
) {
  if (args.bytes.byteLength > args.maxBytes) {
    throw new ExtractionStageFailure("OVERSIZED");
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const startedAt = performance.now();
  try {
    const extracted = await Promise.race([
      extractor(args.bytes, {
        maxPages: args.maxPages,
        maxCharacters: args.maxCharacters,
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new ExtractionStageFailure("TIMEOUT")),
          args.timeoutMs,
        );
        timeout.unref?.();
      }),
    ]);

    return {
      ...extracted,
      pageTexts: extracted.pageTexts ?? [extracted.text],
      textChecksum: createHash("sha256").update(extracted.text).digest("hex"),
      warnings: extracted.totalPages > 2 ? ["Resume exceeds two pages."] : [],
      durationMs: Math.round(performance.now() - startedAt),
      extractorVersion: EXTRACTOR_VERSION,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function transition(
  analysisId: string,
  expected: string,
  next: string,
  processId: string,
  requestId: string,
  options: AnalysisStageOptions,
) {
  const { data, error } = await persistAnalysisStage(
    createSupabaseAdminClient(),
    analysisId,
    "transition_analysis",
    {
      p_analysis_id: analysisId,
      p_expected_status: expected,
      p_next_status: next,
      p_actor_id: null,
      p_process_id: processId,
      p_request_id: requestId,
    },
    options,
  );
  if (error || data !== true) throw new Error("Analysis transition failed.");
}

export async function processExtractionStage(
  analysisId: string,
  options: AnalysisStageOptions = {},
): Promise<void> {
  assertAnalysisStageActive(options);
  const admin = createSupabaseAdminClient();
  await assertAnalysisStageLease(admin, analysisId, options);
  const processId = `extractor-${randomUUID()}`;
  const requestId = `worker-${randomUUID()}`;
  const { data, error } = await admin
    .from("analyses")
    .select(
      "status, owner_id, resume_versions(id, checksum, storage_key, organization_id)",
    )
    .eq("id", analysisId)
    .single();
  assertAnalysisStageActive(options);
  if (error || !data) throw new Error("Analysis input is unavailable.");

  let status = data.status;
  if (status === "quarantined") {
    await transition(
      analysisId,
      "quarantined",
      "queued",
      processId,
      requestId,
      options,
    );
    status = "queued";
  }
  if (status === "queued") {
    await transition(
      analysisId,
      "queued",
      "extracting",
      processId,
      requestId,
      options,
    );
    status = "extracting";
  }
  if (status !== "extracting") {
    return;
  }

  const version = Array.isArray(data.resume_versions)
    ? data.resume_versions[0]
    : data.resume_versions;
  if (!version) throw new Error("Resume version is unavailable.");

  try {
    await assertAnalysisStageLease(admin, analysisId, options);
    const bytes = await createResumeStorage().download(version.storage_key);
    await assertAnalysisStageLease(admin, analysisId, options);
    const config = getAnalysisConfig();
    if (config.EVIDENCE_REVIEW_ENABLED) {
      const { envelope, pageCount } =
        await extractDocumentForReviewWithMetadata({
          bytes,
          context: {
            id: randomUUID(),
            ownerId: data.owner_id,
            analysisId,
            sourceId: version.id,
            inputSha256: version.checksum,
            createdAt: new Date().toISOString(),
            retentionPolicyId: "resume-retention-v1",
          },
          maxBytes: config.MAX_UPLOAD_BYTES,
          maxPages: config.MAX_PDF_PAGES,
          maxCharacters: config.MAX_EXTRACTED_CHARACTERS,
          timeoutMs: config.EXTRACTION_TIMEOUT_MS,
          signal: options.signal,
          assertOcrAdmission: async () => {
            if (!options.lease)
              throw new AnalysisStageFenceError("ANALYSIS_FENCE_REQUIRED");
            await assertAnalysisStageLease(admin, analysisId, options);
          },
        });
      assertAnalysisStageActive(options);
      const { data: persisted, error: persistError } =
        await persistAnalysisStage(
          admin,
          analysisId,
          "persist_document_evidence",
          {
            p_analysis_id: analysisId,
            p_envelope: envelope,
            p_page_count: pageCount,
            p_process_id: processId,
            p_request_id: requestId,
          },
          options,
        );
      if (persistError || persisted !== true)
        throw new Error("Document evidence persistence failed.");
      return;
    }
    assertResumeSource(bytes, config.MAX_UPLOAD_BYTES, version.checksum);
    const extracted = await extractPdfForAnalysis({
      bytes,
      maxBytes: config.MAX_UPLOAD_BYTES,
      maxPages: config.MAX_PDF_PAGES,
      maxCharacters: config.MAX_EXTRACTED_CHARACTERS,
      timeoutMs: config.EXTRACTION_TIMEOUT_MS,
      includeLayout: config.NATIVE_LAYOUT_ENABLED,
    });
    assertAnalysisStageActive(options);
    const { data: persisted, error: persistError } = await persistAnalysisStage(
      admin,
      analysisId,
      config.NATIVE_LAYOUT_ENABLED
        ? "persist_native_layout_extraction"
        : "persist_analysis_extraction",
      {
        p_analysis_id: analysisId,
        p_duration_ms: extracted.durationMs,
        p_extracted_text: extracted.text,
        p_extractor_version: extracted.extractorVersion,
        p_page_count: extracted.totalPages,
        p_page_texts: extracted.pageTexts,
        p_process_id: processId,
        p_request_id: requestId,
        p_text_checksum: extracted.textChecksum,
        p_warnings: extracted.warnings,
        ...(config.NATIVE_EVIDENCE_ENABLED || config.NATIVE_LAYOUT_ENABLED
          ? {
              p_evidence_graph:
                extracted.extractorVersion === EXTRACTOR_VERSION
                  ? buildNativeEvidence(extracted.pageTexts)
                  : null,
            }
          : {}),
        ...(config.NATIVE_LAYOUT_ENABLED
          ? {
              p_native_layout: extracted.nativeLayout
                ? NativeLayoutSchema.parse(extracted.nativeLayout)
                : null,
            }
          : {}),
      },
      options,
    );
    if (persistError || persisted !== true) {
      throw new Error("Extraction persistence failed.");
    }
  } catch (caught) {
    assertAnalysisStageActive(options);
    const failureStatus = extractionFailureStatus(caught);
    if (failureStatus) {
      await transition(
        analysisId,
        "extracting",
        failureStatus,
        processId,
        requestId,
        options,
      );
      return;
    }
    throw caught;
  }
}
