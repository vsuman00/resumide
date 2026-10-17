import { expect, test } from "@playwright/test";

test("production responses include the security policy", async ({
  request,
}) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["referrer-policy"]).toBe(
    "strict-origin-when-cross-origin",
  );
  const cspHeader =
    process.env.CSP_MODE === "enforce"
      ? "content-security-policy"
      : "content-security-policy-report-only";
  expect(response.headers()[cspHeader]).toContain("frame-ancestors 'none'");
  expect(response.headers()["strict-transport-security"]).toBeUndefined();
});

test("telemetry accepts only the PII-free event contract", async ({
  request,
}) => {
  const accepted = await request.post("/api/telemetry", {
    data: { type: "web_vital", name: "LCP", value: 123, path: "/upload" },
  });
  expect(accepted.status()).toBe(204);

  const rejected = await request.post("/api/telemetry", {
    data: {
      type: "client_error",
      code: "window_error",
      path: "/upload",
      message: "resume body must never cross telemetry boundary",
    },
  });
  expect(rejected.status()).toBe(400);
});

test("cross-origin state-changing requests are rejected", async ({
  request,
}) => {
  const response = await request.post("/api/telemetry", {
    headers: { Origin: "https://attacker.example" },
    data: { type: "web_vital", name: "LCP", value: 123, path: "/" },
  });
  expect(response.status()).toBe(403);
});
