import { test, expect, type BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import PDFDocument from "pdfkit";
import AxeBuilder from "@axe-core/playwright";
import { appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createBrowserOwner } from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/scripts/browser-owner-fixture";
import { recordBrowserFixture } from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/scripts/browser-test-target";
import { processQueuedAnalysis } from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/app/lib/server/analysis-worker";

async function neutralPdf() {
  const pdf = new PDFDocument();
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    pdf.on("data", (part: Buffer) => chunks.push(part));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });
  pdf
    .fontSize(11)
    .text(
      "Name: Consumer Synthetic\nExperience\nEmployer: Fictional Systems\nRole: Backend Engineer\nDates: 2022 - 2024\nBuilt Python APIs with automated tests.\nEducation\nEducation: Fictional University\nSkills\nPython, FastAPI, SQL\nCertifications\nCertification: Fictional Certificate",
    );
  pdf.end();
  return finished;
}
async function login(
  context: BrowserContext,
  owner: Awaited<ReturnType<typeof createBrowserOwner>>,
) {
  const cookies: Array<{ name: string; value: string }> = [];
  const client = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookies,
        setAll(values) {
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
        email: owner.email,
        password: owner.password,
      })
    ).error
  )
    throw Error("Owned synthetic sign-in failed");
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

test("consumer uploads a real synthetic PDF, reviews actual worker evidence and saves canonical/JD history without a fabricated score", async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  const owner = await createBrowserOwner();
  let client: Awaited<ReturnType<typeof login>> | undefined;
  const storageKeys = new Set<string>();
  let analysisId: string | undefined;
  try {
    client = await login(context, owner);
    await page.goto("/upload");
    await page
      .getByLabel("Job title", { exact: true })
      .fill("Python Backend Engineer");
    await page
      .getByLabel("Job description", { exact: true })
      .fill(
        "Python and FastAPI are required. SQL is preferred. Build reliable backend APIs and automated tests.",
      );
    await page.getByLabel("Upload PDF resume").setInputFiles({
      name: "consumer-synthetic.pdf",
      mimeType: "application/pdf",
      buffer: await neutralPdf(),
    });
    await page.getByRole("checkbox").check();
    const acceptedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/analyze",
    );
    await page.getByRole("button", { name: /analyze resume/i }).click();
    const response = await acceptedResponse;
    expect(response.status()).toBe(202);
    const accepted = await response.json();
    expect(accepted.status).toBe("quarantined");
    expect(accepted.id).toMatch(/^[a-f0-9-]{36}$/);
    analysisId = accepted.id;
    await expect(page).toHaveURL(new RegExp(`/analysis/${analysisId}$`));
    const stored = await owner.admin
      .from("analyses")
      .select("id, owner_id, resume_versions(storage_key)")
      .eq("id", analysisId)
      .single();
    expect(stored.error).toBeNull();
    expect(stored.data?.owner_id).toBe(owner.ownerId);
    const version = Array.isArray(stored.data?.resume_versions)
      ? stored.data.resume_versions[0]
      : stored.data?.resume_versions;
    if (!version?.storage_key)
      throw Error("Owned uploaded storage binding missing");
    storageKeys.add(version.storage_key);
    await recordBrowserFixture(process.env.SUPABASE_URL!, {
      ownerId: owner.ownerId,
      storageKey: version.storage_key,
    });
    await appendFile(
      process.env.AA7_AUTH_RECEIPT_FILE!,
      JSON.stringify({
        recordType: "consumer-upload",
        ownerId: owner.ownerId,
        analysisId,
        keys: [createHash("sha256").update(owner.ownerId).digest("hex")],
      }) + "\n",
      { mode: 0o600 },
    );
    await processQueuedAnalysis(analysisId!, 1, new AbortController().signal);
    const status = await context.request.get(`/api/analysis/${analysisId}`);
    expect(status.status()).toBe(200);
    expect((await status.json()).status).toBe("needs_ocr");
    const scores = await owner.admin
      .from("analysis_results")
      .select("analysis_id")
      .eq("analysis_id", analysisId);
    expect(scores.error).toBeNull();
    expect(scores.data).toEqual([]);
    await page.reload();
    await page
      .getByRole("link", { name: "Review extracted evidence", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Review your extracted information",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Your correction for name (up to 500 characters)", {
        exact: true,
      })
      .fill("Consumer Synthetic Corrected");
    await page
      .getByRole("button", { name: "Save name correction", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Your review was saved" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Review structured resume", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Import resume for review", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Version 1", exact: true }),
    ).toBeVisible();
    await page.goto(`/analysis/${analysisId}/requirements`);
    await page
      .getByRole("button", {
        name: "Save job requirements for review",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "JD version 1", exact: true }),
    ).toBeVisible();
    await page.goto(`/analysis/${analysisId}/score`);
    await expect(
      page.getByRole("heading", {
        name: "Review scoring diagnostics",
        exact: true,
      }),
    ).toBeVisible();
    expect(await page.getByRole("progressbar").count()).toBe(0);
    expect(
      await page.getByText("Unavailable", { exact: true }).count(),
    ).toBeGreaterThanOrEqual(3);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    const a11y = await new AxeBuilder({ page }).include("main").analyze();
    expect(
      a11y.violations.filter((issue) =>
        ["serious", "critical"].includes(issue.impact ?? ""),
      ),
    ).toEqual([]);
    await page.goto("/analyses");
    await expect(
      page.locator(`a[href*="${analysisId}"]`).first(),
    ).toBeVisible();
    await context.clearCookies();
    await page.goto(`/analysis/${analysisId}/evidence`);
    await expect(page).toHaveURL(/\/auth\?next=/);
    await expect(
      page.getByText("Consumer Synthetic Corrected", { exact: true }),
    ).toHaveCount(0);
  } finally {
    // Recover exact owned storage keys even if navigation failed after admission.
    const cleanupErrors: string[] = [];
    try {
      const versions = await owner.admin
        .from("resume_versions")
        .select("storage_key")
        .eq("owner_id", owner.ownerId);
      if (versions.error) cleanupErrors.push("storage lookup");
      for (const row of versions.data ?? []) {
        storageKeys.add(row.storage_key);
        await recordBrowserFixture(process.env.SUPABASE_URL!, {
          ownerId: owner.ownerId,
          storageKey: row.storage_key,
        });
      }
      if (storageKeys.size) {
        const removed = await owner.admin.storage
          .from(process.env.SUPABASE_RESUME_BUCKET ?? "resumes")
          .remove([...storageKeys]);
        if (removed.error) cleanupErrors.push("storage removal");
      }
    } catch {
      cleanupErrors.push("storage cleanup");
    }
    if (client && (await client.auth.signOut()).error)
      cleanupErrors.push("session signout");
    await owner.cleanup();
    expect(
      cleanupErrors,
      "Exact owned consumer resources must be cleaned",
    ).toEqual([]);
  }
});
