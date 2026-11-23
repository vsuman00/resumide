import { z } from "zod";
import { detectPdfTextProfile } from "./pdf-detection";

const policyId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/u);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const imageId = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const maxPdfBytes = 10 * 1024 * 1024;
const binding = z.strictObject({
  ownerId: z.uuid(),
  analysisId: z.uuid(),
  sourceId: z.uuid(),
  sourceSha256: hash,
});
const workerRecord = z.strictObject({
  imageId,
  region: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/u),
  engine: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/+:-]{0,99}$/u),
  renderer: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/+:-]{0,99}$/u),
  languageData: z.string().regex(/^(?:model-bundle-)?sha256:[a-f0-9]{64}$/u),
});
const sourceRecord = binding.extend({
  kind: z.literal("synthetic_fixture"),
  state: z.literal("active"),
  retentionPolicyId: policyId,
  uploadBytes: z.number().int().positive(),
  nativePageTexts: z.array(z.string().max(200_000)).min(1).max(20),
});
const grantRecord = binding.extend({
  purpose: z.literal("local_document_evidence_review"),
  scope: z.literal("synthetic_engineering"),
  allowThirdPartyProcessing: z.literal(false),
  retentionPolicyId: policyId,
  worker: workerRecord,
  expiresAt: z.iso.datetime(),
  allocation: z.strictObject({
    maxUploadBytes: z.number().int().positive().max(maxPdfBytes),
    maxPages: z.number().int().positive().max(10),
    maxWallTimeMs: z.number().int().positive().max(10_000),
    maxCharacters: z.number().int().positive().max(200_000),
  }),
});

type Binding = z.infer<typeof binding>;
type WorkerRecord = z.infer<typeof workerRecord>;
type Denial =
  | "disabled"
  | "invalid_request"
  | "invalid_worker_record"
  | "source_binding"
  | "worker_binding"
  | "retention_policy"
  | "expired"
  | "resource_limit"
  | "ocr_not_needed";

function sameSource(a: Binding, b: Binding) {
  return (
    a.ownerId === b.ownerId &&
    a.analysisId === b.analysisId &&
    a.sourceId === b.sourceId &&
    a.sourceSha256 === b.sourceSha256
  );
}

function sameWorker(a: WorkerRecord, b: WorkerRecord) {
  return (
    a.imageId === b.imageId &&
    a.region === b.region &&
    a.engine === b.engine &&
    a.renderer === b.renderer &&
    a.languageData === b.languageData
  );
}

function deny(reason: Denial) {
  return { status: "denied", reason } as const;
}

/**
 * Offline review of independently loaded worker records. The authority argument
 * belongs to the server, never the request body. A passing result is a plan for
 * synthetic validation. It carries no lease, dispatch or persistence authority.
 */
export function prepareLocalOcrReview(
  input: unknown,
  authority?: {
    enabled: boolean;
    source: unknown;
    grant: unknown;
    worker: unknown;
    now: Date;
  },
) {
  if (authority?.enabled !== true) return deny("disabled");
  const request = binding.safeParse(input);
  if (!request.success) return deny("invalid_request");
  const source = sourceRecord.safeParse(authority.source);
  const grant = grantRecord.safeParse(authority.grant);
  const worker = workerRecord.safeParse(authority.worker);
  if (!source.success || !grant.success || !worker.success)
    return deny("invalid_worker_record");
  const now = z.date().safeParse(authority.now);
  if (!now.success) return deny("invalid_worker_record");
  if (
    !sameSource(request.data, source.data) ||
    !sameSource(request.data, grant.data)
  )
    return deny("source_binding");
  if (!sameWorker(worker.data, grant.data.worker))
    return deny("worker_binding");
  if (source.data.retentionPolicyId !== grant.data.retentionPolicyId)
    return deny("retention_policy");

  const remainingMs = Date.parse(grant.data.expiresAt) - now.data.getTime();
  if (remainingMs <= 0) return deny("expired");
  const { allocation } = grant.data;
  const pageTexts = source.data.nativePageTexts;
  const text = pageTexts.join("\n\n");
  if (
    source.data.uploadBytes > allocation.maxUploadBytes ||
    pageTexts.length > allocation.maxPages ||
    text.length > allocation.maxCharacters
  )
    return deny("resource_limit");

  const { pagesNeedingOcr } = detectPdfTextProfile({
    totalPages: pageTexts.length,
    text,
    pageTexts,
  });
  if (!pagesNeedingOcr.length) return deny("ocr_not_needed");
  return {
    status: "ready_for_synthetic_review",
    scope: {
      ...request.data,
      purpose: grant.data.purpose,
      retentionPolicyId: grant.data.retentionPolicyId,
      worker: worker.data,
      selectedPages: pagesNeedingOcr.map((pageNumber) => ({
        pageId: `page-${pageNumber}`,
        pageNumber,
      })),
      maxWallTimeMs: Math.min(allocation.maxWallTimeMs, remainingMs),
      scoringEligible: false,
    },
  } as const;
}
