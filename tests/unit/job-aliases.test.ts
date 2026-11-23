import { describe, expect, it } from "vitest";
import {
  JOB_ALIAS_POLICY_VERSION,
  JOB_ALIAS_LEXICON_SHA256,
  discoverJobAliasMentions,
  resolveJobAlias,
} from "../../app/lib/server/job-aliases";

describe("narrow local alias lexicon", () => {
  it.each([
    ["JS", "alias", "JavaScript", "local-software:javascript"],
    ["js", "alias", "JavaScript", "local-software:javascript"],
    ["JavaScript", "exact", "JavaScript", "local-software:javascript"],
    ["Postgres", "alias", "PostgreSQL", "local-software:postgresql"],
    ["POSTGRESQL", "exact", "PostgreSQL", "local-software:postgresql"],
  ])(
    "maps the whole literal %s with explicit policy identity",
    (value, kind, canonicalValue, conceptId) => {
      expect(resolveJobAlias(value)).toMatchObject({
        kind,
        canonicalValue,
        conceptId,
        policyVersion: "jd-local-aliases/1.0.0",
      });
      expect(JOB_ALIAS_POLICY_VERSION).toBe("jd-local-aliases/1.0.0");
      expect(JOB_ALIAS_LEXICON_SHA256).toMatch(/^[a-f0-9]{64}$/u);
    },
  );
  it.each([
    "Java",
    "SQL",
    "Node.js",
    "JSX",
    "Postgre",
    "PostgresSQL",
    "JavaScript developer",
    " JS",
    "JS ",
  ])("does not invent an alias for %s", (value) => {
    expect(resolveJobAlias(value)).toMatchObject({
      kind: "unmapped",
      canonicalValue: null,
      conceptId: null,
      prospectiveCreditGroup: null,
    });
  });
  it("keeps alias and canonical prospective credit identical, but separates concepts", () => {
    expect(resolveJobAlias("JS").prospectiveCreditGroup).toBe(
      resolveJobAlias("JavaScript").prospectiveCreditGroup,
    );
    expect(resolveJobAlias("Postgres").prospectiveCreditGroup).toBe(
      resolveJobAlias("PostgreSQL").prospectiveCreditGroup,
    );
    expect(resolveJobAlias("JS").prospectiveCreditGroup).not.toBe(
      resolveJobAlias("Postgres").prospectiveCreditGroup,
    );
  });
  it("preserves exact codepoint token spans after emoji and combining marks", () => {
    const source = "🌏 e\u0301 JS/Postgres, JavaScript and PostgreSQL.";
    const mentions = discoverJobAliasMentions(source);
    expect(mentions.map((m) => m.value)).toEqual([
      "JS",
      "Postgres",
      "JavaScript",
      "PostgreSQL",
    ]);
    expect(mentions[0].evidence.start).toBe(5);
    for (const m of mentions)
      expect(
        Array.from(source).slice(m.evidence.start, m.evidence.end).join(""),
      ).toBe(m.evidence.quote);
  });
  it("does not treat identifier, extension or qualified Node.js fragments as JS", () => {
    expect(
      discoverJobAliasMentions(
        "Node.js node.JS app.js JS.config JavaScripter JSX _JS JS_ 7JS JS7 éJS JSé JS\u0301 PostgreSQLish PostgresSQL",
      ),
    ).toEqual([]);
    expect(
      discoverJobAliasMentions("JS. (JS), [Postgres]; JavaScript!").map(
        (m) => m.value,
      ),
    ).toEqual(["JS", "JS", "Postgres", "JavaScript"]);
  });
  it("does not discover an alias before an astral Unicode qualified identifier", () => {
    expect(discoverJobAliasMentions("JS.𝒜 Postgres.𝒜")).toEqual([]);
  });
  it.each([
    "$JS",
    "JS$",
    "$JavaScript",
    "JavaScript$",
    "JS.$name",
    "JavaScript.$name",
  ])("does not map the dollar identifier fragment %s", (identifier) => {
    expect(discoverJobAliasMentions(identifier)).toEqual([]);
  });
  it("keeps standalone mentions usable beside dollar identifier counterexamples", () => {
    expect(
      discoverJobAliasMentions("JS, JavaScript, Postgres, PostgreSQL.").map(
        (mention) => mention.value,
      ),
    ).toEqual(["JS", "JavaScript", "Postgres", "PostgreSQL"]);
  });
  it("keeps repeated mentions and returns fresh immutable-policy-independent mappings", () => {
    const first = resolveJobAlias("JS");
    first.canonicalValue = "invented";
    expect(resolveJobAlias("JS").canonicalValue).toBe("JavaScript");
    expect(
      discoverJobAliasMentions("JS JS JS").map((m) => m.evidence.start),
    ).toEqual([0, 3, 6]);
  });
  it("fails bounded work rather than truncating", () => {
    expect(() => discoverJobAliasMentions("x".repeat(20001))).toThrow(
      "JD_ALIAS_INPUT_LIMIT",
    );
    expect(() => discoverJobAliasMentions("JS ".repeat(301))).toThrow(
      "JD_ALIAS_MENTION_LIMIT",
    );
  });
});
