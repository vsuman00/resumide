import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  JobRequirementRelationsSchema,
  StoredJobRequirementsSchema,
  createJobRequirementRelations,
  encodeJobRelationSemantics,
  jobRelationSemanticSha256,
  projectJobRelationSemantics,
  JOB_RELATION_ADMISSION_PROFILE,
  JOB_RELATION_ADMISSION_PROFILE_SHA256,
  JOB_RELATION_JSON_SCHEMA,
} from "../../app/lib/server/job-requirement-admission";
import {
  JobRequirementsSchema,
  parseJobRequirements,
} from "../../app/lib/server/job-requirements";
import { JOB_RELATION_UNICODE_SHA256 } from "../../app/lib/server/job-relation-unicode";
const context = {
  ownerId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  analysisId: "33333333-3333-4333-8333-333333333333",
  jobId: "44444444-4444-4444-8444-444444444444",
  parentVersionId: null,
  locale: "en-IN",
  domain: "software-engineering",
};
const source =
  "🌏 Neutral role\nRequirements\nJS required\nPostgres required\nFastAPI or Flask required\nPython and SQL required\n1-4 years experience required\nZephyrCircuit required";
const construct = () => createJobRequirementRelations(source, context);

it("constructs a distinct registered review-only envelope with literal aliases and complete typed clauses", () => {
  const doc = construct();
  expect(doc).toMatchObject({
    schemaVersion: "requirements/2.0.0",
    producerVersion: "jd-relations/1.0.0",
    scoringEligible: false,
    sourceText: source,
  });
  expect(doc).not.toHaveProperty("persistable");
  expect(doc).not.toHaveProperty("authority");
  expect(
    doc.requirements.find((item) => item.value === "JS")?.mapping,
  ).toMatchObject({
    kind: "alias",
    canonicalValue: "JavaScript",
    conceptId: "local-software:javascript",
  });
  expect(
    doc.requirements.find((item) => item.value === "Postgres")?.mapping,
  ).toMatchObject({ kind: "alias", canonicalValue: "PostgreSQL" });
  const js = doc.requirements.find((item) => item.value === "JS")!;
  expect(js.tokenEvidence[0].start).toBe(
    Array.from(source.slice(0, source.indexOf("JS"))).length,
  );
  expect(
    doc.relations.clauses.find(
      (item) => item.evidence.quote === "FastAPI or Flask required",
    )?.skillExpression.kind,
  ).toBe("any_of");
  expect(
    doc.relations.clauses.find(
      (item) => item.evidence.quote === "Python and SQL required",
    )?.skillExpression.kind,
  ).toBe("all_of");
  expect(
    doc.relations.clauses.find((item) => item.duration.kind === "range")
      ?.duration,
  ).toMatchObject({
    lower: { value: 1, inclusive: true },
    upper: { value: 4, inclusive: true },
    evaluated: false,
  });
  expect(
    doc.relations.clauses.find(
      (item) => item.evidence.quote === "ZephyrCircuit required",
    )?.skillExpression,
  ).toMatchObject({ kind: "unknown", reason: "no_discovered_operands_review" });
  expect(
    doc.retainedClauses.some(
      (item) =>
        item.evidence.quote === "ZephyrCircuit required" &&
        item.interpretation === "unmapped",
    ),
  ).toBe(true);
  expect(JobRequirementsSchema.safeParse(doc).success).toBe(false);
});
it("uses the storage scope-review code while preserving a skill-specific duration clause", () => {
  const quote = "At least 2 years of Python experience required";
  const document = createJobRequirementRelations(
    `Requirements\n${quote}`,
    context,
  );
  const clause = document.relations.clauses[0];
  expect(clause).toMatchObject({
    evidence: { quote },
    skillExpression: { kind: "unknown", reason: "unsupported_scope_review" },
    duration: { kind: "at_least", lower: { value: 2, inclusive: true } },
  });
  expect(StoredJobRequirementsSchema.safeParse(document).success).toBe(true);
  const previous = structuredClone(document);
  const expression = previous.relations.clauses[0].skillExpression;
  if (expression.kind !== "unknown") throw new Error("Expected scope review");
  expression.reason = "unparsed_scope_or_operand_review";
  expect(StoredJobRequirementsSchema.parse(previous)).toEqual(previous);
  expression.reason = "unsupported_connector_review";
  expect(StoredJobRequirementsSchema.safeParse(previous).success).toBe(false);
});
it("uses stable ordinal graph references while ignoring generated IDs, allocation time and separate expected parent", () => {
  const first = construct(),
    second = construct();
  expect(second.id).not.toBe(first.id);
  second.createdAt = "2026-01-01T00:00:00Z";
  second.parentVersionId = randomUUID();
  for (const item of second.relations.clauses)
    item.id = createHash("sha256").update(randomUUID()).digest("hex");
  second.requirements.reverse();
  second.relations.clauses.reverse();
  second.retainedClauses.reverse();
  expect(jobRelationSemanticSha256(second)).toBe(
    jobRelationSemanticSha256(first),
  );
  const encoded = new TextDecoder().decode(encodeJobRelationSemantics(first));
  expect(encoded).toContain('"requirementIds":["/requirements/');
  expect(encoded).not.toContain(first.id);
  for (const item of first.requirements) expect(encoded).not.toContain(item.id);
  expect(encoded).not.toContain('"spanId"');
  expect(JSON.parse(encoded)).toEqual(projectJobRelationSemantics(first));
});
it.each([" ", "\t", "\u00a0", "\ufeff"])(
  "rejects stored v2 literal padding %j without rewriting the value",
  (padding) => {
    const doc = construct();
    const item = doc.requirements.find(
      (requirement) => requirement.value === "JS",
    )!;
    item.value = `${padding}${item.value}${padding}`;
    expect(JobRequirementRelationsSchema.safeParse(doc).success).toBe(false);
  },
);
it("rejects oversized stored v2 literal padding before it can disappear from the body budget", () => {
  const doc = construct();
  const item = doc.requirements.find(
    (requirement) => requirement.value === "JS",
  )!;
  item.value = `${" ".repeat(JOB_RELATION_ADMISSION_PROFILE.budgets.bodyJsonbUtf8Bytes)}${item.value}`;
  expect(Buffer.byteLength(JSON.stringify(doc), "utf8")).toBeGreaterThan(
    JOB_RELATION_ADMISSION_PROFILE.budgets.bodyJsonbUtf8Bytes,
  );
  expect(JobRequirementRelationsSchema.safeParse(doc).success).toBe(false);
});
it("keeps exact v2 literals unchanged and preserves the legacy value trimming contract", () => {
  const doc = construct();
  expect(JobRequirementRelationsSchema.parse(doc)).toEqual(doc);
  const legacy = parseJobRequirements("Requirements\nSQL required", context);
  legacy.requirements[0].value = " SQL ";
  expect(JobRequirementsSchema.parse(legacy).requirements[0].value).toBe("SQL");
});
it.each([
  "or",
  "bounds",
  "quote",
  "mapping",
  "importance",
  "policy",
  "relationPolicy",
  "source",
  "score",
  "local",
])(
  "rejects tampered %s without treating a forged semantic envelope as admitted",
  (kind) => {
    const doc = construct();
    if (kind === "or") {
      const clause = doc.relations.clauses.find(
        (item) => item.skillExpression.kind === "any_of",
      )!;
      clause.skillExpression.kind = "all_of";
    }
    if (kind === "bounds")
      doc.relations.clauses.find(
        (item) => item.duration.kind === "range",
      )!.duration.upper!.value = 5;
    if (kind === "quote") doc.requirements[0].evidence.quote += " extra";
    if (kind === "mapping")
      doc.requirements.find((item) => item.value === "JS")!.mapping!.conceptId =
        "local-software:postgresql";
    if (kind === "importance")
      doc.relations.clauses[0].scope.importance = "preferred";
    if (kind === "policy") doc.mappingPolicy.lexiconSha256 = "a".repeat(64);
    if (kind === "relationPolicy") doc.relationPolicy.sha256 = "a".repeat(64);
    if (kind === "source") doc.sourceText += "\nOther source";
    const raw =
      kind === "score"
        ? { ...doc, scoringEligible: true }
        : kind === "local"
          ? { ...doc, persistable: false }
          : doc;
    expect(JobRequirementRelationsSchema.safeParse(raw).success).toBe(false);
  },
);
it.each([
  "duplicate_id",
  "dangling",
  "duplicate_ref",
  "wrong_span_id",
  "duplicate_clause",
  "float",
  "oversized_graph",
])("rejects invalid %s in the stored graph", (kind) => {
  const doc = construct();
  if (kind === "duplicate_id") doc.requirements[1].id = doc.requirements[0].id;
  if (kind === "dangling")
    doc.retainedClauses[0].requirementIds = [randomUUID()];
  if (kind === "duplicate_ref")
    doc.retainedClauses[0].requirementIds.push(
      doc.retainedClauses[0].requirementIds[0],
    );
  if (kind === "wrong_span_id") doc.requirements[0].evidence.spanId = "jd-0-1";
  if (kind === "duplicate_clause")
    doc.relations.clauses.push(structuredClone(doc.relations.clauses[0]));
  if (kind === "float")
    doc.relations.clauses.find(
      (item) => item.duration.kind === "range",
    )!.duration.lower!.value = 1.5;
  if (kind === "oversized_graph")
    doc.requirements = Array.from({ length: 301 }, () =>
      structuredClone(doc.requirements[0]),
    );
  expect(JobRequirementRelationsSchema.safeParse(doc).success).toBe(false);
});
it.each(["\0", "\ud800", "\udc00", "\ud800x"])(
  "rejects non-PostgreSQL Unicode input %j",
  (invalid) => {
    expect(() =>
      createJobRequirementRelations(
        `Requirements\nJS${invalid} required`,
        context,
      ),
    ).toThrow();
  },
);
it("encodes wellformed Unicode and JSON string escapes without normalization or structural spaces", () => {
  const text =
    '🌏 Neutral e\u0301\nRequirements\nZephyr "path\\name"\t\u0001\u2028\u2029 required';
  const doc = createJobRequirementRelations(text, context);
  const bytes = encodeJobRelationSemantics(doc),
    encoded = new TextDecoder().decode(bytes);
  expect(encoded).toContain(`"sourceText":${JSON.stringify(text)}`);
  expect(encoded).toContain("\\u0001");
  expect(encoded).toContain("🌏");
  expect(encoded).not.toContain("é".normalize("NFC"));
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    jobRelationSemanticSha256(doc),
  );
});
it("keeps unsupported segments and ambiguous relations explicit and unscored", () => {
  const unsupported = createJobRequirementRelations(source, {
    ...context,
    domain: "civil-engineering",
  });
  expect(unsupported.state).toBe("unsupported");
  expect(unsupported.scoringEligible).toBe(false);
  const unknown = createJobRequirementRelations(
    "Requirements\nFastAPI or Flask and Python required\nMore than 3+ years experience required",
    context,
  );
  expect(unknown.relations.clauses[0].skillExpression.kind).toBe("unknown");
  expect(unknown.relations.clauses[1].duration.kind).toBe("unknown");
  expect(
    unknown.relations.clauses.every((item) => item.numericCredit === null),
  ).toBe(true);
});
it("rejects oversized source and never weakens the legacy reader", () => {
  expect(() =>
    createJobRequirementRelations("x".repeat(20001), context),
  ).toThrow();
  const legacy = parseJobRequirements("SQL required", context);
  for (const producerVersion of [
    "jd-parser/1.0.0",
    "jd-parser/1.0.1",
    "jd-parser/1.0.2",
  ])
    expect(
      StoredJobRequirementsSchema.safeParse({ ...legacy, producerVersion })
        .success,
    ).toBe(true);
  expect(
    StoredJobRequirementsSchema.safeParse({
      ...legacy,
      producerVersion: "jd-parser/99",
    }).success,
  ).toBe(false);
});
it("binds the frozen structural schema, Unicode profile and policies into an immutable admission descriptor", () => {
  expect(JOB_RELATION_ADMISSION_PROFILE.unicodePolicy.sha256).toBe(
    JOB_RELATION_UNICODE_SHA256,
  );
  expect(JOB_RELATION_ADMISSION_PROFILE_SHA256).toMatch(/^[a-f0-9]{64}$/u);
  expect(JOB_RELATION_JSON_SCHEMA).toHaveProperty(
    "additionalProperties",
    false,
  );
  expect(Object.isFrozen(JOB_RELATION_ADMISSION_PROFILE.budgets)).toBe(true);
  expect(Object.isFrozen(JOB_RELATION_JSON_SCHEMA)).toBe(true);
});
