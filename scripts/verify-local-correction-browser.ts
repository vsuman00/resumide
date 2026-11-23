import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";
import { extractText } from "unpdf";
import type { loadCanonicalCorrectionWorkspace } from "../app/lib/server/canonical-repository";
import type { loadEvidenceReview } from "../app/lib/server/evidence-review";
import {
  setLocalFixtureViewport,
  verifyLocalFixtureZoom,
  withLocalFixtureBrowser,
} from "./local-fixture-browser";

type Fixture = {
  authOrigin: string;
  email: string;
  password: string;
  analysisId: string;
  original: string;
  corrected: string;
  review: () => ReturnType<typeof loadEvidenceReview>;
  workspace: () => ReturnType<typeof loadCanonicalCorrectionWorkspace>;
};

export async function verifyLocalCorrectionBrowser(fixture: Fixture) {
  assert.equal(process.env.RESUMIDE_CV04_BROWSER, "true");
  assert.equal(fixture.authOrigin, "https://local-cv04.invalid");
  const browserZoom = process.env.RESUMIDE_CV04_BROWSER_ZOOM === "true";
  await withLocalFixtureBrowser(
    { ...fixture, browserZoom },
    "/evidence",
    async (context, page, base) => {
      await setLocalFixtureViewport(page, 390, 740);
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      const before = await fixture.review();
      const evidence = await page.goto(`${base}/evidence`);
      assert.equal(evidence?.status(), 200);
      await verifyLocalFixtureZoom(page, 390);
      assert.match(evidence?.headers()["cache-control"] ?? "", /no-store/u);
      await expect(
        page.getByRole("heading", {
          name: "Review your extracted information",
        }),
      ).toBeVisible();
      await page
        .getByLabel("Your correction for name (up to 500 characters)")
        .pressSequentially(fixture.corrected);
      const evidenceSave = page.getByRole("button", {
        name: "Save name correction",
        exact: true,
      });
      await page.keyboard.press("Tab");
      await expect(evidenceSave).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("status").filter({ hasText: "Review revision 1" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: `Confirm ${fixture.original}`,
          exact: true,
        }),
      ).toBeVisible();
      const evidenceSaved = page
        .getByRole("status")
        .filter({ hasText: "Your review was saved" });
      await expect(evidenceSaved).toBeFocused();
      assert.deepEqual((await fixture.review()).evidence, before.evidence);
      await page
        .getByRole("link", { name: "Review structured resume", exact: true })
        .press("Enter");

      const item = page.getByRole("article", {
        name: "name correction",
        exact: true,
      });
      await expect(item.getByRole("blockquote")).toContainText(
        fixture.original,
      );
      await verifyLocalFixtureZoom(page, 390);
      const target = item.getByLabel("Choose the source and resume target");
      const fits = (control: typeof target) =>
        control.evaluate((element) => {
          const { left, right } = element.getBoundingClientRect();
          return left >= 0 && right <= innerWidth;
        });
      const targetFits = await fits(target);
      const blockingAxe = (
        await new AxeBuilder({ page })
          .include('[aria-labelledby="canonical-corrections-heading"]')
          .analyze()
      ).violations
        .filter(({ impact }) => impact === "serious" || impact === "critical")
        .flatMap(({ id, nodes }) => nodes.map(({ target }) => [id, ...target]));
      await expect(target.getByRole("option")).toHaveCount(2);
      await setLocalFixtureViewport(page, 320, 640);
      await verifyLocalFixtureZoom(page, 320);
      await page.emulateMedia({
        forcedColors: "active",
        reducedMotion: "reduce",
      });
      assert(await fits(target));
      await target.press("i"); // Native type-ahead selects the Import option.
      await expect(target).not.toHaveValue("");
      const targetText = item.getByText(/^Selected target · /u);
      await expect(targetText).toBeVisible();
      assert(await fits(targetText));
      const ack = item.getByRole("checkbox");
      await page.keyboard.press("Tab");
      await expect(ack).toBeFocused();
      await page.keyboard.press("Space");
      await expect(ack).toBeChecked();
      await page.keyboard.press("Tab");
      const saveTarget = item.getByRole("button", {
        name: "Save correction target",
      });
      await expect(saveTarget).toBeFocused();
      assert(await fits(saveTarget));
      await page.keyboard.press("Enter");
      await expect(
        item.getByText(/Target saved in choice revision 1/u),
      ).toBeVisible();
      const targetSaved = page
        .getByRole("status")
        .filter({ hasText: "Correction target saved." });
      await expect(targetSaved).toBeFocused();
      const apply = item.getByRole("button", {
        name: "Apply correction",
        exact: true,
      });
      await expect(apply).toBeDisabled();
      await ack.press("Space");
      await page.keyboard.press("Tab");
      await expect(apply).toBeFocused();
      assert(await fits(apply));
      assert(
        await apply.evaluate((element) => {
          const outline = getComputedStyle(element);
          return (
            element.matches(":focus-visible") &&
            outline.outlineStyle !== "none" &&
            matchMedia("(forced-colors: active)").matches &&
            matchMedia("(prefers-reduced-motion: reduce)").matches
          );
        }),
      );
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("heading", { name: "Version 2", exact: true }),
      ).toBeVisible();
      const applied = page
        .getByRole("status")
        .filter({ hasText: "Version 2 saved for review." });
      await expect(applied).toBeFocused();
      assert(targetFits);
      assert.deepEqual(blockingAxe, []);
      if (!browserZoom) await setLocalFixtureViewport(page, 1024, 768);
      await page.emulateMedia({
        forcedColors: "none",
        colorScheme: "light",
        reducedMotion: "reduce",
      });
      const facts = page.getByRole("region", {
        name: "Facts and confirmation",
      });
      await expect(
        facts.getByRole("heading", {
          name: `name: ${fixture.corrected}`,
          exact: true,
        }),
      ).toHaveCount(1);
      await expect(
        facts.getByRole("heading", {
          name: `name: ${fixture.original}`,
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        item.getByText(
          "The current version retains this correction's application history.",
        ),
      ).toBeVisible();
      const corrected = await fixture.workspace();
      assert(corrected.current && corrected.headId);
      assert.equal(
        corrected.corrections.snapshot.activeApplicationIds.length,
        1,
      );
      const oldVersion = corrected.current.document.parentVersionId;
      assert(oldVersion);
      const blocked = await context.request.get(
        `${base}/export?version=${corrected.headId}`,
      );
      assert.equal(blocked.status(), 422);
      assert.match(
        await blocked.text(),
        /unconfirmed facts? before exporting/u,
      );

      const confirm = facts
        .getByRole("button", { name: /^Confirm /u })
        .and(page.locator("button:enabled"));
      for (
        let index = 0;
        index < corrected.current.document.facts.length;
        index++
      ) {
        if (browserZoom) assert(await fits(confirm.first()));
        await confirm.first().press("Enter");
        await expect(
          page.getByRole("heading", {
            name: `Version ${index + 3}`,
            exact: true,
          }),
        ).toBeVisible();
      }
      const saved = await fixture.workspace();
      assert(saved.headId);
      assert.deepEqual(
        saved.corrections.snapshot.activeApplicationIds,
        corrected.corrections.snapshot.activeApplicationIds,
      );
      const exportLink = page.getByRole("link", {
        name: "Preview and export this version",
      });
      const exportUrl = `${base}/export?version=${saved.headId}`;
      await expect(exportLink).toHaveAttribute(
        "href",
        new URL(exportUrl).pathname + new URL(exportUrl).search,
      );
      if (browserZoom) assert(await fits(exportLink));
      await exportLink.press("Enter");
      await expect(
        page.getByRole("heading", { name: "Preview your saved resume" }),
      ).toBeVisible();
      await verifyLocalFixtureZoom(page, 320);

      for (const format of ["pdf", "docx"] as const) {
        await page.getByLabel("Format").selectOption(format);
        const checkExport = page.getByRole("button", { name: "Check export" });
        if (browserZoom) assert(await fits(checkExport));
        await checkExport.press("Enter");
        await expect(
          page.getByRole("heading", { name: "Export parity verified" }),
        ).toBeVisible();
        const attachment = page.waitForEvent("download");
        const downloadButton = page.getByRole("button", {
          name: `Download checked ${format.toUpperCase()}`,
        });
        if (browserZoom) assert(await fits(downloadButton));
        await downloadButton.press("Enter");
        const download = await attachment;
        assert.equal(download.suggestedFilename(), `resume.${format}`);
        const downloaded = await readFile(await download.path());
        const recovered =
          format === "pdf"
            ? (
                await extractText(new Uint8Array(downloaded), {
                  mergePages: true,
                })
              ).text
            : strFromU8(unzipSync(downloaded)["word/document.xml"]);
        assert.equal(recovered.split(fixture.corrected).length, 2);
        assert(!recovered.includes(fixture.original));
      }
      await page.getByRole("link", { name: "Edit structured resume" }).click();
      await page
        .getByRole("button", {
          name: "Restore version 1 as a new version",
          exact: true,
        })
        .press("Enter");
      await expect(
        facts.getByRole("heading", {
          name: `name: ${fixture.original}`,
          exact: true,
        }),
      ).toBeVisible();
      const restored = await fixture.workspace();
      assert.notEqual(restored.headId, oldVersion);
      assert.equal(restored.current?.document.parentVersionId, saved.headId);
      assert.equal(
        restored.corrections.snapshot.restoredFromVersionId,
        oldVersion,
      );
      assert.equal(
        restored.corrections.snapshot.activeApplicationIds.length,
        0,
      );
      assert.equal((await context.request.get(exportUrl)).status(), 409);

      const staleTab = await context.newPage();
      await setLocalFixtureViewport(staleTab, 320, 640);
      await staleTab.emulateMedia({
        colorScheme: "dark",
        reducedMotion: "reduce",
      });
      try {
        const retainedName = "Retained Synthetic Person";
        const newerName = "Newer Synthetic Person";
        const editUrl = `${base}/canonical`;
        await staleTab.goto(`${editUrl}?version=${restored.headId}`);
        await verifyLocalFixtureZoom(staleTab, 320);
        const staleName = staleTab.getByRole("textbox", {
          name: `Correct name: ${fixture.original}`,
        });
        const oldSave = staleTab.getByRole("button", {
          name: `Save correction for name: ${fixture.original}`,
        });
        await staleName.fill(retainedName);
        const submitted = await oldSave.evaluate((button) =>
          Object.fromEntries(new FormData((button as HTMLButtonElement).form!)),
        );
        assert.equal(submitted.expectedVersionId, restored.headId);

        const currentName = page.getByRole("textbox", {
          name: `Correct name: ${fixture.original}`,
        });
        await currentName.fill(newerName);
        await page
          .getByRole("button", {
            name: `Save correction for name: ${fixture.original}`,
          })
          .press("Enter");
        await expect(
          facts.getByRole("heading", {
            name: `name: ${newerName}`,
            exact: true,
          }),
        ).toBeVisible();
        const newer = await fixture.workspace();
        assert(newer.headId && newer.headId !== restored.headId);

        const conflictReply = staleTab.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname.endsWith("/canonical.data"),
        );
        await staleTab.keyboard.press("Tab");
        await expect(oldSave).toBeFocused();
        await staleTab.keyboard.press("Enter");
        assert.equal((await conflictReply).status(), 409);
        const retained = staleTab.getByRole("region", {
          name: "Retained correction",
        });
        await expect(
          retained.getByLabel("Your retained correction"),
        ).toHaveText(retainedName);
        await expect(
          retained.getByText(newerName, { exact: true }),
        ).toBeVisible();
        const conflictAlert = staleTab.getByRole("alert");
        await expect(conflictAlert).toHaveText(
          "A newer resume version is already loaded. Review your retained correction before saving again.",
        );
        await expect(conflictAlert).toBeFocused();
        const exactRetry = retained.getByRole("button", {
          name: "Retry this exact correction",
        });
        assert.deepEqual(
          await exactRetry.evaluate((button) =>
            Object.fromEntries(
              new FormData((button as HTMLButtonElement).form!),
            ),
          ),
          submitted,
        );
        const reviewedSave = retained.getByRole("button", {
          name: "Save reviewed correction",
        });
        const reviewForm = await reviewedSave.evaluate((button) =>
          Object.fromEntries(new FormData((button as HTMLButtonElement).form!)),
        );
        assert.equal(reviewForm.expectedVersionId, newer.headId);
        assert.equal(reviewForm.factId, submitted.factId);
        assert.equal(reviewForm.value, retainedName);
        assert.notEqual(reviewForm.idempotencyKey, submitted.idempotencyKey);
        assert.equal((await fixture.workspace()).headId, newer.headId);

        const acknowledgement = retained.getByRole("checkbox");
        await expect(acknowledgement).not.toBeChecked();
        assert.equal(
          await reviewedSave.evaluate((button) =>
            (button as HTMLButtonElement).form!.checkValidity(),
          ),
          false,
        );
        const blockingAxe = (
          await new AxeBuilder({ page: staleTab })
            .include('[aria-label="Retained correction"]')
            .analyze()
        ).violations
          .filter(({ impact }) => impact === "serious" || impact === "critical")
          .map(({ id }) => id);
        const actionFits = await reviewedSave.evaluate((button) => {
          const bounds = button.getBoundingClientRect();
          return bounds.left >= 0 && bounds.right <= innerWidth;
        });
        await staleTab.keyboard.press("Tab");
        await expect(exactRetry).toBeFocused();
        await staleTab.keyboard.press("Tab");
        await expect(acknowledgement).toBeFocused();
        await staleTab.keyboard.press("Space");
        await staleTab.keyboard.press("Tab");
        await expect(reviewedSave).toBeFocused();
        await staleTab.keyboard.press("Enter");
        await expect(
          staleTab
            .getByRole("region", { name: "Facts and confirmation" })
            .getByRole("heading", {
              name: `name: ${retainedName}`,
              exact: true,
            }),
        ).toBeVisible();
        await expect(retained).toHaveCount(0);
        const result = staleTab
          .getByRole("status")
          .filter({ hasText: /Version \d+ saved\./u });
        await expect(result).toBeFocused();
        const recovered = await fixture.workspace();
        assert.equal(recovered.current?.document.parentVersionId, newer.headId);
        assert(
          recovered.current?.document.facts.some(
            (fact) =>
              fact.id === submitted.factId &&
              fact.value === retainedName &&
              fact.state === "unconfirmed" &&
              fact.sources.length === 0,
          ),
        );
        assert(actionFits);
        assert.deepEqual(blockingAxe, []);
      } finally {
        await staleTab.close();
      }
    },
  );
  process.stdout.write(
    "Chromium CV04 correction, confirmation, PDF/DOCX download, restore and stale-version recovery passed.\n",
  );
  process.stdout.write(
    JSON.stringify({
      browser: "Chromium",
      keyboardCorrectionSavedAndApplied: true,
      threeFeedbackMessagesFocused: true,
      targetAndControlsFitNarrowWidths: true,
      selectedTargetLabelVisible: true,
      forcedColorsAndReducedMotion: true,
      correctionReviewBlockingAxeViolations: 0,
      postgresServiceRole: true,
      pdfAndDocxContentChecked: true,
      confirmedAndDownloadedAtNarrowZoom: browserZoom,
      staleSaveKeptExactDraft: true,
      keyboardReviewedFreshVersion: true,
      conflictAndSuccessFocused: true,
      retainedReviewBlockingAxeViolations: 0,
    }) + "\n",
  );
}
