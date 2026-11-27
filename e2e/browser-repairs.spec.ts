import { createBrowserOwner } from "../scripts/browser-owner-fixture";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServerClient } from "@supabase/ssr";
import {
  expect as baseExpect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createCanonicalFixture } from "../scripts/canonical-test-fixture";
import {
  mutateCanonical,
  loadCanonical,
} from "../app/lib/server/canonical-repository";
import { saveJobRequirements } from "../app/lib/server/job-requirement-repository";

// Score and privacy pages take about 6 s to load against the hosted project (FT-04).
const expect = baseExpect.configure({ timeout: 20_000 });

test.use({ timezoneId: "America/Los_Angeles", locale: "en-US" });

type Fixture = Awaited<ReturnType<typeof createBrowserOwner>>;
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
  const f = await createBrowserOwner(),
    client = await login(context, f);
  const errors = renderingErrors(page);
  const manifest = {
    version: "resumide-export-v1",
    generatedAt: "2026-10-17T01:30:00Z",
    account: { id: f.ownerId },
    records: { synthetic: "PRIVATE_EXPORT_MANIFEST_SENTINEL".repeat(16384) },
    files: [],
  };
  try {
    // The service role may only queue a request; the worker's own functions claim and complete it.
    const requestId = randomUUID();
    const worker = `ft-${requestId}`;
    const queued = await f.admin.from("data_requests").insert({
      id: requestId,
      organization_id: f.organizationId,
      user_id: f.ownerId,
      kind: "export",
    });
    if (queued.error)
      throw new Error(
        `Synthetic export setup failed: ${queued.error.code} ${queued.error.message}`,
      );
    const claimed = await f.admin.rpc(
      "claim_privacy_request_with_cleanup_credits",
      { p_worker_id: worker, p_lease_seconds: 600, p_max_attempts: 3 },
    );
    if (claimed.error || claimed.data?.id !== requestId)
      throw new Error(
        `Synthetic export claim failed: ${claimed.error?.message ?? "another request was claimed first"}`,
      );
    const completed = await f.admin.rpc("complete_privacy_request", {
      p_request_id: requestId,
      p_worker_id: worker,
      p_attempt: claimed.data.attempt,
      p_manifest: manifest,
    });
    if (completed.error || completed.data !== true)
      throw new Error(
        `Synthetic export completion failed: ${completed.error?.message ?? "not accepted"}`,
      );
    const stored = await f.admin
      .from("data_requests")
      .select("created_at")
      .eq("id", requestId)
      .single();
    // The page formats in UTC whatever the browser time zone is (this spec runs in Los Angeles).
    const submitted = new RegExp(
      `Submitted ${new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(stored.data!.created_at))}`,
    );
    const response = await page.goto("/privacy");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    expect(await response!.text()).not.toContain(
      "PRIVATE_EXPORT_MANIFEST_SENTINEL",
    );
    await expect(
      page.getByRole("heading", { name: "Privacy and data" }),
    ).toBeVisible();
    await expect(page.getByText(submitted)).toBeVisible();
    await page.reload();
    await expect(page.getByText(submitted)).toBeVisible();
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download export" }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe("resumide-export.json");
    const path = await download.path();
    // Completing an export adds admission records, which are empty for a synthetic owner.
    const downloaded = JSON.parse(await readFile(path!, "utf8"));
    const { synthetic, ...added } = downloaded.records;
    expect({ ...downloaded, records: { synthetic } }).toEqual(manifest);
    expect(
      Object.values(added).every((v) => Array.isArray(v) && !v.length),
    ).toBe(true);
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
  const f = await createBrowserOwner(),
    client = await login(context, f);
  const errors = renderingErrors(page);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/account");
    await page.getByLabel("Open site menu").click();
    await page
      .locator(".workspace-floating-header")
      .getByRole("link", { name: "Privacy" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Privacy and data" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    const origin = "http://127.0.0.1:3110";
    // Keep the previously issued cookies in memory and out of browser traces.
    const previousCookie = (await context.cookies(origin))
      .map(({ name, value }) => `${name}=${value}`)
      .join("; ");
    const checkPreviousSession = () =>
      fetch(new URL("/privacy", origin), {
        headers: { Cookie: previousCookie },
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      });
    const before = await checkPreviousSession();
    await before.body?.cancel();
    expect(before.status).toBe(200);
    await page.getByLabel("Open site menu").click();
    await page
      .locator(".workspace-floating-header")
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
    await expect(page).toHaveURL("http://127.0.0.1:3110/");
    await expect(
      page.getByRole("heading", { name: "See what the ATS sees." }),
    ).toBeVisible();
    await expect(
      page
        .locator(".workspace-floating-header")
        .getByRole("button", { name: "Sign out", exact: true }),
    ).toHaveCount(0);
    await page.goto("/privacy");
    await expect(page).toHaveURL(/\/auth\?next=/);
    const after = await checkPreviousSession();
    await after.body?.cancel();
    expect(after.status).toBe(302);
    expect(after.headers.get("Location")).toBe("/auth?next=/privacy");
    const freshSession = await login(context, f);
    try {
      expect((await page.goto("/privacy"))?.status()).toBe(200);
    } finally {
      await freshSession.auth.signOut();
    }
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
  test.setTimeout(120_000);
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
    await answer
      .locator("..")
      .getByRole("button", { name: "Preview result clarification" })
      .click();
    // The confirmation checkbox belongs to the preview, so confirm the first draft there.
    const preview = page.getByRole("region", { name: "Clarification preview" });
    await preview.getByRole("checkbox").check();
    await page
      .locator(
        `a[href="/analysis/${f.analysisId}/score?focus=${second.id}#writing-review"]`,
      )
      .click();
    await expect(
      page.getByRole("combobox", { name: "Contribution to review" }),
    ).toHaveValue(second.id);
    await expect(answer).toHaveValue("");
    await expect(preview).toHaveCount(0);
    await expect(
      answer.locator("..").locator('[name="targetFactId"]'),
    ).toHaveValue(second.id);
    await answer.fill("Unsaved second contribution draft");
    await page.goBack();
    await expect(
      page.getByRole("combobox", { name: "Contribution to review" }),
    ).toHaveValue(first.id);
    await expect(answer).toHaveValue("");
    await expect(preview).toHaveCount(0);
    await expect(
      answer.locator("..").locator('[name="targetFactId"]'),
    ).toHaveValue(first.id);
    expect(errors).toEqual([]);
  } finally {
    await client.auth.signOut();
    await f.cleanup();
  }
});
