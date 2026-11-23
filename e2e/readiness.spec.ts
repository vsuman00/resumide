import { expect, test } from "@playwright/test";

test("health and readiness are available", async ({ request }) => {
  expect((await request.get("/healthz")).status()).toBe(200);
  expect((await request.get("/readyz")).status()).toBe(200);
});
