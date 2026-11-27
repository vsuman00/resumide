import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/auth?next=/upload",
  "/upload",
  "/analysis/test-id",
  "/account",
  "/privacy",
  "/resume/missing",
  "/missing-page",
];

test.describe("Phase 6 accessible runtime matrix", () => {
  for (const width of [390, 768, 1024, 1366, 1440]) {
    test(`keeps one heading and no horizontal overflow at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/upload");
      await expect(page.locator("h1")).toHaveCount(1);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
    });
  }

  test("routes have no client console errors or page exceptions", async ({
    page,
  }) => {
    const issues: string[] = [];
    page.on("pageerror", (error) =>
      issues.push(`pageerror at ${page.url()}: ${error.message}`),
    );
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        issues.push(
          `console ${message.type()} at ${page.url()}: ${message.text()}`,
        );
      }
    });

    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("h1")).toHaveCount(1);
    }
    const expectedUnauthenticatedProbe = /analysis\/test-id/;
    const expectedMissingRoute = /missing-page/;
    expect(
      issues.filter(
        (issue) =>
          !(
            expectedUnauthenticatedProbe.test(issue) ||
            expectedMissingRoute.test(issue)
          ),
      ),
    ).toEqual([]);
  });

  test("reduced motion keeps upload controls usable", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/upload");
    await expect(
      page.getByRole("heading", { name: /prepare a new analysis/i }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Upload resume file (PDF or Word)"),
    ).toBeAttached();
    await expect
      .poll(() =>
        page.evaluate(
          () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        ),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).transitionDuration,
      ),
    ).toMatch(/^(0\.01ms|1e-05s)$/);
  });

  test("forced-colors mode retains readable structure and touch targets", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/upload");
    await page
      .getByLabel("Upload resume file (PDF or Word)")
      .setInputFiles("scripts/dummy.pdf");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator(".file-dropzone-replace")).toBeVisible();
    const sizes = await page.evaluate(() =>
      [
        document.querySelector(".upload-submit"),
        document.querySelector(".file-dropzone-replace"),
      ].map((element) => {
        const rect = element?.getBoundingClientRect();
        return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
      }),
    );
    expect(
      sizes.every(({ width, height }) => width >= 44 && height >= 44),
    ).toBe(true);
  });

  test("important upload actions remain reachable at 200% zoom", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/upload");
    await page.evaluate(() => {
      document.body.style.zoom = "2";
    });
    await expect(
      page.getByRole("heading", { name: /prepare a new analysis/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /analyze resume/i }),
    ).toBeVisible();
    await page.getByLabel("Job title").focus();
    await expect(page.getByLabel("Job title")).toBeFocused();
  });

  test("offline upload shows a recoverable, announced error", async ({
    page,
  }) => {
    await page.route("**/api/analyze", (route) => route.abort("failed"));
    await page.goto("/upload");
    await page
      .getByLabel("Upload resume file (PDF or Word)")
      .setInputFiles("scripts/dummy.pdf");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /analyze resume/i }).click();
    await expect(page.getByRole("alert")).toContainText(/offline|connection/i);
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("analysis status can recover after a transient failure", async ({
    page,
  }) => {
    let attempts = 0;
    await page.route("**/api/analysis/retry-analysis", async (route) => {
      attempts += 1;
      if (attempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: { message: "Temporary connection failure." },
          }),
        });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          status: "completed",
          stage_updated_at: "2026-09-11T00:00:00.000Z",
          completed_at: "2026-09-11T00:01:00.000Z",
        }),
      });
    });

    await page.goto("/analysis/retry-analysis");
    await expect(page.getByRole("alert")).toContainText(
      /temporary connection/i,
    );
    await page.getByRole("button", { name: "Retry status check" }).click();
    await expect(page.getByText("Current status: completed.")).toBeVisible();
    expect(attempts).toBeGreaterThanOrEqual(2);
  });
});
