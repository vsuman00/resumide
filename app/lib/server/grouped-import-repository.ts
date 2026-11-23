import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { createSupabaseAdminClient } from "./supabase";
import { CanonicalError } from "./canonical-repository";
import { getServerConfig } from "./config";
import { DocumentEvidenceSchema } from "./document-evidence";
import { deriveEvidenceEntryAssociations } from "./evidence-entry-associations";
import { importCanonicalEvidence } from "./canonical-content";
import {
  GroupedOriginalCommandSchema,
  GroupedOriginalPreviewRequestSchema,
  normalizeGroupedOriginalCommand,
  prepareGroupedOriginalCommand,
  type GroupedOriginalCommand,
  type GroupedOriginalPreviewRequest,
} from "./grouped-import-commands";

export type { GroupedOriginalCommand, GroupedOriginalPreviewRequest };
type Client = Pick<ReturnType<typeof createSupabaseAdminClient>, "rpc">;
const uuid = z.uuid().regex(/^[a-f0-9-]+$/);
const revision = z.number().int().min(0).max(2_147_483_647);
const sourceSchema = z.strictObject({
  ownerId: uuid,
  organizationId: uuid,
  resumeId: uuid,
  analysisId: uuid,
  sourceId: uuid,
  attemptId: uuid,
  inputSha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const capturedSchema = z
  .strictObject({
    reviewRevision: revision,
    reviewHeadId: uuid.nullable(),
    assignmentRevision: revision,
    assignmentHeadId: uuid.nullable(),
    associationRevision: revision,
    associationHeadId: uuid.nullable(),
    canonicalHeadId: uuid.nullable(),
  })
  .refine(
    (v) =>
      (v.reviewRevision === 0) === (v.reviewHeadId === null) &&
      (v.assignmentRevision === 0) === (v.assignmentHeadId === null) &&
      (v.associationRevision === 0) === (v.associationHeadId === null),
  );
const readSchema = z.discriminatedUnion("status", [
  z.strictObject({
    schemaVersion: z.literal("grouped-original-read/1.0.0"),
    status: z.literal("available"),
    compatibilityReady: z.boolean(),
    canCommit: z.boolean(),
    freshImportAllowed: z.boolean(),
    scoringEligible: z.literal(false),
    source: sourceSchema,
    captured: capturedSchema,
    attempt: z.strictObject({
      id: uuid,
      attemptNumber: z.number().int().positive().max(2_147_483_647),
      envelope: z.unknown(),
    }),
  }),
  z.strictObject({
    schemaVersion: z.literal("grouped-original-read/1.0.0"),
    status: z.enum(["not_found", "unavailable"]),
    scoringEligible: z.literal(false),
  }),
]);
export type GroupedOriginalReason =
  | "disabled"
  | "not_found"
  | "unavailable"
  | "invalid_source"
  | "invalid_command"
  | "stale_preview"
  | "conflict"
  | "invalid_result";
export class GroupedOriginalError extends CanonicalError {
  constructor(
    readonly reason: GroupedOriginalReason,
    readonly recovery: "retry_exact" | "review_again" | "unavailable",
    status: 404 | 409 | 422 | 503,
  ) {
    super(
      status,
      reason === "not_found"
        ? "Entry review was not found."
        : reason === "invalid_command"
          ? "Check the entry review form and try again."
          : reason === "stale_preview" || reason === "conflict"
            ? "Review the current entry links again."
            : reason === "invalid_result"
              ? "The import result could not be confirmed. Keep the original request to retry."
              : "Entry import is unavailable. Keep the original request to retry.",
    );
  }
}
function fail(
  reason: GroupedOriginalReason,
  recovery: GroupedOriginalError["recovery"],
  status: 404 | 409 | 422 | 503,
): never {
  throw new GroupedOriginalError(reason, recovery, status);
}
export type GroupedOriginalDisplayGroup = {
  id: string;
  pageId: string;
  method: "native_text" | "local_ocr";
  members: {
    assertionId: string;
    field: "employer" | "role" | "dates";
    value: string;
    citations: {
      attemptId: string;
      spanId: string;
      pageId: string;
      method: "native_text" | "local_ocr";
      start: number;
      end: number;
      pageStart: number;
      pageEnd: number;
      href: string;
    }[];
  }[];
};
export type GroupedOriginalWorkspace =
  | {
      schemaVersion: "grouped-original-workspace/1.0.0";
      state: "unavailable";
      reason: "disabled" | "not_found" | "unavailable" | "invalid_source";
      scoringEligible: false;
    }
  | {
      schemaVersion: "grouped-original-workspace/1.0.0";
      state: "available";
      scoringEligible: false;
      source: z.infer<typeof sourceSchema>;
      binding: GroupedOriginalPreviewRequest["binding"];
      captured: z.infer<typeof capturedSchema>;
      compatibilityReady: boolean;
      canPreview: boolean;
      canCommit: boolean;
      groups: GroupedOriginalDisplayGroup[];
    };
export type GroupedOriginalPreview = {
  schemaVersion: "grouped-original-preview/1.0.0";
  state: "preview";
  command: GroupedOriginalCommand;
  groups: GroupedOriginalDisplayGroup[];
  canCommit: boolean;
  scoringEligible: false;
};
const receiptSchema = z
  .strictObject({
    schemaVersion: z.literal("grouped-original-result/1.0.0"),
    status: z.literal("applied"),
    versionId: uuid,
    revision: z.literal(1),
    batchId: uuid,
    associationRevision: z.number().int().min(1).max(1000),
    associationHeadId: uuid,
    idempotent: z.boolean(),
    scoringEligible: z.literal(false),
  })
  .refine((v) => v.batchId === v.associationHeadId);
export type GroupedOriginalAppliedReceipt = z.infer<typeof receiptSchema>;
const failureSchema = z.strictObject({
  schemaVersion: z.literal("grouped-original-result/1.0.0"),
  status: z.enum(["invalid", "not_found", "conflict", "unavailable"]),
  scoringEligible: z.literal(false),
});
function enabled() {
  const c = getServerConfig();
  return (
    c.CANONICAL_CORRECTIONS_ENABLED &&
    c.CANONICAL_AUTHORING_ENABLED &&
    c.EVIDENCE_REVIEW_ENABLED
  );
}
function ids(analysisId: string, ownerId: string) {
  if (!uuid.safeParse(analysisId).success || !uuid.safeParse(ownerId).success)
    fail("invalid_command", "review_again", 422);
}
const workspaceUnavailable = (
  reason: Extract<GroupedOriginalWorkspace, { state: "unavailable" }>["reason"],
): GroupedOriginalWorkspace => ({
  schemaVersion: "grouped-original-workspace/1.0.0",
  state: "unavailable",
  reason,
  scoringEligible: false,
});
async function snapshot(client: Client, analysisId: string, ownerId: string) {
  ids(analysisId, ownerId);
  if (!enabled()) fail("disabled", "unavailable", 404);
  let result;
  try {
    result = await client.rpc("read_grouped_original_workspace", {
      p_user_id: ownerId,
      p_analysis_id: analysisId,
    });
  } catch {
    return fail("unavailable", "retry_exact", 503);
  }
  if (result.error) fail("unavailable", "retry_exact", 503);
  let bounded = false;
  try {
    bounded =
      Buffer.byteLength(JSON.stringify(result.data), "utf8") <=
      16 * 1024 * 1024;
  } catch {
    fail("invalid_source", "retry_exact", 422);
  }
  const parsed = bounded ? readSchema.safeParse(result.data) : null;
  if (!parsed?.success) fail("invalid_source", "retry_exact", 422);
  const row = parsed.data;
  if (row.status !== "available")
    fail(
      row.status,
      row.status === "not_found" ? "unavailable" : "retry_exact",
      row.status === "not_found" ? 404 : 503,
    );
  const source = row.source;
  if (
    source.ownerId !== ownerId ||
    source.analysisId !== analysisId ||
    row.attempt.id !== source.attemptId ||
    (row.canCommit && !row.compatibilityReady) ||
    (row.freshImportAllowed && row.captured.canonicalHeadId !== null)
  )
    fail("invalid_source", "review_again", 422);
  // The helper's bounded unknown-input guard runs before strict stored replay.
  const review = deriveEvidenceEntryAssociations(row.attempt.envelope, source);
  if (review.state !== "review_required")
    fail("invalid_source", "review_again", 422);
  const evidence = DocumentEvidenceSchema.safeParse(row.attempt.envelope);
  if (
    !evidence.success ||
    evidence.data.id !== source.attemptId ||
    evidence.data.ownerId !== ownerId ||
    evidence.data.analysisId !== analysisId ||
    evidence.data.sourceId !== source.sourceId ||
    evidence.data.inputSha256 !== source.inputSha256
  )
    fail("invalid_source", "review_again", 422);
  const binding: GroupedOriginalPreviewRequest["binding"] = {
    ...source,
    evidenceSchemaVersion: "evidence/2.0.0",
    fieldExtractorVersion: "evidence-fields/1.0.1",
    targetModelVersion: "evidence-targets/1.0.0",
    associationModelVersion: "evidence-entry-associations/1.0.0",
    producerVersion: "canonical-engine/1.0.3",
    admissionPolicyVersion: "grouped-original-admission/1.0.0",
    structuralTextProfileVersion: "a02-structural-text/1.0.0",
    correctionProjectionModelVersion: "canonical-corrections/1.0.1",
    correctionAdmissionPolicyVersion: "candidate-correction-admission/1.0.0",
    effectiveLocale: "en-IN",
  };
  const assertions = new Map(evidence.data.assertions.map((a) => [a.id, a]));
  const groups: GroupedOriginalDisplayGroup[] = review.groups.map((group) => ({
    id: group.id,
    pageId: group.pageId,
    method: group.method,
    members: group.members.map((member) => {
      const assertion = assertions.get(member.assertionId);
      if (
        !assertion ||
        assertion.field !== member.field ||
        !["employer", "role", "dates"].includes(member.field)
      )
        return fail("invalid_source", "review_again", 422);
      return {
        assertionId: member.assertionId,
        field: member.field as "employer" | "role" | "dates",
        value: assertion.value,
        citations: member.citations.map((c) => ({
          ...c,
          attemptId: source.attemptId,
          href: `/analysis/${analysisId}/evidence#source-${encodeURIComponent(c.spanId)}`,
        })),
      };
    }),
  }));
  const workspace: Extract<GroupedOriginalWorkspace, { state: "available" }> = {
    schemaVersion: "grouped-original-workspace/1.0.0",
    state: "available",
    scoringEligible: false,
    source,
    binding,
    captured: row.captured,
    compatibilityReady: row.compatibilityReady,
    canPreview: row.freshImportAllowed && groups.length > 0,
    canCommit: row.canCommit,
    groups,
  };
  return { row, evidence: evidence.data, workspace };
}
export async function loadGroupedOriginalWorkspace(
  client: Client,
  analysisId: string,
  ownerId: string,
): Promise<GroupedOriginalWorkspace> {
  try {
    return (await snapshot(client, analysisId, ownerId)).workspace;
  } catch (error) {
    const reason =
      error instanceof GroupedOriginalError ? error.reason : "unavailable";
    return workspaceUnavailable(
      reason === "disabled" ||
        reason === "not_found" ||
        reason === "invalid_source"
        ? reason
        : "unavailable",
    );
  }
}
export async function previewGroupedOriginalImport(
  client: Client,
  analysisId: string,
  ownerId: string,
  raw: unknown,
): Promise<GroupedOriginalPreview> {
  const request = GroupedOriginalPreviewRequestSchema.safeParse(raw);
  if (!request.success) fail("invalid_command", "review_again", 422);
  const { row, evidence, workspace } = await snapshot(
    client,
    analysisId,
    ownerId,
  );
  if (
    !workspace.canPreview ||
    row.captured.canonicalHeadId !== null ||
    Object.entries(row.captured).some(
      ([key, value]) =>
        request.data.expected[key as keyof typeof request.data.expected] !==
        value,
    )
  )
    fail("stale_preview", "review_again", 409);
  const prepared = prepareGroupedOriginalCommand(
    evidence,
    row.source,
    request.data,
  );
  if (prepared.state !== "prepared")
    fail("invalid_command", "review_again", 422);
  const command = GroupedOriginalCommandSchema.parse({
    ...request.data,
    selectedGroupIds: prepared.selectedGroupIds,
    acknowledgement: true,
    previewHash: prepared.previewHash,
    idempotencyKey: randomUUID(),
  });
  const selected = new Set(command.selectedGroupIds);
  return {
    schemaVersion: "grouped-original-preview/1.0.0",
    state: "preview",
    command,
    groups: workspace.groups.filter((group) => selected.has(group.id)),
    canCommit: workspace.canCommit,
    scoringEligible: false,
  };
}
export async function commitGroupedOriginalImport(
  client: Client,
  analysisId: string,
  ownerId: string,
  raw: unknown,
  requestId: string,
): Promise<GroupedOriginalAppliedReceipt> {
  const parsed = GroupedOriginalCommandSchema.safeParse(raw);
  if (
    !parsed.success ||
    typeof requestId !== "string" ||
    requestId.length < 1 ||
    requestId.length > 100
  )
    fail("invalid_command", "review_again", 422);
  const { row, evidence } = await snapshot(client, analysisId, ownerId);
  const normalized = normalizeGroupedOriginalCommand(
    evidence,
    row.source,
    parsed.data,
  );
  if (normalized.state !== "prepared")
    fail(
      normalized.reason === "binding_mismatch" ? "conflict" : "invalid_command",
      "review_again",
      normalized.reason === "binding_mismatch" ? 409 : 422,
    );
  if (!row.canCommit) fail("unavailable", "unavailable", 503);
  let original;
  try {
    original = importCanonicalEvidence(evidence, {
      ownerId,
      organizationId: row.source.organizationId,
      resumeId: row.source.resumeId,
      locale: parsed.data.binding.effectiveLocale,
    });
  } catch {
    fail("invalid_source", "review_again", 422);
  }
  let result;
  try {
    result = await client.rpc("import_canonical_grouped_original", {
      p_user_id: ownerId,
      p_analysis_id: analysisId,
      p_command: {
        normalForm: normalized.normalForm,
        previewHash: normalized.previewHash,
        idempotencyKey: normalized.idempotencyKey,
      },
      p_original: original,
      p_request_id: requestId,
    });
  } catch {
    return fail("unavailable", "retry_exact", 503);
  }
  if (result.error) fail("unavailable", "retry_exact", 503);
  const receipt = receiptSchema.safeParse(result.data);
  if (receipt.success) {
    if (
      receipt.data.associationRevision !==
        parsed.data.expected.associationRevision + 1 ||
      (!receipt.data.idempotent &&
        receipt.data.versionId !== original.versionId)
    )
      fail("invalid_result", "retry_exact", 503);
    return receipt.data;
  }
  const refusal = failureSchema.safeParse(result.data);
  if (!refusal.success) fail("invalid_result", "retry_exact", 503);
  const status = refusal.data.status;
  return fail(
    status === "invalid" ? "invalid_command" : status,
    status === "unavailable" ? "retry_exact" : "review_again",
    status === "invalid"
      ? 422
      : status === "not_found"
        ? 404
        : status === "conflict"
          ? 409
          : 503,
  );
}

function compactJson(text: string): unknown {
  let nodes = 0;
  const frames: { kind: string; key: boolean; keys: Set<string> }[] = [];
  for (const match of text.matchAll(
    /"(?:\\[\s\S]|[^"\\])*"|[{}\[\],:]|[^\s{}\[\],:]+/gu,
  )) {
    if (++nodes > 4096) fail("invalid_command", "review_again", 422);
    const token = match[0];
    const frame = frames.at(-1);
    if (token === "{" || token === "[") {
      if (frames.length >= 8) fail("invalid_command", "review_again", 422);
      frames.push({ kind: token, key: token === "{", keys: new Set() });
    } else if (token === "}" || token === "]") frames.pop();
    else if (frame?.kind === "{" && token === ",") frame.key = true;
    else if (frame?.kind === "{" && frame.key && token.startsWith('"')) {
      const key: string = JSON.parse(token);
      if (frame.keys.has(key)) fail("invalid_command", "review_again", 422);
      frame.keys.add(key);
      frame.key = false;
    }
  }
  return JSON.parse(text);
}
export function readGroupedOriginalForm(
  request: Request,
  mode: "preview",
): Promise<GroupedOriginalPreviewRequest>;
export function readGroupedOriginalForm(
  request: Request,
  mode: "commit",
): Promise<GroupedOriginalCommand>;
export async function readGroupedOriginalForm(
  request: Request,
  mode: "preview" | "commit",
): Promise<GroupedOriginalPreviewRequest | GroupedOriginalCommand> {
  if (
    !/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/i.test(
      request.headers.get("content-type") ?? "",
    )
  )
    fail("invalid_command", "review_again", 422);
  const body = request.body;
  if (!body || request.bodyUsed || body.locked)
    fail("invalid_command", "review_again", 422);
  const reader = body.getReader();
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0,
      text = "";
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 16_384) fail("invalid_command", "review_again", 422);
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    const fields = new Map<string, string>();
    for (const pair of text.split("&")) {
      const split = pair.indexOf("=");
      const decode = (value: string) =>
        decodeURIComponent(value.replace(/\+/gu, " "));
      const key = decode(split < 0 ? pair : pair.slice(0, split));
      const value = decode(split < 0 ? "" : pair.slice(split + 1));
      if (
        fields.has(key) ||
        (key !== "command" &&
          !(mode === "commit" && key === "relationshipAcknowledgement"))
      )
        fail("invalid_command", "review_again", 422);
      fields.set(key, value);
    }
    if (
      fields.size !== (mode === "preview" ? 1 : 2) ||
      (mode === "commit" &&
        fields.get("relationshipAcknowledgement") !== "accepted")
    )
      fail("invalid_command", "review_again", 422);
    const raw = compactJson(fields.get("command") ?? "");
    return mode === "preview"
      ? GroupedOriginalPreviewRequestSchema.parse(raw)
      : GroupedOriginalCommandSchema.parse(raw);
  } catch (error) {
    if (error instanceof GroupedOriginalError) throw error;
    return fail("invalid_command", "review_again", 422);
  } finally {
    try {
      await reader.cancel();
    } catch {
      fail("invalid_command", "review_again", 422);
    } finally {
      reader.releaseLock();
    }
  }
}
