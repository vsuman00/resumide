import { expect, test } from "@playwright/test";

test("public browser server is healthy with its database unavailable", async ({
  request,
}) => {
  expect((await request.get("/healthz")).status()).toBe(200);
  expect((await request.get("/readyz")).status()).toBe(503);
});
