// The native parser can run in workers and in raw Node self-checks.
import { createHash } from "node:crypto";
import { getDocumentProxy } from "unpdf";

export type ResumeExtractionErrorCode =
  | "INVALID_PDF"
  | "PAGE_LIMIT"
  | "EMPTY_TEXT"
  | "TEXT_LIMIT"
  | "LAYOUT_LIMIT"
  | "OVERSIZED"
  | "CHECKSUM_MISMATCH"
  | "TIMEOUT";

export class ResumeExtractionError extends Error {
  constructor(
    readonly code: ResumeExtractionErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "ResumeExtractionError";
  }
}

export function assertResumeSource(
  bytes: Uint8Array,
  maxBytes: number,
  expectedSha256: string,
) {
  if (bytes.byteLength > maxBytes)
    throw new ResumeExtractionError("OVERSIZED", "Document exceeds byte limit");
  if (createHash("sha256").update(bytes).digest("hex") !== expectedSha256)
    throw new ResumeExtractionError(
      "CHECKSUM_MISMATCH",
      "Document checksum mismatch",
    );
}

type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;
type NativeTextLimits = {
  maxPages?: number;
  maxCharacters?: number;
  signal?: AbortSignal;
};

export async function withNativePdf<T>(
  bytes: Uint8Array,
  read: (document: PdfDocument) => Promise<T>,
): Promise<T> {
  // PDF.js rejects Node Buffers. Copy to an independent plain Uint8Array.
  let document: PdfDocument;
  try {
    document = await getDocumentProxy(Uint8Array.from(bytes));
  } catch {
    throw new ResumeExtractionError("INVALID_PDF");
  }

  let result: T;
  try {
    if (!Number.isSafeInteger(document.numPages) || document.numPages < 1)
      throw new ResumeExtractionError("INVALID_PDF");
    result = await read(document);
  } catch (error) {
    // A teardown failure must not overwrite the original extraction reason.
    await Promise.resolve()
      .then(() => document.destroy())
      .catch(() => undefined);
    if (error instanceof ResumeExtractionError) throw error;
    throw new ResumeExtractionError("INVALID_PDF");
  }
  try {
    await document.destroy();
  } catch {
    throw new ResumeExtractionError("INVALID_PDF");
  }
  return result;
}

export function requireNativeExtractionActive(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new ResumeExtractionError("TIMEOUT", "Document extraction timeout");
}

export async function readNativePdfText(
  document: PdfDocument,
  limits: NativeTextLimits,
) {
  if (limits.maxPages !== undefined && document.numPages > limits.maxPages)
    throw new ResumeExtractionError("PAGE_LIMIT");
  const pageTexts: string[] = [];
  let characters = 0;
  const maxCharacters = limits.maxCharacters ?? Number.POSITIVE_INFINITY;
  for (let number = 1; number <= document.numPages; number++) {
    requireNativeExtractionActive(limits.signal);
    if (number > 1 && (characters += 2) > maxCharacters)
      throw new ResumeExtractionError("TEXT_LIMIT");
    const page = await document.getPage(number);
    try {
      requireNativeExtractionActive(limits.signal);
      const content = await page.getTextContent();
      requireNativeExtractionActive(limits.signal);
      const chunks: string[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const chunk = item.str + (item.hasEOL ? "\n" : "");
        characters += chunk.length;
        if (characters > maxCharacters)
          throw new ResumeExtractionError("TEXT_LIMIT");
        chunks.push(chunk);
      }
      pageTexts.push(chunks.join(""));
    } finally {
      page.cleanup();
    }
  }
  return {
    totalPages: document.numPages,
    text: pageTexts.join("\n\n"),
    pageTexts,
  };
}

export async function extractResumeText(
  pdf: Buffer | Uint8Array,
  limits: NativeTextLimits = {},
): Promise<{ totalPages: number; text: string; pageTexts?: string[] }> {
  return withNativePdf(pdf, async (document) => {
    const result = await readNativePdfText(document, limits);
    if (result.text.trim().length === 0)
      throw new ResumeExtractionError("EMPTY_TEXT");
    return result;
  });
}
