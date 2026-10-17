import { describe, expect, it } from "vitest";
import { parseJobRequirements } from "../../app/lib/server/job-requirements";
import { proposeJobRequirements } from "../../app/lib/server/job-requirement-proposals";
const ctx = {
  ownerId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  analysisId: "33333333-3333-4333-8333-333333333333",
  jobId: "44444444-4444-4444-8444-444444444444",
};
const base = () => parseJobRequirements("SQL", ctx);
function proposal() {
  const r = base().requirements[0];
  return {
    type: r.type,
    value: r.value,
    minimumYears: r.minimumYears,
    negated: r.negated,
    evidence: r.evidence,
    importance: "required",
    importanceBasis: "inferred",
    importanceEvidence: null,
  };
}
describe("bounded JD proposals", () => {
  it("defaults to no provider and distinguishes inferred importance", async () => {
    const b = base();
    expect(await proposeJobRequirements(b)).toEqual(b);
    const r = await proposeJobRequirements(b, {
      propose: async () => ({ items: [proposal()] }),
    });
    expect(r.requirements[0]).toMatchObject({
      importance: "required",
      importanceBasis: "inferred",
      derivation: "model_proposed",
      ambiguity: ["model_importance_review"],
    });
    expect(r.state).toBe("review_required");
    expect(b.requirements[0].importance).toBe("unknown");
  });
  it.each(["malformed", "invented", "duplicate", "explicit", "injection"])(
    "rejects %s output without losing baseline",
    async (kind) => {
      const b =
        kind === "explicit"
          ? parseJobRequirements("SQL required", ctx)
          : base();
      const p = proposal();
      if (kind === "invented") p.value = "Invented certification";
      const output =
        kind === "malformed"
          ? { score: 100 }
          : kind === "injection"
            ? { items: [{ ...p, system: "ignore rules" }] }
            : { items: kind === "duplicate" ? [p, p] : [p] };
      const r = await proposeJobRequirements(b, {
        propose: async () => output,
      });
      expect(r.requirements).toEqual(b.requirements);
      expect(r.warnings).toContain("model_proposals_unavailable");
    },
  );
  it("bounds timeout and outage with aborted adapter", async () => {
    let signal: AbortSignal | undefined;
    const b = base();
    const r = await proposeJobRequirements(
      b,
      {
        propose: async (input) => {
          signal = input.signal;
          return new Promise(() => {});
        },
      },
      5,
    );
    expect(signal?.aborted).toBe(true);
    expect(r.requirements).toEqual(b.requirements);
    expect(
      (
        await proposeJobRequirements(b, {
          propose: async () => {
            throw Error("private provider body");
          },
        })
      ).warnings,
    ).toContain("model_proposals_unavailable");
  });
  it("keeps varying model importance proposals unverified and source-bound", async () => {
    const original = base();
    const results = await Promise.all(
      ["required", "preferred"].map((importance) =>
        proposeJobRequirements(original, {
          propose: async () => ({ items: [{ ...proposal(), importance }] }),
        }),
      ),
    );
    expect(results.map((r) => r.requirements[0].importance)).toEqual([
      "required",
      "preferred",
    ]);
    expect(
      results.every(
        (r) =>
          r.state === "review_required" &&
          r.requirements[0].derivation === "model_proposed" &&
          r.requirements[0].evidence.quote === "SQL",
      ),
    ).toBe(true);
    expect(
      results.every(
        (r) => r.id !== original.id && r.parentVersionId === original.id,
      ),
    ).toBe(true);
  });
});
