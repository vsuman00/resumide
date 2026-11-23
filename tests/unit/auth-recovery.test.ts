import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "~/routes/auth";
import { loader } from "~/routes/auth.callback";
import { createSupabaseServerClient } from "~/lib/server/supabase";

vi.mock("~/lib/server/config", () => ({
  getServerConfig: () => ({ APP_ORIGIN: "https://resumide.example" }),
}));
vi.mock("~/lib/server/supabase", () => ({
  createSupabaseServerClient: vi.fn(),
}));

const destination = "/build?view=preview#editor";
const origin = "https://resumide.example";
const exchange = vi.fn();
const send = vi.fn();
beforeEach(() => {
  exchange.mockReset();
  send.mockReset();
  vi.mocked(createSupabaseServerClient).mockReset();
  vi.mocked(createSupabaseServerClient).mockImplementation(
    (_request, headers) => {
      headers.append(
        "Set-Cookie",
        "synthetic-auth-state=test; HttpOnly; Path=/",
      );
      return {
        auth: { exchangeCodeForSession: exchange, signInWithOtp: send },
      } as never;
    },
  );
});

async function callback(code?: string) {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", destination);
  if (code) url.searchParams.set("code", code);
  return loader({ request: new Request(url), url } as never);
}

async function submit(email = "sign-in@example.test") {
  const body = new URLSearchParams({ email, next: destination });
  return action({
    request: new Request(origin + "/auth", {
      method: "POST",
      headers: { Origin: origin },
      body,
    }),
  } as never);
}

describe("email link recovery", () => {
  it.each(["missing", "rejected", "transport"] as const)(
    "keeps the destination when the code is %s",
    async (variant) => {
      if (variant === "rejected")
        exchange.mockResolvedValue({ error: new Error("private rejection") });
      if (variant === "transport")
        exchange.mockRejectedValue(new Error("private network error"));
      const response = await callback(
        variant === "missing" ? undefined : "synthetic-code",
      );
      const next = new URL(response.headers.get("Location")!, origin);
      expect(next.pathname).toBe("/auth");
      expect(Object.fromEntries(next.searchParams)).toEqual({
        error: "invalid_link",
        next: destination,
      });
      expect(exchange).toHaveBeenCalledTimes(variant === "missing" ? 0 : 1);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    },
  );

  it("returns to the validated location and forwards session cookies on success", async () => {
    exchange.mockResolvedValue({ error: null });
    const response = await callback("synthetic-code");
    expect(response.headers.get("Location")).toBe(destination);
    expect(response.headers.get("Set-Cookie")).toContain(
      "synthetic-auth-state",
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it.each(["rejected", "transport"] as const)(
    "returns a private, retryable message when email sending is %s",
    async (variant) => {
      if (variant === "rejected")
        send.mockResolvedValue({ error: new Error("private refusal") });
      else send.mockRejectedValue(new Error("private transport detail"));
      const response = await submit();
      expect(response).toBeInstanceOf(Response);
      const reply = response as Response;
      expect(await reply.json()).toEqual({
        error: "We could not send a sign-in link. Try again shortly.",
      });
      expect(reply.headers.get("Cache-Control")).toBe("private, no-store");
      expect(reply.headers.get("Set-Cookie")).toContain("synthetic-auth-state");
    },
  );

  it("sends the same return path with the replacement email link", async () => {
    send.mockResolvedValue({ error: null });
    const response = await submit();
    expect(response).toBeInstanceOf(Response);
    const [{ options }] = send.mock.calls[0];
    const callbackUrl = new URL(options.emailRedirectTo);
    expect(callbackUrl.origin).toBe(origin);
    expect(callbackUrl.pathname).toBe("/auth/callback");
    expect(callbackUrl.searchParams.get("next")).toBe(destination);
  });

  it("identifies an invalid email before attempting to send a link", async () => {
    const reply = await submit("invalid-address");
    expect(await reply.json()).toEqual({
      error: "Enter a valid email address.",
      errorField: "email",
    });
    expect(send).not.toHaveBeenCalled();
    expect(reply.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
