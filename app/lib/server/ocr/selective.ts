import { z } from "zod";
import { detectPdfTextProfile } from "./pdf-detection";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().min(1).max(100);
const allocationSchema = z.strictObject({
  id: identifier,
  maxWallTimeMs: z.number().int().positive().max(10_000),
  maxPages: z.number().int().positive().max(10),
  externalApiFeeMicros: z.literal(0),
});
export const SelectiveOcrRequestSchema = z
  .strictObject({
    schemaVersion: z.literal("selective-ocr-request-v1"),
    attemptId: z.uuid(),
    ownerId: z.uuid(),
    analysisId: z.uuid(),
    sourceId: z.uuid(),
    createdAt: z.iso.datetime(),
    retentionPolicyId: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/),
    sourceSha256: sha256,
    nativePageTexts: z.array(z.string().max(200_000)).min(1).max(20),
    selectedPages: z
      .array(
        z.strictObject({
          pageId: identifier,
          pageNumber: z.number().int().positive().max(20),
        }),
      )
      .max(10),
    remainingDeadlineMs: z.number().int().positive().max(30_000),
    limits: z.strictObject({
      maxCharacters: z.number().int().positive().max(200_000),
      maxPages: z.number().int().positive().max(20),
    }),
    allocation: allocationSchema,
    policy: z.strictObject({
      executionMode: z.literal("self_hosted"),
      purpose: z.literal("synthetic_local_test"),
      allowThirdPartyProcessing: z.literal(false),
    }),
  })
  .superRefine((request, context) => {
    const profile = detectPdfTextProfile({
      totalPages: request.nativePageTexts.length,
      text: request.nativePageTexts.join("\n\n"),
      pageTexts: request.nativePageTexts,
    });
    const valid =
      request.nativePageTexts.join("\n\n").length <=
        request.limits.maxCharacters &&
      request.nativePageTexts.length <= request.limits.maxPages &&
      request.selectedPages.length <= request.allocation.maxPages &&
      request.selectedPages.length === profile.pagesNeedingOcr.length &&
      request.selectedPages.every(
        (page, index) =>
          page.pageNumber === profile.pagesNeedingOcr[index] &&
          page.pageId === `page-${page.pageNumber}`,
      );
    if (!valid)
      context.addIssue({
        code: "custom",
        message: "Selection contradicts the bounded native page profile",
      });
  });
export type SelectiveOcrRequest = z.infer<typeof SelectiveOcrRequestSchema>;
const versionSchema = z.strictObject({
  engine: identifier,
  renderer: identifier,
  languageData: identifier,
});
const boxSchema = z
  .strictObject({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    width: z.number().finite().positive().max(1),
    height: z.number().finite().positive().max(1),
  })
  .refine(
    (box) => box.x + box.width <= 1 && box.y + box.height <= 1,
    "OCR box lies outside its rendered page",
  );
const rawWordSchema = z.strictObject({
  text: z.string().min(1).max(200_000).regex(/^\S+$/u),
  start: z.number().int().nonnegative().max(200_000),
  end: z.number().int().nonnegative().max(200_000),
  box: boxSchema,
  confidence: z.number().finite().min(0).max(100),
});
const rawPageSchema = z.strictObject({
  pageNumber: z.number().int().positive().max(20),
  pageId: identifier,
  imageSha256: sha256,
  widthPixels: z.number().int().positive().max(10_000_000),
  heightPixels: z.number().int().positive().max(10_000_000),
  rotation: z.number().int().min(0).max(359),
  text: z.string().max(200_000),
  words: z.array(rawWordSchema).max(10_000),
});
const memoryPeakBase = z.strictObject({
  kind: z.literal("cgroup_v2_memory_peak"),
  measuredThrough: z.literal("recognition_complete"),
});
const memoryPeakSchema = z.union([
  memoryPeakBase.extend({
    valueBytes: z.number().int().positive(),
    reason: z.null(),
  }),
  memoryPeakBase.extend({
    valueBytes: z.null(),
    reason: z.enum([
      "cgroup_scope_unverified",
      "cgroup_peak_invalid",
      "cgroup_files_unavailable",
    ]),
  }),
]);
const resourceUsageSchema = z.strictObject({
  kind: z.literal("child_process_rusage"),
  cpuTimeMs: z.number().finite().nonnegative().max(30_000),
  // Linux RUSAGE_CHILDREN reports the largest individual child, not container peak.
  maxChildRssBytes: z.number().int().positive().max(1_073_741_824),
  rendererCalls: z.number().int().positive().max(10),
  recognitionCalls: z.number().int().positive().max(10),
  // Optional for compatibility with earlier reviewed images; never infer it from RSS.
  containerMemoryPeak: memoryPeakSchema.optional(),
});
const rawSchema = z.strictObject({
  durationMs: z.number().finite().nonnegative().max(30_000),
  pages: z.array(rawPageSchema).min(1).max(10),
  resourceUsage: resourceUsageSchema.optional(),
});
export type LocalOcrRawResult = z.infer<typeof rawSchema>;
export interface LocalOcrAdapter {
  versions: z.infer<typeof versionSchema>;
  recognize(
    request: SelectiveOcrRequest,
    signal: AbortSignal,
  ): Promise<LocalOcrRawResult>;
}
export type LocalOcrFailureCode =
  "timeout" | "cancelled" | "resource_limit" | "engine_failure";
const failureCodeSchema = z.enum([
  "timeout",
  "cancelled",
  "resource_limit",
  "engine_failure",
]);
export class LocalOcrExecutionError extends Error {
  constructor(public readonly code: LocalOcrFailureCode) {
    super(code);
  }
}

function grounded(page: {
  text: string;
  words: { text: string; start: number; end: number }[];
}) {
  const chars = Array.from(page.text);
  let cursor = 0;
  for (const word of page.words) {
    if (
      word.start < cursor ||
      word.end <= word.start ||
      word.end > chars.length ||
      /\S/u.test(chars.slice(cursor, word.start).join("")) ||
      chars.slice(word.start, word.end).join("") !== word.text
    )
      return false;
    cursor = word.end;
  }
  return !/\S/u.test(chars.slice(cursor).join(""));
}
const evidenceWordSchema = rawWordSchema.omit({ confidence: true }).extend({
  confidence: z.strictObject({
    kind: z.literal("uncalibrated"),
    scale: z.literal("tesseract_0_100"),
    value: z.number().finite().min(0).max(100),
  }),
});
export const OcrEvidenceSchema = z
  .strictObject({
    schemaVersion: z.literal("ocr-evidence-v1"),
    request: SelectiveOcrRequestSchema,
    provider: z.strictObject({
      name: z.literal("tesseract"),
      executionMode: z.literal("self_hosted"),
      executionLocation: z.literal("local_host"),
      physicalRegion: z.strictObject({
        value: z.null(),
        reason: z.literal("not_verified"),
      }),
      versions: versionSchema,
    }),
    status: z.enum(["review_required", "insufficient"]),
    scoringEligible: z.literal(false),
    offsetUnit: z.literal("unicode_code_point"),
    coordinateSystem: z.literal("normalized_top_left"),
    durationMs: z.number().finite().nonnegative().max(30_000),
    measuredWallTimeMs: z.number().finite().nonnegative().max(30_000),
    resourceUsage: resourceUsageSchema.optional(),
    cost: z.strictObject({
      apiFeeMicros: z.literal(0),
      compute: z.strictObject({
        status: z.literal("unknown"),
        valueMicros: z.null(),
        reason: z.literal("host_rate_unavailable"),
      }),
      boundedAllocation: allocationSchema,
      attempts: z.literal(1),
    }),
    pages: z
      .array(
        rawPageSchema.omit({ words: true }).extend({
          words: z.array(evidenceWordSchema).max(10_000),
          dimensionUnit: z.literal("pixel"),
          method: z.literal("local_ocr"),
        }),
      )
      .min(1)
      .max(10),
  })
  .superRefine((value, context) => {
    const budget = Math.min(
      value.request.remainingDeadlineMs,
      value.request.allocation.maxWallTimeMs,
    );
    const valid =
      (!value.resourceUsage ||
        (value.resourceUsage.rendererCalls === value.pages.length &&
          value.resourceUsage.recognitionCalls === value.pages.length)) &&
      value.pages.length === value.request.selectedPages.length &&
      value.pages.every(
        (page, index) =>
          page.pageNumber === value.request.selectedPages[index].pageNumber &&
          page.pageId === value.request.selectedPages[index].pageId &&
          page.widthPixels * page.heightPixels <= 10_000_000 &&
          grounded(page),
      ) &&
      value.pages.reduce(
        (sum, page) => sum + page.widthPixels * page.heightPixels,
        0,
      ) <= 100_000_000 &&
      value.request.nativePageTexts.join("\n\n").length +
        value.pages.map((page) => page.text).join("\n\n").length <=
        value.request.limits.maxCharacters &&
      value.durationMs <= budget &&
      value.measuredWallTimeMs <= budget &&
      JSON.stringify(value.cost.boundedAllocation) ===
        JSON.stringify(value.request.allocation) &&
      value.status ===
        (value.pages.some((page) => /\S/u.test(page.text))
          ? "review_required"
          : "insufficient");
    if (!valid)
      context.addIssue({
        code: "custom",
        message:
          "OCR evidence contradicts its source selection, bounds or text",
      });
  });
export type OcrEvidence = z.infer<typeof OcrEvidenceSchema>;
export type SelectiveOcrOutcome =
  | OcrEvidence
  | { status: "not_needed"; request: SelectiveOcrRequest }
  | {
      status: "failed";
      code: LocalOcrFailureCode | "invalid_request" | "invalid_output";
      attemptId: string | null;
    };

/** Engineering-only orchestration. Callers authorize owner/source and adapters
 * verify actual PDF bytes against sourceSha256. Runtime abort must additionally
 * kill owned subprocesses and clean scratch; promise settlement is not proof.
 */
export async function runSelectiveLocalOcr(
  input: unknown,
  adapter: LocalOcrAdapter,
  signal?: AbortSignal,
): Promise<SelectiveOcrOutcome> {
  const parsed = SelectiveOcrRequestSchema.safeParse(input);
  if (!parsed.success)
    return { status: "failed", code: "invalid_request", attemptId: null };
  const request = parsed.data;
  const failed = (
    code: LocalOcrFailureCode | "invalid_output",
  ): SelectiveOcrOutcome => ({
    status: "failed",
    code,
    attemptId: request.attemptId,
  });
  if (signal?.aborted) return failed("cancelled");
  if (!request.selectedPages.length) return { status: "not_needed", request };
  const versions = versionSchema.safeParse(adapter.versions);
  if (!versions.success) return failed("invalid_output");
  const controller = new AbortController();
  const timeoutMs = Math.min(
    request.remainingDeadlineMs,
    request.allocation.maxWallTimeMs,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const started = performance.now();
  try {
    const abort = new Promise<never>((_resolve, reject) => {
      cancel = () => {
        controller.abort();
        reject(new LocalOcrExecutionError("cancelled"));
      };
      signal?.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(() => {
        controller.abort();
        reject(new LocalOcrExecutionError("timeout"));
      }, timeoutMs);
    });
    const raw = await Promise.race([
      adapter.recognize(structuredClone(request), controller.signal),
      abort,
    ]);
    const measuredWallTimeMs = performance.now() - started;
    if (measuredWallTimeMs > timeoutMs) {
      controller.abort();
      return failed("timeout");
    }
    const result = rawSchema.safeParse(raw);
    if (!result.success) return failed("invalid_output");
    const evidence = OcrEvidenceSchema.safeParse({
      schemaVersion: "ocr-evidence-v1",
      request,
      provider: {
        name: "tesseract",
        executionMode: "self_hosted",
        executionLocation: "local_host",
        physicalRegion: { value: null, reason: "not_verified" },
        versions: versions.data,
      },
      status: result.data.pages.some((page) => /\S/u.test(page.text))
        ? "review_required"
        : "insufficient",
      scoringEligible: false,
      offsetUnit: "unicode_code_point",
      coordinateSystem: "normalized_top_left",
      durationMs: result.data.durationMs,
      measuredWallTimeMs,
      ...(result.data.resourceUsage
        ? { resourceUsage: result.data.resourceUsage }
        : {}),
      cost: {
        apiFeeMicros: 0,
        compute: {
          status: "unknown",
          valueMicros: null,
          reason: "host_rate_unavailable",
        },
        boundedAllocation: request.allocation,
        attempts: 1,
      },
      pages: result.data.pages.map((page) => ({
        ...page,
        dimensionUnit: "pixel",
        method: "local_ocr",
        words: page.words.map((word) => ({
          ...word,
          confidence: {
            kind: "uncalibrated",
            scale: "tesseract_0_100",
            value: word.confidence,
          },
        })),
      })),
    });
    return evidence.success ? evidence.data : failed("invalid_output");
  } catch (error) {
    const code =
      error instanceof LocalOcrExecutionError
        ? failureCodeSchema.safeParse(error.code)
        : null;
    return failed(code?.success ? code.data : "engine_failure");
  } finally {
    if (timer) clearTimeout(timer);
    if (cancel) signal?.removeEventListener("abort", cancel);
  }
}
