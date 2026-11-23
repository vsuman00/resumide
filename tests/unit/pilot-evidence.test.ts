import { describe, expect, it } from "vitest";
import {
  assessPilotEvidence,
  hashPilotEvidence,
  hashPilotProtocol,
  PILOT_METRICS,
  PILOT_OPERATIONS,
  PILOT_ROLES,
  pilotEvidenceSchema,
  pilotProtocolSchema,
  type PilotEvidenceAuthority,
} from "../../app/lib/server/pilot-evidence";

// Contract fixtures only: no partner, human approval or pilot run occurred.
const digest = (digit: string) => digit.repeat(64);
const ref = (name: string) => ({
  reference: `fixture-${name}-0001`,
  artifactHash: digest("a"),
});
const clock = "2026-11-07T12:00:00Z";
function protocol(external = false) {
  return {
    schemaVersion: 1,
    mode: external ? "external_pilot" : "prerelease_engineering",
    id: "fixture-protocol-0001",
    createdBy: "fixture-owner-0001",
    scope: { domain: "software_engineering", language: "en", locale: "IN" },
    vendor: external
      ? {
          name: "Fictional vendor",
          version: "fixture-1",
          configurationHash: digest("b"),
        }
      : null,
    partnerReference: external ? "fixture-partner-0001" : null,
    environmentReference: external ? "fixture-environment-0001" : null,
    corpus: {
      corpusVersion: "fixture-corpus-0001",
      lockHash: digest("c"),
      annotationEvidenceHash: digest("d"),
    },
    documentHashes: [digest("e")],
    participantReferences: ["fixture-participant-0001"],
    startsAt: "2026-11-07T00:00:00Z",
    endsAt: "2026-11-08T00:00:00Z",
    retentionUntil: "2026-11-30T00:00:00Z",
    controls: Object.fromEntries(
      [...PILOT_OPERATIONS, "rubric", "claim"].map((key) => [
        key,
        `fixture-${key}-policy`,
      ]),
    ),
    claimTextHash: digest("f"),
    limitations: ["fixture-limitations-0001"],
    criteria: PILOT_METRICS.map((metric) => ({
      metric,
      comparison: [
        "rubric_agreement",
        "user_comprehension",
        "workflow_usefulness",
      ].includes(metric)
        ? "minimum"
        : "maximum",
      value: [
        "rubric_agreement",
        "user_comprehension",
        "workflow_usefulness",
      ].includes(metric)
        ? 0.25
        : 1,
    })),
    restrictions: {
      advisoryOnly: true,
      visibleRubric: true,
      overrideRequiresRationale: true,
      automaticRejection: false,
      hiddenScore: false,
      proprietaryScoreInference: false,
      generalVendorEquivalence: false,
      selectionProbabilityClaims: false,
    },
  };
}
function evidence(plan = protocol(), external = false) {
  return {
    schemaVersion: 1,
    protocolHash: hashPilotProtocol(plan),
    evidenceTier: external ? "observed_pilot" : "synthetic_engineering",
    runReference: "fixture-run-0001",
    runBy: "fixture-operator-0001",
    startedAt: "2026-11-07T10:00:00Z",
    completedAt: "2026-11-07T10:10:00Z",
    ownerApproval: ref("owner-approval"),
    technicalReview: ref("technical-review"),
    approvals: PILOT_ROLES.map((role) => ({
      role,
      evidence: ref(`approval-${role}`),
    })),
    prerequisites: { aa8: ref("aa8-gate"), enterprise: ref("enterprise-gate") },
    environmentAuthorization: ref("environment"),
    rightsAuthorization: ref("rights"),
    execution: ref("execution"),
    independentReview: ref("independent-review"),
    observations: [1, 2].map((attempt) => ({
      documentHash: digest("e"),
      attempt,
      outcome: "accepted",
      outputHash: digest("1"),
      errorCode: null,
      recordedAt: "2026-11-07T10:05:00Z",
      limitations: ["fixture-limitations-0001"],
      evidence: ref(`observation-${attempt}`),
    })),
    outcomes: PILOT_METRICS.map((metric) => ({
      metric,
      value: metric === "safety_incidents" ? 0 : 0.5,
      sampleSize: 1,
      recordedAt: "2026-11-07T10:06:00Z",
      evidence: ref(`outcome-${metric}`),
    })),
    operations: PILOT_OPERATIONS.map((operation) => ({
      operation,
      passed: true,
      recordedAt: "2026-11-07T10:06:00Z",
      evidence: ref(`operation-${operation}`),
    })),
    notices: [
      {
        participantReference: "fixture-participant-0001",
        recordedAt: "2026-11-07T09:00:00Z",
        evidence: ref("notice"),
      },
    ],
    decisions: [
      {
        participantReference: "fixture-participant-0001",
        reviewerReference: "fixture-adviser-0001",
        action: "overridden",
        rationaleReference: "fixture-rationale-0001",
        recordedAt: "2026-11-07T10:07:00Z",
        evidence: ref("decision"),
      },
    ],
  };
}

function authority(planInput: unknown, runInput: unknown) {
  const plan = pilotProtocolSchema.parse(planInput);
  const run = pilotEvidenceSchema.parse(runInput);
  const receipts = new Map<string, Record<string, unknown>>();
  const protocolHash = hashPilotProtocol(plan);
  const bundleHash = hashPilotEvidence(run);
  const put = (
    entry: ReturnType<typeof ref> | null,
    kind: string,
    payloadHash = bundleHash,
    actorKind = "service",
    actorReference = "fixture-service-0001",
    role: string | null = null,
  ) => {
    if (!entry) return;
    receipts.set(entry.reference, {
      ...entry,
      kind,
      protocolHash,
      payloadHash,
      actorKind,
      actorReference,
      role,
      status: "verified",
      recordedAt: "2026-11-07T10:20:00Z",
      expiresAt: "2026-11-30T00:00:00Z",
    });
  };
  put(
    run.ownerApproval,
    "owner_approval",
    protocolHash,
    "human",
    plan.createdBy,
  );
  put(
    run.technicalReview,
    "technical_review",
    bundleHash,
    "ai",
    "fixture-agent-0001",
  );
  for (const approval of run.approvals) {
    put(
      approval.evidence,
      "protocol_approval",
      protocolHash,
      "human",
      plan.createdBy,
      approval.role,
    );
    receipts.get(approval.evidence.reference)!.recordedAt =
      "2026-11-07T00:30:00Z";
  }
  for (const [entry, kind] of [
    [run.environmentAuthorization, "environment"],
    [run.rightsAuthorization, "rights"],
    [run.prerequisites.aa8, "aa8_gate"],
    [run.prerequisites.enterprise, "enterprise_gate"],
  ] as const) {
    put(entry, kind, protocolHash);
    if (entry)
      receipts.get(entry.reference)!.recordedAt = "2026-11-07T00:30:00Z";
  }
  put(run.execution, "execution", bundleHash, "human", run.runBy);
  for (const entry of run.observations) put(entry.evidence, "observation");
  for (const entry of run.outcomes) put(entry.evidence, "outcome");
  for (const entry of run.operations) put(entry.evidence, "operation");
  for (const entry of run.notices) put(entry.evidence, "notice");
  for (const entry of run.decisions)
    put(
      entry.evidence,
      "decision",
      bundleHash,
      "human",
      entry.reviewerReference,
    );
  put(
    run.independentReview,
    "independent_review",
    bundleHash,
    "human",
    "fixture-independent-0001",
  );
  return {
    receipts,
    context: {
      receipt: (reference: string) => receipts.get(reference),
    } satisfies PilotEvidenceAuthority,
  };
}

describe("advisory pilot evidence", () => {
  it("allows one owner plus declared AI technical review for prerelease engineering", () => {
    const plan = protocol();
    const run = {
      ...evidence(plan),
      approvals: [],
      prerequisites: { aa8: null, enterprise: null },
      environmentAuthorization: null,
      rightsAuthorization: null,
      execution: null,
      independentReview: null,
      observations: [],
      outcomes: [],
      operations: [],
      notices: [],
      decisions: [],
    };
    const { context } = authority(plan, run);
    const result = assessPilotEvidence(plan, run, clock, context);
    expect(result.engineeringReady).toBe(true);
    expect(result.technicalReviewKind).toBe("ai");
    expect(result.vendorObservationReady).toBe(false);
    expect(result.advisoryPilotReady).toBe(false);
    expect(result.phaseGateReady).toBe(false);
  });

  it("does not authorize external evidence from input JSON or absent authority", () => {
    const plan = protocol(true);
    const run = evidence(plan, true);
    const result = assessPilotEvidence(plan, run, clock);
    expect(result.reasonCodes).toContain("AUTHORITY_REQUIRED");
    expect(result.phaseGateReady).toBe(false);
    expect(
      assessPilotEvidence(plan, run, clock, JSON.parse('{"approved":true}'))
        .phaseGateReady,
    ).toBe(false);
  });

  it("computes actual-evidence contract readiness with a separate trusted context", () => {
    const plan = protocol(true);
    const run = evidence(plan, true);
    const { context } = authority(plan, run);
    const result = assessPilotEvidence(plan, run, clock, context);
    expect(result.protocolApproved).toBe(true);
    expect(result.vendorObservationReady).toBe(true);
    expect(result.advisoryPilotReady).toBe(true);
    expect(result.phaseGateReady).toBe(true);
    expect(result.reasonCodes).toEqual([]);
  });

  it.each([
    "automaticRejection",
    "hiddenScore",
    "proprietaryScoreInference",
    "generalVendorEquivalence",
    "selectionProbabilityClaims",
  ])("rejects prohibited capability %s", (capability) => {
    const plan = protocol();
    plan.restrictions[capability as keyof typeof plan.restrictions] = true;
    const result = assessPilotEvidence(plan, evidence(plan), clock);
    expect(result.reasonCodes).toContain("UNSAFE_CAPABILITY");
    expect(result.engineeringReady).toBe(false);
  });

  it("rejects unknown versions/fields without returning raw values", () => {
    const plan = {
      ...protocol(),
      schemaVersion: 2,
      privateField: "PRIVATE_INPUT_CANARY",
    };
    const result = assessPilotEvidence(plan, {}, clock);
    expect(result.reasonCodes).toEqual(["INVALID_PROTOCOL"]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_INPUT_CANARY");
  });

  it("rejects vendor/configuration changes even when input updates its protocol hash", () => {
    const plan = protocol(true);
    const run = evidence(plan, true);
    const { context } = authority(plan, run);
    plan.vendor!.version = "fixture-changed";
    run.protocolHash = hashPilotProtocol(plan);
    expect(assessPilotEvidence(plan, run, clock, context).phaseGateReady).toBe(
      false,
    );
  });

  it("keeps synthetic observations out of actual pilot/vendor readiness", () => {
    const plan = protocol(true);
    const run = evidence(plan);
    const { context } = authority(plan, run);
    const result = assessPilotEvidence(plan, run, clock, context);
    expect(result.reasonCodes).toContain("SYNTHETIC_EVIDENCE_ONLY");
    expect(result.phaseGateReady).toBe(false);
  });

  it("separates protocol approval from missing measured execution", () => {
    const plan = protocol(true);
    const run = evidence(plan, true);
    run.observations = [];
    run.outcomes = [];
    const { context } = authority(plan, run);
    const result = assessPilotEvidence(plan, run, clock, context);
    expect(result.protocolApproved).toBe(true);
    expect(result.vendorObservationReady).toBe(false);
    expect(result.advisoryPilotReady).toBe(false);
  });

  it("does not make future quality thresholds into library defaults", () => {
    const plan = protocol(true);
    const run = evidence(plan, true);
    run.outcomes.find((row) => row.metric === "user_comprehension")!.value =
      0.1;
    const { context } = authority(plan, run);
    const result = assessPilotEvidence(plan, run, clock, context);
    expect(result.vendorObservationReady).toBe(true);
    expect(result.advisoryPilotReady).toBe(false);
    expect(result.reasonCodes).toContain("OUTCOME_CRITERIA_NOT_MET");
  });

  it("retains repeatable ingestion failures as scoped observations, never compatibility guarantees", () => {
    const plan = protocol(true);
    const original = evidence(plan, true);
    const run = {
      ...original,
      observations: original.observations.map((row) => ({
        ...row,
        outcome: "rejected",
        outputHash: null,
        errorCode: "vendor_rejected",
      })),
    };
    const { context } = authority(plan, run);
    const result = assessPilotEvidence(plan, run, clock, context);
    expect(result.vendorObservationReady).toBe(true);
    expect(result.ingestionErrorCount).toBe(2);
    expect(result).not.toHaveProperty("vendorCompatible");
  });

  it("requires distinct repeat attempts with identical scoped results", () => {
    const plan = protocol(true);
    const run = evidence(plan, true);
    run.observations[1].outputHash = digest("2");
    const { context } = authority(plan, run);
    expect(
      assessPilotEvidence(plan, run, clock, context).reasonCodes,
    ).toContain("NON_REPEATABLE_OBSERVATIONS");
  });

  it.each(["outcomes", "operations", "notices", "decisions"] as const)(
    "blocks pilot completion with missing %s",
    (key) => {
      const plan = protocol(true);
      const run = evidence(plan, true);
      run[key] = [];
      const { context } = authority(plan, run);
      expect(
        assessPilotEvidence(plan, run, clock, context).advisoryPilotReady,
      ).toBe(false);
    },
  );

  it("rejects expired/revoked or hash-mismatched trusted receipts", () => {
    const plan = protocol(true);
    const run = evidence(plan, true);
    const { context, receipts } = authority(plan, run);
    receipts.get(run.rightsAuthorization.reference)!.status = "revoked";
    receipts.get(run.execution.reference)!.artifactHash = digest("0");
    receipts.get(run.independentReview.reference)!.expiresAt = clock;
    expect(assessPilotEvidence(plan, run, clock, context).phaseGateReady).toBe(
      false,
    );
  });

  it("requires an independent human review for future external claims", () => {
    const plan = protocol(true);
    const run = evidence(plan, true);
    const { context, receipts } = authority(plan, run);
    receipts.get(run.independentReview.reference)!.actorKind = "ai";
    expect(
      assessPilotEvidence(plan, run, clock, context).reasonCodes,
    ).toContain("INDEPENDENT_REVIEW_REQUIRED");
    receipts.get(run.independentReview.reference)!.actorKind = "human";
    receipts.get(run.independentReview.reference)!.actorReference = run.runBy;
    expect(assessPilotEvidence(plan, run, clock, context).phaseGateReady).toBe(
      false,
    );
  });

  it("does not ignore an extra unverified or late notice/decision beside a valid record", () => {
    const plan = protocol(true);
    const run = evidence(plan, true);
    run.notices.push({
      ...run.notices[0],
      recordedAt: "2026-11-07T10:05:00Z",
      evidence: ref("late-notice"),
    });
    run.decisions.push({
      ...run.decisions[0],
      evidence: ref("unverified-decision"),
    });
    const { context, receipts } = authority(plan, run);
    receipts.delete("fixture-unverified-decision-0001");
    const result = assessPilotEvidence(plan, run, clock, context);
    expect(result.reasonCodes).toContain(
      "PARTICIPANT_NOTICE_OR_DECISION_REQUIRED",
    );
    expect(result.advisoryPilotReady).toBe(false);
  });

  it("rejects measurements beyond the supplied clock and evidence from a changed bundle", () => {
    const plan = protocol(true);
    const run = evidence(plan, true);
    const { context } = authority(plan, run);
    run.completedAt = "2026-11-07T13:00:00Z";
    expect(
      assessPilotEvidence(plan, run, clock, context).reasonCodes,
    ).toContain("INVALID_TIME_RANGE");
    run.completedAt = "2026-11-07T10:10:00Z";
    run.outcomes[0].value = 0.75;
    expect(assessPilotEvidence(plan, run, clock, context).phaseGateReady).toBe(
      false,
    );
  });

  it("hashes normalized protocol keys deterministically", () => {
    const plan = protocol();
    expect(
      hashPilotProtocol(Object.fromEntries(Object.entries(plan).reverse())),
    ).toBe(hashPilotProtocol(plan));
    expect(hashPilotProtocol({ ...plan, schemaVersion: 2 })).toBe(null);
    expect(hashPilotEvidence({ schemaVersion: 99 })).toBe(null);
  });

  it("rejects invalid/future chronology, duplicate documents and nonfinite measurements", () => {
    const plan = protocol(true);
    const run = evidence(plan, true);
    plan.documentHashes.push(plan.documentHashes[0]);
    expect(assessPilotEvidence(plan, run, clock).reasonCodes).toContain(
      "DUPLICATE_DOCUMENT_HASH",
    );
    run.outcomes[0].value = Number.NaN;
    expect(
      assessPilotEvidence(protocol(true), run, clock).reasonCodes,
    ).toContain("INVALID_EVIDENCE");
    expect(
      assessPilotEvidence(protocol(), evidence(), "bad-time").reasonCodes,
    ).toContain("INVALID_AS_OF");
  });

  it("fails closed when trusted receipt resolution throws", () => {
    const plan = protocol();
    const run = evidence(plan);
    const result = assessPilotEvidence(plan, run, clock, {
      receipt() {
        throw new Error("PRIVATE_RECEIPT_CANARY");
      },
    });
    expect(result.engineeringReady).toBe(false);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_RECEIPT_CANARY");
  });
});
