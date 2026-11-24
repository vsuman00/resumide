import { BUILD_AI_LIMITS } from "../build-assist";
import {
  assessWritingSupport,
  buildWritingSupportDocument,
} from "./writing-support";

export const BUILD_FACT_SUPPORT_POLICY = "build-factual-support/1.1.0";
const MAX_PARTS = 8192;
const MAX_DEPTH = 24;
const textWrappers = new Set([
  "textbf",
  "textit",
  "textsl",
  "textsf",
  "texttt",
  "textnormal",
  "textrm",
  "textup",
  "emph",
  "text",
  "underline",
  "fbox",
  "mbox",
  "mathrm",
  "mathbf",
  "mathit",
  "mathsf",
  "mathtt",
  "mathnormal",
  "operatorname",
]);
const declarations = new Set([
  "bfseries",
  "mdseries",
  "itshape",
  "slshape",
  "upshape",
  "sffamily",
  "rmfamily",
  "ttfamily",
  "normalfont",
  "selectfont",
  "tiny",
  "scriptsize",
  "footnotesize",
  "small",
  "normalsize",
  "large",
  "Large",
  "LARGE",
  "huge",
  "Huge",
]);
const environments = new Set([
  "document",
  "itemize",
  "enumerate",
  "center",
  "flushleft",
  "flushright",
]);
const packages = new Set([
  "amsmath",
  "amssymb",
  "amsfonts",
  "latexsym",
  "geometry",
  "hyperref",
  "enumitem",
  "xcolor",
  "titlesec",
]);
type Part = { value: string; start: number; end: number; literal: boolean };
type StructuralEvent = { kind: string; start: number; end: number };
type Projection = {
  text: string;
  parts: Part[];
  structures: StructuralEvent[];
  missingClosers: number;
  hasComments: boolean;
};
class UnsupportedTex extends Error {}

/** A closed structural reader, never a TeX interpreter or macro expander. */
function project(source: string, fragment = false): Projection {
  let cursor = 0;
  let missingClosers = 0;
  let hasComments = false;
  const parts: Part[] = [];
  const structures: StructuralEvent[] = [];
  let projectedLength = 0;
  let atLineStart = true;
  const stack: string[] = [];
  function reject(): never {
    throw new UnsupportedTex();
  }
  const add = (value: string, start: number, end: number, literal = false) => {
    if (parts.length + structures.length >= MAX_PARTS) reject();
    parts.push({ value, start, end, literal });
    projectedLength += value.length;
    for (const char of value) {
      if (char === "\n" || char === "\r") atLineStart = true;
      else if (char !== " " && char !== "\t") atLineStart = false;
    }
  };
  const boundary = (start: number, end: number) => {
    let next = cursor;
    while (source[next] === " " || source[next] === "\t") next++;
    if (!atLineStart && source[next] !== "\n" && source[next] !== "\r")
      add("\n", start, end);
  };
  const consumeListCommandPadding = (start: number) => {
    let before = start - 1;
    while (source[before] === " " || source[before] === "\t") before--;
    if (before >= 0 && source[before] !== "\n" && source[before] !== "\r")
      return;
    let after = cursor;
    while (source[after] === " " || source[after] === "\t") after++;
    // Remove the empty command line's one terminator, never an authored blank
    // paragraph. Extra raw line endings remain literal and offset-bound.
    if (source[after] === "\r")
      cursor = after + (source[after + 1] === "\n" ? 2 : 1);
    else if (source[after] === "\n") cursor = after + 1;
  };
  const structure = (kind: string, start = projectedLength, end = start) => {
    if (parts.length + structures.length >= MAX_PARTS) reject();
    const event = { kind, start, end };
    structures.push(event);
    return event;
  };
  const spaces = () => {
    while (/[ \t\r\n]/u.test(source[cursor] ?? "\0")) cursor++;
  };
  const argument = () => {
    spaces();
    if (source[cursor++] !== "{") return reject();
    const start = cursor;
    while (cursor < source.length && source[cursor] !== "}") {
      if (/[{}\\%]/u.test(source[cursor]) || source.charCodeAt(cursor) < 32)
        reject();
      cursor++;
    }
    if (source[cursor++] !== "}") return reject();
    return { value: source.slice(start, cursor - 1), start, end: cursor - 1 };
  };
  const option = () => {
    spaces();
    if (source[cursor] !== "[") return "";
    const start = ++cursor;
    while (cursor < source.length && source[cursor] !== "]") {
      if (/[\[{}\\%]/u.test(source[cursor]) || source.charCodeAt(cursor) < 32)
        reject();
      cursor++;
    }
    if (source[cursor++] !== "]") return reject();
    return source.slice(start, cursor - 1);
  };
  const body = (depth: number, grouped: boolean) => {
    if (depth > MAX_DEPTH) reject();
    while (cursor < source.length) {
      const start = cursor;
      const char = source[cursor];
      if (char === "}") {
        if (!grouped) reject();
        cursor++;
        return;
      }
      if (char === "{") {
        cursor++;
        body(depth + 1, true);
        continue;
      }
      if (char === "%") {
        while (cursor < source.length && !/[\r\n]/u.test(source[cursor]))
          cursor++;
        hasComments = true;
        structure(`comment:${source.slice(start, cursor)}`);
        continue;
      }
      if ("$&#_^".includes(char)) reject();
      if (char === "~") {
        cursor++;
        add(" ", start, cursor);
        continue;
      }
      if (char !== "\\") {
        while (cursor < source.length && !/[\\{}%$&#_^~]/u.test(source[cursor]))
          cursor++;
        const value = source.slice(start, cursor);
        const paragraphs = /\r?\n[ \t]*\r?\n/gu;
        for (
          let match = paragraphs.exec(value);
          match;
          match = paragraphs.exec(value)
        )
          structure(
            "paragraph",
            projectedLength + match.index,
            projectedLength + match.index + match[0].length,
          );
        add(value, start, cursor, true);
        continue;
      }
      cursor++;
      const escaped = source[cursor];
      if (!escaped) reject();
      if ("%&#_${}".includes(escaped)) {
        cursor++;
        add(escaped, start, cursor);
        continue;
      }
      if (escaped === "\\") {
        cursor++;
        structure("line_break");
        add("\n", start, cursor);
        continue;
      }
      if (/[ ,;:!]/u.test(escaped)) {
        cursor++;
        add(" ", start, cursor);
        continue;
      }
      const match = /^[A-Za-z]+/u.exec(source.slice(cursor));
      if (!match) reject();
      const name = match[0];
      cursor += name.length;
      const starred = source[cursor] === "*";
      if (starred) cursor++;
      spaces();
      if (textWrappers.has(name)) {
        if (starred || source[cursor++] !== "{") reject();
        body(depth + 1, true);
      } else if (declarations.has(name)) {
        if (starred) reject();
      } else if (name === "fontsize") {
        if (starred) reject();
        for (let count = 0; count < 2; count++) {
          const value = argument().value;
          if (
            !/^\d{1,2}(?:\.\d{1,2})?(?:pt)?$/u.test(value) ||
            Number.parseFloat(value) < 1 ||
            Number.parseFloat(value) > 96
          )
            reject();
        }
      } else if (name === "hspace" || name === "vspace") {
        const value = argument().value;
        if (!/^[+-]?\d{1,2}(?:\.\d{1,3})?(?:pt|em|ex|mm|cm|in)$/u.test(value))
          reject();
      } else if (name === "textcolor" || name === "colorbox") {
        const color = argument().value;
        if (starred || !/^[A-Za-z]{1,24}$/u.test(color)) reject();
        const event = structure(`visibility:${name}:${color}`);
        spaces();
        if (source[cursor++] !== "{") reject();
        body(depth + 1, true);
        event.end = projectedLength;
      } else if (
        name === "section" ||
        name === "subsection" ||
        name === "subsubsection"
      ) {
        const event = structure(name);
        boundary(start, cursor);
        if (source[cursor++] !== "{") reject();
        body(depth + 1, true);
        event.end = projectedLength;
        boundary(cursor, cursor);
      } else if (name === "item") {
        if (starred || source[cursor] === "[") reject();
        structure("item");
        boundary(start, cursor);
        add("- ", start, cursor);
      } else if (name === "begin" || name === "end") {
        const env = argument().value;
        if (starred || !environments.has(env)) reject();
        structure(`${name}:${env}`);
        if (name === "begin" && (env === "itemize" || env === "enumerate")) {
          consumeListCommandPadding(start);
          boundary(start, cursor);
        } else {
          // End-list retains its typed block break between complete entries.
          add("\n", start, cursor);
        }
        if (!fragment) {
          if (name === "begin") {
            if (stack.length >= MAX_DEPTH) reject();
            stack.push(env);
          } else if (stack.pop() !== env) reject();
        }
      } else if (name === "documentclass") {
        const opts = option()
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
        if (
          starred ||
          argument().value !== "article" ||
          opts.some(
            (v) =>
              ![
                "10pt",
                "11pt",
                "12pt",
                "a4paper",
                "letterpaper",
                "oneside",
                "twoside",
              ].includes(v),
          )
        )
          reject();
        structure(
          `class:article:${opts.filter((v) => !/^\d+pt$/u.test(v)).join(",")}`,
        );
      } else if (name === "usepackage") {
        const opts = option();
        const names = argument()
          .value.split(",")
          .map((v) => v.trim());
        if (
          starred ||
          !/^[A-Za-z0-9,=.+* -]*$/u.test(opts) ||
          names.some((v) => !packages.has(v))
        )
          reject();
        structure(`package:${names.join(",")}:${opts}`);
      } else if (name === "url" || name === "href") {
        const url = argument();
        if (starred || !/^(?:https?:\/\/|mailto:)[^\s<>]+$/u.test(url.value))
          reject();
        add(url.value, url.start, url.end);
        add(" ", cursor, cursor);
        if (name === "href") {
          spaces();
          if (source[cursor++] !== "{") reject();
          body(depth + 1, true);
        }
      } else reject();
    }
    if (grouped) {
      if (!fragment || ++missingClosers > 8) reject();
    }
  };
  body(0, false);
  if (stack.length) reject();
  const text = parts.map((part) => part.value).join("");
  // Bind events to canonical payload positions in one pass. Raw source offsets
  // or an unpositioned list cannot prove that a heading still owns the same text.
  // Whitespace-only wrapping stays neutral; Unicode positions count code points.
  const positions = new Uint32Array(text.length + 1);
  let length = 0;
  let pendingSpace = false;
  for (let index = 0; index < text.length;) {
    const width = text.codePointAt(index)! > 0xffff ? 2 : 1;
    if (/\s/u.test(text.slice(index, index + width))) pendingSpace = length > 0;
    else {
      if (pendingSpace) length++;
      length++;
      pendingSpace = false;
    }
    if (width === 2) positions[index + 1] = positions[index];
    positions[index + width] = length;
    index += width;
  }
  return {
    text,
    parts,
    structures: structures.map((event) => ({
      kind: event.kind,
      start: positions[event.start],
      end: positions[event.end],
    })),
    missingClosers,
    hasComments,
  };
}
function canonical(text: string) {
  return text.replace(/\r\n?/gu, "\n").replace(/\s+/gu, " ").trim();
}
function selectedProjection(
  projection: Projection,
  start: number,
  end: number,
) {
  let before = "",
    selected = "",
    after = "";
  for (const part of projection.parts) {
    if (part.end <= start) before += part.value;
    else if (part.start >= end) after += part.value;
    else if (part.start >= start && part.end <= end) selected += part.value;
    else {
      if (!part.literal || part.value.length !== part.end - part.start)
        return null;
      const from = Math.max(0, start - part.start),
        to = Math.min(part.value.length, end - part.start);
      before += part.value.slice(0, from);
      selected += part.value.slice(from, to);
      after += part.value.slice(to);
    }
  }
  return { before, selected, after };
}
export type BuildFactualSupport =
  | {
      state: "supported";
      kind: "literal_formatting" | "source_transformation" | "command_repair";
    }
  | { state: "clarification_required" };

const COMMAND = /\\[A-Za-z]+\*?/gu;
function editDistance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        row[j] + 1,
        next[j - 1] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[b.length];
}
/**
 * A misspelled command renamed to a known text wrapper (\textbff -> \textbf).
 * Every non-command character is identical, so no words, numbers or braces change.
 */
function isCommandTypoRepair(original: string, replacement: string) {
  if (original.replace(COMMAND, "\0") !== replacement.replace(COMMAND, "\0"))
    return false;
  const before = original.match(COMMAND) ?? [];
  const after = replacement.match(COMMAND) ?? [];
  let changed = 0;
  for (let i = 0; i < before.length; i++) {
    if (before[i] === after[i]) continue;
    const name = after[i].slice(1).replace(/\*$/u, "");
    if (!textWrappers.has(name) || editDistance(before[i], after[i]) > 2)
      return false;
    changed++;
  }
  return changed > 0;
}

/** Full-buffer projection stays local; only the existing selected payload goes to AI. */
export function assessBuildFactualSupport(input: {
  source: string;
  startOffset: number;
  endOffset: number;
  originalText: string;
  replacement: string;
}): BuildFactualSupport {
  const abstain = { state: "clarification_required" } as const;
  if (
    input.source.length > BUILD_AI_LIMITS.sourceBytes ||
    input.originalText.length > BUILD_AI_LIMITS.selectedChars ||
    input.replacement.length > BUILD_AI_LIMITS.replacementChars ||
    input.source.slice(input.startOffset, input.endOffset) !==
      input.originalText
  )
    return abstain;
  try {
    if (isCommandTypoRepair(input.originalText, input.replacement)) {
      // Only when the original is unreadable (an unknown command) and the result is readable.
      let unreadable = false;
      try {
        project(input.originalText, true);
      } catch (error) {
        if (!(error instanceof UnsupportedTex)) throw error;
        unreadable = true;
      }
      if (!unreadable) return abstain;
      project(input.replacement, true);
      project(
        input.source.slice(0, input.startOffset) +
          input.replacement +
          input.source.slice(input.endOffset),
      );
      return { state: "supported", kind: "command_repair" };
    }
    const from = project(input.originalText, true),
      to = project(input.replacement);
    if (
      to.missingClosers ||
      JSON.stringify(from.structures) !== JSON.stringify(to.structures)
    )
      return abstain;
    // Only known closing-group repair at the selected EOF is modeled. No raw
    // prefix rescue, arbitrary macro expansion or semantic deletion is admitted.
    const repaired =
      input.source.slice(0, input.endOffset) +
      "}".repeat(from.missingClosers) +
      input.source.slice(input.endOffset);
    const full = project(repaired);
    const candidate =
      input.source.slice(0, input.startOffset) +
      input.replacement +
      input.source.slice(input.endOffset);
    project(candidate);
    const range = selectedProjection(
      full,
      input.startOffset,
      input.endOffset + from.missingClosers,
    );
    if (!range || canonical(range.selected) !== canonical(from.text))
      return abstain;
    if (canonical(from.text) === canonical(to.text))
      return { state: "supported", kind: "literal_formatting" };
    if (
      from.hasComments ||
      to.hasComments ||
      full.hasComments ||
      !from.text.trim() ||
      !to.text.trim()
    )
      return abstain;
    const document = buildWritingSupportDocument(
      range.before + range.selected + range.after,
    );
    const support = assessWritingSupport(document, {
      kind: "rewrite",
      original: range.selected,
      proposed: to.text,
    });
    return support.state === "supported"
      ? { state: "supported", kind: "source_transformation" }
      : abstain;
  } catch (error) {
    if (
      error instanceof UnsupportedTex ||
      (error instanceof Error && /^WRITING_SUPPORT_/u.test(error.message))
    )
      return abstain;
    throw error;
  }
}
const guidance = new Set([
  "A bounded wording edit.",
  "Clearer.",
  "Clarifies wording.",
  "Clarifies the contribution.",
  "Clarifies the existing contribution.",
  "Preserves the source facts.",
  "Adjusts formatting.",
  "Adjusts font size.",
  "Closes the brace.",
  "Closes the missing brace.",
  "Adds the missing closing brace.",
  "No edit is needed.",
  "No changes are needed.",
]);
const questions = new Set([
  "What evidence supports this?",
  "Which source facts should this preserve?",
  "Can you clarify the selected source?",
]);
export function hasSupportedBuildGuidance(
  explanation: string,
  requestedQuestions: string[],
) {
  return (
    guidance.has(explanation.trim()) &&
    requestedQuestions.every((question) => questions.has(question.trim()))
  );
}
