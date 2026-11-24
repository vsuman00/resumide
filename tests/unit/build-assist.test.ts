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
import { assessBuildFactualSupport } from "../../app/lib/server/build-assist-support";
import { RELIABILITY_REGRESSIONS } from "../fixtures/reliability-regressions";
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
  it("withholds the unrelated legacy draft and applies only a supported bound range with CRLF", async () => {
    const legacy = validateBuildSuggestion(
      validateBuildAssistRequest(request()),
      output("Improved wording.\nSecond line."),
    );
    expect(legacy.suggestion).toMatchObject({
      operation: "advice",
      replacement: null,
    });
    const supportedSource =
      "\\documentclass{article}\r\n\\begin{document}\r\nBuilt a Python service dashboard.\r\n\\end{document}\r\n";
    const prepared = validateBuildAssistRequest(
      request({
        source: supportedSource,
        sourceHash: createHash("sha256").update(supportedSource).digest("hex"),
      }),
    );
    const result = validateBuildSuggestion(
      prepared,
      output("Created a Python service\ndashboard."),
    );
    const applied = await applyBuildSuggestion(supportedSource, result);
    expect(applied).toBe(
      supportedSource.replace(
        prepared.originalText,
        "Created a Python service\r\ndashboard.",
      ),
    );
    expect(
      undoBuildSuggestion(applied, {
        beforeSource: supportedSource,
        afterSource: applied,
      }),
    ).toBe(supportedSource);
    expect(() =>
      undoBuildSuggestion(applied + "% edit", {
        beforeSource: supportedSource,
        afterSource: applied,
      }),
    ).toThrow();
    await expect(
      applyBuildSuggestion(supportedSource + "% edit", result),
    ).rejects.toMatchObject({ code: "stale_source" });
    await expect(
      applyBuildSuggestion(supportedSource, {
        ...result,
        originalText: "forged",
      }),
    ).rejects.toMatchObject({ code: "stale_source" });
  });
  it("withholds legacy agency changes and requires confirmation for a supported draft even if its flag is forged", async () => {
    const legacy = validateBuildSuggestion(
      validateBuildAssistRequest(request({ mode: "resume" })),
      output("Improved incident handling 12 percent."),
    );
    expect(legacy.suggestion).toMatchObject({
      operation: "advice",
      replacement: null,
    });
    const supportedSource =
      "\\documentclass{article}\n\\begin{document}\nBuilt a Python service dashboard.\n\\end{document}";
    const result = validateBuildSuggestion(
      validateBuildAssistRequest(
        request({
          mode: "resume",
          source: supportedSource,
          sourceHash: createHash("sha256")
            .update(supportedSource)
            .digest("hex"),
        }),
      ),
      output("Created a Python service dashboard."),
    );
    expect(result.requiresFactConfirmation).toBe(true);
    await expect(
      applyBuildSuggestion(supportedSource, result),
    ).rejects.toMatchObject({
      code: "fact_confirmation_required",
    });
    await expect(
      applyBuildSuggestion(supportedSource, {
        ...result,
        requiresFactConfirmation: false,
      }),
    ).rejects.toMatchObject({ code: "fact_confirmation_required" });
    expect(await applyBuildSuggestion(supportedSource, result, true)).toContain(
      "Created a Python service dashboard.",
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
    "withholds unreviewed Handled-to-Processed while allowing literal-payload formatting: %s",
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
      ).toBe("advice");
      expect(
        validateBuildSuggestion(
          prepared,
          output(`\\textbf{Handled ${metric}.}`),
        ).suggestion.operation,
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

describe.each(["fix", "rewrite", "resume"] as const)(
  "all-mode factual support: %s",
  (mode) => {
    const prepared = (original: string) => {
      const full = `\\documentclass{article}\n\\begin{document}\n${original}\n\\end{document}`;
      return validateBuildAssistRequest(
        request({
          source: full,
          sourceHash: createHash("sha256").update(full).digest("hex"),
          startLine: 3,
          endLine: 2 + original.split("\n").length,
          mode,
        }),
      );
    };
    it.each(
      RELIABILITY_REGRESSIONS.unsupportedWriter.filter(
        (fixture) => fixture.kind === "bullet",
      ),
    )("withholds frozen unsupported claim $id", (fixture) => {
      if (typeof fixture.rewrite !== "string")
        throw Error("EXPECTED_BULLET_FIXTURE");
      const result = validateBuildSuggestion(
        prepared(fixture.source),
        output(fixture.rewrite),
      );
      expect(result.suggestion).toMatchObject({
        operation: "advice",
        replacement: null,
      });
    });
    it.each([
      ["Built a dashboard.", "Led a global team building a dashboard."],
      ["Reduced API latency by 20%.", "Reduced API latency by 40%."],
      ["Casey Morgan", "Jordan Rivera"],
      ["Built a Python dashboard.", "Built a Python and Rust dashboard."],
      ["Backend Engineer at Cedar Labs", "Backend Engineer at Maple Works"],
      ["Did not lead a team.", "Led a team."],
    ])(
      "withholds altered agency, metric, identity, skill, employer or negation %#",
      (original, proposal) => {
        const result = validateBuildSuggestion(
          prepared(original),
          output(proposal),
        );
        expect(result.suggestion).toMatchObject({
          operation: "advice",
          replacement: null,
        });
      },
    );
    it.each(["replace", "advice", "no_change"] as const)(
      "does not expose invented explanation claims in %s",
      (operation) => {
        const fabricated =
          "You led a global team and doubled revenue at Maple Works.";
        const result = validateBuildSuggestion(prepared("Built a dashboard."), {
          ...output(
            operation === "replace" ? "Created a dashboard." : null,
            operation,
          ),
          explanation: fabricated,
          questions: [
            "Which year did you lead the global team at Maple Works?",
          ],
        });
        expect(result.suggestion.replacement).toBeNull();
        expect(JSON.stringify(result.suggestion)).not.toContain("global team");
        expect(JSON.stringify(result.suggestion)).not.toContain("Maple Works");
        expect(result.requiresFactConfirmation).toBe(false);
      },
    );
    it("discards an unsupported explanation without losing an independently supported edit", () => {
      const result = validateBuildSuggestion(prepared("Built a dashboard."), {
        ...output("Created a dashboard."),
        explanation: "You led a global team and doubled revenue.",
      });
      expect(result.suggestion).toMatchObject({
        operation: "replace",
        replacement: "Created a dashboard.",
      });
      expect(result.suggestion.explanation).not.toContain("global team");
    });
    it("retains the same proven edit with ordinary non-whitelisted explanation wording", () => {
      const bound = prepared("Built a dashboard.");
      const approved = validateBuildSuggestion(
        bound,
        output("Created a dashboard."),
      );
      const explanation =
        "The revised wording is easier to read while keeping the original contribution.";
      const natural = validateBuildSuggestion(bound, {
        ...output("Created a dashboard."),
        explanation,
      });
      expect(approved.suggestion.operation).toBe("replace");
      expect(natural.suggestion.operation).toBe("replace");
      expect(natural.suggestion.replacement).toBe(
        approved.suggestion.replacement,
      );
      expect(natural.suggestion.explanation).not.toBe(explanation);
    });
    it("withholds a presupposing invented question independently of explanation", () => {
      const result = validateBuildSuggestion(prepared("Built a dashboard."), {
        ...output("Created a dashboard."),
        questions: ["Which year did you lead a global team at Maple Works?"],
      });
      expect(result.suggestion).toMatchObject({
        operation: "advice",
        replacement: null,
      });
      expect(result.suggestion.questions).not.toContain(
        "Which year did you lead a global team at Maple Works?",
      );
    });
    it.each([
      ["Things I have never done:\n", ""],
      ["", "\nWithout production deployment."],
      ["A colleague:\n\n\\section{Projects}\nSignal Dashboard\n", ""],
    ])(
      "uses whole local source context rather than treating a selection as unqualified %#",
      (before, after) => {
        const whole = `\\documentclass{article}\n\\begin{document}\n${before}Built a dashboard.${after}\n\\end{document}`;
        const line = 3 + (before.match(/\n/gu)?.length ?? 0);
        const bound = validateBuildAssistRequest(
          request({
            source: whole,
            sourceHash: createHash("sha256").update(whole).digest("hex"),
            startLine: line,
            endLine: line,
            mode,
          }),
        );
        expect(
          validateBuildSuggestion(bound, output("Created a dashboard."))
            .suggestion,
        ).toMatchObject({ operation: "advice", replacement: null });
      },
    );
    it("does not infer safety through an unknown definition outside selected context", () => {
      const whole = String.raw`\documentclass{article}
\newcommand{\custom}{Led a global team.}
\begin{document}
Built a dashboard.
\end{document}`;
      const bound = validateBuildAssistRequest(
        request({
          source: whole,
          sourceHash: createHash("sha256").update(whole).digest("hex"),
          startLine: 4,
          endLine: 4,
          mode,
        }),
      );
      expect(
        validateBuildSuggestion(
          bound,
          output(String.raw`\textbf{Built a dashboard.}`),
        ).suggestion.operation,
      ).toBe("advice");
    });
    it("does not confuse technical font-size edits with an altered business metric", () => {
      const original = String.raw`\fontsize{10}{12}\selectfont Reduced API latency by 20\%.`;
      const replacement = String.raw`\fontsize{12}{14}\selectfont Reduced API latency by 40\%.`;
      expect(
        validateBuildSuggestion(prepared(original), output(replacement))
          .suggestion.operation,
      ).toBe("advice");
    });
    it("does not relabel a structural heading as ordinary prose through formatting proof", () => {
      const original = String.raw`\section{Projects}`;
      expect(
        validateBuildSuggestion(prepared(original), output("Projects"))
          .suggestion.operation,
      ).toBe("advice");
    });
    it("retains literal URL destinations rather than only visible link labels", () => {
      const original = String.raw`\href{https://example.test/one}{Project reference}`;
      const replacement = String.raw`\href{https://example.test/two}{Project reference}`;
      expect(
        validateBuildSuggestion(prepared(original), output(replacement))
          .suggestion.operation,
      ).toBe("advice");
    });
    it("never treats a newly added comment claim as unchanged literal payload", () => {
      expect(
        validateBuildSuggestion(
          prepared("Built a dashboard."),
          output("Built a dashboard.% Led a global team."),
        ).suggestion.operation,
      ).toBe("advice");
    });
    it("abstains at bounded structural nesting rather than interpreting arbitrary expansion", () => {
      const nested = `${"\\textbf{".repeat(30)}Built a dashboard.${"}".repeat(30)}`;
      expect(
        validateBuildSuggestion(prepared("Built a dashboard."), output(nested))
          .suggestion.operation,
      ).toBe("advice");
    });
    it("does not hide source negation inside a newly introduced white text wrapper", () => {
      const original = "Never built a Python API.";
      const replacement = String.raw`\textcolor{white}{Never} built a Python API.`;
      const whole = `\\documentclass{article}\n\\usepackage{xcolor}\n\\begin{document}\n${original}\n\\end{document}`;
      const bound = validateBuildAssistRequest(
        request({
          source: whole,
          sourceHash: createHash("sha256").update(whole).digest("hex"),
          startLine: 4,
          endLine: 4,
          mode,
        }),
      );
      const proof = assessBuildFactualSupport({ ...bound, replacement });
      const response = validateBuildSuggestion(bound, output(replacement));
      expect({
        proof: proof.state,
        operation: response.suggestion.operation,
        replacement: response.suggestion.replacement,
      }).toEqual({
        proof: "clarification_required",
        operation: "advice",
        replacement: null,
      });
    });
    it.each([
      [
        String.raw`\section{Projects}` + "\nBuilt a Python API.",
        "Projects\n" + String.raw`\section{Built a Python API.}`,
      ],
      [
        String.raw`\section{Projects}` + "\nBuilt a Python API.",
        String.raw`\section{Projects Built}` + "\na Python API.",
      ],
      [
        "Built a Python API.\n\nMaintained a TypeScript service.",
        "Built a Python\n\nAPI. Maintained a TypeScript service.",
      ],
    ])(
      "binds structural starts/ends and paragraph boundaries to their payload positions %#",
      (original, replacement) => {
        const bound = prepared(original);
        const proof = assessBuildFactualSupport({ ...bound, replacement });
        const response = validateBuildSuggestion(bound, output(replacement));
        expect({
          proof: proof.state,
          operation: response.suggestion.operation,
          replacement: response.suggestion.replacement,
        }).toEqual({
          proof: "clarification_required",
          operation: "advice",
          replacement: null,
        });
      },
    );
    it("keeps an existing visibility wrapper's exact payload boundary invariant", () => {
      const original = String.raw`\textcolor{white}{Never built} a Python API.`;
      const replacement = String.raw`\textcolor{white}{Never} built a Python API.`;
      const bound = prepared(original);
      expect(assessBuildFactualSupport({ ...bound, replacement }).state).toBe(
        "clarification_required",
      );
      expect(
        validateBuildSuggestion(bound, output(replacement)).suggestion
          .operation,
      ).toBe("advice");
    });
    it("retains legitimate bold formatting inside an unchanged color scope", () => {
      const original = String.raw`\textcolor{black}{Built a Python API.}`;
      const replacement = String.raw`\textcolor{black}{\textbf{Built a Python API.}}`;
      expect(
        validateBuildSuggestion(prepared(original), output(replacement))
          .suggestion.operation,
      ).toBe("replace");
    });
    // Exact preregistered Root buildFixture, script SHA49e4ec3a1e1b74f6b0205d5c5ab336e1bb3ec42752289fea5b91f9cd57548610.
    const registeredTemplate = (qualified = false) => {
      const full = [
        "\\documentclass{article}",
        "\\begin{document}",
        "Casey Morgan",
        "casey.morgan@example.test",
        "https://example.org/casey",
        "\\section*{Projects}",
        mode === "fix"
          ? "\\textbf{Signal Dashboard"
          : "\\textbf{Signal Dashboard}",
        "\\begin{itemize}",
        "\\item Built a TypeScript dashboard; Maintained a Python API.",
        "\\end{itemize}",
        "\\textbf{Queue Worker}",
        "\\begin{itemize}",
        "\\item Built a TypeScript API.",
        "\\end{itemize}",
        "\\end{document}",
      ].join("\n");
      const source = qualified
        ? full.replace("Casey Morgan", "A colleague:\n\nCasey Morgan")
        : full;
      const line = (mode === "fix" ? 7 : 9) + (qualified ? 2 : 0);
      return validateBuildAssistRequest(
        request({
          source,
          sourceHash: createHash("sha256").update(source).digest("hex"),
          startLine: line,
          endLine: line,
          mode,
        }),
      );
    };
    it("supports the unchanged preregistered two-project article opportunity", async () => {
      const bound = registeredTemplate();
      const replacement =
        mode === "fix"
          ? "\\textbf{Signal Dashboard}"
          : "\\item Maintained a Python API; Built a TypeScript dashboard.";
      const proof = assessBuildFactualSupport({ ...bound, replacement });
      const result = validateBuildSuggestion(bound, {
        ...output(replacement),
        explanation:
          mode === "fix" ? "Closes the brace." : "Clarifies wording.",
      });
      expect(proof.state).toBe("supported");
      expect(result.suggestion).toMatchObject({
        operation: "replace",
        replacement,
      });
      expect(result.requiresFactConfirmation).toBe(mode === "resume");
      expect(
        await applyBuildSuggestion(bound.source, result, mode === "resume"),
      ).toBe(
        bound.source.slice(0, bound.startOffset) +
          replacement +
          bound.source.slice(bound.endOffset),
      );
    });
    it("retains earlier semantic scope across the same template and authored blank paragraph", () => {
      const bound = registeredTemplate(true);
      const replacement =
        mode === "fix"
          ? "\\textbf{Signal Dashboard}"
          : "\\item Maintained a Python API; Built a TypeScript dashboard.";
      const proof = assessBuildFactualSupport({ ...bound, replacement });
      const result = validateBuildSuggestion(bound, {
        ...output(replacement),
        explanation: "Clarifies wording.",
      });
      expect(proof.state).toBe(
        mode === "fix" ? "supported" : "clarification_required",
      );
      expect(result.suggestion).toMatchObject(
        mode === "fix"
          ? {
              operation: "replace",
              replacement,
            }
          : {
              operation: "advice",
              replacement: null,
            },
      );
    });
    it("allows a supported source-preserving contribution rewrite", () => {
      const result = validateBuildSuggestion(
        prepared("Built a dashboard."),
        output("Created a dashboard."),
      );
      expect(result.suggestion).toMatchObject({
        operation: "replace",
        replacement: "Created a dashboard.",
      });
    });
    it("allows a typed formatting change with exact literal metric payload", () => {
      const result = validateBuildSuggestion(
        prepared(String.raw`\textbf{Handled 5kg.}`),
        output(String.raw`\emph{Handled 5kg.}`),
      );
      expect(result.suggestion.operation).toBe("replace");
    });
    it("does not treat typed font-size arguments as business metrics", () => {
      const result = validateBuildSuggestion(
        prepared(String.raw`\fontsize{10}{12}\selectfont Built a dashboard.`),
        output(String.raw`\fontsize{12}{14}\selectfont Built a dashboard.`),
      );
      expect(result.suggestion.operation).toBe("replace");
    });
    it("allows closing a known text wrapper without changing literal payload", () => {
      const result = validateBuildSuggestion(
        prepared(String.raw`\textbf{Built a dashboard.`),
        output(String.raw`\textbf{Built a dashboard.}`),
      );
      expect(result.suggestion.operation).toBe("replace");
    });
    it("does not turn unknown macro expansion into source authority", () => {
      const result = validateBuildSuggestion(
        prepared(String.raw`\custom{Built a dashboard.}`),
        output(String.raw`\custom{Created a dashboard.}`),
      );
      expect(result.suggestion).toMatchObject({
        operation: "advice",
        replacement: null,
      });
    });
  },
);

describe("diagnosticSelection (BX-12)", () => {
  it("selects the error line with two lines either side, clamped", async () => {
    const { diagnosticSelection } = await import("../../app/lib/build-assist");
    const text = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join(
      "\n",
    );
    expect(diagnosticSelection(text, 5)).toEqual({ startLine: 3, endLine: 7 });
    expect(diagnosticSelection(text, 1)).toEqual({ startLine: 1, endLine: 3 });
    expect(diagnosticSelection(text, 10)).toEqual({
      startLine: 8,
      endLine: 10,
    });
    expect(diagnosticSelection(text, 99)).toEqual({
      startLine: 8,
      endLine: 10,
    });
  });
});
