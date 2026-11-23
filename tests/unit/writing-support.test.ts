import { describe, expect, it } from "vitest";
import {
  assessWritingSupport,
  buildWritingSupportDocument,
  WRITING_SUPPORT_POLICY_VERSION,
} from "../../app/lib/server/writing-support";
import { buildRewriteSources } from "../../app/lib/server/rewrite-sources";
import { groundWriterSuggestions } from "../../app/lib/server/writer-grounding";
import { RELIABILITY_REGRESSIONS } from "../fixtures/reliability-regressions";

const assessRewrite = (source: string, proposed: string) =>
  assessWritingSupport(buildWritingSupportDocument(source), {
    kind: "rewrite",
    original: source,
    proposed,
  });

describe("bounded source writing support", () => {
  it("anchors Unicode clauses and object/metric relationships to exact source", () => {
    const source = "🌏\nReduced costs by 40% and latency by 12%.";
    const document = buildWritingSupportDocument(source);
    expect(document).toEqual(buildWritingSupportDocument(source));
    expect(document.policyVersion).toBe(WRITING_SUPPORT_POLICY_VERSION);
    expect(document.offsetUnit).toBe("unicode_code_point");
    const anchor = document.anchors.find(
      (a) => a.clauses[0]?.action.concept === "decrease",
    )!;
    expect(anchor.span.start).toBe(2);
    for (const clause of anchor.clauses) {
      expect(
        Array.from(source).slice(clause.span.start, clause.span.end).join(""),
      ).toBe(clause.span.text);
      for (const metric of clause.metrics) {
        expect(
          Array.from(source).slice(metric.span.start, metric.span.end).join(""),
        ).toBe(metric.literal);
      }
    }
    expect(
      anchor.clauses[0].metrics.map((m) => ({
        literal: m.literal,
        governor: m.governor?.text,
        direction: m.direction,
      })),
    ).toEqual([
      { literal: "40%", governor: "costs", direction: "decrease" },
      { literal: "12%", governor: "latency", direction: "decrease" },
    ]);
  });

  it("supports reviewed construction equivalence without claiming independent truth", () => {
    const outcome = assessRewrite("Built a dashboard.", "Created a dashboard.");
    expect(outcome.state).toBe("supported");
    if (outcome.state !== "supported") throw Error("Expected support");
    expect(outcome.authority).toBe("source_transformation_only");
    expect(
      outcome.operations.some((op) => op.kind === "replace_equivalent_action"),
    ).toBe(true);
    expect(outcome.sourceAnchorIds).toHaveLength(1);
  });

  it("preserves an explicit team actor", () => {
    expect(
      assessRewrite("We built services.", "We developed services.").state,
    ).toBe("supported");
    expect(
      assessRewrite("We built services.", "I developed services.").state,
    ).toBe("rejected");
  });

  it("supports wrapped contribution text and a bounded clause delimiter change", () => {
    expect(
      assessRewrite(
        "– Built React services with PostgreSQL;\nreduced latency by 20%.",
        "Developed React services with PostgreSQL; reduced latency by 20%.",
      ).state,
    ).toBe("supported");
    expect(
      assessRewrite(
        "Built React services with PostgreSQL and reduced latency by 20%.",
        "Developed React services with PostgreSQL; reduced latency by 20%.",
      ).state,
    ).toBe("supported");
  });

  it("reorders independent clauses without reassigning metric relationships", () => {
    expect(
      assessRewrite(
        "Built services; reduced latency by 20%.",
        "Reduced latency by 20%; built services.",
      ).state,
    ).toBe("supported");
    expect(
      assessRewrite(
        "Built services; then reduced latency by 20%.",
        "Then reduced latency by 20%; built services.",
      ).state,
    ).not.toBe("supported");
  });

  it("does not reorder clauses with unresolved pronoun dependencies", () => {
    expect(
      assessRewrite(
        "Built services; reduced their latency by 20%.",
        "Reduced their latency by 20%; built services.",
      ).state,
    ).not.toBe("supported");
  });

  it("only rephrases improvement as reduction for the reviewed lower-is-better object", () => {
    expect(
      assessRewrite(
        "Improved API latency by 40% at Acme.",
        "Reduced API latency by 40% at Acme.",
      ).state,
    ).toBe("supported");
    expect(
      assessRewrite(
        "Improved response time by 10%.",
        "Reduced response time by 10%.",
      ).state,
    ).toBe("supported");
    for (const object of ["performance", "sales", "API latency and sales"]) {
      expect(
        assessRewrite(`Improved ${object} by 40%.`, `Reduced ${object} by 40%.`)
          .state,
      ).not.toBe("supported");
    }
  });

  it("does not reinterpret mixed, negative or dimensionally unknown improvement metrics", () => {
    for (const object of [
      "API latency by 40% and sales by 12%",
      "API latency by -40%",
      "API latency by 40 requests",
    ]) {
      expect(
        assessRewrite(`Improved ${object}.`, `Reduced ${object}.`).state,
      ).not.toBe("supported");
    }
  });

  it.each(RELIABILITY_REGRESSIONS.relationshipHypotheses)(
    "rejects $id without bag-of-words credit",
    (testCase) => {
      expect(assessRewrite(testCase.source, testCase.rewrite).state).toBe(
        "rejected",
      );
    },
  );

  it("does not equate contributor, leadership and ownership agency", () => {
    for (const action of ["Led", "Owned", "Managed"]) {
      expect(
        assessRewrite(
          "Supported reliable services.",
          `${action} reliable services.`,
        ).state,
      ).toBe("rejected");
    }
  });

  it("does not use an arbitrary source substring as a whole contribution", () => {
    const document = buildWritingSupportDocument(
      "Built services for a local test.",
    );
    expect(
      assessWritingSupport(document, {
        kind: "rewrite",
        original: "Built services",
        proposed: "Created services",
      }).state,
    ).toBe("rejected");
  });

  it("keeps unknown relationships unproved and offers clarification", () => {
    expect(
      assessRewrite(
        "Built a dashboard.",
        "Built a dashboard that doubled revenue.",
      ).state,
    ).toBe("clarification_required");
    expect(
      assessRewrite("Explored a new design.", "Owned a new design.").state,
    ).not.toBe("supported");
  });

  it("rejects ambiguous identical source anchors", () => {
    const document = buildWritingSupportDocument(
      "Built services.\nBuilt services.",
    );
    expect(
      assessWritingSupport(document, {
        kind: "rewrite",
        original: "Built services.",
        proposed: "Created services.",
      }).state,
    ).toBe("rejected");
  });

  it("supports a role summary only with the explicit shared employer context", () => {
    const document = buildWritingSupportDocument(
      "Jordan Doe\nBackend Engineer at Acme\nImproved API latency by 40% at Acme.",
    );
    expect(
      assessWritingSupport(document, {
        kind: "summary",
        proposed: "Backend engineer who improved API latency by 40% at Acme.",
      }).state,
    ).toBe("supported");
    const unrelated = buildWritingSupportDocument(
      "Backend Engineer at OtherCo\nImproved API latency by 40% at Acme.",
    );
    expect(
      assessWritingSupport(unrelated, {
        kind: "summary",
        proposed: "Backend engineer at Acme.",
      }).state,
    ).not.toBe("supported");
    const unproved = buildWritingSupportDocument(
      "Backend Engineer\nImproved API latency by 40%.",
    );
    expect(
      assessWritingSupport(unproved, {
        kind: "summary",
        proposed: "Backend engineer who improved API latency by 40%.",
      }).state,
    ).not.toBe("supported");
  });

  it("does not infer a candidate role or shared actor from narrative proximity", () => {
    for (const title of [
      "Met a Backend Engineer",
      "Mentored a Backend Engineer",
      "Not a Backend Engineer",
    ]) {
      const document = buildWritingSupportDocument(
        `${title} at Acme\nImproved API latency by 40% at Acme.`,
      );
      const displayed = title.replace("Engineer", "engineer");
      expect(
        assessWritingSupport(document, {
          kind: "summary",
          proposed: `${displayed} who improved API latency by 40% at Acme.`,
        }).state,
      ).not.toBe("supported");
    }
  });

  it("does not compose across an intervening other-subject scope", () => {
    const document = buildWritingSupportDocument(
      "Backend Engineer at Acme\nA colleague:\nImproved API latency by 40% at Acme.",
    );
    expect(
      assessWritingSupport(document, {
        kind: "summary",
        proposed: "Backend engineer who improved API latency by 40% at Acme.",
      }).state,
    ).not.toBe("supported");
  });

  it("does not choose among competing role contexts at the same employer", () => {
    const document = buildWritingSupportDocument(
      "Software Engineer at Acme\n2020 - 2021\nBuilt services.\nBackend Engineer at Acme\n2022 - 2023\nImproved API latency by 40% at Acme.",
    );
    expect(
      assessWritingSupport(document, {
        kind: "summary",
        proposed: "Software engineer who improved API latency by 40% at Acme.",
      }).state,
    ).not.toBe("supported");
    expect(
      assessWritingSupport(document, {
        kind: "summary",
        proposed: "Backend engineer who improved API latency by 40% at Acme.",
      }).state,
    ).not.toBe("supported");
  });

  it("does not drop a newline scope qualifier through copy_source", () => {
    const document = buildWritingSupportDocument(
      "Things I have never done:\nLed a team.",
    );
    expect(
      assessWritingSupport(document, {
        kind: "summary",
        proposed: "Led a team.",
      }).state,
    ).not.toBe("supported");
    expect(
      assessWritingSupport(document, {
        kind: "rewrite",
        original: "Led a team.",
        proposed: "Led a team.",
      }).state,
    ).not.toBe("supported");
    const action = document.anchors[1];
    expect(action.context.kind).toBe("qualified_or_unknown");
    expect(action.context.qualifierIds).toEqual([document.anchors[0].span.id]);
    expect(action.context.adjacentRoleId).toBeNull();
  });

  it("does not treat title-cased scope labels as candidate identity", () => {
    for (const label of [
      "Team Results",
      "Hypothetical Example",
      "Other Candidates",
    ]) {
      const document = buildWritingSupportDocument(
        `${label}\nBackend Engineer at Acme\nImproved API latency by 40% at Acme.`,
      );
      expect(
        assessWritingSupport(document, {
          kind: "summary",
          proposed: "Backend engineer who improved API latency by 40% at Acme.",
        }).state,
      ).not.toBe("supported");
      expect(
        assessWritingSupport(document, {
          kind: "rewrite",
          original: "Improved API latency by 40% at Acme.",
          proposed: "Reduced API latency by 40% at Acme.",
        }).state,
      ).not.toBe("supported");
    }
  });

  it("caps per-clause and document relationship work before constructing spans", () => {
    expect(() =>
      buildWritingSupportDocument(
        `Reduced ${Array.from({ length: 33 }, (_, i) => `measure${i} by 1%`).join(" and ")}.`,
      ),
    ).toThrow("WRITING_SUPPORT_RELATION_LIMIT");
    expect(() =>
      buildWritingSupportDocument(
        Array.from({ length: 257 }, () => "Reduced latency by 1%.").join("\n"),
      ),
    ).toThrow("WRITING_SUPPORT_RELATION_LIMIT");
    expect(() =>
      buildWritingSupportDocument(
        `Built services ${Array.from({ length: 17 }, (_, i) => `for scope${i}`).join(" ")}.`,
      ),
    ).toThrow("WRITING_SUPPORT_RELATION_LIMIT");
    expect(() => buildWritingSupportDocument("1 ".repeat(50_000))).toThrow(
      "WRITING_SUPPORT_RELATION_LIMIT",
    );
    expect(() =>
      buildWritingSupportDocument(
        `Reduced ${Array.from({ length: 32 }, (_, i) => `measure${i} by 1%`).join(" and ")}.`,
      ),
    ).not.toThrow();
    expect(() =>
      buildWritingSupportDocument(
        Array.from({ length: 256 }, () => "Reduced latency by 1%.").join("\n"),
      ),
    ).not.toThrow();
    expect(() =>
      buildWritingSupportDocument(
        `Built services ${Array.from({ length: 16 }, (_, i) => `for scope${i}`).join(" ")}.`,
      ),
    ).not.toThrow();
    expect(() =>
      buildWritingSupportDocument("x".repeat(100_000)),
    ).not.toThrow();
    expect(() => buildWritingSupportDocument("x".repeat(100_001))).toThrow(
      "WRITING_SUPPORT_SOURCE_LIMIT",
    );
  });

  it("does not drop qualifiers during summary composition", () => {
    const document = buildWritingSupportDocument(
      "Contract Backend Engineer at Acme\nImproved API latency by 40% in a local experiment at Acme.",
    );
    expect(
      assessWritingSupport(document, {
        kind: "summary",
        proposed:
          "Contract Backend engineer who improved API latency by 40% in a local experiment at Acme.",
      }).state,
    ).toBe("supported");
    expect(
      assessWritingSupport(document, {
        kind: "summary",
        proposed: "Backend engineer who improved API latency by 40% at Acme.",
      }).state,
    ).not.toBe("supported");
  });

  it("binds support to the exact source, policy and derived anchors", () => {
    const document = buildWritingSupportDocument("Built services.");
    const request = {
      kind: "rewrite" as const,
      original: "Built services.",
      proposed: "Created services.",
    };
    expect(
      assessWritingSupport(
        { ...document, sourceSha256: "a".repeat(64) },
        request,
      ).state,
    ).toBe("rejected");
    expect(
      assessWritingSupport(
        { ...document, policyVersion: "unreviewed-policy" },
        request,
      ).state,
    ).toBe("rejected");
    expect(
      assessWritingSupport({ ...document, anchors: [] }, request).state,
    ).toBe("rejected");
    expect(
      assessWritingSupport(document, {
        ...request,
        expectedSourceSha256: "b".repeat(64),
      }).state,
    ).toBe("rejected");
  });

  it("accepts only bounded non-factual editorial explanations", () => {
    const document = buildWritingSupportDocument("Built a dashboard.");
    expect(
      assessWritingSupport(document, {
        kind: "editorial",
        original: "Built a dashboard.",
        proposed: "Clarifies dashboard wording.",
      }).state,
    ).toBe("supported");
    expect(
      assessWritingSupport(document, {
        kind: "editorial",
        original: "Built a dashboard.",
        proposed: "Clarifies how you led a global team.",
      }).state,
    ).not.toBe("supported");
    expect(
      assessWritingSupport(document, {
        kind: "editorial",
        original: "Built a dashboard.",
        proposed: "Makes the measured outcome clearer.",
      }).state,
    ).not.toBe("supported");
  });
});

describe("inert contact metadata without loss of source qualifiers", () => {
  it("retains exact contact anchors without turning metadata into identity or resume claims", () => {
    const email = "Email: demo@example.test";
    const url = "https://example.test/profile";
    const document = buildWritingSupportDocument(
      `${email}\n${url}\nBuilt a dashboard.`,
    );
    expect(document.anchors.map((anchor) => anchor.span.text)).toEqual([
      email,
      url,
      "Built a dashboard.",
    ]);
    for (const original of [email, url]) {
      expect(
        assessWritingSupport(document, {
          kind: "rewrite",
          original,
          proposed: original,
        }).state,
      ).not.toBe("supported");
      expect(
        assessWritingSupport(document, {
          kind: "summary",
          proposed: original,
        }).state,
      ).not.toBe("supported");
    }
    expect(document.policyVersion).toBe("legacy-source-transforms/1.0.4");
  });

  it.each([
    "Things I have never done:",
    "Team Results",
    "Hypothetical Example",
    "Other Candidates",
    "A colleague:",
  ])(
    "keeps %s effective through contact, blank, heading and role boundaries",
    (scope) => {
      const original = "Improved API latency by 20% at Cedar Labs.";
      const document = buildWritingSupportDocument(
        [
          scope,
          "",
          "demo@example.test",
          "https://example.test/profile",
          "",
          "Projects",
          "Backend Engineer at Cedar Labs",
          original,
        ].join("\n"),
      );
      for (const proposed of [
        original,
        "Reduced API latency by 20% at Cedar Labs.",
      ])
        expect(
          assessWritingSupport(document, {
            kind: "rewrite",
            original,
            proposed,
          }).state,
        ).not.toBe("supported");
      expect(
        assessWritingSupport(document, {
          kind: "summary",
          proposed:
            "Backend engineer who reduced API latency by 20% at Cedar Labs.",
        }).state,
      ).not.toBe("supported");
    },
  );

  it.each([
    "Email: demo@example.test A colleague:",
    "demo@example.test describes Team Results",
    "https://example.test/profile Other Candidates",
    "Contact: Team Results <demo@example.test>",
  ])(
    "does not discard unresolved prose on a mixed contact line %#",
    (scope) => {
      const document = buildWritingSupportDocument(
        `${scope}\nBuilt a dashboard.`,
      );
      expect(
        assessWritingSupport(document, {
          kind: "rewrite",
          original: "Built a dashboard.",
          proposed: "Created a dashboard.",
        }).state,
      ).not.toBe("supported");
    },
  );

  it("rejects a caller's former policy binding after the contact admission revision", () => {
    const document = buildWritingSupportDocument("Built a dashboard.");
    expect(
      assessWritingSupport(document, {
        kind: "rewrite",
        original: "Built a dashboard.",
        proposed: "Created a dashboard.",
        expectedPolicyVersion: "legacy-source-transforms/1.0.0",
      }),
    ).toMatchObject({
      state: "rejected",
      reason: "source_or_policy_binding_mismatch",
    });
  });
});

describe("bounded source-preserving engineering entry context", () => {
  const original = "Built a dashboard.";
  const proposed = "Created a dashboard.";
  const assess = (source: string, from = original, to = proposed) =>
    assessWritingSupport(buildWritingSupportDocument(source), {
      kind: "rewrite",
      original: from,
      proposed: to,
    });

  it("includes exact section/project context in support provenance after Unicode metadata", () => {
    const source = [
      "https://example.test/🌏",
      "Projects",
      "Signal Dashboard",
      original,
      "",
      "Queue Worker",
      "Reduced queue latency by 15%.",
    ].join("\n");
    const document = buildWritingSupportDocument(source);
    const section = document.anchors.find((a) => a.span.text === "Projects")!;
    const header = document.anchors.find(
      (a) => a.span.text === "Signal Dashboard",
    )!;
    const contribution = document.anchors.find(
      (a) => a.span.text === original,
    )!;
    expect(document.schemaVersion).toBe("writing-support/1.1.0");
    expect(contribution.context.layoutEntry).toMatchObject({
      kind: "project",
      headerAnchorIds: [section.span.id, header.span.id],
      authority: "derived_layout_only",
      attribution: "not_inferred",
      entrySpan: { start: header.span.start, end: contribution.span.end },
    });
    const entry = contribution.context.layoutEntry!;
    expect(entry.id).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      Array.from(source)
        .slice(entry.entrySpan.start, entry.entrySpan.end)
        .join(""),
    ).toBe(`Signal Dashboard\n${original}`);
    expect(entry.entrySpan).not.toHaveProperty("text");
    const outcome = assessWritingSupport(document, {
      kind: "rewrite",
      original,
      proposed,
    });
    expect(outcome).toMatchObject({
      state: "supported",
      sourceAnchorIds: [section.span.id, header.span.id, contribution.span.id],
    });
    expect(
      assessWritingSupport(document, {
        kind: "summary",
        proposed: "Signal Dashboard",
      }).state,
    ).not.toBe("supported");
    expect(
      assessWritingSupport(document, {
        kind: "rewrite",
        original: "Signal Dashboard",
        proposed: "Signal Dashboard",
      }).state,
    ).not.toBe("supported");
  });

  it("preserves wrapped and later contributions within the same exact entry span", () => {
    const first =
      "Built React services with PostgreSQL;\nreduced latency by 20%.";
    const second = "Maintained reliable services.";
    const source = `Projects\nSignal Dashboard\n${first}\n${second}`;
    const document = buildWritingSupportDocument(source);
    const contributions = document.anchors.filter((a) =>
      [first, second].includes(a.span.text),
    );
    expect(contributions).toHaveLength(2);
    expect(contributions.every((a) => !!a.context.layoutEntry)).toBe(true);
    expect(
      new Set(contributions.map((a) => a.context.layoutEntry!.id)).size,
    ).toBe(1);
    const entrySpan = contributions[1].context.layoutEntry!.entrySpan;
    expect(
      Array.from(source).slice(entrySpan.start, entrySpan.end).join(""),
    ).toBe(`Signal Dashboard\n${first}\n${second}`);
    expect(
      assess(
        source,
        first,
        "Developed React services with PostgreSQL; reduced latency by 20%.",
      ).state,
    ).toBe("supported");
  });

  it("keeps separate employer/title headers as metadata rather than a role fact", () => {
    const source = `Experience\nCedar Labs\nBackend Engineer\n${original}`;
    const document = buildWritingSupportDocument(source);
    const contribution = document.anchors.find(
      (a) => a.span.text === original,
    )!;
    expect(document.anchors[1].role).toBeNull();
    expect(document.anchors[2].role).toBeNull();
    expect(contribution.context.adjacentRoleId).toBeNull();
    expect(contribution.context.layoutEntry).toMatchObject({
      kind: "employer_role",
      headerAnchorIds: document.anchors.slice(0, 3).map((a) => a.span.id),
      authority: "derived_layout_only",
      attribution: "not_inferred",
    });
    expect(assess(source)).toMatchObject({
      state: "supported",
      sourceAnchorIds: document.anchors.map((a) => a.span.id),
    });
    for (const summary of [
      "Backend engineer at Cedar Labs.",
      "Backend engineer who created a dashboard.",
      "Backend engineer who created a dashboard at Cedar Labs.",
    ])
      expect(
        assessWritingSupport(document, { kind: "summary", proposed: summary })
          .state,
      ).not.toBe("supported");
  });

  it.each([
    "Projects\nTeamResults Worker",
    "Projects\nOtherCandidates Dashboard",
    "Projects\nFictional Dashboard",
    "Projects\nPlanned Dashboard",
    "Projects\nMock Dashboard",
    "Experience\nFictional Labs\nBackend Engineer",
    "Projects\nColleague's Dashboard",
    "Projects\nA colleague built Signal Dashboard",
    "Projects\nSignal Gizmo",
    "Projects\nSignal Dashboard\nUnresolved context",
    "Projects\nSignal Dashboard\nBackend Engineer at Cedar Labs",
    "Signal Dashboard",
    "Cedar Labs\nBackend Engineer",
    "Skills\nSignal Dashboard",
    "Experience\nCedar Labs\nBackend Engineer at Maple Works",
  ])("does not promote an unsafe or incomplete header chain %#", (header) => {
    expect(assess(`${header}\n${original}`).state).not.toBe("supported");
  });

  it.each([
    "Things I have never done:",
    "TeamResults",
    "Hypothetical Example",
    "OtherCandidates",
    "A colleague:",
  ])("retains %s through multiple fake layout boundaries", (scope) => {
    const measured = "Improved API latency by 20% at Cedar Labs.";
    const source = [
      scope,
      "",
      "Projects",
      "Signal Dashboard",
      original,
      "",
      "Experience",
      "Cedar Labs",
      "Backend Engineer",
      measured,
    ].join("\n");
    expect(assess(source).state).not.toBe("supported");
    expect(assess(source, original, original).state).not.toBe("supported");
    expect(
      assess(source, measured, "Reduced API latency by 20% at Cedar Labs.")
        .state,
    ).not.toBe("supported");
  });

  it("keeps cross-entry metrics and agency bound to their original contribution", () => {
    const first = "Improved API latency by 20%.";
    const source = `Projects\nSignal Dashboard\n${first}\n\nQueue Worker\nReduced API latency by 35%.`;
    expect(assess(source, first, "Reduced API latency by 20%.").state).toBe(
      "supported",
    );
    expect(assess(source, first, "Reduced API latency by 35%.").state).toBe(
      "rejected",
    );
    const supporting = "Supported reliable services.";
    const agency = `Projects\nSignal Dashboard\n${supporting}\n\nQueue Worker\nLed reliable services.`;
    expect(assess(agency, supporting, supporting).state).toBe("supported");
    expect(assess(agency, supporting, "Led reliable services.").state).toBe(
      "rejected",
    );
  });

  it("does not select between identical originals in different derived entries", () => {
    const source = `Projects\nSignal Dashboard\n${original}\n\nQueue Worker\n${original}`;
    expect(assess(source)).toMatchObject({
      state: "rejected",
      reason: "ambiguous_source_anchor",
    });
  });

  it("rejects exact-context/source tampering before granting support", () => {
    const source = `Projects\nSignal Dashboard\n${original}`;
    const document = buildWritingSupportDocument(source);
    const target = document.anchors.find((a) => a.span.text === original)!;
    expect(target.context.layoutEntry).toBeTruthy();
    for (const change of [
      "headers",
      "span",
      "span_text",
      "id",
      "attribution",
    ]) {
      const changed = structuredClone(document);
      const entry = changed.anchors.find((a) => a.span.text === original)!
        .context.layoutEntry!;
      if (change === "headers") entry.headerAnchorIds = [];
      if (change === "span") entry.entrySpan.end += 1;
      if (change === "span_text")
        Object.assign(entry.entrySpan, { text: "invented" });
      if (change === "id") entry.id = "0".repeat(64);
      if (change === "attribution")
        Object.assign(entry, { attribution: "verified" });
      expect(
        assessWritingSupport(changed, { kind: "rewrite", original, proposed }),
      ).toMatchObject({
        state: "rejected",
        reason: "source_or_policy_binding_mismatch",
      });
    }
    expect(
      assessWritingSupport(document, {
        kind: "rewrite",
        original,
        proposed,
        expectedSourceSha256: "0".repeat(64),
      }).state,
    ).toBe("rejected");
    expect(
      assessWritingSupport(document, {
        kind: "rewrite",
        original,
        proposed,
        expectedPolicyVersion: "legacy-source-transforms/1.0.1",
      }).state,
    ).toBe("rejected");
  });

  it("admits the explicit finite label boundary and rejects its next value", () => {
    const label = `${"A".repeat(24)} ${"B".repeat(24)} ${"C".repeat(20)} Dashboard`;
    expect(label.length).toBe(80);
    expect(assess(`Projects\n${label}\n${original}`).state).toBe("supported");
    expect(
      assess(
        `Projects\n${label.replace("C".repeat(20), "C".repeat(21))}\n${original}`,
      ).state,
    ).not.toBe("supported");
  });

  it("keeps dense supported entry serialization within a linear source/anchor budget", () => {
    const contributions = Array.from(
      { length: 80 },
      (_, index) =>
        `Built a dashboard for ${"neutral reporting ".repeat(10)}variant ${index}.`,
    );
    const source = ["Projects", "Signal Dashboard", ...contributions].join(
      "\n",
    );
    const document = buildWritingSupportDocument(source);
    expect(source.length).toBeLessThan(100_000);
    expect(document.anchors).toHaveLength(82);
    expect(
      assessWritingSupport(document, {
        kind: "rewrite",
        original: contributions[0],
        proposed: contributions[0].replace(/^Built/u, "Created"),
      }).state,
    ).toBe("supported");
    const bytes = Buffer.byteLength(JSON.stringify(document), "utf8");
    const linearBudget =
      Buffer.byteLength(source, "utf8") * 12 + document.anchors.length * 4096;
    expect(bytes).toBeLessThanOrEqual(linearBudget);
  });
});

describe("right-edge continuation qualifications before writing admission", () => {
  const original = "Built a Python service dashboard for internal reports";
  const replacement = "Created a Python service dashboard for internal reports";
  const reason = "Clarifies the contribution.";
  const project = (tail: string[]) =>
    ["Projects", "Signal Dashboard", `- ${original}`, ...tail].join("\n");
  const direct = (source: string, from = original, to = replacement) =>
    assessWritingSupport(buildWritingSupportDocument(source), {
      kind: "rewrite",
      original: from,
      proposed: to,
    });
  const grounded = (source: string, from = original, to = replacement) =>
    groundWriterSuggestions(
      {
        summary: null,
        bullets: [{ original: from, rewrite: to, reasoning: reason }],
      },
      source,
    ).bullets.length;

  it.each([
    "Without production deployment.",
    "For other candidates only.",
    "A colleague's result.",
    "Hypothetical example.",
    "- Without production deployment.",
  ])(
    "does not drop following unresolved scope %s through a direct quote",
    (tail) => {
      const source = `${original}\n${tail}`;
      expect(direct(source).state).not.toBe("supported");
      expect(grounded(source)).toBe(0);
      expect(
        assessWritingSupport(buildWritingSupportDocument(source), {
          kind: "summary",
          proposed: original,
        }).state,
      ).not.toBe("supported");
    },
  );

  it.each(["", "."])(
    "applies the same scope rule through non-bullet fallback after punctuation %j",
    (punctuation) => {
      const from = `${original}${punctuation}`;
      const to = `${replacement}${punctuation}`;
      const source = `${from}\nWithout production deployment.`;
      const selected = buildRewriteSources(source);
      expect(selected.some((item) => item.text === from)).toBe(true);
      expect(direct(source, from, to).state).not.toBe("supported");
      expect(grounded(source, from, to)).toBe(0);
    },
  );

  it("retains responsible future qualifier IDs in the unchanged context shape", () => {
    const source = `${original}\nWithout production deployment.`;
    const document = buildWritingSupportDocument(source);
    const [contribution, qualifier] = document.anchors;
    expect(contribution.context.kind).toBe("qualified_or_unknown");
    expect(contribution.context.qualifierIds).toContain(qualifier.span.id);
    expect(document.schemaVersion).toBe("writing-support/1.1.0");
    expect(document.policyVersion).toBe("legacy-source-transforms/1.0.4");
    const changed = structuredClone(document);
    changed.anchors[0].context.qualifierIds = [];
    expect(
      assessWritingSupport(changed, {
        kind: "rewrite",
        original,
        proposed: replacement,
      }),
    ).toMatchObject({
      state: "rejected",
      reason: "source_or_policy_binding_mismatch",
    });
  });

  it("allows only the finite reference's preceding right edge without clearing its forward qualifier", () => {
    const source = project(["API reference"]);
    const document = buildWritingSupportDocument(source);
    const contribution = document.anchors.find(
      (anchor) => anchor.span.text === `- ${original}`,
    )!;
    const reference = document.anchors.at(-1)!;
    expect(contribution.context.kind).toBe("unqualified_resume_clause");
    expect(reference.context.kind).toBe("qualified_or_unknown");
    expect(reference.context.qualifierIds).toContain(reference.span.id);
    expect(direct(source).state).toBe("supported");
    expect(grounded(source)).toBe(1);
    expect(
      assessWritingSupport(document, {
        kind: "summary",
        proposed: "API reference",
      }).state,
    ).not.toBe("supported");
  });

  it.each([
    "API Reference",
    "api reference",
    "API reference:",
    "API reference for another candidate",
    "API reference https://example.test",
  ])("does not treat reference-like prose %s as an inert boundary", (tail) => {
    const source = project([tail]);
    expect(direct(source).state).not.toBe("supported");
    expect(grounded(source)).toBe(0);
  });

  it("does not exempt the reference outside the complete project context or across a blank", () => {
    for (const source of [
      `${original}\nAPI reference`,
      project(["", "API reference"]),
    ]) {
      expect(direct(source).state).not.toBe("supported");
      expect(grounded(source)).toBe(0);
    }
  });

  it.each([
    ["API reference", "Without production deployment."],
    [
      "API reference",
      "",
      "Skills",
      "Email: demo@example.test",
      "Without production deployment.",
    ],
    [
      "",
      "Projects",
      "Email: demo@example.test",
      "- Without production deployment.",
    ],
  ])(
    "does not end scope scanning at reference or cosmetic boundaries %#",
    (...tail) => {
      const source = project(tail);
      expect(direct(source).state).not.toBe("supported");
      expect(grounded(source)).toBe(0);
    },
  );

  it("stops association at a separately recognized contribution", () => {
    const source = `${original}\nReduced API latency by 20%.`;
    expect(direct(source).state).toBe("supported");
    expect(grounded(source)).toBe(1);
  });

  it("stops association at an independently complete next project entry", () => {
    const second = "Built a TypeScript service dashboard.";
    const source = project([
      "",
      "Queue Worker",
      second,
      "Without production deployment.",
    ]);
    expect(direct(source).state).toBe("supported");
    expect(grounded(source)).toBe(1);
    expect(
      direct(source, second, second.replace("Built", "Created")).state,
    ).not.toBe("supported");
  });

  it("stops prior association at an explicit role boundary without proving its later scope", () => {
    const role = "Backend Engineer at Cedar Labs";
    const source = `${original}\n${role}\nWithout production deployment.`;
    expect(direct(source).state).toBe("supported");
    expect(grounded(source)).toBe(1);
    expect(direct(source, role, role).state).not.toBe("supported");
    expect(grounded(source, role, role)).toBe(0);
  });

  it("does not copy or summarize an explicit role while dropping its following hypothetical scope", () => {
    const role = "Backend Engineer at Cedar Labs";
    const source = `${role}\nHypothetical example.`;
    const document = buildWritingSupportDocument(source);
    const copy = assessWritingSupport(document, {
      kind: "rewrite",
      original: role,
      proposed: role,
    });
    const summary = assessWritingSupport(document, {
      kind: "summary",
      proposed: role,
    });
    const retained = grounded(source, role, role);
    expect({ copy: copy.state, summary: summary.state, retained }).toEqual({
      copy: "clarification_required",
      summary: "clarification_required",
      retained: 0,
    });
    expect(document.anchors[0].context.qualifierIds).toContain(
      document.anchors[1].span.id,
    );
  });

  it("preserves selected source bounds, deterministic IDs and exact source quotes", () => {
    const bounded = (length: number) => `- Built ${"x".repeat(length - 8)}`;
    const bounds = [24, 25, 500, 501].map(bounded).join("\n");
    expect(buildRewriteSources(bounds).map((item) => item.text.length)).toEqual(
      [25, 500],
    );
    const source = Array.from(
      { length: 33 },
      (_, index) => `- Built a Python service dashboard for project ${index}.`,
    ).join("\n");
    const first = buildRewriteSources(source);
    expect(first).toHaveLength(32);
    expect(first.map((item) => item.id)).toEqual(
      Array.from({ length: 32 }, (_, index) => index),
    );
    expect(first.every((item) => source.includes(item.text))).toBe(true);
    expect(buildRewriteSources(source)).toEqual(first);
  });

  it("rejects the previous derived policy even for an otherwise supported contribution", () => {
    expect(
      assessWritingSupport(buildWritingSupportDocument(original), {
        kind: "rewrite",
        original,
        proposed: replacement,
        expectedPolicyVersion: "legacy-source-transforms/1.0.2",
      }),
    ).toMatchObject({
      state: "rejected",
      reason: "source_or_policy_binding_mismatch",
    });
  });
});
