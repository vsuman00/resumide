import { PublicApiError } from "./errors.ts";
import {
  DOCX_MEDIA_TYPE,
  DocxError,
  type DocxErrorCode,
  readDocx,
} from "./docx-extract.ts";

const PDF_SIGNATURE = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const ZIP_SIGNATURE = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

export type ResumeMediaType = "application/pdf" | typeof DOCX_MEDIA_TYPE;

export function validateJobDetails(
  jobTitle: string,
  jobDescription: string,
  limits: { maxTitleCharacters: number; maxDescriptionCharacters: number },
) {
  if (
    jobTitle.length > limits.maxTitleCharacters ||
    jobDescription.length > limits.maxDescriptionCharacters
  ) {
    throw new PublicApiError(
      "UNPROCESSABLE_INPUT",
      "The job details exceed the allowed length.",
      422,
    );
  }
}

export async function validatePdfUpload(
  file: File,
  maxBytes: number,
): Promise<Buffer> {
  if (file.size === 0) {
    throw new PublicApiError("INVALID_PDF", "The uploaded PDF is empty.", 400);
  }
  if (file.size > maxBytes) {
    throw new PublicApiError(
      "PAYLOAD_TOO_LARGE",
      "The PDF exceeds the allowed size.",
      413,
    );
  }
  if (file.type && file.type !== "application/pdf") {
    throw new PublicApiError(
      "INVALID_PDF",
      "Only PDF files are accepted.",
      400,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const hasPdfSignature = PDF_SIGNATURE.every(
    (byte, index) => bytes[index] === byte,
  );
  if (!hasPdfSignature) {
    throw new PublicApiError(
      "INVALID_PDF",
      "The uploaded file is not a valid PDF.",
      400,
    );
  }

  return Buffer.from(bytes);
}

const DOCX_MESSAGES: Record<DocxErrorCode, [number, string]> = {
  NOT_DOCX: [400, "The uploaded file is not a valid Word (.docx) document."],
  OVERSIZED: [
    413,
    "The Word file is too large. Save it as a PDF or shorten it.",
  ],
  ZIP_BOMB: [
    422,
    "The Word file expands to an unsafe size and was not opened.",
  ],
  MACROS: [
    422,
    "Word files with macros are not accepted. Save a copy as .docx without macros, or upload a PDF.",
  ],
  EXTERNAL_CONTENT: [
    422,
    "The Word file links to or embeds outside content, so it was not opened. Remove the linked content or upload a PDF.",
  ],
  UNSAFE_XML: [
    422,
    "The Word file could not be read safely. Upload a PDF instead.",
  ],
  EMPTY_TEXT: [
    422,
    "No readable text was found in the Word file. If it is a scan, upload a PDF.",
  ],
};

/** PDF or Word upload, decided from the file's own bytes (ATS-D5). Word files are checked at once. */
export async function validateResumeUpload(
  file: File,
  maxBytes: number,
): Promise<{ bytes: Buffer; mediaType: ResumeMediaType }> {
  if (file.size === 0)
    throw new PublicApiError("INVALID_PDF", "The uploaded file is empty.", 400);
  if (file.size > maxBytes)
    throw new PublicApiError(
      "PAYLOAD_TOO_LARGE",
      "The file exceeds the allowed size.",
      413,
    );
  if (
    file.type &&
    file.type !== "application/pdf" &&
    file.type !== DOCX_MEDIA_TYPE
  )
    throw new PublicApiError(
      "INVALID_PDF",
      "Only PDF or Word (.docx) files are accepted.",
      400,
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  const starts = (signature: Uint8Array) =>
    signature.every((byte, index) => bytes[index] === byte);
  if (starts(PDF_SIGNATURE) && file.type !== DOCX_MEDIA_TYPE)
    return { bytes: Buffer.from(bytes), mediaType: "application/pdf" };
  if (starts(ZIP_SIGNATURE) && file.type !== "application/pdf") {
    try {
      readDocx(bytes);
    } catch (error) {
      if (error instanceof DocxError) {
        const [status, message] = DOCX_MESSAGES[error.code];
        throw new PublicApiError(
          status === 413
            ? "PAYLOAD_TOO_LARGE"
            : status === 400
              ? "INVALID_PDF"
              : "UNPROCESSABLE_INPUT",
          message,
          status as 400 | 413 | 422,
        );
      }
      throw error;
    }
    return { bytes: Buffer.from(bytes), mediaType: DOCX_MEDIA_TYPE };
  }
  throw new PublicApiError(
    "INVALID_PDF",
    "The uploaded file is not a valid PDF or Word (.docx) document.",
    400,
  );
}
