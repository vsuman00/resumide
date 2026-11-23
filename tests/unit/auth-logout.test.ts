import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { action, loader } from "~/routes/auth.logout";
import { createSupabaseServerClient } from "~/lib/server/supabase";

vi.mock("~/lib/server/supabase", () => ({
  createSupabaseServerClient: vi.fn(),
}));

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
    vi.resetAllMocks();
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

  it("reports a retryable failure when Auth cannot sign out the session", async () => {
    const signOut = vi.fn().mockResolvedValue({
      error: new Error("synthetic-private-provider-error"),
    });
    vi.mocked(createSupabaseServerClient).mockImplementation(
      (_request, headers) => {
        headers.append("Set-Cookie", "synthetic-session=; Max-Age=0; Path=/");
        return { auth: { signOut } } as never;
      },
    );
    const response = await action({
      request: new Request("https://resumide.example/auth/logout", {
        method: "POST",
        headers: { Origin: "https://resumide.example" },
      }),
    } as never);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(503);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(await response.text()).not.toContain(
      "synthetic-private-provider-error",
    );
  });

  it("keeps the successful redirect and session cookie removal", async () => {
    vi.mocked(createSupabaseServerClient).mockImplementation(
      (_request, headers) =>
        ({
          auth: {
            signOut: vi.fn(async () => {
              headers.append(
                "Set-Cookie",
                "synthetic-session=; Max-Age=0; Path=/",
              );
              return { error: null };
            }),
          },
        }) as never,
    );
    const response = await action({
      request: new Request("https://resumide.example/auth/logout", {
        method: "POST",
        headers: { Origin: "https://resumide.example" },
      }),
    } as never);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/");
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });
});
