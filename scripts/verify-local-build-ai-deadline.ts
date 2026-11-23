/** Built-app browser check for a suggestion response that outlives its client. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { expect } from "@playwright/test";
import { BUILD_AI_LIMITS, getBuildSelection } from "../app/lib/build-assist";
import { withLocalFixtureBrowser } from "./local-fixture-browser";
import { localBrowserAccount } from "./local-postgres-supabase";

const authOrigin = "https://local-build.invalid";
assert.equal(process.env.RESUMIDE_PRIVATE_VERIFY, "aa7-owned-synthetic");
assert.equal(process.env.SUPABASE_URL, authOrigin);
assert.equal(process.env.SUPABASE_PUBLISHABLE_KEY, "synthetic-build-fixture");
assert.equal(process.env.SUPABASE_SECRET_KEY, "synthetic-build-fixture");
assert.equal(process.env.OPENAI_API_KEY, "build-ai-harness-no-live-key");
assert.equal(process.env.AI_ENABLED, "true");
assert.equal(process.env.BUILD_AI_ASSIST_ENABLED, "true");
assert.equal(process.env.LATEX_CONVERTER_ENABLED, "true");

const account = localBrowserAccount(
  "69110000-0000-4000-8000-000000000004",
  "build-deadline@example.test",
);
const content = "Helped review synthetic tasks.";
const expired = "Expired synthetic wording.";
const fresh = "Reviewed synthetic tasks.";
const source = [
  "\\documentclass{article}",
  "\\begin{document}",
  content,
  "\\end{document}",
].join("\n");
const sourceHash = createHash("sha256").update(source).digest("hex");
const originalFetch = globalThis.fetch;
let requests = 0;
try {
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, authOrigin);
    const reply = await account.reply(request, url);
    assert(reply, "Unexpected fixture request");
    return reply;
  };
  await withLocalFixtureBrowser(
    { authOrigin, ...account },
    "/build",
    async (_context, page, base) => {
      let releaseFirst!: () => void;
      const waitForRelease = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      await page.clock.install();
      await page.addInitScript(() => {
        const original = window.fetch.bind(window);
        window.fetch = (input, init) =>
          input === "/build/suggest"
            ? original(input, { ...init, signal: undefined })
            : original(input, init);
      });
      await page.route(`${base}/build/suggest`, async (route) => {
        assert.equal(route.request().method(), "POST");
        const body = route.request().postDataJSON();
        assert(body.source === source && body.consent === true);
        assert.equal(body.sourceHash, sourceHash);
        assert.equal(body.startLine, 3);
        assert.equal(body.endLine, 3);
        const current = ++requests;
        if (current === 1) await waitForRelease;
        const { originalText } = getBuildSelection(
          source,
          body.startLine,
          body.endLine,
        );
        await route.fulfill({
          headers: { "X-Fixture-Response": String(current) },
          json: {
            sourceHash,
            startLine: body.startLine,
            endLine: body.endLine,
            mode: body.mode,
            originalText,
            requiresFactConfirmation: false,
            suggestion: {
              operation: "replace",
              replacement: current === 1 ? expired : fresh,
              explanation: "Synthetic editing fixture.",
              questions: [],
            },
          },
        });
      });
      try {
        assert.equal((await page.goto(`${base}/build`))?.status(), 200);
        const editor = page.getByRole("textbox", { name: "LaTeX source" });
        const consent = page.getByRole("checkbox", {
          name: "I agree to send this selected context for this request.",
        });
        const ask = page.getByRole("button", { name: "Ask AI", exact: true });
        const review = page.getByRole("region", {
          name: "AI suggestion review",
        });
        await editor.fill(source);
        await editor.evaluate((target, selected) => {
          const input = target as HTMLTextAreaElement;
          const start = input.value.indexOf(selected);
          input.focus();
          input.setSelectionRange(start, start + selected.length);
          input.dispatchEvent(new Event("select", { bubbles: true }));
        }, content);
        await consent.check();
        const first = page.waitForRequest(
          (request) => request.url() === `${base}/build/suggest`,
          { timeout: 10_000 },
        );
        await ask.click();
        await first;
        await page.clock.fastForward(BUILD_AI_LIMITS.timeoutMs + 2_001);
        await expect(page.getByRole("alert")).toHaveText(
          "The request timed out. No suggestion was applied.",
        );
        await expect(editor).toHaveValue(source);
        await expect(consent).toBeEnabled();
        await expect(consent).not.toBeChecked();
        await expect(ask).toBeDisabled();
        assert.equal(requests, 1);
        await consent.check();
        await ask.click();
        await expect(review).toContainText(fresh);
        const lateReply = page.waitForResponse(
          (response) =>
            response.url() === `${base}/build/suggest` &&
            response.headers()["x-fixture-response"] === "1",
          { timeout: 10_000 },
        );
        releaseFirst();
        assert.equal(await (await lateReply).finished(), null);
        await expect(review).toContainText(fresh);
        await expect(page.getByText(expired, { exact: true })).toHaveCount(0);
        await expect(editor).toHaveValue(source);
        await page.getByRole("button", { name: "Apply suggestion" }).click();
        await expect(editor).toHaveValue(source.replace(content, fresh));
      } finally {
        releaseFirst();
      }
    },
  );
  assert.equal(requests, 2);
  process.stdout.write(
    JSON.stringify({
      browser: "Chromium",
      requests,
      expiredReplyDelivered: true,
      explicitFreshConsent: true,
      exactFreshEditApplied: true,
    }) + "\n",
  );
} finally {
  globalThis.fetch = originalFetch;
}
