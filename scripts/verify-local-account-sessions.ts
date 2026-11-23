/** Account session controls in the built app with an in-process Auth transport. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { expect, type BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { withLocalFixtureBrowser } from "./local-fixture-browser";

const authOrigin = "https://local-build.invalid";
assert.equal(process.env.RESUMIDE_PRIVATE_VERIFY, "aa7-owned-synthetic");
assert.equal(process.env.SUPABASE_URL, authOrigin);
assert.equal(process.env.SUPABASE_PUBLISHABLE_KEY, "synthetic-build-fixture");
assert.equal(process.env.SUPABASE_SECRET_KEY, "synthetic-build-fixture");
assert.equal(process.env.OPENAI_API_KEY, "build-ai-harness-no-live-key");
assert.equal(process.env.AI_ENABLED, "false");
assert.equal(process.env.LATEX_CONVERTER_ENABLED, "false");

const email = "session-controls@example.test";
const password = randomUUID();
const user = {
  id: "69110000-0000-4000-8000-000000000007",
  email,
  aud: "authenticated",
  role: "authenticated",
  created_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: {},
};
type Session = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: "bearer";
  user: typeof user;
};
const sessions = new Set<Session>();
const issued: Session[] = [];
const logoutStatuses: number[] = [];
let expireNext = false;
let refreshCalls = 0;
let refreshedSession: Session | undefined;

function session(expiresIn: number): Session {
  const value: Session = {
    access_token: randomUUID(),
    refresh_token: randomUUID(),
    expires_in: expiresIn,
    token_type: "bearer",
    user,
  };
  sessions.add(value);
  return value;
}

async function authenticate(context: BrowserContext, base: string) {
  const cookies = new Map<string, string>();
  const client = createServerClient(authOrigin, "synthetic-unused", {
    global: { fetch: globalThis.fetch },
    cookies: {
      getAll: () => [],
      setAll: (values) => {
        for (const { name, value } of values) cookies.set(name, value);
      },
    },
  });
  const result = await client.auth.signInWithPassword({ email, password });
  assert(result.data.session && !result.error && cookies.size);
  await context.addCookies(
    [...cookies].map(([name, value]) => ({
      name,
      value,
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    })),
  );
}

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, authOrigin);
    const grant = url.searchParams.get("grant_type");
    if (url.pathname === "/auth/v1/token" && grant === "password") {
      assert.equal(request.method, "POST");
      assert.deepEqual(await request.json(), {
        email,
        password,
        gotrue_meta_security: {},
      });
      const value = session(expireNext ? -60 : 3_600);
      expireNext = false;
      issued.push(value);
      return Response.json(value);
    }
    if (url.pathname === "/auth/v1/token" && grant === "refresh_token") {
      assert.equal(request.method, "POST");
      refreshCalls += 1;
      const { refresh_token } = await request.json();
      const previous = issued.find(
        (value) => value.refresh_token === refresh_token,
      );
      assert(previous && sessions.delete(previous));
      refreshedSession = session(3_600);
      return Response.json(refreshedSession);
    }
    const active = [...sessions].find(
      (value) =>
        request.headers.get("Authorization") === `Bearer ${value.access_token}`,
    );
    if (url.pathname === "/auth/v1/user") {
      assert.equal(request.method, "GET");
      return active
        ? Response.json(user)
        : Response.json(
            { code: "session_not_found", message: "Synthetic ended session" },
            { status: 401 },
          );
    }
    assert.equal(url.pathname, "/auth/v1/logout");
    assert.equal(request.method, "POST");
    assert.equal(url.searchParams.get("scope"), "others");
    assert(active && active === refreshedSession);
    if (!logoutStatuses.length) {
      logoutStatuses.push(403);
      return Response.json(
        { code: "bad_jwt", message: "Synthetic refusal detail" },
        { status: 403 },
      );
    }
    logoutStatuses.push(204);
    for (const value of sessions) {
      if (value !== active) sessions.delete(value);
    }
    return new Response(null, { status: 204 });
  };

  await withLocalFixtureBrowser(
    { authOrigin, email, password, buildAiEnabled: false },
    "/build",
    async (context, page, base) => {
      const accountUrl = base + "/account";
      const response = await page.goto(accountUrl);
      assert.equal(response?.status(), 200);
      assert.equal(response.headers()["cache-control"], "private, no-store");
      await expect(page.getByText(email, { exact: true })).toBeVisible();

      const other = await context.browser()!.newContext();
      try {
        await authenticate(other, base);
        const otherAccount = () =>
          other.request.get(accountUrl, { maxRedirects: 0 });
        assert.equal((await otherAccount()).status(), 200);
        expireNext = true;
        sessions.delete(issued[0]);
        await authenticate(context, base);
        const signOut = page.getByRole("button", {
          name: "Sign out other sessions",
        });
        const denialResponse = page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === "/account.data",
        );
        await signOut.click();
        const denied = await denialResponse;
        assert.equal(denied.status(), 503);
        assert.equal(denied.headers()["cache-control"], "private, no-store");
        assert((await denied.headerValue("set-cookie"))?.includes("HttpOnly"));
        await expect(page.getByRole("alert")).toContainText(
          "We could not confirm sign-out on other devices.",
        );
        assert.equal(refreshCalls, 1);
        assert.equal((await otherAccount()).status(), 200);

        await signOut.click();
        await expect(page.getByRole("status")).toContainText(
          "Other sessions will end",
        );
        const restored = await page.reload();
        assert.equal(restored?.status(), 200);
        await expect(page.getByText(email, { exact: true })).toBeVisible();
        assert.equal(refreshCalls, 1);
        const endedSession = await otherAccount();
        assert.equal(endedSession.status(), 302);
        assert.match(endedSession.headers().location, /next=\/account$/u);
        assert.equal(
          endedSession.headers()["cache-control"],
          "private, no-store",
        );
        assert(!(await endedSession.text()).includes(email));
        await authenticate(other, base);
        assert.equal((await otherAccount()).status(), 200);
      } finally {
        await other.close();
      }
    },
  );
  assert.deepEqual(logoutStatuses, [403, 204]);
  process.stdout.write(
    JSON.stringify({
      browser: "Chromium",
      refreshCalls,
      logoutStatuses,
      rotatedCookieSurvivedDenial: true,
      otherSessionSurvivedDenial: true,
      currentSessionSurvivedSuccess: true,
      simulatedRevokedSessionDenied: true,
      newSignInSucceeded: true,
      managedAuthVerified: false,
    }) + "\n",
  );
} finally {
  globalThis.fetch = originalFetch;
}
