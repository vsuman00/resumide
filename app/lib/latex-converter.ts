export const LATEX_POLICY_VERSION = "latex-source/1.0.0";
export const LATEX_LIMITS = Object.freeze({
  sourceBytes: 49_152,
  pdfBytes: 5_242_880,
  pages: 10,
  timeoutMs: 20_000,
  concurrency: 2,
});
export type LatexProfile = "early-career" | "experienced" | "document";
export type LatexInput = { source: string; profile: LatexProfile };
export const LATEX_EXAMPLES: ReadonlyArray<{
  id: LatexProfile;
  label: string;
  description: string;
}> = [
  {
    id: "early-career",
    label: "Early career",
    description: "Education, projects and skills.",
  },
  {
    id: "experienced",
    label: "Experienced",
    description: "Experience, selected work and education.",
  },
  {
    id: "document",
    label: "General document",
    description: "Headings, lists and mathematical notation.",
  },
];
export function getLatexExample(
  profile: LatexProfile,
  paperSize: "A4" | "LETTER",
) {
  const body =
    profile === "document"
      ? String.raw`\section{A short document}
This is a neutral example. Replace this text with your own content.
\subsection{A useful identity}
\[ a^2 + b^2 = c^2 \]
\begin{itemize}
\item Write your content in the editor.
\item Recompile to update the PDF.
\end{itemize}`
      : profile === "experienced"
        ? String.raw`\section{Experience}
\entry{Example role}{Example organization}
\begin{itemize}
\item Describe your work using facts you can support.
\end{itemize}
\section{Selected work}
Describe a relevant project and your contribution.
\section{Education}
Add your qualification and institution.`
        : String.raw`\section{Education}
\entry{Example qualification}{Example institution}
\section{Projects}
\begin{itemize}
\item Describe a project, your contribution and the outcome.
\end{itemize}
\section{Skills}
List skills you can demonstrate.`;
  return String.raw`\documentclass[11pt,${paperSize === "A4" ? "a4paper" : "letterpaper"}]{article}
\usepackage[margin=0.8in]{geometry}
\usepackage{titlesec,enumitem,hyperref,xcolor,amsmath,amssymb,latexsym}
\definecolor{accent}{HTML}{B5563F}
\titleformat{\section}{\large\bfseries\color{accent}}{}{0em}{}
\titlespacing{\section}{0pt}{12pt}{6pt}
\setlist[itemize]{noitemsep,leftmargin=*}
\newcommand{\entry}[2]{\textbf{#1}\hfill #2\par}
\pagestyle{empty}
\begin{document}
${body}
\end{document}
`;
}
