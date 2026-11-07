import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { action, loader } from "~/routes/auth.logout";

const environment = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
  SUPABASE_SECRET_KEY: "synthetic-secret-key",
  APP_ORIGIN: "https://resumide.example",
  OPENAI_API_KEY: "synthetic-openai-key",
};

describe("auth logout origin policy", () => {
  const previous = { ...process.env };
  beforeEach(() => {
    Object.assign(process.env, environment);
  });
  afterEach(() => {
    process.env = { ...previous };
  });

  it("returns 405 with the allowed method for non-POST requests", () => {
    const response = loader({
      request: new Request("https://resumide.example/auth/logout", {
        headers: { "X-Request-Id": "request-1234" },
      }),
    } as never);

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    expect(response.headers.get("X-Request-Id")).toBe("request-1234");
  });

  it("rejects non-POST methods even when routed through the action", async () => {
    const response = await action({
      request: new Request("https://resumide.example/auth/logout", {
        method: "PUT",
        headers: { "X-Request-Id": "request-1234" },
      }),
    } as never);

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("rejects a foreign browser origin with a safe 403 response", async () => {
    const response = await action({
      request: new Request("https://resumide.example/auth/logout", {
        method: "POST",
        headers: {
          Origin: "https://attacker.example",
          "X-Request-Id": "request-1234",
        },
      }),
    } as never);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.requestId).toBe("request-1234");
    expect(response.headers.get("X-Request-Id")).toBe("request-1234");
  });
});
