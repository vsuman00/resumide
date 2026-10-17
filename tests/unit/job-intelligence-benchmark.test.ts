import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  JobRequirementsSchema,
  parseJobRequirements,
} from "../../app/lib/server/job-requirements";
import { benchmarkJobIntelligence } from "../../app/lib/server/job-intelligence-benchmark";
import { JOB_INTELLIGENCE_FIXTURES } from "../fixtures/job-intelligence";
describe("JD engineering benchmark", () => {
  it("retains historical producer compatibility and rejects unrecognized producers", () => {
    const doc = parseJobRequirements("SQL required", {
      ownerId: "11111111-1111-4111-8111-111111111111",
      organizationId: "22222222-2222-4222-8222-222222222222",
      analysisId: "33333333-3333-4333-8333-333333333333",
      jobId: "44444444-4444-4444-8444-444444444444",
    });
    for (const producerVersion of [
      "jd-parser/1.0.0",
      "jd-parser/1.0.1",
      "jd-parser/1.0.2",
    ])
      expect(
        JobRequirementsSchema.safeParse({ ...doc, producerVersion }).success,
      ).toBe(true);
    expect(
      JobRequirementsSchema.safeParse({
        ...doc,
        producerVersion: "jd-parser/99.0.0",
      }).success,
    ).toBe(false);
  });
  it("matches SQL shape to the server contract", () => {
    const sql = readFileSync(
      "supabase/migrations/20261017000000_job_requirement_parser_compatibility.sql",
      "utf8",
    );
    const schema = sql.match(/\$schema\$(.*?)\$schema\$/su)![1];
    expect(JSON.parse(schema)).toEqual(
      z.toJSONSchema(JobRequirementsSchema, { target: "draft-7" }),
    );
  });
  it("reports reproducible segment metrics without claiming released mapping validity", () => {
    const r = benchmarkJobIntelligence(JOB_INTELLIGENCE_FIXTURES);
    expect(r.engineeringPassed).toBe(true);
    expect(r.segments).toHaveLength(2);
    expect(r.releasePassed).toBe(false);
    expect(r.mappingQuality).toBeNull();
    expect(r.marketDatasetAvailable).toBe(false);
    expect(
      r.segments.every((s) => !s.variance && s.citationPrecision === 1),
    ).toBe(true);
  });
  it("fails engineering floors when exact gold is missed", () => {
    const fixture = structuredClone(JOB_INTELLIGENCE_FIXTURES[0]);
    const bad = {
      ...fixture,
      gold: [
        ...fixture.gold,
        {
          type: "other",
          value: "Unrecognized clause",
          quote: "Unrecognized clause",
          importance: "required",
        },
      ],
    };
    expect(benchmarkJobIntelligence([bad]).engineeringPassed).toBe(false);
  });
  it("measures supplied mapping gold rather than fabricating quality for missing releases", () => {
    const release = {
      provider: "onet" as const,
      version: "31.0",
      language: "en" as const,
      sourceUrl: "https://www.onetcenter.org/database.html",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      attribution: "Entirely fictional test data",
      modifications: "Synthetic",
      sha256: "a".repeat(64),
      reviewId: "synthetic-test-only",
      concepts: [
        {
          id: "synthetic-python",
          kind: "skill" as const,
          label: "Python",
          aliases: ["Python programming"],
        },
      ],
    };
    const r = benchmarkJobIntelligence(JOB_INTELLIGENCE_FIXTURES, {
      release,
      gold: [
        {
          value: "Python programming",
          kind: "skill",
          expectedId: "synthetic-python",
        },
        { value: "unlisted", kind: "skill", expectedId: null },
        { value: "Python", kind: "skill", expectedId: "wrong-synthetic-id" },
      ],
    });
    expect(r.mappingQuality).toMatchObject({
      total: 3,
      correct: 2,
      abstentions: 1,
    });
    expect(r.releasePassed).toBe(false);
  });
});
