import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  admitCurrentRenderOutput,
  assertCurrentPdfSemantics,
  decodeCurrentPdf,
  decodeCurrentPng,
  parseCurrentRenderArguments,
  validateCurrentRenderReply,
} from "../../scripts/verify-latex-current-render";
import { LATEX_EXPECTED_ORDER } from "../fixtures/latex";

const image = `sha256:${"a".repeat(64)}`;
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2o0AAAAASUVORK5CYII=";
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true });
});
function directory() {
  const path = join(
    realpathSync("/tmp"),
    `resumide-latex-current-render-${randomUUID()}`,
  );
  mkdirSync(path, { mode: 0o700 });
  directories.push(path);
  return path;
}
function parsed() {
  return {
    pages: 2,
    text: LATEX_EXPECTED_ORDER.join(" ") + " a²+b²=c² and α∈ℝ",
    dimensions: [
      { width: 595.276, height: 841.89 },
      { width: 595.276, height: 841.89 },
    ],
    links: ["https://example.org/reference"],
    taggedPages: 0,
  };
}

describe("current-candidate-only render admission", () => {
  it("requires one exact candidate and an explicitly allocated output directory", () => {
    const output = directory();
    expect(
      parseCurrentRenderArguments([
        "--run-current-render",
        "--image",
        image,
        "--output-dir",
        output,
      ]),
    ).toEqual({ imageId: image, outputDirectory: output });
    for (const args of [
      [],
      [image, image],
      [
        "--run-current-render",
        "--image",
        "candidate:latest",
        "--output-dir",
        output,
      ],
      [
        "--run-current-render",
        "--image",
        image,
        "--output-dir",
        output,
        "--baseline",
        image,
      ],
    ])
      expect(() => parseCurrentRenderArguments(args)).toThrow();
  });
  it("rejects an incomplete invocation through the installed CLI before any Docker call", () => {
    const output = directory(),
      bin = join(output, "bin"),
      marker = join(output, "docker-called");
    mkdirSync(bin, { mode: 0o700 });
    writeFileSync(
      join(bin, "docker"),
      `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},'called');process.exit(125);\n`,
      { mode: 0o700 },
    );
    const result = spawnSync(
      process.execPath,
      [
        "node_modules/vite-node/vite-node.mjs",
        "--config",
        "vitest.config.ts",
        "scripts/verify-latex-current-render.ts",
      ],
      {
        cwd: process.cwd(),
        env: {
          PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
          RESUMIDE_PRIVATE_VERIFY: "aa7-owned-synthetic",
        },
        encoding: "utf8",
        timeout: 5000,
        maxBuffer: 65536,
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("current_render_arguments");
    expect(existsSync(marker)).toBe(false);
  });
  it("admits the documented CLI shape and empty output before the first scoped Docker trap", () => {
    const output = directory(),
      trap = directory(),
      bin = join(trap, "bin"),
      marker = join(trap, "docker-calls");
    mkdirSync(bin, { mode: 0o700 });
    writeFileSync(
      join(bin, "docker"),
      `#!${process.execPath}\nrequire('node:fs').appendFileSync(${JSON.stringify(marker)},JSON.stringify(process.argv.slice(2))+'\\n');process.exit(125);\n`,
      { mode: 0o700 },
    );
    const result = spawnSync(
      process.execPath,
      [
        "node_modules/vite-node/vite-node.mjs",
        "--config",
        "vitest.config.ts",
        "scripts/verify-latex-current-render.ts",
        "--",
        "--run-current-render",
        "--image",
        image,
        "--output-dir",
        output,
      ],
      {
        cwd: process.cwd(),
        env: {
          PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
          RESUMIDE_PRIVATE_VERIFY: "aa7-owned-synthetic",
        },
        encoding: "utf8",
        timeout: 5000,
        maxBuffer: 65536,
      },
    );
    expect(result.status).not.toBe(0); // The admitted fake transport deliberately refuses.
    expect(result.stderr).not.toContain("current_render_arguments");
    expect(result.stderr).not.toContain("current_render_output_admission");
    const calls = readFileSync(marker, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(calls).toEqual([
      ["ps", "-a", "-q", "--filter", "label=resumide.latex.service=converter"],
    ]);
    expect(readdirSync(output)).toEqual([]);
  });
  it("admits only fresh owned canonical private output, refusing symlink/public/nonempty destinations", () => {
    const path = directory();
    expect(admitCurrentRenderOutput(path).path).toBe(path);
    chmodSync(path, 0o755);
    expect(() => admitCurrentRenderOutput(path)).toThrow();
    chmodSync(path, 0o700);
    writeFileSync(join(path, "existing"), "synthetic", { mode: 0o600 });
    expect(() => admitCurrentRenderOutput(path)).toThrow();
    const link = directory();
    rmSync(link, { recursive: true });
    symlinkSync(path, link);
    expect(() => admitCurrentRenderOutput(link)).toThrow();
    expect(() => admitCurrentRenderOutput("/tmp")).toThrow();
  });
});

describe("current neutral PDF semantics", () => {
  it("recovers ordered text, math, links and A4 dimensions while reporting untagged output honestly", () => {
    expect(assertCurrentPdfSemantics(parsed())).toMatchObject({
      pages: 2,
      taggedPages: 0,
      normalizedText: expect.stringContaining("α∈R"),
    });
  });
  it.each([
    "missing-heading",
    "order",
    "glyph",
    "math",
    "polynomial",
    "link",
    "dimensions",
    "page-count",
  ])("rejects %s regression", (reason) => {
    const value = parsed();
    if (reason === "missing-heading")
      value.text = value.text.replace("First Section", "");
    if (reason === "order")
      value.text = value.text.replace("First Section", "Second Section");
    if (reason === "glyph") value.text += "\uFFFD";
    if (reason === "math") value.text = value.text.replace("α∈ℝ", "");
    if (reason === "polynomial")
      value.text = value.text.replace("a²+b²=c²", "");
    if (reason === "link") value.links.push("https://unexpected.example/");
    if (reason === "dimensions") value.dimensions[1].width = 612;
    if (reason === "page-count") value.pages = 1;
    expect(() => assertCurrentPdfSemantics(value)).toThrow();
  });
  it("rejects an invalid compiler envelope before invoking PDF parsing", () => {
    const bytes = Buffer.from("%PDF-1.7\nneutral-envelope-only");
    expect(
      decodeCurrentPdf({ pages: 2, pdf: bytes.toString("base64") }),
    ).toEqual(bytes);
    for (const value of [
      { pages: 2, pdf: "%%%%" },
      { pages: 2, pdf: bytes.toString("base64") + "\n" },
      { pages: 1, pdf: bytes.toString("base64") },
      { pages: 2, pdf: bytes.toString("base64"), error: "output_invalid" },
    ])
      expect(() => decodeCurrentPdf(value)).toThrow();
  });
});

describe("rendered PNG/font artifact validation", () => {
  it("checks a real one-pixel PNG envelope and expected 96dpi dimensions", () => {
    expect(decodeCurrentPng(png, { width: 0.75, height: 0.75 })).toMatchObject({
      width: 1,
      height: 1,
    });
    expect(() => decodeCurrentPng(png, { width: 20, height: 20 })).toThrow();
    for (const value of [
      "",
      png + "!",
      Buffer.from("not png").toString("base64"),
      Buffer.alloc(2097153).toString("base64"),
    ])
      expect(() =>
        decodeCurrentPng(value, { width: 0.75, height: 0.75 }),
      ).toThrow();
  });
  it("refuses truncated or oversized PNG dimensions", () => {
    const bytes = Buffer.from(png, "base64");
    expect(() =>
      decodeCurrentPng(bytes.subarray(0, 24).toString("base64"), {
        width: 0.75,
        height: 0.75,
      }),
    ).toThrow();
    bytes.writeUInt32BE(1601, 16);
    expect(() =>
      decodeCurrentPng(bytes.toString("base64"), {
        width: 1200.75,
        height: 0.75,
      }),
    ).toThrow();
  });
  it("requires two rendered pages and embedded fonts without inventing a Unicode-map or accessibility claim", () => {
    const reply = {
      renderer: "pdftoppm version synthetic",
      fonts: [
        {
          name: "SyntheticFont",
          embedded: true,
          subset: true,
          unicodeMap: false,
        },
      ],
      pages: [{ png }, { png }],
    };
    const dimensions = [
      { width: 0.75, height: 0.75 },
      { width: 0.75, height: 0.75 },
    ];
    expect(validateCurrentRenderReply(reply, dimensions).pages).toHaveLength(2);
    expect(() =>
      validateCurrentRenderReply({ ...reply, fonts: [] }, dimensions),
    ).toThrow();
    expect(() =>
      validateCurrentRenderReply(
        { ...reply, fonts: [{ ...reply.fonts[0], embedded: false }] },
        dimensions,
      ),
    ).toThrow();
    expect(() =>
      validateCurrentRenderReply({ ...reply, pages: [{ png }] }, dimensions),
    ).toThrow();
    expect(() =>
      validateCurrentRenderReply({ ...reply, renderer: "" }, dimensions),
    ).toThrow();
  });
});
