import { z } from "zod";
import {
  NativeEvidenceSchema,
  type NativeEvidence,
} from "./native-evidence-schema";
import { OcrEvidenceSchema, type OcrEvidence } from "./ocr/selective";
import { CRITICAL_FIELDS, extractEvidenceFields } from "./evidence-fields";
import { extractEvidenceFields as extractLegacyFields } from "./evidence-fields-v1";
export const FIELD_EXTRACTOR_VERSION = "evidence-fields/1.0.1" as const;

const field = z.enum(CRITICAL_FIELDS);
const identifier = z.string().min(1).max(100);
const confidence = z.strictObject({
  kind: z.literal("uncalibrated"),
  value: z.null(),
});
const ContextSchema = z.strictObject({
  id: z.uuid(),
  ownerId: z.uuid(),
  analysisId: z.uuid(),
  sourceId: z.uuid(),
  inputSha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.iso.datetime(),
  retentionPolicyId: identifier,
});
export type DocumentEvidenceContext = z.infer<typeof ContextSchema>;
const box = z
  .strictObject({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    width: z.number().finite().positive().max(1),
    height: z.number().finite().positive().max(1),
  })
  .refine((value) => value.x + value.width <= 1 && value.y + value.height <= 1);
const span = z.strictObject({
  id: identifier,
  pageId: identifier,
  method: z.enum(["native_text", "local_ocr"]),
  text: z.string().max(200_000),
  start: z.number().int().nonnegative().max(200_000),
  end: z.number().int().nonnegative().max(200_000),
  box: box.nullable(),
  confidence,
});
const assertion = z.strictObject({
  id: identifier,
  field,
  value: z.string().min(1).max(500),
  evidence: z
    .array(
      z.strictObject({
        spanId: identifier,
        start: z.number().int().nonnegative().max(200_000),
        end: z.number().int().positive().max(200_000),
      }),
    )
    .min(1)
    .max(20),
  state: z.literal("review_required"),
  confidence,
});
const failure = z.strictObject({
  code: z.enum([
    "unsupported",
    "timeout",
    "cancelled",
    "resource_limit",
    "engine_failure",
    "invalid_request",
    "invalid_output",
  ]),
});
const blockers = z.enum([
  "uncalibrated_confidence",
  "missing_critical_fields",
  "conflicting_critical_fields",
  "missing_ocr_pages",
  "ocr_failure",
  "no_text",
]);
const Shape = ContextSchema.extend({
  schemaVersion: z.literal("evidence/2.0.0"),
  fieldExtractorVersion: z.literal(FIELD_EXTRACTOR_VERSION).optional(),
  nativeSource: NativeEvidenceSchema,
  ocrSource: OcrEvidenceSchema.nullable(),
  ocrFailure: failure.nullable(),
  status: z.enum(["review_required", "insufficient", "unsupported", "failed"]),
  scoringEligible: z.literal(false),
  confidence: z.strictObject({
    kind: z.literal("uncalibrated"),
    reason: z.literal("calibration_not_approved"),
  }),
  spans: z.array(span).min(1).max(20_000),
  assertions: z.array(assertion).max(1000),
  fields: z
    .array(
      z.strictObject({
        field,
        state: z.enum(["not_evaluated", "review_required", "conflict"]),
      }),
    )
    .length(8),
  blockers: z.array(blockers).min(1).max(6),
});

function project(
  context: DocumentEvidenceContext,
  native: NativeEvidence,
  ocr: OcrEvidence | null,
  ocrFailure: z.infer<typeof failure> | null,
  fieldExtractorVersion: typeof FIELD_EXTRACTOR_VERSION | undefined,
) {
  const nativeSpans = native.spans.map((source) => ({
    ...source,
    id: `native-${source.id}`,
    method: "native_text" as const,
    box: null,
    confidence: { kind: "uncalibrated" as const, value: null },
  }));
  const ocrSpans =
    ocr?.pages.flatMap((page) => {
      let cursor = 0;
      return page.text.split("\n").map((text, index) => {
        const start = cursor,
          end = start + Array.from(text).length;
        cursor = end + 1;
        const words = page.words.filter(
          (word) => word.start >= start && word.end <= end,
        );
        const left = Math.min(...words.map((word) => word.box.x));
        const top = Math.min(...words.map((word) => word.box.y));
        const right = Math.max(
          ...words.map((word) => word.box.x + word.box.width),
        );
        const bottom = Math.max(
          ...words.map((word) => word.box.y + word.box.height),
        );
        return {
          id: `ocr-${page.pageId}-line-${index + 1}`,
          pageId: page.pageId,
          text,
          start,
          end,
          method: "local_ocr" as const,
          box: words.length
            ? { x: left, y: top, width: right - left, height: bottom - top }
            : null,
          confidence: { kind: "uncalibrated" as const, value: null },
        };
      });
    }) ?? [];
  const spans = [...nativeSpans, ...ocrSpans];
  const assertions = fieldExtractorVersion
    ? extractEvidenceFields(spans)
    : extractLegacyFields(spans);
  const fields = CRITICAL_FIELDS.map((field) => {
    const values = new Set(
      assertions
        .filter((item) => item.field === field)
        .map((item) => item.value),
    );
    return {
      field,
      state:
        values.size > 1
          ? ("conflict" as const)
          : values.size
            ? ("review_required" as const)
            : ("not_evaluated" as const),
    };
  });
  const missingPages = native.pages.filter(
    (page) =>
      page.text.replace(/\s/gu, "").length < 8 &&
      !ocr?.pages.some((item) => item.pageNumber === page.pageNumber),
  );
  const warnings: z.infer<typeof blockers>[] = ["uncalibrated_confidence"];
  if (fields.some((item) => item.state === "not_evaluated"))
    warnings.push("missing_critical_fields");
  if (fields.some((item) => item.state === "conflict"))
    warnings.push("conflicting_critical_fields");
  if (missingPages.length) warnings.push("missing_ocr_pages");
  if (ocrFailure) warnings.push("ocr_failure");
  const hasText = spans.some((item) => item.text.trim());
  if (!hasText) warnings.push("no_text");
  const status = ocrFailure
    ? ocrFailure.code === "unsupported"
      ? ("unsupported" as const)
      : ("failed" as const)
    : hasText
      ? ("review_required" as const)
      : ("insufficient" as const);
  return {
    ...context,
    schemaVersion: "evidence/2.0.0" as const,
    ...(fieldExtractorVersion ? { fieldExtractorVersion } : {}),
    nativeSource: native,
    ocrSource: ocr,
    ocrFailure,
    status,
    scoringEligible: false as const,
    confidence: {
      kind: "uncalibrated" as const,
      reason: "calibration_not_approved" as const,
    },
    spans,
    assertions,
    fields,
    blockers: warnings,
  };
}

export const DocumentEvidenceSchema = Shape.superRefine((value, validation) => {
  const ocr = value.ocrSource;
  const context = ContextSchema.parse({
    id: value.id,
    ownerId: value.ownerId,
    analysisId: value.analysisId,
    sourceId: value.sourceId,
    inputSha256: value.inputSha256,
    createdAt: value.createdAt,
    retentionPolicyId: value.retentionPolicyId,
  });
  const bound =
    !ocr ||
    (ocr.request.ownerId === context.ownerId &&
      ocr.request.analysisId === context.analysisId &&
      ocr.request.sourceId === context.sourceId &&
      ocr.request.sourceSha256 === context.inputSha256 &&
      JSON.stringify(ocr.request.nativePageTexts) ===
        JSON.stringify(value.nativeSource.pages.map((page) => page.text)));
  const expected = Shape.safeParse(
    project(
      context,
      value.nativeSource,
      ocr,
      value.ocrFailure,
      value.fieldExtractorVersion,
    ),
  );
  if (
    !bound ||
    (ocr && value.ocrFailure) ||
    !expected.success ||
    JSON.stringify(value) !== JSON.stringify(expected.data)
  )
    validation.addIssue({
      code: "custom",
      message:
        "Evidence contradicts its immutable source, provenance or review policy",
    });
});
export type DocumentEvidence = z.infer<typeof DocumentEvidenceSchema>;

export function reconcileDocumentEvidence(
  context: unknown,
  nativeSource: unknown,
  ocrSource: unknown = null,
  ocrFailure: unknown = null,
): DocumentEvidence {
  return DocumentEvidenceSchema.parse(
    project(
      ContextSchema.parse(context),
      NativeEvidenceSchema.parse(nativeSource),
      ocrSource === null ? null : OcrEvidenceSchema.parse(ocrSource),
      ocrFailure === null ? null : failure.parse(ocrFailure),
      FIELD_EXTRACTOR_VERSION,
    ),
  );
}
