import { randomUUID, createHash } from "node:crypto";
import { buildNativeEvidence } from "../../app/lib/server/native-evidence";
import { reconcileDocumentEvidence } from "../../app/lib/server/document-evidence";
import {
  importCanonicalEvidence,
  reviseCanonical,
} from "../../app/lib/server/canonical-content";
import { parseJobRequirements } from "../../app/lib/server/job-requirements";
export const SCORE_SOURCE =
  "Name: Fictional Person\nEmail: fictional@example.test\nPhone: +91 9876543210\nExperience\nEmployer: Fictional Company\nRole: Software Engineer\nDates: 2020-01-01 - 2022-01-01\nDates: 2021-01-01 - 2023-01-01\nBuilt reliable services\nEducation\nEducation: Bachelor\nSkills\nSQL\nTypeScript\nCertifications\nCertification: AWS";
export function scoreFixture(text = SCORE_SOURCE) {
  const ownerId = "11111111-1111-4111-8111-111111111111",
    analysisId = "22222222-2222-4222-8222-222222222222",
    organizationId = "33333333-3333-4333-8333-333333333333";
  const evidence = reconcileDocumentEvidence(
    {
      id: "44444444-4444-4444-8444-444444444444",
      ownerId,
      analysisId,
      sourceId: "55555555-5555-4555-8555-555555555555",
      inputSha256: createHash("sha256").update(text).digest("hex"),
      createdAt: "2026-10-12T00:00:00Z",
      retentionPolicyId: "test-synthetic/1.0.0",
    },
    buildNativeEvidence([text]),
  );
  let canonical = importCanonicalEvidence(evidence, {
    resumeId: "66666666-6666-4666-8666-666666666666",
    organizationId,
    ownerId,
  });
  for (const fact of canonical.facts)
    canonical = reviseCanonical(
      canonical,
      { operation: "confirm", factId: fact.id },
      "2026-10-12T00:00:00Z",
    );
  const role = canonical.facts.find(
    (f) => f.type === "role" && f.value === "Software Engineer",
  )!;
  // Manual synthetic owner associations test date arithmetic, not extractor accuracy.
  const dates = evidence.spans
    .filter((span) => span.text.startsWith("Dates: "))
    .map((span) => {
      const value = span.text.slice(7);
      return {
        id: randomUUID(),
        type: "dates" as const,
        value,
        state: "candidate_confirmed" as const,
        sources: [
          {
            attemptId: evidence.id,
            spanId: span.id,
            start: 7,
            end: Array.from(span.text).length,
          },
        ],
        confirmation: {
          actorId: ownerId,
          confirmedAt: "2026-10-12T00:00:00Z",
          value,
        },
      };
    });
  canonical.facts.push(...dates);
  canonical.sections.find((s) => s.type === "experience")!.entries = dates.map(
    (d) => ({ id: randomUUID(), factIds: [role.id, d.id], bullets: [] }),
  );
  canonical.createdAt = "2026-10-12T00:00:00Z";
  const requirements = parseJobRequirements(
    "Requirements\nMust have 3 years experience\nSQL required\nBachelor degree required\nAWS certification preferred\nNo visa sponsorship\nPython required but preferred",
    {
      ownerId,
      organizationId,
      analysisId,
      jobId: "77777777-7777-4777-8777-777777777777",
    },
  );
  requirements.createdAt = "2026-10-12T00:00:00Z";
  return { evidence, canonical, requirements };
}
