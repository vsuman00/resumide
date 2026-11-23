import { describe, expect, it } from "vitest";
import { prepareLocalOcrReview } from "../../../app/lib/server/ocr/local-review-admission";

const binding = {
  ownerId: "10000000-0000-4000-8000-000000000001",
  analysisId: "10000000-0000-4000-8000-000000000002",
  sourceId: "10000000-0000-4000-8000-000000000003",
  sourceSha256: "a".repeat(64),
};
const worker = {
  imageId: `sha256:${"b".repeat(64)}`,
  region: "local-test",
  engine: "tesseract-5.3.0-2",
  renderer: "poppler-22.12.0-2+deb12u3/dpi-150",
  languageData: `sha256:${"c".repeat(64)}`,
};
const source = {
  ...binding,
  kind: "synthetic_fixture",
  state: "active",
  retentionPolicyId: "synthetic-local-30d/1.0.0",
  uploadBytes: 1_024,
  nativePageTexts: ["Usable original native text", ""],
};
const grant = {
  ...binding,
  purpose: "local_document_evidence_review",
  scope: "synthetic_engineering",
  allowThirdPartyProcessing: false,
  retentionPolicyId: source.retentionPolicyId,
  worker,
  expiresAt: "2026-11-22T00:00:30.000Z",
  allocation: {
    maxUploadBytes: 1_024,
    maxPages: 3,
    maxWallTimeMs: 5_000,
    maxCharacters: 1_000,
  },
};
const now = new Date("2026-11-22T00:00:28.000Z");
const authority = { enabled: true, source, worker, grant, now };

describe("local OCR review admission", () => {
  it("defaults to disabled with an inert response", () => {
    expect(prepareLocalOcrReview(binding)).toEqual({
      status: "denied",
      reason: "disabled",
    });
  });

  it("derives only the necessary pages and remaining execution budget from worker records", () => {
    expect(prepareLocalOcrReview(binding, authority)).toEqual({
      status: "ready_for_synthetic_review",
      scope: {
        ...binding,
        purpose: "local_document_evidence_review",
        retentionPolicyId: source.retentionPolicyId,
        worker,
        selectedPages: [{ pageId: "page-2", pageNumber: 2 }],
        maxWallTimeMs: 2_000,
        scoringEligible: false,
      },
    });
  });

  it.each([
    { allocation: grant.allocation },
    { selectedPages: [1, 2] },
    { grant },
    { worker },
    { purpose: "synthetic_local_test" },
  ])("rejects client-supplied worker data: %j", (extra) => {
    expect(prepareLocalOcrReview({ ...binding, ...extra }, authority)).toEqual({
      status: "denied",
      reason: "invalid_request",
    });
  });

  it.each([
    { ...binding, ownerId: "10000000-0000-4000-8000-000000000011" },
    { ...binding, analysisId: "10000000-0000-4000-8000-000000000012" },
    { ...binding, sourceId: "10000000-0000-4000-8000-000000000013" },
    { ...binding, sourceSha256: "d".repeat(64) },
  ])("denies mismatches against either trusted binding", (mismatch) => {
    expect(prepareLocalOcrReview(mismatch, authority)).toEqual({
      status: "denied",
      reason: "source_binding",
    });
    expect(
      prepareLocalOcrReview(binding, {
        ...authority,
        grant: { ...grant, ...mismatch },
      }),
    ).toEqual({ status: "denied", reason: "source_binding" });
  });

  it.each([
    { imageId: `sha256:${"d".repeat(64)}` },
    { region: "other-region" },
    { renderer: "poppler-22.12.0-2+deb12u3/dpi-300" },
    { engine: "unknown-engine" },
    { languageData: `sha256:${"e".repeat(64)}` },
  ])("refuses a worker that disagrees with the grant", (changedWorker) => {
    expect(
      prepareLocalOcrReview(binding, {
        ...authority,
        worker: { ...worker, ...changedWorker },
      }),
    ).toEqual({ status: "denied", reason: "worker_binding" });
  });

  it.each([
    [
      "retention_policy",
      { source: { ...source, retentionPolicyId: "different-policy" } },
    ],
    [
      "invalid_worker_record",
      { grant: { ...grant, scope: "candidate_upload" } },
    ],
    [
      "invalid_worker_record",
      { grant: { ...grant, allowThirdPartyProcessing: true } },
    ],
    [
      "invalid_worker_record",
      { grant: { ...grant, purpose: "synthetic_local_test" } },
    ],
    [
      "invalid_worker_record",
      { source: { ...source, kind: "candidate_upload" } },
    ],
    ["invalid_worker_record", { source: { ...source, state: "deleted" } }],
    ["invalid_worker_record", { now: new Date("invalid") }],
    [
      "invalid_worker_record",
      { worker: { ...worker, imageId: "container:latest" } },
    ],
    ["expired", { now: new Date(grant.expiresAt) }],
    ["resource_limit", { source: { ...source, uploadBytes: 1025 } }],
    [
      "resource_limit",
      { source: { ...source, nativePageTexts: ["x".repeat(1001), ""] } },
    ],
    [
      "resource_limit",
      { source: { ...source, nativePageTexts: ["", "", "", ""] } },
    ],
    [
      "ocr_not_needed",
      {
        source: { ...source, nativePageTexts: ["Usable original native text"] },
      },
    ],
  ] as const)("denies %s with a bounded reason", (reason, changedAuthority) => {
    expect(
      prepareLocalOcrReview(binding, { ...authority, ...changedAuthority }),
    ).toEqual({ status: "denied", reason });
  });
});
