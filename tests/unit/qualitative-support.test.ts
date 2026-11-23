import { describe, expect, it } from "vitest";
import { groundQualitativeProse } from "../../app/lib/server/qualitative-prose";

const quote = "Built services.";
const question = {
  type: "good" as const,
  tip: "What outcome can you verify?",
  explanation:
    "Add only a result you can verify. Leave this unanswered if the information is unavailable.",
  quote,
};
const output = (tip: {
  type: "good" | "improve";
  tip: string;
  explanation: string;
  quote: string;
}) => ({
  toneAndStyle: { tips: [tip] },
  content: { tips: [tip] },
  structure: { tips: [tip] },
  skills: { tips: [tip] },
  writer: { summary: null, bullets: [] },
});

describe("existing qualitative source-content admission regressions", () => {
  it("does not turn a missing-evidence question into a factual strength", () => {
    const result = groundQualitativeProse(output(question), quote);
    expect(result.content.tips).toEqual([{ ...question, type: "improve" }]);
  });
  it("withholds a question that presupposes an unobserved candidate achievement", () => {
    const result = groundQualitativeProse(
      output({
        ...question,
        type: "improve",
        tip: "Why did you lead the global team?",
      }),
      quote,
    );
    expect(result.content.tips).toEqual([]);
  });
  it("withholds unknown factual grammar rather than certifying the exact quote", () => {
    const result = groundQualitativeProse(
      output({
        ...question,
        tip: "Your system is universally resilient",
        explanation: "This proves production expertise.",
      }),
      quote,
    );
    expect(result.content.tips).toEqual([]);
  });
  it("fails closed on source resources even when its quoted fragment is present", () => {
    const result = groundQualitativeProse(
      output({
        ...question,
        type: "improve",
        tip: "Clarify this contribution",
        explanation: "Add context you can verify",
      }),
      quote + "\n" + "x".repeat(100001),
    );
    expect(result.content.tips).toEqual([]);
    expect(result.writer).toEqual({ summary: null, bullets: [] });
  });
});

import { createHash } from "node:crypto";
import {
  assessQualitativeProse,
  QualitativeSupportResultSchema,
  QUALITATIVE_SUPPORT_POLICY,
  QUALITATIVE_SUPPORT_POLICY_SHA256,
  QUALITATIVE_SUPPORT_POLICY_VERSION,
} from "../../app/lib/server/qualitative-support";
import { runQualitativeAi } from "../../app/lib/server/qualitative-ai";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const generic = {
  type: "improve" as const,
  tip: "Clarify this contribution",
  explanation: "Clarifies wording.",
  quote,
};

describe("pure qualitative source-content support manifest", () => {
  it("binds actual content and policy while explicitly withholding owned-version proof", () => {
    const result = assessQualitativeProse(output(generic), quote);
    expect(QualitativeSupportResultSchema.parse(result)).toEqual(result);
    expect(result.support).toMatchObject({
      authority: "source_content_only",
      ownedVersionProof: "not_provided",
      status: "assessed",
      binding: {
        sourceSha256: sha(quote),
        policyVersion: QUALITATIVE_SUPPORT_POLICY_VERSION,
        policySha256: QUALITATIVE_SUPPORT_POLICY_SHA256,
      },
    });
    expect(result.prose.content.tips).toEqual([generic]);
    expect(result.support.items[1]).toMatchObject({
      kind: "editorial_observation",
      state: "supported",
      retained: true,
      title: { reason: "editorial_template" },
      explanation: { reason: "editorial_template" },
    });
    expect(JSON.stringify(result.support)).not.toMatch(
      /ownerId|canonicalVersionId|nativeSha256/u,
    );
    expect(QUALITATIVE_SUPPORT_POLICY_SHA256).toBe(
      sha(JSON.stringify(QUALITATIVE_SUPPORT_POLICY)),
    );
    expect(Object.isFrozen(QUALITATIVE_SUPPORT_POLICY.limits)).toBe(true);
    expect(Object.isFrozen(QUALITATIVE_SUPPORT_POLICY.editorialTemplates)).toBe(
      true,
    );
  });
  it.each([
    { sourceSha256: "a".repeat(64) },
    { policyVersion: "unknown/1" },
    { policySha256: "b".repeat(64) },
  ])("refuses an expected source/policy mismatch %j", (expected) => {
    const result = assessQualitativeProse(output(generic), quote, expected);
    expect(result.support).toMatchObject({
      status: "unavailable",
      reason: "binding_mismatch",
    });
    expect(result.prose.content.tips).toEqual([]);
  });
  it("cannot upgrade source-content authority with caller proof fields", () => {
    const result = assessQualitativeProse(output(generic), quote, {
      sourceSha256: sha(quote),
      owned: true,
      canonicalVersionId: "invented",
    });
    expect(result.support).toMatchObject({
      status: "unavailable",
      reason: "invalid_input",
    });
  });
  it.each(["title", "explanation"] as const)(
    "validates factual %s independently instead of borrowing the other field",
    (field) => {
      const tip = {
        type: "good" as const,
        tip: quote,
        explanation: quote,
        quote,
      };
      if (field === "title") tip.tip = "Built services that doubled revenue.";
      else tip.explanation = "Built services that doubled revenue.";
      const result = assessQualitativeProse(output(tip), quote),
        item = result.support.items[1];
      expect(result.prose.content.tips).toEqual([]);
      expect(item.retained).toBe(false);
      expect(item[field].state).not.toBe("supported");
      expect(item[field === "title" ? "explanation" : "title"].state).toBe(
        "supported",
      );
      expect(JSON.stringify(result.support)).not.toContain("doubled revenue");
    },
  );
  it("retains an actual source rewrite with both fields and the unchanged actor supported", () => {
    const source = "We built services.",
      tip = {
        type: "good" as const,
        tip: "We developed services.",
        explanation: source,
        quote: source,
      };
    const result = assessQualitativeProse(output(tip), source),
      item = result.support.items[1];
    expect(result.prose.content.tips).toEqual([tip]);
    expect(item).toMatchObject({
      kind: "source_claim",
      state: "supported",
      type: "good",
      title: { state: "supported" },
      explanation: { state: "supported" },
    });
    expect(item.title.operations.map((v) => v.kind)).toContain(
      "replace_equivalent_action",
    );
    expect(
      assessQualitativeProse(
        output({ ...tip, tip: "I developed services." }),
        source,
      ).prose.content.tips,
    ).toEqual([]);
  });
  it("retains generic editorial feedback even when source agency cannot be parsed", () => {
    const source = "A tutorial is incomplete.";
    const result = assessQualitativeProse(
      output({ ...generic, quote: source }),
      source,
    );
    expect(result.prose.content.tips).toEqual([{ ...generic, quote: source }]);
    expect(result.support.items[1].kind).toBe("editorial_observation");
  });
  it("requires actual anchored context for a source-specific editorial topic", () => {
    const source = "Completed a tutorial.";
    expect(
      assessQualitativeProse(
        output({
          ...generic,
          explanation: "Clarifies dashboard wording.",
          quote: source,
        }),
        source,
      ).prose.content.tips,
    ).toEqual([]);
  });
  it("keeps source context and does not launder a qualified quoted clause into a factual strength", () => {
    const source = `Team achievements:\n${quote}`;
    const claim = assessQualitativeProse(
      output({ type: "good", tip: quote, explanation: quote, quote }),
      source,
    );
    expect(claim.prose.content.tips).toEqual([]);
    expect(
      assessQualitativeProse(output(generic), source).prose.content.tips,
    ).toEqual([generic]);
    expect(
      assessQualitativeProse(output(generic), source, {
        sourceSha256: sha(quote),
      }).support.reason,
    ).toBe("binding_mismatch");
  });
  it("records exact Unicode code-point quote ranges without normalizing the bound content", () => {
    const source = `🙂 ${quote}`,
      result = assessQualitativeProse(output(generic), source);
    expect(result.support.items[1].citation).toMatchObject({
      offsetUnit: "unicode_code_point",
      start: 2,
      end: 2 + Array.from(quote).length,
      quoteSha256: sha(quote),
    });
    expect(result.support.binding!.sourceSha256).toBe(sha(source));
    expect(
      QualitativeSupportResultSchema.safeParse({
        ...result,
        support: { ...result.support, ownedVersionProof: "verified" },
      }).success,
    ).toBe(false);
  });
  it("does not silently pick one repeated physical quotation", () => {
    const result = assessQualitativeProse(
      output(generic),
      `${quote}\n${quote}`,
    );
    expect(result.prose.content.tips).toEqual([]);
    expect(result.support.items[1]).toMatchObject({
      state: "rejected",
      reason: "quote_ambiguous",
      citation: null,
    });
  });
  it("records safe questions as clarification with no factual-strength projection", () => {
    const result = assessQualitativeProse(output(question), quote),
      item = result.support.items[1];
    expect(item).toMatchObject({
      kind: "clarification_question",
      state: "clarification_required",
      reason: "question_only",
      retained: true,
      type: "improve",
    });
    expect(item.title.operations).toEqual([]);
    expect(result.prose.content.tips[0].type).toBe("improve");
  });
  it("retains useful IR reordering and explicit role/contribution summaries beyond synonyms", () => {
    const source =
        "Backend Engineer at Cedar Labs\nImproved API latency by 20% at Cedar Labs.",
      summary =
        "Backend engineer who reduced API latency by 20% at Cedar Labs.";
    const raw = output(generic);
    raw.content.tips = [];
    raw.toneAndStyle.tips = [];
    raw.structure.tips = [];
    raw.skills.tips = [];
    const result = assessQualitativeProse(
      { ...raw, writer: { summary, bullets: [] } },
      source,
    );
    expect(result.prose.writer.summary).toBe(summary);
    expect(
      result.support.writer.summary!.operations.some(
        (v) => v.kind === "compose_explicit_role_contribution",
      ),
    ).toBe(true);
    const original = "Built services; maintained queues.",
      rewrite = "Maintained queues; built services.";
    const reordered = assessQualitativeProse(
      {
        ...raw,
        writer: {
          summary: null,
          bullets: [
            { original, rewrite, reasoning: "Reorders the existing facts." },
          ],
        },
      },
      original,
    );
    expect(reordered.prose.writer.bullets).toHaveLength(1);
    expect(
      reordered.support.writer.bullets[0].rewrite.operations.some(
        (v) => v.kind === "reorder_independent_clauses",
      ),
    ).toBe(true);
  });
  it("withholds unsupported writer summaries and reasoning with explicit sidecar decisions", () => {
    const raw = output(generic),
      result = assessQualitativeProse(
        {
          ...raw,
          writer: {
            summary: "Built services that doubled revenue.",
            bullets: [
              {
                original: quote,
                rewrite: "Developed services.",
                reasoning: "This doubled revenue.",
              },
            ],
          },
        },
        quote,
      );
    expect(result.prose.writer).toEqual({ summary: null, bullets: [] });
    expect(result.support.writer.summary!.state).not.toBe("supported");
    expect(result.support.writer.bullets[0].reasoning.state).not.toBe(
      "supported",
    );
  });
  it("refuses anchor-resource overflow rather than truncating source qualifiers", () => {
    const source =
      quote +
      "\n" +
      Array.from({ length: 512 }, (_, i) =>
        String.fromCharCode(97 + (i % 26)).repeat(3),
      ).join("\n");
    const result = assessQualitativeProse(output(generic), source);
    expect(result.support).toMatchObject({
      status: "unavailable",
      reason: "source_resource_limit",
    });
    expect(result.prose.content.tips).toEqual([]);
  });
  it("rejects malformed inputs and unpaired-surrogate source without raw errors", () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(assessQualitativeProse(cycle, quote).support.reason).toBe(
      "invalid_input",
    );
    expect(
      assessQualitativeProse(output(generic), "\ud800").support.reason,
    ).toBe("invalid_input");
    expect(
      assessQualitativeProse({ ...output(generic), proof: true }, quote).support
        .reason,
    ).toBe("invalid_input");
  });
  it("carries the actual sidecar through the AI wrapper without promoting it to owned proof", async () => {
    const result = await runQualitativeAi(
      {
        enabled: true,
        remainingTokenBudget: 1000,
        model: "unit",
        maxOutputTokens: 100,
        timeoutMs: 1000,
        idempotencyKey: "unit-support",
        resumeText: quote,
        jobTitle: "Unit",
        jobDescription: "Untrusted",
      },
      {
        execute: async () => ({
          output: output(question),
          usage: { inputTokens: 3, outputTokens: 2 },
        }),
      },
    );
    expect(result.support).toMatchObject({
      authority: "source_content_only",
      ownedVersionProof: "not_provided",
      binding: { sourceSha256: sha(quote) },
    });
    expect(result.output.content.tips[0].type).toBe("improve");
    expect(result.prose).not.toHaveProperty("score");
    expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 2 });
  });
});

it("withholds a non-template quoted question instead of copying it into a strength", () => {
  const source = "Built a dashboard?";
  const result = groundQualitativeProse(
    output({
      type: "good",
      tip: source,
      explanation: "Clarifies wording.",
      quote: source,
    }),
    source,
  );
  expect(result.content.tips).toEqual([]);
});
