import {
  LATEX_DIAGNOSTIC_KINDS,
  LATEX_LIMITS,
  type LatexDiagnostic,
  type LatexNotice,
} from "./latex-converter";

const errorReplyBytes = 4_096;

function invalidReply(): never {
  throw new Error("compile_failed");
}

async function readBounded(
  response: Response,
  limit: number,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (!response.body || Number(response.headers.get("Content-Length")) > limit)
    invalidReply();

  const reader = response.body.getReader();
  const cancel = () => void reader.cancel().catch(() => undefined);
  signal.addEventListener("abort", cancel, { once: true });
  let bytes = new Uint8Array(Math.min(16_384, limit));
  let size = 0;
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) {
        finished = true;
        break;
      }
      const end = size + value.byteLength;
      if (end > limit) invalidReply();
      if (end > bytes.length) {
        const larger = new Uint8Array(
          Math.min(Math.max(end, bytes.length * 2), limit),
        );
        larger.set(bytes);
        bytes = larger;
      }
      bytes.set(value, size);
      size = end;
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    if (!finished) cancel();
    reader.releaseLock();
  }

  return bytes.subarray(0, size);
}

export class LatexCompileError extends Error {
  constructor(
    code: string,
    public readonly diagnostic?: LatexDiagnostic,
  ) {
    super(code);
  }
}
const isLine = (line: unknown) =>
  line === null ||
  (typeof line === "number" && Number.isInteger(line) && line > 0);
function readDiagnostic(raw: unknown, severity: LatexDiagnostic["severity"]) {
  if (!raw || typeof raw !== "object") return undefined;
  const { kind, line } = raw as Record<string, unknown>;
  return LATEX_DIAGNOSTIC_KINDS.includes(kind as LatexDiagnostic["kind"]) &&
    isLine(line)
    ? ({ kind, line, severity } as LatexDiagnostic)
    : undefined;
}
// Missing or malformed metadata degrades to "none"; it never blocks a valid PDF.
function readHeaderList<T>(
  value: string | null,
  read: (item: unknown) => T | undefined,
): T[] {
  if (!value) return [];
  try {
    const list: unknown = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(value), (c) => c.charCodeAt(0)),
      ),
    );
    return Array.isArray(list)
      ? list.slice(0, 20).flatMap((item) => read(item) ?? [])
      : [];
  } catch {
    return [];
  }
}
const readNotice = (raw: unknown): LatexNotice | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const { kind, line } = raw as Record<string, unknown>;
  return (kind === "pdfgentounicode" || kind === "glyphtounicode") &&
    typeof line === "number" &&
    isLine(line)
    ? { kind, line }
    : undefined;
};

export async function readLatexCompileReply(
  response: Response,
  signal: AbortSignal,
) {
  try {
    signal.throwIfAborted();
    if (response.status === 401) throw new Error("unauthenticated");
    if (!response.ok) {
      const bytes = await readBounded(response, errorReplyBytes, signal);
      const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (
        typeof body === "object" &&
        body !== null &&
        "code" in body &&
        typeof body.code === "string" &&
        body.code !== "unauthenticated"
      )
        throw new LatexCompileError(
          body.code,
          "diagnostic" in body
            ? readDiagnostic(body.diagnostic, "error")
            : undefined,
        );
      invalidReply();
    }

    const mime = response.headers
      .get("Content-Type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    const pageHeader = response.headers.get("X-Latex-Pages");
    const pages = Number(pageHeader);
    if (
      mime !== "application/pdf" ||
      String(pages) !== pageHeader ||
      !Number.isInteger(pages) ||
      pages < 1 ||
      pages > LATEX_LIMITS.pages
    )
      invalidReply();

    const bytes = await readBounded(response, LATEX_LIMITS.pdfBytes, signal);
    if (String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-")
      invalidReply();
    return {
      pdf: new Blob([bytes], { type: mime }),
      pages,
      notices: readHeaderList(
        response.headers.get("X-Latex-Notices"),
        readNotice,
      ),
      diagnostics: readHeaderList(
        response.headers.get("X-Latex-Warnings"),
        (item) => readDiagnostic(item, "warning"),
      ),
    };
  } finally {
    if (response.body && !response.bodyUsed)
      void response.body.cancel().catch(() => undefined);
  }
}
