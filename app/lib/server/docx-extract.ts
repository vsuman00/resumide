// Hardened DOCX reader with the same parse-health findings as the PDF path (ATS-13).
// Pure function over bytes: no network, no file system, no macro or object execution.
// Upload and storage integration is blocked on owner decision ATS-D5 (database check).
import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";

export const DOCX_READER_VERSION = "docx-reader/1.0.0";
export const DOCX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const DOCX_LIMITS = Object.freeze({
  compressedBytes: 5 * 1024 * 1024,
  entries: 200,
  entryBytes: 8 * 1024 * 1024,
  totalBytes: 24 * 1024 * 1024,
  ratio: 120,
  characters: 400_000,
});

export type DocxErrorCode =
  | "NOT_DOCX"
  | "OVERSIZED"
  | "ZIP_BOMB"
  | "MACROS"
  | "EXTERNAL_CONTENT"
  | "UNSAFE_XML"
  | "EMPTY_TEXT";
export class DocxError extends Error {
  constructor(public readonly code: DocxErrorCode) {
    super(code);
    this.name = "DocxError";
  }
}

export interface DocxReadResult {
  version: string;
  text: string;
  paragraphs: number;
  tables: number;
  textBoxes: number;
  images: number;
  headerFooterText: string[];
  hyperlinks: { text: string; target: string }[];
  hiddenTextRuns: number;
}

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: false,
  trimValues: false,
  parseTagValue: false,
});

type Node = Record<string, unknown>;
const tagOf = (n: Node) =>
  Object.keys(n).find((k) => k !== ":@" && k !== "#text") ?? "";
const attrs = (n: Node) => (n[":@"] ?? {}) as Record<string, string>;
const kids = (n: Node): Node[] => {
  const v = n[tagOf(n)];
  return Array.isArray(v) ? (v as Node[]) : [];
};

function parseXml(bytes: Uint8Array): Node[] {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  // Entity declarations and external subsets are the classic XML attack surface.
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new DocxError("UNSAFE_XML");
  return parser.parse(text) as Node[];
}

function walk(
  nodes: Node[],
  visit: (node: Node, depth: number) => void,
  depth = 0,
) {
  for (const node of nodes) {
    visit(node, depth);
    walk(kids(node), visit, depth + 1);
  }
}

interface Walk {
  paragraphs: string[];
  tables: number;
  textBoxes: number;
  images: number;
  hidden: number;
  links: { id: string; text: string }[];
}
function readBody(root: Node[]): Walk {
  const out: Walk = {
    paragraphs: [],
    tables: 0,
    textBoxes: 0,
    images: 0,
    hidden: 0,
    links: [],
  };
  const paragraph = (p: Node) => {
    let text = "";
    const run = (r: Node, inLink?: { text: string }) => {
      const props = kids(r).find((c) => tagOf(c) === "w:rPr");
      const color = props && kids(props).find((c) => tagOf(c) === "w:color");
      const white =
        color && /^(?:ffffff|fff)$/i.test(attrs(color)["@_w:val"] ?? "");
      const vanish = props && kids(props).some((c) => tagOf(c) === "w:vanish");
      let piece = "";
      for (const c of kids(r)) {
        const tag = tagOf(c);
        if (tag === "w:t")
          piece += kids(c)
            .map((t) => String(t["#text"] ?? ""))
            .join("");
        else if (tag === "w:tab") piece += "\t";
        else if (tag === "w:br") piece += "\n";
        else if (tag === "w:drawing" || tag === "w:pict") out.images++;
      }
      if (piece.trim() && (white || vanish)) out.hidden++;
      text += piece;
      if (inLink) inLink.text += piece;
    };
    for (const child of kids(p)) {
      const tag = tagOf(child);
      if (tag === "w:r") run(child);
      else if (tag === "w:hyperlink") {
        const link = { text: "" };
        for (const r of kids(child)) if (tagOf(r) === "w:r") run(r, link);
        out.links.push({ id: attrs(child)["@_r:id"] ?? "", text: link.text });
      }
    }
    return text;
  };
  walk(root, (node) => {
    const tag = tagOf(node);
    if (tag === "w:tbl") out.tables++;
    else if (tag === "w:txbxContent") out.textBoxes++;
  });
  const emit = (nodes: Node[], inBox: boolean) => {
    for (const node of nodes) {
      const tag = tagOf(node);
      if (tag === "w:p") {
        const text = paragraph(node);
        if (text.trim() && !inBox) out.paragraphs.push(text);
      } else if (tag === "w:txbxContent") emit(kids(node), true);
      else emit(kids(node), inBox);
    }
  };
  emit(root, false);
  return out;
}

export function readDocx(bytes: Uint8Array): DocxReadResult {
  if (bytes.byteLength > DOCX_LIMITS.compressedBytes)
    throw new DocxError("OVERSIZED");
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b))
    throw new DocxError("NOT_DOCX");
  let total = 0;
  let count = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter(file) {
        count++;
        total += file.originalSize;
        if (count > DOCX_LIMITS.entries) throw new DocxError("ZIP_BOMB");
        if (
          file.originalSize > DOCX_LIMITS.entryBytes ||
          total > DOCX_LIMITS.totalBytes
        )
          throw new DocxError("ZIP_BOMB");
        if (file.size > 0 && file.originalSize / file.size > DOCX_LIMITS.ratio)
          throw new DocxError("ZIP_BOMB");
        // Only the parts that carry text, structure and links are inflated.
        return /^(?:\[Content_Types\]\.xml|word\/(?:(?:document|header\d*|footer\d*)\.xml|_rels\/document\.xml\.rels)|word\/vbaProject\.bin|word\/embeddings\/.*|word\/media\/.*)$/i.test(
          file.name,
        );
      },
    });
  } catch (error) {
    if (error instanceof DocxError) throw error;
    throw new DocxError("NOT_DOCX");
  }
  const names = Object.keys(files);
  if (!files["word/document.xml"] || !files["[Content_Types].xml"])
    throw new DocxError("NOT_DOCX");
  if (
    names.some((n) => /vbaProject\.bin$/i.test(n)) ||
    /macroEnabled/i.test(new TextDecoder().decode(files["[Content_Types].xml"]))
  )
    throw new DocxError("MACROS");
  if (names.some((n) => /^word\/embeddings\//i.test(n)))
    throw new DocxError("EXTERNAL_CONTENT");

  const relationships = new Map<
    string,
    { target: string; external: boolean; type: string }
  >();
  if (files["word/_rels/document.xml.rels"]) {
    walk(parseXml(files["word/_rels/document.xml.rels"]), (node) => {
      if (tagOf(node) !== "Relationship") return;
      const a = attrs(node);
      relationships.set(a["@_Id"], {
        target: a["@_Target"] ?? "",
        external: a["@_TargetMode"] === "External",
        type: a["@_Type"] ?? "",
      });
    });
  }
  // External content other than ordinary hyperlinks is never followed and is refused.
  for (const rel of relationships.values())
    if (rel.external && !/\/hyperlink$/.test(rel.type))
      throw new DocxError("EXTERNAL_CONTENT");

  const body = readBody(parseXml(files["word/document.xml"]));
  const headerFooterText = names
    .filter((n) => /^word\/(?:header|footer)\d*\.xml$/i.test(n))
    .flatMap((n) => readBody(parseXml(files[n])).paragraphs)
    .map((t) => t.trim())
    .filter(Boolean);
  const text = body.paragraphs.join("\n");
  if (text.length > DOCX_LIMITS.characters) throw new DocxError("OVERSIZED");
  if (!text.trim()) throw new DocxError("EMPTY_TEXT");
  return {
    version: DOCX_READER_VERSION,
    text,
    paragraphs: body.paragraphs.length,
    tables: body.tables,
    textBoxes: body.textBoxes,
    images: body.images + names.filter((n) => /^word\/media\//i.test(n)).length,
    headerFooterText,
    hyperlinks: body.links.map((l) => ({
      text: l.text.trim(),
      target: relationships.get(l.id)?.target ?? "",
    })),
    hiddenTextRuns: body.hidden,
  };
}

/** Same "[structure] severity|message" strings the PDF inspector stores (ATS-15 parity). */
export function docxStructureMessages(result: DocxReadResult): string[] {
  const P = "[structure] ";
  const out: string[] = [];
  const plural = (n: number, a: string, b: string) => (n === 1 ? a : b);
  if (result.hiddenTextRuns)
    out.push(
      `${P}error|${result.hiddenTextRuns} ${plural(result.hiddenTextRuns, "piece", "pieces")} of text ${plural(result.hiddenTextRuns, "is", "are")} white or marked hidden. An ATS reads it but a person cannot see it, and many employers treat hidden text as keyword stuffing. Remove it.`,
    );
  if (result.tables)
    out.push(
      `${P}warn|${result.tables} ${plural(result.tables, "table", "tables")} found. Many ATS read tables out of order or skip them. Use plain lines and bullets.`,
    );
  if (result.textBoxes)
    out.push(
      `${P}warn|${result.textBoxes} text ${plural(result.textBoxes, "box", "boxes")} found. Text in text boxes is often skipped by an ATS. Move it into the main text.`,
    );
  if (result.headerFooterText.length)
    out.push(
      `${P}info|Text was found in the page header or footer. Many ATS skip those areas, so keep contact details in the main text.`,
    );
  if (result.images)
    out.push(
      `${P}info|${result.images} ${plural(result.images, "image", "images")} found. An ATS cannot read text inside images.`,
    );
  const bare = result.hyperlinks.filter((l) => !l.text).length;
  if (bare)
    out.push(
      `${P}warn|${bare} ${plural(bare, "link has", "links have")} no visible text. Write the address or a clear label as text.`,
    );
  return out;
}
