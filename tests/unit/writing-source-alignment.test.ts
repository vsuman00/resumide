import { describe, expect, it } from "vitest";
import { buildRewriteSources } from "../../app/lib/server/rewrite-sources";
import {
  assessWritingSupport,
  buildWritingSupportDocument,
} from "../../app/lib/server/writing-support";
import { groundWriterSuggestions } from "../../app/lib/server/writer-grounding";

const reason = "Clarifies the contribution.";
const contribution = "- Built a Python service dashboard";

function observe(source: string, proposed?: string) {
  const document = buildWritingSupportDocument(source);
  return buildRewriteSources(source).map((selected) => {
    const replacement =
      proposed ?? selected.text.replace(/\bBuilt\b/u, "Created");
    const result = assessWritingSupport(document, {
      kind: "rewrite",
      original: selected.text,
      proposed: replacement,
    });
    const retained = groundWriterSuggestions(
      {
        summary: null,
        bullets: [
          { original: selected.text, rewrite: replacement, reasoning: reason },
        ],
      },
      source,
    ).bullets.length;
    return {
      text: selected.text,
      state: result.state,
      reason: result.state === "rejected" ? result.reason : null,
      retained,
    };
  });
}

describe("selected rewrite passages align with exact support units", () => {
  it("preserves the useful first contribution before a separate recognized action", () => {
    const source = [contribution, "Reduced API latency by 20%."].join("\n");
    const selected = buildRewriteSources(source)[0];
    expect(
      assessWritingSupport(buildWritingSupportDocument(source), {
        kind: "rewrite",
        original: selected.text,
        proposed: selected.text,
      }),
    ).toMatchObject({ state: "supported" });
    expect(observe(source)).toContainEqual({
      text: contribution,
      state: "supported",
      reason: null,
      retained: 1,
    });
  });

  it("preserves the exact contribution before a separate uppercase reference label", () => {
    const original = "- Built a dashboard with React and PostgreSQL";
    const source = [
      "Projects",
      "Signal Dashboard",
      original,
      "API reference",
    ].join("\n");
    const selected = buildRewriteSources(source)[0];
    expect(
      assessWritingSupport(buildWritingSupportDocument(source), {
        kind: "rewrite",
        original: selected.text,
        proposed: selected.text,
      }),
    ).toMatchObject({ state: "supported" });
    expect(observe(source)).toContainEqual({
      text: original,
      state: "supported",
      reason: null,
      retained: 1,
    });
    const document = buildWritingSupportDocument(source);
    const reference = document.anchors.at(-1)!;
    expect(reference.context.kind).toBe("qualified_or_unknown");
    expect(reference.context.qualifierIds).toContain(reference.span.id);
  });

  it("retains the exact lowercase continuation including CRLF and Unicode offsets", () => {
    const source =
      "- Built a 🧭 Python dashboard\r\nfor internal service reports.";
    const document = buildWritingSupportDocument(source);
    expect(document.anchors).toHaveLength(1);
    const anchor = document.anchors[0];
    expect(
      Array.from(source).slice(anchor.span.start, anchor.span.end).join(""),
    ).toBe(source);
    expect(observe(source)).toEqual([
      { text: source, state: "supported", reason: null, retained: 1 },
    ]);
  });

  it("keeps a supported semicolon-linked recognized continuation as one exact passage", () => {
    const source = [
      "- Built a Python service dashboard;",
      "Reduced API latency by 20%.",
    ].join("\n");
    expect(observe(source)).toEqual([
      { text: source, state: "supported", reason: null, retained: 1 },
    ]);
  });

  it("never joins separate bullet-led contributions", () => {
    const second = "- Built a TypeScript service dashboard.";
    const source = [contribution, second].join("\n");
    expect(observe(source)).toEqual(
      [contribution, second].map((text) => ({
        text,
        state: "supported",
        reason: null,
        retained: 1,
      })),
    );
  });

  it.each(["A colleague:", "Things I have never done:", "Team Results:"])(
    "preserves the earlier semantic scope %s across finite section metadata",
    (scope) => {
      const source = ["Projects", "Signal Dashboard", contribution].join("\n");
      const qualified = `${scope}\n${source}`;
      expect(observe(qualified)).toEqual([
        {
          text: contribution,
          state: "clarification_required",
          reason: null,
          retained: 0,
        },
      ]);
    },
  );

  it("does not shorten away an unmatched following negation/scope line", () => {
    const source = [contribution, "Without production deployment."].join("\n");
    const results = observe(source);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.state !== "supported")).toBe(true);
    expect(results.every((result) => result.retained === 0)).toBe(true);
  });

  it.each([
    [
      "- Never built a Python service dashboard.",
      "Created a Python service dashboard.",
    ],
    [
      "- A colleague built a Python service dashboard.",
      "Created a Python service dashboard.",
    ],
    [
      "- Built a Python service dashboard for internal teams.",
      "Created a Python service dashboard for external teams.",
    ],
  ])(
    "does not admit a proposal that loses subject, negation or scope",
    (source, proposal) => {
      const results = observe(source, proposal);
      expect(results).toHaveLength(1);
      expect(results[0].state).not.toBe("supported");
      expect(results[0].retained).toBe(0);
    },
  );

  it("retains duplicate ambiguity even though source selection deduplicates text", () => {
    const source = [contribution, contribution].join("\n");
    expect(observe(source)).toEqual([
      {
        text: contribution,
        state: "rejected",
        reason: "ambiguous_source_anchor",
        retained: 0,
      },
    ]);
  });

  it("does not manufacture an eligible source from a sparse short line", () => {
    expect(buildRewriteSources("- Built API.")).toEqual([]);
  });
});
