import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  inspectLatexPdf,
  LATEX_EXPECTED_ORDER,
  SYNTHETIC_LATEX,
} from "../tests/fixtures/latex";
import {
  assertNoOwnedContainers,
  rawLatexAttempt,
} from "./latex-test-fixtures";

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

const images = process.argv.filter((arg) => arg.startsWith("sha256:"));
assert.equal(images.length, 2, "Pass the baseline and new candidate image IDs");
const [baselineImage, candidateImage] = images;
assert.equal(
  baselineImage,
  "sha256:19d2a00a2a830173bf1fae07dddfcac7d54be3047e58b276af031d3cbd1018ac",
);
assert.match(candidateImage, /^sha256:[a-f0-9]{64}$/);
assert.notEqual(candidateImage, baselineImage);
await assertNoOwnedContainers();
const outputDirectory = await mkdtemp(join(tmpdir(), "resumide-aa7-render-"));
const results = [];
let baselineText: string | undefined;
for (const [label, imageId] of [
  ["baseline", baselineImage],
  ["candidate", candidateImage],
] as const) {
  const compiled = await rawLatexAttempt(imageId, SYNTHETIC_LATEX);
  assert.equal(compiled.value.error, undefined);
  const pdf = Buffer.from(compiled.value.pdf, "base64");
  const parsed = await inspectLatexPdf(pdf);
  assert.equal(parsed.pages, 2);
  assert.ok(!parsed.text.includes("\uFFFD"), "PDF contains replacement glyphs");
  let cursor = -1;
  for (const phrase of LATEX_EXPECTED_ORDER) {
    const next = parsed.text.indexOf(phrase, cursor + 1);
    assert.ok(
      next > cursor,
      `Missing/changed synthetic phrase order: ${phrase}`,
    );
    cursor = next;
  }
  // NFKC checks semantic recovery of math presentation characters. It never
  // changes source/PDF bytes and is not a visual or assistive-technology verdict.
  const text = parsed.text.normalize("NFKC").replace(/\s+/gu, "");
  assert.match(text, /α∈R/u);
  if (baselineText === undefined) baselineText = text;
  else assert.equal(text, baselineText, "Paired extracted semantics changed");
  const rendered = await rawLatexAttempt(candidateImage, "", {
    entrypoint: "/usr/bin/python3",
    args: ["-I", "-B", "-c", RENDER_PROBE],
    input: JSON.stringify({ pdf: pdf.toString("base64") }),
  });
  assert.equal(rendered.value.pages.length, 2);
  assert.ok(rendered.value.fonts.length > 0);
  for (const font of rendered.value.fonts) assert.equal(font.embedded, true);
  const artifacts = [];
  for (const [index, page] of rendered.value.pages.entries()) {
    assert.equal(typeof page.png, "string");
    assert.ok(page.png.length <= Math.ceil((2 * 1024 * 1024) / 3) * 4);
    const png = Buffer.from(page.png, "base64");
    assert.ok(png.length >= 24 && png.length <= 2 * 1024 * 1024);
    assert.ok(
      png.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
    );
    const width = png.readUInt32BE(16),
      height = png.readUInt32BE(20);
    assert.ok(width > 0 && width <= 1600 && height > 0 && height <= 1600);
    assert.ok(Math.abs(width - (parsed.dimensions[index].width * 96) / 72) < 2);
    assert.ok(
      Math.abs(height - (parsed.dimensions[index].height * 96) / 72) < 2,
    );
    const path = join(outputDirectory, `${label}-page-${index + 1}.png`);
    await writeFile(path, png, { flag: "wx", mode: 0o600 });
    artifacts.push({
      path,
      page: index + 1,
      bytes: png.length,
      width,
      height,
      sha256: createHash("sha256").update(png).digest("hex"),
    });
  }
  results.push({
    label,
    imageId,
    pdfBytes: pdf.length,
    pdfSha256: createHash("sha256").update(pdf).digest("hex"),
    semanticTextSha256: createHash("sha256").update(text).digest("hex"),
    pages: parsed.pages,
    fonts: rendered.value.fonts,
    renderer: rendered.value.renderer,
    artifacts,
  });
}
await assertNoOwnedContainers();
process.stdout.write(
  JSON.stringify(
    {
      baselineImage,
      candidateImage,
      sourceSha256: createHash("sha256").update(SYNTHETIC_LATEX).digest("hex"),
      rendererImage: candidateImage,
      dpi: 96,
      semanticParity: "pass",
      replacementGlyphs: 0,
      allFontsEmbedded: true,
      results,
      ownedContainersRemaining: 0,
      visualReview: "Pending inspection of all four rendered synthetic pages",
      limits:
        "Two neutral pages; no pixel-identity, representative validity or document-accessibility claim",
    },
    null,
    2,
  ) + "\n",
);
