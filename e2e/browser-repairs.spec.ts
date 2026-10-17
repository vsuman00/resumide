import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServerClient } from "@supabase/ssr";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createCanonicalFixture } from "../scripts/canonical-test-fixture";
import {
  mutateCanonical,
  loadCanonical,
} from "../app/lib/server/canonical-repository";
import { saveJobRequirements } from "../app/lib/server/job-requirement-repository";

test.use({ timezoneId: "America/Los_Angeles", locale: "en-US" });

type Fixture = Awaited<ReturnType<typeof createCanonicalFixture>>;
async function login(context: BrowserContext, f: Fixture) {
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
    throw new Error("Local repair regression sign-in failed");
  await context.addCookies(
    cookies.map((cookie) => ({
      ...cookie,
      url: "http://127.0.0.1:3110",
      httpOnly: true,
      sameSite: "Lax" as const,
    })),
  );
  return client;
}

function renderingErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|hydrating|#418|parentNode|server rendered HTML/i.test(
        message.text(),
      )
    )
      errors.push(message.text());
  });
  return errors;
}

test("privacy initial load and reload are stable across timezones and export uses a native download", async ({
  page,
  context,
}) => {
  const f = await createCanonicalFixture(),
    client = await login(context, f);
  const errors = renderingErrors(page);
  const manifest = {
    version: "browser-repair-synthetic",
    generatedAt: "2026-10-17T01:30:00Z",
    account: { id: f.ownerId },
    records: { synthetic: "PRIVATE_EXPORT_MANIFEST_SENTINEL".repeat(16384) },
    files: [],
  };
  try {
    const result = await f.admin.from("data_requests").insert({
      id: randomUUID(),
      organization_id: f.organizationId,
      user_id: f.ownerId,
      kind: "export",
      status: "completed",
      created_at: "2026-10-17T01:30:00Z",
      result_manifest: manifest,
    });
    if (result.error)
      throw new Error("Synthetic completed export setup failed");
    const response = await page.goto("/privacy");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    expect(await response!.text()).not.toContain(
      "PRIVATE_EXPORT_MANIFEST_SENTINEL",
    );
    await expect(
      page.getByRole("heading", { name: "Privacy and data" }),
    ).toBeVisible();
    await expect(page.getByText(/Submitted 17 Oct 2026/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Submitted 17 Oct 2026/)).toBeVisible();
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download export" }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe("resumide-export.json");
    const path = await download.path();
    expect(JSON.parse(await readFile(path!, "utf8"))).toEqual(manifest);
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page.getByRole("heading", { name: "Privacy and data" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await client.auth.signOut();
    await f.cleanup();
  }
});

test("mobile private navigation reaches Privacy and signs out the current session", async ({
  page,
  context,
}) => {
  const f = await createCanonicalFixture(),
    client = await login(context, f);
  const errors = renderingErrors(page);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/account");
    await page
      .locator(".workspace-mobile-tabs")
      .getByRole("link", { name: "Privacy" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Privacy and data" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page
      .locator(".workspace-mobile-header")
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
    await expect(page).toHaveURL("http://127.0.0.1:3110/");
    await expect(
      page.getByRole("heading", { name: "See what the ATS sees." }),
    ).toBeVisible();
    await expect(
      page
        .locator(".workspace-mobile-header")
        .getByRole("button", { name: "Sign out", exact: true }),
    ).toHaveCount(0);
    await page.goto("/privacy");
    await expect(page).toHaveURL(/\/auth\?next=/);
    expect(errors).toEqual([]);
  } finally {
    await client.auth.signOut();
    await f.cleanup();
  }
});

test("changing writing focus and going back never retargets another contribution's clarification draft", async ({
  page,
  context,
}) => {
  const f = await createCanonicalFixture(
    "Name: Demo Person\nEmail: demo@example.test\nExperience\nEmployer: Fictional Co\nRole: Software Engineer\nBuilt reliable tests\nImproved release tooling\nSkills\nTypeScript",
  );
  const client = await login(context, f),
    errors = renderingErrors(page);
  try {
    const jobId = randomUUID();
    const inserted = await f.admin.from("jobs").insert({
      id: jobId,
      owner_id: f.ownerId,
      organization_id: f.organizationId,
      title: "Fictional Software Engineer",
      description: "Requirements\nTypeScript required",
    });
    const associated = await f.admin
      .from("analyses")
      .update({ job_id: jobId })
      .eq("id", f.analysisId);
    if (inserted.error || associated.error)
      throw new Error("Synthetic writing JD setup failed");
    await mutateCanonical(
      f.admin,
      f.analysisId,
      f.ownerId,
      {
        operation: "import",
        expectedVersionId: null,
        idempotencyKey: randomUUID(),
      },
      "browser-repair-fixture",
    );
    await saveJobRequirements(
      f.admin,
      f.analysisId,
      f.ownerId,
      { expectedVersionId: null, idempotencyKey: randomUUID() },
      "browser-repair-fixture",
    );
    const canonical = (await loadCanonical(f.admin, f.analysisId, f.ownerId))
      .current!.document;
    const first = canonical.facts.find(
      (fact) =>
        fact.type === "contribution" && fact.value === "Built reliable tests",
    )!;
    const second = canonical.facts.find(
      (fact) =>
        fact.type === "contribution" &&
        fact.value === "Improved release tooling",
    )!;
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    await page.goto(`/analysis/${f.analysisId}/score?focus=${first.id}`);
    const answer = page.locator("#question-result");
    await answer.fill("Unsaved first contribution draft");
    await answer.locator("..").getByRole("checkbox").check();
    await page
      .locator(
        `a[href="/analysis/${f.analysisId}/score?focus=${second.id}#writing-review"]`,
      )
      .click();
    await expect(
      page.getByRole("combobox", { name: "Contribution to review" }),
    ).toHaveValue(second.id);
    await expect(answer).toHaveValue("");
    await expect(answer.locator("..").getByRole("checkbox")).not.toBeChecked();
    await expect(
      answer.locator("..").locator('[name="targetFactId"]'),
    ).toHaveValue(second.id);
    await answer.fill("Unsaved second contribution draft");
    await page.goBack();
    await expect(
      page.getByRole("combobox", { name: "Contribution to review" }),
    ).toHaveValue(first.id);
    await expect(answer).toHaveValue("");
    await expect(answer.locator("..").getByRole("checkbox")).not.toBeChecked();
    await expect(
      answer.locator("..").locator('[name="targetFactId"]'),
    ).toHaveValue(first.id);
    expect(errors).toEqual([]);
  } finally {
    await client.auth.signOut();
    await f.cleanup();
  }
});
