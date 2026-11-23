// Metadata-only fixtures. No document has been collected or independently labelled.
export function createEvaluationCorpusRecord() {
  return {
    id: "synthetic-record-0001",
    contentHash: "a".repeat(64),
    sourceKind: "synthetic",
    format: "pdf",
    segment: {
      domain: "software_engineering",
      language: "en",
      locale: "IN",
      documentClass: "native",
      layout: "single_column",
    },
    provenance: {
      reference: "synthetic-provenance-0001",
      generatorVersion: "synthetic-generator-0001",
      sourceFamilyId: "synthetic-family-0001",
      templateId: "synthetic-template-0001",
      nearDuplicateGroupId: "synthetic-cluster-0001",
      fictionalIdentities: true,
    },
    permission: {
      reference: "synthetic-permission-0001",
      licenseReference: "synthetic-license-0001",
      purpose: "synthetic_engineering_evaluation",
      grantedAt: "2026-11-01T00:00:00Z",
      expiresAt: "2026-11-30T00:00:00Z",
      state: "active",
    },
    partition: "development",
    accessGroup: "synthetic-evaluation-group",
    retentionExpiresAt: "2026-11-30T00:00:00Z",
    state: "active",
    stateChangedAt: "2026-11-01T00:00:00Z",
  };
}

export function createEvaluationCorpusManifest(
  records = [createEvaluationCorpusRecord()],
) {
  return { schemaVersion: 1, records };
}

const native = createEvaluationCorpusRecord();
const scanned = createEvaluationCorpusRecord();
scanned.id = "synthetic-record-0002";
scanned.contentHash = "b".repeat(64);
scanned.segment.documentClass = "scanned";
scanned.segment.layout = "challenging_scan";
const mixed = createEvaluationCorpusRecord();
mixed.id = "synthetic-record-0003";
mixed.contentHash = "c".repeat(64);
mixed.segment.documentClass = "mixed";
mixed.segment.layout = "multi_column";

export const EVALUATION_CORPUS_DEMO = {
  manifest: createEvaluationCorpusManifest([native, scanned, mixed]),
  actor: { groups: ["synthetic-evaluation-group"] },
  asOf: "2026-11-07T00:00:00Z",
};
