import { parentPort, workerData } from "node:worker_threads";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import PDFDocument from "pdfkit";
import {
  Document,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
} from "docx";
import { unzipSync, strFromU8, strToU8, zipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const fontPath = workerData.fontPath;
const { plan, options } = workerData;
const MAX_BYTES = 5 * 1024 * 1024;
const sizes = { A4: [595.28, 841.89], LETTER: [612, 792] };
const fontBytes = readFileSync(fontPath);
const fallbackBytes = workerData.fallbackFontPath
  ? readFileSync(workerData.fallbackFontPath)
  : null;
const fontDocument = new PDFDocument({ autoFirstPage: false });
fontDocument.registerFont("Noto Sans", fontBytes).font("Noto Sans");
const primaryFont = fontDocument._font.font;
let fallbackFont = null;
if (fallbackBytes) {
  fontDocument
    .registerFont("Noto Sans Math", fallbackBytes)
    .font("Noto Sans Math");
  fallbackFont = fontDocument._font.font;
  fontDocument.font("Noto Sans");
}
let needsFallback = false;
function fontRuns(text) {
  const runs = [];
  for (const character of text) {
    const point = character.codePointAt(0);
    const name =
      /\s/u.test(character) || primaryFont.hasGlyphForCodePoint(point)
        ? "Noto Sans"
        : fallbackFont?.hasGlyphForCodePoint(point)
          ? "Noto Sans Math"
          : null;
    if (!name)
      throw Error(
        "Unsupported glyph. Replace characters outside the template font coverage.",
      );
    if (name === "Noto Sans Math") needsFallback = true;
    const last = runs.at(-1);
    if (last?.font === name) last.text += character;
    else runs.push({ font: name, text: character });
  }
  return runs;
}
function checkGlyphs() {
  for (const block of plan.blocks) fontRuns(block.text);
}
function measureWidth(text, size) {
  return fontRuns(text).reduce(
    (width, run) =>
      width +
      fontDocument.font(run.font).fontSize(size).widthOfString(run.text),
    0,
  );
}
function measureHeight(text, size, width) {
  let lines = 0;
  for (const paragraph of text.split("\n")) {
    let used = 0;
    lines++;
    for (const word of paragraph.split(/(?<=\s)/u)) {
      const next = measureWidth(word, size);
      if (used && used + next > width) {
        lines++;
        used = 0;
      }
      used += next;
    }
  }
  const lineHeight = Math.max(
    fontDocument.font("Noto Sans").fontSize(size).currentLineHeight(true),
    fontRuns(text).some((run) => run.font === "Noto Sans Math")
      ? fontDocument
          .font("Noto Sans Math")
          .fontSize(size)
          .currentLineHeight(true)
      : 0,
  );
  return lines * (lineHeight + 3);
}
function writePdfBlock(doc, block, width) {
  const runs = fontRuns(block.text + " ");
  runs.forEach((run, index) =>
    doc.font(run.font).text(run.text, {
      width,
      lineGap: 3,
      link: block.link,
      underline: !!block.link,
      continued: index < runs.length - 1,
    }),
  );
}
async function pdf() {
  const doc = new PDFDocument({
    size: sizes[options.pageSize],
    margin: 48,
    tagged: true,
    pdfVersion: "1.7",
    lang: plan.locale,
    displayTitle: true,
    bufferPages: true,
    info: {
      Title: "Resume",
      Creator: "Resumide core-renderer/1.0.2",
      Producer: "Resumide",
      CreationDate: new Date(0),
      ModDate: new Date(0),
    },
  });
  const chunks = [];
  let size = 0,
    pages = 1;
  doc.on("pageAdded", () => {
    if (++pages > 10)
      throw Error(
        "Resume exceeds ten pages. Shorten content before exporting.",
      );
  });
  const result = new Promise((resolve, reject) => {
    doc.on("data", (b) => {
      size += b.length;
      if (size > MAX_BYTES) {
        doc.destroy();
        reject(Error("Artifact output limit exceeded."));
      } else chunks.push(b);
    });
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  doc.registerFont("Noto Sans", fontBytes).font("Noto Sans");
  if (needsFallback) doc.registerFont("Noto Sans Math", fallbackBytes);
  const root = doc.struct("Document");
  doc.addStructure(root);
  let section = root;
  for (const block of plan.blocks) {
    const fontSize =
      block.kind === "name" ? 18 : block.kind === "heading" ? 13 : 10.5;
    doc.fontSize(fontSize);
    const width = doc.page.width - 96;
    if (
      block.text
        .split(/\s/u)
        .some((word) => measureWidth(word, fontSize) > width)
    )
      throw Error(
        "A word or URL exceeds the page width. Shorten it before exporting.",
      );
    const height = measureHeight(block.text + " ", fontSize, width);
    if (height > doc.page.height - 96)
      throw Error("A paragraph exceeds one page. Split it before exporting.");
    if (
      doc.y + height + (block.kind === "heading" ? 28 : 0) >
      doc.page.height - 48
    )
      doc.addPage();
    if (block.kind === "heading") {
      section = doc.struct("Sect");
      root.add(section);
    }
    const tag =
      block.kind === "name"
        ? "H1"
        : block.kind === "heading"
          ? "H2"
          : block.link
            ? "Link"
            : "P";
    section.add(doc.struct(tag, () => writePdfBlock(doc, block, width)));
    doc.font("Noto Sans");
    doc.moveDown(0.4);
  }
  doc.end();
  return await result;
}
let estimatedWordPages = null;
async function word() {
  const [width, height] = sizes[options.pageSize];
  // Apply the same font-metric overflow/page budget before a viewer-dependent DOCX flow.
  fontDocument.fontSize(10.5);
  let estimatedPages = 1,
    used = 0;
  for (const block of plan.blocks) {
    const size =
      block.kind === "name" ? 18 : block.kind === "heading" ? 13 : 10.5;
    if (
      block.text
        .split(/\s/u)
        .some((word) => measureWidth(word, size) > width - 96)
    )
      throw Error(
        "A word or URL exceeds the page width. Shorten it before exporting.",
      );
    const h = measureHeight(block.text, size, width - 96) + 10;
    if (h > height - 96)
      throw Error("A paragraph exceeds one page. Split it before exporting.");
    if (used + h > height - 96) {
      estimatedPages++;
      used = 0;
    }
    used += h;
  }
  estimatedWordPages = estimatedPages;
  if (estimatedPages > 10)
    throw Error(
      "Resume exceeds the estimated ten-page DOCX budget. Shorten it before exporting.",
    );
  const document = new Document({
    title: "Resume",
    creator: "Resumide",
    description: "Canonical resume export",
    revision: 1,
    fonts: [
      { name: "Noto Sans", data: fontBytes },
      ...(needsFallback
        ? [{ name: "Noto Sans Math", data: fallbackBytes }]
        : []),
    ],
    styles: {
      default: {
        document: {
          run: { font: "Noto Sans", size: 21, color: "1B1B1B" },
          paragraph: { spacing: { after: 100 } },
        },
        heading1: {
          run: { font: "Noto Sans", size: 36, bold: true, color: "1B1B1B" },
          paragraph: { spacing: { before: 0, after: 160 } },
        },
        heading2: {
          run: { font: "Noto Sans", size: 26, bold: true, color: "1B1B1B" },
          paragraph: { spacing: { before: 160, after: 100 } },
        },
        hyperlink: {
          run: {
            font: "Noto Sans",
            color: "1B1B1B",
            underline: { color: "1B1B1B" },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: Math.round(width * 20),
              height: Math.round(height * 20),
            },
            margin: { top: 960, bottom: 960, left: 960, right: 960 },
          },
        },
        children: plan.blocks.map(
          (block) =>
            new Paragraph({
              heading:
                block.kind === "name"
                  ? HeadingLevel.HEADING_1
                  : block.kind === "heading"
                    ? HeadingLevel.HEADING_2
                    : undefined,
              keepNext: block.kind !== "fact",
              keepLines: true,
              children: block.link
                ? [
                    new ExternalHyperlink({
                      link: block.link,
                      children: fontRuns(block.text).map(
                        (run) =>
                          new TextRun({
                            text: run.text,
                            style: "Hyperlink",
                            font: run.font,
                          }),
                      ),
                    }),
                  ]
                : fontRuns(block.text).map(
                    (run) => new TextRun({ text: run.text, font: run.font }),
                  ),
            }),
        ),
      },
    ],
  });
  const bytes = await Packer.toBuffer(document);
  if (bytes.length > MAX_BYTES) throw Error("Artifact output limit exceeded.");
  // Normalize package metadata and font obfuscation keys for byte-reproducible output.
  const files = unzipSync(bytes);
  let fontXml = strFromU8(files["word/fontTable.xml"]);
  const keys = [...fontXml.matchAll(/w:fontKey="([^"]+)"/gu)].map(
    (match) => match[1],
  );
  const keyBytes = (key) =>
    Buffer.from(key.replace(/[{}-]/gu, ""), "hex").reverse();
  keys.forEach((oldKey, index) => {
    const newKey = `{11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}}`;
    const old = keyBytes(oldKey),
      next = keyBytes(newKey),
      data = files[`word/fonts/font${index + 1}.odttf`];
    if (!data) throw Error("Embedded font relationship failed.");
    for (let i = 0; i < 32; i++) data[i] ^= old[i % 16] ^ next[i % 16];
    fontXml = fontXml.replaceAll(oldKey, newKey);
  });
  files["word/fontTable.xml"] = strToU8(fontXml);
  // docx assigns random relationship IDs; replace only the generated hyperlink IDs.
  let relXml = strFromU8(files["word/_rels/document.xml.rels"]);
  let bodyXml = strFromU8(files["word/document.xml"]);
  const ids = [
    ...relXml.matchAll(/<Relationship Id="([^"]+)" Type="[^"]*\/hyperlink"/gu),
  ].map((match) => match[1]);
  ids.forEach((oldId, index) => {
    const nextId = `rIdResumeLink${index + 1}`;
    relXml = relXml.replaceAll(`Id="${oldId}"`, `Id="${nextId}"`);
    bodyXml = bodyXml.replaceAll(`r:id="${oldId}"`, `r:id="${nextId}"`);
  });
  files["word/_rels/document.xml.rels"] = strToU8(relXml);
  files["word/document.xml"] = strToU8(bodyXml);
  files["docProps/core.xml"] = strToU8(
    strFromU8(files["docProps/core.xml"]).replace(
      /(<dcterms:(?:created|modified)[^>]*>)[^<]+/gu,
      "$1" + "2000-01-01T00:00:00Z",
    ),
  );
  return zipSync(
    Object.fromEntries(
      Object.entries(files)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, data]) => [
          name,
          [data, { mtime: new Date("2000-01-01T00:00:00Z") }],
        ]),
    ),
    { level: 6 },
  );
}
async function inspectPdf(bytes) {
  const task = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
  });
  const doc = await task.promise;
  try {
    let text = "",
      layoutPass = doc.numPages <= 10,
      structuralAccessibility = true;
    const links = [],
      linkBindings = [];
    const dimensions = sizes[options.pageSize];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n),
        content = await page.getTextContent(),
        tree = await page.getStructTree();
      const viewport = page.getViewport({ scale: 1 });
      if (
        Math.abs(viewport.width - dimensions[0]) > 1 ||
        Math.abs(viewport.height - dimensions[1]) > 1
      )
        layoutPass = false;
      structuralAccessibility &&= !!tree;
      const textItems = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str + "\n";
        textItems.push(item);
        const x = item.transform[4],
          y = item.transform[5];
        if (
          x < 47 ||
          x + item.width > viewport.width - 47 ||
          y < 47 ||
          y + item.height > viewport.height - 47
        )
          layoutPass = false;
      }
      for (const annotation of await page.getAnnotations()) {
        if (annotation.subtype !== "Link") continue;
        const target = annotation.url ?? annotation.unsafeUrl;
        links.push(target);
        const [left, bottom, right, top] = annotation.rect;
        const label = textItems
          .filter((item) => {
            const x = item.transform[4],
              y = item.transform[5];
            return (
              x >= left - 2 && x < right + 2 && y >= bottom - 2 && y <= top + 2
            );
          })
          .map((item) => item.str)
          .join("");
        linkBindings.push(
          `${target}|${label.normalize("NFC").replace(/\s+/gu, "")}`,
        );
      }
    }
    const metadata = await doc.getMetadata();
    structuralAccessibility &&= metadata.info.Language === plan.locale;
    const raw = Buffer.from(bytes).toString("latin1");
    layoutPass &&= raw.includes("/FontFile2") && raw.includes("/ToUnicode");
    return {
      text,
      links,
      linkBindings,
      pages: doc.numPages,
      layoutPass,
      structuralAccessibility,
      diagnostics: [],
    };
  } finally {
    await doc.destroy();
  }
}
function inspectWord(bytes) {
  const files = unzipSync(bytes);
  if (
    Object.keys(files).length > 100 ||
    Object.values(files).reduce((s, b) => s + b.length, 0) > 10 * 1024 * 1024
  )
    throw Error("DOCX expansion limit exceeded.");
  const parser = new XMLParser({
    ignoreAttributes: false,
    preserveOrder: true,
    trimValues: false,
    processEntities: true,
  });
  const xml = strFromU8(files["word/document.xml"]);
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) throw Error("Unsafe document XML.");
  const paragraphs = [],
    links = [],
    linkBindings = [];
  function textIn(nodes) {
    return nodes
      .map(
        (node) =>
          node["#text"] ??
          Object.entries(node)
            .filter(([key]) => key !== ":@")
            .map(([, value]) => (Array.isArray(value) ? textIn(value) : ""))
            .join(""),
      )
      .join("");
  }
  function walk(nodes) {
    for (const node of nodes) {
      if (node["w:p"]) paragraphs.push(textIn(node["w:p"]));
      else
        for (const [key, value] of Object.entries(node))
          if (key !== ":@" && Array.isArray(value)) walk(value);
    }
  }
  walk(parser.parse(xml));
  const rels = parser.parse(strFromU8(files["word/_rels/document.xml.rels"]));
  const targetById = new Map();
  function relationships(nodes) {
    for (const node of nodes) {
      if (node.Relationship && node[":@"]?.["@_Type"]?.endsWith("/hyperlink")) {
        links.push(node[":@"]["@_Target"]);
        targetById.set(node[":@"]["@_Id"], node[":@"]["@_Target"]);
      }
      for (const [key, value] of Object.entries(node))
        if (key !== ":@" && Array.isArray(value)) relationships(value);
    }
  }
  relationships(rels);
  function gatherBindings(nodes) {
    for (const node of nodes) {
      if (node["w:hyperlink"]) {
        const target = targetById.get(node[":@"]?.["@_r:id"]);
        linkBindings.push(
          `${target ?? ""}|${textIn(node["w:hyperlink"]).normalize("NFC").replace(/\s+/gu, "")}`,
        );
      } else
        for (const [key, value] of Object.entries(node))
          if (key !== ":@" && Array.isArray(value)) gatherBindings(value);
    }
  }
  gatherBindings(parser.parse(xml));
  const headingCount = (xml.match(/w:pStyle w:val="Heading[12]"/gu) ?? [])
    .length;
  const expectedHeadings = plan.blocks.filter((b) => b.kind !== "fact").length;
  const [width, height] = sizes[options.pageSize];
  const layoutPass =
    Object.keys(files).some((name) => name.endsWith(".odttf")) &&
    xml.includes(`w:w="${Math.round(width * 20)}"`) &&
    xml.includes(`w:h="${Math.round(height * 20)}"`) &&
    !Object.keys(files).some((name) => /vbaProject|embeddings\//u.test(name));
  return {
    text: paragraphs.join("\n"),
    links,
    linkBindings,
    pages: null,
    estimatedPages: estimatedWordPages,
    layoutPass,
    structuralAccessibility: headingCount === expectedHeadings,
    diagnostics: [],
  };
}
try {
  checkGlyphs();
  const bytes = workerData.verifyBytes
    ? Buffer.from(workerData.verifyBytes)
    : options.format === "pdf"
      ? await pdf()
      : await word();
  if (bytes.length > MAX_BYTES) throw Error("Artifact output limit exceeded.");
  const observation =
    options.format === "pdf" ? await inspectPdf(bytes) : inspectWord(bytes);
  parentPort.postMessage({ bytes, observation });
} catch (error) {
  // Only template-owned diagnostic strings leave this worker; third-party errors are generic.
  const allowed =
    /^(Unsupported glyph|A word or URL|A paragraph|Resume exceeds|Artifact output limit)/u;
  parentPort.postMessage({
    error: allowed.test(error.message)
      ? error.message
      : "Rendering or parse-back failed. Review content and try again.",
  });
}
