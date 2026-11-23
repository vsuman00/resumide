import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assessQualitativeProse,
  type QualitativeSourceProse,
} from "../../app/lib/server/qualitative-support";
import { buildWritingSupportDocument } from "../../app/lib/server/writing-support";
import {
  compileInitialFeedbackPlan,
  renderInitialFeedbackPlan,
} from "../../app/lib/server/initial-feedback-plan";
import {
  INITIAL_FEEDBACK_PLAN_POLICY,
  INITIAL_FEEDBACK_PLAN_POLICY_SHA256,
  InitialFeedbackNativeSupportSchema,
  InitialFeedbackNoProviderResultSchema,
  InitialFeedbackPlanError,
} from "../../app/lib/server/initial-feedback-contract";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function empty(): QualitativeSourceProse {
  return {
    toneAndStyle: { tips: [] },
    content: { tips: [] },
    structure: { tips: [] },
    skills: { tips: [] },
    writer: { summary: null, bullets: [] },
  };
}
function rawTip(
  source: string,
  tip = source,
  explanation = "Clarifies wording.",
  type: "good" | "improve" = "good",
) {
  const raw = empty();
  raw.content.tips = [{ type, tip, explanation, quote: source }];
  return raw;
}
function available(source: string, raw: unknown) {
  const result = compileInitialFeedbackPlan(source, raw);
  expect(result.status).toBe("available");
  if (result.status !== "available")
    throw Error("EXPECTED_AVAILABLE_" + result.reason);
  return result;
}
function ref(source: string) {
  return { start: 0, end: Array.from(source).length, textSha256: hash(source) };
}

describe("initial feedback closed plan actual core and protocol", () => {
  it("binds actual policy descriptor and never fabricates Native authority", () => {
    expect(INITIAL_FEEDBACK_PLAN_POLICY_SHA256).toBe(
      hash(JSON.stringify(INITIAL_FEEDBACK_PLAN_POLICY)),
    );
    const value = available(
      "Built a dashboard.",
      rawTip(
        "Built a dashboard.",
        "Developed a dashboard.",
        "Clarifies dashboard wording.",
      ),
    );
    expect(value.rendered).toMatchObject({
      authority: "source_content_only",
      ownedVersionProof: "not_provided",
    });
    expect(value.rendered).not.toHaveProperty("bindingSha256");
    expect(value.rendered).not.toHaveProperty("planSha256");
    expect(
      InitialFeedbackNativeSupportSchema.safeParse(value.rendered).success,
    ).toBe(false);
    expect(value.plan.content[0].title.kind).toBe("rewrite_clauses");
    expect(value.rendered.prose.content.tips[0].tip).toBe(
      "Developed a dashboard.",
    );
    expect(renderInitialFeedbackPlan("Built a dashboard.", value.plan)).toEqual(
      value.rendered,
    );
  });
  it("normalizes admitted layout and guarded prose without changing opaque identifiers", () => {
    const source = "Built a dash\u00ADboard.",
      target = "Built a dashboard.";
    const value = available(source, rawTip(source, target));
    expect(value.plan.content[0].title).toMatchObject({
      kind: "normalize_layout",
      typography: "admitted_prose",
    });
    const layout = "Built a\n dashboard.";
    expect(
      available(layout, rawTip(layout, target)).rendered.prose.content.tips[0]
        .tip,
    ).toBe(target);
    const opaque = "Built named dash\u00ADboard.";
    expect(
      compileInitialFeedbackPlan(
        opaque,
        rawTip(opaque, "Built named dashboard."),
      ).status,
    ).toBe("unavailable");
  });
  it("reorders independent clauses and retains full clause membership", () => {
    const source = "Built services; maintained queues.",
      raw = empty();
    raw.writer.bullets = [
      {
        original: source,
        rewrite: "Maintained queues; built services.",
        reasoning: "Reorders the existing facts.",
      },
    ];
    const value = available(source, raw);
    expect(value.plan.writer.bullets[0].rewrite).toMatchObject({
      kind: "rewrite_clauses",
      clauses: [{ sourceIndex: 1 }, { sourceIndex: 0 }],
    });
    expect(
      renderInitialFeedbackPlan(source, value.plan).prose.writer.bullets,
    ).toEqual(raw.writer.bullets);
    const bad = JSON.parse(JSON.stringify(value.plan));
    bad.writer.bullets[0].rewrite.clauses[1].sourceIndex = 1;
    expect(() => renderInitialFeedbackPlan(source, bad)).toThrow(
      InitialFeedbackPlanError,
    );
  });
  it("composes only the explicit adjacent same-employer role/contribution", () => {
    const source =
        "Backend Engineer at Cedar Labs\nImproved API latency by 20% at Cedar Labs.",
      raw = empty();
    raw.writer.summary =
      "Backend engineer who reduced API latency by 20% at Cedar Labs.";
    const value = available(source, raw);
    expect(value.plan.writer.summary).toMatchObject({
      kind: "compose_explicit_role_contribution",
      verb: "Reduced",
    });
    expect(
      renderInitialFeedbackPlan(source, value.plan).prose.writer.summary,
    ).toBe(raw.writer.summary);
    expect(
      compileInitialFeedbackPlan(
        source.replace("20% at Cedar", "20% at Maple"),
        raw,
      ).status,
    ).toBe("unavailable");
  });
  it("renders an explicit role summary without invented contribution", () => {
    const source = "Backend Engineer at Cedar Labs",
      raw = empty();
    raw.writer.summary = "Backend engineer at Cedar Labs.";
    const value = available(source, raw);
    expect(value.plan.writer.summary).toMatchObject({ kind: "role_summary" });
  });
  it("covers guarded reduction and measured/object editorial operators", () => {
    const source = "Improved API latency by 20%.",
      raw = rawTip(
        source,
        "Reduced API latency by 20%.",
        "Clarifies the measured contribution.",
      );
    const value = available(source, raw);
    expect(value.plan.content[0].explanation.kind).toBe("editorial_measured");
    const dashboard = "Built a dashboard.";
    expect(
      available(
        dashboard,
        rawTip(dashboard, dashboard, "Clarifies dashboard wording."),
      ).plan.content[0].explanation.kind,
    ).toBe("editorial_object_prefix");
  });
  it("keeps full rejected observation and explicit original/retained/padding mappings", () => {
    const source = "Built a dashboard.",
      raw = empty();
    raw.content.tips = [
      {
        type: "good",
        tip: "Led a team.",
        explanation: "Clarifies wording.",
        quote: source,
      },
      {
        type: "good",
        tip: source,
        explanation: "Clarifies wording.",
        quote: source,
      },
      {
        type: "good",
        tip: "Increased revenue.",
        explanation: "Clarifies wording.",
        quote: source,
      },
      {
        type: "good",
        tip: "Clear",
        explanation: "Clarifies wording.",
        quote: source,
      },
    ];
    const value = available(source, raw);
    expect(value.recordedObservation).toEqual(
      assessQualitativeProse(raw, source).support,
    );
    expect(value.recordedObservation.items.map((v) => v.retained)).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect(value.plan.content.map((t) => t.originalIndex)).toEqual([1, 3]);
    expect(value.rendered.mapping.tips).toEqual([
      {
        category: "content",
        originalIndex: 1,
        retainedIndex: 0,
        compatibilityIndex: 0,
      },
      {
        category: "content",
        originalIndex: 3,
        retainedIndex: 1,
        compatibilityIndex: 1,
      },
    ]);
    expect(value.rendered.mapping.padding).toContainEqual({
      category: "content",
      compatibilityIndex: 2,
      origin: null,
      scope: "compatibility_only",
    });
    expect(value.rendered.compatibility.content.tips[2]).not.toHaveProperty(
      "quote",
    );
    expect(value.rendered.prose.content.tips[1].type).toBe("improve");
    expect(renderInitialFeedbackPlan(source, value.plan)).toEqual(
      value.rendered,
    );
  });
  it("retains four real rows without truncating or adding padding", () => {
    const source = "Built a dashboard.",
      raw = empty();
    raw.content.tips = Array.from({ length: 4 }, () => ({
      type: "improve",
      tip: "Clear",
      explanation: "Clarifies wording.",
      quote: source,
    }));
    const value = available(source, raw);
    expect(value.rendered.compatibility.content.tips).toHaveLength(4);
    expect(
      value.rendered.mapping.padding.filter((p) => p.category === "content"),
    ).toEqual([]);
  });
  it("never turns a good question or generic editorial into a strength", () => {
    const source = "Built a dashboard.",
      raw = rawTip(
        source,
        "What outcome can you verify?",
        "Add only a result you can verify. Leave this unanswered if the information is unavailable.",
        "good",
      );
    const value = available(source, raw);
    expect(value.rendered.prose.content.tips[0].type).toBe("improve");
    expect(value.rendered.parts.tips[0]).toMatchObject({
      kind: "clarification_question",
      state: "clarification_required",
      type: "improve",
    });
    expect(value.plan.content[0].title.kind).toBe("clarification_question");
    expect(value.plan.content[0].explanation.kind).toBe("clarification_fixed");
  });
  it("distinguishes CP references and legacy UTF16 anchor IDs", () => {
    const quote = "Built a dashboard.",
      source = "Built tools 😀.\n" + quote,
      value = available(source, rawTip(quote));
    const start = source.indexOf(quote),
      cpStart = Array.from(source.slice(0, start)).length;
    expect(value.plan.content[0].quote.start).toBe(cpStart);
    expect(cpStart).not.toBe(start);
    expect(value.recordedObservation.items[0].title.anchorIds).toContain(
      hash(`${hash(source)}:${start}:${source.length}`),
    );
  });
  it.each(["unknown", "extra", "reference", "order", "policy"])(
    "refuses malformed %s plan without caller proof flags",
    (kind) => {
      const source = "Built a dashboard.",
        value = available(source, rawTip(source)),
        bad = JSON.parse(JSON.stringify(value.plan));
      if (kind === "unknown") bad.content[0].title.kind = "model_supported";
      if (kind === "extra") bad.supported = true;
      if (kind === "reference")
        bad.content[0].quote.textSha256 = "f".repeat(64);
      if (kind === "order") {
        bad.content.push(bad.content[0]);
      }
      if (kind === "policy") bad.policyVersion = "old";
      expect(() => renderInitialFeedbackPlan(source, bad)).toThrow(
        InitialFeedbackPlanError,
      );
    },
  );
  it("rederives actual full source qualifiers before accepting a copied question/team claim", () => {
    for (const source of [
      "Built a dashboard?",
      "Team achievements:\nBuilt a dashboard.",
    ]) {
      const quote = source.split("\n").at(-1)!,
        doc = buildWritingSupportDocument(source),
        a = doc.anchors.at(-1)!;
      const p = {
        schemaVersion: "initial-feedback-plan/1.0.0",
        sourceTextSha256: hash(source),
        policyVersion: INITIAL_FEEDBACK_PLAN_POLICY.version,
        toneAndStyle: [],
        content: [
          {
            originalIndex: 0,
            requestedType: "good",
            quote: {
              start: a.span.start,
              end: a.span.end,
              textSha256: hash(a.span.text),
            },
            title: {
              kind: "copy_source",
              anchor: {
                start: a.span.start,
                end: a.span.end,
                textSha256: hash(a.span.text),
              },
            },
            explanation: {
              kind: "editorial_fixed",
              templateIndex: 9,
              period: true,
            },
          },
        ],
        structure: [],
        skills: [],
        writer: { summary: null, bullets: [] },
      };
      expect(quote).toBeTruthy();
      expect(() => renderInitialFeedbackPlan(source, p)).toThrow(
        InitialFeedbackPlanError,
      );
    }
  });
  it("has one finite input/resource boundary and never returns all-empty success", () => {
    const source = "Built a dashboard.";
    expect(
      compileInitialFeedbackPlan("x".repeat(100001), rawTip(source)),
    ).toMatchObject({ status: "unavailable", reason: "source_resource_limit" });
    expect(
      compileInitialFeedbackPlan(source, { text: "x".repeat(65536) }),
    ).toMatchObject({ status: "unavailable", reason: "source_resource_limit" });
    expect(compileInitialFeedbackPlan(source, empty()).status).toBe(
      "unavailable",
    );
    const bad = rawTip(source);
    bad.content.tips[0].explanation = "Invented revenue.";
    const withheld = compileInitialFeedbackPlan(source, bad);
    expect(withheld.status).toBe("unavailable");
    expect(withheld.recordedObservation?.items[0].retained).toBe(false);
    expect(compileInitialFeedbackPlan("unit\uD800", empty()).status).toBe(
      "unavailable",
    );
  });
  it("validates only the no-provider shape, without pretending to publish historical results", () => {
    expect(
      InitialFeedbackNoProviderResultSchema.parse({
        kind: "deterministic_only",
        reason: "historical_inputs",
        plan: null,
        observation: null,
      }),
    ).toMatchObject({ reason: "historical_inputs" });
    expect(
      InitialFeedbackNoProviderResultSchema.safeParse({
        kind: "deterministic_only",
        reason: "historical_inputs",
        plan: {},
        observation: null,
      }).success,
    ).toBe(false);
    expect(ref("😀").end).toBe(1);
  });
});
