import { describe, expect, it } from "vitest";
import {
  assessAnnotationEvidence,
  hashAnnotationSubmission,
} from "../../app/lib/server/evaluation-annotation";

const hash = (value: string) => value.repeat(64);
function evidence() {
  return {
    schemaVersion: 1,
    provenance: "synthetic",
    handbookHash: hash("a"),
    annotators: ["annotator_01", "annotator_02"].map((id) => ({
      id,
      kind: "human",
      trainingHandbookHash: hash("a"),
      independent: true,
      blindedToOtherLabels: true,
      blindedToModelOutput: true,
    })),
    adjudicator: {
      id: "adjudicator_01",
      kind: "human",
      trainingHandbookHash: hash("a"),
      blindedToModelOutput: true,
      blindedToAnnotatorIdentity: true,
    },
    declaredFamilies: ["critical_fields"],
    units: Array.from({ length: 20 }, (_, index) => ({
      id: `unit_${String(index).padStart(4, "0")}`,
      sourceId: "source_0001",
      sourceHash: hash("b"),
      family: "critical_fields",
      critical: true,
      submissions: ["annotator_01", "annotator_02"].map(
        (annotatorId, rater) => ({
          id: `submission_${index}_${rater}`,
          annotatorId,
          labelHash: hash(index < 10 ? "c" : "d"),
          handbookHash: hash("a"),
          sourceHash: hash("b"),
          submittedAt: "2026-11-07T00:00:00Z",
        }),
      ),
    })),
  };
}
function resolve(input: ReturnType<typeof evidence>, index = 0) {
  Object.assign(input.units[index], {
    resolution: {
      adjudicatorId: "adjudicator_01",
      labelHash: hash("c"),
      reasonReference: "reason_0001",
      submissionHashes: input.units[index].submissions.map(
        hashAnnotationSubmission,
      ),
      handbookHash: hash("a"),
      sourceHash: hash("b"),
      resolvedAt: "2026-11-07T01:00:00Z",
    },
  });
}

describe("annotation evidence and measured categorical agreement", () => {
  it("preserves original inputs and produces stable bound synthetic eligibility", () => {
    const input = evidence();
    const before = JSON.stringify(input);
    const report = assessAnnotationEvidence(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(report.status).toBe("assessed");
    expect(report.agreementPassed).toBe(true);
    expect(report.familyReports[0]).toMatchObject({
      family: "critical_fields",
      pairs: 20,
      agreements: 20,
      exactAgreement: 1,
      kappa: 1,
      status: "passed",
      threshold: 0.8,
    });
    expect(report.eligibleSources).toEqual([
      {
        sourceId: "source_0001",
        sourceHash: hash("b"),
        annotationEvidenceHash: report.annotationEvidenceHash,
      },
    ]);
    expect(report.annotationEvidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(assessAnnotationEvidence(structuredClone(input))).toEqual(report);
    expect(report.humanIndependenceDeclared).toBe(true);
    expect(report.uniqueSourceCount).toBe(1);
    expect(report.uniqueContentCount).toBe(1);
    expect(report.familyReports[0].uniqueSourceCount).toBe(1);
    expect(report.engineeringReady).toBe(true);
    expect(report.evidenceTier).toBe("synthetic_engineering");
    expect(report.representativeReady).toBe(false);
    expect(report.releaseReady).toBe(false);
    expect(JSON.stringify(report)).not.toContain(hash("c"));
  });

  it("calculates 0.9 kappa from actual disagreement, without replacing originals", () => {
    const input = evidence();
    input.units[0].submissions[1].labelHash = hash("d");
    resolve(input);
    const report = assessAnnotationEvidence(input);
    expect(report.familyReports[0].kappa).toBeCloseTo(0.9);
    expect(report.familyReports[0].exactAgreement).toBe(0.95);
    expect(report.resolvedDisagreements).toBe(1);
    expect(report.agreementPassed).toBe(true);
    expect(report.eligibleSources).toHaveLength(1);
    expect(input.units[0].submissions.map((s) => s.labelHash)).toEqual([
      hash("c"),
      hash("d"),
    ]);
  });

  it("withholds unresolved critical evidence even when overall agreement passes", () => {
    const input = evidence();
    input.units[0].submissions[1].labelHash = hash("d");
    const report = assessAnnotationEvidence(input);
    expect(report.agreementPassed).toBe(true);
    expect(report.unresolvedCriticalUnits).toBe(1);
    expect(report.eligibleSources).toEqual([]);
    expect(report.reasonCounts.UNRESOLVED_DISAGREEMENT).toBe(1);
  });

  it("fails measured low agreement and cannot repair it through adjudication", () => {
    const input = evidence();
    input.units.forEach((unit, index) => {
      unit.submissions[1].labelHash = hash(index < 10 ? "d" : "c");
      resolve(input, index);
    });
    const report = assessAnnotationEvidence(input);
    expect(report.familyReports[0].kappa).toBe(-1);
    expect(report.familyReports[0].status).toBe("failed");
    expect(report.agreementPassed).toBe(false);
    expect(report.eligibleSources).toEqual([]);
  });

  it("never passes empty, one-pair, constant-category or missing-family evidence", () => {
    for (const count of [0, 1]) {
      const input = evidence();
      input.units = input.units.slice(0, count);
      const report = assessAnnotationEvidence(input);
      expect(report.familyReports[0].status).toBe("insufficient");
      expect(report.agreementPassed).toBe(false);
    }
    const input = evidence();
    input.units.forEach((u) =>
      u.submissions.forEach((s) => {
        s.labelHash = hash("c");
      }),
    );
    expect(assessAnnotationEvidence(input).familyReports[0]).toMatchObject({
      status: "undefined",
      kappa: null,
    });
    const missing = evidence();
    missing.declaredFamilies.push("requirements");
    expect(assessAnnotationEvidence(missing).agreementPassed).toBe(false);
  });

  it("rejects participant impersonation, duplicate units and source/handbook drift", () => {
    const mutations = [
      (v: ReturnType<typeof evidence>) => {
        v.annotators[1].id = v.annotators[0].id;
      },
      (v: ReturnType<typeof evidence>) => {
        v.adjudicator.id = v.annotators[0].id;
      },
      (v: ReturnType<typeof evidence>) => {
        v.units[1].id = v.units[0].id;
      },
      (v: ReturnType<typeof evidence>) => {
        v.units[0].submissions[1].annotatorId = v.annotators[0].id;
      },
      (v: ReturnType<typeof evidence>) => {
        v.units[0].submissions[0].sourceHash = hash("e");
      },
      (v: ReturnType<typeof evidence>) => {
        v.units[0].submissions[0].handbookHash = hash("e");
      },
      (v: ReturnType<typeof evidence>) => {
        v.units[1].sourceHash = hash("e");
      },
    ];
    for (const mutate of mutations) {
      const input = evidence();
      mutate(input);
      const report = assessAnnotationEvidence(input);
      expect(report.status).toBe("rejected");
      expect(report.eligibleSources).toEqual([]);
    }
  });

  it("requires separate bound and temporally valid adjudication", () => {
    for (const field of [
      "adjudicatorId",
      "handbookHash",
      "sourceHash",
      "resolvedAt",
    ]) {
      const input = evidence();
      input.units[0].submissions[1].labelHash = hash("d");
      resolve(input);
      const resolution = (
        input.units[0] as unknown as { resolution: Record<string, string> }
      ).resolution;
      resolution[field] =
        field === "resolvedAt"
          ? "2026-11-06T00:00:00Z"
          : field.endsWith("Hash")
            ? hash("e")
            : "foreign_0001";
      const report = assessAnnotationEvidence(input);
      expect(report.status).toBe("rejected");
      expect(report.resolvedDisagreements).toBe(0);
    }
  });

  it("does not turn AI, copied, untrained or unblinded claims into human evidence", () => {
    const mutations = [
      (v: ReturnType<typeof evidence>) => {
        v.annotators[0].kind = "ai";
      },
      (v: ReturnType<typeof evidence>) => {
        v.annotators[0].independent = false;
      },
      (v: ReturnType<typeof evidence>) => {
        v.annotators[0].blindedToOtherLabels = false;
      },
      (v: ReturnType<typeof evidence>) => {
        v.annotators[0].blindedToModelOutput = false;
      },
      (v: ReturnType<typeof evidence>) => {
        v.annotators[0].trainingHandbookHash = hash("e");
      },
      (v: ReturnType<typeof evidence>) => {
        v.adjudicator.kind = "ai";
      },
      (v: ReturnType<typeof evidence>) => {
        v.adjudicator.blindedToAnnotatorIdentity = false;
      },
    ];
    for (const mutate of mutations) {
      const input = evidence();
      mutate(input);
      const report = assessAnnotationEvidence(input);
      expect(report.humanIndependenceDeclared).toBe(false);
      expect(report.representativeReady).toBe(false);
      expect(report.releaseReady).toBe(false);
    }
  });

  it("allows honest AI synthetic engineering without fabricating human approval", () => {
    const input = evidence();
    input.annotators.forEach((a) => {
      a.kind = "ai";
      a.independent = false;
      a.blindedToOtherLabels = false;
    });
    input.adjudicator.kind = "ai";
    input.adjudicator.blindedToAnnotatorIdentity = false;
    const report = assessAnnotationEvidence(input);
    expect(report.engineeringReady).toBe(true);
    expect(report.evidenceTier).toBe("synthetic_engineering");
    expect(report.humanIndependenceDeclared).toBe(false);
    expect(report.representativeAnnotationEligible).toBe(false);
    expect(report.representativeReady).toBe(false);
  });

  it("does not authorize representative data from asserted human metadata", () => {
    const input = evidence();
    input.provenance = "representative";
    const report = assessAnnotationEvidence(input);
    expect(report.reasonCounts.REAL_DATA_NOT_AUTHORIZED).toBe(1);
    expect(report.evidenceTier).toBe("unverified");
    expect(report.eligibleSources).toEqual([]);
    expect(report.representativeReady).toBe(false);
  });

  it("admits representative annotation bindings only with trusted source and reviewer authority", () => {
    const input = evidence();
    input.provenance = "representative";
    const authorizeSource = (binding: {
      sourceId: string;
      sourceHash: string;
      handbookHash: string;
    }) =>
      binding.sourceId === "source_0001" &&
      binding.sourceHash === hash("b") &&
      binding.handbookHash === hash("a");
    const authorizeReviewer = (binding: {
      reviewerId: string;
      role: string;
      handbookHash: string;
    }) =>
      ["annotator_01", "annotator_02", "adjudicator_01"].includes(
        binding.reviewerId,
      ) && binding.handbookHash === hash("a");
    const report = assessAnnotationEvidence(input, {
      authorizeSource,
      authorizeReviewer,
    });
    expect(report.evidenceTier).toBe("independent_human");
    expect(report.representativeAnnotationEligible).toBe(true);
    expect(report.eligibleSources).toHaveLength(1);
    expect(report.representativeReady).toBe(false);
    expect(report.releaseReady).toBe(false);
    for (const authority of [
      { authorizeSource: () => false, authorizeReviewer },
      { authorizeSource, authorizeReviewer: () => false },
      {
        authorizeSource: () => {
          throw new Error("private-authority-details");
        },
        authorizeReviewer,
      },
      {
        authorizeSource,
        authorizeReviewer: () => {
          throw new Error("private-authority-details");
        },
      },
    ]) {
      const denied = assessAnnotationEvidence(input, authority);
      expect(denied.representativeAnnotationEligible).toBe(false);
      expect(denied.eligibleSources).toEqual([]);
      expect(JSON.stringify(denied)).not.toContain("private-authority-details");
    }
    const selfAsserted = assessAnnotationEvidence(input, {
      authorizeSource: true,
      authorizeReviewer: true,
    } as never);
    expect(selfAsserted.eligibleSources).toEqual([]);
    input.annotators[0].blindedToOtherLabels = false;
    expect(
      assessAnnotationEvidence(input, { authorizeSource, authorizeReviewer })
        .representativeAnnotationEligible,
    ).toBe(false);
  });

  it("measures each annotator consistently when submission order changes", () => {
    const input = evidence();
    input.units[0].submissions[1].labelHash = hash("d");
    input.units[10].submissions[1].labelHash = hash("c");
    resolve(input, 0);
    resolve(input, 10);
    input.units[0].submissions.reverse();
    resolve(input, 0);
    expect(assessAnnotationEvidence(input).familyReports[0].kappa).toBe(0.8);
  });

  it("binds every trusted authority request to the exact assessed evidence hash", () => {
    const input = evidence();
    input.provenance = "representative";
    const hashes: string[] = [];
    const report = assessAnnotationEvidence(input, {
      authorizeSource: (binding) => {
        hashes.push(binding.annotationEvidenceHash);
        return true;
      },
      authorizeReviewer: (binding) => {
        hashes.push(binding.annotationEvidenceHash);
        return true;
      },
    });
    expect(hashes).toHaveLength(4);
    expect(
      hashes.every((value) => value === report.annotationEvidenceHash),
    ).toBe(true);
    expect(report.representativeAnnotationEligible).toBe(true);
  });

  it("binds adjudication to the unchanged original submission hashes", () => {
    const input = evidence();
    input.units[0].submissions[1].labelHash = hash("d");
    resolve(input);
    input.units[0].submissions[1].labelHash = hash("e");
    expect(
      assessAnnotationEvidence(input).reasonCounts.INVALID_RESOLUTION,
    ).toBe(1);
  });

  it("rejects unknown schema/raw label fields and bounded input overflow safely", () => {
    for (const input of [
      null,
      { ...evidence(), schemaVersion: 2 },
      { ...evidence(), rawText: "not-permitted" },
      { ...evidence(), units: Array(65_537).fill(evidence().units[0]) },
    ]) {
      const report = assessAnnotationEvidence(input);
      expect(report.status).toBe("rejected");
      expect(report.reasonCounts).toEqual({ INVALID_EVIDENCE: 1 });
      expect(JSON.stringify(report)).not.toContain("not-permitted");
    }
  });

  it("binds every submission edit into a new evidence hash", () => {
    const input = evidence();
    const before = assessAnnotationEvidence(input).annotationEvidenceHash;
    input.units[0].submissions[0].submittedAt = "2026-11-07T00:01:00Z";
    expect(assessAnnotationEvidence(input).annotationEvidenceHash).not.toBe(
      before,
    );
  });
});
