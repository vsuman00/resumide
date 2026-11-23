import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "~/lib/server/supabase";
import { action, loader } from "~/routes/account";

vi.mock("~/lib/server/supabase", () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("~/lib/server/config", () => ({
  getServerConfig: () => ({ APP_ORIGIN: "https://resumide.example" }),
}));

const origin = "https://resumide.example";
const rotatedCookie = "synthetic-session=rotated; Path=/; HttpOnly";

function accountClient(signedIn = true) {
  const getSession = vi.fn().mockResolvedValue({
    data: { session: { access_token: "rotated-session-token" } },
    error: null,
  });
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const directSignOut = vi.fn().mockResolvedValue({ error: null });
  vi.mocked(createSupabaseServerClient).mockImplementation(
    (_request, headers) =>
      ({
        auth: {
          getUser: async () => {
            headers.append("Set-Cookie", rotatedCookie);
            return {
              data: {
                user: signedIn
                  ? { email: "account@example.test", created_at: "2026-01-01" }
                  : null,
              },
              error: null,
            };
          },
          getSession,
          signOut,
          admin: { signOut: directSignOut },
        },
      }) as never,
  );
  return { getSession, signOut, directSignOut };
}

function accountRequest(actionName?: string) {
  return new Request(
    origin + "/account",
    actionName === undefined
      ? undefined
      : {
          method: "POST",
          headers: { Origin: origin },
          body: new URLSearchParams({ action: actionName }),
        },
  );
}

afterEach(() => vi.resetAllMocks());

describe("account sessions", () => {
  it("returns the refreshed cookie on private account reads", async () => {
    accountClient();
    const response = await loader({ request: accountRequest() } as never);
    expect(response).toMatchObject({
      data: { email: "account@example.test" },
    });
    const headers = new Headers(response.init?.headers);
    expect(headers.get("Cache-Control")).toBe("private, no-store");
    expect(headers.getSetCookie()).toEqual([rotatedCookie]);
  });

  it("uses the authenticated client's rotated token to revoke other sessions", async () => {
    const { signOut, directSignOut } = accountClient();
    const response = await action({
      request: accountRequest("sign-out-others"),
    } as never);
    expect(createSupabaseServerClient).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
    expect(directSignOut).toHaveBeenCalledWith(
      "rotated-session-token",
      "others",
    );
    expect(response).toMatchObject({
      data: { success: expect.stringContaining("Other sessions") },
    });
    const headers = new Headers(response.init?.headers);
    expect(headers.get("Cache-Control")).toBe("private, no-store");
    expect(headers.getSetCookie()).toEqual([rotatedCookie]);
  });

  it.each(["denial", "transport failure"])(
    "keeps the refreshed cookie and reports a retryable failure on %s",
    async (failure) => {
      const { directSignOut, signOut } = accountClient();
      const providerError = new Error("synthetic private provider detail");
      for (const revoke of [directSignOut, signOut]) {
        if (failure === "denial")
          revoke.mockResolvedValue({ error: providerError });
        else revoke.mockRejectedValue(providerError);
      }
      const response = await action({
        request: accountRequest("sign-out-others"),
      } as never);
      expect(response).toMatchObject({ init: { status: 503 } });
      expect(JSON.stringify(response)).not.toContain(providerError.message);
      const headers = new Headers(response.init?.headers);
      expect(headers.get("Cache-Control")).toBe("private, no-store");
      expect(headers.getSetCookie()).toEqual([rotatedCookie]);
    },
  );

  it("preserves account recovery when the user is signed out", async () => {
    const { directSignOut } = accountClient(false);
    const response = await action({
      request: accountRequest("sign-out-others"),
    } as never).catch((error: unknown) => error);
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("Location")).toBe(
      "/auth?next=/account",
    );
    expect((response as Response).headers.get("Cache-Control")).toBe(
      "private, no-store",
    );
    expect(directSignOut).not.toHaveBeenCalled();
  });
});
