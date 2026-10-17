import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type BrowserContext } from "@playwright/test";
import { createArtifactFixture } from "../scripts/artifact-test-fixture";
import {
  mutateCanonical,
  loadCanonical,
} from "../app/lib/server/canonical-repository";
async function login(
  context: BrowserContext,
  f: Awaited<ReturnType<typeof createArtifactFixture>>,
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
    throw Error("Local synthetic sign-in failed");
  await context.addCookies(
    cookies.map((c) => ({
      ...c,
      url: "http://127.0.0.1:3110",
      httpOnly: true,
      sameSite: "Lax" as const,
    })),
  );
}
async function prepare() {
  const f = await createArtifactFixture();
  try {
    let version = await mutateCanonical(
      f.admin,
      f.analysisId,
      f.ownerId,
      {
        operation: "import",
        expectedVersionId: null,
        idempotencyKey: randomUUID(),
      },
      "aa6-browser",
    );
    const initial = (await loadCanonical(f.admin, f.analysisId, f.ownerId))
      .current!.document;
    for (const fact of initial.facts)
      version = await mutateCanonical(
        f.admin,
        f.analysisId,
        f.ownerId,
        {
          operation: "confirm",
          factId: fact.id,
          expectedVersionId: version.versionId,
          idempotencyKey: randomUUID(),
        },
        "aa6-browser",
      );
    return f;
  } catch (e) {
    await f.cleanup();
    throw e;
  }
}
test("semantic preview, checked PDF/DOCX and stale-version safety", async ({
  page,
  context,
}) => {
  const f = await prepare();
  try {
    await login(context, f);
    await page.goto(`/analysis/${f.analysisId}/export`);
    await expect(
      page.getByRole("heading", { name: "Preview your saved resume" }),
    ).toBeVisible();
    await expect(
      page.getByRole("article", { name: "Resume preview" }),
    ).toContainText("Demo Person");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole("button", { name: "Check export" }).click();
    await expect(
      page.getByRole("heading", { name: "Export parity verified" }),
    ).toBeVisible();
    const first = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download checked PDF" }).click();
    expect((await first).suggestedFilename()).toBe("resume.pdf");
    await page.getByLabel("Format").selectOption("docx");
    await page.getByRole("button", { name: "Check export" }).click();
    await expect(
      page.getByRole("heading", { name: "Export parity verified" }),
    ).toBeVisible();
    const second = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download checked DOCX" }).click();
    expect((await second).suggestedFilename()).toBe("resume.docx");
    const doc = (await loadCanonical(f.admin, f.analysisId, f.ownerId)).current!
      .document;
    await mutateCanonical(
      f.admin,
      f.analysisId,
      f.ownerId,
      {
        operation: "edit",
        factId: doc.facts[0].id,
        value: "Changed synthetic name",
        expectedVersionId: doc.versionId,
        idempotencyKey: randomUUID(),
      },
      "aa6-browser-stale",
    );
    const stale = page.waitForResponse(
      (r) => r.url().endsWith("/artifact") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Download checked DOCX" }).click();
    expect((await stale).status()).toBe(409);
  } finally {
    await f.cleanup();
  }
});
test("no-JavaScript export form and private access", async ({ browser }) => {
  const f = await prepare(),
    other = await createArtifactFixture();
  try {
    const stranger = await browser.newContext();
    try {
      await login(stranger, other);
      const response = await stranger.request.get(
        `http://127.0.0.1:3110/analysis/${f.analysisId}/export`,
        { maxRedirects: 0 },
      );
      expect(response.status()).toBe(404);
    } finally {
      await stranger.close();
    }
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    try {
      await login(noJs, f);
      const page = await noJs.newPage();
      await page.goto(`/analysis/${f.analysisId}/export`);
      await expect(
        page.getByRole("heading", { name: "Preview your saved resume" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Check export" }).click();
      await expect(
        page.getByRole("heading", { name: "Export parity verified" }),
      ).toBeVisible();
      const downloaded = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download checked PDF" }).click();
      expect((await downloaded).suggestedFilename()).toBe("resume.pdf");
    } finally {
      await noJs.close();
    }
  } finally {
    await f.cleanup();
    await other.cleanup();
  }
});
