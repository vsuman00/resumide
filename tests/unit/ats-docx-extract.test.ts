import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import {
  DocxError,
  docxStructureMessages,
  readDocx,
} from "../../app/lib/server/docx-extract";

const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const run = (t: string, props = "") =>
  `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t>${t}</w:t></w:r>`;
const para = (...runs: string[]) => `<w:p>${runs.join("")}</w:p>`;
function docx(
  body: string,
  extra: Record<string, string> = {},
  types = "<Types/>",
) {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(types),
    "word/document.xml": strToU8(
      `<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`,
    ),
  };
  for (const [name, text] of Object.entries(extra)) files[name] = strToU8(text);
  return zipSync(files);
}

describe("DOCX reader (ATS-13)", () => {
  it("reads paragraphs in order and finds nothing wrong in a plain file", () => {
    const r = readDocx(
      docx(
        para(run("Alex Example")) +
          para(run("Engineer "), run("at Example Corp")),
      ),
    );
    expect(r.text).toBe("Alex Example\nEngineer at Example Corp");
    expect(docxStructureMessages(r)).toEqual([]);
  });
  it("reports tables, text boxes (kept out of the main text), hidden and white text", () => {
    const body =
      para(run("Visible")) +
      `<w:tbl><w:tr><w:tc>${para(run("cell"))}</w:tc></w:tr></w:tbl>` +
      para(run("secret", '<w:color w:val="FFFFFF"/>')) +
      para(run("ghost", "<w:vanish/>")) +
      `<w:p><w:r><mc:AlternateContent xmlns:mc="x"><w:txbxContent>${para(run("boxed"))}</w:txbxContent></mc:AlternateContent></w:r></w:p>`;
    const r = readDocx(docx(body));
    expect(r).toMatchObject({ tables: 1, textBoxes: 1, hiddenTextRuns: 2 });
    expect(r.text).not.toContain("boxed");
    const m = docxStructureMessages(r).join("\n");
    expect(m).toMatch(/error\|2 pieces of text are white or marked hidden/);
    expect(m).toMatch(/warn\|1 table found/);
    expect(m).toMatch(/warn\|1 text box found/);
  });
  it("reads header text, images and links with and without visible text", () => {
    const rels = `<Relationships><Relationship Id="rId1" Type="x/hyperlink" Target="https://example.test/a" TargetMode="External"/><Relationship Id="rId2" Type="x/hyperlink" Target="https://example.test/b" TargetMode="External"/></Relationships>`;
    const body = para(
      run("Body"),
      '<w:hyperlink r:id="rId1">' + run("profile") + "</w:hyperlink>",
      '<w:hyperlink r:id="rId2"></w:hyperlink>',
    );
    const r = readDocx(
      docx(body, {
        "word/_rels/document.xml.rels": rels,
        "word/header1.xml": `<w:hdr ${W}>${para(run("alex@example.test"))}</w:hdr>`,
        "word/media/image1.png": "x",
      }),
    );
    expect(r.headerFooterText).toEqual(["alex@example.test"]);
    expect(r.images).toBe(1);
    expect(r.hyperlinks.map((l) => [l.text, l.target])).toEqual([
      ["profile", "https://example.test/a"],
      ["", "https://example.test/b"],
    ]);
    expect(docxStructureMessages(r).join("\n")).toMatch(
      /warn\|1 link has no visible text/,
    );
  });
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return (e as DocxError).code;
    }
    return "none";
  };
  it("refuses macros, embedded objects, external content, XML entities and non-DOCX input", () => {
    expect(
      code(() =>
        readDocx(docx(para(run("x")), { "word/vbaProject.bin": "x" })),
      ),
    ).toBe("MACROS");
    expect(
      code(() =>
        readDocx(
          docx(
            para(run("x")),
            {},
            '<Types><Override ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/></Types>',
          ),
        ),
      ),
    ).toBe("MACROS");
    expect(
      code(() =>
        readDocx(docx(para(run("x")), { "word/embeddings/o.bin": "x" })),
      ),
    ).toBe("EXTERNAL_CONTENT");
    const ext = `<Relationships><Relationship Id="r9" Type="x/oleObject" Target="http://example.test/o" TargetMode="External"/></Relationships>`;
    expect(
      code(() =>
        readDocx(docx(para(run("x")), { "word/_rels/document.xml.rels": ext })),
      ),
    ).toBe("EXTERNAL_CONTENT");
    const xxe = `<?xml version="1.0"?><!DOCTYPE d [<!ENTITY e SYSTEM "file:///etc/passwd">]><w:document ${W}><w:body>${para(run("&e;"))}</w:body></w:document>`;
    expect(
      code(() =>
        readDocx(
          zipSync({
            "[Content_Types].xml": strToU8("<Types/>"),
            "word/document.xml": strToU8(xxe),
          }),
        ),
      ),
    ).toBe("UNSAFE_XML");
    expect(code(() => readDocx(new Uint8Array([0x25, 0x50, 0x44, 0x46])))).toBe(
      "NOT_DOCX",
    );
    expect(code(() => readDocx(strToU8("PK not really a zip")))).toBe(
      "NOT_DOCX",
    );
    expect(code(() => readDocx(zipSync({ "hello.txt": strToU8("hi") })))).toBe(
      "NOT_DOCX",
    );
    expect(code(() => readDocx(docx("")))).toBe("EMPTY_TEXT");
  });
  it("refuses a zip bomb before inflating it", () => {
    const bomb = zipSync({
      "[Content_Types].xml": strToU8("<Types/>"),
      "word/document.xml": strToU8("a".repeat(30_000_000)),
    });
    expect(bomb.byteLength).toBeLessThan(200_000);
    expect(code(() => readDocx(bomb))).toBe("ZIP_BOMB");
  });
});
