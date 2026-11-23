import { describe, expect, it, vi } from "vitest";
import {
  assessCorpusRetention,
  assessEvaluationCorpus,
  hashEvaluationCorpusRecord,
  REPRESENTATIVE_CORPUS_PURPOSE,
  type EvaluationCorpusAuthority,
  type EvaluationCorpusAuthorization,
  evaluationCorpusManifestSchema,
  evaluationCorpusRecordSchema,
  transitionCorpusRecord,
} from "../../app/lib/server/evaluation-corpus";
import {
  createEvaluationCorpusManifest,
  createEvaluationCorpusRecord,
  EVALUATION_CORPUS_DEMO,
} from "../fixtures/evaluation-corpus";

const { actor, asOf } = EVALUATION_CORPUS_DEMO;
type Fixture = ReturnType<typeof createEvaluationCorpusRecord>;
const assess = (record: unknown, access: unknown = actor) =>
  assessEvaluationCorpus({ schemaVersion: 1, records: [record] }, access, asOf);

function expectExcluded(record: unknown, reason: string) {
  expect(assess(record)).toEqual({
    schemaVersion: 1,
    status: "assessed",
    totalRecords: 1,
    admittedCount: 0,
    excludedCount: 1,
    reasonCounts: { [reason]: 1 },
    representativeReady: false,
    releaseReady: false,
  });
}

describe("synthetic evaluation corpus metadata", () => {
  it("admits future representative metadata only through a separate trusted authority", () => {
    const record = createEvaluationCorpusRecord();
    record.sourceKind = "real_resume";
    record.permission.purpose = "representative_corpus_evaluation";
    record.provenance.fictionalIdentities = false;
    const report = assessEvaluationCorpus(
      { schemaVersion: 1, records: [record] },
      actor,
      asOf,
      { authorize: () => true },
    );
    expect(report.admittedCount).toBe(1);
    expect(report.representativeReady).toBe(false);
    expect(report.releaseReady).toBe(false);
  });

  it("admits the declared synthetic taxonomy without promoting validity", () => {
    const input = structuredClone(EVALUATION_CORPUS_DEMO);
    expect(
      assessEvaluationCorpus(input.manifest, input.actor, input.asOf),
    ).toEqual({
      schemaVersion: 1,
      status: "assessed",
      totalRecords: 3,
      admittedCount: 3,
      excludedCount: 0,
      reasonCounts: {},
      representativeReady: false,
      releaseReady: false,
    });
    expect(input).toEqual(EVALUATION_CORPUS_DEMO);
  });

  it.each([0, "1", 2, undefined])("rejects schema version %s", (version) => {
    expect(
      assessEvaluationCorpus(
        { ...createEvaluationCorpusManifest(), schemaVersion: version },
        actor,
        asOf,
      ),
    ).toMatchObject({
      status: "rejected",
      totalRecords: 0,
      reasonCounts: { INVALID_MANIFEST: 1 },
    });
  });

  it("rejects unknown manifest and nested record fields without echoing them", () => {
    const marker = "synthetic-unexpected-payload";
    const manifest = {
      ...createEvaluationCorpusManifest(),
      resumeText: marker,
    };
    expect(evaluationCorpusManifestSchema.safeParse(manifest).success).toBe(
      false,
    );
    const result = assessEvaluationCorpus(manifest, actor, asOf);
    expect(result.reasonCounts).toEqual({ INVALID_MANIFEST: 1 });
    expect(JSON.stringify(result)).not.toContain(marker);
    for (const key of ["segment", "provenance", "permission"] as const) {
      const record = createEvaluationCorpusRecord();
      Object.assign(record[key], { unexpected: marker });
      expectExcluded(record, "INVALID_RECORD");
    }
    expectExcluded(
      { ...createEvaluationCorpusRecord(), resumeText: marker },
      "INVALID_RECORD",
    );
  });

  it("bounds batch size and never calls an empty batch ready", () => {
    expect(
      evaluationCorpusManifestSchema.safeParse({
        schemaVersion: 1,
        records: Array(257).fill(null),
      }).success,
    ).toBe(false);
    expect(
      assessEvaluationCorpus({ schemaVersion: 1, records: [] }, actor, asOf),
    ).toMatchObject({
      status: "assessed",
      admittedCount: 0,
      representativeReady: false,
      releaseReady: false,
    });
  });

  it.each(["permission", "provenance"] as const)(
    "requires %s metadata",
    (key) => {
      const record: Record<string, unknown> = createEvaluationCorpusRecord();
      delete record[key];
      expectExcluded(
        record,
        key === "permission" ? "MISSING_PERMISSION" : "INVALID_RECORD",
      );
    },
  );

  it.each(["reference", "licenseReference", "purpose"] as const)(
    "requires declared permission %s",
    (key) => {
      const record = createEvaluationCorpusRecord();
      const permission: Record<string, unknown> = record.permission;
      delete permission[key];
      expectExcluded(record, "INVALID_RECORD");
    },
  );

  it.each([
    "real_resume",
    "real_job_description",
    "candidate_upload",
    "scraped",
  ])("does not infer permission for %s", (sourceKind) => {
    expectExcluded(
      { ...createEvaluationCorpusRecord(), sourceKind },
      "UNAUTHORIZED_SOURCE",
    );
  });

  it("requires fictional provenance and the approved evaluation purpose", () => {
    const record = createEvaluationCorpusRecord();
    record.provenance.fictionalIdentities = false;
    expectExcluded(record, "FICTIONAL_PROVENANCE_REQUIRED");
    record.provenance.fictionalIdentities = true;
    record.permission.purpose = "candidate_upload_processing";
    expectExcluded(record, "OUT_OF_SCOPE");
  });

  it.each([
    ["domain", "finance"],
    ["language", "hi"],
    ["locale", "US"],
    ["documentClass", "docx"],
    ["layout", "handwriting"],
  ] as const)("excludes unsupported segment %s", (field, value) => {
    const record = createEvaluationCorpusRecord();
    record.segment[field] = value;
    expectExcluded(record, "OUT_OF_SCOPE");
  });

  it("does not confuse export formats with input authorization", () => {
    expectExcluded(
      { ...createEvaluationCorpusRecord(), format: "docx" },
      "OUT_OF_SCOPE",
    );
  });

  it.each([
    [
      "record revoked",
      (r: Fixture) => {
        r.state = "revoked";
      },
      "RECORD_REVOKED",
    ],
    [
      "record deleted",
      (r: Fixture) => {
        r.state = "deleted";
      },
      "RECORD_DELETED",
    ],
    [
      "permission revoked",
      (r: Fixture) => {
        r.permission.state = "revoked";
      },
      "PERMISSION_NOT_ACTIVE",
    ],
    [
      "permission not started",
      (r: Fixture) => {
        r.permission.grantedAt = "2026-11-08T00:00:00Z";
      },
      "PERMISSION_NOT_STARTED",
    ],
    [
      "permission expiry boundary",
      (r: Fixture) => {
        r.permission.expiresAt = asOf;
      },
      "PERMISSION_EXPIRED",
    ],
    [
      "retention expiry boundary",
      (r: Fixture) => {
        r.retentionExpiresAt = asOf;
      },
      "RETENTION_EXPIRED",
    ],
    [
      "future lifecycle event",
      (r: Fixture) => {
        r.stateChangedAt = "2026-11-08T00:00:00Z";
      },
      "INVALID_RECORD",
    ],
  ] as const)("excludes %s", (_label, change, reason) => {
    const record = createEvaluationCorpusRecord();
    change(record);
    expectExcluded(record, reason);
  });

  it("denies access unless the actor explicitly holds the record group", () => {
    for (const groups of [
      [],
      ["different-access-group"],
      [actor.groups[0].toUpperCase()],
    ]) {
      expect(
        assess(createEvaluationCorpusRecord(), { groups }).reasonCounts,
      ).toEqual({ ACCESS_DENIED: 1 });
    }
    expect(
      assess(createEvaluationCorpusRecord(), {
        groups: ["different-access-group", ...actor.groups],
      }).admittedCount,
    ).toBe(1);
    for (const access of [
      undefined,
      {},
      { groups: actor.groups, isAdmin: true },
      { groups: Array(33).fill(actor.groups[0]) },
    ]) {
      // Pass directly: assess() intentionally defaults only its convenience argument.
      expect(
        assessEvaluationCorpus(createEvaluationCorpusManifest(), access, asOf),
      ).toMatchObject({
        status: "rejected",
        reasonCounts: { INVALID_ACTOR: 1 },
      });
    }
  });

  it.each(["2026-11-07", "not-a-time", "2026-11-07T00:00:00"])(
    "rejects ambiguous evaluation time %s",
    (time) => {
      expect(
        assessEvaluationCorpus(createEvaluationCorpusManifest(), actor, time),
      ).toMatchObject({
        status: "rejected",
        reasonCounts: { INVALID_AS_OF: 1 },
      });
    },
  );

  it("uses timestamp instants rather than timezone string order", () => {
    const record = createEvaluationCorpusRecord();
    record.permission.expiresAt = "2026-11-07T05:30:00+05:30";
    expectExcluded(record, "PERMISSION_EXPIRED");
  });

  it.each(["id", "contentHash"] as const)(
    "excludes every duplicate %s peer, independent of input order",
    (field) => {
      const first = createEvaluationCorpusRecord();
      const second = createEvaluationCorpusRecord();
      second.id = "synthetic-record-0002";
      second.contentHash = "b".repeat(64);
      second[field] = first[field];
      const reason = field === "id" ? "DUPLICATE_ID" : "DUPLICATE_HASH";
      for (const records of [
        [first, second],
        [second, first],
      ]) {
        expect(
          assessEvaluationCorpus(
            createEvaluationCorpusManifest(records),
            actor,
            asOf,
          ),
        ).toMatchObject({
          admittedCount: 0,
          excludedCount: 2,
          reasonCounts: { [reason]: 2 },
        });
      }
    },
  );

  it("does not let an unauthorized duplicate rehabilitate its permitted peer", () => {
    const permitted = createEvaluationCorpusRecord();
    const unauthorized = {
      ...createEvaluationCorpusRecord(),
      id: "synthetic-record-0002",
      sourceKind: "candidate_upload",
    };
    expect(
      assessEvaluationCorpus(
        createEvaluationCorpusManifest([permitted, unauthorized]),
        actor,
        asOf,
      ),
    ).toMatchObject({
      admittedCount: 0,
      reasonCounts: { UNAUTHORIZED_SOURCE: 1, DUPLICATE_HASH: 1 },
    });
  });

  it("counts a mixed batch without leaking per-record identifiers", () => {
    const good = createEvaluationCorpusRecord();
    const denied = createEvaluationCorpusRecord();
    denied.id = "synthetic-record-0002";
    denied.contentHash = "b".repeat(64);
    denied.accessGroup = "different-access-group";
    const result = assessEvaluationCorpus(
      { schemaVersion: 1, records: [good, denied, null] },
      actor,
      asOf,
    );
    expect(result).toMatchObject({
      totalRecords: 3,
      admittedCount: 1,
      excludedCount: 2,
      reasonCounts: { ACCESS_DENIED: 1, INVALID_RECORD: 1 },
    });
    expect(JSON.stringify(result)).not.toContain(good.id);
    expect(JSON.stringify(result)).not.toContain(denied.contentHash);
  });

  it("retains partition metadata without promoting calibration or locked-test validity", () => {
    for (const partition of ["development", "calibration", "locked_test"]) {
      const record = { ...createEvaluationCorpusRecord(), partition };
      expect(evaluationCorpusRecordSchema.safeParse(record).success).toBe(true);
      expect(assess(record)).toMatchObject({
        admittedCount: 1,
        representativeReady: false,
        releaseReady: false,
      });
    }
  });
});

describe("corpus lifecycle planning", () => {
  it("distinguishes active metadata, pending deletion and already-deleted evidence", () => {
    const record = createEvaluationCorpusRecord();
    expect(assessCorpusRetention(record, asOf)).toEqual({
      status: "assessed",
      reason: null,
      requiresDeletion: false,
      invalidateDerivedEvidence: false,
    });
    for (const change of [
      (r: Fixture) => {
        r.state = "revoked";
      },
      (r: Fixture) => {
        r.permission.state = "revoked";
      },
      (r: Fixture) => {
        r.permission.expiresAt = asOf;
      },
      (r: Fixture) => {
        r.retentionExpiresAt = asOf;
      },
    ]) {
      const expired = createEvaluationCorpusRecord();
      change(expired);
      expect(assessCorpusRetention(expired, asOf)).toEqual({
        status: "assessed",
        reason: null,
        requiresDeletion: true,
        invalidateDerivedEvidence: true,
      });
    }
    record.state = "deleted";
    expect(assessCorpusRetention(record, asOf)).toMatchObject({
      requiresDeletion: false,
      invalidateDerivedEvidence: true,
    });
  });

  it("fails closed on invalid lifecycle inputs without asserting actual deletion", () => {
    expect(assessCorpusRetention(null, asOf)).toEqual({
      status: "rejected",
      reason: "INVALID_RECORD",
      requiresDeletion: false,
      invalidateDerivedEvidence: true,
    });
    expect(
      assessCorpusRetention(createEvaluationCorpusRecord(), "invalid"),
    ).toMatchObject({
      status: "rejected",
      reason: "INVALID_AS_OF",
      invalidateDerivedEvidence: true,
    });
  });

  it("revokes and marks deleted immutably, with idempotent original timestamps", () => {
    const record = createEvaluationCorpusRecord();
    const original = structuredClone(record);
    const revoked = transitionCorpusRecord(record, "revoke", asOf);
    expect(revoked).toMatchObject({
      status: "updated",
      reason: null,
      record: { state: "revoked", stateChangedAt: asOf },
    });
    expect(record).toEqual(original);
    const later = "2026-11-08T00:00:00Z";
    expect(
      transitionCorpusRecord(revoked.record, "revoke", later).record,
    ).toEqual(revoked.record);
    const deleted = transitionCorpusRecord(
      revoked.record,
      "mark_deleted",
      later,
    );
    expect(deleted).toMatchObject({
      status: "updated",
      record: { state: "deleted", stateChangedAt: later },
    });
    expect(transitionCorpusRecord(deleted.record, "revoke", later)).toEqual({
      status: "rejected",
      reason: "INVALID_TRANSITION",
      record: null,
    });
    expect(
      transitionCorpusRecord(
        deleted.record,
        "mark_deleted",
        "2026-11-09T00:00:00Z",
      ).record,
    ).toEqual(deleted.record);
    expect(assess(deleted.record)).toMatchObject({
      admittedCount: 0,
      representativeReady: false,
      releaseReady: false,
    });
  });

  it("rejects backdated transitions and malformed metadata or timestamps", () => {
    const record = createEvaluationCorpusRecord();
    expect(
      transitionCorpusRecord(record, "revoke", "2026-10-31T00:00:00Z"),
    ).toMatchObject({
      status: "rejected",
      reason: "INVALID_TRANSITION",
      record: null,
    });
    expect(transitionCorpusRecord(record, "revoke", "invalid")).toMatchObject({
      status: "rejected",
      reason: "INVALID_AS_OF",
      record: null,
    });
    expect(transitionCorpusRecord(null, "mark_deleted", asOf)).toMatchObject({
      status: "rejected",
      reason: "INVALID_RECORD",
      record: null,
    });
  });
});

// These exercise a future authority contract with fictional metadata, not real-data permission.
describe("trusted representative corpus admission", () => {
  const representative = () => {
    const record = createEvaluationCorpusRecord();
    record.sourceKind = "real_resume";
    record.permission.purpose = REPRESENTATIVE_CORPUS_PURPOSE;
    record.provenance.fictionalIdentities = false;
    return record;
  };
  const assessWith = (
    record: unknown,
    authority?: EvaluationCorpusAuthority,
    groups = actor.groups,
    at = asOf,
  ) =>
    assessEvaluationCorpus(
      { schemaVersion: 1, records: [record] },
      { groups },
      at,
      authority,
    );

  it("binds the full normalized record, rights references, actor groups and clock", () => {
    const record = representative();
    const before = structuredClone(record);
    const recordHash = hashEvaluationCorpusRecord(record)!;
    const bindings: EvaluationCorpusAuthorization[] = [];
    const authority: EvaluationCorpusAuthority = {
      authorize: (binding) => {
        bindings.push(binding);
        expect(Object.isFrozen(binding)).toBe(true);
        expect(Object.isFrozen(binding.actorGroups)).toBe(true);
        return (
          binding.recordHash === recordHash &&
          binding.permissionReference === record.permission.reference &&
          binding.licenseReference === record.permission.licenseReference &&
          binding.actorGroups.join() === actor.groups.join() &&
          binding.asOf === asOf
        );
      },
    };
    expect(assessWith(record, authority).admittedCount).toBe(1);
    expect(bindings).toEqual([
      {
        recordHash,
        id: record.id,
        contentHash: record.contentHash,
        sourceKind: "real_resume",
        permissionReference: record.permission.reference,
        licenseReference: record.permission.licenseReference,
        purpose: REPRESENTATIVE_CORPUS_PURPOSE,
        actorGroups: actor.groups,
        asOf,
      },
    ]);
    expect(record).toEqual(before);
    const reordered = {
      ...Object.fromEntries(Object.entries(record).reverse()),
      permission: Object.fromEntries(
        Object.entries(record.permission).reverse(),
      ),
    };
    expect(hashEvaluationCorpusRecord(reordered)).toBe(recordHash);
    expect(
      hashEvaluationCorpusRecord({ ...record, rawText: "PRIVATE_CANARY" }),
    ).toBeNull();
    for (const mutate of [
      (value: Fixture) => {
        value.id = "changed_source_0001";
      },
      (value: Fixture) => {
        value.contentHash = "b".repeat(64);
      },
      (value: Fixture) => {
        value.sourceKind = "candidate_upload";
      },
      (value: Fixture) => {
        value.permission.reference = "changed_permission_0001";
      },
      (value: Fixture) => {
        value.permission.licenseReference = "changed_license_0001";
      },
      (value: Fixture) => {
        value.provenance.reference = "changed_provenance_0001";
      },
      (value: Fixture) => {
        value.retentionExpiresAt = "2026-11-29T00:00:00Z";
      },
    ]) {
      const changed = representative();
      mutate(changed);
      expect(hashEvaluationCorpusRecord(changed)).not.toBe(recordHash);
      expect(
        assessWith(changed, authority).reasonCounts.UNAUTHORIZED_SOURCE,
      ).toBe(1);
    }
    expect(
      assessWith(record, authority, [...actor.groups, "extra_actor_group"])
        .reasonCounts.UNAUTHORIZED_SOURCE,
    ).toBe(1);
    expect(
      assessWith(record, authority, actor.groups, "2026-11-07T00:01:00Z")
        .reasonCounts.UNAUTHORIZED_SOURCE,
    ).toBe(1);
  });

  it("denies missing, forged, throwing or non-boolean authorities without raw errors", () => {
    const record = representative();
    const authorities = [
      undefined,
      { authorize: true },
      JSON.parse('{"approved":true}'),
      { authorize: () => "true" },
      {
        authorize: () => {
          throw Error("PRIVATE_AUTHORITY_CANARY");
        },
      },
    ];
    for (const authority of authorities) {
      const result = assessWith(
        record,
        authority as EvaluationCorpusAuthority | undefined,
      );
      expect(result.reasonCounts).toEqual({ UNAUTHORIZED_SOURCE: 1 });
      expect(result.admittedCount).toBe(0);
      expect(JSON.stringify(result)).not.toContain("PRIVATE_AUTHORITY_CANARY");
    }
  });

  it.each([
    "synthetic_engineering_evaluation",
    "qualitative_ai",
    "upload_consent",
  ])("cannot reuse %s consent for representative intake", (purpose) => {
    const record = representative();
    record.permission.purpose = purpose;
    const authorize = vi.fn(() => true);
    expect(
      assessWith(record, { authorize }).reasonCounts.UNAUTHORIZED_SOURCE,
    ).toBe(1);
    expect(authorize).not.toHaveBeenCalled();
  });

  it.each([
    "real_resume",
    "real_job_description",
    "candidate_upload",
    "scraped",
  ])("derives no rights merely from %s source kind", (sourceKind) => {
    const record = representative();
    record.sourceKind = sourceKind;
    expect(assessWith(record).reasonCounts.UNAUTHORIZED_SOURCE).toBe(1);
    const admitted = assessWith(record, { authorize: () => true });
    expect(admitted.admittedCount).toBe(1);
    expect(admitted.representativeReady).toBe(false);
    expect(admitted.releaseReady).toBe(false);
  });

  it("keeps every core scope/state/permission/retention/access guard after trusted authorization", () => {
    const authority = { authorize: () => true };
    const cases: [(record: Fixture) => void, string][] = [
      [
        (r) => {
          r.segment.domain = "healthcare";
        },
        "OUT_OF_SCOPE",
      ],
      [
        (r) => {
          r.segment.locale = "US";
        },
        "OUT_OF_SCOPE",
      ],
      [
        (r) => {
          r.state = "revoked";
        },
        "RECORD_REVOKED",
      ],
      [
        (r) => {
          r.state = "deleted";
        },
        "RECORD_DELETED",
      ],
      [
        (r) => {
          r.permission.state = "revoked";
        },
        "PERMISSION_NOT_ACTIVE",
      ],
      [
        (r) => {
          r.permission.expiresAt = asOf;
        },
        "PERMISSION_EXPIRED",
      ],
      [
        (r) => {
          r.permission.grantedAt = "2026-11-08T00:00:00Z";
        },
        "PERMISSION_NOT_STARTED",
      ],
      [
        (r) => {
          r.retentionExpiresAt = asOf;
        },
        "RETENTION_EXPIRED",
      ],
    ];
    for (const [mutate, reason] of cases) {
      const record = representative();
      mutate(record);
      expect(assessWith(record, authority).reasonCounts).toEqual({
        [reason]: 1,
      });
    }
    expect(
      assessWith(representative(), authority, []).reasonCounts.ACCESS_DENIED,
    ).toBe(1);
    const authorize = vi.fn(() => {
      throw Error("Must not consult real authority for synthetic fixtures");
    });
    expect(
      assessWith(createEvaluationCorpusRecord(), { authorize }).admittedCount,
    ).toBe(1);
    expect(authorize).not.toHaveBeenCalled();
  });
});
