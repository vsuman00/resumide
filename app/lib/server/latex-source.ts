import { createHash } from "node:crypto";
import {
  LATEX_LIMITS,
  LATEX_POLICY_VERSION,
  type LatexProfile,
} from "../latex-converter";

export type PreparedLatexDocument = {
  source: string;
  sourceHash: string;
  policyVersion: string;
  profile: LatexProfile;
};
export type LatexSourceCode =
  | "source_invalid"
  | "source_too_large"
  | "source_unsupported"
  | "source_unsafe";
const messages: Record<LatexSourceCode, string> = {
  source_invalid: "Provide one complete LaTeX article document.",
  source_too_large: "The LaTeX source exceeds the supported size.",
  source_unsupported: "The document uses an unsupported class or package.",
  source_unsafe:
    "The source contains a prohibited operation or control character.",
};
export class LatexSourceError extends Error {
  constructor(public readonly code: LatexSourceCode) {
    super(messages[code]);
    this.name = "LatexSourceError";
  }
}
export const LATEX_PACKAGES = Object.freeze([
  "titlesec",
  "latexsym",
  "amssymb",
  "amsmath",
  "enumitem",
  "geometry",
  "hyperref",
  "xcolor",
]);
export const LATEX_PACKAGE_OPTIONS: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({
  titlesec: ["compact", "explicit", "nostruts"],
  latexsym: [],
  amssymb: [],
  amsmath: [
    "fleqn",
    "leqno",
    "intlimits",
    "nointlimits",
    "sumlimits",
    "nosumlimits",
    "namelimits",
    "nonamelimits",
    "tbtags",
    "centertags",
  ],
  enumitem: ["inline", "shortlabels", "ignoredisplayed", "loadonly"],
  geometry: [
    "a4paper",
    "letterpaper",
    "paper",
    "margin",
    "left",
    "right",
    "top",
    "bottom",
    "hmargin",
    "vmargin",
    "includehead",
    "includefoot",
    "nohead",
    "nofoot",
    "headheight",
    "headsep",
    "footskip",
    "width",
    "height",
    "textwidth",
    "textheight",
    "scale",
    "hscale",
    "vscale",
    "centering",
    "hcentering",
    "vcentering",
    "bindingoffset",
    "heightrounded",
    "showframe",
    "showcrop",
    "pass",
  ],
  hyperref: [
    "hidelinks",
    "colorlinks",
    "linkcolor",
    "urlcolor",
    "citecolor",
    "pdfauthor",
    "pdftitle",
    "pdfsubject",
    "pdfkeywords",
    "unicode",
    "bookmarks",
    "bookmarksopen",
    "bookmarksnumbered",
    "pdfborder",
    "breaklinks",
  ],
  xcolor: ["dvipsnames", "svgnames", "x11names", "monochrome"],
});
function fail(code: LatexSourceCode): never {
  throw new LatexSourceError(code);
}
// Admission only. Macro expansion is programmable; OS confinement is mandatory.
function withoutComments(source: string) {
  let result = "";
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\\") {
      result += source[i];
      if (i + 1 < source.length) result += source[++i];
    } else if (source[i] === "%") {
      while (i < source.length && source[i] !== "\n") i++;
      result += "\n";
    } else result += source[i];
  }
  return result;
}
export function prepareLatexDocument(raw: unknown): PreparedLatexDocument {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    fail("source_invalid");
  const input = raw as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => !["source", "profile"].includes(key)) ||
    typeof input.source !== "string" ||
    typeof input.profile !== "string" ||
    !["early-career", "experienced", "document"].includes(input.profile)
  )
    fail("source_invalid");
  const source = input.source as string;
  if (Buffer.byteLength(source, "utf8") > LATEX_LIMITS.sourceBytes)
    fail("source_too_large");
  if (!source.trim()) fail("source_invalid");
  // Reject invalid UTF-16 rather than silently changing bytes during UTF-8 encoding.
  if (
    Buffer.from(source, "utf8").toString("utf8") !== source ||
    Array.from(source).some((char) => {
      const n = char.codePointAt(0)!;
      return (
        (n < 32 && n !== 9 && n !== 10 && n !== 13) ||
        (n >= 127 && n <= 159) ||
        (n >= 0x200b && n <= 0x200f) ||
        (n >= 0x202a && n <= 0x202e) ||
        (n >= 0x2060 && n <= 0x206f) ||
        n === 0xfeff
      );
    }) ||
    source.includes("^^")
  )
    fail("source_unsafe");
  const code = withoutComments(source);
  if (
    /\\(?:input|include|includeonly|includegraphics|font|openin|openout|read|write|immediate|special|directlua|luaexec|catcode|csname|endcsname|scantokens|everyjob|everyeof|readline|usepackagewithoptions|RequirePackage|LoadClass|documentclasswithoptions|bibliography|addbibresource|href@|pdfobj|pdfcatalog|pdfextension)(?![A-Za-z])/.test(
      code,
    )
  )
    fail("source_unsafe");
  const classes = [
    ...code.matchAll(/\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^{}]*)\}/g),
  ];
  if (
    classes.length !== 1 ||
    classes[0][2] !== "article" ||
    !/^\s*\\documentclass\b/.test(code)
  )
    fail("source_unsupported");
  if (
    (classes[0][1] ?? "")
      .split(",")
      .some(
        (o) =>
          o.trim() &&
          ![
            "10pt",
            "11pt",
            "12pt",
            "a4paper",
            "letterpaper",
            "oneside",
            "final",
          ].includes(o.trim()),
      )
  )
    fail("source_unsupported");
  if (
    [...code.matchAll(/\\begin\s*\{document\}/g)].length !== 1 ||
    [...code.matchAll(/\\end\s*\{document\}/g)].length !== 1 ||
    !/\\end\s*\{document\}\s*$/.test(code)
  )
    fail("source_invalid");
  const begin = code.search(/\\begin\s*\{document\}/);
  if (begin < classes[0].index!) fail("source_invalid");
  const packages = [
    ...code.matchAll(/\\usepackage\s*(?:\[([^\]]*)\])?\s*\{([^{}]*)\}/g),
  ];
  if ([...code.matchAll(/\\usepackage\b/g)].length !== packages.length)
    fail("source_unsupported");
  for (const match of packages) {
    if (
      match.index! > begin ||
      match[2].split(",").some((p) => !LATEX_PACKAGES.includes(p.trim()))
    )
      fail("source_unsupported");
    const packageNames = match[2].split(",").map((name) => name.trim());
    for (const option of (match[1] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)) {
      const key = option.split("=")[0].trim();
      if (
        !packageNames.every((name) =>
          LATEX_PACKAGE_OPTIONS[name]?.includes(key),
        )
      )
        fail("source_unsupported");
      if (/[\/]/.test(option)) fail("source_unsupported");
    }
    // Options are TeX input too; control sequences/file paths are not supported here.
    if (
      /[\\{}]|(?:^|[,=\s])(?:file|pdfjavascript|pdfstartpage|pdfstartview|pdfpagemode|driver|dvips|dvipdfm|dvipdfmx|luatex|pdftex)(?:[,=\s]|$)/i.test(
        match[1] ?? "",
      )
    )
      fail("source_unsupported");
  }
  for (const link of code.matchAll(/\\(?:href|url)\s*\{([^{}]*)\}/g)) {
    const value = link[1];
    if (/[\\\s<>]/u.test(value) || !/^(https?:\/\/|mailto:)/i.test(value))
      fail("source_unsafe");
    try {
      const url = new URL(value);
      if (
        url.username ||
        url.password ||
        !["http:", "https:", "mailto:"].includes(url.protocol)
      )
        fail("source_unsafe");
    } catch {
      fail("source_unsafe");
    }
  }
  return {
    source,
    sourceHash: createHash("sha256").update(source, "utf8").digest("hex"),
    policyVersion: LATEX_POLICY_VERSION,
    profile: input.profile as LatexProfile,
  };
}
export function validatePreparedLatexDocument(
  raw: unknown,
): PreparedLatexDocument {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    fail("source_invalid");
  const data = raw as Record<string, unknown>;
  if (
    Object.keys(data).sort().join(",") !==
    "policyVersion,profile,source,sourceHash"
  )
    fail("source_invalid");
  const prepared = prepareLatexDocument({
    source: data.source,
    profile: data.profile,
  });
  if (
    prepared.sourceHash !== data.sourceHash ||
    prepared.policyVersion !== data.policyVersion
  )
    fail("source_invalid");
  return prepared;
}
