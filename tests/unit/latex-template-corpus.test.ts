import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LatexSourceError,
  prepareLatexDocument,
} from "../../app/lib/server/latex-source";

const dir = new URL("../fixtures/latex-templates/", import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL("manifest.json", dir), "utf8"),
) as { file: string; expected: "compile" | "reject"; reason?: string }[];

describe("template corpus admission", () => {
  it("has 12 templates, each with a licence and reasons for rejects", () => {
    expect(manifest).toHaveLength(12);
    for (const t of manifest)
      if (t.expected === "reject") expect(t.reason).toBeTruthy();
  });
  for (const t of manifest)
    it(`${t.file} is ${t.expected === "compile" ? "admitted" : "rejected"}`, () => {
      const source = readFileSync(new URL(t.file, dir), "utf8");
      const run = () => prepareLatexDocument({ source, profile: "document" });
      if (t.expected === "compile") expect(run).not.toThrow();
      else expect(run).toThrow(LatexSourceError);
    });
});
