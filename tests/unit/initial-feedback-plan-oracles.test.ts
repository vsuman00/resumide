import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";
import oracles from "../fixtures/initial-feedback-plan-oracles.json";
import {
  assessWritingSupport,
  buildWritingSupportDocument,
} from "../../app/lib/server/writing-support";
import {
  assessQualitativeProse,
  type QualitativeSourceProse,
} from "../../app/lib/server/qualitative-support";
import {
  compileInitialFeedbackPlan,
  renderInitialFeedbackPlan,
} from "../../app/lib/server/initial-feedback-plan";

type Oracle = (typeof oracles.cases)[number];
type Category = "toneAndStyle" | "content" | "structure" | "skills";
const isCategory = (value: unknown): value is Category =>
  value === "toneAndStyle" ||
  value === "content" ||
  value === "structure" ||
  value === "skills";

beforeAll(() => {
  const bytes = readFileSync(
    new URL("../fixtures/initial-feedback-plan-oracles.json", import.meta.url),
  );
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "7b0e3da37bd4d1531bdcde710e3f47f800213d64ae30fab93b22e60474279042",
  );
  expect(oracles.cases).toHaveLength(12);
  expect(oracles.provenance.authorship).toBe("AI-authored synthetic");
  expect(oracles.execution.native).toBe("UNTESTED");
});

// Adapter only: exact frozen targets enter the existing prose shape. It does
// not supply assessments, plan operators, binding hashes or support flags.
function rawProse(oracle: Oracle): QualitativeSourceProse {
  const raw: QualitativeSourceProse = {
    toneAndStyle: { tips: [] },
    content: { tips: [] },
    structure: { tips: [] },
    skills: { tips: [] },
    writer: { summary: null, bullets: [] },
  };
  if (oracle.type === "rewrite") {
    if (
      typeof oracle.original !== "string" ||
      typeof oracle.target !== "string"
    )
      throw Error("INVALID_FROZEN_REWRITE_ORACLE");
    raw.writer.bullets.push({
      original: oracle.original,
      rewrite: oracle.target,
      reasoning: "Clarifies the existing contribution.",
    });
  } else if (oracle.type === "summary") {
    if (typeof oracle.target !== "string")
      throw Error("INVALID_FROZEN_SUMMARY_ORACLE");
    raw.writer.summary = oracle.target;
  } else {
    const tip = oracle.target;
    if (
      oracle.type !== "qualitative_tip" ||
      typeof tip !== "object" ||
      tip === null ||
      !isCategory(oracle.category) ||
      (tip.type !== "good" && tip.type !== "improve")
    )
      throw Error("INVALID_FROZEN_TIP_ORACLE");
    raw[oracle.category].tips.push({
      type: tip.type,
      tip: tip.tip,
      explanation: tip.explanation,
      quote: tip.quote,
    });
  }
  return raw;
}

it.each(oracles.cases)("$id", (oracle) => {
  const raw = rawProse(oracle);
  // First distinguish source-meaning admission from new plan representability.
  if (oracle.type === "qualitative_tip") {
    const assessed = assessQualitativeProse(raw, oracle.source);
    const item = assessed.support.items[0];
    expect(item).toBeDefined();
    expect(oracle.expected.allowedDecisionStates).toContain(item.state);
    expect(item.retained).toBe(oracle.expected.output === "retain");
  } else {
    if (typeof oracle.target !== "string")
      throw Error("INVALID_FROZEN_TEXT_ORACLE");
    const document = buildWritingSupportDocument(oracle.source);
    if (oracle.type === "summary") {
      const support = assessWritingSupport(document, {
        kind: "summary",
        proposed: oracle.target,
      });
      expect(oracle.expected.allowedDecisionStates).toContain(support.state);
    } else {
      if (typeof oracle.original !== "string")
        throw Error("INVALID_FROZEN_REWRITE_ORACLE");
      const support = assessWritingSupport(document, {
        kind: "rewrite",
        original: oracle.original,
        proposed: oracle.target,
      });
      expect(oracle.expected.allowedDecisionStates).toContain(support.state);
    }
  }

  const compiled = compileInitialFeedbackPlan(oracle.source, raw);
  expect(compiled.recordedObservation).not.toBeNull();
  if (oracle.expected.output === "withhold") {
    // This input has only the unsafe target. A replacement copy or an assessed
    // all-empty success must not masquerade as retaining the requested text.
    expect(compiled.status).toBe("unavailable");
    return;
  }
  expect(compiled.status).toBe("available");
  if (compiled.status !== "available")
    throw Error("EXPECTED_EXACT_ORACLE_TARGET");
  const rendered = renderInitialFeedbackPlan(oracle.source, compiled.plan);
  expect(rendered.prose).toEqual(compiled.rendered.prose);
  expect(rendered.authority).toBe("source_content_only");
  expect(rendered.ownedVersionProof).toBe("not_provided");
  if (oracle.type === "rewrite") {
    expect(rendered.prose.writer.bullets).toHaveLength(1);
    expect(rendered.prose.writer.bullets[0].original).toBe(oracle.original);
    expect(rendered.prose.writer.bullets[0].rewrite).toBe(oracle.target);
  } else if (oracle.type === "summary") {
    expect(rendered.prose.writer.summary).toBe(oracle.target);
  } else {
    const target = oracle.target;
    if (
      typeof target !== "object" ||
      target === null ||
      !isCategory(oracle.category)
    )
      throw Error("INVALID_FROZEN_TIP_ORACLE");
    const tips = rendered.prose[oracle.category].tips;
    expect(tips).toHaveLength(1);
    expect(tips[0]).toEqual({ ...target, type: "improve" });
    expect(rendered.parts.tips).toHaveLength(1);
    expect(rendered.parts.tips[0]).toMatchObject({
      kind: oracle.expected.tipPresentation?.kind,
      type: "improve",
      state: oracle.expected.allowedDecisionStates[0],
    });
    expect(rendered.parts.tips.filter((tip) => tip.type === "good")).toEqual(
      [],
    );
  }
});
