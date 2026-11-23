import { readFile, writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createLatexOwner } from "../tests/fixtures/latex-auth";
import {
  inspectLatexPdf,
  LATEX_EXPECTED_ORDER,
  SYNTHETIC_LATEX,
} from "../tests/fixtures/latex";

test.describe.configure({ mode: "serial" });
test.setTimeout(60000);

async function checkToolbarGeometry(page: Page) {
  const controls = [
    page.getByRole("button", { name: "Recompile", exact: true }),
    page.getByRole("button", { name: "Example options", exact: true }),
    page
      .getByRole("button", { name: "Download PDF", exact: true })
      .or(page.getByRole("link", { name: "Download PDF", exact: true })),
  ];
  for (const control of controls) await expect(control).toBeVisible();
  const boxes = await Promise.all(
    controls.map((control) => control.boundingBox()),
  );
  for (const box of boxes) {
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeCloseTo(boxes[0]!.height, 1);
  }
  expect(boxes[1]!.width).toBeCloseTo(boxes[1]!.height, 1);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!,
        b = boxes[j]!;
      expect(
        a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height,
      ).toBe(false);
    }
  }
  return boxes[2]!;
}

test("converter requires a session for page and compile requests", async ({
  page,
  request,
}) => {
  await page.goto("/build");
  await expect(page).toHaveURL(/\/auth\?next=/);
  const result = await request.post("/build/compile", {
    headers: { Origin: "http://127.0.0.1:3110" },
    data: { source: SYNTHETIC_LATEX, profile: "document" },
  });
  expect(result.status()).toBe(401);
  expect(result.headers()["cache-control"]).toContain("no-store");
  const legacyPage = await request.get("/latex?next=https://foreign.test", {
    maxRedirects: 0,
  });
  expect(legacyPage.status()).toBe(308);
  expect(legacyPage.headers().location).toBe("/build");
  expect(legacyPage.headers()["cache-control"]).toBe("private, no-store");
  const legacyPost = await request.post(
    "/latex/compile?target=https://foreign.test",
    {
      headers: { Origin: "http://127.0.0.1:3110" },
      data: { source: SYNTHETIC_LATEX, profile: "document" },
      maxRedirects: 0,
    },
  );
  expect([307, 308]).toContain(legacyPost.status());
  expect(legacyPost.headers().location).toBe("/build/compile");
  const followed = await request.post("/latex/compile", {
    headers: { Origin: "http://127.0.0.1:3110" },
    data: { source: SYNTHETIC_LATEX, profile: "document" },
  });
  expect(followed.status()).toBe(401); // A method-downgrading redirect would reach the resource GET rejection instead.
  expect(followed.url()).toMatch(/\/build\/compile$/);
});

test("exact current macro source compiles in place and downloads a real readable PDF", async ({
  page,
  context,
}) => {
  const owner = await createLatexOwner();
  try {
    await owner.login(context);
    await page.goto("/build");
    await expect(
      page.getByRole("heading", { name: "Build", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Build | Resumide");
    await expect(
      page.getByRole("complementary", { name: "Converter navigation" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Manually upload a PDF" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Write code, compile it and download your PDF."),
    ).toBeVisible();
    const source = page.getByRole("textbox", { name: "LaTeX source" });
    await source.fill(SYNTHETIC_LATEX);
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const disabledDownload = await checkToolbarGeometry(page);
    const sent = page.waitForRequest(
      (request) =>
        request.method() === "POST" && request.url().endsWith("/build/compile"),
    );
    await source.press("Control+Enter");
    expect((await sent).postDataJSON()).toEqual({
      source: SYNTHETIC_LATEX,
      profile: "document",
    });
    await expect(
      page.getByText("PDF ready. 2 pages.", { exact: true }),
    ).toBeVisible({ timeout: 25000 });
    await expect(page).toHaveURL(/\/build$/);
    const canvas = page.getByRole("img", { name: "PDF page 1 of 2" });
    await expect(canvas).toBeVisible();
    await expect
      .poll(() =>
        canvas.evaluate((element) => (element as HTMLCanvasElement).width),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        canvas.evaluate((element) => {
          const node = element as HTMLCanvasElement,
            context = node.getContext("2d");
          if (!context) return false;
          const pixels = context.getImageData(
            0,
            0,
            node.width,
            node.height,
          ).data;
          let ink = 0;
          for (let i = 0; i < pixels.length; i += 4)
            if (pixels[i + 3] > 0 && pixels[i] < 180) ink++;
          return ink > 20;
        }),
      )
      .toBe(true);
    const readyDownload = await checkToolbarGeometry(page);
    expect(readyDownload.width).toBeCloseTo(disabledDownload.width, 1);
    expect(readyDownload.height).toBeCloseTo(disabledDownload.height, 1);
    const readText = page.getByText("Read page text", { exact: true });
    await expect(readText).toHaveJSProperty("tagName", "SUMMARY");
    const readTextBox = await readText.boundingBox();
    expect(readTextBox).not.toBeNull();
    expect(readTextBox!.height).toBeGreaterThanOrEqual(44);
    await readText.focus();
    await expect(readText).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.locator('details[aria-label="Text for PDF page 1 of 2"]'),
    ).toHaveJSProperty("open", true);
    const firstPageText = page.getByRole("region", {
      name: "Extracted text for PDF page 1",
      exact: true,
    });
    await expect(firstPageText).toContainText("First Section");
    await expect(firstPageText).toContainText("Stable first item");
    await expect(firstPageText).not.toContainText("Closing phrase");
    await expect(firstPageText.locator("*")).toHaveCount(0);
    await page.screenshot({
      path: `${process.env.BROWSER_EVIDENCE_DIR ?? "docs/evaluation"}/build-toolbar-trixie-paperfix-20261106.png`,
      fullPage: true,
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(
      page.getByRole("img", { name: "PDF page 2 of 2" }),
    ).toBeVisible();
    const secondPageText = page.getByRole("region", {
      name: "Extracted text for PDF page 2",
      exact: true,
    });
    await expect(secondPageText).toContainText("Second Section");
    await expect(secondPageText).toContainText("Closing phrase");
    await expect(secondPageText).not.toContainText("First Section");
    await expect(firstPageText).toHaveCount(0);
    await expect(secondPageText.locator("*")).toHaveCount(0);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.getByRole("button", { name: "Fit", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download PDF" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("document.pdf");
    const file = await download.path();
    expect(file).toBeTruthy();
    const result = await inspectLatexPdf(new Uint8Array(await readFile(file!)));
    expect(result.pages).toBe(2);
    let cursor = -1;
    for (const phrase of LATEX_EXPECTED_ORDER) {
      const found = result.text.indexOf(phrase, cursor + 1);
      expect(found, phrase).toBeGreaterThan(cursor);
      cursor = found;
    }
    expect(result.links).toContain("https://example.org/reference");
    expect(result.dimensions[0].width).toBeCloseTo(595.276, 0);
    const legacySource = SYNTHETIC_LATEX.replace(
      "Closing phrase",
      "Legacy endpoint phrase",
    );
    const legacyResponse = await context.request.post("/latex/compile", {
      headers: { Origin: "http://127.0.0.1:3110" },
      data: { source: legacySource, profile: "document" },
    });
    expect(legacyResponse.status()).toBe(200);
    expect(legacyResponse.url()).toMatch(/\/build\/compile$/);
    expect(legacyResponse.headers()["cache-control"]).toBe("private, no-store");
    const legacyPdf = await inspectLatexPdf(
      new Uint8Array(await legacyResponse.body()),
    );
    expect(legacyPdf.text).toContain("Legacy endpoint phrase");
    await source.fill(
      SYNTHETIC_LATEX.replace("Closing phrase", "Changed closing phrase"),
    );
    await expect(page.getByRole("link", { name: "Download PDF" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("img", { name: /PDF page/ })).toHaveCount(0);
    await expect(
      page.getByText("Code changed. Recompile to update the PDF.", {
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await owner.cleanup();
  }
});

test("syntax failure and unsafe source reveal safe errors and allow retry", async ({
  page,
  context,
}) => {
  const owner = await createLatexOwner();
  try {
    await owner.login(context);
    await page.goto("/build");
    const source = page.getByRole("textbox", { name: "LaTeX source" });
    await source.fill(
      SYNTHETIC_LATEX.replace(
        "Opening phrase",
        String.raw`\unknowncommand Opening phrase`,
      ),
    );
    await page.getByRole("button", { name: "Recompile", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Compilation failed", {
      timeout: 25000,
    });
    await expect(page.getByRole("link", { name: "Download PDF" })).toHaveCount(
      0,
    );
    await source.fill(
      SYNTHETIC_LATEX.replace(
        "Opening phrase",
        String.raw`\input{/etc/passwd} Opening phrase`,
      ),
    );
    await page.getByRole("button", { name: "Recompile", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("prohibited operation");
    await expect(page.getByRole("alert")).not.toContainText("/etc/passwd");
    await source.fill(SYNTHETIC_LATEX);
    await page.getByRole("button", { name: "Recompile", exact: true }).click();
    await expect(
      page.getByText("PDF ready. 2 pages.", { exact: true }),
    ).toBeVisible({ timeout: 25000 });
  } finally {
    await owner.cleanup();
  }
});

test("browser-origin policy rejects cross-site and absent Origin requests", async ({
  page,
  context,
}) => {
  const owner = await createLatexOwner();
  try {
    await owner.login(context);
    await page.goto("/build");
    for (const headers of [{ Origin: "https://foreign.test" }, {}] as Array<
      Record<string, string>
    >) {
      const response = await context.request.post("/build/compile", {
        headers,
        data: { source: SYNTHETIC_LATEX, profile: "document" },
      });
      expect(response.status()).toBe(403);
    }
  } finally {
    await owner.cleanup();
  }
});

test("keyboard resizing, source replacement and mobile views preserve the current buffer", async ({
  page,
  context,
}) => {
  const owner = await createLatexOwner();
  try {
    await owner.login(context);
    await page.goto("/build");
    const source = page.getByRole("textbox", { name: "LaTeX source" });
    await source.fill(SYNTHETIC_LATEX);
    const splitter = page.getByRole("separator", {
      name: "Resize editor and PDF preview",
    });
    await splitter.focus();
    await page.keyboard.press("ArrowRight");
    await expect(splitter).toHaveAttribute("aria-valuenow", "55");
    await page
      .getByRole("button", { name: "Collapse editor", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Expand editor", exact: true })
      .click();
    await expect(source).toHaveValue(SYNTHETIC_LATEX);
    await page
      .getByRole("button", { name: "Example options", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Example paper", exact: true })
      .selectOption("LETTER");
    await expect(source).toHaveValue(SYNTHETIC_LATEX);
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Load example", exact: true })
      .click();
    await expect(source).toHaveValue(/letterpaper/);
    await source.fill(SYNTHETIC_LATEX);
    await page.setViewportSize({ width: 930, height: 978 });
    await expect(source).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Compilation workspace" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Code", exact: true }),
    ).toBeHidden();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page
        .getByRole("button", { name: "PDF preview", exact: true })
        .click();
      await checkToolbarGeometry(page);
      const options = page.getByRole("button", {
        name: "Example options",
        exact: true,
      });
      if ((await options.getAttribute("aria-expanded")) === "true")
        await options.click();
      await options.focus();
      await page.keyboard.press("Enter");
      await expect(options).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator("#latex-example-options")).toBeVisible();
      await expect(options).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(options).toHaveAttribute("aria-expanded", "false");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.getByRole("button", { name: "Code", exact: true }).click();
      await expect(source).toHaveValue(SYNTHETIC_LATEX);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  } finally {
    await owner.cleanup();
  }
});

test("cancellation and late response cannot restore a stale preview (transport fault injection)", async ({
  page,
  context,
}) => {
  const owner = await createLatexOwner();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await owner.login(context);
    await page.goto("/build");
    await page.route("**/build/compile", async (route) => {
      await gate;
      try {
        await route.fulfill({
          status: 503,
          json: {
            code: "runtime_unavailable",
            error: "The converter is unavailable.",
          },
        });
      } catch (error) {
        if (!(
          error instanceof Error &&
          /closed|cancelled|aborted|handled/i.test(error.message)
        ))
          throw error;
      }
    });
    const source = page.getByRole("textbox", { name: "LaTeX source" });
    await source.fill(SYNTHETIC_LATEX);
    await page.getByRole("button", { name: "Recompile", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByText("Compilation cancelled.", { exact: true }),
    ).toBeVisible();
    await source.fill(SYNTHETIC_LATEX + "% current edit\n");
    release();
    await expect(source).toHaveValue(SYNTHETIC_LATEX + "% current edit\n");
    await expect(page.getByRole("link", { name: "Download PDF" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("alert")).toHaveCount(0);
  } finally {
    release();
    await owner.cleanup();
  }
});

test("selected code and native dropdown options stay readable in both themes", async ({
  page,
  context,
}) => {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const { selectSiteTheme } = await import("./site-menu");
  const owner = await createLatexOwner();
  const sample = String.raw`\documentclass{article}
% Synthetic selected text stays readable.
\begin{document}
Selected code must remain visible.
\textbf{Readable selection in both themes.}
\end{document}`;
  const rgb = (value: string) => {
    const values = value.match(/[\d.]+/gu)?.map(Number) ?? [];
    return [values[0], values[1], values[2], values.length > 3 ? values[3] : 1];
  };
  const luminance = (value: number[]) =>
    value
      .slice(0, 3)
      .map((c) => {
        const n = c / 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      })
      .reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a: number[], b: number[]) => {
    const x = luminance(a),
      y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const observations: Array<{
    mode: string;
    visibleInkPixels: number;
    minimumOptionContrast: number;
    selectionContrast: number;
  }> = [];
  try {
    await owner.login(context);
    await page.goto("/build");
    const source = page.getByRole("textbox", { name: "LaTeX source" });
    await source.fill(sample);
    for (const scenario of [
      {
        label: "light",
        theme: "light",
        system: "light",
        forced: "none",
        width: 1280,
      },
      {
        label: "dark",
        theme: "dark",
        system: "dark",
        forced: "none",
        width: 1280,
      },
      {
        label: "system-dark",
        theme: "system",
        system: "dark",
        forced: "none",
        width: 1280,
      },
      {
        label: "mobile-dark",
        theme: "dark",
        system: "dark",
        forced: "none",
        width: 390,
      },
      {
        label: "forced-colors",
        theme: "dark",
        system: "dark",
        forced: "active",
        width: 1280,
      },
    ] as const) {
      const theme = scenario.label;
      let minimumOptionContrast = Infinity;
      await page.setViewportSize({ width: scenario.width, height: 844 });
      await page.emulateMedia({
        colorScheme: scenario.system,
        forcedColors: scenario.forced,
      });
      await selectSiteTheme(page, scenario.theme);
      await source.focus();
      await source.press("ControlOrMeta+A");
      expect(
        await source.evaluate((el) => {
          const n = el as HTMLTextAreaElement;
          return n.selectionEnd - n.selectionStart;
        }),
      ).toBe(sample.length);
      // Resolve the token to RGB rather than interpreting its hexadecimal source.
      let selectedInk = rgb(
        await source.evaluate((el) => {
          const probe = document.createElement("span");
          probe.style.color = "var(--ink)";
          el.parentElement!.append(probe);
          const value = getComputedStyle(probe).color;
          probe.remove();
          return value;
        }),
      );
      const selectionPair = await source.evaluate((el) => {
        const s = getComputedStyle(el, "::selection");
        return { color: s.color, background: s.backgroundColor };
      });
      if (scenario.forced === "active") selectedInk = rgb(selectionPair.color);
      const selectionContrast = contrast(
        rgb(selectionPair.color),
        rgb(selectionPair.background),
      );
      expect.soft(selectionContrast).toBeGreaterThanOrEqual(4.5);
      const shot = await source.screenshot({
        path: `${process.env.BROWSER_EVIDENCE_DIR ?? "docs/evaluation"}/editor-selection-${theme}-after-20261031.png`,
      });
      const image = await loadImage(shot);
      const canvas = createCanvas(image.width, image.height);
      const draw = canvas.getContext("2d");
      draw.drawImage(image, 0, 0);
      // Inspect only selected line rectangles, so forced-colors page background
      // cannot be mistaken for black glyphs on a system highlight.
      const rectangles = await source.evaluate((el) => {
        const input = el as HTMLTextAreaElement,
          s = getComputedStyle(input);
        const measure = document.createElement("canvas").getContext("2d")!;
        measure.font = s.font;
        const x = parseFloat(s.paddingLeft),
          y = parseFloat(s.paddingTop),
          height = parseFloat(s.lineHeight);
        return input.value.split("\n").map((line, index) => ({
          x: Math.ceil(x + 1),
          y: Math.ceil(y + index * height + 1),
          width: Math.floor(
            Math.min(
              measure.measureText(line).width - 2,
              input.clientWidth - x - 2,
            ),
          ),
          height: Math.floor(height - 2),
        }));
      });
      let readablePixels = 0;
      for (const rect of rectangles) {
        const pixels = draw.getImageData(
          rect.x,
          rect.y,
          rect.width,
          rect.height,
        ).data;
        for (let i = 0; i < pixels.length; i += 4) {
          if (
            Math.max(
              ...selectedInk
                .slice(0, 3)
                .map((v, c) => Math.abs(v - pixels[i + c])),
            ) < 65
          )
            readablePixels++;
        }
      }
      expect
        .soft(
          readablePixels,
          `${theme}: selected characters must actually render`,
        )
        .toBeGreaterThan(200);
      await expect(source).toHaveValue(sample);
      await page.getByLabel("Open site menu").click();
      const themeSelect = page.getByRole("combobox", { name: "Color theme" });
      const options = await themeSelect.locator("option").evaluateAll((nodes) =>
        nodes.map((node) => {
          const s = getComputedStyle(node);
          return { color: s.color, background: s.backgroundColor };
        }),
      );
      for (const option of options) {
        const background = rgb(option.background);
        expect
          .soft(
            background[3],
            `${theme}: native option background must not fall back to the OS palette`,
          )
          .toBe(1);
        minimumOptionContrast = Math.min(
          minimumOptionContrast,
          background[3] === 1 ? contrast(rgb(option.color), background) : 0,
        );
        if (background[3] === 1)
          expect
            .soft(contrast(rgb(option.color), background))
            .toBeGreaterThanOrEqual(4.5);
      }
      await themeSelect.click();
      await page.screenshot({
        path: `${process.env.BROWSER_EVIDENCE_DIR ?? "docs/evaluation"}/theme-options-${theme}-after-20261031.png`,
      });
      await page.keyboard.press("Escape");
      await page.getByLabel("Open site menu").click();
      if (scenario.width < 768)
        await page
          .getByRole("button", { name: "PDF preview", exact: true })
          .click();
      await page
        .getByRole("button", { name: "Example options", exact: true })
        .click();
      for (const label of ["Example", "Example paper"]) {
        const select = page.getByRole("combobox", { name: label, exact: true });
        const pairs = await select.locator("option").evaluateAll((nodes) =>
          nodes.map((node) => {
            const s = getComputedStyle(node);
            return { color: s.color, background: s.backgroundColor };
          }),
        );
        for (const pair of pairs) {
          const bg = rgb(pair.background);
          expect.soft(bg[3]).toBe(1);
          minimumOptionContrast = Math.min(
            minimumOptionContrast,
            bg[3] === 1 ? contrast(rgb(pair.color), bg) : 0,
          );
          if (bg[3] === 1)
            expect
              .soft(contrast(rgb(pair.color), bg))
              .toBeGreaterThanOrEqual(4.5);
        }
      }
      await page
        .getByRole("button", { name: "Example options", exact: true })
        .click();
      if (scenario.width < 768) {
        await page.getByRole("button", { name: "Code", exact: true }).click();
        await expect(source).toHaveValue(sample);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      observations.push({
        mode: theme,
        visibleInkPixels: readablePixels,
        minimumOptionContrast,
        selectionContrast,
      });
    }
    await writeFile(
      `${process.env.BROWSER_EVIDENCE_DIR ?? "docs/evaluation"}/EDITOR_CONTRAST_RECEIPT_20261031.json`,
      JSON.stringify(
        {
          date: "2026-10-31",
          ...(process.env.RESUMIDE_PRIVATE_VERIFY === "aa7-owned-synthetic"
            ? {
                observedAt: new Date().toISOString(),
                run: {
                  mode: "aa7-owned-synthetic",
                  evidenceDirectory: process.env.BROWSER_EVIDENCE_DIR,
                  candidateImage: process.env.LATEX_COMPILER_IMAGE,
                  historicalCaseDate: "2026-10-31",
                },
              }
            : {}),
          observations,
          passed: test.info().errors.length === 0,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await owner.cleanup();
  }
});
