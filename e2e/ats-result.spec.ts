import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createLatexOwner } from "../tests/fixtures/latex-auth";
import { seedAtsAnalysis } from "../tests/fixtures/ats-seed";

// Result page for a v2-matched synthetic analysis: two results, JD match, parsed profile.
test.setTimeout(90000);
const shots = process.env.ATS_SHOT_DIR;

test("result page shows parse health and JD match as two results, with accessible tabs", async ({
  page,
  context,
}) => {
  const owner = await createLatexOwner();
  let seeded: Awaited<ReturnType<typeof seedAtsAnalysis>> | undefined;
  try {
    seeded = await seedAtsAnalysis(owner);
    await owner.login(context);
    await page.goto(`/resume/${seeded.analysisId}`);

    const two = page.getByRole("group", { name: "Your two results" });
    await expect(two).toBeVisible();
    await expect(
      two.getByRole("heading", { name: "Parse health" }),
    ).toBeVisible();
    await expect(two.getByRole("heading", { name: "JD match" })).toBeVisible();
    await expect(two).toContainText(/\d+ of \d+ checks pass/);
    // Synthetic JD: 6 minimum qualifications ("AWS, Terraform or Google Cloud" is one); only GraphQL is absent.
    await expect(two).toContainText("5 of 6 minimum qualifications met");
    if (shots)
      await page.screenshot({
        path: `${shots}/live-overview.png`,
        fullPage: true,
      });

    // The legacy blended score is not a second headline, and the report matches the page.
    await expect(page.getByLabel("Legacy analysis score")).toHaveCount(0);
    const reportHref = await page
      .locator("a.result-report-link")
      .getAttribute("href");
    const reportText = await page.evaluate(
      async (href) => (await fetch(href!)).text(),
      reportHref,
    );
    expect(reportText).toContain("JD match: 5 of 6 minimum qualifications met");
    expect(reportText).toMatch(/- Not found: GraphQL/);
    expect(reportText).toMatch(/Parse health: \d+ of \d+ checks pass/);
    await expect(
      page.getByText("Items to improve").locator(".."),
    ).not.toContainText(/^0$/);

    await page.getByRole("tab", { name: "Keywords" }).click();
    const panel = page.locator(".jd-match");
    await expect(panel).toBeVisible();
    const required = panel.locator(".jd-list").first().locator(".jd-item");
    await expect(required).toHaveCount(8);
    await expect(required.first()).toHaveClass(/is-missing/);
    await expect(required.first()).toContainText("GraphQL");
    await expect(panel).toContainText("Met by alternative");
    await expect(panel).toContainText("Preferred qualifications");
    await expect(panel).toContainText("authorized to work");
    await expect(panel).toContainText("evidence only");
    if (shots)
      await page.screenshot({
        path: `${shots}/live-jd-match.png`,
        fullPage: true,
      });
    expect(
      (await new AxeBuilder({ page }).include(".jd-match").analyze())
        .violations,
    ).toEqual([]);

    await page.getByRole("tab", { name: "Parse view" }).click();
    const profile = page.locator(".parsed-profile");
    await expect(profile).toBeVisible();
    await expect(profile.getByRole("table")).toContainText(
      "Senior Software Engineer",
    );
    await expect(profile).toContainText("alex@example.test");
    if (shots)
      await page.screenshot({
        path: `${shots}/live-parsed-profile.png`,
        fullPage: true,
      });
    expect(
      (await new AxeBuilder({ page }).include(".parsed-profile").analyze())
        .violations,
    ).toEqual([]);

    // No horizontal page scroll on any tab at phone, small and tablet widths.
    for (const width of [320, 390, 768, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      for (const tab of ["Overview", "Parse view", "Keywords"]) {
        await page.getByRole("tab", { name: tab }).click();
        const culprits = await page.evaluate(() =>
          [...document.querySelectorAll("main *")]
            .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
            // Content inside its own horizontal scroller (the tab strip) is not page overflow.
            .filter((e) => {
              for (let a = e.parentElement; a; a = a.parentElement)
                if (/auto|scroll|hidden/.test(getComputedStyle(a).overflowX))
                  return false;
              return true;
            })
            .map(
              (e) =>
                `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]}`,
            )
            .slice(0, 5),
        );
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(
          overflow,
          `${tab} at ${width}px: ${culprits.join(", ")}`,
        ).toBeLessThanOrEqual(1);
      }
    }
    // FT-07: on a wide screen the two result cards use the whole summary row.
    await page.getByRole("tab", { name: "Overview" }).click();
    const widths = await page.evaluate(() => ({
      cards: document.querySelector(".two-results")!.getBoundingClientRect()
        .width,
      header: document
        .querySelector(".result-score-header")!
        .getBoundingClientRect().width,
    }));
    expect(widths.cards).toBeGreaterThan(widths.header * 0.8);
  } finally {
    await seeded?.cleanup().catch(() => undefined);
    await owner.cleanup();
  }
});
