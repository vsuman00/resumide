import { describe, expect, it } from "vitest";
import { getAuthenticatedUser, safeReturnTo } from "../../app/lib/server/auth";
import { getSessionCookieOptions } from "../../app/lib/server/supabase";

describe("authentication helpers", () => {
  it("permits only same-site return paths", () => {
    expect(safeReturnTo("/upload")).toBe("/upload");
    expect(safeReturnTo("https://untrusted.example")).toBe("/");
    expect(safeReturnTo("//untrusted.example")).toBe("/");
  });

  it("preserves local navigation context and rejects ambiguous or recursive destinations", () => {
    expect(safeReturnTo("/build?view=preview#editor")).toBe(
      "/build?view=preview#editor",
    );
    expect(safeReturnTo("/build/./draft")).toBe("/build/draft");
    expect(safeReturnTo("/auth/callback")).toBe("/");
    expect(safeReturnTo(String.raw`/build\draft`)).toBe("/");
    expect(safeReturnTo("/build\ndraft")).toBe("/");
  });

  it("returns no user when Supabase rejects the session", async () => {
    const user = await getAuthenticatedUser({
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: new Error("expired"),
        }),
      },
    });

    expect(user).toBeNull();
  });

  it("uses server-only secure HTTPS session cookies", () => {
    expect(getSessionCookieOptions("https://app.resumide.example")).toEqual({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
      maxAge: 3_600,
    });
    expect(getSessionCookieOptions("http://127.0.0.1:3120").secure).toBe(false);
  });
});
