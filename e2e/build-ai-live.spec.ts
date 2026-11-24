// Live GPT-6 Luna check of the Build AI UI. Runs only with BUILD_AI_LIVE=1 and an
// owner-approved key. The browser's /build/suggest calls are answered by the real
// server validation and provider path (prompt, schema, output and fact checks); only
// the hosted consent/audit/budget rows are skipped, because that ledger is not
// migrated on the test project. Spend is metered and hard-capped below.
import { writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createLatexOwner } from "../tests/fixtures/latex-auth";
import {
  BuildAssistError,
  executeBuildAssist,
  validateBuildAssistRequest,
} from "../app/lib/server/build-assist";

const live =
  process.env.BUILD_AI_LIVE === "1" && !!process.env.LIVE_OPENAI_API_KEY;
test.skip(
  !live,
  "Live provider check needs BUILD_AI_LIVE=1 and an approved key",
);
test.describe.configure({ mode: "serial" });
test.setTimeout(120000);

// Published GPT-6 Luna list price: $0.10 / $0.50 per million input / output tokens.
const PRICE = { input: 0.1 / 1e6, output: 0.5 / 1e6 };
// Hard stop far below the owner's $2: assume 10x the list price for each next call.
const HARD_CAP_USD = 1;
const MAX_CALLS = 12;
const spend = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  results: [] as string[],
};
const cost = () =>
  spend.inputTokens * PRICE.input + spend.outputTokens * PRICE.output;
const worstNext = () =>
  (17000 / 4) * PRICE.input * 10 + 768 * PRICE.output * 10;

async function liveSuggest(page: Page) {
  await page.route("**/build/suggest", async (route) => {
    if (spend.calls >= MAX_CALLS || cost() + worstNext() > HARD_CAP_USD)
      return route.fulfill({ status: 429, json: { code: "budget_exhausted" } });
    let prepared;
    try {
      prepared = validateBuildAssistRequest(
        JSON.parse(route.request().postData() ?? "null"),
      );
    } catch (error) {
      const code =
        error instanceof BuildAssistError ? error.code : "invalid_request";
      return route.fulfill({ status: 400, json: { code } });
    }
    spend.calls++;
    try {
      const { response, usage } = await executeBuildAssist(prepared, {
        apiKey: process.env.LIVE_OPENAI_API_KEY!,
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-6-luna",
        onObservedUsage: (observed) => {
          if (!observed) return;
          spend.inputTokens += observed.inputTokens;
          spend.outputTokens += observed.outputTokens;
        },
      });
      if (!usage) spend.results.push("usage_unknown");
      spend.results.push(response.suggestion.operation);
      return route.fulfill({ json: response });
    } catch (error) {
      const code =
        error instanceof BuildAssistError ? error.code : "provider_unavailable";
      spend.results.push(code);
      return route.fulfill({ status: 422, json: { code } });
    }
  });
}

const editor = (page: Page) => page.locator(".cm-content");
const sourceText = async (page: Page) =>
  (await page.locator(".cm-line").allTextContents()).join("\n");
const PANEL = (page: Page) => page.getByRole("dialog", { name: "Ask AI" });
const digits = (text: string) => new Set(text.match(/\d+/g) ?? []);
async function open(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("resumide.build.onboarded.v1", "1"),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/build");
  await expect(editor(page)).toBeVisible();
}
async function selectLine(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+Home");
  const lines = (await sourceText(page)).split("\n");
  for (let i = 0; i < lines.findIndex((l) => l.includes(text)); i++)
    await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
}
async function ask(page: Page, mode?: string) {
  await page.keyboard.press("ControlOrMeta+k");
  await expect(PANEL(page)).toBeVisible();
  if (mode) await page.getByRole("button", { name: mode }).click();
  await page.getByRole("checkbox", { name: /I agree to send/ }).check();
  await page.getByRole("button", { name: "Ask AI", exact: true }).click();
  await expect(page.getByText(/Reading lines/)).toBeVisible();
  // Either a checked result or a fixed safe error, never a raw provider message.
  await expect(
    page
      .getByRole("region", { name: "AI suggestion review" })
      .or(PANEL(page).getByRole("alert")),
  ).toBeVisible({ timeout: 30000 });
}
const DOC = [
  "\\documentclass[11pt]{article}",
  "\\usepackage{enumitem}",
  "\\begin{document}",
  "\\section*{Experience}",
  "\\begin{itemize}",
  "\\item Helped reduce support incidents 12 percent by building a synthetic triage tool.",
  "\\item Worked on dashboards and stuff for the team in 2024.",
  "\\end{itemize}",
  "\\end{document}",
  "",
].join("\n");

let owner: Awaited<ReturnType<typeof createLatexOwner>>;
test.beforeAll(async () => {
  owner = await createLatexOwner();
});
test.afterAll(async () => {
  await owner?.cleanup();
  await writeFile(
    `${process.env.BROWSER_EVIDENCE_DIR ?? "tasks/agent-handoffs/build-experience"}/live-ai-gpt-6-luna-20261124.json`,
    JSON.stringify(
      {
        model: "gpt-6-luna",
        priceUsdPerMillion: { input: 0.1, output: 0.5 },
        calls: spend.calls,
        inputTokens: spend.inputTokens,
        outputTokens: spend.outputTokens,
        costUsd: Number(cost().toFixed(6)),
        ownerLimitUsd: 2,
        hardCapUsd: HARD_CAP_USD,
        outcomes: spend.results,
        scope:
          "Real server validation, prompt, schema and fact checks with live provider; hosted consent/audit/budget ledger not exercised (not migrated on the test project).",
      },
      null,
      2,
    ) + "\n",
  );
});

test("Fix code: a live suggestion is checked, shown as a diff, accepted with Tab and the result compiles", async ({
  page,
  context,
}) => {
  await owner.login(context);
  await liveSuggest(page);
  await open(page);
  const broken = DOC.replace("\\item Worked on", "\\item \\textbff{Worked} on");
  await editor(page).fill(broken);
  await selectLine(page, "textbff");
  await ask(page, "Fix code");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const review = page.getByRole("region", { name: "AI suggestion review" });
  await expect(review).toBeVisible();
  // A one-command rename is a supported repair, so a real replacement must arrive.
  await expect(
    page.getByRole("button", { name: "Accept suggestion" }),
  ).toBeVisible();
  await expect(page.locator(".cm-diff-added")).toBeVisible();
  await editor(page).focus();
  await page.keyboard.press("Tab");
  await expect(PANEL(page)).toHaveCount(0);
  const after = await sourceText(page);
  expect(after).not.toContain("textbff");
  // No invented facts: every number in the result already existed.
  for (const n of digits(after)) expect(digits(broken).has(n)).toBe(true);
  await page.getByRole("button", { name: "Recompile", exact: true }).click();
  await expect(page.getByText("PDF ready. 1 page.")).toBeVisible({
    timeout: 25000,
  });
});

test("Rewrite: Esc rejects the live suggestion and leaves the source untouched", async ({
  page,
  context,
}) => {
  await owner.login(context);
  await liveSuggest(page);
  await open(page);
  await editor(page).fill(DOC);
  await selectLine(page, "dashboards and stuff");
  await ask(page, "Rewrite");
  // The live model may only strengthen the claim ("Worked on" to "Built"); the fact check
  // must then withhold it as advice, with no diff and no Accept button.
  const replaced =
    (await page.getByRole("button", { name: "Accept suggestion" }).count()) > 0;
  spend.results.push(replaced ? "rewrite:replace" : "rewrite:withheld");
  if (!replaced) {
    await expect(page.locator(".cm-diff-added")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Advice" })).toBeVisible();
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(PANEL(page)).toHaveCount(0);
  await expect(page.locator(".cm-diff-added")).toHaveCount(0);
  expect(await sourceText(page)).toBe(DOC);
});

test("Improve resume wording: needs fact confirmation and never adds numbers, emails or links", async ({
  page,
  context,
}) => {
  await owner.login(context);
  await liveSuggest(page);
  await open(page);
  await editor(page).fill(DOC);
  await selectLine(page, "Helped reduce");
  await ask(page, "Improve resume wording");
  await expect(
    page.getByRole("heading", { name: "Unverified draft" }),
  ).toBeVisible();
  const accept = page.getByRole("button", { name: "Accept suggestion" });
  spend.results.push(
    (await accept.count()) ? "resume:replace" : "resume:withheld",
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (await accept.count()) {
    await expect(accept).toBeDisabled();
    const suggestion =
      (await page.getByLabel("Suggested replacement").first().textContent()) ??
      "";
    const original = DOC.split("\n")[5];
    for (const n of digits(suggestion))
      expect(digits(original).has(n)).toBe(true);
    expect(suggestion).not.toMatch(/@|https?:\/\//);
    await page
      .getByRole("checkbox", {
        name: /I confirm this draft preserves my facts/,
      })
      .check();
    await accept.click();
    await expect(PANEL(page)).toHaveCount(0);
    await expect.poll(() => sourceText(page)).not.toBe(DOC);
  } else {
    // Withheld: nothing may change in the editor.
    await expect(page.locator(".cm-diff-added")).toHaveCount(0);
    expect(await sourceText(page)).toBe(DOC);
  }
});

test("Fix with AI from a compile error uses the live model with only kind and line", async ({
  page,
  context,
}) => {
  await owner.login(context);
  await liveSuggest(page);
  await open(page);
  const broken = DOC.replace(
    "\\item Worked on",
    "\\notacommand\n\\item Worked on",
  );
  await editor(page).fill(broken);
  await page.getByRole("button", { name: "Recompile", exact: true }).click();
  const problems = page.getByRole("region", { name: "Compile problems" });
  await expect(problems).toContainText("Line 7 · Undefined command", {
    timeout: 25000,
  });
  const sent = page.waitForRequest("**/build/suggest");
  await problems.getByRole("button", { name: "Fix with AI" }).click();
  await expect(PANEL(page)).toContainText("Fixing line 7: undefined command");
  await page.getByRole("checkbox", { name: /I agree to send/ }).check();
  await page.getByRole("button", { name: "Ask AI", exact: true }).click();
  expect(JSON.parse((await sent).postData() ?? "{}").diagnostic).toEqual({
    kind: "undefined_command",
    line: 7,
  });
  await expect(
    page
      .getByRole("region", { name: "AI suggestion review" })
      .or(PANEL(page).getByRole("alert")),
  ).toBeVisible({ timeout: 30000 });
  expect(cost()).toBeLessThan(2);
});
