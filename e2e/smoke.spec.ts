import { selectSiteTheme } from "./site-menu";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  setLocalFixtureViewport,
  verifyLocalFixtureZoom,
  withLocalFixtureBrowserContext,
} from "../scripts/local-fixture-browser";

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
  await selectSiteTheme(page, "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('select[aria-label="Color theme"]')).toHaveValue(
    "dark",
  );
});

test("mobile shell keeps its primary actions visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByLabel("Open site menu")).toBeVisible();
  await page.getByLabel("Open site menu").click();
  await expect(
    page.getByRole("combobox", { name: "Color theme" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "New analysis", exact: true }),
  ).toBeVisible();
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
  const alert = page.getByRole("alert");
  await expect(
    alert.getByRole("heading", { name: "This sign-in link could not be used" }),
  ).toBeFocused();
  await expect(alert).toContainText(
    "Request a new link below, then open it in this browser.",
  );
  await expect(
    page.getByRole("button", { name: "Send secure sign-in link" }),
  ).toBeEnabled();
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

test("saved upload waits for the worker then reaches scanner recovery", async ({
  page,
}) => {
  let status = "quarantined";
  await page.route("**/api/analysis/waiting-ocr", (route) =>
    route.fulfill({
      json: {
        id: "waiting-ocr",
        status,
        stage_updated_at: "2026-11-22T00:00:00.000Z",
        completed_at: null,
        ...(status === "needs_ocr" ? { recovery: "ocr_unavailable" } : {}),
      },
    }),
  );
  await page.goto("/analysis/waiting-ocr");
  await expect(
    page.getByRole("heading", { name: "Resume saved", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Waiting for a worker" }),
  ).toBeVisible();
  await expect(page.locator('[aria-current="step"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Cancel analysis" }),
  ).toBeVisible();
  await expect(page.getByText(/will keep running/i)).toHaveCount(0);
  status = "extracting";
  await expect(page.locator('[aria-current="step"]')).toContainText(
    "Extract and parse",
  );
  status = "needs_ocr";
  await expect(
    page.getByRole("heading", { name: "OCR is unavailable", level: 1 }),
  ).toBeVisible({ timeout: 8_000 });
  await expect(
    page.getByRole("link", { name: "Upload a text-based PDF" }),
  ).toHaveAttribute("href", "/upload");
  await expect(
    page.getByRole("link", { name: "Review extracted evidence" }),
  ).toHaveAttribute("href", "/analysis/waiting-ocr/evidence");
  await expect(
    page.getByRole("button", { name: "Cancel analysis" }),
  ).toHaveCount(0);
});

test("evidence status retry keeps keyboard focus at 200% browser zoom", async ({
  baseURL,
}) => {
  if (!baseURL) throw new Error("A local browser test origin is required.");
  const origin = new URL(baseURL).origin;
  await withLocalFixtureBrowserContext(true, async (context) => {
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage();
    await setLocalFixtureViewport(page, 390, 740);
    await page.emulateMedia({
      colorScheme: "dark",
      reducedMotion: "reduce",
    });
    let checks = 0;
    let releaseRetry!: () => void;
    const pendingRetry = new Promise<void>((resolve) => {
      releaseRetry = resolve;
    });
    await page.route("**/api/analysis/zoom-recovery", async (route) => {
      const next = ++checks;
      if (next === 2) await pendingRetry;
      await route.fulfill({
        json: {
          id: "zoom-recovery",
          status: "needs_ocr",
          recovery: next === 1 ? "review_status_unavailable" : "ocr_review",
          stage_updated_at: "2026-11-22T00:00:00.000Z",
          completed_at: null,
        },
      });
    });
    await page.goto(`${origin}/analysis/zoom-recovery`);
    await verifyLocalFixtureZoom(page, 390);
    await expect(
      page.getByRole("heading", {
        name: "Extraction needs attention",
        level: 1,
      }),
    ).toBeVisible();
    await setLocalFixtureViewport(page, 320, 640);
    await verifyLocalFixtureZoom(page, 320);
    const progress = page.getByRole("region", { name: "Analysis progress" });
    const status = progress.getByRole("status");
    const retry = progress.getByRole("button", {
      name: "Check evidence status",
    });
    await retry.press("Enter");
    try {
      await expect(status).toBeFocused();
      await expect(status).toHaveText("Checking the latest analysis status.");
    } finally {
      releaseRetry();
    }
    await expect(
      page.getByRole("heading", {
        name: "OCR evidence needs review",
        level: 1,
      }),
    ).toBeVisible();
    await expect(status).toBeFocused();
    await expect(status).toContainText("Current status: needs ocr.");
    await expect(
      progress.getByRole("heading", { name: "Scores are withheld" }),
    ).toBeVisible();
    const review = progress.getByRole("link", {
      name: "Review extracted evidence",
    });
    await page.keyboard.press("Tab");
    await expect(review).toBeFocused();
    expect(
      await review.evaluate((element) => {
        const { left, right } = element.getBoundingClientRect();
        return left >= 0 && right <= innerWidth;
      }),
    ).toBe(true);
    const result = await new AxeBuilder({ page })
      .include('[aria-label="Analysis progress"]')
      .analyze();
    expect(
      result.violations
        .filter(({ impact }) => impact === "serious" || impact === "critical")
        .map(({ id }) => id),
    ).toEqual([]);
    await Promise.all([
      page.waitForRequest((request) =>
        /\/analysis\/zoom-recovery\/evidence(?:\.data)?$/u.test(
          new URL(request.url()).pathname,
        ),
      ),
      page.keyboard.press("Enter"),
    ]);
    expect(checks).toBe(2);
  });
});

for (const [recovery, title, review] of [
  ["native_review", "Extracted text needs review", true],
  ["ocr_review", "OCR evidence needs review", true],
  ["ocr_failed", "OCR could not finish", true],
  ["ocr_incomplete", "OCR needs more readable text", true],
  ["text_pdf_required", "A text-based PDF is needed", false],
  ["review_status_unavailable", "Extraction needs attention", false],
] as const) {
  test(`shows the appropriate extraction action for ${recovery}`, async ({
    page,
  }) => {
    await page.route("**/api/analysis/recovery-test", (route) =>
      route.fulfill({
        json: {
          id: "recovery-test",
          status: "needs_ocr",
          recovery,
          stage_updated_at: "2026-11-22T00:00:00.000Z",
          completed_at: null,
        },
      }),
    );
    await page.goto("/analysis/recovery-test");
    await expect(
      page.getByRole("heading", { name: title, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Scores are withheld" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Review extracted evidence" }),
    ).toHaveCount(Number(review));
    if (recovery === "review_status_unavailable") {
      await expect(
        page.getByRole("button", { name: "Check evidence status" }),
      ).toBeVisible();
    }
    await expect(page.locator('[aria-current="step"]')).toHaveCount(0);
  });
}

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

      await selectSiteTheme(page, "dark");
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
