import { describe, expect, it } from "vitest";
import { CanonicalResumeDraftSchema } from "../../app/lib/server/canonical-resume-schema";

const id = (value: number) =>
  `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
function draft() {
  return {
    schemaVersion: "canonical-resume/1.0.0",
    producerVersion: "canonical-engine/1.0.0",
    analysisId: id(11),
    inputSha256: "a".repeat(64),
    retentionPolicyId: "synthetic/1.0.0",
    resumeId: id(1),
    versionId: id(2),
    parentVersionId: null,
    ownerId: id(3),
    organizationId: id(4),
    locale: "en-IN",
    createdAt: "2026-10-11T00:00:00.000Z",
    state: "review_required",
    sourceEvidenceVersionId: id(5),
    contactFactIds: [id(6)],
    facts: [
      {
        id: id(6),
        type: "name",
        value: "Demo Person",
        state: "source_supported",
        sources: [
          {
            attemptId: id(5),
            spanId: "native-page-1-line-1",
            start: 0,
            end: 11,
          },
        ],
        confirmation: null,
      },
    ],
    sections: [
      {
        id: id(7),
        type: "experience",
        title: "Experience",
        factIds: [],
        entries: [
          {
            id: id(8),
            factIds: [],
            bullets: [
              { id: id(9), text: "Needs candidate review", factIds: [] },
            ],
          },
        ],
      },
    ],
    changes: [
      {
        id: id(10),
        actorId: id(3),
        action: "create",
        targetId: id(2),
        priorValue: null,
        createdAt: "2026-10-11T00:00:00.000Z",
      },
    ],
  };
}
describe("canonical draft structural boundary", () => {
  it("preserves content order and source references without promoting trust", () => {
    const source = draft();
    expect(CanonicalResumeDraftSchema.parse(source)).toEqual(source);
    expect(source.state).toBe("review_required");
  });
  it("keeps unconfirmed content explicit in drafts", () => {
    const value = draft();
    value.facts[0].state = "unconfirmed";
    value.facts[0].sources = [];
    expect(CanonicalResumeDraftSchema.parse(value).facts[0].state).toBe(
      "unconfirmed",
    );
  });
  it("records an exact owner confirmation separately from source provenance", () => {
    const value = draft();
    value.facts[0].state = "candidate_confirmed";
    value.facts[0].sources = [];
    const raw = {
      ...value,
      facts: [
        {
          ...value.facts[0],
          confirmation: {
            actorId: id(3),
            confirmedAt: "2026-10-11T00:00:00.000Z",
            value: "Demo Person",
          },
        },
      ],
    };
    expect(CanonicalResumeDraftSchema.parse(raw).facts[0].sources).toEqual([]);
  });
  it.each([
    "duplicate-id",
    "dangling-fact",
    "duplicate-reference",
    "foreign-evidence",
    "missing-source",
    "fake-confirmation",
    "self-parent",
    "foreign-actor",
    "unknown-field",
    "verified-state",
    "backward-range",
    "non-contact",
  ])("rejects %s without inventing a repair", (mutation) => {
    const value: any = draft();
    if (mutation === "duplicate-id") value.sections[0].entries[0].id = id(6);
    if (mutation === "dangling-fact")
      value.sections[0].entries[0].bullets[0].factIds = [id(99)];
    if (mutation === "duplicate-reference") value.contactFactIds.push(id(6));
    if (mutation === "foreign-evidence")
      value.facts[0].sources[0].attemptId = id(99);
    if (mutation === "missing-source") value.facts[0].sources = [];
    if (mutation === "fake-confirmation") {
      value.facts[0].state = "candidate_confirmed";
      value.facts[0].confirmation = {
        actorId: id(99),
        value: "Forged Person",
        confirmedAt: value.createdAt,
      };
    }
    if (mutation === "self-parent") value.parentVersionId = value.versionId;
    if (mutation === "foreign-actor") value.changes[0].actorId = id(99);
    if (mutation === "unknown-field") value.score = 100;
    if (mutation === "verified-state") value.state = "verified";
    if (mutation === "backward-range") value.facts[0].sources[0].end = 0;
    if (mutation === "non-contact") value.facts[0].type = "employer";
    expect(CanonicalResumeDraftSchema.safeParse(value).success).toBe(false);
  });
  it("bounds aggregate content, not just each individual value", () => {
    const value = draft();
    value.contactFactIds = [];
    value.facts = Array.from({ length: 101 }, (_, index) => ({
      ...value.facts[0],
      id: id(index + 100),
      value: "x".repeat(2000),
    }));
    expect(CanonicalResumeDraftSchema.safeParse(value).success).toBe(false);
  });
});
