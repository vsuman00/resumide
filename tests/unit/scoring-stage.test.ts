import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ enabled: false, admin: vi.fn() }));
vi.mock("../../app/lib/server/config", () => ({
  getAnalysisConfig: () => ({
    LEGACY_SCORING_INPUT_ENABLED: mocks.enabled,
    ANALYSIS_FENCING_ENABLED: false,
  }),
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: mocks.admin,
}));
import {
  NORMALIZER_VERSION,
  PARSER_VERSION,
  RULESET_VERSION,
  scoreExtractedResume,
  processScoringStage,
} from "../../app/lib/server/scoring-stage";
import { TAXONOMY_VERSION } from "../../app/lib/server/matching";

const fixture = {
  text: `Jane Doe
jane@example.com

Summary
Frontend engineer building accessible web applications.

Experience
Frontend Engineer
2022 - Present
• Built React and TypeScript applications for customers.

Education
B.S. Computer Science

Skills
React, TypeScript, Node.js`,
  pageCount: 1,
  jobDescription: "Frontend engineer with React and TypeScript experience",
  textChecksum: "a".repeat(64),
};

describe("deterministic scoring stage", () => {
  it("produces versioned rule evidence", () => {
    const result = scoreExtractedResume(fixture);
    expect(result.parserVersion).toBe(PARSER_VERSION);
    expect(result.rulesetVersion).toBe(RULESET_VERSION);
    expect(result.normalizerVersion).toBe(NORMALIZER_VERSION);
    expect(result.taxonomyVersion).toBe(TAXONOMY_VERSION);
    expect(result.keywordCoverage).toMatchObject({
      taxonomyVersion: TAXONOMY_VERSION,
      job: ["frontend", "React", "TypeScript"],
      matched: ["frontend", "React", "TypeScript"],
    });
    expect(result.keywordCoverage.evidence).toHaveLength(3);
    expect(result.ruleTrace).toHaveLength(9);
    expect(result.resultChecksum).toHaveLength(64);
  });

  it("is reproducible for identical versioned input", () => {
    expect(scoreExtractedResume(fixture)).toEqual(
      scoreExtractedResume(fixture),
    );
  });

  it("changes evidence when the input changes", () => {
    const first = scoreExtractedResume(fixture);
    const second = scoreExtractedResume({
      ...fixture,
      text: `${fixture.text}\nPostgreSQL`,
      textChecksum: "b".repeat(64),
    });
    expect(second.resultChecksum).not.toBe(first.resultChecksum);
  });
});

describe("owned scoring worker integration", () => {
  beforeEach(() => {
    mocks.enabled = false;
    mocks.admin.mockReset();
  });
  it("does not use the legacy table query when bound mode is enabled", async () => {
    mocks.enabled = true;
    const from = vi.fn((table: string) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        single: vi.fn(async () => ({
          data: {
            status: "scoring",
            request_id: "unit-request",
            jobs: { description: fixture.jobDescription },
            analysis_extractions: {
              extracted_text: fixture.text,
              text_checksum: fixture.textChecksum,
              page_count: fixture.pageCount,
              page_texts: [],
            },
          },
          error: null,
        })),
        limit: vi.fn(async () => ({
          data: table === "document_evidence_attempts" ? [] : null,
          error: null,
        })),
      };
      return chain;
    });
    const rpc = vi.fn(async (name: string) =>
      name === "read_legacy_scoring_readiness"
        ? {
            data: null,
            error: { code: "P0C03", message: "PRIVATE_UNIT_CANARY" },
          }
        : { data: true, error: null },
    );
    mocks.admin.mockReturnValue({ from, rpc });
    await expect(
      processScoringStage("00000000-0000-4000-8000-000000000101", {
        lease: {
          workerId: "worker-unit",
          attempt: 1,
          leaseFence: "00000000-0000-4000-8000-000000000102",
        },
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(from.mock.calls.every(([table]) => table !== "analyses")).toBe(true);
    expect(
      rpc.mock.calls.some(
        ([name]) =>
          name === "persist_deterministic_analysis" ||
          name === "persist_analysis_stage_v2",
      ),
    ).toBe(false);
  });
});

// Native metadata and storage are fakes; the stage, decoder, scorer and guard are real.
import { LEGACY_SCORING_INPUT_PROFILE } from "../../app/lib/server/legacy-scoring-input-profile";
import {
  LegacyScoringInputContextSchema,
  LegacyScoringResultSchema,
} from "../../app/lib/server/legacy-scoring-input";
function workerStore(
  status: "ready" | "skipped" | "committed" = "ready",
  flags: { uncalibrated?: boolean; stale?: boolean; staged?: boolean } = {},
) {
  const analysisId = "00000000-0000-4000-8000-000000000101",
    ownerId = "00000000-0000-4000-8000-000000000103",
    organizationId = "00000000-0000-4000-8000-000000000104";
  const resumeId = "00000000-0000-4000-8000-000000000105",
    resumeVersionId = "00000000-0000-4000-8000-000000000106",
    jobId = "00000000-0000-4000-8000-000000000107";
  const textChecksum = createHash("sha256").update(fixture.text).digest("hex");
  const context = LegacyScoringInputContextSchema.parse({
    schemaVersion: "legacy-scoring-input/1.0.0",
    analysisId,
    ownerId,
    organizationId,
    requestId: "unit-request",
    source: {
      resumeId,
      resumeVersionId,
      fileChecksum: "a".repeat(64),
      bytes: 1000,
      mediaType: "application/pdf",
    },
    extraction: {
      text: fixture.text,
      textChecksum,
      pageCount: fixture.pageCount,
      pageTexts: [fixture.text],
      extractorVersion: "unpdf-v1",
      contentSha256: "b".repeat(64),
    },
    job: {
      kind: "owned_job",
      id: jobId,
      title: "Unit role",
      description: fixture.jobDescription,
      companyName: "",
      contentSha256: "c".repeat(64),
    },
    binding: {
      schemaVersion: "legacy-scoring-binding/1.0.0",
      analysisId,
      ownerId,
      organizationId,
      resumeId,
      resumeVersionId,
      fileChecksum: "a".repeat(64),
      textChecksum,
      extractionSha256: "b".repeat(64),
      jobId,
      jobSha256: "c".repeat(64),
      inputBindingSha256: "d".repeat(64),
    },
    producer: {
      parserVersion: PARSER_VERSION,
      rulesetVersion: RULESET_VERSION,
      normalizerVersion: NORMALIZER_VERSION,
      taxonomyVersion: TAXONOMY_VERSION,
    },
  });
  const expected = scoreExtractedResume({
    ...fixture,
    textChecksum,
    pageTexts: [fixture.text],
  });
  const receipt = {
    schemaVersion: "legacy-scoring-receipt/1.0.0",
    analysisId,
    ownerId,
    organizationId,
    resumeVersionId,
    inputBindingSha256: context.binding.inputBindingSha256,
    resultChecksum: expected.resultChecksum,
    deterministicContentSha256: "e".repeat(64),
    createdAt: "2026-11-15T00:00:00.123456Z",
    replayed: false,
  };
  const from = vi.fn((table: string) => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      single: vi.fn(async () => ({
        data: {
          status: "scoring",
          request_id: "unit-request",
          jobs: { description: fixture.jobDescription },
          analysis_extractions: {
            extracted_text: fixture.text,
            text_checksum: fixture.textChecksum,
            page_count: fixture.pageCount,
            page_texts: [],
          },
        },
        error: null,
      })),
      limit: vi.fn(async () => ({
        data:
          table === "document_evidence_attempts"
            ? flags.uncalibrated
              ? [{ id: "unit-evidence" }]
              : []
            : null,
        error: null,
      })),
    };
    return chain;
  });
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "read_legacy_scoring_readiness")
      return {
        data: {
          ...LEGACY_SCORING_INPUT_PROFILE,
          schemaReady: true,
          writerExecutable: !flags.staged,
        },
        error: null,
      };
    if (name === "read_legacy_scoring_input")
      return {
        data:
          status === "ready"
            ? { schemaVersion: "legacy-scoring-read/1.0.0", status, context }
            : status === "committed"
              ? { schemaVersion: "legacy-scoring-read/1.0.0", status, receipt }
              : {
                  schemaVersion: "legacy-scoring-read/1.0.0",
                  status,
                  analysisId,
                  reason: "not_scoring",
                },
        error: null,
      };
    if (name === "finish_legacy_scoring_input") {
      if (flags.stale)
        return {
          data: null,
          error: { code: "P0C01", message: "PRIVATE_UNIT_CANARY" },
        };
      expect(LegacyScoringResultSchema.parse(args.p_result)).toEqual(expected);
      return { data: receipt, error: null };
    }
    return { data: true, error: null };
  });
  return {
    client: { from, rpc },
    context,
    expected,
    analysisId,
    lease: {
      workerId: "worker-unit",
      attempt: 1,
      leaseFence: "00000000-0000-4000-8000-000000000102",
    },
  };
}
describe("bound scoring stage cutover", () => {
  beforeEach(() => {
    mocks.enabled = true;
    mocks.admin.mockReset();
  });
  it("persists the unchanged real scorer result only through bound finish", async () => {
    const s = workerStore();
    mocks.admin.mockReturnValue(s.client);
    expect(await processScoringStage(s.analysisId, { lease: s.lease })).toBe(
      true,
    );
    expect(s.client.rpc.mock.calls.map(([n]) => n)).toEqual([
      "read_legacy_scoring_readiness",
      "read_legacy_scoring_input",
      "read_legacy_scoring_readiness",
      "finish_legacy_scoring_input",
    ]);
    const args = s.client.rpc.mock.calls[3][1];
    expect(args).toMatchObject({
      p_analysis_id: s.analysisId,
      p_lease: s.lease,
      p_binding: s.context.binding,
      p_result: s.expected,
      p_request_id: "unit-request",
    });
    expect(s.client.from.mock.calls.map(([table]) => table)).toEqual([
      "document_evidence_attempts",
    ]);
  });
  it("preserves the disabled legacy path without new RPCs", async () => {
    mocks.enabled = false;
    const s = workerStore();
    mocks.admin.mockReturnValue(s.client);
    expect(await processScoringStage(s.analysisId)).toBe(true);
    expect(s.client.rpc.mock.calls.map(([n]) => n)).toEqual([
      "persist_deterministic_analysis",
    ]);
    expect(s.client.from.mock.calls.map(([table]) => table)).toEqual([
      "analyses",
      "document_evidence_attempts",
    ]);
  });
  it.each(["skipped", "committed"] as const)(
    "returns false for %s without rescoring or persistence",
    async (status) => {
      const s = workerStore(status);
      mocks.admin.mockReturnValue(s.client);
      expect(await processScoringStage(s.analysisId, { lease: s.lease })).toBe(
        false,
      );
      expect(s.client.from).not.toHaveBeenCalled();
      expect(s.client.rpc).toHaveBeenCalledTimes(2);
    },
  );
  it("requires a real lease and retains the uncalibrated-evidence guard", async () => {
    const s = workerStore("ready", { uncalibrated: true });
    mocks.admin.mockReturnValue(s.client);
    await expect(processScoringStage(s.analysisId)).rejects.toMatchObject({
      code: "invalid",
    });
    expect(s.client.rpc).not.toHaveBeenCalled();
    expect(await processScoringStage(s.analysisId, { lease: s.lease })).toBe(
      false,
    );
    expect(
      s.client.rpc.mock.calls.every(
        ([n]) => n !== "finish_legacy_scoring_input",
      ),
    ).toBe(true);
  });
  it.each([{ staged: true }, { stale: true }])(
    "never falls back when native admission/finish refuses %j",
    async (flags) => {
      const s = workerStore("ready", flags);
      mocks.admin.mockReturnValue(s.client);
      await expect(
        processScoringStage(s.analysisId, { lease: s.lease }),
      ).rejects.toHaveProperty("code", flags.stale ? "stale" : "unavailable");
      expect(
        s.client.rpc.mock.calls.every(
          ([n]) =>
            n !== "persist_deterministic_analysis" &&
            n !== "persist_analysis_stage_v2",
        ),
      ).toBe(true);
    },
  );
});
