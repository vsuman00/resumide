import { expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => ({
    APP_ORIGIN: "https://example.test",
    NODE_ENV: "production",
    CSP_MODE: "enforce",
    CSP_REPORT_URI: "",
  }),
}));
import { responseSecurity } from "../../app/lib/server/response-security";
it("applies browser policy at the framework boundary without losing private loader headers", async () => {
  const response = await responseSecurity(
    {
      request: new Request("https://example.test/privacy"),
      context: new RouterContextProvider(),
    },
    async () =>
      new Response("private", {
        headers: {
          "Cache-Control": "private, no-store",
          "Set-Cookie": "session=value; HttpOnly",
        },
      }),
  );
  expect(response.headers.get("Content-Security-Policy")).toContain(
    "frame-ancestors 'none'",
  );
  expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("Strict-Transport-Security")).toContain(
    "31536000",
  );
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Set-Cookie")).toContain("session=value");
});

it.each([
  ["no-referrer", "no-referrer"],
  ["unsafe-url", "strict-origin-when-cross-origin"],
])(
  "enforces the referrer policy with route setting %s",
  async (policy, expected) => {
    const response = await responseSecurity(
      {
        request: new Request("https://example.test/auth/callback"),
        context: new RouterContextProvider(),
      },
      async () =>
        new Response(null, { headers: { "Referrer-Policy": policy } }),
    );
    expect(response.headers.get("Referrer-Policy")).toBe(expected);
  },
);
