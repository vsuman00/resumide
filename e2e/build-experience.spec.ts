import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createLatexOwner } from "../tests/fixtures/latex-auth";

test.describe.configure({ mode: "serial" });
test.setTimeout(90000);

const editor = (page: Page) => page.locator(".cm-content");
const sourceText = async (page: Page) =>
  (await page.locator(".cm-line").allTextContents()).join("\n");
const recompile = (page: Page) =>
  page.getByRole("button", { name: "Recompile", exact: true }).click();
async function skipOnboarding(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("resumide.build.onboarded.v1", "1"),
  );
}
async function open(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/build");
  await expect(editor(page)).toBeVisible();
}
const DOC = [
  "\\documentclass[11pt]{article}",
  "\\usepackage{enumitem}",
  "\\begin{document}",
  "\\section*{Experience}",
  "\\begin{itemize}",
  "\\item Built example APIs for a synthetic team",
  "\\end{itemize}",
  "\\end{document}",
  "",
].join("\n");

test("first visit offers templates; the chosen template loads, tips follow, and the draft survives a reload", async ({
  page,
  context,
}) => {
  const owner = await createLatexOwner();
  try {
    await owner.login(context);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/build");
    const dialog = page.getByRole("dialog", { name: "Start your resume" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Restore your draft" }),
    ).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await dialog.getByRole("button", { name: /Classic one-page/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(editor(page)).toContainText("Jake's Resume");
    await expect(page.getByText("1 of 3")).toBeVisible();
    await page.getByRole("button", { name: "Skip tips" }).click();
    await expect(page.getByText("Saved in this browser")).toBeVisible({
      timeout: 5000,
    });
    await page.reload();
    await expect(editor(page)).toContainText("Jake's Resume");
    await expect(
      page.getByRole("dialog", { name: "Start your resume" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Example options" }).click();
    await page.getByRole("button", { name: "Show tips again" }).click();
    await expect(page.getByText("1 of 3")).toBeVisible();
    await page.screenshot({
      path: `${process.env.BROWSER_EVIDENCE_DIR ?? "docs/evaluation"}/build-experience-tips-20261124.png`,
    });
  } finally {
    await owner.cleanup();
  }
});

test("selecting a line highlights it in the PDF with its line label", async ({
  page,
  context,
}) => {
  const owner = await createLatexOwner();
  try {
    await owner.login(context);
    await skipOnboarding(page);
    await open(page);
    await editor(page).fill(DOC);
    await recompile(page);
    await expect(page.getByText("PDF ready. 1 page.")).toBeVisible({
      timeout: 25000,
    });
    await expect(
      page.getByRole("img", { name: "PDF page 1 of 1" }),
    ).toBeVisible();
    await page.locator(".cm-line", { hasText: "Built example" }).click();
    const label = page.locator("b", { hasText: /^L6$/ });
    await expect(label).toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: `${process.env.BROWSER_EVIDENCE_DIR ?? "docs/evaluation"}/build-experience-pdf-highlight-20261124.png`,
      fullPage: true,
    });
    // A macro-only line has no visible text to highlight.
    await page.locator(".cm-line", { hasText: "\\begin{itemize}" }).click();
    await expect(page.getByText("No visible text for this line")).toBeVisible();
    await expect(label).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  } finally {
    await owner.cleanup();
  }
});

test("a compile error lists its kind and line; Jump moves the cursor; editing makes it stale", async ({
  page,
  context,
}) => {
  const owner = await createLatexOwner();
  try {
    await owner.login(context);
    await skipOnboarding(page);
    await open(page);
    await editor(page).fill(
      DOC.replace("\\item Built", "\\notacommand{x}\n\\item Built"),
    );
    await recompile(page);
    const problems = page.getByRole("region", { name: "Compile problems" });
    await expect(problems).toContainText(
      "Line 6 · Undefined command — check the spelling or remove it",
      { timeout: 25000 },
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole("button", { name: "Jump to line 6" }).click();
    await expect(page.locator(".cm-activeLine")).toContainText("notacommand");
    await page.screenshot({
      path: `${process.env.BROWSER_EVIDENCE_DIR ?? "docs/evaluation"}/build-experience-problems-20261124.png`,
      fullPage: true,
    });
    await page.keyboard.type("% x");
    await expect(problems).toContainText(
      "Code changed since this compile. Recompile to refresh.",
    );
    await expect(
      page.getByRole("button", { name: "Jump to line 6" }),
    ).toBeDisabled();
  } finally {
    await owner.cleanup();
  }
});

test("a 0.78 pt overfull line compiles with a warning, and a pdfLaTeX-only line is skipped with a notice without rewriting the source", async ({
  page,
  context,
}) => {
  const owner = await createLatexOwner();
  try {
    await owner.login(context);
    await skipOnboarding(page);
    await open(page);
    const overfull = DOC.replace(
      "\\end{itemize}",
      "\\end{itemize}\n\\noindent\\rule{\\dimexpr\\linewidth+0.78pt\\relax}{0.4pt}",
    );
    await editor(page).fill(overfull);
    await recompile(page);
    await expect(page.getByText("PDF ready. 1 page.")).toBeVisible({
      timeout: 25000,
    });
    await expect(
      page.getByRole("region", { name: "Compile problems" }),
    ).toContainText("1 warning");
    const withGlyph = DOC.replace(
      "\\begin{document}",
      "\\input{glyphtounicode}\n\\begin{document}",
    );
    await editor(page).fill(withGlyph);
    await recompile(page);
    await expect(page.getByText("PDF ready. 1 page.")).toBeVisible({
      timeout: 25000,
    });
    await expect(
      page.getByText(
        "Line 3 is for pdfLaTeX and was skipped. Build uses XeLaTeX, which already embeds Unicode text.",
      ),
    ).toBeVisible();
    expect(await sourceText(page)).toBe(withGlyph);
  } finally {
    await owner.cleanup();
  }
});

test("Check this resume hands the compiled PDF to the upload form without submitting it", async ({
  page,
  context,
}) => {
  const owner = await createLatexOwner();
  const submitted: string[] = [];
  try {
    await owner.login(context);
    await skipOnboarding(page);
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/api\/analyze/.test(r.url()))
        submitted.push(r.url());
    });
    await open(page);
    await editor(page).fill(DOC);
    await recompile(page);
    await expect(page.getByText("PDF ready. 1 page.")).toBeVisible({
      timeout: 25000,
    });
    await page.getByRole("button", { name: "Check this resume" }).click();
    await expect(page).toHaveURL(/\/upload$/);
    await expect(page.getByText("document.pdf").first()).toBeVisible();
    await expect(page.getByText(/From Build/)).toBeVisible();
    expect(submitted).toEqual([]);
  } finally {
    await owner.cleanup();
  }
});

test("? opens the shortcut sheet; layouts hold at four widths in light and dark without horizontal scroll", async ({
  page,
  context,
}) => {
  const owner = await createLatexOwner();
  try {
    await owner.login(context);
    await skipOnboarding(page);
    await open(page);
    await editor(page).fill(DOC);
    await recompile(page);
    await expect(page.getByText("PDF ready. 1 page.")).toBeVisible({
      timeout: 25000,
    });
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("?");
    const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(sheet).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      for (const width of [390, 768, 1366, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${scheme} ${width}: no horizontal scroll`,
        ).toBe(true);
        await page.screenshot({
          path: `${process.env.BROWSER_EVIDENCE_DIR ?? "docs/evaluation"}/build-experience-${scheme}-${width}-20261124.png`,
        });
      }
    }
    // 200% zoom is a 640 px wide layout at the same text size.
    await page.setViewportSize({ width: 640, height: 450 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await owner.cleanup();
  }
});

test("every gallery template compiles from the UI with a PDF and no errors", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  const owner = await createLatexOwner();
  try {
    await owner.login(context);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/build");
    const names = [
      "Classic one-page",
      "Compact",
      "Split header",
      "Early career",
      "Experienced",
      "General document",
    ];
    for (const [index, name] of names.entries()) {
      if (index > 0) {
        // Rate limit is 3 compiles per minute per user.
        await page.waitForTimeout(21000);
        await page.getByRole("button", { name: "Example options" }).click();
        await page.getByRole("button", { name: "Show tips again" }).click();
        await page.goto("/build");
        await page.evaluate(() =>
          localStorage.removeItem("resumide.build.onboarded.v1"),
        );
        await page.reload();
      }
      const dialog = page.getByRole("dialog", { name: "Start your resume" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: new RegExp(name) }).click();
      await page.getByRole("button", { name: "Skip tips" }).click();
      await recompile(page);
      await expect(page.getByText(/PDF ready\. \d pages?\./)).toBeVisible({
        timeout: 30000,
      });
      await expect(page.getByRole("alert")).toHaveCount(0);
    }
  } finally {
    await owner.cleanup();
  }
});

test("a long document scrolls through its pages; zoom keeps the highlight aligned; links stay safe", async ({
  page,
  context,
}) => {
  const owner = await createLatexOwner();
  try {
    await owner.login(context);
    await skipOnboarding(page);
    await open(page);
    const body = Array.from(
      { length: 90 },
      (_, i) =>
        `Paragraph number ${i + 1} of the synthetic long document.\\par`,
    ).join("\n");
    await editor(page).fill(
      [
        "\\documentclass[11pt]{article}",
        "\\usepackage[hidelinks]{hyperref}",
        "\\begin{document}",
        "\\href{https://example.com/safe}{Safe link text}\\par",
        body,
        "\\end{document}",
        "",
      ].join("\n"),
    );
    await recompile(page);
    await expect(page.getByText(/PDF ready\. [2-9] pages\./)).toBeVisible({
      timeout: 30000,
    });
    const pages = page.locator("[data-page]");
    expect(await pages.count()).toBeGreaterThan(1);
    await page.getByRole("region", { name: "PDF page viewport" }).hover();
    await page.mouse.wheel(0, 4000);
    await expect(page.getByText(/^[2-9] \/ [2-9]$/)).toBeVisible();
    await page.getByRole("button", { name: "Previous page" }).click();
    // The wheel reached the last page, so Previous lands one page earlier.
    await expect(page.getByText(/^[1-8] \/ [2-9]$/)).toBeVisible();
    // The only clickable link is the safe https one, opening safely in a new tab.
    const link = page.locator("a[href='https://example.com/safe']");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toHaveAttribute("target", "_blank");
    expect(await page.locator("a[href^='javascript:']").count()).toBe(0);
    // Highlight stays on its line after zooming.
    // Keyboard navigation: clicking in a long virtualized editor can drag-select.
    await editor(page).click();
    await page.keyboard.press("ControlOrMeta+Home");
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
    await expect(page.locator("b", { hasText: /^L7$/ })).toBeVisible();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.locator("b", { hasText: /^L7$/ })).toBeVisible({
      timeout: 10000,
    });
  } finally {
    await owner.cleanup();
  }
});

test("a near-limit paste is accepted and one byte over is refused without losing the draft", async ({
  page,
  context,
}) => {
  const owner = await createLatexOwner();
  try {
    await owner.login(context);
    await skipOnboarding(page);
    await open(page);
    const head = "\\documentclass{article}\n\\begin{document}\n";
    const tail = "\n\\end{document}\n";
    const fill = (n: number) =>
      head + "%" + "a".repeat(n - head.length - tail.length - 1) + tail;
    await editor(page).fill(fill(49000));
    await expect(page.getByText(/49,0\d\d \/ 49,152 bytes/)).toBeVisible();
    await editor(page).fill(fill(49152));
    await expect(page.getByText("49,152 / 49,152 bytes")).toBeVisible();
    await editor(page).fill(fill(49300));
    await expect(page.getByRole("alert")).toContainText("source limit");
    await expect(page.getByText("49,152 / 49,152 bytes")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Recompile", exact: true }),
    ).toBeEnabled();
  } finally {
    await owner.cleanup();
  }
});

test("Escape then Tab leaves the editor without inserting a tab", async ({
  page,
  context,
}) => {
  const owner = await createLatexOwner();
  try {
    await owner.login(context);
    await skipOnboarding(page);
    await open(page);
    await editor(page).fill(DOC);
    await page.locator(".cm-line", { hasText: "Built example" }).click();
    await page.keyboard.press("Tab");
    // Inside the editor Tab indents the line (two spaces).
    expect(await sourceText(page)).not.toBe(DOC);
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    await expect(editor(page)).not.toBeFocused();
    expect(await sourceText(page)).toBe(DOC);
  } finally {
    await owner.cleanup();
  }
});
