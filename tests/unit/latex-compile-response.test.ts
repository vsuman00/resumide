import { describe, expect, it } from "vitest";
import { readLatexCompileReply } from "../../app/lib/latex-compile-response";

const b64 = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64");
const pdf = (headers: Record<string, string> = {}) =>
  new Response("%PDF-1.7 synthetic", {
    headers: {
      "Content-Type": "application/pdf",
      "X-Latex-Pages": "1",
      ...headers,
    },
  });
const signal = new AbortController().signal;

describe("compile reply metadata", () => {
  it("returns notices and warnings from headers", async () => {
    const reply = await readLatexCompileReply(
      pdf({
        "X-Latex-Notices": b64([{ line: 4, kind: "glyphtounicode" }]),
        "X-Latex-Warnings": b64([
          { kind: "overfull_box", line: 9, severity: "warning" },
        ]),
      }),
      signal,
    );
    expect(reply.notices).toEqual([{ line: 4, kind: "glyphtounicode" }]);
    expect(reply.diagnostics).toEqual([
      { kind: "overfull_box", line: 9, severity: "warning" },
    ]);
  });
  it("degrades malformed metadata to empty lists without rejecting the PDF", async () => {
    const reply = await readLatexCompileReply(
      pdf({
        "X-Latex-Notices": "not-base64!",
        "X-Latex-Warnings": b64([{ kind: "x" }]),
      }),
      signal,
    );
    expect(reply).toMatchObject({ pages: 1, notices: [], diagnostics: [] });
  });
  it("attaches an error diagnostic to the thrown error", async () => {
    const response = Response.json(
      {
        code: "compile_failed",
        diagnostic: { kind: "missing_brace", line: 3 },
      },
      { status: 422 },
    );
    await expect(readLatexCompileReply(response, signal)).rejects.toMatchObject(
      {
        message: "compile_failed",
        diagnostic: { kind: "missing_brace", line: 3, severity: "error" },
      },
    );
  });
});
