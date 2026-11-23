import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  LATEX_LIMITS,
  LATEX_POLICY_VERSION,
  getLatexExample,
} from "../../app/lib/latex-converter";
import {
  prepareLatexDocument,
  validatePreparedLatexDocument,
} from "../../app/lib/server/latex-source";

const document = String.raw`\documentclass[a4paper,11pt]{article}
\usepackage{titlesec,latexsym,amssymb,amsmath,enumitem,geometry,hyperref,xcolor}
\geometry{margin=20mm}
\newcommand{\itemline}[1]{\item \textbf{#1}}
\renewcommand{\labelitemi}{\textbullet}
\titleformat{\section}{\large\bfseries}{}{0pt}{}
\titlespacing{\section}{0pt}{8pt}{4pt}
\begin{document}
\section{Synthetic Document}
First sentence. \(a^2+b^2=c^2\).
\begin{itemize}[leftmargin=*]\itemline{Neutral example}\end{itemize}
\href{https://example.org/path?q=one}{Reference}
\end{document}
`;
const input = (source = document) => ({ source, profile: "document" });

describe("standalone LaTeX source admission", () => {
  it("preserves accepted macro/math/layout source byte for byte and binds its hash", () => {
    const prepared = prepareLatexDocument(input());
    expect(prepared.source).toBe(document);
    expect(prepared.sourceHash).toBe(
      createHash("sha256").update(document, "utf8").digest("hex"),
    );
    expect(prepared.policyVersion).toBe(LATEX_POLICY_VERSION);
    expect(prepared.profile).toBe("document");
    expect(prepareLatexDocument(input())).toEqual(prepared);
    expect(validatePreparedLatexDocument(prepared)).toEqual(prepared);
  });

  it.each(["early-career", "experienced", "document"] as const)(
    "admits the %s example on both supported papers without injecting a preamble",
    (profile) => {
      for (const paper of ["A4", "LETTER"] as const) {
        const source = getLatexExample(profile, paper);
        const prepared = prepareLatexDocument({ source, profile });
        expect(prepared.source).toBe(source);
      }
    },
  );

  it("retains comments, escaped percent signs, braces and CRLF content", () => {
    const source = String.raw`\documentclass{article}
% harmless comment containing unsupported literal \input
\begin{document}Escaped \% \& \# \_ \{ \} and text.\end{document}
`.replaceAll("\n", "\r\n");
    expect(prepareLatexDocument(input(source)).source).toBe(source);
  });

  it.each([
    null,
    [],
    {},
    { source: 5, profile: "document" },
    { source: document, profile: "unknown" },
    { source: document, profile: ["document"] },
    { source: document, profile: "document", imageId: "attacker" },
    { source: document, profile: "document", pageSize: "A4" },
    { source: "", profile: "document" },
  ])("rejects invalid or unknown input metadata: %j", (raw) => {
    expect(() => prepareLatexDocument(raw)).toThrow();
  });

  it.each([
    String.raw`\input{/etc/passwd}`,
    String.raw`\include{other}`,
    String.raw`\openin1=/etc/passwd`,
    String.raw`\openout1=leak`,
    String.raw`\write18{touch marker}`,
    String.raw`\immediate\write18{touch marker}`,
    String.raw`\read1 to\data`,
    String.raw`\catcode64=11`,
    String.raw`\csname input\endcsname{/etc/passwd}`,
    String.raw`\special{psfile=/etc/passwd}`,
    String.raw`\directlua{os.execute('id')}`,
    String.raw`\usepackage{shellesc}`,
    String.raw`\usepackage{../../outside}`,
    String.raw`\usepackage{graphicx}`,
    String.raw`\href{javascript:alert(1)}{bad}`,
    String.raw`\href{file:///etc/passwd}{bad}`,
    String.raw`\href{data:text/html,test}{bad}`,
    "^^5cinput{/etc/passwd}",
    "bidi\u202etext",
    "nul\u0000text",
  ])(
    "rejects directly unsafe or unsupported syntax without reflecting it",
    (payload) => {
      const source =
        String.raw`\documentclass{article}\begin{document}` +
        payload +
        String.raw`\end{document}`;
      expect(() => prepareLatexDocument(input(source))).toThrow();
      try {
        prepareLatexDocument(input(source));
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain(payload);
        expect((error as Error).message).not.toContain("/etc/passwd");
      }
    },
  );

  it.each([
    String.raw`\documentclass{book}\begin{document}Text\end{document}`,
    String.raw`\documentclass{article}\begin{document}Missing end`,
    String.raw`\documentclass{article}\begin{document}One\end{document}\begin{document}Two\end{document}`,
  ])("rejects unsupported or incomplete document structure", (source) => {
    expect(() => prepareLatexDocument(input(source))).toThrow();
  });

  it("enforces a UTF-8 byte cap and exposes fixed safe errors", () => {
    const source = document + " ".repeat(LATEX_LIMITS.sourceBytes);
    expect(() => prepareLatexDocument(input(source))).toThrow();
    expect(() => prepareLatexDocument(input(source))).toThrowError(
      expect.objectContaining({ code: "source_too_large" }),
    );
  });
  it.each([
    "unknownoption",
    "input=/etc/passwd",
    "driver=xetex",
    String.raw`margin=\unsafe`,
  ])("rejects unsupported package option %s", (option) => {
    const source =
      String.raw`\documentclass{article}\usepackage[` +
      option +
      String.raw`]{geometry}\begin{document}Neutral\end{document}`;
    expect(() => prepareLatexDocument(input(source))).toThrowError(
      expect.objectContaining({ code: "source_unsupported" }),
    );
  });

  it.each(["source", "sourceHash", "policyVersion", "profile", "extra"])(
    "rejects prepared-document tampering of %s",
    (key) => {
      const prepared = prepareLatexDocument(input());
      const forged = {
        ...prepared,
        [key]: key === "source" ? document + "% changed" : "changed",
      };
      expect(() => validatePreparedLatexDocument(forged)).toThrow();
    },
  );
});
