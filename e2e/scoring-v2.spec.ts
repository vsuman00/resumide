import { createServerClient } from "@supabase/ssr";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { createScoreFixture } from "../scripts/score-v2-test-fixture";
test("owner reviews withheld scoring diagnostics, source versions and privacy by keyboard", async ({
  page,
  context,
}) => {
  const f = await createScoreFixture(),
    other = await createScoreFixture();
  const sessions: ReturnType<typeof createServerClient>[] = [];
  async function login(user: typeof f) {
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
    sessions.push(client);
    if (
      (
        await client.auth.signInWithPassword({
          email: user.email,
          password: user.password,
        })
      ).error
    )
      throw Error("Local scoring login failed");
    await context.clearCookies();
    await context.addCookies(
      cookies.map((c) => ({
        ...c,
        url: "http://127.0.0.1:3110",
        httpOnly: true,
        sameSite: "Lax" as const,
      })),
    );
  }
  try {
    await login(f);
    const url = `/analysis/${f.analysisId}/score`;
    const response = await page.goto(url);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
    await expect(
      page.getByRole("heading", { name: "Review scoring diagnostics" }),
    ).toBeVisible();
    expect(await page.getByText("Unavailable", { exact: true }).count()).toBe(
      3,
    );
    expect(await page.getByRole("progressbar").count()).toBe(0);
    await expect(
      page.getByText("Application Readiness aggregate: unavailable."),
    ).toBeVisible();
    expect(
      await page
        .locator("section")
        .filter({
          has: page.getByRole("heading", { name: "Next repair priorities" }),
        })
        .locator("ol > li")
        .count(),
    ).toBeLessThanOrEqual(5);
    const versions = page.getByText("Input versions and scoring policy", {
      exact: true,
    });
    await versions.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText(`Evidence: ${f.attemptId}`, { exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Open these input versions" }).click();
    await expect(page).toHaveURL(
      new RegExp(`canonical=${f.canonical.versionId}`),
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    const deniedWrite = await context.request.post(url, {
      form: { score: 100 },
    });
    expect(deniedWrite.status()).toBe(405);
    expect(
      (
        await page.goto(`${url}?expectedCanonical=${crypto.randomUUID()}`)
      )?.status(),
    ).toBe(409);
    expect((await page.goto(`${url}?ownerId=${other.ownerId}`))?.status()).toBe(
      422,
    );
    await login(other);
    expect((await page.goto(url))?.status()).toBe(404);
    await expect(
      page.getByText(f.canonical.versionId, { exact: false }),
    ).not.toBeVisible();
    await login(f);
    expect(
      (
        await f.admin
          .from("resumes")
          .update({ status: "deleted" })
          .eq("id", f.resumeId)
      ).error,
    ).toBeNull();
    expect((await page.goto(url))?.status()).toBe(404);
  } finally {
    for (const s of sessions) await s.auth.signOut();
    await f.cleanup();
    await other.cleanup();
  }
});
