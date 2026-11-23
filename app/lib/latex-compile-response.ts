import { LATEX_LIMITS } from "./latex-converter";

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
        throw new Error(body.code);
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
    return { pdf: new Blob([bytes], { type: mime }), pages };
  } finally {
    if (response.body && !response.bodyUsed)
      void response.body.cancel().catch(() => undefined);
  }
}
