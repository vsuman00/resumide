import { describe, it, expect } from "vitest";
import {
  getDraftScorePolicy,
  ScorePolicyDraftSchema,
  WithheldScoreV2Schema,
  presentLegacyScore,
} from "../../app/lib/server/score-v2-contract";
describe("AA4 contract preparation", () => {
  it("keeps weights, bands, calibration and aggregate unavailable", () => {
    const policy = getDraftScorePolicy();
    expect(policy.calibrationReceipt).toBeNull();
    expect(
      policy.dimensions.every(
        (d) =>
          d.weight === null &&
          d.minimumCoverage === null &&
          d.bands.length === 0,
      ),
    ).toBe(true);
    expect(policy.readinessAggregate).toBe("disabled");
    policy.dimensions[0].id = "job_alignment_required";
    expect(ScorePolicyDraftSchema.safeParse(policy).success).toBe(false);
    expect(getDraftScorePolicy().dimensions[0].id).toBe("ats_compatibility");
    expect(() => getDraftScorePolicy("unknown/2")).toThrow(
      "UNKNOWN_SCORE_POLICY_VERSION",
    );
  });
  it.each(["weight", "calibrationReceipt", "bands", "state"])(
    "rejects a forged %s",
    (field) => {
      const policy = getDraftScorePolicy();
      const bad =
        field === "weight"
          ? {
              ...policy,
              dimensions: policy.dimensions.map((d) => ({ ...d, weight: 1 })),
            }
          : field === "bands"
            ? {
                ...policy,
                dimensions: policy.dimensions.map((d) => ({
                  ...d,
                  bands: [{ minimum: 80, label: "good" }],
                })),
              }
            : field === "state"
              ? { ...policy, state: "approved" }
              : { ...policy, calibrationReceipt: "fake" };
      expect(ScorePolicyDraftSchema.safeParse(bad).success).toBe(false);
    },
  );
  it("requires withheld values and disclosed blockers", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const score = {
      schemaVersion: "score/2.0.0",
      id,
      ownerId: id,
      organizationId: id,
      analysisId: id,
      createdAt: "2026-10-12T00:00:00Z",
      producerVersion: "score-v2/preparation-1.0.0",
      retentionPolicyId: "test/1",
      inputSha256: "a".repeat(64),
      evidenceVersionId: null,
      canonicalVersionId: null,
      requirementVersionId: null,
      policyId: getDraftScorePolicy().id,
      calibrationReceipt: null,
      state: "withheld",
      evidenceState: "review_required",
      dimensions: getDraftScorePolicy().dimensions.map((d) => ({
        id: d.id,
        value: null,
        eligible: false,
        coverage: null,
        blockers: ["calibration_not_approved"],
      })),
    };
    expect(WithheldScoreV2Schema.safeParse(score).success).toBe(true);
    expect(
      WithheldScoreV2Schema.safeParse({
        ...score,
        dimensions: score.dimensions.map((d) => ({ ...d, value: 95 })),
      }).success,
    ).toBe(false);
    expect(
      WithheldScoreV2Schema.safeParse({
        ...score,
        dimensions: score.dimensions.map((d) => ({
          ...d,
          blockers: ["extraction_review_required"],
        })),
      }).success,
    ).toBe(false);
  });
  it("preserves legacy value, date and version without v2 comparison", () => {
    const record = {
      value: 73,
      scoringVersion: "ats-rules-v2",
      createdAt: "2026-09-11T00:00:00Z",
      kind: "legacy_blended",
    };
    expect(presentLegacyScore(record)).toEqual({
      ...record,
      label: "Legacy analysis score",
      v2Comparable: false,
    });
    expect(
      presentLegacyScore({ ...record, scoringVersion: null }).scoringVersion,
    ).toBeNull();
    expect(() => presentLegacyScore({ ...record, value: NaN })).toThrow();
  });
});

it("preserves legacy database timestamps with their original UTC offset", () => {
  const record = {
    value: 81,
    scoringVersion: null,
    createdAt: "2026-10-12T10:00:00+00:00",
    kind: "legacy_blended",
  };
  expect(presentLegacyScore(record)).toMatchObject({
    ...record,
    v2Comparable: false,
  });
});
