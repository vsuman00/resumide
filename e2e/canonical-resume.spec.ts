import { createServerClient } from "@supabase/ssr";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createCanonicalFixture } from "../scripts/canonical-test-fixture";

// This suite is intentionally local-only and is run through test:aa2:browser.
// It never falls back to the hosted .env or provisions cloud resources.
test("canonical import, confirmation, edit, compare, restore and owner isolation", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const fixture = await createCanonicalFixture();
  const other = await createCanonicalFixture("Name: Other Synthetic Person");
  const sessions: ReturnType<typeof createServerClient>[] = [];
  async function login(user: typeof fixture) {
    const cookies: Array<{ name: string; value: string }> = [];
    const session = createServerClient(
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
    sessions.push(session);
    if (
      (
        await session.auth.signInWithPassword({
          email: user.email,
          password: user.password,
        })
      ).error
    )
      throw new Error("Local browser sign-in failed");
    await context.clearCookies();
    await context.addCookies(
      cookies.map((cookie) => ({
        ...cookie,
        url: "http://127.0.0.1:3110",
        httpOnly: true,
        sameSite: "Lax" as const,
      })),
    );
  }
  try {
    await login(fixture);
    const url = `/analysis/${fixture.analysisId}/canonical`;
    const response = await page.goto(url);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    await expect(
      page.getByRole("heading", { name: "Review your resume facts" }),
    ).toBeVisible();
    const button = page.getByRole("button", {
      name: "Import resume for review",
    });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Version 1", exact: true }),
    ).toBeVisible();
    const confirm = page.getByRole("button", {
      name: "Confirm employer: Fictional Co",
      exact: true,
    });
    await confirm.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Version 2", exact: true }),
    ).toBeVisible();
    const employer = page.getByRole("article").filter({
      has: page.getByRole("heading", {
        name: "employer: Fictional Co",
        exact: true,
      }),
    });
    await expect(
      employer.getByText("State: candidate confirmed", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Correct employer: Fictional Co", { exact: true })
      .fill("Candidate Corrected Co");
    await page
      .getByRole("button", {
        name: "Save correction for employer: Fictional Co",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Version 3", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("article")
        .filter({
          has: page.getByRole("heading", {
            name: "employer: Candidate Corrected Co",
            exact: true,
          }),
        })
        .getByText("State: unconfirmed", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Compare with version 2", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Fact comparison" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Fictional Co (candidate_confirmed) → Candidate Corrected Co (unconfirmed)",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Restore version 2 as a new version",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Version 4 saved.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Reload latest version" }).click();
    await expect(
      page.getByRole("heading", { name: "Version 4", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "employer: Fictional Co",
        exact: true,
      }),
    ).toBeVisible();
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    await page
      .getByRole("link", { name: "View version 1", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Version 1", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Confirm employer: Fictional Co",
        exact: true,
      }),
    ).toHaveCount(0);
    const forbidden = await context.request.post(url, {
      headers: { Origin: "https://foreign.example.test" },
      form: {
        operation: "import",
        expectedVersionId: "",
        idempotencyKey: "10000000-0000-4000-8000-000000000001",
      },
    });
    // React Router rejects foreign-origin document posts before the action;
    // the action's own origin guard is separately tested as 403.
    expect(forbidden.status()).toBe(400);
    const headAfterRejection = await fixture.admin
      .from("canonical_resume_heads")
      .select("revision")
      .eq("resume_id", fixture.resumeId)
      .single();
    expect(headAfterRejection.data?.revision).toBe(4);
    await login(other);
    const crossOwner = await page.goto(url);
    expect(crossOwner?.status()).toBe(404);
    await expect(page.getByText("Fictional Co", { exact: true })).toHaveCount(
      0,
    );
  } finally {
    for (const session of sessions) await session.auth.signOut();
    await fixture.cleanup();
    await other.cleanup();
  }
});
