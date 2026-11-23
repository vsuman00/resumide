import { test, expect } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createCanonicalFixture } from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/scripts/canonical-test-fixture";
import { loadCanonical } from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/app/lib/server/canonical-repository";
import { loadEvidenceReview } from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/app/lib/server/evidence-review";

test("consumer expectation: saved evidence correction carries to canonical or clearly discloses separate correction", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const f = await createCanonicalFixture();
  const cookies: Array<{ name: string; value: string }> = [];
  const auth = createServerClient(
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
  try {
    if (
      (
        await auth.auth.signInWithPassword({
          email: f.email,
          password: f.password,
        })
      ).error
    )
      throw Error("Owned correction fixture sign-in failed");
    await context.addCookies(
      cookies.map((cookie) => ({
        ...cookie,
        url: "http://127.0.0.1:3110",
        httpOnly: true,
        sameSite: "Lax" as const,
      })),
    );
    const before = await loadEvidenceReview(f.admin, f.analysisId, f.ownerId);
    const oldName = before.evidence.assertions.find(
      (item) => item.field === "name",
    )!.value;
    const correctedName = "Synthetic Candidate Corrected";
    await page.goto(`/analysis/${f.analysisId}/evidence`);
    await page
      .getByLabel("Your correction for name (up to 500 characters)", {
        exact: true,
      })
      .fill(correctedName);
    await page
      .getByRole("button", { name: "Save name correction", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Your review was saved" }),
    ).toBeVisible();
    const evidencePageAcknowledgedCorrection =
      (await page
        .getByText(/Revision 1: name corrected as/)
        .filter({ hasText: correctedName })
        .count()) === 1;
    const after = await loadEvidenceReview(f.admin, f.analysisId, f.ownerId);
    await page
      .getByRole("link", { name: "Review structured resume", exact: true })
      .click();
    const disclosureBeforeImport =
      /evidence(?:[- ]review)? corrections? (?:are|remain|stay|do|must)|correct(?:ion|ed).{0,80}(?:again|separat|not carried|not import)/i.test(
        await page.locator("main").innerText(),
      );
    await page
      .getByRole("button", { name: "Import resume for review", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Version 1", exact: true }),
    ).toBeVisible();
    const model = await loadCanonical(f.admin, f.analysisId, f.ownerId);
    const canonicalNameValues = model
      .current!.document.facts.filter((fact) => fact.type === "name")
      .map((fact) => fact.value);
    const disclosureAfterImport =
      /evidence(?:[- ]review)? corrections? (?:are|remain|stay|do|must)|correct(?:ion|ed).{0,80}(?:again|separat|not carried|not import)/i.test(
        await page.locator("main").innerText(),
      );
    const observation = {
      scope: "synthetic localhost browser; original evidence remains immutable",
      evidencePageAcknowledgedCorrection,
      correctionPersistedSeparately: after.corrections.some(
        (item) =>
          item.operation === "correct" &&
          item.field === "name" &&
          item.value === correctedName,
      ),
      originalEvidenceUnchanged:
        JSON.stringify(before.evidence) === JSON.stringify(after.evidence),
      canonicalUsesCorrectedValue: canonicalNameValues.includes(correctedName),
      canonicalRetainsOriginalCandidate: canonicalNameValues.includes(oldName),
      explicitSeparateCorrectionDisclosure:
        disclosureBeforeImport || disclosureAfterImport,
      source: [
        "app/lib/server/canonical-repository.ts:337",
        "app/lib/server/canonical-content.ts:60",
        "app/lib/server/evidence-review.ts:179",
        "app/routes/analysis.canonical.tsx:181",
      ],
    };
    await writeFile(
      join(
        dirname(process.env.BROWSER_PRIVATE_OUTPUT_DIR!),
        "correction-flow-observation.json",
      ),
      JSON.stringify(observation, null, 2) + "\n",
      { mode: 0o600 },
    );
    expect(observation.evidencePageAcknowledgedCorrection).toBe(true);
    expect(observation.correctionPersistedSeparately).toBe(true);
    expect(observation.originalEvidenceUnchanged).toBe(true);
    expect(
      observation.canonicalUsesCorrectedValue ||
        observation.explicitSeparateCorrectionDisclosure,
      "Saved correction must carry with provenance or clearly explain that canonical needs a separate correction",
    ).toBe(true);
  } finally {
    await auth.auth.signOut();
    await f.cleanup();
  }
});
