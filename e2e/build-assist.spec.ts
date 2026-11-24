import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  BUILD_AI_SOURCE,
  createBuildAssistOwner,
} from "../tests/fixtures/build-assist";
test.describe.configure({ mode: "serial" });
test.setTimeout(60000);
const PANEL = (page: Page) => page.getByRole("dialog", { name: "Ask AI" });
const editorText = (page: Page) => page.locator(".cm-content");
// The editor is CodeMirror: select the "Helped reduce" line with the keyboard.
async function selectLine(page: Page, open = true) {
  await page.locator(".cm-line", { hasText: "Helped reduce" }).click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  if (open) {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(PANEL(page)).toBeVisible();
  }
}
// Document text from CodeMirror lines (textContent keeps empty lines empty).
async function sourceText(page: Page) {
  return (await page.locator(".cm-line").allTextContents()).join("\n");
}
async function setSource(page: Page, value: string) {
  await editorText(page).fill(value);
}
async function ask(page: Page) {
  await page
    .getByRole("checkbox", {
      name: "I agree to send this selected context for this request.",
    })
    .check();
  await page.getByRole("button", { name: "Ask AI", exact: true }).click();
}
async function dismissOnboarding(page: Page) {
  const close = page.getByRole("dialog", { name: "Start your resume" });
  if (await close.isVisible().catch(() => false))
    await page.getByRole("button", { name: "Paste your LaTeX" }).click();
  await page
    .getByRole("button", { name: "Skip tips" })
    .click()
    .catch(() => undefined);
}
// The hosted AI budget is a separate approval, so /build/suggest is answered at the browser
// boundary with replies bound to each request's hash. Server checks are unit-tested.
async function mockSuggest(page: Page, counter: { calls: number }) {
  await page.route("**/build/suggest", async (route) => {
    counter.calls++;
    const body = JSON.parse(route.request().postData() ?? "{}") as {
      source: string;
      sourceHash: string;
      startLine: number;
      endLine: number;
      mode: string;
    };
    const lines = body.source.split("\n");
    const originalText = lines
      .slice(body.startLine - 1, body.endLine)
      .join("\n");
    const has = (marker: string) => originalText.includes(marker);
    const fail = (status: number, code: string) =>
      route.fulfill({ status, json: { code, error: code } });
    if (has("SLOW_OUTPUT")) await new Promise((r) => setTimeout(r, 30000));
    if (has("DELAY_OUTPUT")) await new Promise((r) => setTimeout(r, 900));
    if (has("BAD_JSON")) return fail(422, "output_invalid");
    if (has("REFUSE_OUTPUT")) return fail(422, "provider_refused");
    const advice =
      has("UNSAFE_OUTPUT") || has("QUESTION_OUTPUT") || has("METRIC_OUTPUT");
    return route.fulfill({
      json: {
        sourceHash: body.sourceHash,
        startLine: body.startLine,
        endLine: body.endLine,
        mode: body.mode,
        originalText,
        requiresFactConfirmation: body.mode === "resume" && !advice,
        suggestion: advice
          ? {
              operation: "advice",
              replacement: null,
              explanation:
                "Add the evidence for this claim before rewording it.",
              questions: ["What was measured?"],
            }
          : {
              operation: "replace",
              replacement: originalText.replace("Helped", "\\textbf{Helped}"),
              explanation: "Emphasizes the action verb.",
              questions: [],
            },
      },
    });
  });
}
async function openBuild(page: Page) {
  // Also proves the reduced-motion path: panels and diffs must not depend on animation.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/build");
  await expect(editorText(page)).toBeVisible();
  // A second editor instance would mean a leaked CodeMirror view.
  await expect(page.locator(".cm-editor")).toHaveCount(1);
  await dismissOnboarding(page);
}
test("hover never opens AI; selecting shows the chip, Cmd/Ctrl+K opens context disclosure with no request; Escape restores the editor", async ({
  page,
  context,
}) => {
  const owner = await createBuildAssistOwner();
  const counter = { calls: 0 };
  try {
    await owner.login(context);
    await mockSuggest(page, counter);
    await openBuild(page);
    await setSource(page, BUILD_AI_SOURCE);
    await page.locator(".cm-line", { hasText: "Helped reduce" }).hover();
    await page.waitForTimeout(700);
    await expect(PANEL(page)).toHaveCount(0);
    await selectLine(page, false);
    await expect(
      page.getByRole("button", { name: /Ask AI about line/ }),
    ).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(PANEL(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Fix code" })).toBeFocused();
    await expect(page.getByLabel("Selected lines")).toHaveText(
      "Helped reduce incidents 12 percent.",
    );
    await expect(
      page.getByRole("button", { name: "Ask AI", exact: true }),
    ).toBeDisabled();
    await page.getByText("Nearby context", { exact: false }).click();
    await expect(PANEL(page)).toContainText("Nearby first context.");
    await expect(PANEL(page)).not.toContainText("FAR_PRIVATE_CANARY");
    expect(counter.calls).toBe(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(PANEL(page)).toHaveCount(0);
    await expect(editorText(page)).toBeFocused();
    expect(counter.calls).toBe(0);
  } finally {
    await owner.cleanup();
  }
});
test("inline diff: Tab accepts bound to the exact source, Esc rejects, undo restores and the PDF is invalidated", async ({
  page,
  context,
}) => {
  const owner = await createBuildAssistOwner();
  try {
    await owner.login(context);
    await mockSuggest(page, { calls: 0 });
    await openBuild(page);
    await setSource(page, BUILD_AI_SOURCE);
    await page.getByRole("button", { name: "Recompile", exact: true }).click();
    await expect(
      page.getByText("PDF ready. 1 page.", { exact: true }),
    ).toBeVisible({ timeout: 25000 });
    await selectLine(page);
    await ask(page);
    await expect(page.locator(".cm-diff-removed")).toContainText(
      "Helped reduce",
    );
    await expect(page.locator(".cm-diff-added")).toContainText(
      "\\textbf{Helped}",
    );
    await expect(editorText(page)).toContainText("Helped reduce incidents");
    await page.screenshot({
      path: `${process.env.BROWSER_EVIDENCE_DIR ?? "docs/evaluation"}/build-ai-inline-diff-20261124.png`,
      fullPage: true,
    });
    // Esc rejects without changing the source.
    await page.keyboard.press("Escape");
    await expect(page.locator(".cm-diff-added")).toHaveCount(0);
    await expect(PANEL(page)).toHaveCount(0);
    expect(await sourceText(page)).toContain("Helped reduce");
    expect(await sourceText(page)).not.toContain("\\textbf{Helped}");
    // Ask again and accept with the keyboard.
    await selectLine(page);
    await ask(page);
    await expect(page.locator(".cm-diff-added")).toBeVisible();
    await page.locator(".cm-content").focus();
    await page.keyboard.press("Tab");
    await expect(editorText(page)).toContainText(
      "\\textbf{Helped} reduce incidents",
    );
    await expect(page.locator(".cm-diff-added")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Download PDF" })).toHaveCount(
      0,
    );
    await page
      .getByRole("button", { name: "Undo AI edit", exact: true })
      .click();
    await expect(editorText(page)).not.toContainText("\\textbf{Helped}");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  } finally {
    await owner.cleanup();
  }
});
test("resume drafts require candidate confirmation and protected metrics are withheld", async ({
  page,
  context,
}) => {
  const owner = await createBuildAssistOwner();
  try {
    await owner.login(context);
    await mockSuggest(page, { calls: 0 });
    await openBuild(page);
    await setSource(page, BUILD_AI_SOURCE);
    await selectLine(page);
    await page.getByRole("button", { name: "Improve resume wording" }).click();
    await ask(page);
    await expect(
      page.getByRole("heading", { name: "Unverified draft", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Accept suggestion", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("checkbox", {
        name: /I confirm this draft preserves my facts/,
      })
      .check();
    await page
      .getByRole("button", { name: "Accept suggestion", exact: true })
      .click();
    await expect
      .poll(() => sourceText(page))
      .toBe(BUILD_AI_SOURCE.replace("Helped", "\\textbf{Helped}"));
    await setSource(
      page,
      BUILD_AI_SOURCE.replace("12 percent.", "12 percent. METRIC_OUTPUT"),
    );
    await selectLine(page);
    await page.getByRole("button", { name: "Improve resume wording" }).click();
    await ask(page);
    await expect(
      page.getByRole("region", { name: "AI suggestion review" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Accept suggestion", exact: true }),
    ).toHaveCount(0);
  } finally {
    await owner.cleanup();
  }
});
test("unsafe proposals and missing evidence remain advice; malformed/refused output fails safely", async ({
  page,
  context,
}) => {
  const owner = await createBuildAssistOwner();
  try {
    await owner.login(context);
    await mockSuggest(page, { calls: 0 });
    await openBuild(page);
    for (const marker of ["UNSAFE_OUTPUT", "QUESTION_OUTPUT", "BAD_JSON"]) {
      await setSource(
        page,
        BUILD_AI_SOURCE.replace("12 percent.", "12 percent. " + marker),
      );
      await selectLine(page);
      await ask(page);
      if (marker === "BAD_JSON")
        await expect(page.getByRole("alert")).toContainText(
          /unavailable|safely|checks/,
        );
      else {
        await expect(
          page.getByRole("region", { name: "AI suggestion review" }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Accept suggestion", exact: true }),
        ).toHaveCount(0);
      }
      expect(await sourceText(page)).toBe(
        BUILD_AI_SOURCE.replace("12 percent.", "12 percent. " + marker),
      );
      await page.keyboard.press("Escape");
    }
  } finally {
    await owner.cleanup();
  }
});
test("edits/cancel/dismiss ignore stale results and reset consent on mobile", async ({
  page,
  context,
}) => {
  const owner = await createBuildAssistOwner();
  try {
    await owner.login(context);
    await mockSuggest(page, { calls: 0 });
    await openBuild(page);
    await setSource(
      page,
      BUILD_AI_SOURCE.replace("12 percent.", "12 percent. DELAY_OUTPUT"),
    );
    await selectLine(page);
    await ask(page);
    await setSource(page, BUILD_AI_SOURCE + "% newer edit\n");
    // The in-flight request is dropped and the panel says so; no late result is applied.
    await expect(page.getByRole("alert")).toHaveText(
      "Code changed. Ask again.",
    );
    await expect(page.locator(".cm-diff-added")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Ask AI" })).toHaveCount(0);
    expect(await sourceText(page)).toBe(BUILD_AI_SOURCE + "% newer edit\n");
    await setSource(
      page,
      BUILD_AI_SOURCE.replace("12 percent.", "12 percent. SLOW_OUTPUT"),
    );
    await selectLine(page);
    await expect(
      page.getByRole("checkbox", { name: /I agree to send/ }),
    ).not.toBeChecked();
    await ask(page);
    await page
      .getByRole("button", { name: "Cancel AI request", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "No suggestion was applied",
    );
    await page.getByRole("button", { name: "Close AI suggestions" }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await selectLine(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const box = await page.getByRole("dialog").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(391);
  } finally {
    await owner.cleanup();
  }
});
test("mock provider timeout and refusal fail safely without changing source", async ({
  page,
  context,
}) => {
  const owner = await createBuildAssistOwner();
  try {
    await owner.login(context);
    await mockSuggest(page, { calls: 0 });
    await openBuild(page);
    for (const marker of ["REFUSE_OUTPUT", "SLOW_OUTPUT"]) {
      const value = BUILD_AI_SOURCE.replace(
        "12 percent.",
        "12 percent. " + marker,
      );
      await setSource(page, value);
      await selectLine(page);
      await ask(page);
      await expect(page.getByRole("alert")).toContainText(
        marker === "REFUSE_OUTPUT"
          ? /provider declined this request/
          : /timed out|stopped/,
        { timeout: 16000 },
      );
      expect(await sourceText(page)).toBe(value);
      await expect(
        page.getByRole("button", { name: "Accept suggestion", exact: true }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
    }
  } finally {
    await owner.cleanup();
  }
});
