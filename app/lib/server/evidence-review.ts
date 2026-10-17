import { z } from "zod";
import { DocumentEvidenceSchema } from "./document-evidence";
import { CRITICAL_FIELDS } from "./evidence-fields";
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
) {
  if (!uuid.safeParse(analysisId).success || !uuid.safeParse(ownerId).success)
    throw new EvidenceReviewError(404, "Evidence not found.");
  const { data, error } = await client
    .from("analyses")
    .select("id, owner_id, resume_version_id")
    .eq("id", analysisId)
    .eq("owner_id", ownerId)
    .maybeSingle();
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
) {
  const analysis = await requireOwnedAnalysis(client, analysisId, ownerId);
  const { data: attempt, error } = await client
    .from("document_evidence_attempts")
    .select(
      "id, analysis_id, owner_id, resume_version_id, input_sha256, attempt_number, envelope",
    )
    .eq("analysis_id", analysisId)
    .eq("owner_id", ownerId)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error)
    throw new EvidenceReviewError(
      503,
      "Evidence is unavailable. Try again later.",
    );
  if (!attempt) throw new EvidenceReviewError(404, "Evidence not found.");
  const replayed = replayAttempt(attempt, analysis);
  const { data: events, error: eventError } = await client
    .from("evidence_corrections")
    .select(
      "id, attempt_id, analysis_id, owner_id, actor_id, revision, expected_revision, field, operation, value, candidate_id, created_at",
    )
    .eq("analysis_id", analysisId)
    .eq("owner_id", ownerId)
    .order("revision", { ascending: true });
  if (eventError)
    throw new EvidenceReviewError(
      503,
      "Review history is unavailable. Try again later.",
    );
  const corrections = z.array(correctionSchema).safeParse(events);
  if (
    !corrections.success ||
    corrections.data.some(
      (event, index) =>
        event.analysis_id !== analysisId ||
        event.owner_id !== ownerId ||
        event.actor_id !== ownerId ||
        event.revision !== index + 1 ||
        event.expected_revision !== index ||
        (event.operation === "confirm") !== (event.candidate_id !== null),
    )
  )
    throw new EvidenceReviewError(
      422,
      "Stored review history cannot be safely displayed.",
    );
  return {
    analysisId,
    attemptId: replayed.attempt.id,
    attemptNumber: replayed.attempt.attempt_number,
    evidence: replayed.envelope,
    corrections: corrections.data,
    revision: corrections.data.at(-1)?.revision ?? 0,
    scoringEligible: false as const,
  };
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
