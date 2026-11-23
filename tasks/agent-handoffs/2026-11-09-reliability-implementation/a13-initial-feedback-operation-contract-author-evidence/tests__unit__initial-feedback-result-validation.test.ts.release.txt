import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scoreExtractedResume } from "../../app/lib/server/scoring-stage";
import {
  validateLegacyScoringResult,
  LegacyScoringInputError,
} from "../../app/lib/server/legacy-scoring-input";
const text =
  "Unit Engineer\nunit@example.test\nExperience\nBuilt services using Python\nSkills\nPython";
const textChecksum = createHash("sha256").update(text).digest("hex");
function result() {
  return scoreExtractedResume({
    text,
    textChecksum,
    pageCount: 1,
    pageTexts: [text],
    jobDescription: "Python required",
  });
}
const reverse = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(reverse)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .reverse()
            .map(([k, x]) => [k, reverse(x)]),
        )
      : v;
describe("additive original result validator", () => {
  it("accepts actual ordered producer result after JSONB-style reversed key order", () => {
    const d = result();
    expect(validateLegacyScoringResult(reverse(d), textChecksum)).toEqual(d);
  });
  it("rejects changed score with the old checksum", () => {
    const d = result();
    expect(() =>
      validateLegacyScoringResult(
        { ...d, score: d.score === 0 ? 1 : 0 },
        textChecksum,
      ),
    ).toThrow(LegacyScoringInputError);
  });
  it("rejects changed nested value with the old checksum", () => {
    const d = result();
    d.ruleTrace[0].detail += " altered";
    expect(() => validateLegacyScoringResult(d, textChecksum)).toThrow();
  });
  it("rejects foreign input checksum and unsupported producer", () => {
    expect(() =>
      validateLegacyScoringResult(result(), "0".repeat(64)),
    ).toThrow();
    expect(() =>
      validateLegacyScoringResult(
        { ...result(), rulesetVersion: "new-unreviewed" },
        textChecksum,
      ),
    ).toThrow();
  });
  it("keeps failure text fixed for malformed/unpaired input", () => {
    const d = result();
    d.ruleTrace[0].detail = "PRIVATE_CANARY\uD800";
    expect(() => validateLegacyScoringResult(d, textChecksum)).toThrow(
      "Bound deterministic scoring is unavailable.",
    );
  });
  it("adds only a wrapper; preserves all previous source algorithm and call sites", () => {
    const source = readFileSync(
      new URL("../../app/lib/server/legacy-scoring-input.ts", import.meta.url),
      "utf8",
    );
    const begin = source.indexOf("/** Pure existing-result decoder."),
      end = source.indexOf("function invocation(", begin);
    expect(begin).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(begin);
    expect(
      createHash("sha256")
        .update(source.slice(0, begin) + source.slice(end))
        .digest("hex"),
    ).toBe("28aef84b37a6c1ac36139f045e91b7d31cd88346036d7aec85c24b179492fdba");
  });
});
