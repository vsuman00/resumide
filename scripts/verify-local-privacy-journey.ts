/** Built privacy routes with the real SDK and synthetic Auth/Data API replies. */
import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { createServerClient } from "@supabase/ssr";
import { expect } from "@playwright/test";
import { OWNED_AI_DISPOSITION_PROFILE } from "../app/lib/server/owned-ai-disposition-profile";
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

const owner = "69110000-0000-4000-8000-000000000009";
const organization = "69110000-0000-4000-8000-000000000010";
const account = localBrowserAccount(owner, "privacy-journey@example.test");
const manifest = {
  version: "resumide-export-v1",
  account: { id: owner },
  records: { synthetic: [{ marker: "synthetic-private-export-marker" }] },
  files: [],
};
type RequestRow = {
  id: string;
  user_id: string;
  organization_id: string;
  kind: "export" | "deletion";
  status: "queued" | "processing" | "completed" | "cancelled";
  created_at: string;
};
const requests: RequestRow[] = [];
const audits: string[] = [];
const recordedAuditIds = new Set<string>();
let exportAuditFailed = false;
let deletionAuditFailed = false;
let resumeDeletionAudit: () => void;
const deletionAudit = new Promise<void>((resolve) => {
  resumeDeletionAudit = resolve;
});
let prepared = false;
let manifestReads = 0;
let refreshCalls = 0;
let expireNext = false;
let refreshToken = "";
let token = "";
let user: Record<string, unknown>;
const primarySessionId = randomUUID();
const salt = randomUUID();
const verificationTokens = new Map<string, Record<string, unknown>>();
const deliveries: Array<{ callback: URL; challenge: string; used: boolean }> =
  [];

function accessToken(member: string, session: string, method: string, age = 0) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload = encode({
    sub: member,
    session_id: session,
    exp: now + 3600,
    amr: [{ method, timestamp: now - age }],
    jti: randomUUID(),
  });
  const signed = `${encode({ alg: "HS256", typ: "JWT" })}.${payload}`;
  return `${signed}.${createHmac("sha256", salt).update(signed).digest("base64url")}`;
}

function assertOwner(url: URL) {
  assert.equal(url.searchParams.get("user_id"), "eq." + owner);
}

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, authOrigin);
    if (url.pathname === "/auth/v1/otp") {
      const body = await request.json();
      assert.equal(body.email, account.email);
      assert.equal(body.create_user, false);
      assert.equal(body.code_challenge_method.toLowerCase(), "s256");
      const callback = new URL(url.searchParams.get("redirect_to")!);
      assert.equal(callback.origin, process.env.APP_ORIGIN);
      assert.equal(callback.pathname, "/auth/callback");
      assert.equal(
        callback.searchParams.get("intent"),
        "confirm-account-deletion",
      );
      deliveries.push({
        callback,
        challenge: body.code_challenge,
        used: false,
      });
      return Response.json({});
    }
    if (url.pathname === "/auth/v1/token") {
      if (url.searchParams.get("grant_type") === "pkce") {
        const { auth_code, code_verifier } = await request.json();
        const [type, index] = String(auth_code).split(":");
        const delivery = deliveries[Number(index)];
        assert(delivery && !delivery.used);
        assert.equal(
          createHash("sha256").update(code_verifier).digest("base64url"),
          delivery.challenge,
        );
        delivery.used = true;
        const subject = type === "foreign" ? randomUUID() : owner;
        const verifiedUser = { ...user, id: subject };
        const verifiedToken = accessToken(
          subject,
          randomUUID(),
          "magiclink",
          type === "stale" ? 601 : 0,
        );
        verificationTokens.set(verifiedToken, verifiedUser);
        return Response.json({
          user: verifiedUser,
          access_token: verifiedToken,
          refresh_token: randomUUID(),
          expires_in: 3_600,
          token_type: "bearer",
        });
      }
      if (url.searchParams.get("grant_type") === "refresh_token") {
        assert.equal((await request.json()).refresh_token, refreshToken);
        refreshCalls += 1;
        refreshToken = "";
        token = accessToken(owner, primarySessionId, "password");
        return Response.json({
          user: { ...user, user_metadata: { padding: "p".repeat(5_000) } },
          access_token: token,
          refresh_token: randomUUID(),
          expires_in: 3_600,
          token_type: "bearer",
        });
      }
      const response = await account.reply(request, url);
      assert(response);
      const session = await response.json();
      user = session.user;
      token = accessToken(owner, primarySessionId, "password");
      session.access_token = token;
      if (expireNext) {
        expireNext = false;
        refreshToken = session.refresh_token;
        session.expires_in = -60;
      }
      return Response.json(session);
    }
    if (url.pathname === "/auth/v1/user") {
      const supplied = request.headers
        .get("Authorization")
        ?.slice("Bearer ".length);
      const subject =
        supplied === token ? user : verificationTokens.get(supplied ?? "");
      assert(subject, "Unexpected synthetic session");
      return Response.json(subject);
    }
    const { method } = request;
    const params = url.searchParams;
    switch (url.pathname) {
      case "/rest/v1/rpc/read_owned_ai_disposition_readiness":
        return Response.json({
          ...OWNED_AI_DISPOSITION_PROFILE,
          schemaReady: true,
          exportExecutable: true,
          accessExecutable: true,
        });
      case "/rest/v1/rpc/read_candidate_privacy_access":
        assert.equal((await request.json()).p_user_id, owner);
        return Response.json({
          schemaVersion: "candidate-privacy-access/1.0.0",
          ownerId: owner,
          deletionPrepared: prepared,
          blockingRequest: requests.some(
            (row) => row.kind === "deletion" && row.status !== "cancelled",
          ),
        });
      case "/rest/v1/consents":
        assertOwner(url);
        return Response.json([]);
      case "/rest/v1/memberships":
        assertOwner(url);
        assert.equal(params.get("role"), "eq.owner");
        return Response.json([{ organization_id: organization }]);
      case "/rest/v1/audit_events": {
        const body = await request.json();
        assert.equal(body.actor_id, owner);
        assert.equal(body.organization_id, organization);
        if (body.id) {
          assert.equal(body.id, body.target_id);
          assert.equal(params.get("on_conflict"), "id");
          assert.match(
            request.headers.get("Prefer") ?? "",
            /resolution=ignore-duplicates/u,
          );
          if (body.action === "export.requested" && !exportAuditFailed) {
            exportAuditFailed = true;
            return Response.json(
              { code: "fixture_audit_unavailable" },
              { status: 503 },
            );
          }
          if (body.action === "deletion.requested" && !deletionAuditFailed) {
            deletionAuditFailed = true;
            await deletionAudit;
            return Response.json(
              { code: "fixture_audit_unavailable" },
              { status: 503 },
            );
          }
          if (recordedAuditIds.has(body.id))
            return new Response(null, { status: 201 });
          recordedAuditIds.add(body.id);
        }
        audits.push(body.action);
        return new Response(null, { status: 201 });
      }
      case "/rest/v1/data_requests": {
        if (method === "POST") {
          const body = (await request.json()) as RequestRow;
          assert.equal(body.user_id, owner);
          assert.equal(body.organization_id, organization);
          assert(["export", "deletion"].includes(body.kind));
          assert.equal(body.status, "queued");
          assert(!requests.some((row) => row.id === body.id));
          requests.push({ ...body, created_at: new Date().toISOString() });
          return new Response(null, { status: 201 });
        }
        assertOwner(url);
        const target = requests.find(
          (row) => params.get("id") === "eq." + row.id,
        );
        if (method === "PATCH") {
          assert.equal(params.get("status"), "eq.queued");
          assert.deepEqual(await request.json(), { status: "cancelled" });
          assert(target && target.status === "queued" && !prepared);
          target.status = "cancelled";
          return Response.json([{ id: target.id }]);
        }
        assert.equal(method, "GET");
        if (
          params.get("select") === "id,kind,status,created_at,last_error_code"
        )
          return Response.json([...requests].reverse());
        if (params.get("select") === "kind")
          return Response.json(target ? [{ kind: target.kind }] : []);
        if (params.get("select") === "id") {
          assert.equal(params.get("organization_id"), "eq." + organization);
          return Response.json(
            target && params.get("kind") === "eq." + target.kind
              ? [{ id: target.id }]
              : [],
          );
        }
        assert.equal(params.get("select"), "id,result_manifest");
        assert.equal(params.get("kind"), "eq.export");
        assert.equal(params.get("status"), "eq.completed");
        manifestReads += 1;
        return Response.json(
          target?.kind === "export" && target.status === "completed"
            ? [{ id: target.id, result_manifest: manifest }]
            : [],
        );
      }
      default:
        throw new Error("Unexpected synthetic privacy transport route.");
    }
  };

  await withLocalFixtureBrowser(
    { authOrigin, ...account, buildAiEnabled: false, browserZoom },
    "/build",
    async (context, page, base) => {
      const response = await page.goto(base + "/privacy");
      assert.equal(response?.status(), 200);
      assert.equal(response.headers()["cache-control"], "private, no-store");
      await expect(page.getByText("No privacy requests yet.")).toBeVisible();
      const requestExport = page.getByRole("button", {
        name: "Request export",
      });
      const exportFormKey = page.locator(
        'form:has(button[value="export"]) [name="submissionKey"]',
      );
      const firstExportKey = await exportFormKey.inputValue();
      await requestExport.click();
      await expect(page.getByRole("alert")).toContainText(
        "We could not confirm your privacy request.",
      );
      assert.equal(requests.length, 1);
      assert.equal(audits.length, 0);
      await expect(exportFormKey).toHaveValue(firstExportKey);
      await requestExport.click();
      const exportRow = page.getByRole("listitem").filter({
        has: page.getByText("Data export", { exact: true }),
      });
      await expect(exportRow).toContainText("queued");
      await expect(exportFormKey).not.toHaveValue(firstExportKey);
      await expect(
        page.getByText("This privacy request is already in your history."),
      ).toBeVisible();
      assert.equal(requests.length, 1);
      requests[0].status = "processing";
      await page.reload();
      await expect(exportRow).toContainText("processing");
      const link = page.getByRole("link", { name: "Download export" });
      await expect(link).toHaveCount(0);
      requests[0].status = "completed";
      const completed = await page.reload();
      assert(
        !((await completed?.text()) ?? "").includes(
          manifest.records.synthetic[0].marker,
        ),
      );
      await expect(link).toBeVisible();
      const downloadUrl = new URL((await link.getAttribute("href"))!, base);

      // Put an expired session into the current browser just before download.
      // The actual SDK must split the large refreshed session across cookies.
      expireNext = true;
      const cookies = new Map<string, string>();
      const issuer = createServerClient(authOrigin, "synthetic-unused", {
        global: { fetch: globalThis.fetch },
        cookies: {
          getAll: () => [],
          setAll: (values) => {
            for (const { name, value } of values) cookies.set(name, value);
          },
        },
      });
      const signedIn = await issuer.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      });
      assert(signedIn.data.session && !signedIn.error);
      await context.addCookies(
        [...cookies].map(([name, value]) => ({
          name,
          value,
          url: base,
          httpOnly: true,
          sameSite: "Lax" as const,
        })),
      );
      const downloadEvent = page.waitForEvent("download");
      await link.click();
      const download = await downloadEvent;
      assert.equal(download.suggestedFilename(), "resumide-export.json");
      assert.deepEqual(
        JSON.parse(await readFile((await download.path())!, "utf8")),
        manifest,
      );
      assert.equal(refreshCalls, 1);
      const chunks = (await context.cookies()).filter((cookie) =>
        /-auth-token\.\d+$/u.test(cookie.name),
      );
      assert(chunks.length >= 2 && chunks.every((cookie) => cookie.httpOnly));
      await expect(page).toHaveURL(base + "/privacy");

      const review = page.getByRole("button", { name: "Review deletion" });
      const dialog = page.getByRole("dialog");
      const startDeletion = dialog.getByRole("button", {
        name: "Start deletion request",
      });
      const sendVerification = dialog.getByRole("button", {
        name: "Send verification link",
      });
      const cancelDialog = dialog.getByRole("button", {
        name: "Cancel",
        exact: true,
      });
      const retryDeletion = () =>
        context.request.post(base + "/privacy", {
          headers: { Origin: base },
          form: { kind: "deletion" },
        });
      assert.equal((await retryDeletion()).status(), 403);
      assert.equal(requests.length, 1);
      await setLocalFixtureViewport(page, 390, 460);
      await verifyLocalFixtureZoom(page, 390);
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await review.press("Enter");
      await expect(dialog).toBeVisible();
      const active = (control: typeof cancelDialog) =>
        control.evaluate((element) => element === document.activeElement);
      const initialCancelFocus = await active(cancelDialog);
      await cancelDialog.focus();
      await page.keyboard.press("Shift+Tab");
      const reverseWrap = await active(sendVerification);
      await sendVerification.focus();
      await page.keyboard.press("Tab");
      const forwardWrap = await active(cancelDialog);
      await sendVerification.focus();
      await requestExport.evaluate((element) =>
        (element as HTMLElement).focus(),
      );
      const backgroundInert = await active(sendVerification);
      const audit = await new AxeBuilder({ page })
        .include(".privacy-dialog")
        .analyze();
      const blockingRules = audit.violations
        .filter(({ impact }) => impact === "serious" || impact === "critical")
        .map(({ id, nodes }) => ({
          id,
          nodes: nodes.map(({ target, failureSummary }) => ({
            target,
            failureSummary,
          })),
        }));
      assert.deepEqual(
        {
          initialCancelFocus,
          reverseWrap,
          forwardWrap,
          backgroundInert,
          blockingRules,
        },
        {
          initialCancelFocus: true,
          reverseWrap: true,
          forwardWrap: true,
          backgroundInert: true,
          blockingRules: [],
        },
      );
      await setLocalFixtureViewport(page, 320, 300);
      await verifyLocalFixtureZoom(page, 320);
      await page.emulateMedia({
        forcedColors: "active",
        reducedMotion: "reduce",
      });
      await cancelDialog.focus();
      await page.keyboard.press("Tab");
      await expect(sendVerification).toBeFocused();
      const focusedControl = await sendVerification.evaluate((element) => {
        const { top, bottom, left, right } = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          insideViewport:
            left >= 0 &&
            top >= 0 &&
            right <= innerWidth &&
            bottom <= innerHeight,
          visibleRing:
            element.matches(":focus-visible") &&
            style.outlineStyle !== "none" &&
            parseFloat(style.outlineWidth) >= 2,
          forcedColors: matchMedia("(forced-colors: active)").matches,
          reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        };
      });
      assert.deepEqual(focusedControl, {
        insideViewport: true,
        visibleRing: true,
        forcedColors: true,
        reducedMotion: true,
      });
      await page.keyboard.press("Escape");
      await expect(review).toBeFocused();
      await setLocalFixtureViewport(page, 390, 460);
      await page.emulateMedia({
        colorScheme: "dark",
        forcedColors: "none",
        reducedMotion: "reduce",
      });
      await review.press("Enter");
      await page.mouse.click(1, 1);
      await expect(dialog).toHaveCount(0);
      await expect(review).toBeFocused();
      await review.press("Enter");
      await expect(cancelDialog).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(dialog).toHaveCount(0);
      await expect(review).toBeFocused();
      await review.press("Enter");
      await expect(startDeletion).toHaveCount(0);
      const deliver = async (type: "stale" | "fresh" | "foreign") => {
        const index = deliveries.length;
        await sendVerification.press("Enter");
        await expect(dialog.getByRole("status")).toContainText(
          "Check your email",
        );
        assert.equal(deliveries.length, index + 1);
        const callback = new URL(deliveries[index].callback);
        callback.searchParams.set("code", `${type}:${index}`);
        return callback;
      };
      const stale = await deliver("stale");
      const other = await context.browser()!.newContext();
      try {
        const denied = await other.request.get(stale.href, { maxRedirects: 0 });
        assert.equal(denied.headers().location, "/privacy?deletion=invalid");
        assert.equal(deliveries[0].used, false);
      } finally {
        await other.close();
      }
      await page.goto(stale.href);
      await expect(dialog.getByRole("status")).toContainText("expired");
      await expect(startDeletion).toHaveCount(0);
      await page.goto((await deliver("foreign")).href);
      await expect(startDeletion).toHaveCount(0);
      assert.equal(requests.length, 1);
      const verified = await deliver("fresh");
      await page.goto(verified.href);
      await expect(startDeletion).toBeVisible();
      if (browserZoom) {
        await setLocalFixtureViewport(page, 320, 460);
        await verifyLocalFixtureZoom(page, 320);
      }
      await page.emulateMedia({
        colorScheme: "light",
        reducedMotion: "reduce",
      });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      const confirmationAudit = await new AxeBuilder({ page })
        .include(".privacy-dialog")
        .analyze();
      assert.deepEqual(
        confirmationAudit.violations
          .filter(({ impact }) => impact === "serious" || impact === "critical")
          .map(({ id }) => id),
        [],
      );
      assert.equal(requests.length, 1);
      const proofCookies = (await context.cookies()).filter((cookie) =>
        cookie.name.startsWith("resumide-deletion-verification-"),
      );
      assert(
        proofCookies.length &&
          proofCookies.every((cookie) => {
            const remaining = cookie.expires - Date.now() / 1_000;
            return cookie.httpOnly && remaining > 0 && remaining <= 602;
          }),
      );
      await expect(cancelDialog).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(startDeletion).toBeFocused();
      if (browserZoom)
        assert(
          await startDeletion.evaluate((element) => {
            const { left, right, top, bottom } =
              element.getBoundingClientRect();
            return (
              left >= 0 &&
              right <= innerWidth &&
              top >= 0 &&
              bottom <= innerHeight
            );
          }),
        );
      await page.keyboard.press("Enter");
      try {
        await expect(
          dialog.getByRole("button", { name: "Submitting…" }),
        ).toBeDisabled();
        await expect(cancelDialog).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(cancelDialog).toBeFocused();
      } finally {
        resumeDeletionAudit();
      }
      await expect(dialog.getByRole("alert")).toContainText(
        "We could not confirm your privacy request.",
      );
      assert.equal(requests.length, 2);
      await startDeletion.press("Enter");
      await expect(dialog).toHaveCount(0);
      await expect(review).toBeFocused();
      const deletionRows = page.getByRole("listitem").filter({
        has: page.getByText("Account deletion", { exact: true }),
      });
      const deletionRow = deletionRows.first();
      await expect(deletionRow).toContainText("queued");
      await expect(link).toHaveCount(0);
      const blocked = await context.request.get(downloadUrl.href);
      assert.equal(blocked.status(), 404);
      assert.equal(blocked.headers()["cache-control"], "private, no-store");
      assert.equal(blocked.headers()["referrer-policy"], "no-referrer");
      assert.equal(manifestReads, 1);
      assert.equal((await retryDeletion()).status(), 403);
      assert.equal(requests.length, 2);

      await deletionRow.getByRole("button", { name: "Cancel request" }).click();
      await expect(deletionRow).toContainText("cancelled");
      await expect(link).toBeVisible();
      const restored = await context.request.get(downloadUrl.href);
      assert.equal(restored.status(), 200);
      assert.deepEqual(await restored.json(), manifest);
      assert.equal(refreshCalls, 1);
      assert.equal((await retryDeletion()).status(), 403);
      assert.equal(requests.length, 2);
      assert.equal(requests[1].status, "cancelled");

      await review.click();
      await page.goto((await deliver("fresh")).href);
      await startDeletion.click();
      await expect(deletionRows).toHaveCount(2);
      await expect(deletionRow).toContainText("queued");
      requests[2].status = "processing";
      prepared = true;
      await page.reload();
      await expect(link).toHaveCount(0);
      await expect(
        deletionRow.getByRole("button", { name: "Cancel request" }),
      ).toHaveCount(0);
      await expect(
        page.getByText(/Account deletion has been prepared/),
      ).toBeVisible();
      assert.equal((await context.request.get(downloadUrl.href)).status(), 404);
      assert.equal(manifestReads, 2);
      requests[2].status = "completed";
      await page.reload();
      await expect(deletionRow).toContainText("Request processing completed");
      await expect(deletionRow).toContainText(
        "This status does not confirm full account erasure.",
      );
    },
  );
  assert.deepEqual(audits, [
    "export.requested",
    "deletion.requested",
    "data_request.cancelled",
    "deletion.requested",
  ]);
  process.stdout.write(
    JSON.stringify({
      browser: "Chromium",
      refreshCalls,
      missingAuditRecoveredOnRetry: true,
      deletionReplaysKeptSingleRequest: true,
      unverifiedDeletionDenied: true,
      wrongBrowserDidNotConsumeLink: true,
      staleAndMismatchedIdentityRejected: true,
      callbackAloneCreatedNoDeletion: true,
      verificationCookieMaxAgeBounded: true,
      keyboardFocusCycledAndRestored: true,
      pendingFocusStayedInsideDialog: true,
      mobileForcedColorsFocusVisible: true,
      dialogBlockingAxeViolations: 0,
      newFormMadeIndependentRequest: true,
      exactNativeDownload: true,
      queuedAndPreparedDeletionBlockedDownload: true,
      cancelledDeletionRestoredDownload: true,
      completionCopyDistinguishedFromErasure: true,
      physicalDeletionVerified: false,
      managedSupabaseVerified: false,
    }) + "\n",
  );
} finally {
  globalThis.fetch = originalFetch;
}
