import { describe, expect, it } from "vitest";
import { parseHealthWarnings } from "../../app/lib/server/parsing/health";
import { parseSim } from "../../app/lib/server/parseSim";

const words = (n: number) =>
  Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const check = (
  text: string,
  pageTexts?: string[],
  totalPages = pageTexts?.length ?? 1,
) =>
  parseHealthWarnings({ lines: text.split("\n"), pageTexts, totalPages }).map(
    (w) => `${w.severity}:${w.message.split(" ").slice(0, 3).join(" ")}`,
  );

describe("parse-health text checks (ATS-15)", () => {
  it("flags garbled font output, but not an occasional symbol", () => {
    const bad = `${words(60)} ${"(cid:12)".repeat(20)}`;
    expect(check(bad)[0]).toMatch(/^error:Part of the/);
    expect(check(`${words(300)} �`)).toEqual([]);
  });
  it("flags table-like rows, from pipes or wide gaps, only when repeated", () => {
    const pipes = `${words(60)}\nA | B | C\nD | E | F\nG | H | I`;
    expect(check(pipes).join(",")).toMatch(/Rows with several/);
    expect(
      check(`${words(60)}\nSenior Engineer | Example Corp | 2020`).join(","),
    ).not.toMatch(/Rows with several/);
    const gaps = `${words(60)}\nPython    Go    Rust\nSQL    Git    AWS\nDocker    K8s    Linux`;
    expect(check(gaps).join(",")).toMatch(/Rows with several/);
  });
  it("detects headers and footers that repeat across pages, and contact details in them", () => {
    const pages = [
      `Alex Example alex@example.test\n${words(50)}`,
      `Alex Example alex@example.test\n${words(50)}`,
    ];
    expect(check(pages.join("\n"), pages).join(",")).toMatch(
      /^warn:Contact details repeat/,
    );
    const footer = [
      `${words(50)}\nConfidential draft`,
      `${words(50)}\nConfidential draft`,
    ];
    expect(check(footer.join("\n"), footer).join(",")).toMatch(
      /^info:Text repeats/,
    );
  });
  it("ignores page numbers and single-page documents", () => {
    const numbered = [
      `first ${words(50)}\nPage 1 of 2`,
      `second ${words(50)}\nPage 2 of 2`,
    ];
    expect(check(numbered.join("\n"), numbered)).toEqual([]);
    expect(check(`${words(80)}`, [words(80)])).toEqual([]);
  });
  it("flags almost no text for the page count", () => {
    expect(check("Alex Example", ["Alex Example"]).join(",")).toMatch(
      /Very little text/,
    );
    expect(check(words(120), [words(120)])).toEqual([]);
  });
  it("reaches the parse view and keeps existing checks intact", () => {
    const view = parseSim({
      text: `Alex Example\nalex@example.test\n${"(cid:5)".repeat(30)} ${words(60)}`,
      totalPages: 1,
    });
    expect(view.warnings.some((w) => /garbled/.test(w.message))).toBe(true);
    expect(view.warnings.some((w) => w.field === "sections")).toBe(true);
  });
});
