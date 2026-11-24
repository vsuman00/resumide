import type { LatexDiagnostic, LatexDiagnosticKind } from "./latex-converter";

// Fixed copy per kind: the server never sends compiler text, so the UI owns every word.
export const LATEX_DIAGNOSTIC_TEXT: Record<
  LatexDiagnosticKind,
  { label: string; title: string; help: string }
> = {
  undefined_command: {
    label: "undefined command",
    title: "Undefined command",
    help: "check the spelling or remove it",
  },
  missing_brace: {
    label: "missing brace",
    title: "Missing or extra brace",
    help: "make sure every { has a matching }",
  },
  missing_package: {
    label: "missing package",
    title: "Package not available",
    help: "remove the package or use one Build supports",
  },
  environment_mismatch: {
    label: "environment mismatch",
    title: "Environment mismatch",
    help: "each \\begin{…} needs a matching \\end{…}",
  },
  overfull_box: {
    label: "line too wide",
    title: "Line too wide",
    help: "shorten the text or allow a line break",
  },
  other: {
    label: "compile error",
    title: "Compile error",
    help: "review this line and the lines just above it",
  },
};

export function describeDiagnostic(diagnostic: LatexDiagnostic): string {
  const where = diagnostic.line ? ` on line ${diagnostic.line}` : "";
  return `${diagnostic.severity === "error" ? "Error" : "Warning"}${where}: ${LATEX_DIAGNOSTIC_TEXT[diagnostic.kind].label}`;
}
