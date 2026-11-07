import { selectSiteTheme } from "./site-menu";
import {
  requireBrowserTestTarget,
  recordBrowserFixture,
} from "../scripts/browser-test-target";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { extractPdfForAnalysis } from "../app/lib/server/extraction-stage";
import { buildNativeEvidence } from "../app/lib/server/native-evidence";
import { BASELINE_SEMANTICS } from "../app/lib/server/qualitative-prose";
import { syntheticPdf, CONTACT_PDF_STREAM } from "../tests/fixtures/native-pdf";

test("owner can review persisted layout by keyboard; other users cannot read it", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  if (!process.env.SUPABASE_URL) process.loadEnvFile(".env");
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  requireBrowserTestTarget(url);
  const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });
  const users: string[] = [];
  const sessions: ReturnType<typeof createServerClient>[] = [];
  const analysisId = randomUUID();
  const resumeId = randomUUID();
  const versionId = randomUUID();
  let storageKey: string | undefined;
  const bucket = process.env.SUPABASE_RESUME_BUCKET ?? "resumes";
  function check(error: unknown, stage: string) {
    if (error) throw new Error(stage);
  }
  async function login() {
    const email = `aa011-browser-${randomUUID()}@example.test`;
    const password = randomUUID() + randomUUID();
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    check(created.error, "Synthetic user creation failed");
    const id = created.data.user!.id;
    users.push(id);
    await recordBrowserFixture(url, { ownerId: id });
    const cookies: { name: string; value: string }[] = [];
    const auth = createServerClient(url, key, {
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
    });
    sessions.push(auth);
    check(
      (await auth.auth.signInWithPassword({ email, password })).error,
      "Synthetic sign-in failed",
    );
    await context.clearCookies();
    await context.addCookies(
      cookies.map((cookie) => ({
        ...cookie,
        url: "http://127.0.0.1:3110",
        httpOnly: true,
        sameSite: "Lax" as const,
      })),
    );
    return id;
  }
  try {
    const owner = await login();
    const org = await admin
      .from("organizations")
      .select("id")
      .eq("owner_id", owner)
      .single();
    check(org.error, "Synthetic workspace lookup failed");
    const organizationId = org.data!.id;
    const bytes = syntheticPdf([
      CONTACT_PDF_STREAM,
      "BT /F1 12 Tf 350 750 Td (Right column) Tj -300 0 Td (Left column) Tj ET",
      "BT /F1 12 Tf 50 750 Td (Skill) Tj 300 0 Td (Level) Tj -300 -20 Td (TypeScript) Tj 300 0 Td (Advanced) Tj -300 -20 Td (SQL) Tj 300 0 Td (Intermediate) Tj ET",
    ]);
    storageKey = `organizations/${organizationId}/resumes/${resumeId}/${versionId}.pdf`;
    await recordBrowserFixture(url, { ownerId: owner, storageKey });
    check(
      (
        await admin.storage
          .from(bucket)
          .upload(storageKey, bytes, { contentType: "application/pdf" })
      ).error,
      "Synthetic PDF upload failed",
    );
    check(
      (
        await admin.from("resumes").insert({
          id: resumeId,
          organization_id: organizationId,
          owner_id: owner,
          display_name: "aa011-browser.pdf",
        })
      ).error,
      "Synthetic resume creation failed",
    );
    check(
      (
        await admin.from("resume_versions").insert({
          id: versionId,
          resume_id: resumeId,
          organization_id: organizationId,
          owner_id: owner,
          storage_key: storageKey,
          checksum: "a".repeat(64),
          bytes: bytes.length,
          media_type: "application/pdf",
        })
      ).error,
      "Synthetic version creation failed",
    );
    check(
      (
        await admin.from("analyses").insert({
          id: analysisId,
          resume_version_id: versionId,
          organization_id: organizationId,
          owner_id: owner,
          status: "extracting",
          idempotency_key: randomUUID(),
        })
      ).error,
      "Synthetic analysis creation failed",
    );
    const extracted = await extractPdfForAnalysis({
      bytes,
      maxBytes: 20_000,
      maxPages: 3,
      maxCharacters: 10_000,
      timeoutMs: 5_000,
      includeLayout: true,
    });
    const persisted = await admin.rpc("persist_native_layout_extraction", {
      p_analysis_id: analysisId,
      p_duration_ms: extracted.durationMs,
      p_extracted_text: extracted.text,
      p_extractor_version: extracted.extractorVersion,
      p_page_count: 3,
      p_page_texts: extracted.pageTexts,
      p_process_id: "aa011-browser",
      p_request_id: randomUUID(),
      p_text_checksum: extracted.textChecksum,
      p_warnings: [],
      p_evidence_graph: buildNativeEvidence(extracted.pageTexts),
      p_native_layout: extracted.nativeLayout,
    });
    check(persisted.error, "Layout RPC failed");
    expect(persisted.data).toBe(true);
    const category = {
      score: 70,
      tips: Array.from({ length: 3 }, () => ({
        type: "good",
        tip: "Synthetic review tip",
        explanation: "Synthetic explanation",
      })),
    };
    const parseView = {
      totalPages: 3,
      totalLines: 6,
      contact: {
        name: "Alex Example",
        email: "alex@example.test",
        phone: "+1 202 555 0100",
        links: [],
        location: null,
      },
      sections: [],
      warnings: [],
      pages: extracted.pageTexts.map((text, index) => ({
        pageNumber: index + 1,
        text,
        lineCount: 3,
        confidence: "medium",
        warnings: [],
      })),
    };
    check(
      (
        await admin.from("analysis_results").insert({
          analysis_id: analysisId,
          organization_id: organizationId,
          owner_id: owner,
          feedback: {
            overallScore: 70,
            ATS: category,
            toneAndStyle: category,
            content: category,
            structure: category,
            skills: category,
          },
          parse_view: parseView,
          rule_trace: [],
          keyword_coverage: {
            job: [],
            matched: [],
            missing: [],
            uncertain: [],
            evidence: [],
          },
          parser_version: "synthetic",
          ruleset_version: "synthetic",
          normalizer_version: "synthetic",
          taxonomy_version: "skills-taxonomy-v1",
          prompt_version: "synthetic",
          schema_version: "synthetic",
          model_id: "synthetic",
        })
      ).error,
      "Synthetic result creation failed",
    );
    check(
      (
        await admin.from("writer_drafts").insert({
          analysis_id: analysisId,
          organization_id: organizationId,
          owner_id: owner,
          kind: "summary",
          draft: { summary: null, bullets: [] },
        })
      ).error,
      "Synthetic writer creation failed",
    );
    check(
      (
        await admin
          .from("analyses")
          .update({ status: "completed" })
          .eq("id", analysisId)
      ).error,
      "Synthetic result completion failed",
    );
    await page.goto(`/resume/${analysisId}#parse`);
    await expect(page.locator(".result-score-header")).toContainText(
      "Uncalibrated",
    );
    await expect(page.locator(".result-score-header")).not.toContainText(
      "Strong",
    );
    await page.locator(".result-score-header").screenshot({
      path: `${process.env.BROWSER_EVIDENCE_DIR ?? "docs/evaluation"}/navigation-report-button-20261031.png`,
    });
    const scoreContext = page.locator("details").filter({
      has: page.getByText("How this saved score was calculated", {
        exact: true,
      }),
    });
    await expect(scoreContext).not.toHaveAttribute("open", "");
    await scoreContext.locator("summary").click();
    await expect(scoreContext).toContainText(
      "not a percentage of job requirements met",
    );
    await expect(scoreContext.locator("time")).toContainText("IST");
    await scoreContext.screenshot({
      path: `${process.env.BROWSER_EVIDENCE_DIR ?? "docs/evaluation"}/score-explanation-20261031.png`,
    });
    await scoreContext.locator("summary").click();
    const reportButton = await page
      .getByRole("link", { name: "Download evidence report" })
      .boundingBox();
    expect(reportButton!.height).toBe(44);
    expect(reportButton!.width).toBeLessThan(260);
    await page.getByRole("tab", { name: "Rewrite", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "No rewrite was saved" }),
    ).toBeVisible();
    await expect(
      page.getByText(/evidence did not support a safe wording/),
    ).toHaveCount(0);
    await page.getByRole("link", { name: "Review available feedback" }).click();
    await expect(
      page.getByRole("tab", { name: "Overview", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    check(
      (
        await admin
          .from("writer_drafts")
          .update({
            draft: {
              summary: "Synthetic retained wording for review.",
              bullets: [],
            },
          })
          .eq("analysis_id", analysisId)
          .eq("owner_id", owner)
      ).error,
      "Synthetic retained writer update failed",
    );
    await page.goto(`/resume/${analysisId}#rewrite`);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Rewrite with evidence" }),
    ).toBeVisible();
    await expect(
      page.getByText("Synthetic retained wording for review."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Copy", exact: true }),
    ).toBeVisible();
    await page.getByLabel(/I agree to send the saved resume/).check();
    await page
      .getByRole("button", { name: "Generate suggestions", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Writing generation is disabled on this server.",
    );
    await expect(
      page.getByText("Synthetic retained wording for review."),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Parse view", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Page 1 layout evidence" }),
    ).toBeVisible();
    await page.getByText(/^Source text runs/).click();
    const run = page.getByRole("button", { name: /^Show source run 1:/ });
    await run.focus();
    await page.keyboard.press("Enter");
    await expect(run).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".native-layout-overlay rect")).toBeVisible();
    const imageBounds = await page
      .locator(".native-layout-preview img")
      .boundingBox();
    const rectBounds = await page
      .locator(".native-layout-overlay rect")
      .boundingBox();
    const sourceBox = extracted.nativeLayout!.pages[0].blocks[0].box!;
    // Playwright includes the two-pixel outline in the rendered rectangle.
    expect(rectBounds!.x + 1).toBeCloseTo(
      imageBounds!.x + imageBounds!.width * sourceBox.x,
      0,
    );
    expect(rectBounds!.y + 1).toBeCloseTo(
      imageBounds!.y + imageBounds!.height * sourceBox.y,
      0,
    );
    await expect(page.getByRole("status")).toContainText(
      "Page 1, source run 1",
    );
    await page
      .getByText("Geometric lines, columns and table candidates", {
        exact: true,
      })
      .click();
    const visualSource = page.getByRole("button", {
      name: "Show visual line source page-1-run-1",
      exact: true,
    });
    await visualSource.focus();
    await page.keyboard.press("Enter");
    await expect(visualSource).toHaveAttribute("aria-pressed", "true");
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    const { violations } = await new AxeBuilder({ page })
      .include(".parse-view")
      .analyze();
    expect(
      violations.filter(({ impact }) =>
        ["serious", "critical"].includes(impact ?? ""),
      ),
    ).toEqual([]);
    await page.getByRole("combobox", { name: "Parse page" }).selectOption("2");
    await expect(
      page.getByRole("region", { name: "Page 2 layout evidence" }),
    ).toBeVisible();
    await expect(page.locator(".native-layout-overlay")).toHaveCount(0);
    await expect(
      page.getByText("Reading order requires review."),
    ).toBeVisible();
    await expect(
      page.getByText(/Separated text may be columns or table cells/),
    ).toBeVisible();
    await page
      .getByText("Geometric lines, columns and table candidates", {
        exact: true,
      })
      .click();
    const ordered = page.getByRole("list", {
      name: "Inferred visual reading order",
    });
    await expect(ordered.locator("li > p:first-child")).toHaveText([
      "Left column",
      "Right column",
    ]);
    await page.getByRole("combobox", { name: "Parse page" }).selectOption("3");
    await page
      .getByText("Geometric lines, columns and table candidates", {
        exact: true,
      })
      .click();
    await expect(
      page.getByText(/Table or columns: manual review required/),
    ).toBeVisible();
    await page
      .getByText("page-3-table-1: 3 candidate rows", { exact: true })
      .click();
    await expect(
      page.getByRole("list", { name: "Candidate table rows" }).locator("li"),
    ).toHaveText([
      "Skill | Level",
      "TypeScript | Advanced",
      "SQL | Intermediate",
    ]);
    const tableA11y = await new AxeBuilder({ page })
      .include(".parse-view")
      .analyze();
    expect(
      tableA11y.violations.filter(({ impact }) =>
        ["serious", "critical"].includes(impact ?? ""),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: `${process.env.BROWSER_EVIDENCE_DIR ?? "test-results"}/native-layout-review.png`,
      fullPage: true,
    });
    const citedCategory = {
      score: 0,
      tips: [
        {
          type: "good",
          tip: "Keep the clear outcome",
          explanation:
            "The excerpt gives the reader a concrete contribution to review.",
          quote: "Built reliable synthetic test services.",
        },
        {
          type: "improve",
          tip: "Clarify the scope before adding detail",
          explanation:
            "Describe the scope only when the source or your confirmation supports it.",
          quote: "Maintained regression coverage.",
        },
        {
          type: "improve",
          tip: "Uncited advice",
          explanation: "This remains omitted from the cited review.",
        },
      ],
    };
    check(
      (
        await admin
          .from("analysis_results")
          .update({
            feedback: {
              scoreSemantics: BASELINE_SEMANTICS,
              overallScore: 70,
              ATS: category,
              toneAndStyle: citedCategory,
              content: citedCategory,
              structure: citedCategory,
              skills: citedCategory,
            },
          })
          .eq("analysis_id", analysisId)
      ).error,
      "Synthetic cited feedback setup failed",
    );
    await page.goto(`/resume/${analysisId}`);
    const writing = page.getByRole("region", {
      name: "Cited writing suggestions",
    });
    await expect(writing).toBeVisible();
    await expect(writing.getByRole("heading", { level: 3 })).toHaveText([
      "Tone and style",
      "Content",
      "Structure",
      "Skills",
    ]);
    await expect(writing.locator("blockquote")).toHaveCount(8);
    for (const [width, theme] of [
      [1366, "light"],
      [390, "dark"],
    ] as const) {
      await page.setViewportSize({ width, height: 1000 });
      await selectSiteTheme(page, theme);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const issues = await new AxeBuilder({ page })
        .include('[data-testid="cited-writing-suggestions"]')
        .analyze();
      expect(issues.violations).toEqual([]);
      const toneGroup = writing.getByRole("region", { name: "Tone and style" });
      await toneGroup.evaluate((element) =>
        element.scrollIntoView({ block: "center" }),
      );
      await toneGroup.screenshot({
        path: `${process.env.BROWSER_EVIDENCE_DIR ?? "docs/evaluation"}/cited-writing-${width}-20261031.png`,
      });
    }
    await page.goto("/analyses");
    await expect(
      page.getByRole("heading", { name: "Analysis history" }),
    ).toBeVisible();
    await expect(
      page.locator(`a[href="/resume/${analysisId}"]`).first(),
    ).toBeVisible();
    await login();
    const response = await page.goto(`/resume/${analysisId}`);
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("region", { name: "Page 1 layout evidence" }),
    ).toHaveCount(0);
  } finally {
    const cleanupErrors: string[] = [];
    for (const auth of sessions)
      if ((await auth.auth.signOut()).error) cleanupErrors.push("session");
    if (
      storageKey &&
      (await admin.storage.from(bucket).remove([storageKey])).error
    )
      cleanupErrors.push("storage");
    for (const id of users)
      if ((await admin.auth.admin.deleteUser(id)).error)
        cleanupErrors.push("user");
    expect(cleanupErrors, "Synthetic fixtures must be removed").toEqual([]);
  }
});
