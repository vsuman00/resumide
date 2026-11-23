import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildRewriteSources } from "../../app/lib/server/rewrite-sources";
import { groundWriterSuggestions } from "../../app/lib/server/writer-grounding";
import {
  assessWritingSupport,
  buildWritingSupportDocument,
  WRITING_SUPPORT_POLICY_VERSION,
} from "../../app/lib/server/writing-support";

const reasoning = "Clarifies the contribution.";

function observe(source: string, original: string, proposed: string) {
  const document = buildWritingSupportDocument(source);
  const before = JSON.stringify(document);
  const outcome = assessWritingSupport(document, {
    kind: "rewrite",
    original,
    proposed,
  });
  const grounded = groundWriterSuggestions(
    { summary: null, bullets: [{ original, rewrite: proposed, reasoning }] },
    source,
  );
  expect(document.sourceSha256).toBe(
    createHash("sha256").update(source, "utf8").digest("hex"),
  );
  expect(document.sourceText).toBe(source);
  for (const anchor of document.anchors) {
    expect(
      Array.from(source).slice(anchor.span.start, anchor.span.end).join(""),
    ).toBe(anchor.span.text);
  }
  expect(JSON.stringify(document)).toBe(before);
  return { document, outcome, grounded };
}

function expectSupported(source: string, original: string, proposed: string) {
  const { document, outcome, grounded } = observe(source, original, proposed);
  expect(outcome.state).toBe("supported");
  if (outcome.state !== "supported") throw Error("Expected supported prose");
  expect(outcome.binding).toEqual({
    sourceSha256: document.sourceSha256,
    policyVersion: WRITING_SUPPORT_POLICY_VERSION,
  });
  const exactAnchor = document.anchors.find((a) => a.span.text === original);
  expect(exactAnchor).toBeDefined();
  expect(outcome.sourceAnchorIds).toContain(exactAnchor?.span.id);
  expect(grounded.bullets).toEqual([
    { original, rewrite: proposed, reasoning },
  ]);
}

function expectUnsupported(source: string, original: string, proposed: string) {
  const result = observe(source, original, proposed);
  expect(result.outcome.state).not.toBe("supported");
  expect(result.grounded.bullets).toEqual([]);
  return result;
}

describe("source-bound writing layout equivalence", () => {
  it.each([
    [
      "ordinary ASCII control",
      "- Built profiling tools for Python services.",
      "Created profiling tools for Python services.",
    ],
    [
      "font ligature in prose",
      "- Built pro\uFB01ling tools for Python services.",
      "Created profiling tools for Python services.",
    ],
    [
      "font ligature in a different ordinary word",
      "- Built work\uFB02ow tools for Python services.",
      "Created workflow tools for Python services.",
    ],
    [
      "alphabetic discretionary soft hyphen",
      "- Built scala\u00ADble Python service tools.",
      "Created scalable Python service tools.",
    ],
    [
      "soft hyphen in a different ordinary word",
      "- Built stream\u00ADlining tools for Python services.",
      "Created streamlining tools for Python services.",
    ],
  ])("retains %s without changing raw evidence", (_name, source, proposed) => {
    expectSupported(source, source, proposed);
  });

  it("selects a structural square bullet alongside an ordinary bullet", () => {
    const original = "\u25AA Built a Python service dashboard.";
    const other = "- Built a TypeScript API dashboard.";
    const source = `${original}\n${other}`;
    expect(buildRewriteSources(source).map((item) => item.text)).toEqual([
      original,
      other,
    ]);
    expectSupported(source, original, "Created a Python service dashboard.");
  });

  it.each([
    [
      "URL",
      "- Built tools at https://example.test/pro\uFB01ling/scala\u00ADble.",
      "Created tools at https://example.test/profiling/scalable.",
    ],
    [
      "mailbox",
      "- Built tools for pro\uFB01ling@scala\u00ADble.test.",
      "Created tools for profiling@scalable.test.",
    ],
    [
      "opaque uppercase identifier with digits",
      "- Built PRO\uFB01LING_KEY42 service tools.",
      "Created PROfiLING_KEY42 service tools.",
    ],
    [
      "backticked code",
      "- Built `pro\uFB01ling` tools for services.",
      "Created `profiling` tools for services.",
    ],
    [
      "mixed-case identifier",
      "- Built pro\uFB01lingId tools for services.",
      "Created profilingId tools for services.",
    ],
    [
      "underscore identifier",
      "- Built pro\uFB01ling_key tools for services.",
      "Created profiling_key tools for services.",
    ],
  ])("does not normalize a protected %s", (_name, source, proposed) => {
    expectUnsupported(source, source, proposed);
  });

  it.each([
    [
      "metric",
      "- Built profiling tools; reduced latency by 20%.",
      "Created profiling tools; reduced latency by 30%.",
    ],
    [
      "agency",
      "- Built profiling tools for Python services.",
      "Led profiling tools for Python services.",
    ],
    [
      "actor",
      "- We built profiling tools for Python services.",
      "I created profiling tools for Python services.",
    ],
    [
      "negation",
      "- Never built profiling tools for Python services.",
      "Created profiling tools for Python services.",
    ],
    [
      "scope",
      "- Built internal profiling tools for Python services.",
      "Created external profiling tools for Python services.",
    ],
  ])("continues to reject a changed %s", (_name, source, proposed) => {
    expectUnsupported(source, source, proposed);
  });

  it("retains a colleague qualifier around otherwise equivalent prose", () => {
    const original = "- Built pro\uFB01ling tools for Python services.";
    expectUnsupported(
      `A colleague:\n${original}`,
      original,
      "Created profiling tools for Python services.",
    );
  });

  it("does not resolve duplicate raw contributions by typographic similarity", () => {
    const original = "- Built pro\uFB01ling tools for Python services.";
    const result = expectUnsupported(
      `${original}\n${original}`,
      original,
      "Created profiling tools for Python services.",
    );
    expect(result.outcome).toMatchObject({
      state: "rejected",
      reason: "ambiguous_source_anchor",
    });
  });

  it("keeps raw-original lookup and source/policy bindings exact", () => {
    const source = "- Built pro\uFB01ling tools for Python services.";
    const document = buildWritingSupportDocument(source);
    const request = {
      kind: "rewrite" as const,
      original: source,
      proposed: "Created profiling tools for Python services.",
    };
    for (const stale of [
      { expectedSourceSha256: "0".repeat(64) },
      { expectedPolicyVersion: "legacy-source-transforms/stale" },
    ]) {
      expect(
        assessWritingSupport(document, { ...request, ...stale }),
      ).toMatchObject({
        state: "rejected",
        reason: "source_or_policy_binding_mismatch",
      });
    }
    const forgedOriginal = source.replace("\uFB01", "fi");
    const result = expectUnsupported(source, forgedOriginal, request.proposed);
    expect(result.outcome).toMatchObject({
      state: "rejected",
      reason: "missing_source_anchor",
    });
  });
});
