import { describe, expect, it, vi } from "vitest";
import {
  createEvaluationPartitionLock,
  readEvaluationPartitionLabels,
  verifyEvaluationPartitionLock,
  type PartitionAuthority,
} from "../../app/lib/server/evaluation-partitions";

const digest = (char: string) => char.repeat(64);
function fixture() {
  const records = (["development", "calibration", "locked_test"] as const).map(
    (partition, index) => ({
      id: `source_000${index + 1}`,
      contentHash: digest(["b", "c", "d"][index]),
      partition,
      clusters: {
        person: [`person_000${index}`],
        employer: { status: "known", ids: [`employer_000${index}`] },
        template: [`template_000${index}`],
        sourceFamily: [`family_000${index}`],
        nearDuplicate: [`cluster_000${index}`],
      },
    }),
  );
  return {
    schemaVersion: 1,
    corpusVersion: "synthetic_corpus_v1",
    accessGroups: {
      development: ["development_group"],
      calibration: ["calibration_group"],
      locked_test: ["locked_test_group"],
    },
    records,
    annotationEvidence: {
      schemaVersion: 1,
      provenance: "synthetic",
      handbookHash: digest("a"),
      annotators: ["annotator_01", "annotator_02"].map((id) => ({
        id,
        kind: "human",
        trainingHandbookHash: digest("a"),
        independent: true,
        blindedToOtherLabels: true,
        blindedToModelOutput: true,
      })),
      adjudicator: {
        id: "adjudicator_01",
        kind: "human",
        trainingHandbookHash: digest("a"),
        blindedToModelOutput: true,
        blindedToAnnotatorIdentity: true,
      },
      declaredFamilies: ["critical_fields"],
      units: records.flatMap((record, index) =>
        [0, 1].map((category) => ({
          id: `unit_000${index}_${category}`,
          sourceId: record.id,
          sourceHash: record.contentHash,
          family: "critical_fields",
          critical: true,
          submissions: ["annotator_01", "annotator_02"].map(
            (annotatorId, rater) => ({
              id: `submission_${index}_${category}_${rater}`,
              annotatorId,
              labelHash: digest(category === 0 ? "e" : "f"),
              handbookHash: digest("a"),
              sourceHash: record.contentHash,
              submittedAt: "2026-11-07T00:00:00Z",
            }),
          ),
        })),
      ),
    },
  };
}
const approvedAuthority = (): PartitionAuthority => ({
  authorizeSource: () => true,
  authorizeReviewer: () => true,
  authorizePartitionManifest: () => true,
});
function locked(input = fixture(), authority?: PartitionAuthority) {
  const result = createEvaluationPartitionLock(input, authority);
  expect(result.status).toBe("locked");
  if (!result.lock) throw new Error("Fixture did not lock");
  return result.lock;
}

describe("immutable evaluation partition locks", () => {
  it("binds declared hashes and all group categories without claiming representative validity", () => {
    const input = fixture();
    const before = structuredClone(input);
    const lock = locked(input);
    expect(lock.lockHash).toMatch(/^[a-f0-9]{64}$/);
    expect(lock.annotationEvidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      lock.records.map((record) => [
        record.id,
        record.contentHash,
        record.partition,
      ]),
    ).toEqual(
      input.records.map((record) => [
        record.id,
        record.contentHash,
        record.partition,
      ]),
    );
    expect(lock).toMatchObject({
      evidenceTier: "synthetic_engineering",
      representativePartitionEligible: false,
      representativeReady: false,
      releaseReady: false,
    });
    expect(input).toEqual(before);
    expect(Object.isFrozen(lock)).toBe(true);
    expect(Object.isFrozen(lock.records[0].clusters.person)).toBe(true);
    expect(Object.isFrozen(lock.accessGroups.locked_test)).toBe(true);
    input.records[0].clusters.person[0] = "another_person";
    expect(lock.records[0].clusters.person).toEqual(["person_0000"]);
  });

  it("canonicalizes record, group and cluster ordering deterministically", () => {
    const input = fixture();
    input.records[0].clusters.person.push("person_extra");
    input.accessGroups.development.push("extra_access_group");
    const reordered = structuredClone(input);
    reordered.records.reverse();
    reordered.records.forEach((record) => record.clusters.person.reverse());
    reordered.accessGroups.development.reverse();
    expect(locked(reordered)).toEqual(locked(input));
  });

  it.each(["person", "template", "sourceFamily", "nearDuplicate"] as const)(
    "rejects cross-partition %s leakage",
    (category) => {
      const input = fixture();
      input.records[2].clusters[category] = [
        ...input.records[0].clusters[category],
      ];
      expect(createEvaluationPartitionLock(input)).toMatchObject({
        status: "rejected",
        reason: "CLUSTER_LEAKAGE",
        lock: null,
      });
    },
  );

  it("rejects overlapping employers, including secondary employers", () => {
    const input = fixture();
    input.records[1].clusters.employer.ids.push(
      input.records[0].clusters.employer.ids[0],
    );
    expect(createEvaluationPartitionLock(input).reason).toBe("CLUSTER_LEAKAGE");
  });

  it.each(["person", "employer", "template", "sourceFamily", "nearDuplicate"])(
    "requires explicit %s group metadata",
    (category) => {
      const input = fixture();
      const clusters: Record<string, unknown> = input.records[0].clusters;
      delete clusters[category];
      expect(createEvaluationPartitionLock(input).reason).toBe("INVALID_INPUT");
    },
  );

  it("supports documented employer non-applicability and denies unresolved or invented absence", () => {
    const input = fixture();
    const record = input.records[0];
    Object.assign(record.clusters, {
      employer: {
        status: "not_applicable",
        reasonReference: "no_employment_reason",
        evidenceReference: "review_evidence_0001",
      },
    });
    expect(createEvaluationPartitionLock(input).status).toBe("locked");
    Object.assign(record.clusters, { employer: { status: "not_applicable" } });
    expect(createEvaluationPartitionLock(input).reason).toBe("INVALID_INPUT");
    Object.assign(record.clusters, { employer: { status: "unresolved" } });
    expect(createEvaluationPartitionLock(input).reason).toBe("INVALID_INPUT");
  });

  it("requires all three populated partitions", () => {
    const input = fixture();
    input.records[2].partition = "calibration";
    expect(createEvaluationPartitionLock(input).reason).toBe(
      "MISSING_PARTITION",
    );
  });

  it("rejects duplicate membership and duplicate document hashes even within a partition", () => {
    const input = fixture();
    input.records.push(structuredClone(input.records[0]));
    expect(createEvaluationPartitionLock(input).reason).toBe("DUPLICATE_ID");
    input.records[3].id = "source_extra";
    expect(createEvaluationPartitionLock(input).reason).toBe(
      "ANNOTATION_BINDING_MISMATCH",
    );
    input.annotationEvidence.units.push(
      ...input.annotationEvidence.units.slice(0, 2).map((unit, index) => ({
        ...unit,
        id: `unit_extra_${index}`,
        sourceId: "source_extra",
        submissions: unit.submissions.map((submission, rater) => ({
          ...submission,
          id: `extra_submission_${index}_${rater}`,
        })),
      })),
    );
    expect(createEvaluationPartitionLock(input).reason).toBe("DUPLICATE_HASH");
  });

  it("fails on source hash drift or unresolved annotation eligibility", () => {
    const input = fixture();
    input.records[0].contentHash = digest("9");
    expect(createEvaluationPartitionLock(input).reason).toBe(
      "ANNOTATION_BINDING_MISMATCH",
    );
    const unresolved = fixture();
    unresolved.annotationEvidence.units[0].submissions[1].labelHash =
      digest("f");
    expect(createEvaluationPartitionLock(unresolved).reason).toBe(
      "ANNOTATION_INELIGIBLE",
    );
  });

  it("detects changed membership, clusters, corpus version and access policy", () => {
    for (const change of [
      (input: ReturnType<typeof fixture>) => {
        input.records[0].clusters.person = ["changed_person"];
      },
      (input: ReturnType<typeof fixture>) => {
        input.corpusVersion = "synthetic_corpus_v2";
      },
      (input: ReturnType<typeof fixture>) => {
        input.records[0].partition = "calibration";
        input.records[1].partition = "development";
      },
      (input: ReturnType<typeof fixture>) => {
        input.accessGroups.locked_test = ["another_test_group"];
      },
    ]) {
      const current = fixture();
      const lock = locked(current);
      change(current);
      expect(verifyEvaluationPartitionLock(lock, current).reason).toBe(
        "LOCK_DRIFT",
      );
    }
    const current = fixture();
    const lock = structuredClone(locked(current));
    expect(
      verifyEvaluationPartitionLock({ ...lock, lockHash: digest("0") }, current)
        .reason,
    ).toBe("INVALID_LOCK");
    expect(
      verifyEvaluationPartitionLock(
        { ...lock, representativeReady: true },
        current,
      ).reason,
    ).toBe("INVALID_LOCK");
  });

  it("rejects unknown fields, missing schemas and batches beyond the global4096 bound", () => {
    const input = fixture();
    expect(
      createEvaluationPartitionLock({ ...input, schemaVersion: 2 }).reason,
    ).toBe("INVALID_INPUT");
    expect(
      createEvaluationPartitionLock({
        ...input,
        labels: "synthetic-private-marker",
      }).reason,
    ).toBe("INVALID_INPUT");
    expect(
      createEvaluationPartitionLock({
        ...input,
        records: Array(4097).fill(input.records[0]),
      }).reason,
    ).toBe("INVALID_INPUT");
  });

  it("can establish scoped human partition eligibility only through live trusted callbacks", () => {
    const input = fixture();
    input.annotationEvidence.provenance = "representative";
    expect(createEvaluationPartitionLock(input).reason).toBe(
      "ANNOTATION_INELIGIBLE",
    );
    const authority = approvedAuthority();
    const lock = locked(input, authority);
    expect(lock).toMatchObject({
      evidenceTier: "independent_human",
      representativePartitionEligible: true,
      representativeReady: false,
      releaseReady: false,
    });
    expect(verifyEvaluationPartitionLock(lock, input).reason).toBe(
      "ANNOTATION_INELIGIBLE",
    );
    expect(
      verifyEvaluationPartitionLock(lock, input, {
        ...authority,
        authorizeSource: () => false,
      }).status,
    ).toBe("rejected");
    expect(
      createEvaluationPartitionLock(input, {
        ...authority,
        authorizePartitionManifest: () => false,
      }).reason,
    ).toBe("ANNOTATION_INELIGIBLE");
    expect(
      createEvaluationPartitionLock(input, {
        ...authority,
        authorizePartitionManifest: () => {
          throw new Error("synthetic-private-marker");
        },
      }).reason,
    ).toBe("ANNOTATION_INELIGIBLE");
    const jsonAuthority = Object.assign({}, authority, {
      authorizePartitionManifest: true,
    }) as unknown as PartitionAuthority;
    expect(createEvaluationPartitionLock(input, jsonAuthority).reason).toBe(
      "ANNOTATION_INELIGIBLE",
    );
    const approval = vi.fn(() => true);
    locked(input, { ...authority, authorizePartitionManifest: approval });
    expect(approval).toHaveBeenCalledWith({
      corpusVersion: input.corpusVersion,
      membershipHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(JSON.stringify(approval.mock.calls)).not.toContain("labelHash");
  });
});

describe("partition label access boundary", () => {
  it("denies calibration access to locked-test labels before a reader runs", async () => {
    const input = fixture();
    const reader = vi.fn(() => "synthetic-label-marker");
    const result = await readEvaluationPartitionLabels(
      locked(input),
      input,
      {
        purpose: "calibration",
        partition: "locked_test",
        actorGroups: ["locked_test_group", "calibration_group"],
      },
      reader,
    );
    expect(reader).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "rejected",
      audit: {
        decision: "denied",
        reason: "LOCKED_TEST_FORBIDDEN",
        recordCount: 0,
      },
    });
    expect(JSON.stringify(result)).not.toContain("synthetic-label-marker");
  });

  it.each([
    { purpose: "calibration", partition: "calibration", actorGroups: [] },
    {
      purpose: "development",
      partition: "locked_test",
      actorGroups: ["locked_test_group"],
    },
    {
      purpose: "locked_evaluation",
      partition: "development",
      actorGroups: ["development_group"],
    },
    {
      purpose: "calibration",
      partition: "calibration",
      actorGroups: ["calibration_group"],
      isAdmin: true,
    },
  ])(
    "denies unauthorized or malformed request %# without reading",
    async (request) => {
      const input = fixture();
      const reader = vi.fn();
      const result = await readEvaluationPartitionLabels(
        locked(input),
        input,
        request,
        reader,
      );
      expect(result.status).toBe("rejected");
      expect(reader).not.toHaveBeenCalled();
    },
  );

  it("passes only the requested eligible partition IDs and keeps labels out of audit metadata", async () => {
    const input = fixture();
    const reader = vi.fn(async (ids: readonly string[]) => ({
      ids,
      label: "synthetic-label-marker",
    }));
    const result = await readEvaluationPartitionLabels(
      locked(input),
      input,
      {
        purpose: "calibration",
        partition: "development",
        actorGroups: ["development_group"],
      },
      reader,
    );
    expect(reader).toHaveBeenCalledExactlyOnceWith(["source_0001"]);
    expect(result).toMatchObject({
      status: "read",
      value: { label: "synthetic-label-marker" },
      audit: { decision: "allowed", recordCount: 1, reason: null },
    });
    expect(JSON.stringify(result.audit)).not.toContain(
      "synthetic-label-marker",
    );
    expect(JSON.stringify(result.audit)).not.toContain("source_0001");
  });

  it("requires valid current lock bindings before invoking any reader", async () => {
    const input = fixture();
    const lock = locked(input);
    input.corpusVersion = "synthetic_corpus_v2";
    const reader = vi.fn();
    expect(
      await readEvaluationPartitionLabels(
        lock,
        input,
        {
          purpose: "calibration",
          partition: "development",
          actorGroups: ["development_group"],
        },
        reader,
      ),
    ).toMatchObject({ status: "rejected", audit: { reason: "LOCK_DRIFT" } });
    expect(reader).not.toHaveBeenCalled();
  });

  it("returns only a fixed error audit if an authorized reader fails", async () => {
    const input = fixture();
    const result = await readEvaluationPartitionLabels(
      locked(input),
      input,
      {
        purpose: "locked_evaluation",
        partition: "locked_test",
        actorGroups: ["locked_test_group"],
      },
      () => {
        throw new Error("synthetic-private-marker");
      },
    );
    expect(result).toMatchObject({
      status: "rejected",
      audit: { reason: "READER_FAILED", decision: "allowed", recordCount: 1 },
    });
    expect(JSON.stringify(result)).not.toContain("synthetic-private-marker");
  });
});
