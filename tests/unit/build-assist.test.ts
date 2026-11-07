import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BUILD_AI_POLICY_VERSION,
  applyBuildSuggestion,
  buildLineStarts,
  getBuildSelection,
  hashBuildSource,
  selectionLineRange,
  undoBuildSuggestion,
} from "../../app/lib/build-assist";
import {
  validateBuildAssistRequest,
  validateBuildSuggestion,
} from "../../app/lib/server/build-assist";

const source =
  "\\documentclass{article}\r\n\\begin{document}\r\nHelped reduce incidents 12 percent.\r\nContact neutral@example.test at https://example.org/ref\r\n\\end{document}\r\n";
const request = (patch: Record<string, unknown> = {}) => ({
  source,
  sourceHash: createHash("sha256").update(source).digest("hex"),
  startLine: 3,
  endLine: 3,
  mode: "rewrite",
  consent: true,
  policyVersion: BUILD_AI_POLICY_VERSION,
  ...patch,
});
const output = (replacement: string | null, operation = "replace") => ({
  operation,
  replacement,
  explanation: "A bounded wording edit.",
  questions: [],
});

describe("Build selected-context and reviewed patches", () => {
  it("hashes exact UTF-8 bytes and preserves CRLF selection offsets", async () => {
    expect(await hashBuildSource(source)).toBe(request().sourceHash);
    expect(await hashBuildSource(source.replaceAll("\r\n", "\n"))).not.toBe(
      request().sourceHash,
    );
    expect(buildLineStarts("A\r\nB\rC\nD")).toEqual([0, 3, 5, 7]);
    expect(selectionLineRange("A\r\nB\r\nC", 3, 6)).toEqual({
      startLine: 2,
      endLine: 2,
    });
    const selected = getBuildSelection(source, 3, 3);
    expect(selected.originalText).toBe("Helped reduce incidents 12 percent.");
    expect(selected.beforeContext).toBe(
      "\\documentclass{article}\r\n\\begin{document}",
    );
    expect(selected.afterContext).toBe(
      "Contact neutral@example.test at https://example.org/ref\r\n\\end{document}",
    );
  });
  it.each([{ consent: false }, { consent: "true" }, { policyVersion: "old" }])(
    "requires fresh explicit versioned consent %j",
    (patch) => {
      expect(() => validateBuildAssistRequest(request(patch))).toThrowError(
        expect.objectContaining({ code: "consent_required" }),
      );
    },
  );
  it.each([{ sourceHash: "0".repeat(64) }, { sourceHash: "BAD" }])(
    "rejects unbound source hash %j",
    (patch) => {
      expect(() => validateBuildAssistRequest(request(patch))).toThrowError(
        expect.objectContaining({ code: "stale_source" }),
      );
    },
  );
  it.each([
    { startLine: 0 },
    { endLine: 999 },
    { startLine: 4, endLine: 3 },
    { startLine: 2.5 },
    { startLine: "3" },
    { mode: ["fix"] },
    { extra: true },
  ])("rejects malformed selection/metadata %j", (patch) => {
    expect(() => validateBuildAssistRequest(request(patch))).toThrow();
  });
  it("bounds selected and nearby context rather than forwarding the full document", () => {
    const text = Array.from({ length: 30 }, (_, n) => `Neutral line ${n}`).join(
      "\n",
    );
    const selected = getBuildSelection(text, 10, 10);
    expect(selected.beforeContext).toBe("Neutral line 7\nNeutral line 8");
    expect(selected.afterContext).toBe("Neutral line 10\nNeutral line 11");
    expect(() => getBuildSelection(text, 1, 21)).toThrow();
    expect(() => getBuildSelection("X".repeat(4001), 1, 1)).toThrow();
    expect(() => getBuildSelection("   ", 1, 1)).toThrow();
  });
  it("applies only the exact bound range, preserves CRLF and undoes only unchanged output", async () => {
    const prepared = validateBuildAssistRequest(request());
    const result = validateBuildSuggestion(
      prepared,
      output("Improved wording.\nSecond line."),
    );
    const applied = await applyBuildSuggestion(source, result);
    expect(applied).toBe(
      source.replace(
        prepared.originalText,
        "Improved wording.\r\nSecond line.",
      ),
    );
    expect(
      undoBuildSuggestion(applied, {
        beforeSource: source,
        afterSource: applied,
      }),
    ).toBe(source);
    expect(() =>
      undoBuildSuggestion(applied + "% edit", {
        beforeSource: source,
        afterSource: applied,
      }),
    ).toThrow();
    await expect(
      applyBuildSuggestion(source + "% edit", result),
    ).rejects.toMatchObject({ code: "stale_source" });
    await expect(
      applyBuildSuggestion(source, { ...result, originalText: "forged" }),
    ).rejects.toMatchObject({ code: "stale_source" });
  });
  it("requires candidate fact confirmation even if a response's flag is forged", async () => {
    const result = validateBuildSuggestion(
      validateBuildAssistRequest(request({ mode: "resume" })),
      output("Improved incident handling 12 percent."),
    );
    expect(result.requiresFactConfirmation).toBe(true);
    await expect(applyBuildSuggestion(source, result)).rejects.toMatchObject({
      code: "fact_confirmation_required",
    });
    await expect(
      applyBuildSuggestion(source, {
        ...result,
        requiresFactConfirmation: false,
      }),
    ).rejects.toMatchObject({ code: "fact_confirmation_required" });
    expect(await applyBuildSuggestion(source, result, true)).toContain(
      "Improved incident handling 12 percent.",
    );
  });
  it.each([
    "Improved incidents 99 percent.",
    "Improved incidents.",
    "Improved incidents 12 percent and 5 teams.",
  ])("withholds changed/invented resume numbers: %s", (replacement) => {
    const result = validateBuildSuggestion(
      validateBuildAssistRequest(request({ mode: "resume" })),
      output(replacement),
    );
    expect(result.suggestion.operation).toBe("advice");
    expect(result.suggestion.replacement).toBeNull();
  });
  it("preserves numeric signs in resume wording", () => {
    const text = source.replace(
      "Helped reduce incidents 12 percent.",
      "Changed incidents -5 percent.",
    );
    const prepared = validateBuildAssistRequest(
      request({
        source: text,
        sourceHash: createHash("sha256").update(text).digest("hex"),
        mode: "resume",
      }),
    );
    expect(
      validateBuildSuggestion(prepared, output("Changed incidents 5 percent."))
        .suggestion.operation,
    ).toBe("advice");
  });
  it.each([
    ["Changed -.5 percent.", "Changed .5 percent."],
    ["Changed +5 percent.", "Changed 5 percent."],
    ["Measured 5 kg.", "Measured 5 lb."],
    [String.raw`Budget \$5 million USD.`, String.raw`Budget \$5 million EUR.`],
  ])(
    "withholds changed protected metric representation %s",
    (original, replacement) => {
      const text = source.replace(
        "Helped reduce incidents 12 percent.",
        original,
      );
      const prepared = validateBuildAssistRequest(
        request({
          source: text,
          sourceHash: createHash("sha256").update(text).digest("hex"),
          mode: "resume",
        }),
      );
      expect(
        validateBuildSuggestion(prepared, output(replacement)).suggestion
          .operation,
      ).toBe("advice");
    },
  );
  it.each([
    String.raw`5\textbf{kg}`,
    String.raw`5\emph{kg}`,
    String.raw`5\textit{kg}`,
    String.raw`5\mathrm{kg}`,
    String.raw`5\textbf{\emph{kg}}`,
    String.raw`5{\bfseries kg}`,
    String.raw`\textbf{5}\emph{kg}`,
  ])(
    "protects formatted metric units and allows unchanged wording: %s",
    (metric) => {
      const text = source.replace(
        "Helped reduce incidents 12 percent.",
        `Handled ${metric}.`,
      );
      const prepared = validateBuildAssistRequest(
        request({
          source: text,
          sourceHash: createHash("sha256").update(text).digest("hex"),
          mode: "resume",
        }),
      );
      expect(
        validateBuildSuggestion(prepared, output(`Processed ${metric}.`))
          .suggestion.operation,
      ).toBe("replace");
      expect(
        validateBuildSuggestion(
          prepared,
          output(`Processed ${metric.replace("kg", "lb")}.`),
        ).suggestion.operation,
      ).toBe("advice");
    },
  );
  it("enforces provider-context UTF-8 bytes in addition to character limits", () => {
    const text =
      "\\documentclass{article}\n\\begin{document}\n" +
      "中".repeat(1400) +
      "\nSelected.\n" +
      "中".repeat(1400) +
      "\n\\end{document}";
    expect(() =>
      validateBuildAssistRequest(
        request({
          source: text,
          sourceHash: createHash("sha256").update(text).digest("hex"),
          startLine: 4,
          endLine: 4,
        }),
      ),
    ).toThrowError(expect.objectContaining({ code: "selection_invalid" }));
  });
  it.each([
    "Contact other@example.test at https://example.org/ref",
    "Contact neutral@example.test at https://foreign.test/ref",
  ])("withholds changed protected contact tokens", (replacement) => {
    const prepared = validateBuildAssistRequest(
      request({ startLine: 4, endLine: 4, mode: "resume" }),
    );
    expect(
      validateBuildSuggestion(prepared, output(replacement)).suggestion
        .operation,
    ).toBe("advice");
  });
  it.each([
    String.raw`\input{/etc/passwd}`,
    String.raw`\write18{command}`,
    String.raw`\usepackage{shellesc}`,
  ])("never offers unsafe TeX as an applicable patch", (replacement) => {
    expect(
      validateBuildSuggestion(
        validateBuildAssistRequest(request()),
        output(replacement),
      ).suggestion.operation,
    ).toBe("advice");
  });
  it.each([
    {},
    { ...output("Text"), extra: true },
    output(null),
    output("Text", "advice"),
    { ...output("Text"), explanation: "\u202eunsafe" },
    { ...output("Text"), questions: ["x".repeat(301)] },
  ])("rejects malformed/unbounded output %j", (value) => {
    expect(() =>
      validateBuildSuggestion(validateBuildAssistRequest(request()), value),
    ).toThrowError(expect.objectContaining({ code: "output_invalid" }));
  });
  it("turns unresolved questions into advice and identical output into no_change", () => {
    const prepared = validateBuildAssistRequest(request());
    expect(
      validateBuildSuggestion(prepared, {
        ...output("A draft."),
        questions: ["What evidence supports this?"],
      }).suggestion.operation,
    ).toBe("advice");
    expect(
      validateBuildSuggestion(prepared, output(prepared.originalText))
        .suggestion,
    ).toMatchObject({ operation: "no_change", replacement: null });
  });
});
