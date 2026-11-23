import { createHash } from "node:crypto";
import { z } from "zod";

export const PILOT_ROLES = [
  "legal",
  "fairness",
  "security",
  "privacy",
  "domain",
  "product",
] as const;
export const PILOT_OPERATIONS = [
  "notice",
  "human_override",
  "correction_appeal",
  "retention",
  "audit",
  "stop",
  "rollback",
  "monitoring",
] as const;
export const PILOT_METRICS = [
  "rubric_agreement",
  "correction_rate",
  "user_comprehension",
  "workflow_usefulness",
  "fairness_disparity",
  "error_rate",
  "safety_incidents",
  "latency_ms",
  "cost_usd",
] as const;
const opaque = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.iso.datetime({ offset: true });
const reference = z.strictObject({ reference: opaque, artifactHash: sha256 });
const optionalReference = reference.nullable();
const measuredAt = { recordedAt: time, evidence: reference };

export const pilotProtocolSchema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.enum(["prerelease_engineering", "external_pilot"]),
  id: opaque,
  createdBy: opaque,
  scope: z.strictObject({
    domain: z.string().min(1).max(32),
    language: z.string().min(1).max(16),
    locale: z.string().min(1).max(16),
  }),
  vendor: z
    .strictObject({
      name: z.string().min(1).max(80),
      version: z.string().min(1).max(80),
      configurationHash: sha256,
    })
    .nullable(),
  partnerReference: opaque.nullable(),
  environmentReference: opaque.nullable(),
  corpus: z.strictObject({
    corpusVersion: opaque,
    lockHash: sha256,
    annotationEvidenceHash: sha256,
  }),
  documentHashes: z.array(sha256).min(1).max(256),
  participantReferences: z.array(opaque).max(256),
  startsAt: time,
  endsAt: time,
  retentionUntil: time,
  controls: z.strictObject({
    notice: opaque,
    human_override: opaque,
    correction_appeal: opaque,
    retention: opaque,
    audit: opaque,
    stop: opaque,
    rollback: opaque,
    monitoring: opaque,
    rubric: opaque,
    claim: opaque,
  }),
  claimTextHash: sha256,
  limitations: z.array(opaque).min(1).max(32),
  criteria: z
    .array(
      z
        .strictObject({
          metric: z.enum(PILOT_METRICS),
          comparison: z.enum(["minimum", "maximum"]),
          value: z.number().finite(),
        })
        .refine((row) => validMetric(row.metric, row.value)),
    )
    .max(9),
  restrictions: z.strictObject({
    advisoryOnly: z.boolean(),
    visibleRubric: z.boolean(),
    overrideRequiresRationale: z.boolean(),
    automaticRejection: z.boolean(),
    hiddenScore: z.boolean(),
    proprietaryScoreInference: z.boolean(),
    generalVendorEquivalence: z.boolean(),
    selectionProbabilityClaims: z.boolean(),
  }),
});

const observation = z
  .strictObject({
    documentHash: sha256,
    attempt: z.number().int().min(1).max(16),
    outcome: z.enum(["accepted", "rejected", "error"]),
    outputHash: sha256.nullable(),
    errorCode: z
      .enum([
        "unsupported_input",
        "ingestion_failed",
        "timeout",
        "vendor_rejected",
      ])
      .nullable(),
    limitations: z.array(opaque).min(1).max(32),
    ...measuredAt,
  })
  .refine((row) =>
    row.outcome === "accepted"
      ? row.outputHash !== null && row.errorCode === null
      : row.outputHash === null && row.errorCode !== null,
  );

function validMetric(metric: (typeof PILOT_METRICS)[number], value: number) {
  if (metric === "rubric_agreement") return value >= -1 && value <= 1;
  if (metric === "safety_incidents")
    return Number.isInteger(value) && value >= 0;
  if (metric === "latency_ms" || metric === "cost_usd") return value >= 0;
  return value >= 0 && value <= 1;
}

export const pilotEvidenceSchema = z.strictObject({
  schemaVersion: z.literal(1),
  protocolHash: sha256,
  evidenceTier: z.enum(["synthetic_engineering", "observed_pilot"]),
  runReference: opaque,
  runBy: opaque,
  startedAt: time,
  completedAt: time,
  ownerApproval: optionalReference,
  technicalReview: optionalReference,
  approvals: z
    .array(z.strictObject({ role: z.enum(PILOT_ROLES), evidence: reference }))
    .max(6),
  prerequisites: z.strictObject({
    aa8: optionalReference,
    enterprise: optionalReference,
  }),
  environmentAuthorization: optionalReference,
  rightsAuthorization: optionalReference,
  execution: optionalReference,
  independentReview: optionalReference,
  observations: z.array(observation).max(512),
  outcomes: z
    .array(
      z
        .strictObject({
          metric: z.enum(PILOT_METRICS),
          value: z.number().finite(),
          sampleSize: z.number().int().min(1).max(1_000_000),
          ...measuredAt,
        })
        .refine((row) => validMetric(row.metric, row.value)),
    )
    .max(9),
  operations: z
    .array(
      z.strictObject({
        operation: z.enum(PILOT_OPERATIONS),
        passed: z.boolean(),
        ...measuredAt,
      }),
    )
    .max(8),
  notices: z
    .array(z.strictObject({ participantReference: opaque, ...measuredAt }))
    .max(256),
  decisions: z
    .array(
      z.strictObject({
        participantReference: opaque,
        reviewerReference: opaque,
        action: z.enum(["confirmed", "overridden"]),
        rationaleReference: opaque,
        ...measuredAt,
      }),
    )
    .max(256),
});

const receiptSchema = z.strictObject({
  reference: opaque,
  artifactHash: sha256,
  protocolHash: sha256,
  payloadHash: sha256,
  kind: z.enum([
    "owner_approval",
    "technical_review",
    "protocol_approval",
    "aa8_gate",
    "enterprise_gate",
    "environment",
    "rights",
    "execution",
    "observation",
    "outcome",
    "operation",
    "notice",
    "decision",
    "independent_review",
  ]),
  actorReference: opaque,
  actorKind: z.enum(["human", "ai", "service"]),
  role: z.enum(PILOT_ROLES).nullable(),
  status: z.enum(["verified", "revoked"]),
  recordedAt: time,
  expiresAt: time,
});

/** Server-owned verified receipt store, never constructed from request JSON. */
export type PilotEvidenceAuthority = { receipt(reference: string): unknown };
export type PilotProtocol = z.infer<typeof pilotProtocolSchema>;
export type PilotEvidence = z.infer<typeof pilotEvidenceSchema>;
type Receipt = z.infer<typeof receiptSchema>;

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a === b ? 0 : a < b ? -1 : 1))
        .map(([key, item]) => [key, stable(item)]),
    );
  return value;
}
function digest(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}
export function hashPilotProtocol(value: unknown): string | null {
  const parsed = pilotProtocolSchema.safeParse(value);
  return parsed.success ? digest(parsed.data) : null;
}
export function hashPilotEvidence(value: unknown): string | null {
  const parsed = pilotEvidenceSchema.safeParse(value);
  if (!parsed.success) return null;
  // Reviews attest this frozen bundle; their own receipt hashes cannot hash themselves.
  return digest({
    ...parsed.data,
    technicalReview: null,
    independentReview: null,
  });
}

export type PilotReasonCode =
  | "INVALID_PROTOCOL"
  | "INVALID_EVIDENCE"
  | "INVALID_AS_OF"
  | "UNSAFE_CAPABILITY"
  | "OUT_OF_SCOPE"
  | "INVALID_TIME_RANGE"
  | "PROTOCOL_BINDING"
  | "DUPLICATE_DOCUMENT_HASH"
  | "AUTHORITY_REQUIRED"
  | "SYNTHETIC_EVIDENCE_ONLY"
  | "EVIDENCE_TIER_MISMATCH"
  | "OWNER_APPROVAL_REQUIRED"
  | "TECHNICAL_REVIEW_REQUIRED"
  | "PROTOCOL_APPROVAL_REQUIRED"
  | "PREREQUISITE_EVIDENCE_REQUIRED"
  | "ENVIRONMENT_AUTHORIZATION_REQUIRED"
  | "DOCUMENT_RIGHTS_REQUIRED"
  | "EXECUTION_EVIDENCE_REQUIRED"
  | "INCOMPLETE_OBSERVATIONS"
  | "NON_REPEATABLE_OBSERVATIONS"
  | "OBSERVATION_EVIDENCE_REQUIRED"
  | "INCOMPLETE_OUTCOMES"
  | "OUTCOME_EVIDENCE_REQUIRED"
  | "OUTCOME_CRITERIA_NOT_MET"
  | "OPERATIONAL_CONTROLS_REQUIRED"
  | "PARTICIPANT_NOTICE_OR_DECISION_REQUIRED"
  | "INDEPENDENT_REVIEW_REQUIRED";
export type PilotAssessment = {
  schemaVersion: 1;
  status: "rejected" | "blocked" | "engineering_ready" | "ready";
  engineeringReady: boolean;
  protocolApproved: boolean;
  vendorObservationReady: boolean;
  advisoryPilotReady: boolean;
  phaseGateReady: boolean;
  technicalReviewKind: "human" | "ai" | null;
  documentCount: number;
  observationCount: number;
  ingestionErrorCount: number;
  outcomeCount: number;
  participantCount: number;
  reasonCodes: PilotReasonCode[];
};

/** Assesses scoped evidence; does not execute a pilot, publish a claim or activate employer mode. */
export function assessPilotEvidence(
  protocol: unknown,
  evidence: unknown,
  asOf: string,
  authority?: PilotEvidenceAuthority,
): PilotAssessment {
  const result: PilotAssessment = {
    schemaVersion: 1,
    status: "rejected",
    engineeringReady: false,
    protocolApproved: false,
    vendorObservationReady: false,
    advisoryPilotReady: false,
    phaseGateReady: false,
    technicalReviewKind: null,
    documentCount: 0,
    observationCount: 0,
    ingestionErrorCount: 0,
    outcomeCount: 0,
    participantCount: 0,
    reasonCodes: [],
  };
  const reasons = new Set<PilotReasonCode>();
  const finish = () => ({ ...result, reasonCodes: [...reasons] });
  const plan = pilotProtocolSchema.safeParse(protocol);
  if (!plan.success) {
    reasons.add("INVALID_PROTOCOL");
    return finish();
  }
  const p = plan.data;
  if (new Set(p.documentHashes).size !== p.documentHashes.length) {
    reasons.add("DUPLICATE_DOCUMENT_HASH");
    return finish();
  }
  const flags = p.restrictions;
  if (
    !flags.advisoryOnly ||
    !flags.visibleRubric ||
    !flags.overrideRequiresRationale ||
    flags.automaticRejection ||
    flags.hiddenScore ||
    flags.proprietaryScoreInference ||
    flags.generalVendorEquivalence ||
    flags.selectionProbabilityClaims
  ) {
    reasons.add("UNSAFE_CAPABILITY");
    return finish();
  }
  if (
    p.scope.domain !== "software_engineering" ||
    p.scope.language !== "en" ||
    p.scope.locale !== "IN"
  ) {
    reasons.add("OUT_OF_SCOPE");
    return finish();
  }
  const run = pilotEvidenceSchema.safeParse(evidence);
  if (!run.success) {
    reasons.add("INVALID_EVIDENCE");
    return finish();
  }
  if (!time.safeParse(asOf).success) {
    reasons.add("INVALID_AS_OF");
    return finish();
  }
  const e = run.data;
  const now = Date.parse(asOf);
  const start = Date.parse(e.startedAt);
  const end = Date.parse(e.completedAt);
  if (!(
    Date.parse(p.startsAt) <= start &&
    start <= end &&
    end <= now &&
    end <= Date.parse(p.endsAt) &&
    Date.parse(p.startsAt) < Date.parse(p.endsAt) &&
    Date.parse(p.endsAt) <= Date.parse(p.retentionUntil) &&
    now < Date.parse(p.retentionUntil)
  )) {
    reasons.add("INVALID_TIME_RANGE");
    return finish();
  }
  const protocolHash = hashPilotProtocol(p)!;
  const bundleHash = hashPilotEvidence(e)!;
  if (e.protocolHash !== protocolHash) {
    reasons.add("PROTOCOL_BINDING");
    return finish();
  }
  Object.assign(result, {
    status: "blocked",
    documentCount: p.documentHashes.length,
    observationCount: e.observations.length,
    ingestionErrorCount: e.observations.filter(
      (row) => row.outcome !== "accepted",
    ).length,
    outcomeCount: e.outcomes.length,
    participantCount: p.participantReferences.length,
  });
  if (typeof authority?.receipt !== "function") {
    reasons.add("AUTHORITY_REQUIRED");
    return finish();
  }

  const receiptSnapshot = new Map<string, Receipt | null>();
  function resolved(
    ref: z.infer<typeof optionalReference>,
    kind: Receipt["kind"],
    payloadHash: string,
    options: {
      human?: boolean;
      before?: number;
      after?: number;
      role?: Receipt["role"];
      actor?: string;
    } = {},
  ): Receipt | null {
    if (!ref) return null;
    try {
      if (!receiptSnapshot.has(ref.reference)) {
        const parsed = receiptSchema.safeParse(
          authority!.receipt(ref.reference),
        );
        receiptSnapshot.set(ref.reference, parsed.success ? parsed.data : null);
      }
      const r = receiptSnapshot.get(ref.reference);
      if (!r) return null;
      const issued = Date.parse(r.recordedAt);
      return r.reference === ref.reference &&
        r.artifactHash === ref.artifactHash &&
        r.kind === kind &&
        r.protocolHash === protocolHash &&
        r.payloadHash === payloadHash &&
        r.status === "verified" &&
        issued <= now &&
        now < Date.parse(r.expiresAt) &&
        issued < Date.parse(r.expiresAt) &&
        (!options.human || r.actorKind === "human") &&
        (options.before === undefined || issued <= options.before) &&
        (options.after === undefined || issued >= options.after) &&
        (options.role === undefined || r.role === options.role) &&
        (options.actor === undefined || r.actorReference === options.actor)
        ? r
        : null;
    } catch {
      receiptSnapshot.set(ref.reference, null);
      return null; // Resolver failure never returns private store diagnostics.
    }
  }
  if (p.mode === "prerelease_engineering") {
    if (e.evidenceTier !== "synthetic_engineering")
      reasons.add("EVIDENCE_TIER_MISMATCH");
    const owner = resolved(e.ownerApproval, "owner_approval", protocolHash, {
      human: true,
    });
    const review = resolved(e.technicalReview, "technical_review", bundleHash, {
      after: end,
    });
    if (!owner) reasons.add("OWNER_APPROVAL_REQUIRED");
    if (!review || review.actorKind === "service")
      reasons.add("TECHNICAL_REVIEW_REQUIRED");
    result.protocolApproved = !!owner;
    result.technicalReviewKind =
      review?.actorKind === "ai" || review?.actorKind === "human"
        ? review.actorKind
        : null;
    result.engineeringReady = reasons.size === 0;
    if (result.engineeringReady) result.status = "engineering_ready";
    return finish();
  }

  if (e.evidenceTier !== "observed_pilot")
    reasons.add("SYNTHETIC_EVIDENCE_ONLY");
  const approvedRoles = new Set(
    e.approvals
      .filter((row) =>
        resolved(row.evidence, "protocol_approval", protocolHash, {
          human: true,
          role: row.role,
          before: start,
        }),
      )
      .map((row) => row.role),
  );
  result.protocolApproved =
    approvedRoles.size === PILOT_ROLES.length &&
    e.approvals.length === PILOT_ROLES.length;
  if (!result.protocolApproved) reasons.add("PROTOCOL_APPROVAL_REQUIRED");
  const prerequisites =
    !!resolved(e.prerequisites.aa8, "aa8_gate", protocolHash, {
      before: start,
    }) &&
    !!resolved(e.prerequisites.enterprise, "enterprise_gate", protocolHash, {
      before: start,
    });
  if (!prerequisites) reasons.add("PREREQUISITE_EVIDENCE_REQUIRED");
  const environment =
    !!p.vendor &&
    !!p.partnerReference &&
    !!p.environmentReference &&
    !!resolved(e.environmentAuthorization, "environment", protocolHash, {
      before: start,
    });
  if (!environment) reasons.add("ENVIRONMENT_AUTHORIZATION_REQUIRED");
  const rights = !!resolved(e.rightsAuthorization, "rights", protocolHash, {
    before: start,
  });
  if (!rights) reasons.add("DOCUMENT_RIGHTS_REQUIRED");
  const executed = !!resolved(e.execution, "execution", bundleHash, {
    after: end,
    actor: e.runBy,
  });
  if (!executed) reasons.add("EXECUTION_EVIDENCE_REQUIRED");
  const inRun = (value: string) =>
    start <= Date.parse(value) && Date.parse(value) <= end;
  const observed = e.observations.every(
    (row) =>
      p.documentHashes.includes(row.documentHash) &&
      inRun(row.recordedAt) &&
      !!resolved(row.evidence, "observation", bundleHash, {
        after: Date.parse(row.recordedAt),
      }),
  );
  if (!observed) reasons.add("OBSERVATION_EVIDENCE_REQUIRED");
  let repeatable = true;
  const covered = p.documentHashes.every((documentHash) => {
    const attempts = e.observations.filter(
      (row) => row.documentHash === documentHash,
    );
    if (
      attempts.length < 2 ||
      new Set(attempts.map((row) => row.attempt)).size !== attempts.length ||
      new Set(attempts.map((row) => row.evidence.reference)).size !==
        attempts.length
    )
      return false;
    if (
      new Set(
        attempts.map((row) =>
          JSON.stringify([row.outcome, row.outputHash, row.errorCode]),
        ),
      ).size !== 1
    )
      repeatable = false;
    return true;
  });
  if (!covered) reasons.add("INCOMPLETE_OBSERVATIONS");
  if (!repeatable) reasons.add("NON_REPEATABLE_OBSERVATIONS");
  const metrics = new Set(e.outcomes.map((row) => row.metric));
  const completeOutcomes =
    metrics.size === PILOT_METRICS.length &&
    metrics.size === e.outcomes.length &&
    new Set(p.criteria.map((row) => row.metric)).size ===
      PILOT_METRICS.length &&
    p.criteria.length === PILOT_METRICS.length;
  if (!completeOutcomes) reasons.add("INCOMPLETE_OUTCOMES");
  const measured = e.outcomes.every(
    (row) =>
      inRun(row.recordedAt) &&
      !!resolved(row.evidence, "outcome", bundleHash, {
        after: Date.parse(row.recordedAt),
      }),
  );
  if (!measured) reasons.add("OUTCOME_EVIDENCE_REQUIRED");
  const meetsCriteria =
    completeOutcomes &&
    p.criteria.every((criterion) => {
      const value = e.outcomes.find(
        (row) => row.metric === criterion.metric,
      )!.value;
      return criterion.comparison === "minimum"
        ? value >= criterion.value
        : value <= criterion.value;
    });
  if (completeOutcomes && !meetsCriteria)
    reasons.add("OUTCOME_CRITERIA_NOT_MET");
  const operational =
    e.operations.length === PILOT_OPERATIONS.length &&
    new Set(e.operations.map((row) => row.operation)).size ===
      PILOT_OPERATIONS.length &&
    e.operations.every(
      (row) =>
        row.passed &&
        inRun(row.recordedAt) &&
        !!resolved(row.evidence, "operation", bundleHash, {
          after: Date.parse(row.recordedAt),
        }),
    );
  if (!operational) reasons.add("OPERATIONAL_CONTROLS_REQUIRED");
  const participants = p.participantReferences;
  const participantEvidence =
    participants.length > 0 &&
    new Set(participants).size === participants.length &&
    e.notices.every(
      (row) =>
        participants.includes(row.participantReference) &&
        Date.parse(p.startsAt) <= Date.parse(row.recordedAt) &&
        Date.parse(row.recordedAt) <= start &&
        !!resolved(row.evidence, "notice", bundleHash, {
          after: Date.parse(row.recordedAt),
        }),
    ) &&
    e.decisions.every(
      (row) =>
        participants.includes(row.participantReference) &&
        row.reviewerReference !== row.participantReference &&
        inRun(row.recordedAt) &&
        !!resolved(row.evidence, "decision", bundleHash, {
          human: true,
          actor: row.reviewerReference,
          after: Date.parse(row.recordedAt),
        }),
    ) &&
    participants.every(
      (participant) =>
        e.notices.some((row) => row.participantReference === participant) &&
        e.decisions.some((row) => row.participantReference === participant),
    );
  if (!participantEvidence)
    reasons.add("PARTICIPANT_NOTICE_OR_DECISION_REQUIRED");
  const review = resolved(
    e.independentReview,
    "independent_review",
    bundleHash,
    { human: true, after: end },
  );
  const independent =
    !!review &&
    review.actorReference !== p.createdBy &&
    review.actorReference !== e.runBy &&
    !e.decisions.some((row) => row.reviewerReference === review.actorReference);
  if (!independent) reasons.add("INDEPENDENT_REVIEW_REQUIRED");
  const common =
    result.protocolApproved &&
    prerequisites &&
    environment &&
    rights &&
    executed &&
    independent &&
    e.evidenceTier === "observed_pilot";
  result.vendorObservationReady = common && observed && covered && repeatable;
  result.advisoryPilotReady =
    common && measured && meetsCriteria && operational && participantEvidence;
  result.phaseGateReady =
    result.vendorObservationReady && result.advisoryPilotReady;
  if (result.phaseGateReady) result.status = "ready";
  return finish();
}
