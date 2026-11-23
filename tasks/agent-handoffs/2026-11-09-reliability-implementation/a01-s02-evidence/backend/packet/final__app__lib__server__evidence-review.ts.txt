import { z } from "zod";
import { DocumentEvidenceSchema } from "./document-evidence";
import { CRITICAL_FIELDS } from "./evidence-fields";
import {
  deriveEvidenceReviewTargets,
  EVIDENCE_TARGET_MODEL_VERSION,
} from "./evidence-targets";
import { deriveNativePageDiagnostics } from "./ocr/pdf-detection";
import type { createSupabaseAdminClient } from "./supabase";

export type EvidenceReviewClient = Pick<
  ReturnType<typeof createSupabaseAdminClient>,
  "from" | "rpc"
>;
export class EvidenceReviewError extends Error {
  constructor(
    readonly status: 404 | 409 | 422 | 503,
    message: string,
  ) {
    super(message);
  }
}
const uuid = z.uuid();
const attemptSchema = z.object({
  id: uuid,
  analysis_id: uuid,
  owner_id: uuid,
  resume_version_id: uuid,
  input_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  attempt_number: z.number().int().positive(),
  envelope: z.unknown(),
});
const correctionSchema = z.object({
  id: uuid,
  attempt_id: uuid,
  analysis_id: uuid,
  owner_id: uuid,
  actor_id: uuid,
  revision: z.number().int().positive(),
  expected_revision: z.number().int().nonnegative(),
  field: z.enum(CRITICAL_FIELDS),
  operation: z.enum(["confirm", "correct"]),
  value: z.string().trim().min(1).max(2000),
  candidate_id: z.string().min(1).max(100).nullable(),
  created_at: z.iso.datetime({ offset: true }),
});
const HISTORY_READ_LIMITS = {
  events: 1000,
  pageSize: 100,
  pages: 32,
  valueTextUnits: 2_000_000,
  deadlineMs: 5000,
};
export const EvidenceHistoryAttestationSchema = z
  .strictObject({
    schemaVersion: z.literal("evidence-review-history/1.0.0"),
    state: z.literal("complete_captured_prefix"),
    binding: z.strictObject({
      ownerId: uuid,
      analysisId: uuid,
      sourceId: uuid,
      inputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
      attemptId: uuid,
      evidenceSchemaVersion: z.literal("evidence/2.0.0"),
      fieldExtractorVersion: z.string().min(1).max(100).nullable(),
      targetModelVersion: z.literal(EVIDENCE_TARGET_MODEL_VERSION),
    }),
    highWaterRevision: z
      .number()
      .int()
      .nonnegative()
      .max(HISTORY_READ_LIMITS.events),
    highWaterEventId: uuid.nullable(),
    receivedCount: z
      .number()
      .int()
      .nonnegative()
      .max(HISTORY_READ_LIMITS.events),
    pageCount: z.number().int().nonnegative().max(HISTORY_READ_LIMITS.pages),
  })
  .superRefine((value, context) => {
    if (
      value.receivedCount !== value.highWaterRevision ||
      (value.highWaterRevision === 0) !== (value.highWaterEventId === null) ||
      (value.highWaterRevision === 0) !== (value.pageCount === 0) ||
      value.pageCount > value.receivedCount ||
      value.receivedCount > value.pageCount * HISTORY_READ_LIMITS.pageSize
    )
      context.addIssue({
        code: "custom",
        message: "History attestation contradicts its captured prefix",
      });
  });
export type EvidenceHistoryAttestation = z.infer<
  typeof EvidenceHistoryAttestationSchema
>;
export const EvidenceCorrectionInputSchema = z
  .strictObject({
    attemptId: uuid,
    expectedRevision: z.number().int().nonnegative().max(2147483646),
    field: z.enum(CRITICAL_FIELDS),
    operation: z.enum(["confirm", "correct"]),
    value: z
      .string()
      .min(1)
      .max(500)
      .refine((value) => value === value.trim()),
    candidateId: z.string().min(1).max(100).nullable(),
    idempotencyKey: uuid,
  })
  .superRefine((input, context) => {
    if ((input.operation === "confirm") !== (input.candidateId !== null))
      context.addIssue({
        code: "custom",
        message: "Confirm an exact candidate or submit a separate correction",
      });
  });
export type EvidenceCorrectionInput = z.infer<
  typeof EvidenceCorrectionInputSchema
>;

async function requireOwnedAnalysis(
  client: EvidenceReviewClient,
  analysisId: string,
  ownerId: string,
  signal?: AbortSignal,
) {
  if (!uuid.safeParse(analysisId).success || !uuid.safeParse(ownerId).success)
    throw new EvidenceReviewError(404, "Evidence not found.");
  const query = client
    .from("analyses")
    .select("id, owner_id, resume_version_id")
    .eq("id", analysisId)
    .eq("owner_id", ownerId);
  if (signal) query.abortSignal(signal);
  const { data, error } = await query.maybeSingle();
  if (error)
    throw new EvidenceReviewError(
      503,
      "Evidence is unavailable. Try again later.",
    );
  const parsed = z
    .object({ id: uuid, owner_id: uuid, resume_version_id: uuid })
    .safeParse(data);
  if (
    !parsed.success ||
    parsed.data.id !== analysisId ||
    parsed.data.owner_id !== ownerId
  )
    throw new EvidenceReviewError(404, "Evidence not found.");
  return parsed.data;
}

const historyUnavailable = () =>
  new EvidenceReviewError(
    503,
    "Review history is unavailable. Try again later.",
  );
const historyContinuationRequired = () =>
  new EvidenceReviewError(
    503,
    "Additional review history must be loaded before this operation can continue.",
  );
const historyInvalid = () =>
  new EvidenceReviewError(
    422,
    "Stored review history cannot be safely displayed.",
  );
function checkReadSignal(signal: AbortSignal) {
  if (signal.aborted) throw historyUnavailable();
}
function matchesCorrectionScope(
  event: z.infer<typeof correctionSchema>,
  analysisId: string,
  ownerId: string,
  revision: number,
) {
  return (
    event.analysis_id === analysisId &&
    event.owner_id === ownerId &&
    event.actor_id === ownerId &&
    event.revision === revision &&
    event.expected_revision === revision - 1 &&
    (event.operation === "confirm") === (event.candidate_id !== null)
  );
}
async function readCorrectionPrefix(
  client: EvidenceReviewClient,
  analysisId: string,
  ownerId: string,
  signal: AbortSignal,
) {
  const columns =
    "id, attempt_id, analysis_id, owner_id, actor_id, revision, expected_revision, field, operation, value, candidate_id, created_at";
  const { data: rawHead, error: headError } = await client
    .from("evidence_corrections")
    .select(columns)
    .eq("analysis_id", analysisId)
    .eq("owner_id", ownerId)
    .order("revision", { ascending: false })
    .limit(1)
    .abortSignal(signal)
    .maybeSingle();
  checkReadSignal(signal);
  if (headError) throw historyUnavailable();
  const parsedHead =
    rawHead === null ? null : correctionSchema.safeParse(rawHead);
  if (
    parsedHead &&
    (!parsedHead.success ||
      !matchesCorrectionScope(
        parsedHead.data,
        analysisId,
        ownerId,
        parsedHead.data.revision,
      ))
  )
    throw historyInvalid();
  const head = parsedHead?.success ? parsedHead.data : null;
  if (head && head.revision > HISTORY_READ_LIMITS.events)
    throw historyContinuationRequired();
  const highWaterRevision = head?.revision ?? 0;
  const corrections: Array<z.infer<typeof correctionSchema>> = [];
  const ids = new Set<string>();
  let pageCount = 0,
    valueTextUnits = 0;
  while (corrections.length < highWaterRevision) {
    checkReadSignal(signal);
    if (pageCount >= HISTORY_READ_LIMITS.pages)
      throw historyContinuationRequired();
    const { data: rawPage, error: pageError } = await client
      .from("evidence_corrections")
      .select(columns)
      .eq("analysis_id", analysisId)
      .eq("owner_id", ownerId)
      .gt("revision", corrections.length)
      .lte("revision", highWaterRevision)
      .order("revision", { ascending: true })
      .limit(HISTORY_READ_LIMITS.pageSize)
      .abortSignal(signal);
    pageCount++;
    checkReadSignal(signal);
    if (pageError) throw historyUnavailable();
    if (
      !Array.isArray(rawPage) ||
      rawPage.length > HISTORY_READ_LIMITS.pageSize ||
      rawPage.length > highWaterRevision - corrections.length
    )
      throw historyInvalid();
    if (!rawPage.length) throw historyUnavailable();
    for (const event of rawPage) {
      if (event && typeof event === "object" && typeof event.value === "string")
        valueTextUnits += event.value.length;
      if (valueTextUnits > HISTORY_READ_LIMITS.valueTextUnits)
        throw historyContinuationRequired();
    }
    const page = z.array(correctionSchema).safeParse(rawPage);
    if (!page.success) throw historyInvalid();
    for (const event of page.data) {
      if (
        !matchesCorrectionScope(
          event,
          analysisId,
          ownerId,
          corrections.length + 1,
        ) ||
        ids.has(event.id)
      )
        throw historyInvalid();
      ids.add(event.id);
      corrections.push(event);
    }
  }
  if (head && JSON.stringify(corrections.at(-1)) !== JSON.stringify(head))
    throw historyInvalid();
  return { corrections, head, pageCount };
}
function replayAttempt(
  raw: unknown,
  analysis: { id: string; owner_id: string; resume_version_id: string },
) {
  const parsed = attemptSchema.safeParse(raw);
  if (!parsed.success)
    throw new EvidenceReviewError(
      422,
      "Stored evidence cannot be safely reviewed.",
    );
  const attempt = parsed.data;
  const envelope = DocumentEvidenceSchema.safeParse(attempt.envelope);
  if (
    !envelope.success ||
    attempt.analysis_id !== analysis.id ||
    attempt.owner_id !== analysis.owner_id ||
    attempt.resume_version_id !== analysis.resume_version_id ||
    envelope.data.id !== attempt.id ||
    envelope.data.analysisId !== analysis.id ||
    envelope.data.ownerId !== analysis.owner_id ||
    envelope.data.sourceId !== analysis.resume_version_id ||
    envelope.data.inputSha256 !== attempt.input_sha256
  )
    throw new EvidenceReviewError(
      422,
      "Stored evidence cannot be safely reviewed.",
    );
  return { attempt, envelope: envelope.data };
}

export async function loadEvidenceReview(
  client: EvidenceReviewClient,
  analysisId: string,
  ownerId: string,
  options: { signal?: AbortSignal } = {},
) {
  const deadline = AbortSignal.timeout(HISTORY_READ_LIMITS.deadlineMs);
  const signal = options.signal
    ? AbortSignal.any([deadline, options.signal])
    : deadline;
  try {
    checkReadSignal(signal);
    const analysis = await requireOwnedAnalysis(
      client,
      analysisId,
      ownerId,
      signal,
    );
    const { data: attempt, error } = await client
      .from("document_evidence_attempts")
      .select(
        "id, analysis_id, owner_id, resume_version_id, input_sha256, attempt_number, envelope",
      )
      .eq("analysis_id", analysisId)
      .eq("owner_id", ownerId)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .abortSignal(signal)
      .maybeSingle();
    checkReadSignal(signal);
    if (error)
      throw new EvidenceReviewError(
        503,
        "Evidence is unavailable. Try again later.",
      );
    if (!attempt) throw new EvidenceReviewError(404, "Evidence not found.");
    const replayed = replayAttempt(attempt, analysis);
    const { corrections, head, pageCount } = await readCorrectionPrefix(
      client,
      analysisId,
      ownerId,
      signal,
    );
    checkReadSignal(signal);
    const targets = deriveEvidenceReviewTargets(replayed.envelope, {
      ownerId: analysis.owner_id,
      analysisId: analysis.id,
      sourceId: analysis.resume_version_id,
      inputSha256: replayed.attempt.input_sha256,
      attemptId: replayed.attempt.id,
    });
    const historyAttestation: EvidenceHistoryAttestation = {
      schemaVersion: "evidence-review-history/1.0.0",
      state: "complete_captured_prefix",
      binding: { ...targets.binding, targetModelVersion: targets.modelVersion },
      highWaterRevision: head?.revision ?? 0,
      highWaterEventId: head?.id ?? null,
      receivedCount: corrections.length,
      pageCount,
    };
    return {
      analysisId,
      attemptId: replayed.attempt.id,
      attemptNumber: replayed.attempt.attempt_number,
      evidence: replayed.envelope,
      corrections,
      revision: head?.revision ?? 0,
      scoringEligible: false as const,
      nativePageDiagnostics: deriveNativePageDiagnostics(
        replayed.envelope.nativeSource,
      ),
      targets,
      historyAttestation,
    };
  } catch (error) {
    if (error instanceof EvidenceReviewError) throw error;
    throw historyUnavailable();
  }
}

export async function correctEvidenceReview(
  client: EvidenceReviewClient,
  analysisId: string,
  ownerId: string,
  rawInput: unknown,
  requestId: string,
) {
  const input = EvidenceCorrectionInputSchema.safeParse(rawInput);
  if (!input.success || !requestId.trim() || requestId.length > 100)
    throw new EvidenceReviewError(
      422,
      "Choose a valid field and a correction of up to 500 characters.",
    );
  const analysis = await requireOwnedAnalysis(client, analysisId, ownerId);
  const { data: stored, error } = await client
    .from("document_evidence_attempts")
    .select(
      "id, analysis_id, owner_id, resume_version_id, input_sha256, attempt_number, envelope",
    )
    .eq("id", input.data.attemptId)
    .eq("analysis_id", analysisId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error)
    throw new EvidenceReviewError(
      503,
      "Evidence is unavailable. Try again later.",
    );
  if (!stored) throw new EvidenceReviewError(404, "Evidence not found.");
  const { envelope } = replayAttempt(stored, analysis);
  if (
    input.data.operation === "confirm" &&
    !envelope.assertions.some(
      (candidate) =>
        candidate.id === input.data.candidateId &&
        candidate.field === input.data.field &&
        candidate.value === input.data.value,
    )
  )
    throw new EvidenceReviewError(
      422,
      "Confirmation must match the original candidate exactly.",
    );
  const value = input.data;
  const { data: result, error: rpcError } = await client.rpc(
    "correct_document_evidence",
    {
      p_analysis_id: analysisId,
      p_attempt_id: value.attemptId,
      p_user_id: ownerId,
      p_expected_revision: value.expectedRevision,
      p_field: value.field,
      p_operation: value.operation,
      p_value: value.value,
      p_candidate_id: value.candidateId,
      p_idempotency_key: value.idempotencyKey,
      p_request_id: requestId,
    },
  );
  if (rpcError) {
    if (rpcError.code === "22023")
      throw new EvidenceReviewError(
        422,
        "The correction could not be safely applied.",
      );
    throw new EvidenceReviewError(
      503,
      "The correction could not be saved. Retry the same submission.",
    );
  }
  if (result?.status === "not_found")
    throw new EvidenceReviewError(404, "Evidence not found.");
  if (result?.status === "conflict")
    throw new EvidenceReviewError(
      409,
      "This evidence changed or the submission key was reused. Reload before reviewing again.",
    );
  const applied = z
    .object({
      status: z.literal("applied"),
      revision: z.number().int().positive(),
      id: uuid,
      idempotent: z.boolean(),
    })
    .safeParse(result);
  if (!applied.success)
    throw new EvidenceReviewError(
      503,
      "The correction result could not be verified. Retry the same submission.",
    );
  return { ...applied.data, scoringEligible: false as const };
}

export async function readEvidenceCorrectionForm(
  request: Request,
): Promise<EvidenceCorrectionInput> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (
    !/^application\/x-www-form-urlencoded(?:;|$)|^multipart\/form-data;/iu.test(
      contentType,
    )
  )
    throw new EvidenceReviewError(422, "Submit the evidence review form.");
  const declared = request.headers.get("Content-Length");
  if (
    declared !== null &&
    (!/^\d+$/u.test(declared) || Number(declared) > 8192)
  )
    throw new EvidenceReviewError(
      422,
      "The review form exceeds its size limit.",
    );
  const reader = request.body?.getReader();
  if (!reader)
    throw new EvidenceReviewError(422, "Submit the evidence review form.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 8192)
        throw new EvidenceReviewError(
          422,
          "The review form exceeds its size limit.",
        );
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  let form: FormData;
  try {
    form = await new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    }).formData();
  } catch {
    throw new EvidenceReviewError(422, "Submit a valid evidence review form.");
  }
  const allowed = new Set([
    "attemptId",
    "expectedRevision",
    "field",
    "operation",
    "value",
    "candidateId",
    "idempotencyKey",
  ]);
  const values: Record<string, string | number | null> = {};
  for (const [key, value] of form) {
    if (!allowed.has(key) || key in values || typeof value !== "string")
      throw new EvidenceReviewError(
        422,
        "The evidence review form is invalid.",
      );
    values[key] = value;
  }
  if (
    typeof values.expectedRevision !== "string" ||
    !/^(?:0|[1-9]\d*)$/u.test(values.expectedRevision)
  )
    throw new EvidenceReviewError(422, "The evidence revision is invalid.");
  values.expectedRevision = Number(values.expectedRevision);
  values.candidateId = values.candidateId === "" ? null : values.candidateId;
  const parsed = EvidenceCorrectionInputSchema.safeParse(values);
  if (!parsed.success)
    throw new EvidenceReviewError(
      422,
      "Choose a valid field and a correction of up to 500 characters.",
    );
  return parsed.data;
}
