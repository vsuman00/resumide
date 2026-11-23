import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { createSupabaseAdminClient } from "./supabase";
import { CanonicalError } from "./canonical-repository";
import { getServerConfig } from "./config";
import { CanonicalResumeDraftSchema } from "./canonical-resume-schema";
import { DocumentEvidenceSchema } from "./document-evidence";
import { EvidenceHistoryAttestationSchema } from "./evidence-review";
import { deriveEvidenceReviewTargets } from "./evidence-targets";
import { deriveEvidenceEntryAssociations } from "./evidence-entry-associations";
import { deriveNativePageDiagnostics } from "./ocr/pdf-detection";
import { projectCanonicalCorrectionSourceChoices } from "./canonical-corrections";
import {
  prepareCanonicalEntryRegroup,
  type CanonicalEntryRegroupPreparation,
} from "./canonical-entry-regroup";
import {
  CanonicalEntryRegroupRequestSchema,
  CanonicalEntryRegroupCommandSchema,
  prepareCanonicalEntryRegroupCommand,
  normalizeCanonicalEntryRegroupCommand,
  type CanonicalEntryRegroupCommandContext,
  type CanonicalEntryRegroupCommand,
  type CanonicalEntryRegroupRequest,
} from "./canonical-entry-regroup-commands";

export type { CanonicalEntryRegroupCommand, CanonicalEntryRegroupRequest };
type Client = Pick<ReturnType<typeof createSupabaseAdminClient>, "rpc">;
const uuid = z.uuid().regex(/^[a-f0-9-]+$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const sourceSchema = z.strictObject({
  ownerId: uuid,
  organizationId: uuid,
  resumeId: uuid,
  analysisId: uuid,
  sourceId: uuid,
  attemptId: uuid,
  inputSha256: sha256,
});
const baseSchema = CanonicalEntryRegroupRequestSchema.shape.base;
const capturedSchema = CanonicalEntryRegroupRequestSchema.shape.expected;
const currentSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("available"),
    captured: capturedSchema,
    freshCanPreview: z.boolean(),
    freshCanCommit: z.boolean(),
  }),
  z.strictObject({ status: z.literal("unavailable") }),
]);
const eventSchema = z.strictObject({
  id: uuid,
  attempt_id: uuid,
  analysis_id: uuid,
  owner_id: uuid,
  actor_id: uuid,
  revision: z.number().int().min(1).max(1000),
  expected_revision: z.number().int().min(0).max(999),
  field: z.enum([
    "name",
    "email",
    "phone",
    "employer",
    "role",
    "dates",
    "education",
    "certification",
  ]),
  operation: z.enum(["confirm", "correct"]),
  value: z
    .string()
    .min(1)
    .max(2000)
    .refine((value) => value === value.trim()),
  candidate_id: z.string().min(1).max(100).nullable(),
  created_at: z.iso.datetime({ offset: true }),
});
const historicalSchema = z.strictObject({
  base: z.strictObject({ ...baseSchema.shape, content: z.unknown() }),
  ancestors: z
    .array(
      z.strictObject({
        versionId: uuid,
        revision: z.number().int().min(1).max(2_147_483_647),
        content: z.unknown(),
      }),
    )
    .max(64),
  review: z.strictObject({
    revision: z.number().int().min(0).max(1000),
    headId: uuid.nullable(),
    events: z.array(eventSchema).max(1000),
    historyAttestation: EvidenceHistoryAttestationSchema,
  }),
});
const readSchema = z.discriminatedUnion("status", [
  z.strictObject({
    schemaVersion: z.literal("entry-regroup-read/1.0.0"),
    status: z.literal("available"),
    scoringEligible: z.literal(false),
    source: sourceSchema,
    attempt: z.strictObject({
      id: uuid,
      attemptNumber: z.number().int().positive().max(2_147_483_647),
      envelope: z.unknown(),
    }),
    historical: historicalSchema,
    current: currentSchema,
    compatibilityReady: z.boolean(),
    canRetry: z.boolean(),
  }),
  z.strictObject({
    schemaVersion: z.literal("entry-regroup-read/1.0.0"),
    status: z.enum(["not_found", "unavailable"]),
    scoringEligible: z.literal(false),
  }),
]);
type ReadRow = Extract<z.infer<typeof readSchema>, { status: "available" }>;
export type CanonicalEntryRegroupCurrent = z.infer<typeof currentSchema>;
export type CanonicalEntryRegroupCapability = {
  compatibilityReady: boolean;
  canRetry: boolean;
};
export type CanonicalEntryRegroupDisplayGroup = {
  id: string;
  pageId: string;
  method: "native_text" | "local_ocr";
  reason: "no_supported_fact_choice" | null;
  members: {
    assertionId: string;
    field: "employer" | "role" | "dates";
    sourceValue: string;
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
    choices: {
      factId: string;
      currentValue: string;
      state: "unconfirmed" | "source_supported" | "candidate_confirmed";
      confirmation: z.infer<
        typeof CanonicalResumeDraftSchema
      >["facts"][number]["confirmation"];
      location: {
        kind: "entry" | "bullet";
        sectionId: string;
        entryId: string;
        bulletId: string | null;
      };
      locationLabel: string;
      mappedThrough: "current_citations" | "owned_ancestor_chain";
      originVersionId: string | null;
    }[];
  }[];
};
export type CanonicalEntryRegroupWorkspace =
  | {
      schemaVersion: "entry-regroup-workspace/1.0.0";
      state: "unavailable";
      reason: CanonicalEntryRegroupReason;
      scoringEligible: false;
    }
  | {
      schemaVersion: "entry-regroup-workspace/1.0.0";
      state: "available";
      scoringEligible: false;
      binding: CanonicalEntryRegroupRequest["binding"];
      base: CanonicalEntryRegroupRequest["base"];
      current: CanonicalEntryRegroupCurrent;
      capability: CanonicalEntryRegroupCapability;
      canPreview: boolean;
      reviewNotice: "captured_corrections_present" | null;
      groups: CanonicalEntryRegroupDisplayGroup[];
    };
export type CanonicalEntryRegroupPreview = {
  schemaVersion: "entry-regroup-preview/1.0.0";
  state: "preview" | "retained";
  command: CanonicalEntryRegroupCommand;
  preparation: Extract<CanonicalEntryRegroupPreparation, { state: "prepared" }>;
  current: CanonicalEntryRegroupCurrent;
  capability: CanonicalEntryRegroupCapability;
  scoringEligible: false;
};
export type CanonicalEntryRegroupReason =
  | "disabled"
  | "not_found"
  | "unavailable"
  | "invalid_source"
  | "invalid_command"
  | "stale_preview"
  | "conflict"
  | "invalid_result";
export class CanonicalEntryRegroupError extends CanonicalError {
  constructor(
    readonly reason: CanonicalEntryRegroupReason,
    readonly recovery: "retry_exact" | "review_again" | "unavailable",
    status: 404 | 409 | 422 | 503,
  ) {
    super(
      status,
      reason === "not_found"
        ? "Saved entry review was not found."
        : reason === "invalid_command"
          ? "Check the saved entry review form and try again."
          : reason === "stale_preview" || reason === "conflict"
            ? "Review the current saved entries again."
            : reason === "invalid_result"
              ? "The save result could not be confirmed. Keep the original request to retry."
              : "Saved entry review is unavailable. Keep the original request to retry.",
    );
  }
}
function fail(
  reason: CanonicalEntryRegroupReason,
  recovery: CanonicalEntryRegroupError["recovery"],
  status: 404 | 409 | 422 | 503,
): never {
  throw new CanonicalEntryRegroupError(reason, recovery, status);
}
function enabled() {
  const c = getServerConfig();
  return (
    c.CANONICAL_AUTHORING_ENABLED &&
    c.CANONICAL_CORRECTIONS_ENABLED &&
    c.EVIDENCE_REVIEW_ENABLED
  );
}
const capability = (row: ReadRow): CanonicalEntryRegroupCapability => ({
  compatibilityReady: row.compatibilityReady,
  canRetry: row.canRetry,
});
const originalCapture = (command: CanonicalEntryRegroupRequest) => ({
  base: command.base,
  reviewRevision: command.expected.reviewRevision,
  reviewHeadId: command.expected.reviewHeadId,
});
function boundedCanonicalDocuments(documents: unknown[]) {
  let facts = 0;
  const array = (value: unknown, limit: number): value is unknown[] =>
    Array.isArray(value) && value.length <= limit;
  const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  for (const doc of documents) {
    if (
      !record(doc) ||
      !array(doc.facts, 1000) ||
      !array(doc.sections, 30) ||
      !array(doc.changes, 1000) ||
      !array(doc.contactFactIds, 20)
    )
      return false;
    facts += doc.facts.length;
    if (facts > 20_000) return false;
    for (const fact of doc.facts)
      if (!record(fact) || !array(fact.sources, 20)) return false;
    for (const section of doc.sections) {
      if (
        !record(section) ||
        !array(section.factIds, 100) ||
        !array(section.entries, 100)
      )
        return false;
      for (const entry of section.entries) {
        if (
          !record(entry) ||
          !array(entry.factIds, 100) ||
          !array(entry.bullets, 100)
        )
          return false;
        for (const bullet of entry.bullets)
          if (!record(bullet) || !array(bullet.factIds, 100)) return false;
      }
    }
  }
  return true;
}
async function snapshot(
  client: Client,
  analysisId: string,
  ownerId: string,
  capture: ReturnType<typeof originalCapture> | null,
) {
  if (!uuid.safeParse(analysisId).success || !uuid.safeParse(ownerId).success)
    fail("invalid_command", "review_again", 422);
  if (!enabled()) fail("disabled", "unavailable", 404);
  let result;
  try {
    result = await client.rpc("read_canonical_entry_regroup_workspace", {
      p_user_id: ownerId,
      p_analysis_id: analysisId,
      p_original_capture: capture,
    });
  } catch {
    return fail("unavailable", "retry_exact", 503);
  }
  if (result.error) fail("unavailable", "retry_exact", 503);
  let bounded = false;
  try {
    bounded =
      Buffer.byteLength(JSON.stringify(result.data), "utf8") <=
      32 * 1024 * 1024;
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
  const { source, historical } = row;
  if (
    source.ownerId !== ownerId ||
    source.analysisId !== analysisId ||
    row.attempt.id !== source.attemptId ||
    (row.canRetry && !row.compatibilityReady) ||
    (row.current.status === "available" &&
      row.current.freshCanCommit &&
      (!row.canRetry || !row.current.freshCanPreview))
  )
    fail("invalid_source", "review_again", 422);
  const associations = deriveEvidenceEntryAssociations(
    row.attempt.envelope,
    source,
  );
  const evidence = DocumentEvidenceSchema.safeParse(row.attempt.envelope);
  if (
    associations.state !== "review_required" ||
    !evidence.success ||
    evidence.data.id !== source.attemptId ||
    evidence.data.ownerId !== ownerId ||
    evidence.data.analysisId !== analysisId ||
    evidence.data.sourceId !== source.sourceId ||
    evidence.data.inputSha256 !== source.inputSha256
  )
    fail("invalid_source", "review_again", 422);
  const targets = deriveEvidenceReviewTargets(evidence.data, source);
  if (
    !boundedCanonicalDocuments([
      historical.base.content,
      ...historical.ancestors.map((a) => a.content),
    ])
  )
    fail("invalid_source", "review_again", 422);
  const base = CanonicalResumeDraftSchema.safeParse(historical.base.content);
  const ancestors = historical.ancestors.map((item) => ({
    row: item,
    doc: CanonicalResumeDraftSchema.safeParse(item.content),
  }));
  if (!base.success || ancestors.some((a) => !a.doc.success))
    fail("invalid_source", "review_again", 422);
  const docs = [
    base.data,
    ...ancestors.map((a) => {
      if (!a.doc.success) return fail("invalid_source", "review_again", 422);
      return a.doc.data;
    }),
  ];
  const metadata = [historical.base, ...historical.ancestors];
  const seen = new Set<string>();
  for (const [index, doc] of docs.entries()) {
    if (
      seen.has(doc.versionId) ||
      doc.versionId !== metadata[index].versionId ||
      doc.ownerId !== ownerId ||
      doc.organizationId !== source.organizationId ||
      doc.resumeId !== source.resumeId ||
      doc.analysisId !== analysisId ||
      doc.inputSha256 !== source.inputSha256 ||
      doc.sourceEvidenceVersionId !== source.attemptId ||
      (index > 0 &&
        (docs[index - 1].parentVersionId !== doc.versionId ||
          metadata[index].revision !== metadata[index - 1].revision - 1))
    )
      fail("invalid_source", "review_again", 422);
    seen.add(doc.versionId);
  }
  const review = historical.review;
  if (
    base.data.locale !== historical.base.locale ||
    (capture &&
      (Object.entries(capture.base).some(
        ([key, value]) =>
          historical.base[key as keyof typeof capture.base] !== value,
      ) ||
        review.revision !== capture.reviewRevision ||
        review.headId !== capture.reviewHeadId)) ||
    review.events.length !== review.revision ||
    (review.events.at(-1)?.id ?? null) !== review.headId ||
    review.historyAttestation.highWaterRevision !== review.revision ||
    review.historyAttestation.highWaterEventId !== review.headId ||
    review.historyAttestation.receivedCount !== review.events.length ||
    Object.entries({
      ...targets.binding,
      targetModelVersion: targets.modelVersion,
    }).some(
      ([key, value]) =>
        review.historyAttestation.binding[
          key as keyof typeof review.historyAttestation.binding
        ] !== value,
    )
  )
    fail("invalid_source", "review_again", 422);
  const context: CanonicalEntryRegroupCommandContext = {
    sqlBaseContentSha256: historical.base.contentSha256,
    historicalBaseView: {
      canonicalRevision: historical.base.revision,
      ownedContext: source,
      review: {
        analysisId,
        attemptId: source.attemptId,
        attemptNumber: row.attempt.attemptNumber,
        evidence: evidence.data,
        corrections: review.events,
        revision: review.revision,
        historyAttestation: review.historyAttestation,
        targets,
        nativePageDiagnostics: deriveNativePageDiagnostics(
          evidence.data.nativeSource,
        ),
        scoringEligible: false,
      },
      expectedBinding: {
        ...targets.binding,
        resumeId: source.resumeId,
        organizationId: source.organizationId,
        targetModelVersion: targets.modelVersion,
        projectionModelVersion: "canonical-corrections/1.0.1",
        reviewRevision: review.revision,
        canonicalHeadId: base.data.versionId,
      },
      canonicalSnapshot: {
        sourceId: source.sourceId,
        headId: base.data.versionId,
        current: base.data,
        ancestors: docs.slice(1),
      },
    },
  };
  let choices: ReturnType<typeof projectCanonicalCorrectionSourceChoices>;
  try {
    choices = projectCanonicalCorrectionSourceChoices(
      context.historicalBaseView,
    );
  } catch {
    return fail("invalid_source", "review_again", 422);
  }
  const binding: CanonicalEntryRegroupRequest["binding"] = {
    ...source,
    evidenceSchemaVersion: "evidence/2.0.0",
    fieldExtractorVersion: "evidence-fields/1.0.1",
    targetModelVersion: "evidence-targets/1.0.0",
    associationModelVersion: "evidence-entry-associations/1.0.0",
    producerVersion: "canonical-engine/1.0.4",
    admissionPolicyVersion: "whole-entry-regroup-admission/1.0.0",
    structuralTextProfileVersion: "a02-structural-text/1.0.0",
    correctionProjectionModelVersion: "canonical-corrections/1.0.1",
    correctionAdmissionPolicyVersion: "candidate-correction-admission/1.0.0",
    regroupModelVersion: "canonical-entry-regroup/1.0.0",
  };
  return {
    row,
    context,
    associations,
    choices,
    binding,
    base: baseSchema.parse({
      versionId: historical.base.versionId,
      revision: historical.base.revision,
      contentSha256: historical.base.contentSha256,
      locale: historical.base.locale,
    }),
  };
}
type Snapshot = Awaited<ReturnType<typeof snapshot>>;
function displayGroups(s: Snapshot): CanonicalEntryRegroupDisplayGroup[] {
  const facts = new Map(
    s.context.historicalBaseView.canonicalSnapshot!.current.facts.map((f) => [
      f.id,
      f,
    ]),
  );
  const sections =
    s.context.historicalBaseView.canonicalSnapshot!.current.sections;
  const assertions = new Map(
    s.context.historicalBaseView.review.evidence.assertions.map((a) => [
      a.id,
      a,
    ]),
  );
  return s.associations.groups.map((group) => {
    const members = group.members.map((member) => {
      const assertion = assertions.get(member.assertionId);
      if (
        !assertion ||
        assertion.field !== member.field ||
        !["employer", "role", "dates"].includes(member.field)
      )
        return fail("invalid_source", "review_again", 422);
      const choices = (
        s.choices.choicesBySourceTarget.get(member.targetId) ?? []
      ).flatMap((choice) => {
        const fact = facts.get(choice.factId),
          location = choice.locations[0];
        if (
          !fact ||
          choice.locations.length !== 1 ||
          !location ||
          (location.kind !== "entry" && location.kind !== "bullet") ||
          !location.sectionId ||
          !location.entryId ||
          (location.kind === "entry"
            ? location.bulletId !== null
            : !location.bulletId)
        )
          return [];
        const section = sections.find(
          (section) => section.id === location.sectionId,
        );
        const index =
          section?.entries.findIndex(
            (entry) => entry.id === location.entryId,
          ) ?? -1;
        if (!section || section.type !== "experience" || index < 0) return [];
        return [
          {
            factId: fact.id,
            currentValue: fact.value,
            state: fact.state,
            confirmation: fact.confirmation,
            location: {
              kind: location.kind,
              sectionId: location.sectionId,
              entryId: location.entryId,
              bulletId: location.bulletId,
            },
            locationLabel: `${section.title}, entry ${index + 1}${location.kind === "bullet" ? ", bullet" : ""}`,
            mappedThrough: choice.mappedThrough,
            originVersionId: choice.originVersionId,
          },
        ];
      });
      return {
        assertionId: member.assertionId,
        field: member.field as "employer" | "role" | "dates",
        sourceValue: assertion.value,
        citations: member.citations.map((c) => ({
          ...c,
          attemptId: s.row.source.attemptId,
          href: `/analysis/${s.row.source.analysisId}/evidence#source-${encodeURIComponent(c.spanId)}`,
        })),
        choices,
      };
    });
    return {
      id: group.id,
      pageId: group.pageId,
      method: group.method,
      reason: members.some((m) => m.choices.length === 0)
        ? "no_supported_fact_choice"
        : null,
      members,
    };
  });
}
export async function loadCanonicalEntryRegroupWorkspace(
  client: Client,
  analysisId: string,
  ownerId: string,
): Promise<CanonicalEntryRegroupWorkspace> {
  try {
    const s = await snapshot(client, analysisId, ownerId, null);
    return {
      schemaVersion: "entry-regroup-workspace/1.0.0",
      state: "available",
      scoringEligible: false,
      binding: s.binding,
      base: s.base,
      current: s.row.current,
      capability: capability(s.row),
      canPreview:
        s.row.current.status === "available" &&
        s.row.current.freshCanPreview &&
        s.row.current.captured.canonicalHeadId === s.base.versionId,
      reviewNotice: s.row.historical.review.events.length
        ? "captured_corrections_present"
        : null,
      groups: displayGroups(s),
    };
  } catch (error) {
    return {
      schemaVersion: "entry-regroup-workspace/1.0.0",
      state: "unavailable",
      reason:
        error instanceof CanonicalEntryRegroupError
          ? error.reason
          : "unavailable",
      scoringEligible: false,
    };
  }
}
function coreDiff(s: Snapshot, request: CanonicalEntryRegroupRequest) {
  const selected = new Map(request.selections.map((g) => [g.groupId, g]));
  const preparation = prepareCanonicalEntryRegroup(
    s.context.historicalBaseView,
    {
      schemaVersion: "canonical-entry-regroup-intent/1.0.0",
      operation: "preview_whole_entry_merge",
      baseVersionId: request.base.versionId,
      baseRevision: request.base.revision,
      selections: s.associations.groups
        .filter((g) => selected.has(g.id))
        .map((g) => ({
          groupId: g.id,
          members: g.members.map((m, i) => ({
            assertionId: m.assertionId,
            factId: selected.get(g.id)!.factIds[i],
          })),
        })),
    },
  );
  if (preparation.state !== "prepared")
    return fail("invalid_command", "review_again", 422);
  return preparation;
}
export async function previewCanonicalEntryRegroup(
  client: Client,
  analysisId: string,
  ownerId: string,
  raw: unknown,
): Promise<CanonicalEntryRegroupPreview> {
  const parsed = CanonicalEntryRegroupRequestSchema.safeParse(raw);
  if (!parsed.success) fail("invalid_command", "review_again", 422);
  const s = await snapshot(
    client,
    analysisId,
    ownerId,
    originalCapture(parsed.data),
  );
  const current = s.row.current;
  if (
    current.status !== "available" ||
    !current.freshCanPreview ||
    current.captured.canonicalHeadId !== parsed.data.base.versionId ||
    Object.entries(current.captured).some(
      ([key, value]) =>
        parsed.data.expected[key as keyof typeof parsed.data.expected] !==
        value,
    )
  )
    fail("stale_preview", "review_again", 409);
  const prepared = prepareCanonicalEntryRegroupCommand(s.context, parsed.data);
  if (prepared.state !== "prepared")
    fail("invalid_command", "review_again", 422);
  const preparation = coreDiff(s, parsed.data);
  const command = CanonicalEntryRegroupCommandSchema.parse({
    ...parsed.data,
    acknowledgement: true,
    previewHash: prepared.previewHash,
    idempotencyKey: randomUUID(),
  });
  return {
    schemaVersion: "entry-regroup-preview/1.0.0",
    state: "preview",
    command,
    preparation,
    current,
    capability: capability(s.row),
    scoringEligible: false,
  };
}
export async function resumeCanonicalEntryRegroup(
  client: Client,
  analysisId: string,
  ownerId: string,
  raw: unknown,
): Promise<CanonicalEntryRegroupPreview> {
  const parsed = CanonicalEntryRegroupCommandSchema.safeParse(raw);
  if (!parsed.success) fail("invalid_command", "review_again", 422);
  const s = await snapshot(
    client,
    analysisId,
    ownerId,
    originalCapture(parsed.data),
  );
  const normalized = normalizeCanonicalEntryRegroupCommand(
    s.context,
    parsed.data,
  );
  if (normalized.state !== "prepared")
    fail(
      normalized.reason === "binding_mismatch" ? "conflict" : "invalid_command",
      "review_again",
      normalized.reason === "binding_mismatch" ? 409 : 422,
    );
  return {
    schemaVersion: "entry-regroup-preview/1.0.0",
    state: "retained",
    command: normalized.command,
    preparation: coreDiff(s, normalized.command),
    current: s.row.current,
    capability: capability(s.row),
    scoringEligible: false,
  };
}
const receiptSchema = z
  .strictObject({
    schemaVersion: z.literal("entry-regroup-result/1.0.0"),
    status: z.literal("applied"),
    baseVersionId: uuid,
    baseRevision: z.number().int().min(1).max(2_147_483_646),
    idempotencyKey: uuid,
    commandSha256: sha256,
    versionId: uuid,
    revision: z.number().int().min(2).max(2_147_483_647),
    batchId: uuid,
    regroupRevision: z.number().int().min(1).max(1000),
    regroupHeadId: uuid,
    idempotent: z.boolean(),
    scoringEligible: z.literal(false),
  })
  .refine((v) => v.batchId === v.regroupHeadId);
export type CanonicalEntryRegroupAppliedReceipt = z.infer<typeof receiptSchema>;
const failureSchema = z.strictObject({
  schemaVersion: z.literal("entry-regroup-result/1.0.0"),
  status: z.enum(["not_found", "conflict", "invalid", "unavailable"]),
  scoringEligible: z.literal(false),
});
export async function commitCanonicalEntryRegroup(
  client: Client,
  analysisId: string,
  ownerId: string,
  raw: unknown,
  requestId: string,
): Promise<CanonicalEntryRegroupAppliedReceipt> {
  const parsed = CanonicalEntryRegroupCommandSchema.safeParse(raw);
  if (
    !parsed.success ||
    typeof requestId !== "string" ||
    !/^[a-zA-Z0-9._:-]{1,100}$/.test(requestId)
  )
    fail("invalid_command", "review_again", 422);
  const s = await snapshot(
    client,
    analysisId,
    ownerId,
    originalCapture(parsed.data),
  );
  const normalized = normalizeCanonicalEntryRegroupCommand(
    s.context,
    parsed.data,
  );
  if (normalized.state !== "prepared")
    fail(
      normalized.reason === "binding_mismatch" ? "conflict" : "invalid_command",
      "review_again",
      normalized.reason === "binding_mismatch" ? 409 : 422,
    );
  if (!s.row.canRetry) fail("unavailable", "unavailable", 503);
  let result;
  try {
    result = await client.rpc("apply_canonical_entry_regroup", {
      p_user_id: ownerId,
      p_analysis_id: analysisId,
      p_command: {
        normalForm: normalized.normalForm,
        previewHash: normalized.previewHash,
        idempotencyKey: normalized.idempotencyKey,
      },
      p_request_id: requestId,
    });
  } catch {
    return fail("unavailable", "retry_exact", 503);
  }
  if (result.error) fail("unavailable", "retry_exact", 503);
  const receipt = receiptSchema.safeParse(result.data);
  if (receipt.success) {
    const command = parsed.data;
    if (
      receipt.data.baseVersionId !== command.base.versionId ||
      receipt.data.baseRevision !== command.base.revision ||
      receipt.data.idempotencyKey !== command.idempotencyKey ||
      receipt.data.commandSha256 !== command.previewHash ||
      receipt.data.revision !== command.base.revision + 1 ||
      receipt.data.regroupRevision !== command.expected.regroupRevision + 1 ||
      receipt.data.versionId === command.base.versionId
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
    const token = match[0],
      frame = frames.at(-1);
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
export function readCanonicalEntryRegroupForm(
  request: Request,
  mode: "preview",
): Promise<CanonicalEntryRegroupRequest>;
export function readCanonicalEntryRegroupForm(
  request: Request,
  mode: "resume" | "commit",
): Promise<CanonicalEntryRegroupCommand>;
export async function readCanonicalEntryRegroupForm(
  request: Request,
  mode: "preview" | "resume" | "commit",
): Promise<CanonicalEntryRegroupRequest | CanonicalEntryRegroupCommand> {
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
      const split = pair.indexOf("="),
        decode = (value: string) =>
          decodeURIComponent(value.replace(/\+/gu, " "));
      const key = decode(split < 0 ? pair : pair.slice(0, split)),
        value = decode(split < 0 ? "" : pair.slice(split + 1));
      if (
        fields.has(key) ||
        (key !== "command" &&
          !(mode === "commit" && key === "wholeEntryAcknowledgement"))
      )
        fail("invalid_command", "review_again", 422);
      fields.set(key, value);
    }
    if (
      fields.size !== (mode === "commit" ? 2 : 1) ||
      (mode === "commit" &&
        fields.get("wholeEntryAcknowledgement") !== "accepted")
    )
      fail("invalid_command", "review_again", 422);
    const raw = compactJson(fields.get("command") ?? "");
    return mode === "preview"
      ? CanonicalEntryRegroupRequestSchema.parse(raw)
      : CanonicalEntryRegroupCommandSchema.parse(raw);
  } catch (error) {
    if (error instanceof CanonicalEntryRegroupError) throw error;
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
