import { describe, expect, it } from "vitest";
import {
  assessWritingSupport,
  buildWritingSupportDocument,
} from "../../app/lib/server/writing-support";
import { groundWriterSuggestions } from "../../app/lib/server/writer-grounding";
import { RELIABILITY_REGRESSIONS } from "../fixtures/reliability-regressions";

const original = "Built a dashboard.";
const proposed = "Created a dashboard.";
const reasoning = "Clarifies the contribution.";

function observeRewrite(source: string, from = original, to = proposed) {
  const document = buildWritingSupportDocument(source);
  const outcome = assessWritingSupport(document, {
    kind: "rewrite",
    original: from,
    proposed: to,
  });
  const result = groundWriterSuggestions(
    {
      summary: null,
      bullets: [{ original: from, rewrite: to, reasoning }],
    },
    source,
  );
  return { support: outcome.state, retainedBullets: result.bullets.length };
}

describe("useful source-preserving writing across ordinary resume context", () => {
  it("retains the reviewed standalone construction equivalent", () => {
    expect(observeRewrite(original)).toEqual({
      support: "supported",
      retainedBullets: 1,
    });
  });

  it.each([
    ["email", "demo@example.test"],
    ["URL", "https://example.test/profile"],
    [
      "ordinary contact header",
      "Demo Person\nEmail: demo@example.test\nhttps://example.test/profile",
    ],
  ])("preserves the same contribution after an unrelated %s", (_, header) => {
    expect(observeRewrite(`${header}\n${original}`)).toEqual({
      support: "supported",
      retainedBullets: 1,
    });
  });

  it("retains a contribution among two explicitly parsed employer roles", () => {
    const source = [
      "Experience",
      "Backend Engineer at Cedar Labs",
      original,
      "",
      "Software Engineer at Maple Works",
      "Reduced queue latency by 15% at Maple Works.",
    ].join("\n");
    expect(observeRewrite(source)).toEqual({
      support: "supported",
      retainedBullets: 1,
    });
  });

  const projects = [
    "Projects",
    "Signal Dashboard",
    original,
    "",
    "Queue Worker",
    "Improved API latency by 20% at Maple Works.",
  ].join("\n");

  it.each([
    ["first project", original, proposed],
    [
      "second project",
      "Improved API latency by 20% at Maple Works.",
      "Reduced API latency by 20% at Maple Works.",
    ],
  ])("retains the same supported contribution in the %s", (_, from, to) => {
    expect(observeRewrite(from, from, to)).toEqual({
      support: "supported",
      retainedBullets: 1,
    });
    expect(observeRewrite(projects, from, to)).toEqual({
      support: "supported",
      retainedBullets: 1,
    });
  });

  it("retains the unchanged contribution under separate employer/title lines", () => {
    const source = [
      "Experience",
      "Cedar Labs",
      "Backend Engineer",
      original,
      "",
      "Maple Works",
      "Software Engineer",
      "Reduced queue latency by 15% at Maple Works.",
    ].join("\n");
    expect(observeRewrite(source)).toEqual({
      support: "supported",
      retainedBullets: 1,
    });
  });

  const roleContribution = [
    "Backend Engineer at Cedar Labs",
    "Improved API latency by 20% at Cedar Labs.",
  ].join("\n");
  const summary =
    "Backend engineer who reduced API latency by 20% at Cedar Labs.";

  function observeSummary(source: string) {
    return {
      support: assessWritingSupport(buildWritingSupportDocument(source), {
        kind: "summary",
        proposed: summary,
      }).state,
      retainedSummary:
        groundWriterSuggestions({ summary, bullets: [] }, source).summary ===
        summary,
    };
  }

  it("retains the existing explicit adjacent-role summary control", () => {
    expect(observeSummary(roleContribution)).toEqual({
      support: "supported",
      retainedSummary: true,
    });
  });

  it("retains that same role/contribution summary after an unrelated contact line", () => {
    expect(observeSummary(`demo@example.test\n${roleContribution}`)).toEqual({
      support: "supported",
      retainedSummary: true,
    });
  });
});

describe("preserved unsupported-claim controls at the direct guard boundary", () => {
  it.each(RELIABILITY_REGRESSIONS.unsupportedWriter)(
    "continues withholding $id",
    (vector) => {
      const writer =
        vector.kind === "summary"
          ? { summary: vector.summary, bullets: [] }
          : {
              summary: null,
              bullets: [
                {
                  original: vector.original,
                  rewrite: vector.rewrite,
                  reasoning: vector.reasoning,
                },
              ],
            };
      expect(groundWriterSuggestions(writer, vector.source)).toEqual({
        summary: null,
        bullets: [],
      });
    },
  );

  it.each(RELIABILITY_REGRESSIONS.unsupportedDownstream)(
    "continues withholding the preserved $pipeline payload in the direct guard",
    (vector) => {
      // Actual structured pipeline execution remains in writer-grounding.test.ts.
      expect(
        groundWriterSuggestions(
          {
            summary: null,
            bullets: [
              {
                original: vector.source,
                rewrite: vector.rewrite,
                reasoning: vector.reasoning,
              },
            ],
          },
          vector.source,
        ),
      ).toEqual({ summary: null, bullets: [] });
    },
  );

  it("does not borrow another employer's metric for a supported contribution", () => {
    const first = "Improved API latency by 20% at Cedar Labs.";
    const source = [
      "Backend Engineer at Cedar Labs",
      first,
      "",
      "Software Engineer at Maple Works",
      "Reduced API latency by 35% at Maple Works.",
    ].join("\n");
    expect(
      observeRewrite(
        source,
        first,
        "Reduced API latency by 20% at Cedar Labs.",
      ),
    ).toEqual({ support: "supported", retainedBullets: 1 });
    expect(
      observeRewrite(
        source,
        first,
        "Reduced API latency by 35% at Cedar Labs.",
      ),
    ).toEqual({ support: "rejected", retainedBullets: 0 });
  });

  it("does not borrow leadership agency from another employer", () => {
    const first = "Supported reliable services at Cedar Labs.";
    const source = [
      "Backend Engineer at Cedar Labs",
      first,
      "",
      "Software Engineer at Maple Works",
      "Led reliable services at Maple Works.",
    ].join("\n");
    expect(observeRewrite(source, first, first)).toEqual({
      support: "supported",
      retainedBullets: 1,
    });
    expect(
      observeRewrite(source, first, "Led reliable services at Cedar Labs."),
    ).toEqual({ support: "rejected", retainedBullets: 0 });
  });

  it("does not silently select a target when two employer contributions are identical", () => {
    const source = [
      "Backend Engineer at Cedar Labs",
      original,
      "",
      "Software Engineer at Maple Works",
      original,
    ].join("\n");
    const outcome = assessWritingSupport(buildWritingSupportDocument(source), {
      kind: "rewrite",
      original,
      proposed,
    });
    expect(outcome).toMatchObject({
      state: "rejected",
      reason: "ambiguous_source_anchor",
    });
    expect(observeRewrite(source)).toEqual({
      support: "rejected",
      retainedBullets: 0,
    });
  });
});
