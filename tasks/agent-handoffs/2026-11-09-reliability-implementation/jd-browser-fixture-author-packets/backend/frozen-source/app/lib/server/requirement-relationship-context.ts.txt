import { z } from "zod";
import { CanonicalError } from "./canonical-repository";
import { CanonicalResumeDraftSchema } from "./canonical-resume-schema";
import { DocumentEvidenceSchema } from "./document-evidence";
import { deriveEvidenceReviewTargets } from "./evidence-targets";
import { deriveEvidenceEntryAssociations } from "./evidence-entry-associations";
import {
  JobRequirementRelationsSchema,
  JOB_RELATION_ADMISSION_PROFILE_SHA256,
} from "./job-requirement-admission";
import {
  JOB_ALIAS_POLICY_VERSION,
  JOB_ALIAS_LEXICON_SHA256,
} from "./job-aliases";
import {
  LOCAL_JOB_RELATION_POLICY_VERSION,
  LOCAL_JOB_RELATION_POLICY_SHA256,
} from "./job-relations";
import {
  JOB_RELATION_UNICODE_PROFILE,
  JOB_RELATION_UNICODE_SHA256,
} from "./job-relation-unicode";
import type { createSupabaseAdminClient } from "./supabase";

type Client = Pick<ReturnType<typeof createSupabaseAdminClient>, "rpc">;
const uuid = z.uuid().regex(/^[a-f0-9-]+$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const revision = z.number().int().min(1).max(2_147_483_647);
export const REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES = Object.freeze({
  evidenceSchemaVersion: "evidence/2.0.0",
  fieldExtractorVersion: "evidence-fields/1.0.1",
  targetModelVersion: "evidence-targets/1.0.0",
  associationModelVersion: "evidence-entry-associations/1.0.0",
  correctionProjectionVersion: "canonical-corrections/1.0.1",
  regroupModelVersion: "canonical-entry-regroup/1.0.0",
  jdAdmissionProfileSha256: JOB_RELATION_ADMISSION_PROFILE_SHA256,
  aliasPolicyVersion: JOB_ALIAS_POLICY_VERSION,
  aliasLexiconSha256: JOB_ALIAS_LEXICON_SHA256,
  relationPolicyVersion: LOCAL_JOB_RELATION_POLICY_VERSION,
  relationPolicySha256: LOCAL_JOB_RELATION_POLICY_SHA256,
  unicodePolicyVersion: JOB_RELATION_UNICODE_PROFILE.schemaVersion,
  unicodePolicySha256: JOB_RELATION_UNICODE_SHA256,
  readinessProfileVersion: "requirement-relationship-readiness/1.0.0",
  readinessPredecessorSha256:
    "de6e71fed03732a391e35226d20816acd207267eef5f09c27017cee1f054f3fd",
} as const);
const profileSchema = z.strictObject({
  evidenceSchemaVersion: z.literal(
    REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES.evidenceSchemaVersion,
  ),
  fieldExtractorVersion: z.literal(
    REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES.fieldExtractorVersion,
  ),
  targetModelVersion: z.literal(
    REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES.targetModelVersion,
  ),
  associationModelVersion: z.literal(
    REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES.associationModelVersion,
  ),
  correctionProjectionVersion: z.literal(
    REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES.correctionProjectionVersion,
  ),
  regroupModelVersion: z.literal(
    REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES.regroupModelVersion,
  ),
  jdAdmissionProfileSha256: z.literal(
    REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES.jdAdmissionProfileSha256,
  ),
  aliasPolicyVersion: z.literal(
    REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES.aliasPolicyVersion,
  ),
  aliasLexiconSha256: z.literal(
    REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES.aliasLexiconSha256,
  ),
  relationPolicyVersion: z.literal(
    REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES.relationPolicyVersion,
  ),
  relationPolicySha256: z.literal(
    REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES.relationPolicySha256,
  ),
  unicodePolicyVersion: z.literal(
    REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES.unicodePolicyVersion,
  ),
  unicodePolicySha256: z.literal(
    REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES.unicodePolicySha256,
  ),
  readinessProfileVersion: z.literal(
    REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES.readinessProfileVersion,
  ),
  readinessPredecessorSha256: z.literal(
    REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES.readinessPredecessorSha256,
  ),
});
const citation = z
  .strictObject({
    attemptId: uuid,
    spanId: z.string().min(1).max(100),
    pageId: z.string().min(1).max(100),
    method: z.enum(["native_text", "local_ocr"]),
    start: z.number().int().min(0).max(200_000),
    end: z.number().int().min(1).max(200_000),
    pageStart: z.number().int().min(0).max(500_000),
    pageEnd: z.number().int().min(1).max(500_000),
  })
  .refine((v) => v.end > v.start && v.pageEnd > v.pageStart);
const field = z.enum(["employer", "role", "dates"]);
const sourceMember = z.strictObject({
  assertionId: z.string().min(1).max(100),
  field,
  citations: z.array(citation).length(1),
});
const sourceSelection = z.strictObject({
  pageId: z.string().min(1).max(100),
  method: z.enum(["native_text", "local_ocr"]),
  members: z.array(sourceMember).min(2).max(3),
});
const location = z
  .strictObject({
    kind: z.enum(["entry", "bullet"]),
    sectionId: uuid,
    entryId: uuid,
    bulletId: uuid.nullable(),
  })
  .refine((v) => (v.kind === "bullet") === (v.bulletId !== null));
const factSchema = CanonicalResumeDraftSchema.shape.facts.element;
const memberSchema = z
  .strictObject({
    sourceOrder: z.number().int().min(1).max(3),
    assertionId: z.string().min(1).max(100),
    field,
    factId: uuid,
    currentValue: factSchema.shape.value,
    currentState: factSchema.shape.state,
    confirmation: factSchema.shape.confirmation,
    sourceValue: factSchema.shape.value,
    citations: z.array(citation).length(1),
    location,
    mappedThrough: z.enum(["current_citations", "owned_ancestor_chain"]),
    originVersionId: uuid.nullable(),
    originFactId: uuid.nullable(),
  })
  .refine((v) =>
    v.mappedThrough === "current_citations"
      ? v.originVersionId === null && v.originFactId === null
      : v.originVersionId !== null && v.originFactId === v.factId,
  );
const group = z.strictObject({
  sectionId: uuid,
  entryId: uuid,
  originFamily: z.enum(["association", "regroup"]),
  batchId: uuid,
  groupId: uuid,
  originalApprovalVersionId: uuid,
  sourceSelection,
  members: z.array(memberSchema).min(2).max(3),
});
const prefix = z
  .strictObject({
    revision: z.number().int().min(0).max(1000),
    headId: uuid.nullable(),
  })
  .refine((v) => (v.revision === 0) === (v.headId === null));
const snapshot = z
  .strictObject({
    canonicalVersionId: uuid,
    canonicalContentSha256: digest,
    snapshotFamily: z.enum(["regroup", "association", "none"]),
    creationKind: z
      .enum([
        "regroup",
        "inherited",
        "restore",
        "legacy_bridge",
        "grouped_import",
        "legacy_empty",
      ])
      .nullable(),
    associationPrefix: prefix,
    regroupPrefix: prefix,
    groups: z.array(group).max(1000),
  })
  .refine((v) =>
    v.snapshotFamily === "none"
      ? v.creationKind === null && v.groups.length === 0
      : v.snapshotFamily === "regroup"
        ? ["regroup", "inherited", "restore", "legacy_bridge"].includes(
            v.creationKind ?? "",
          )
        : ["grouped_import", "inherited", "restore", "legacy_empty"].includes(
            v.creationKind ?? "",
          ),
  );
const source = z.strictObject({
  ownerId: uuid,
  organizationId: uuid,
  resumeId: uuid,
  analysisId: uuid,
  sourceId: uuid,
  attemptId: uuid,
  inputSha256: digest,
});
const canonical = z.strictObject({
  versionId: uuid,
  revision,
  contentSha256: digest,
  locale: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/u),
  content: CanonicalResumeDraftSchema,
});
const ancestor = z.strictObject({
  versionId: uuid,
  revision,
  contentSha256: digest,
  content: CanonicalResumeDraftSchema,
});
const available = z.strictObject({
  schemaVersion: z.literal("requirement-relationship-context/1.0.0"),
  status: z.literal("available"),
  authority: z.literal("owned_header_relations_only"),
  scoringEligible: z.literal(false),
  source,
  sourceMetadata: z.strictObject({ pageCount: revision.nullable() }),
  attempt: z.strictObject({
    id: uuid,
    attemptNumber: revision,
    envelope: DocumentEvidenceSchema,
  }),
  canonical,
  requirements: z.strictObject({
    versionId: uuid,
    revision,
    inputSha256: digest,
    contentSha256: digest,
    content: JobRequirementRelationsSchema,
  }),
  ancestors: z.array(ancestor).max(64),
  heads: z.strictObject({
    canonicalHeadId: uuid,
    canonicalHeadRevision: revision,
    requirementHeadId: uuid,
    requirementHeadRevision: revision,
  }),
  profiles: profileSchema,
  headerSnapshot: snapshot,
});
export const RequirementRelationshipContextSchema = z.discriminatedUnion(
  "status",
  [
    available,
    z.strictObject({
      schemaVersion: z.literal("requirement-relationship-context/1.0.0"),
      status: z.literal("not_found"),
      scoringEligible: z.literal(false),
    }),
    z.strictObject({
      schemaVersion: z.literal("requirement-relationship-context/1.0.0"),
      status: z.literal("unavailable"),
      scoringEligible: z.literal(false),
    }),
  ],
);
export type RequirementRelationshipContext = z.infer<typeof available>;
const optionsSchema = z.strictObject({
  canonicalVersionId: uuid.nullable().optional(),
  requirementVersionId: uuid.nullable().optional(),
});
export type RequirementRelationshipContextOptions = z.input<
  typeof optionsSchema
>;
export class RequirementRelationshipContextError extends CanonicalError {
  constructor(readonly reason: "invalid_input" | "not_found" | "unavailable") {
    super(
      reason === "invalid_input" ? 422 : reason === "not_found" ? 404 : 503,
      reason === "invalid_input"
        ? "Choose valid relationship context versions."
        : reason === "not_found"
          ? "Relationship context not found."
          : "Relationship context is unavailable.",
    );
  }
}
function invalid(): never {
  throw new RequirementRelationshipContextError("unavailable");
}
function bounded(raw: unknown) {
  let units = 0,
    nodes = 0;
  const parents = new Set<object>();
  function visit(value: unknown, depth: number) {
    if (++nodes > 2_000_000 || depth > 32) invalid();
    if (typeof value === "string") {
      units += value.length;
      if (units > 33_554_432) invalid();
    } else if (value !== null && typeof value === "object") {
      if (parents.has(value)) invalid();
      parents.add(value);
      if (Array.isArray(value)) {
        if (value.length > 400_000) invalid();
        for (const entry of value) visit(entry, depth + 1);
      } else {
        const keys = Object.keys(value);
        if (keys.length > 1000) invalid();
        for (const key of keys) {
          visit(key, depth + 1);
          visit((value as Record<string, unknown>)[key], depth + 1);
        }
      }
      parents.delete(value);
    }
  }
  visit(raw, 0);
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(raw);
  } catch {
    return invalid();
  }
  if (
    serialized === undefined ||
    Buffer.byteLength(serialized, "utf8") > 33_554_432
  )
    invalid();
}
const citeTuple = (v: {
  attemptId: string;
  spanId: string;
  start: number;
  end: number;
}) => [v.attemptId, v.spanId, v.start, v.end];
const completeCite = (v: z.infer<typeof citation>) => [
  ...citeTuple(v),
  v.pageId,
  v.method,
  v.pageStart,
  v.pageEnd,
];
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
function check(
  value: RequirementRelationshipContext,
  analysisId: string,
  ownerId: string,
  options: RequirementRelationshipContextOptions,
) {
  const {
    source: s,
    canonical: c,
    requirements: r,
    attempt,
    headerSnapshot: h,
  } = value;
  const doc = c.content,
    evidence = attempt.envelope,
    jd = r.content;
  if (
    s.ownerId !== ownerId ||
    s.analysisId !== analysisId ||
    attempt.id !== s.attemptId ||
    evidence.id !== s.attemptId ||
    evidence.ownerId !== ownerId ||
    evidence.analysisId !== analysisId ||
    evidence.sourceId !== s.sourceId ||
    evidence.inputSha256 !== s.inputSha256 ||
    evidence.fieldExtractorVersion !== value.profiles.fieldExtractorVersion ||
    doc.versionId !== c.versionId ||
    doc.locale !== c.locale ||
    doc.ownerId !== ownerId ||
    doc.organizationId !== s.organizationId ||
    doc.resumeId !== s.resumeId ||
    doc.analysisId !== analysisId ||
    doc.sourceEvidenceVersionId !== s.attemptId ||
    doc.inputSha256 !== s.inputSha256 ||
    doc.retentionPolicyId !== evidence.retentionPolicyId ||
    jd.id !== r.versionId ||
    jd.ownerId !== ownerId ||
    jd.organizationId !== s.organizationId ||
    jd.analysisId !== analysisId ||
    jd.inputSha256 !== r.inputSha256 ||
    (options.canonicalVersionId != null &&
      c.versionId !== options.canonicalVersionId) ||
    (options.requirementVersionId != null &&
      r.versionId !== options.requirementVersionId) ||
    h.canonicalVersionId !== c.versionId ||
    h.canonicalContentSha256 !== c.contentSha256
  )
    invalid();
  if (
    h.snapshotFamily === "association" &&
    h.groups.some((g) => g.originFamily !== "association")
  )
    invalid();
  const heads = value.heads;
  if (
    heads.canonicalHeadRevision < c.revision ||
    (heads.canonicalHeadId === c.versionId) !==
      (heads.canonicalHeadRevision === c.revision) ||
    heads.requirementHeadRevision < r.revision ||
    (heads.requirementHeadId === r.versionId) !==
      (heads.requirementHeadRevision === r.revision) ||
    (options.canonicalVersionId == null &&
      heads.canonicalHeadId !== c.versionId) ||
    (options.requirementVersionId == null &&
      heads.requirementHeadId !== r.versionId)
  )
    invalid();
  let prior = doc,
    rev = c.revision;
  const versionIds = new Set([doc.versionId]);
  for (const a of value.ancestors) {
    const d = a.content;
    if (
      prior.parentVersionId !== a.versionId ||
      a.revision !== rev - 1 ||
      d.versionId !== a.versionId ||
      versionIds.has(a.versionId) ||
      d.ownerId !== s.ownerId ||
      d.organizationId !== s.organizationId ||
      d.resumeId !== s.resumeId ||
      d.analysisId !== s.analysisId ||
      d.sourceEvidenceVersionId !== s.attemptId ||
      d.inputSha256 !== s.inputSha256 ||
      d.retentionPolicyId !== doc.retentionPolicyId
    )
      invalid();
    versionIds.add(a.versionId);
    prior = d;
    rev = a.revision;
  }
  if (prior.parentVersionId !== null && value.ancestors.length < 64) invalid();
  const all = [doc, ...value.ancestors.map((a) => a.content)];
  for (const d of all)
    for (const f of d.facts)
      if (
        f.state === "source_supported" ||
        (f.confirmation !== null &&
          (f.confirmation.actorId !== ownerId ||
            f.confirmation.value !== f.value)) ||
        (f.state === "candidate_confirmed") !== (f.confirmation !== null)
      )
        invalid();
  const targets = deriveEvidenceReviewTargets(evidence, s),
    associations = deriveEvidenceEntryAssociations(evidence, s);
  if (associations.state !== "review_required") invalid();
  const facts = new Map(doc.facts.map((f) => [f.id, f]));
  const locations = new Map<string, unknown[]>();
  const entryOrder = new Map<string, number>();
  let order = 0;
  const put = (id: string, place: unknown) =>
    locations.set(id, [...(locations.get(id) ?? []), place]);
  for (const id of doc.contactFactIds)
    put(id, {
      kind: "contact",
      sectionId: null,
      entryId: null,
      bulletId: null,
    });
  for (const section of doc.sections) {
    for (const id of section.factIds)
      put(id, {
        kind: "section",
        sectionId: section.id,
        entryId: null,
        bulletId: null,
      });
    for (const entry of section.entries) {
      entryOrder.set(section.id + ":" + entry.id, order++);
      for (const id of entry.factIds)
        put(id, {
          kind: "entry",
          sectionId: section.id,
          entryId: entry.id,
          bulletId: null,
        });
      for (const b of entry.bullets)
        for (const id of b.factIds)
          put(id, {
            kind: "bullet",
            sectionId: section.id,
            entryId: entry.id,
            bulletId: b.id,
          });
    }
  }
  const usedFacts = new Set<string>(),
    usedAssertions = new Set<string>(),
    usedGroups = new Set<string>();
  let previousOrder = -1;
  for (const g of h.groups) {
    const locationOrder = entryOrder.get(g.sectionId + ":" + g.entryId);
    if (
      locationOrder === undefined ||
      locationOrder <= previousOrder ||
      usedGroups.has(g.originFamily + ":" + g.groupId)
    )
      invalid();
    previousOrder = locationOrder;
    usedGroups.add(g.originFamily + ":" + g.groupId);
    const sourceGroup = associations.groups.find(
      (a) =>
        a.pageId === g.sourceSelection.pageId &&
        a.method === g.sourceSelection.method &&
        equal(
          a.members.map((m) => [
            m.assertionId,
            m.field,
            m.citations.map((c) =>
              completeCite({ attemptId: s.attemptId, ...c }),
            ),
          ]),
          g.sourceSelection.members.map((m) => [
            m.assertionId,
            m.field,
            m.citations.map(completeCite),
          ]),
        ),
    );
    if (
      !sourceGroup ||
      g.members.length !== g.sourceSelection.members.length ||
      doc.sections.find((x) => x.id === g.sectionId)?.type !== "experience"
    )
      invalid();
    for (const [i, m] of g.members.entries()) {
      const f = facts.get(m.factId),
        observed = targets.observations.find(
          (x) => x.assertionId === m.assertionId,
        ),
        sm = g.sourceSelection.members[i];
      if (
        !f ||
        !observed ||
        usedFacts.has(m.factId) ||
        usedAssertions.has(m.assertionId) ||
        m.sourceOrder !== i + 1 ||
        f.type !== m.field ||
        m.currentValue !== f.value ||
        m.currentState !== f.state ||
        !equal(m.confirmation, f.confirmation) ||
        m.sourceValue !== observed.value ||
        observed.field !== m.field ||
        sm.assertionId !== m.assertionId ||
        sm.field !== m.field ||
        !equal(
          m.citations.map(completeCite),
          observed.citations.map((c) =>
            completeCite({ attemptId: s.attemptId, ...c }),
          ),
        ) ||
        !equal(m.citations.map(completeCite), sm.citations.map(completeCite)) ||
        m.location.sectionId !== g.sectionId ||
        m.location.entryId !== g.entryId ||
        !equal(locations.get(f.id), [m.location])
      )
        invalid();
      usedFacts.add(m.factId);
      usedAssertions.add(m.assertionId);
      let origin = f,
        originVersion: string | null = null;
      if (!origin.sources.length) {
        for (const a of value.ancestors) {
          const next = a.content.facts.find((x) => x.id === f.id);
          if (!next || next.type !== f.type) invalid();
          origin = next;
          if (origin.sources.length) {
            originVersion = a.versionId;
            break;
          }
        }
        if (originVersion === null) invalid();
      }
      if (
        m.mappedThrough !==
          (originVersion === null
            ? "current_citations"
            : "owned_ancestor_chain") ||
        m.originVersionId !== originVersion ||
        m.originFactId !== (originVersion === null ? null : f.id) ||
        origin.value !== m.sourceValue ||
        !equal(origin.sources.map(citeTuple), m.citations.map(citeTuple))
      )
        invalid();
    }
  }
}
/** Reads server-owned header witnesses only. Parsing does not grant source or scoring authority. */
export async function loadRequirementRelationshipContext(
  client: Client,
  analysisId: string,
  ownerId: string,
  raw: unknown = {},
): Promise<RequirementRelationshipContext> {
  const options = optionsSchema.safeParse(raw);
  if (
    !uuid.safeParse(analysisId).success ||
    !uuid.safeParse(ownerId).success ||
    !options.success
  )
    throw new RequirementRelationshipContextError("invalid_input");
  let result;
  try {
    result = await client.rpc("read_requirement_relationship_context", {
      p_user_id: ownerId,
      p_analysis_id: analysisId,
      p_selection: {
        canonicalVersionId: options.data.canonicalVersionId ?? null,
        requirementVersionId: options.data.requirementVersionId ?? null,
      },
    });
  } catch {
    throw new RequirementRelationshipContextError("unavailable");
  }
  if (result.error)
    throw new RequirementRelationshipContextError("unavailable");
  return validateRequirementRelationshipContext(
    result.data,
    analysisId,
    ownerId,
    options.data,
  );
}

/** Full bounded decoder shared by owned readers and pure downstream projections; never authenticates a caller. */
export function validateRequirementRelationshipContext(
  raw: unknown,
  analysisId: string,
  ownerId: string,
  rawOptions: unknown = {},
): RequirementRelationshipContext {
  const options = optionsSchema.safeParse(rawOptions);
  if (
    !uuid.safeParse(analysisId).success ||
    !uuid.safeParse(ownerId).success ||
    !options.success
  )
    throw new RequirementRelationshipContextError("invalid_input");
  try {
    bounded(raw);
    const parsed = RequirementRelationshipContextSchema.safeParse(raw);
    if (!parsed.success) invalid();
    if (parsed.data.status !== "available")
      throw new RequirementRelationshipContextError(parsed.data.status);
    check(parsed.data, analysisId, ownerId, options.data);
    return parsed.data;
  } catch (error) {
    if (error instanceof RequirementRelationshipContextError) throw error;
    return invalid();
  }
}
