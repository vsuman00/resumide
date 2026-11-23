import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { parseJobRequirementsWithAliases } from "../../app/lib/server/job-requirements";
import { deriveLocalJobRelations } from "../../app/lib/server/job-relations";
const context = {
  ownerId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  analysisId: "33333333-3333-4333-8333-333333333333",
  jobId: "44444444-4444-4444-8444-444444444444",
};
const input = (source: string) =>
  parseJobRequirementsWithAliases(source, context, {
    modelVersion: "jd-local-alias-parser/1.0.0",
  });
const parse = (source: string) => deriveLocalJobRelations(input(source));
describe("local literal JD relations", () => {
  it.each([
    ["or", "any_of"],
    ["and", "all_of"],
  ])(
    "preserves explicit %s rather than requiring both alternatives",
    (operator, kind) => {
      const doc = parse(
        `🌏 Neutral role\nRequirements\nFastAPI ${operator} Flask required`,
      );
      expect(doc.clauses).toHaveLength(1);
      const clause = doc.clauses[0];
      expect(clause.skillExpression).toMatchObject({
        kind,
        operands: [{ value: "FastAPI" }, { value: "Flask" }],
        operatorEvidence: [{ quote: operator }],
      });
      expect(clause.scope).toMatchObject({
        importance: "required",
        negated: false,
      });
      expect(clause.reviewRequired).toBe(true);
      expect(doc).toMatchObject({
        authority: "local_review_only",
        scoringEligible: false,
        schemaVersion: "jd-local-relations/1.0.0",
      });
      for (const operand of clause.skillExpression.kind === "unknown" ||
      clause.skillExpression.kind === "atom"
        ? []
        : clause.skillExpression.operands)
        expect(
          Array.from(doc.sourceText)
            .slice(operand.evidence.start, operand.evidence.end)
            .join(""),
        ).toBe(operand.value);
      if (
        clause.skillExpression.kind === "any_of" ||
        clause.skillExpression.kind === "all_of"
      )
        expect(
          Array.from(doc.sourceText)
            .slice(
              clause.skillExpression.operatorEvidence[0].start,
              clause.skillExpression.operatorEvidence[0].end,
            )
            .join(""),
        ).toBe(operator);
    },
  );
  it.each([
    "Either FastAPI or Flask required",
    "Both FastAPI and Flask required",
    "Must have FastAPI or Flask experience",
  ])("keeps useful shared scope in %s", (source) => {
    expect(parse(source).clauses[0].skillExpression.kind).toBe(
      source.startsWith("Both") ? "all_of" : "any_of",
    );
  });
  it.each([
    ["FastAPI or Flask and Python required", "mixed_connectors_review"],
    [
      "FastAPI or (Flask and Python) required",
      "parenthesized_expression_review",
    ],
    ["(FastAPI or Flask required", "unbalanced_parentheses_review"],
    ["No FastAPI or Flask required", "negated_expression_review"],
    ["Either FastAPI and Flask required", "scope_connector_conflict_review"],
    [
      "FastAPI or Flask required but preferred",
      "conflicting_importance_review",
    ],
    ["FastAPI/Flask required", "unsupported_connector_review"],
    ["FastAPI or ZephyrCircuit required", "unparsed_scope_or_operand_review"],
  ])("retains ambiguous expression %s", (source, reason) => {
    const clause = parse(source).clauses[0];
    expect(clause.skillExpression).toMatchObject({ kind: "unknown", reason });
    expect(clause.evidence.quote).toBe(source);
    expect(clause.reviewRequired).toBe(true);
  });
  it("keeps unknown clauses and unmapped operands visible without invented concepts", () => {
    const doc = parse(
      "Requirements\nZephyrCircuit required\nFastAPI or Flask required",
    );
    expect(doc.clauses[0].skillExpression).toMatchObject({
      kind: "unknown",
      reason: "no_discovered_operands_review",
    });
    const expression = doc.clauses[1].skillExpression;
    expect(expression.kind).toBe("any_of");
    if (expression.kind === "any_of")
      expect(expression.operands.map((o) => o.mapping.conceptId)).toEqual([
        null,
        null,
      ]);
  });
  it("does not promise double credit for repeated same-concept aliases", () => {
    const doc = parse("Requirements\nJS or JavaScript required");
    const expression = doc.clauses[0].skillExpression;
    expect(expression.kind).toBe("any_of");
    if (expression.kind === "any_of") {
      expect(expression.operands).toHaveLength(2);
      expect(expression.operands[0].mapping.prospectiveCreditGroup).toBe(
        expression.operands[1].mapping.prospectiveCreditGroup,
      );
    }
    expect(doc.clauses[0].prospectiveCreditGroups).toHaveLength(1);
    expect(doc.clauses[0].numericCredit).toBeNull();
  });
  it.each([
    [
      "1-4 years of Python experience required",
      "range",
      1,
      true,
      4,
      true,
      "1-4 years",
    ],
    [
      "1–4 years of Python experience required",
      "range",
      1,
      true,
      4,
      true,
      "1–4 years",
    ],
    [
      "At least 3 years of Python experience required",
      "at_least",
      3,
      true,
      null,
      null,
      "At least 3 years",
    ],
    [
      "3+ years of Python experience required",
      "at_least",
      3,
      true,
      null,
      null,
      "3+ years",
    ],
    [
      "More than 3 years experience required",
      "more_than",
      3,
      false,
      null,
      null,
      "More than 3 years",
    ],
    [
      "At most 4 years experience required",
      "at_most",
      null,
      null,
      4,
      true,
      "At most 4 years",
    ],
    [
      "Less than 4 years experience required",
      "less_than",
      null,
      null,
      4,
      false,
      "Less than 4 years",
    ],
    [
      "Exactly 3 years experience required",
      "exactly",
      3,
      true,
      3,
      true,
      "Exactly 3 years",
    ],
  ])(
    "preserves explicit bounds in %s",
    (source, kind, lower, lowerInclusive, upper, upperInclusive, quote) => {
      const doc = parse(`🌏 Requirements\nRequirements\n${source}`);
      const duration = doc.clauses[0].duration;
      expect(duration.kind).toBe(kind);
      expect(duration.lower?.value ?? null).toBe(lower);
      expect(duration.lower?.inclusive ?? null).toBe(lowerInclusive);
      expect(duration.upper?.value ?? null).toBe(upper);
      expect(duration.upper?.inclusive ?? null).toBe(upperInclusive);
      expect(duration.evidence?.quote).toBe(quote);
      expect(duration.subjectBinding).toBe("literal_clause_only");
      expect(duration.evaluated).toBe(false);
      for (const e of [
        duration.evidence,
        duration.lower?.evidence,
        duration.upper?.evidence,
        ...duration.operatorEvidence,
      ].filter((e) => e !== null && e !== undefined))
        expect(Array.from(doc.sourceText).slice(e.start, e.end).join("")).toBe(
          e.quote,
        );
    },
  );
  it.each([
    ["3 years Python experience required", "comparator_unstated_review"],
    ["4-1 years Python experience required", "inverted_range_review"],
    ["1.5 years Python experience required", "unsupported_duration_review"],
    ["18 months Python experience required", "unsupported_duration_review"],
    [
      "No at least 3 years Python experience required",
      "negated_duration_review",
    ],
    [
      "At least 1-4 years Python experience required",
      "mixed_comparator_review",
    ],
    [
      "1-4 years or 5-8 years Python experience required",
      "multiple_durations_review",
    ],
  ])("withholds unknown duration semantics in %s", (source, reason) => {
    const duration = parse(source).clauses[0].duration;
    expect(duration).toMatchObject({
      kind: "unknown",
      reason,
      lower: null,
      upper: null,
      evaluated: false,
    });
  });
  it("keeps unstated duration distinct from zero and preserves clause-specific scope", () => {
    const doc = parse(
      "Requirements\nAt least 5 years software experience required\nAt least 2 years Python experience required\nPython required",
    );
    expect(doc.clauses.map((c) => c.duration.lower?.value ?? null)).toEqual([
      5,
      2,
      null,
    ]);
    expect(doc.clauses[2].duration.kind).toBe("not_stated");
    expect(
      doc.clauses.every(
        (c) => c.duration.subjectBinding === "literal_clause_only",
      ),
    ).toBe(true);
  });
  it("preserves required/preferred scope and ignores irrelevant company revenue/stack", () => {
    const source =
      "Qualifications\nFastAPI or Flask required\nPreferred\nAWS and GCP\nAbout Neutral Company:\n$900 million revenue and 12 years of Python experience\nJS or PostgreSQL powers company tools";
    const doc = parse(source);
    expect(doc.clauses.map((c) => c.scope.importance)).toEqual([
      "required",
      "preferred",
    ]);
    expect(doc.clauses.map((c) => c.skillExpression.kind)).toEqual([
      "any_of",
      "all_of",
    ]);
    expect(doc.clauses.every((c) => c.duration.kind === "not_stated")).toBe(
      true,
    );
  });
  it("binds exact source, alias policy and source version without write authority", () => {
    const original = input("FastAPI or Flask required");
    const doc = deriveLocalJobRelations(original);
    expect(doc.sourceDocumentId).toBe(original.id);
    expect(doc.inputSha256).toBe(original.inputSha256);
    expect(doc.aliasPolicy).toEqual(original.mappingPolicy);
    expect(doc.policy.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(doc.persistable).toBe(false);
    const changed = structuredClone(original);
    changed.sourceText += " ";
    expect(() => deriveLocalJobRelations(changed)).toThrow(
      "JD_RELATION_INPUT_INVALID",
    );
    const badQuote = structuredClone(original);
    badQuote.requirements[0].tokenEvidence[0].quote = "invented";
    expect(() => deriveLocalJobRelations(badQuote)).toThrow(
      "JD_RELATION_INPUT_INVALID",
    );
    const badPolicy = structuredClone(original);
    badPolicy.mappingPolicy.lexiconSha256 = "0".repeat(64);
    expect(() => deriveLocalJobRelations(badPolicy)).toThrow(
      "JD_RELATION_INPUT_INVALID",
    );
  });
  it("retains exact experience metadata omitted by A07's technical-clause review list", () => {
    const source =
      "🌏 Role\nTitle: Python EngineerLocation:Remote WorkEmployment Type:Full-timeExp Range:1–4 years";
    const doc = parse(source);
    expect(doc.clauses).toHaveLength(1);
    expect(doc.clauses[0].evidence.quote).toBe("Exp Range:1–4 years");
    expect(doc.clauses[0].duration).toMatchObject({
      kind: "range",
      lower: { value: 1 },
      upper: { value: 4 },
    });
    expect(doc.clauses[0].scope.importance).toBe("required");
  });
  it.each([
    "Approximately 1–4 years Python experience required",
    "Minimum 1–4 years Python experience required",
  ])("does not discard unparsed duration qualifier in %s", (source) => {
    expect(parse(source).clauses[0].duration).toMatchObject({
      kind: "unknown",
      reason: "duration_prefix_review",
      lower: null,
      upper: null,
    });
  });
  it("rejects a source-bound-looking alias token forged inside a qualified identifier", () => {
    const doc = input("JS required");
    doc.sourceText = "Node.js required";
    doc.inputSha256 = createHash("sha256").update(doc.sourceText).digest("hex");
    const evidence = {
      spanId: "jd-0-16",
      start: 0,
      end: 16,
      quote: doc.sourceText,
    };
    doc.requirements[0].value = "js";
    doc.requirements[0].evidence = evidence;
    doc.requirements[0].tokenEvidence = [
      { spanId: "jd-5-7", start: 5, end: 7, quote: "js" },
    ];
    doc.retainedClauses[0].evidence = evidence;
    expect(() => deriveLocalJobRelations(doc)).toThrow(
      "JD_RELATION_INPUT_INVALID",
    );
  });
  it("rejects a forged negation state rather than granting positive duration bounds", () => {
    const doc = input("No at least 3 years Python experience required");
    doc.retainedClauses[0].negated = false;
    expect(() => deriveLocalJobRelations(doc)).toThrow(
      "JD_RELATION_INPUT_INVALID",
    );
  });
  it("keeps unsupported source segments explicitly review-only", () => {
    const doc = input("FastAPI or Flask required");
    doc.locale = "de-DE";
    doc.state = "unsupported";
    const local = deriveLocalJobRelations(doc);
    expect(local).toMatchObject({
      sourceState: "unsupported",
      locale: "de-DE",
      domain: "software-engineering",
    });
    expect(local.clauses[0].skillExpression).toMatchObject({
      kind: "unknown",
      reason: "unsupported_segment_review",
    });
  });
  it("bounds repeated duration candidates without truncating review evidence", () => {
    const clause = (count: number) =>
      Array.from({ length: count }, () => "1-4 years").join(" or ") +
      " experience required";
    expect(parse(clause(8)).clauses[0].duration.candidateEvidence).toHaveLength(
      8,
    );
    expect(() => parse(clause(9))).toThrow("JD_RELATION_LIMIT");
  });
  it("does not let unmatched closings hide excessive raw nesting", () => {
    expect(() => parse(")" + "(".repeat(9) + "Python required")).toThrow(
      "JD_RELATION_LIMIT",
    );
  });
  it.each([
    {
      label: "eleven entries",
      value: Array.from({ length: 11 }, () => "review"),
    },
    { label: "overlong entry", value: ["x".repeat(101)] },
    { label: "empty entry", value: [""] },
    { label: "non-string entry", value: [42] },
    { label: "missing array entry", value: new Array<string>(1) },
  ])(
    "rejects ambiguity input with $label before interpretation",
    ({ value }) => {
      const doc = input("FastAPI or Flask required");
      doc.requirements[0].ambiguity = value as never;
      expect(() => deriveLocalJobRelations(doc)).toThrow(
        "JD_RELATION_INPUT_INVALID",
      );
    },
  );
  it("preserves valid ambiguity input at the existing shape bounds", () => {
    const doc = input("FastAPI or Flask required");
    doc.requirements[0].ambiguity = Array.from({ length: 10 }, () =>
      "x".repeat(100),
    );
    expect(deriveLocalJobRelations(doc).clauses[0].skillExpression.kind).toBe(
      "any_of",
    );
  });
  it("bounds operands, raw nesting, node construction and clauses before growing output", () => {
    expect(() =>
      parse(
        Array.from({ length: 33 }, () => "Python").join(" or ") + " required",
      ),
    ).toThrow("JD_RELATION_LIMIT");
    expect(() =>
      parse("(".repeat(9) + "Python required" + ")".repeat(9)),
    ).toThrow("JD_RELATION_LIMIT");
    expect(() =>
      parse(
        "Requirements\n" +
          Array.from(
            { length: 250 },
            () => "Python or Python or Python or Python required",
          ).join("\n"),
      ),
    ).toThrow("JD_RELATION_LIMIT");
    const invalid = input("Python required");
    invalid.retainedClauses = Array.from(
      { length: 301 },
      () => invalid.retainedClauses[0],
    );
    expect(() => deriveLocalJobRelations(invalid)).toThrow("JD_RELATION_LIMIT");
    const badSource = structuredClone(invalid);
    badSource.sourceText = "x".repeat(20001);
    badSource.inputSha256 = createHash("sha256")
      .update(badSource.sourceText)
      .digest("hex");
    expect(() => deriveLocalJobRelations(badSource)).toThrow(
      "JD_RELATION_LIMIT",
    );
  });
});
