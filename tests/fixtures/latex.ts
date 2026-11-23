import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export const SYNTHETIC_LATEX = String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[margin=20mm]{geometry}
\usepackage{titlesec,latexsym,amssymb,amsmath,enumitem,hyperref,xcolor}
\definecolor{accent}{HTML}{B5563F}
\titleformat{\section}{\large\bfseries\color{accent}}{}{0em}{}
\titlespacing{\section}{0pt}{10pt}{5pt}
\setlist[itemize]{noitemsep,leftmargin=*}
\newcommand{\entry}[2]{\textbf{#1}\hfill #2\par}
\renewcommand{\labelitemi}{\textbullet}
\pagestyle{empty}
\begin{document}
\section{First Section}
\entry{Synthetic heading}{Neutral detail}
Opening phrase before the list.
\begin{itemize}\item Stable first item.\item Stable second item.\end{itemize}
\(a^2+b^2=c^2\) and \(\alpha\in\mathbb{R}\).
\href{https://example.org/reference}{Public reference}
\newpage
\section{Second Section}
Closing phrase after the page boundary.
\end{document}
`;
export const LATEX_EXPECTED_ORDER = [
  "First Section",
  "Synthetic heading",
  "Opening phrase",
  "Stable first item",
  "Stable second item",
  "Public reference",
  "Second Section",
  "Closing phrase",
];
export async function inspectLatexPdf(bytes: Uint8Array) {
  const task = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
  });
  const document = await task.promise;
  try {
    let text = "";
    const dimensions: Array<{ width: number; height: number }> = [];
    const links: string[] = [];
    let taggedPages = 0;
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      dimensions.push({ width: viewport.width, height: viewport.height });
      const content = await page.getTextContent();
      text +=
        content.items.map((item) => ("str" in item ? item.str : "")).join(" ") +
        "\n";
      for (const annotation of await page.getAnnotations())
        if (annotation.url) links.push(annotation.url);
      if (await page.getStructTree()) taggedPages++;
    }
    return {
      pages: document.numPages,
      text: text.replace(/\s+/gu, " ").trim(),
      dimensions,
      links,
      taggedPages,
    };
  } finally {
    await document.destroy();
  }
}
