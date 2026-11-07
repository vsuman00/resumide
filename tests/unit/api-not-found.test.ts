import { describe, expect, it } from "vitest";
import { action, loader } from "~/routes/api.not-found";

describe("unknown API routes", () => {
  it.each([
    ["GET", loader],
    ["POST", action],
  ])(
    "returns the JSON error envelope for %s requests",
    async (method, handler) => {
      const response = handler({
        request: new Request("https://resumide.example/api/nope", {
          method,
          headers: { "X-Request-Id": "request-1234" },
        }),
      } as never);

      expect(response.status).toBe(404);
      expect(response.headers.get("Content-Type")).toMatch(
        /^application\/json/,
      );
      expect(response.headers.get("X-Request-Id")).toBe("request-1234");
      await expect(response.json()).resolves.toEqual({
        error: {
          code: "NOT_FOUND",
          message: "API endpoint not found.",
          retryable: false,
          requestId: "request-1234",
        },
      });
    },
  );
});
