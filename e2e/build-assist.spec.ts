import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  BUILD_AI_SOURCE,
  createBuildAssistOwner,
} from "../tests/fixtures/build-assist";
test.describe.configure({ mode: "serial" });
test.setTimeout(60000);
async function selectLine(page: Page) {
  const source = page.getByRole("textbox", { name: "LaTeX source" });
  await source.evaluate((node) => {
    const input = node as HTMLTextAreaElement,
      lines = input.value.split("\n"),
      start = lines.slice(0, 5).join("\n").length + 1;
    input.focus();
    input.setSelectionRange(start, start + lines[5].length);
    input.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await expect(
    page.getByRole("dialog", { name: "AI suggestions" }),
  ).toBeVisible();
}
async function ask(page: Page) {
  await page
    .getByRole("checkbox", {
      name: "I agree to send this selected context for this request.",
    })
    .check();
  await page.getByRole("button", { name: "Ask AI", exact: true }).click();
}
test("hover and keyboard selection disclose context without requests; Escape restores control", async ({
  page,
  context,
}) => {
  const owner = await createBuildAssistOwner();
  let calls = 0;
  try {
    await owner.login(context);
    await page.goto("/build");
    await page
      .getByRole("textbox", { name: "LaTeX source" })
      .fill(BUILD_AI_SOURCE);
    page.on("request", (r) => {
      if (r.url().endsWith("/build/suggest")) calls++;
    });
    await page
      .getByRole("textbox", { name: "LaTeX source" })
      .hover({ position: { x: 30, y: 130 } });
    await expect(
      page.getByRole("dialog", { name: "AI suggestions" }),
    ).toBeVisible();
    expect(calls).toBe(0);
    await expect(
      page.getByRole("button", { name: "Ask AI", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await selectLine(page);
    const source = page.getByRole("textbox", { name: "LaTeX source" });
    await expect(source).toBeFocused();
    expect(
      await source.evaluate(
        (node) =>
          (node as HTMLTextAreaElement).selectionEnd >
          (node as HTMLTextAreaElement).selectionStart,
      ),
    ).toBe(true);
    await page.keyboard.down("Escape");
    await expect(
      page.getByRole("dialog", { name: "AI suggestions" }),
    ).toHaveCount(0);
    await page.keyboard.up("Escape");
    await expect(
      page.getByRole("dialog", { name: "AI suggestions" }),
    ).toHaveCount(0);
    expect(calls).toBe(0);
    await selectLine(page);
    await page.getByText("Review selected context", { exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "Nearby first context.",
    );
    await expect(page.getByRole("dialog")).not.toContainText(
      "FAR_PRIVATE_CANARY",
    );
    expect(calls).toBe(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  } finally {
    await owner.cleanup();
  }
});
test("review/apply/undo binds exact source, preserves privacy and invalidates PDF", async ({
  page,
  context,
}) => {
  const owner = await createBuildAssistOwner();
  try {
    await owner.login(context);
    await page.goto("/build");
    const source = page.getByRole("textbox", { name: "LaTeX source" });
    await source.fill(BUILD_AI_SOURCE);
    await page.getByRole("button", { name: "Recompile", exact: true }).click();
    await expect(
      page.getByText("PDF ready. 1 page.", { exact: true }),
    ).toBeVisible({ timeout: 25000 });
    await selectLine(page);
    await ask(page);
    await expect(
      page.getByRole("heading", { name: "Before", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "After", exact: true }),
    ).toBeVisible();
    await expect(source).toHaveValue(BUILD_AI_SOURCE);
    await page.screenshot({
      path: `${process.env.BROWSER_EVIDENCE_DIR ?? "docs/evaluation"}/build-ai-review-20261030.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Apply suggestion", exact: true })
      .click();
    await expect(source).toHaveValue(
      BUILD_AI_SOURCE.replace("Helped", "Improved"),
    );
    await expect(page.getByRole("link", { name: "Download PDF" })).toHaveCount(
      0,
    );
    await page
      .getByRole("button", { name: "Undo AI edit", exact: true })
      .click();
    await expect(source).toHaveValue(BUILD_AI_SOURCE);
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
    await page.goto("/build");
    const source = page.getByRole("textbox", { name: "LaTeX source" });
    await source.fill(BUILD_AI_SOURCE);
    await selectLine(page);
    await page
      .getByRole("combobox", { name: "Suggestion type" })
      .selectOption("resume");
    await ask(page);
    await expect(
      page.getByRole("heading", { name: "Unverified draft", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Apply suggestion", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("checkbox", {
        name: /I confirm this draft preserves my facts/,
      })
      .check();
    await page
      .getByRole("button", { name: "Apply suggestion", exact: true })
      .click();
    await expect(source).toHaveValue(
      BUILD_AI_SOURCE.replace("Helped", "Improved"),
    );
    await source.fill(
      BUILD_AI_SOURCE.replace("12 percent.", "12 percent. METRIC_OUTPUT"),
    );
    await selectLine(page);
    await page
      .getByRole("combobox", { name: "Suggestion type" })
      .selectOption("resume");
    await ask(page);
    await expect(
      page.getByRole("region", { name: "AI suggestion review" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Apply suggestion", exact: true }),
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
    await page.goto("/build");
    const source = page.getByRole("textbox", { name: "LaTeX source" });
    for (const marker of ["UNSAFE_OUTPUT", "QUESTION_OUTPUT", "BAD_JSON"]) {
      await source.fill(
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
          page.getByRole("button", { name: "Apply suggestion", exact: true }),
        ).toHaveCount(0);
      }
      await expect(source).toHaveValue(
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
    await page.goto("/build");
    const source = page.getByRole("textbox", { name: "LaTeX source" });
    await source.fill(
      BUILD_AI_SOURCE.replace("12 percent.", "12 percent. DELAY_OUTPUT"),
    );
    await selectLine(page);
    await ask(page);
    await source.fill(BUILD_AI_SOURCE + "% newer edit\n");
    await expect(
      page.getByRole("dialog", { name: "AI suggestions" }),
    ).toHaveCount(0);
    await expect(source).toHaveValue(BUILD_AI_SOURCE + "% newer edit\n");
    await source.fill(
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
    await page.keyboard.press("Escape");
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
    await page.goto("/build");
    const source = page.getByRole("textbox", { name: "LaTeX source" });
    for (const marker of ["REFUSE_OUTPUT", "SLOW_OUTPUT"]) {
      const value = BUILD_AI_SOURCE.replace(
        "12 percent.",
        "12 percent. " + marker,
      );
      await source.fill(value);
      await selectLine(page);
      await ask(page);
      await expect(page.getByRole("alert")).toContainText(
        /unavailable|timed out|stopped|checks/,
        { timeout: 16000 },
      );
      await expect(source).toHaveValue(value);
      await expect(
        page.getByRole("button", { name: "Apply suggestion", exact: true }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
    }
  } finally {
    await owner.cleanup();
  }
});
