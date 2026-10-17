import { expect, test } from "@playwright/test";

test("health and readiness are available", async ({ request }) => {
  await expect((await request.get("/healthz")).status()).toBe(200);
  await expect((await request.get("/readyz")).status()).toBe(200);
});

test("home renders the candidate history state", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toHaveAttribute("href", "#main-content");
  await expect(
    page.getByRole("heading", { name: /see what the ats sees/i }),
  ).toBeVisible();
  await expect(
    page.locator(".public-hero").getByRole("link", {
      name: /analyze your resume/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /a result you can actually use/i }),
  ).toBeAttached();
  await expect(page.getByRole("contentinfo")).toBeAttached();
});

test("theme preference applies and survives a reload", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Color theme" })
    .selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("combobox", { name: "Color theme" })).toHaveValue(
    "dark",
  );
});

test("mobile shell keeps its primary actions visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(
    page.getByRole("combobox", { name: "Color theme" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^analyze resume$/i }),
  ).toBeVisible();
  await page.locator(".public-mobile-menu summary").click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

test("sign-in form retains an approved return path", async ({ page }) => {
  await page.goto("/auth?next=/upload");
  await expect(
    page.getByRole("heading", { name: /sign in to resumide/i }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveAttribute(
    "autocomplete",
    "email",
  );
  await expect(page.locator('input[name="next"]')).toHaveValue("/upload");
});

test("invalid sign-in callback recovers safely", async ({ page }) => {
  await page.goto("/auth/callback?next=//untrusted.example");
  await expect(page).toHaveURL(/\/auth\?error=invalid_link$/);
  await expect(page.getByRole("alert")).toContainText(/expired/i);
});

test("upload page supports keyboard/file states and safe API errors", async ({
  page,
}) => {
  await page.goto("/upload");
  await expect(
    page.getByRole("heading", { name: /prepare a new analysis/i }),
  ).toBeVisible();
  const jobTitle = page.getByLabel("Job title");
  await jobTitle.focus();
  await expect(jobTitle).toBeFocused();
  await page.getByLabel("Upload PDF resume").setInputFiles("scripts/dummy.pdf");
  await page.getByRole("checkbox").check();
  await expect(
    page.getByRole("button", { name: /analyze resume/i }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /analyze resume/i }).click();
  await expect(page.getByRole("alert")).toContainText(/sign in|analysis/i);
});

test("stopping an in-flight upload does not claim its server data was deleted", async ({
  page,
}) => {
  let releaseRequest: (() => void) | undefined;
  await page.route("**/api/analyze", async (route) => {
    await new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await route.abort();
  });

  await page.goto("/upload");
  await page.getByLabel("Upload PDF resume").setInputFiles("scripts/dummy.pdf");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /analyze resume/i }).click();
  await page.getByRole("button", { name: "Stop upload", exact: true }).click();

  await expect(page.getByRole("alert")).toContainText(
    /may have received your file/i,
  );
  releaseRequest?.();
});

test("progress stub exposes an announced state", async ({ page }) => {
  await page.goto("/analysis/test-id");
  await expect(
    page.getByRole("heading", { name: /analyzing your resume/i }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(/sign in/i);
});

test("partial analysis exposes its durable result link", async ({ page }) => {
  await page.route("**/api/analysis/partial-analysis", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "partial-analysis",
        status: "partial",
        stage_updated_at: "2026-09-10T00:00:00.000Z",
        completed_at: "2026-09-10T00:00:00.000Z",
      }),
    });
  });

  await page.goto("/analysis/partial-analysis");
  await expect(page.getByText("Current status: partial.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /view partial result/i }),
  ).toHaveAttribute("href", "/resume/partial-analysis");
});

test("signed-out result access redirects without revealing existence", async ({
  page,
}) => {
  const response = await page.goto("/resume/missing");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/auth\?next=%2Fresume%2Fmissing$/);
  await expect(
    page.getByRole("heading", { name: /sign in to resumide/i }),
  ).toBeVisible();
});

test("unknown routes use the branded recovery state", async ({ page }) => {
  const response = await page.goto("/missing-page");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: /page not found/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /return to resumide/i }),
  ).toHaveAttribute("href", "/");
});

test.describe("responsive upload layout", () => {
  for (const width of [390, 768, 1024, 1366, 1440]) {
    test(`renders at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/upload");
      await expect(
        page.getByRole("heading", { name: /prepare a new analysis/i }),
      ).toBeVisible();
    });
  }
});

test.describe("completed design shells", () => {
  const routes = [
    "/",
    "/auth?next=/upload",
    "/upload",
    "/analysis/test-id",
    "/privacy",
    "/resume/missing",
    "/missing-page",
  ];

  for (const route of routes) {
    test(`${route} stays responsive in dark mode`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route);

      const themeControl = page.getByRole("combobox", { name: "Color theme" });
      await themeControl.selectOption("dark");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      await expect(page.locator("h1")).toBeVisible();
    });
  }
});
