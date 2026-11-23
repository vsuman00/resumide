import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants, lstatSync, readdirSync, realpathSync } from "node:fs";
import { open, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LATEX_LIMITS } from "../app/lib/latex-converter";
import {
  inspectLatexPdf,
  LATEX_EXPECTED_ORDER,
  SYNTHETIC_LATEX,
} from "../tests/fixtures/latex";
import {
  assertNoOwnedContainers,
  docker,
  latexSourceHashes,
  rawLatexAttempt,
} from "./latex-test-fixtures";

type Dimensions = { width: number; height: number };
type ParsedPdf = Awaited<ReturnType<typeof inspectLatexPdf>>;
type OutputAdmission = { path: string; dev: number; ino: number };
const PNG_LIMIT = 2 * 1024 * 1024;
const DPI = 96;
const digest = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
function fail(code: string): never {
  throw new Error(code);
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parseCurrentRenderArguments(args: readonly string[]) {
  if (
    args.length !== 5 ||
    args[0] !== "--run-current-render" ||
    args[1] !== "--image" ||
    !/^sha256:[a-f0-9]{64}$/.test(args[2]) ||
    args[3] !== "--output-dir"
  )
    fail("current_render_arguments");
  return { imageId: args[2], outputDirectory: args[4] };
}

export function admitCurrentRenderOutput(path: string): OutputAdmission {
  try {
    const root = realpathSync("/tmp");
    if (
      !new RegExp(`^${root}/resumide-latex-current-render-[a-f0-9-]{36}$`).test(
        path,
      ) ||
      realpathSync(path) !== path
    )
      fail("current_render_output_admission");
    const info = lstatSync(path);
    if (
      !info.isDirectory() ||
      (info.mode & 0o7777) !== 0o700 ||
      typeof process.getuid !== "function" ||
      info.uid !== process.getuid() ||
      readdirSync(path).length !== 0
    )
      fail("current_render_output_admission");
    return { path, dev: info.dev, ino: info.ino };
  } catch {
    fail("current_render_output_admission");
  }
}

function outputIdentity(output: OutputAdmission) {
  const info = lstatSync(output.path);
  if (
    !info.isDirectory() ||
    info.dev !== output.dev ||
    info.ino !== output.ino ||
    (info.mode & 0o7777) !== 0o700 ||
    info.uid !== process.getuid?.() ||
    realpathSync(output.path) !== output.path
  )
    fail("current_render_output_changed");
}

function base64(value: unknown, maximum: number): Buffer {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > Math.ceil(maximum / 3) * 4 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    fail("current_render_base64");
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.length === 0 ||
    bytes.length > maximum ||
    bytes.toString("base64") !== value
  )
    fail("current_render_base64");
  return bytes;
}

export function decodeCurrentPdf(reply: unknown) {
  if (!record(reply) || "error" in reply || reply.pages !== 2)
    fail("current_render_compile_envelope");
  const bytes = base64(reply.pdf, LATEX_LIMITS.pdfBytes);
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
    fail("current_render_pdf_header");
  return bytes;
}

export function assertCurrentPdfSemantics(parsed: ParsedPdf) {
  if (
    parsed.pages !== 2 ||
    parsed.dimensions.length !== 2 ||
    parsed.text.includes("\uFFFD")
  )
    fail("current_render_pdf_semantics");
  let cursor = -1;
  for (const phrase of LATEX_EXPECTED_ORDER) {
    const next = parsed.text.indexOf(phrase, cursor + 1);
    if (next <= cursor) fail("current_render_text_order");
    cursor = next;
  }
  const normalizedText = parsed.text.normalize("NFKC").replace(/\s+/gu, "");
  if (!normalizedText.includes("α∈R") || !normalizedText.includes("a2+b2=c2"))
    fail("current_render_math");
  if (
    !parsed.links.includes("https://example.org/reference") ||
    parsed.links.some((link) => link !== "https://example.org/reference")
  )
    fail("current_render_links");
  for (const page of parsed.dimensions)
    if (
      !Number.isFinite(page.width) ||
      !Number.isFinite(page.height) ||
      Math.abs(page.width - 595.276) >= 2 ||
      Math.abs(page.height - 841.89) >= 2
    )
      fail("current_render_paper_dimensions");
  if (
    !Number.isInteger(parsed.taggedPages) ||
    parsed.taggedPages < 0 ||
    parsed.taggedPages > 2
  )
    fail("current_render_tag_metadata");
  return { pages: 2, normalizedText, taggedPages: parsed.taggedPages };
}

export function decodeCurrentPng(value: unknown, page: Dimensions) {
  const bytes = base64(value, PNG_LIMIT);
  if (
    bytes.length < 45 ||
    !bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.subarray(12, 16).toString("ascii") !== "IHDR" ||
    !bytes.subarray(-12).equals(Buffer.from("0000000049454e44ae426082", "hex"))
  )
    fail("current_render_png_envelope");
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  if (
    width === 0 ||
    height === 0 ||
    width > 1600 ||
    height > 1600 ||
    !Number.isFinite(page.width) ||
    !Number.isFinite(page.height) ||
    page.width <= 0 ||
    page.height <= 0 ||
    Math.abs(width - (page.width * DPI) / 72) >= 2 ||
    Math.abs(height - (page.height * DPI) / 72) >= 2
  )
    fail("current_render_png_dimensions");
  return { bytes, width, height };
}

export function validateCurrentRenderReply(
  reply: unknown,
  dimensions: readonly Dimensions[],
) {
  if (
    !record(reply) ||
    typeof reply.renderer !== "string" ||
    !reply.renderer.startsWith("pdftoppm version ") ||
    reply.renderer.length > 160 ||
    !Array.isArray(reply.fonts) ||
    reply.fonts.length === 0 ||
    reply.fonts.length > 256 ||
    !Array.isArray(reply.pages) ||
    reply.pages.length !== 2 ||
    dimensions.length !== 2
  )
    fail("current_render_reply");
  const fonts = reply.fonts.map((font: unknown) => {
    if (
      !record(font) ||
      typeof font.name !== "string" ||
      font.name.length === 0 ||
      font.name.length > 256 ||
      font.embedded !== true ||
      typeof font.subset !== "boolean" ||
      typeof font.unicodeMap !== "boolean"
    )
      fail("current_render_fonts");
    return {
      name: font.name,
      embedded: true,
      subset: font.subset,
      unicodeMap: font.unicodeMap,
    };
  });
  const pages = reply.pages.map((page: unknown, index: number) => {
    if (!record(page)) fail("current_render_png_envelope");
    return decodeCurrentPng(page.png, dimensions[index]);
  });
  return { fonts, renderer: reply.renderer, pages };
}

// Same fixed neutral rendering probe and bounds as the historical paired tool.
const RENDER_PROBE = String.raw`import base64,json,pathlib,struct,subprocess,sys
raw=sys.stdin.buffer.read(7000001)
assert len(raw)<=7000000
request=json.loads(raw)
assert set(request)=={'pdf'} and isinstance(request['pdf'],str)
pdf=base64.b64decode(request['pdf'],validate=True)
assert pdf.startswith(b'%PDF-') and 0<len(pdf)<=5242880
path=pathlib.Path('/scratch/input.pdf');path.write_bytes(pdf)
font_output=subprocess.run(['/usr/bin/pdffonts',str(path)],capture_output=True,check=True,timeout=5).stdout.decode('utf8')
fonts=[]
for line in font_output.splitlines()[2:]:
 if not line.strip():continue
 fields=line.split()
 assert len(fields)>=8 and fields[-2].isdigit() and fields[-1].isdigit()
 assert all(flag in ['yes','no'] for flag in fields[-5:-2])
 fonts.append({'name':fields[0],'embedded':fields[-5]=='yes','subset':fields[-4]=='yes','unicodeMap':fields[-3]=='yes'})
assert fonts and all(font['embedded'] for font in fonts)
version=subprocess.run(['/usr/bin/pdftoppm','-v'],capture_output=True,check=True,timeout=5).stderr.decode('utf8').splitlines()[0]
pages=[]
for number in [1,2]:
 prefix='/scratch/page-'+str(number)
 subprocess.run(['/usr/bin/pdftoppm','-r','96','-f',str(number),'-l',str(number),'-singlefile','-png',str(path),prefix],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True,timeout=8)
 image=pathlib.Path(prefix+'.png').read_bytes()
 assert image.startswith(b'\x89PNG\r\n\x1a\n') and len(image)<=2097152
 width,height=struct.unpack('>II',image[16:24])
 assert 0<width<=1600 and 0<height<=1600
 pages.append({'png':base64.b64encode(image).decode('ascii')})
print(json.dumps({'fonts':fonts,'renderer':version,'pages':pages}))`;

async function save(
  output: OutputAdmission,
  name: string,
  data: Uint8Array | string,
) {
  outputIdentity(output);
  const path = join(output.path, name);
  const file = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(data);
    await file.sync();
  } finally {
    await file.close();
  }
  return path;
}

export async function verifyCurrentCandidate(options: {
  imageId: string;
  outputDirectory: string;
}) {
  if (!/^sha256:[a-f0-9]{64}$/.test(options.imageId))
    fail("current_render_arguments");
  const output = admitCurrentRenderOutput(options.outputDirectory);
  const sourceHashes = await latexSourceHashes();
  await assertNoOwnedContainers();
  const image = await docker(
    ["image", "inspect", options.imageId, "--format", "{{.Id}}"],
    undefined,
    4096,
    5000,
  );
  if (image.code !== 0 || image.stdout.trim() !== options.imageId)
    fail("current_render_image_unavailable");
  const compiled = await rawLatexAttempt(options.imageId, SYNTHETIC_LATEX);
  const pdf = decodeCurrentPdf(compiled.value);
  const parsed = await inspectLatexPdf(pdf);
  const semantics = assertCurrentPdfSemantics(parsed);
  const raw = await rawLatexAttempt(options.imageId, "", {
    entrypoint: "/usr/bin/python3",
    args: ["-I", "-B", "-c", RENDER_PROBE],
    input: JSON.stringify({ pdf: pdf.toString("base64") }),
  });
  const rendered = validateCurrentRenderReply(raw.value, parsed.dimensions);
  await assertNoOwnedContainers();
  assert.deepEqual(
    await latexSourceHashes(),
    sourceHashes,
    "Current render source drift",
  );
  outputIdentity(output);
  if (readdirSync(output.path).length !== 0)
    fail("current_render_output_changed");
  const artifacts = [];
  for (const [index, page] of rendered.pages.entries()) {
    const path = await save(
      output,
      `current-page-${index + 1}.png`,
      page.bytes,
    );
    artifacts.push({
      path,
      page: index + 1,
      bytes: page.bytes.length,
      width: page.width,
      height: page.height,
      sha256: digest(page.bytes),
    });
  }
  const receipt = {
    schemaVersion: "latex-current-candidate-render/1",
    candidateImage: options.imageId,
    rendererImage: options.imageId,
    currentCandidateOnly: true,
    baselineComparisonExecuted: false,
    sourceHashes,
    verifierSha256: digest(await readFile(fileURLToPath(import.meta.url))),
    renderProbeSha256: digest(RENDER_PROBE),
    sourceSha256: digest(SYNTHETIC_LATEX),
    pdfSha256: digest(pdf),
    semanticTextSha256: digest(semantics.normalizedText),
    pdfBytes: pdf.length,
    pages: parsed.pages,
    dimensions: parsed.dimensions,
    taggedPages: semantics.taggedPages,
    links: [...new Set(parsed.links)],
    replacementGlyphs: 0,
    fonts: rendered.fonts,
    renderer: rendered.renderer,
    dpi: DPI,
    artifacts,
    ownedContainersRemaining: 0,
    checksExecuted: [
      "two-page-pdf",
      "ordered-neutral-text",
      "math-and-glyphs",
      "public-link",
      "A4-dimensions",
      "embedded-fonts",
      "two-bounded-PNGs",
      "96dpi-dimensions",
      "source-and-cleanup",
    ],
    visualReview: "Pending inspection of both current synthetic pages",
    accessibilityAccepted: false,
    securityAccepted: false,
    limits:
      "Current neutral fixture only; no baseline/pixel parity, representative validity, hiring outcome or document-accessibility claim",
  };
  const bytes = JSON.stringify(receipt, null, 2) + "\n";
  if (Buffer.byteLength(bytes) > 262144) fail("current_render_receipt_bound");
  await save(output, "current-render.json", bytes);
  return receipt;
}

// Installed vite-node retains its CLI as argv[1] unless --script is used.
// Tests import this module through vitest, whose entry does not match this guard.
const entry = process.argv[1];
if (
  entry &&
  (resolve(entry) === fileURLToPath(import.meta.url) ||
    /(?:^|\/)vite-node(?:\.mjs|\/dist\/cli\.mjs)?$/.test(entry))
) {
  const result = await verifyCurrentCandidate(
    parseCurrentRenderArguments(process.argv.slice(2)),
  );
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
