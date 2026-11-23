import type { Page } from "@playwright/test";
export async function selectSiteTheme(
  page: Page,
  theme: "light" | "dark" | "system",
) {
  const menu = page.locator(".site-navigation details");
  if ((await menu.getAttribute("open")) === null)
    await page.getByLabel("Open site menu").click();
  await menu.getByRole("combobox", { name: "Color theme" }).selectOption(theme);
  await page.getByLabel("Open site menu").click();
}
