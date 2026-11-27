import { createServerClient } from "@supabase/ssr";
import AxeBuilder from "@axe-core/playwright";
import {
  test,
  expect as baseExpect,
  type BrowserContext,
} from "@playwright/test";
import { createScoreFixture } from "../scripts/score-v2-test-fixture";
import { loadCanonical } from "../app/lib/server/canonical-repository";
import { applyAuthoring } from "../app/lib/server/authoring-repository";
import { clarifyValue } from "../app/lib/server/authoring-contract";

// Each save redirects to /score, whose loader takes about 6 s against the hosted project (FT-03).
const expect = baseExpect.configure({ timeout: 20_000 });
async function login(
  context: BrowserContext,
  f: Awaited<ReturnType<typeof createScoreFixture>>,
) {
  const cookies: Array<{ name: string; value: string }> = [];
  const client = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookies,
        setAll: (values) => {
          cookies.splice(
            0,
            cookies.length,
            ...values.map(({ name, value }) => ({ name, value })),
          );
        },
      },
    },
  );
  if (
    (
      await client.auth.signInWithPassword({
        email: f.email,
        password: f.password,
      })
    ).error
  )
    throw Error("Local authoring login failed");
  await context.addCookies(
    cookies.map((c) => ({
      ...c,
      url: "http://127.0.0.1:3110",
      httpOnly: true,
      sameSite: "Lax" as const,
    })),
  );
  return client;
}
test("candidate edits, clarifies, accepts and undoes a source-bound patch by keyboard", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const f = await createScoreFixture(),
    client = await login(context, f);
  try {
    const initial = (await loadCanonical(f.admin, f.analysisId, f.ownerId))
      .current!.document;
    const fact = initial.facts.find(
      (v) => v.type === "contribution" && v.value === "Built reliable tests",
    )!;
    const url = `/analysis/${f.analysisId}/score?focus=${fact.id}`;
    await page.goto(url);
    await expect(
      page.getByRole("heading", { name: "Edit your resume on this analysis" }),
    ).toBeVisible();
    const input = page.locator(`#author-fact-${fact.id}`);
    await input.fill("Built robust tests");
    const edit = input
      .locator("..")
      .getByRole("button", { name: "Save fact correction" });
    await edit.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(
      new RegExp(`/analysis/${f.analysisId}/score$`),
    );
    await expect(page.locator(`#author-fact-${fact.id}`)).toHaveValue(
      "Built robust tests",
    );
    await page.goto(url);
    for (const [kind, value] of [
      ["result", "Fewer release defects"],
      ["scope", "Internal tests"],
    ] as const) {
      const beforeValue = await page
        .locator(`#author-fact-${fact.id}`)
        .inputValue();
      const answer = page.locator(`#question-${kind}`);
      await answer.fill(value);
      const form = answer.locator("..");
      await form
        .getByRole("button", { name: `Preview ${kind} clarification` })
        .click();
      const preview = page.getByRole("region", {
        name: "Clarification preview",
      });
      await expect(preview).toBeVisible();
      expect(
        await preview.getByLabel("Complete fact to confirm").textContent(),
      ).toBe(clarifyValue(beforeValue, kind, value));
      await expect(preview.getByRole("checkbox")).not.toBeChecked();
      await preview.getByRole("checkbox").check();
      await preview
        .getByRole("button", { name: "Confirm complete fact" })
        .click();
      await expect(page.locator(`#author-fact-${fact.id}`)).toHaveValue(
        new RegExp(value),
      );
    }
    await expect(
      page.getByRole("button", { name: "Accept xyz", exact: true }),
    ).toBeDisabled();
    const accept = page.getByRole("button", {
      name: "Accept action scope result",
      exact: true,
    });
    // Wait out the reload after the last confirmation: it resets acknowledgements and disables the form.
    await page.waitForLoadState("networkidle");
    await accept.locator("..").getByRole("checkbox").check();
    await expect(accept).toBeEnabled();
    await accept.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(`#author-fact-${fact.id}`)).toHaveValue(
      "Built robust tests; scope: Internal tests; result: Fewer release defects.",
    );
    expect(await page.getByText("Unavailable", { exact: true }).count()).toBe(
      3,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page
      .getByRole("button", { name: "Undo last saved change as a new version" })
      .click();
    await expect(page.locator(`#author-fact-${fact.id}`)).toHaveValue(
      /Result: Fewer release defects/,
    );
    const current = await loadCanonical(f.admin, f.analysisId, f.ownerId);
    expect(current.current!.document.versionId).not.toBe(initial.versionId);
    await page.goto(
      `/analysis/${f.analysisId}/score?canonical=${initial.versionId}`,
    );
    await expect(
      page.getByText(
        "Historical version: editing and acceptance are disabled.",
        { exact: false },
      ),
    ).toBeVisible();
    expect(
      await page.getByRole("button", { name: "Save fact correction" }).count(),
    ).toBe(0);
    const foreign = await context.request.post(
      `/analysis/${f.analysisId}/author`,
      {
        headers: { Origin: "https://foreign.example.test" },
        form: { action: "undo" },
      },
    );
    expect([400, 403]).toContain(foreign.status());
  } finally {
    await client.auth.signOut();
    await f.cleanup();
  }
});
test("JavaScript-disabled editing preserves stale drafts and supports explicit recovery and restore", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const f = await createScoreFixture(),
    context = await browser.newContext({
      javaScriptEnabled: false,
      baseURL: "http://127.0.0.1:3110",
    }),
    client = await login(context, f),
    page = await context.newPage();
  try {
    const initial = (await loadCanonical(f.admin, f.analysisId, f.ownerId))
        .current!.document,
      fact = initial.facts.find(
        (v) => v.type === "contribution" && v.value === "Built reliable tests",
      )!;
    await page.goto(`/analysis/${f.analysisId}/score?focus=${fact.id}`);
    const input = page.locator(`#author-fact-${fact.id}`);
    await input.fill("My retained draft");
    await applyAuthoring(
      f.admin,
      f.analysisId,
      f.ownerId,
      {
        action: "edit",
        targetFactId: fact.id,
        value: "Concurrent owner correction",
        expectedVersionId: initial.versionId,
        idempotencyKey: crypto.randomUUID(),
      },
      "aa5-browser-concurrent",
    );
    await input
      .locator("..")
      .getByRole("button", { name: "Save fact correction" })
      .click();
    await expect(page.getByRole("alert")).toContainText("resume changed");
    await expect(page.locator(`#author-fact-${fact.id}`)).toHaveValue(
      "My retained draft",
    );
    await expect(
      page.getByRole("button", { name: "Retry this exact submission" }),
    ).toBeVisible();
    await page
      .getByText(
        "Save the retained correction after reviewing the current version",
        { exact: true },
      )
      .click();
    const reviewed = page.getByRole("button", {
      name: "Save reviewed correction against current version",
    });
    await reviewed.locator("..").getByRole("checkbox").check();
    await reviewed.click();
    await expect(page.locator(`#author-fact-${fact.id}`)).toHaveValue(
      "My retained draft",
    );
    await page
      .getByRole("button", {
        name: "Restore version 1 as a new version",
        exact: true,
      })
      .click();
    await expect(page.locator(`#author-fact-${fact.id}`)).toHaveValue(
      fact.value,
    );
    expect(
      (await loadCanonical(f.admin, f.analysisId, f.ownerId)).current!.revision,
    ).toBe(4);
  } finally {
    await client.auth.signOut();
    await context.close();
    await f.cleanup();
  }
});
