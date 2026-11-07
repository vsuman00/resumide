import { expect, test } from "@playwright/test";

test("public examples avoid numeric claims and the medium header stays compact", async ({
  page,
}) => {
  await page.setViewportSize({ width: 788, height: 980 });
  await page.goto("/");
  await expect(page.locator(".scene-score-orb")).toHaveText("✓");
  await expect(page.locator(".public-result-preview")).not.toContainText(
    /78|highest-impact|Top priorities/,
  );
  await page.getByLabel("Open site menu").click();
  await expect(
    page.getByRole("link", { name: "Analyses", exact: true }),
  ).toHaveAttribute("href", "/analyses");
  await expect(
    page.getByRole("link", { name: "Build", exact: true }),
  ).toHaveAttribute("href", "/build");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${process.env.BROWSER_EVIDENCE_DIR ?? "docs/evaluation"}/navigation-public-menu-20261031.png`,
  });
  await page.goto("/upload");
  await expect(
    page.getByText(/This workflow requires consent to AI processing/),
  ).toBeVisible();
});
