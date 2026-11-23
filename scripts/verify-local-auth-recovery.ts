/** Built-app email-link recovery with an in-process Supabase Auth fixture. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import {
  setLocalFixtureViewport,
  verifyLocalFixtureZoom,
  withLocalFixtureBrowser,
} from "./local-fixture-browser";
import { localBrowserAccount } from "./local-postgres-supabase";

const authOrigin = "https://local-build.invalid";
const browserZoom = process.env.RESUMIDE_ACCOUNT_BROWSER_ZOOM === "true";
assert.equal(process.env.RESUMIDE_PRIVATE_VERIFY, "aa7-owned-synthetic");
assert.equal(process.env.SUPABASE_URL, authOrigin);
assert.equal(process.env.SUPABASE_PUBLISHABLE_KEY, "synthetic-build-fixture");
assert.equal(process.env.SUPABASE_SECRET_KEY, "synthetic-build-fixture");
assert.equal(process.env.OPENAI_API_KEY, "build-ai-harness-no-live-key");
assert.equal(process.env.AI_ENABLED, "false");
assert.equal(process.env.LATEX_CONVERTER_ENABLED, "false");

const account = localBrowserAccount(
  "69110000-0000-4000-8000-000000000005",
  "link-recovery@example.test",
);
const destination = "/build?panel=preview#editor";
const originalFetch = globalThis.fetch;
const shaChallenge = (verifier: string) =>
  createHash("sha256").update(verifier).digest("base64url");
const deliveries: { callback: URL; challenge: string }[] = [];
let user: unknown;
let currentToken = "";
let otpCalls = 0;
let exchangeCalls = 0;
let logoutCalls = 0;
let exchanged = false;
let releaseResendFailure: () => void;
const resendGate = new Promise<void>((resolve) => {
  releaseResendFailure = resolve;
});
try {
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, authOrigin);
    if (url.pathname === "/auth/v1/otp" && request.method === "POST") {
      otpCalls += 1;
      const body = await request.json();
      assert.equal(body.email, account.email);
      assert.match(body.code_challenge, /^[A-Za-z0-9_-]{43}$/u);
      assert.equal(body.code_challenge_method.toLowerCase(), "s256");
      const callback = new URL(url.searchParams.get("redirect_to")!);
      assert.equal(callback.origin, process.env.APP_ORIGIN);
      assert.equal(callback.pathname, "/auth/callback");
      assert.equal(callback.searchParams.get("next"), destination);
      if (otpCalls === 2) {
        await resendGate;
        return Response.json(
          { code: "over_email_send_rate_limit", message: "Synthetic refusal" },
          { status: 429 },
        );
      }
      deliveries.push({ callback, challenge: body.code_challenge });
      return Response.json({});
    }
    if (
      url.pathname === "/auth/v1/token" &&
      url.searchParams.get("grant_type") === "pkce"
    ) {
      exchangeCalls += 1;
      const body = await request.json();
      if (body.auth_code === "expired-fixture-code") {
        assert.equal(shaChallenge(body.code_verifier), deliveries[0].challenge);
        return Response.json(
          { code: "flow_state_expired", message: "Synthetic expiry" },
          { status: 400 },
        );
      }
      assert.equal(body.auth_code, "fresh-fixture-code");
      assert.equal(shaChallenge(body.code_verifier), deliveries[1].challenge);
      assert(!exchanged);
      exchanged = true;
      currentToken = randomUUID();
      return Response.json({
        user,
        access_token: currentToken,
        refresh_token: randomUUID(),
        token_type: "bearer",
        expires_in: 3_600,
      });
    }
    if (url.pathname === "/auth/v1/user") {
      if (
        currentToken &&
        request.headers.get("Authorization") === `Bearer ${currentToken}`
      )
        return Response.json(user);
      return Response.json(
        { code: "session_not_found", message: "Synthetic missing session" },
        { status: 401 },
      );
    }
    if (url.pathname === "/auth/v1/logout") {
      assert.equal(
        request.headers.get("Authorization"),
        `Bearer ${currentToken}`,
      );
      currentToken = "";
      logoutCalls += 1;
      return new Response(null, { status: 204 });
    }
    const fixture = await account.reply(request, url);
    assert(fixture, "Unexpected fixture request");
    const session = await fixture.clone().json();
    user = session.user;
    currentToken = session.access_token;
    return fixture;
  };
  await withLocalFixtureBrowser(
    { authOrigin, ...account, buildAiEnabled: false, browserZoom },
    "/build",
    async (context, page, base) => {
      await context.clearCookies();
      await setLocalFixtureViewport(page, 390, 700);
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await page.goto(base + "/build");
      await expect(
        page.getByRole("heading", { name: "Sign in to Resumide" }),
      ).toBeVisible();
      assert.equal(new URL(page.url()).searchParams.get("next"), "/build");
      await page.goto(
        `${base}/auth?${new URLSearchParams({ next: destination })}`,
      );
      await verifyLocalFixtureZoom(page, 390);
      const signIn = page.getByRole("button", {
        name: "Send secure sign-in link",
      });
      const email = page.getByRole("textbox", { name: "Email address" });
      const confirmation = page.getByRole("heading", {
        name: "Check your email",
      });
      const recovery = page.getByRole("heading", {
        name: "This sign-in link could not be used",
      });
      const retryAlert = page.getByText(
        "We could not send a sign-in link. Try again shortly.",
      );
      const form = page.locator(".auth-form");
      const focused = (control: typeof email) =>
        control.evaluate((element) => element === document.activeElement);
      const audit = async () =>
        (
          await new AxeBuilder({ page }).include(".auth-layout").analyze()
        ).violations
          .filter(({ impact }) => impact === "serious" || impact === "critical")
          .flatMap(({ id, nodes }) =>
            nodes.map(({ target }) => [id, ...target]),
          );
      const send = async () => {
        await email.fill(account.email);
        await email.focus();
        await page.keyboard.press("Tab");
        await expect(signIn).toBeFocused();
        await page.keyboard.press("Enter");
      };
      const checkRecovery = async () => {
        await expect(
          page.getByRole("heading", {
            name: "This sign-in link could not be used",
          }),
        ).toBeVisible();
        const url = new URL(page.url());
        assert.equal(url.pathname, "/auth");
        assert.deepEqual(Object.fromEntries(url.searchParams), {
          error: "invalid_link",
          next: destination,
        });
      };
      await form.evaluate((element: HTMLFormElement) => {
        element.noValidate = true;
      });
      await email.fill("invalid-address");
      await signIn.press("Enter");
      await expect(email).toHaveAttribute("aria-invalid", "true");
      await expect(email).toHaveAttribute("aria-describedby", "email-error");
      await expect(email).toBeFocused();
      await expect(page.locator("#email-error")).toHaveText(
        "Enter a valid email address.",
      );
      assert.equal(otpCalls, 0);
      await form.evaluate((element: HTMLFormElement) => {
        element.noValidate = false;
      });
      await send();
      await expect(
        page.getByRole("heading", { name: "Check your email" }),
      ).toBeVisible();
      const confirmationFocused = await focused(confirmation);
      const successAxe = await audit();
      await page.keyboard.press("Tab");
      await expect(
        page.getByRole("link", { name: "Use another email" }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(email).toBeFocused();
      assert.equal(new URL(page.url()).searchParams.get("next"), destination);
      const expired = new URL(deliveries[0].callback);
      expired.searchParams.set("code", "expired-fixture-code");
      const expiredRedirect = page.waitForResponse(
        (response) => response.url() === expired.toString(),
      );
      await page.goto(expired.toString());
      const expiredReply = await expiredRedirect;
      assert.equal(
        expiredReply.headers()["cache-control"],
        "private, no-store",
      );
      assert.equal(expiredReply.headers()["referrer-policy"], "no-referrer");
      await checkRecovery();
      const recoveryFocused = await focused(recovery);
      const recoveryAxe = await audit();

      await send();
      try {
        await expect(form).toHaveAttribute("aria-busy", "true");
        await expect(
          page.getByRole("button", { name: "Sending secure link" }),
        ).toBeDisabled();
      } finally {
        releaseResendFailure();
      }
      await expect(
        page.getByText("We could not send a sign-in link. Try again shortly."),
      ).toBeVisible();
      const providerFailureFocused = await focused(retryAlert);
      const providerFailureKeptEmailValid =
        (await email.getAttribute("aria-invalid")) !== "true";
      assert.deepEqual(
        {
          confirmationFocused,
          recoveryFocused,
          providerFailureFocused,
          providerFailureKeptEmailValid,
          successAxe,
          recoveryAxe,
        },
        {
          confirmationFocused: true,
          recoveryFocused: true,
          providerFailureFocused: true,
          providerFailureKeptEmailValid: true,
          successAxe: [],
          recoveryAxe: [],
        },
      );
      assert.equal(new URL(page.url()).searchParams.get("next"), destination);
      await expect(email).toHaveValue(account.email);
      await setLocalFixtureViewport(page, 320, 540);
      await verifyLocalFixtureZoom(page, 320);
      await page.emulateMedia({
        colorScheme: "light",
        forcedColors: "active",
        reducedMotion: "reduce",
      });
      await page.keyboard.press("Tab");
      await expect(email).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(signIn).toBeFocused();
      const narrowControl = await signIn.evaluate((element) => {
        const { left, right } = element.getBoundingClientRect();
        const outline = getComputedStyle(element);
        return {
          fits:
            left >= 0 &&
            right <= innerWidth &&
            document.documentElement.scrollWidth <= innerWidth,
          focusVisible:
            element.matches(":focus-visible") &&
            outline.outlineStyle !== "none" &&
            parseFloat(outline.outlineWidth) >= 2,
          forcedColors: matchMedia("(forced-colors: active)").matches,
          reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        };
      });
      assert.deepEqual(narrowControl, {
        fits: true,
        focusVisible: true,
        forcedColors: true,
        reducedMotion: true,
      });
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("heading", { name: "Check your email" }),
      ).toBeVisible();
      await expect(confirmation).toBeFocused();
      const fresh = new URL(deliveries[1].callback);
      fresh.searchParams.set("code", "fresh-fixture-code");

      const isolated = await context.browser()!.newContext();
      try {
        await isolated.route("**/*", (route) =>
          new URL(route.request().url()).origin === base
            ? route.continue()
            : route.abort(),
        );
        const other = await isolated.newPage();
        await other.goto(fresh.toString());
        await expect(
          other.getByRole("heading", {
            name: "This sign-in link could not be used",
          }),
        ).toBeVisible();
        assert.equal(
          new URL(other.url()).searchParams.get("next"),
          destination,
        );
        assert.equal(Number(exchangeCalls), 1);
      } finally {
        await isolated.close();
      }

      await page.goto(fresh.toString());
      await expect(
        page.getByRole("heading", { name: "Build", exact: true }),
      ).toBeVisible();
      assert.equal(page.url(), base + destination);
      assert(exchanged && exchangeCalls === 2);
      assert(
        (await context.cookies()).some(
          (cookie) => cookie.httpOnly && cookie.name.endsWith("-auth-token"),
        ),
      );
      await page.goto(fresh.toString());
      await checkRecovery();
      assert.equal(exchangeCalls, 2);

      await page.goto(base + "/build");
      await setLocalFixtureViewport(page, 1024, 768);
      await expect(
        page.getByRole("heading", { name: "Build", exact: true }),
      ).toBeVisible();
      await page.getByLabel("Open site menu", { exact: true }).click();
      await page.getByRole("button", { name: "Sign out" }).click();
      await expect(page).toHaveURL(base + "/");
      assert.equal(logoutCalls, 1);
      await page.goto(base + "/build");
      await expect(
        page.getByRole("heading", { name: "Sign in to Resumide" }),
      ).toBeVisible();
    },
  );
  assert.equal(otpCalls, 3);
  process.stdout.write(
    JSON.stringify({
      browser: "Chromium",
      otpCalls,
      exchangeCalls,
      logoutCalls,
      invalidLinkKeptDestination: true,
      failedResendKeptDestination: true,
      sameBrowserPKCE: true,
      replayDeclined: true,
      focusedStatusAndRecovery: true,
      fieldAndProviderFailuresDistinct: true,
      pendingSendDisabled: true,
      narrowRecoveryWithForcedColors: true,
      authBlockingAxeViolations: 0,
      hostedDelivery: false,
    }) + "\n",
  );
} finally {
  globalThis.fetch = originalFetch;
}
