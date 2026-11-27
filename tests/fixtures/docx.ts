// Synthetic Word (.docx) bytes for tests (ATS-D5). Only paragraphs of plain text; no real resume data.
import { strToU8, zipSync } from "fflate";

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

export function buildDocx(
  lines: string[],
  extraFiles: Record<string, string> = {},
): Uint8Array {
  const body = lines
    .map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`)
    .join("");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(
      `<?xml version="1.0"?><w:document ${NS}><w:body>${body}</w:body></w:document>`,
    ),
  };
  for (const [name, text] of Object.entries(extraFiles))
    files[name] = strToU8(text);
  return zipSync(files);
}
