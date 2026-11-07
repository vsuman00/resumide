import { createServerClient } from "@supabase/ssr";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createBrowserOwner } from "../scripts/browser-owner-fixture";
import { selectSiteTheme } from "./site-menu";

test("one floating navbar connects public home, history, upload and Build with theme in its menu", async ({
  page,
  context,
}) => {
  const owner = await createBrowserOwner();
  const cookies: { name: string; value: string }[] = [];
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
  try {
    if (
      (
        await client.auth.signInWithPassword({
          email: owner.email,
          password: owner.password,
        })
      ).error
    )
      throw Error("Synthetic navigation sign-in failed");
    await context.addCookies(
      cookies.map((cookie) => ({
        ...cookie,
        url: "http://127.0.0.1:3110",
        httpOnly: true,
        sameSite: "Lax" as const,
      })),
    );
    for (const path of ["/", "/analyses", "/upload", "/build"]) {
      await page.goto(path);
      await expect(
        page.locator('.site-navigation nav[aria-label="Main navigation"] a'),
      ).toHaveText(["Home", "Analyses", "New analysis", "Build"]);
      expect(
        await page
          .locator('.site-navigation nav[aria-label="Main navigation"] a')
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("href")),
          ),
      ).toEqual(["/", "/analyses", "/upload", "/build"]);
      await expect(
        page.getByRole("combobox", { name: "Color theme" }),
      ).toBeHidden();
      await page.getByLabel("Open site menu").click();
      await expect(
        page.getByRole("combobox", { name: "Color theme" }),
      ).toBeVisible();
      await page.getByLabel("Open site menu").click();
    }
    await page.goto("/analyses");
    await expect(
      page.getByRole("heading", { name: "Resume workspace" }),
    ).toBeVisible();
    await expect(page.locator(".workspace-rail")).toHaveCount(0);
    await page
      .getByRole("link", { name: "Resumide home", exact: true })
      .click();
    await expect(page).toHaveURL("http://127.0.0.1:3110/");
    await expect(
      page.getByRole("heading", { name: "See what the ATS sees." }),
    ).toBeVisible();
    await page.goto("/analyses");
    for (const width of [1366, 853, 390, 320]) {
      await page.setViewportSize({ width, height: 978 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const header = page.locator(".site-navigation");
      expect(await header.evaluate((el) => getComputedStyle(el).position)).toBe(
        "sticky",
      );
      expect(
        await header.evaluate((el) => getComputedStyle(el).backdropFilter),
      ).toContain("blur");
      await page.getByLabel("Open site menu").click();
      const signOut = page.getByRole("button", {
        name: "Sign out",
        exact: true,
      });
      const bounds = await signOut.boundingBox();
      expect(bounds!.height).toBeLessThanOrEqual(52);
      expect(bounds!.width).toBeLessThan(250);
      expect(
        (await new AxeBuilder({ page }).include(".site-navigation").analyze())
          .violations,
      ).toEqual([]);
      if (width === 390)
        await page.screenshot({
          path: `${process.env.BROWSER_EVIDENCE_DIR ?? "docs/evaluation"}/floating-navigation-mobile-20261031.png`,
          clip: { x: 0, y: 0, width, height: 600 },
        });
      await page.getByLabel("Open site menu").click();
      if (width === 1366)
        await page.screenshot({
          path: `${process.env.BROWSER_EVIDENCE_DIR ?? "docs/evaluation"}/floating-navigation-desktop-20261031.png`,
          clip: { x: 0, y: 0, width, height: 130 },
        });
    }
    await selectSiteTheme(page, "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  } finally {
    await client.auth.signOut();
    await owner.cleanup();
  }
});
