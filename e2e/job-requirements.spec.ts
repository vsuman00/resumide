import { createServerClient } from "@supabase/ssr";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { createJobRequirementFixture } from "../scripts/job-requirement-test-fixture";
test("owner reviews cited JD requirements and immutable history by keyboard", async ({
  page,
  context,
}) => {
  const fixture = await createJobRequirementFixture(),
    other = await createJobRequirementFixture("SQL preferred");
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
      throw Error("Local JD login failed");
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
    await login(fixture);
    const url = `/analysis/${fixture.analysisId}/requirements`;
    const response = await page.goto(url);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    const save = page.getByRole("button", {
      name: "Save job requirements for review",
    });
    await save.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "JD version 1", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "skill: TypeScript", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Importance: preferred (explicit); unconfirmed").first(),
    ).toBeVisible();
    const first = (
      await fixture.admin
        .from("job_requirement_versions")
        .select("id")
        .eq("analysis_id", fixture.analysisId)
        .single()
    ).data!.id;
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      (
        await fixture.admin
          .from("jobs")
          .update({ description: "Requirements\nSQL required" })
          .eq("id", fixture.jobId)
      ).error,
    ).toBeNull();
    await save.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("JD version 2 saved.")).toBeVisible();
    await page
      .getByRole("link", { name: "View JD version 1", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "skill: TypeScript", exact: true }),
    ).toBeVisible();
    expect(
      (
        await fixture.admin
          .from("job_requirement_versions")
          .select("content")
          .eq("id", first)
          .single()
      ).data!.content.sourceText,
    ).toBe(fixture.description);
    const foreign = await context.request.post(url, {
      headers: { Origin: "https://foreign.example.test" },
      form: { expectedVersionId: first, idempotencyKey: crypto.randomUUID() },
    });
    expect(foreign.status()).toBe(400);
    await login(other);
    const denied = await page.goto(url);
    expect(denied?.status()).toBe(404);
    await expect(
      page.getByText("TypeScript", { exact: true }),
    ).not.toBeVisible();
    expect(
      (
        await other.admin
          .from("jobs")
          .update({ title: "Civil Engineer" })
          .eq("id", other.jobId)
      ).error,
    ).toBeNull();
    await page.goto(`/analysis/${other.analysisId}/requirements`);
    await page
      .getByRole("button", { name: "Save job requirements for review" })
      .click();
    await expect(
      page.getByText(
        "This domain or locale is outside the current review pack.",
      ),
    ).toBeVisible();
  } finally {
    for (const s of sessions) await s.auth.signOut();
    await fixture.cleanup();
    await other.cleanup();
  }
});
