import { test, expect, type BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { appendFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { createBrowserOwner } from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/scripts/browser-owner-fixture";
import { recordBrowserFixture } from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/scripts/browser-test-target";
import { processExtractionStage } from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/app/lib/server/extraction-stage";
import { createOcrSyntheticFixture } from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/tests/fixtures/ocr-synthetic";
import {
  extractPdfTextLayers,
  detectPdfTextProfile,
} from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/app/lib/server/ocr/pdf-detection";
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

test("consumer image-only upload saves unsupported OCR evidence and withholds scores through the actual extraction path", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  expect(process.env.AI_ENABLED).toBe("false");
  const scanned = createOcrSyntheticFixture("scanned");
  const native = await extractPdfTextLayers(scanned.bytes, {
    maxPages: 10,
    maxCharacters: 100_000,
  });
  const profile = detectPdfTextProfile(native);
  expect(native.text.trim().length).toBe(0);
  expect(profile.documentType).toBe("scanned");
  expect(native.totalPages).toBe(1);
  const owner = await createBrowserOwner();
  let client: Awaited<ReturnType<typeof login>> | undefined;
  const storageKeys = new Set<string>();
  try {
    client = await login(context, owner);
    await page.goto("/upload");
    await page
      .getByLabel("Job title", { exact: true })
      .fill("Synthetic Backend Engineer");
    await page
      .getByLabel("Job description", { exact: true })
      .fill("Build reliable software and automated tests. Python is required.");
    await page.getByLabel("Upload PDF resume").setInputFiles({
      name: "image-only-synthetic.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(scanned.bytes),
    });
    await page.getByRole("checkbox").check();
    const acceptedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/analyze",
    );
    await page.getByRole("button", { name: /analyze resume/i }).click();
    const accepted = await acceptedResponse;
    expect(accepted.status()).toBe(202);
    const payload = await accepted.json();
    expect(payload.status).toBe("quarantined");
    const analysisId = payload.id;
    expect(analysisId).toMatch(/^[a-f0-9-]{36}$/);
    await expect(page).toHaveURL(new RegExp(`/analysis/${analysisId}$`));
    const stored = await owner.admin
      .from("analyses")
      .select("owner_id, resume_versions(storage_key)")
      .eq("id", analysisId)
      .single();
    expect(stored.error).toBeNull();
    expect(stored.data?.owner_id).toBe(owner.ownerId);
    const version = Array.isArray(stored.data?.resume_versions)
      ? stored.data.resume_versions[0]
      : stored.data?.resume_versions;
    if (!version?.storage_key)
      throw Error("Owned scanned storage binding unavailable");
    storageKeys.add(version.storage_key);
    await recordBrowserFixture(process.env.SUPABASE_URL!, {
      ownerId: owner.ownerId,
      storageKey: version.storage_key,
    });
    await appendFile(
      process.env.AA7_AUTH_RECEIPT_FILE!,
      JSON.stringify({
        recordType: "consumer-scanned-upload",
        ownerId: owner.ownerId,
        analysisId,
        keys: [createHash("sha256").update(owner.ownerId).digest("hex")],
      }) + "\n",
      { mode: 0o600 },
    );
    // No syntheticOcr argument or adapter injection; no global queue claim.
    await processExtractionStage(analysisId);
    const statusResponse = await context.request.get(
      `/api/analysis/${analysisId}`,
    );
    expect(statusResponse.status()).toBe(200);
    const status = await statusResponse.json();
    expect(status.status).toBe("needs_ocr");
    const attempt = await owner.admin
      .from("document_evidence_attempts")
      .select("envelope")
      .eq("analysis_id", analysisId)
      .single();
    expect(attempt.error).toBeNull();
    const evidence = attempt.data!.envelope;
    expect(evidence.status).toBe("unsupported");
    expect(evidence.ocrFailure?.code).toBe("unsupported");
    expect(evidence.ocrSource).toBeNull();
    expect(evidence.scoringEligible).toBe(false);
    const outputCounts: Record<string, number> = {};
    for (const table of [
      "analysis_extractions",
      "analysis_deterministic_results",
      "analysis_ai_runs",
      "analysis_results",
      "writer_drafts",
    ]) {
      const rows = await owner.admin
        .from(table)
        .select("analysis_id")
        .eq("analysis_id", analysisId);
      expect(rows.error).toBeNull();
      outputCounts[table] = rows.data!.length;
      expect(rows.data!.length).toBe(0);
    }
    await page.reload();
    const reviewHeading = page.getByRole("heading", {
      name: "Extraction needs review",
      level: 1,
      exact: true,
    });
    await expect(reviewHeading).toBeVisible();
    const progressExplainsReview = await reviewHeading.isVisible();
    await page
      .getByRole("link", { name: "Review extracted evidence", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Review your extracted information",
        exact: true,
      }),
    ).toBeVisible();
    const visibleStatus = await page
      .getByRole("status")
      .filter({ hasText: "Evidence state:" })
      .innerText();
    const noScoreGuidance =
      (await page.getByText(/no score is available/i).count()) > 0;
    const observation = {
      evidenceTier:
        "actual localhost Chromium UI/API and exact-owned production extraction function; managed Supabase; no OCR adapter injected",
      syntheticPdf: {
        sourceSha256: createHash("sha256").update(scanned.bytes).digest("hex"),
        bytes: scanned.bytes.byteLength,
        pages: native.totalPages,
        nativeTextCharacters: native.text.trim().length,
        documentType: profile.documentType,
      },
      analysisStatus: status.status,
      evidenceStatus: evidence.status,
      ocrFailureCode: evidence.ocrFailure?.code,
      ocrSourceAbsent: evidence.ocrSource === null,
      scoringEligible: evidence.scoringEligible,
      outputCounts,
      progressExplainsReview,
      visibleStatus,
      noScoreGuidance,
      claim:
        "safe unsupported consumer OCR path observed; this does not establish automatic OCR or independent OCR-engine quality",
    };
    await writeFile(
      join(
        dirname(process.env.BROWSER_PRIVATE_OUTPUT_DIR!),
        "scanned-consumer-observation.json",
      ),
      JSON.stringify(observation, null, 2) + "\n",
      { mode: 0o600 },
    );
    expect(progressExplainsReview).toBe(true);
    expect(visibleStatus).toContain("unsupported");
    expect(noScoreGuidance).toBe(true);
  } finally {
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
      "Exact owned scanned-upload resources must be cleaned",
    ).toEqual([]);
  }
});
