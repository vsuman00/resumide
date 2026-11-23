import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  BUILD_AI_POLICY_VERSION,
  applyBuildSuggestion,
  undoBuildSuggestion,
} from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/app/lib/build-assist";
import {
  validateBuildAssistRequest,
  validateBuildSuggestion,
} from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/app/lib/server/build-assist";
const source =
  "\\documentclass{article}\r\n\\begin{document}\r\nBuilt Python APIs and reduced incidents 12 percent.\r\n\\end{document}\r\n";
const request = (mode = "resume", replacementSource = source) =>
  validateBuildAssistRequest({
    source: replacementSource,
    sourceHash: createHash("sha256").update(replacementSource).digest("hex"),
    startLine: 3,
    endLine: 3,
    mode,
    consent: true,
    policyVersion: BUILD_AI_POLICY_VERSION,
  });
const output = (
  replacement: string | null,
  operation = "replace",
  questions: string[] = [],
) => ({
  operation,
  replacement,
  explanation: "Synthetic validation guidance.",
  questions,
});
const checks: { name: string; pass: boolean }[] = [];
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  await fn();
  checks.push({ name, pass: true });
}
await check("exact-crlf-line-binding", () =>
  assert.equal(
    request().originalText,
    "Built Python APIs and reduced incidents 12 percent.",
  ),
);
await check("resume-number-inflation-becomes-advice", () =>
  assert.equal(
    validateBuildSuggestion(
      request(),
      output("Built Python APIs and reduced incidents 42 percent."),
    ).suggestion.operation,
    "advice",
  ),
);
await check("missing-facts-question-prevents-replacement", () =>
  assert.equal(
    validateBuildSuggestion(
      request(),
      output(
        "Developed Python APIs and reduced incidents 12 percent.",
        "replace",
        ["Was this measured?"],
      ),
    ).suggestion.operation,
    "advice",
  ),
);
await check("unsafe-file-replacement-becomes-advice", () =>
  assert.equal(
    validateBuildSuggestion(request("fix"), output("\\input{/etc/passwd}"))
      .suggestion.operation,
    "advice",
  ),
);
await check("unsafe-process-replacement-becomes-advice", () =>
  assert.equal(
    validateBuildSuggestion(request("fix"), output("\\write18{echo synthetic}"))
      .suggestion.operation,
    "advice",
  ),
);
await check("unknown-provider-fields-rejected", () =>
  assert.throws(
    () =>
      validateBuildSuggestion(request(), {
        ...output("Neutral text."),
        untrustedExtra: true,
      }),
    { code: "output_invalid" },
  ),
);
await check("hidden-output-bidi-rejected", () =>
  assert.throws(
    () =>
      validateBuildSuggestion(
        request(),
        output("Built Python APIs\u202e and reduced incidents 12 percent."),
      ),
    { code: "output_invalid" },
  ),
);
const result = validateBuildSuggestion(
  request(),
  output("Developed Python APIs and reduced incidents 12 percent."),
);
await check("resume-confirmation-required", () =>
  assert.rejects(applyBuildSuggestion(source, result), {
    code: "fact_confirmation_required",
  }),
);
let after = "";
await check("confirmed-apply-preserves-surrounding-document", async () => {
  after = await applyBuildSuggestion(source, result, true);
  assert.equal(
    after,
    source.replace("Built Python APIs", "Developed Python APIs"),
  );
});
await check("repeated-apply-rejects-stale-source", () =>
  assert.rejects(applyBuildSuggestion(after, result, true), {
    code: "stale_source",
  }),
);
await check("source-change-before-apply-rejected", () =>
  assert.rejects(
    applyBuildSuggestion(source.replace("12", "13"), result, true),
    { code: "stale_source" },
  ),
);
await check("undo-only-exact-last-output", () => {
  assert.equal(
    undoBuildSuggestion(after, { beforeSource: source, afterSource: after }),
    source,
  );
  assert.throws(
    () =>
      undoBuildSuggestion(after + " ", {
        beforeSource: source,
        afterSource: after,
      }),
    { code: "stale_source" },
  );
});
await check("resume-mode-flag-forgery-cannot-bypass-confirmation", () =>
  assert.rejects(
    applyBuildSuggestion(source, {
      ...result,
      requiresFactConfirmation: false,
    }),
    { code: "fact_confirmation_required" },
  ),
);
await check("advice-cannot-be-applied", () =>
  assert.rejects(
    applyBuildSuggestion(
      source,
      validateBuildSuggestion(request(), output(null, "advice")),
      true,
    ),
    { code: "stale_source" },
  ),
);
await check("no-op-becomes-no-change", () =>
  assert.equal(
    validateBuildSuggestion(request(), output(request().originalText))
      .suggestion.operation,
    "no_change",
  ),
);
const nonNumericSource = source.replace(
  " and reduced incidents 12 percent",
  "",
);
const inventedResume = validateBuildSuggestion(
  request("resume", nonNumericSource),
  output("Led Kubernetes teams."),
);
const inventedRewrite = validateBuildSuggestion(
  request("rewrite", nonNumericSource),
  output("Led Kubernetes teams and reduced costs 95 percent."),
);
const observations = {
  semanticTruthNotProven:
    inventedResume.suggestion.operation === "replace" &&
    inventedResume.requiresFactConfirmation,
  nonResumeRewriteLacksFactGuard:
    inventedRewrite.suggestion.operation === "replace" &&
    !inventedRewrite.requiresFactConfirmation &&
    (await applyBuildSuggestion(nonNumericSource, inventedRewrite)).includes(
      "95 percent",
    ),
};
console.log(
  JSON.stringify(
    {
      status: "pass",
      evidenceTier: "pure-source-adverse-cases-no-provider",
      checksExecuted: checks.length,
      checks,
      observations,
    },
    null,
    2,
  ),
);
