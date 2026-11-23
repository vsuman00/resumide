import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expect } from "@playwright/test";
import { z } from "zod";
import {
  BUILD_AI_POLICY_VERSION,
  getBuildSelection,
} from "../app/lib/build-assist";
import { AI_BUDGET_SOURCE_REGROUP_PROFILE } from "../app/lib/server/ai-budget-source-profile";
import { withLocalFixtureBrowser } from "./local-fixture-browser";
import {
  connectLocalPostgres,
  localBrowserAccount,
  localSqlLiteral,
  localSupabaseFetch,
} from "./local-postgres-supabase";

assert.equal(process.env.RESUMIDE_PRIVATE_VERIFY, "aa7-owned-synthetic");
assert.equal(process.env.OPENAI_API_KEY, "build-ai-harness-no-live-key");
assert.equal(process.env.OPENAI_BASE_URL, "https://api.openai.com/v1");
const { ownerId, organizationId, outcome } = z
  .strictObject({
    ownerId: z.uuid(),
    organizationId: z.uuid(),
    outcome: z.enum([
      "advice",
      "replace",
      "provider_auth",
      "provider_transient",
      "provider_refused",
    ]),
  })
  .parse(JSON.parse(readFileSync(0, "utf8")));
const authOrigin = "https://local-build.invalid";
const account = localBrowserAccount(ownerId, `build-${ownerId}@example.test`);
const sql = connectLocalPostgres(
  process.env.RESUMIDE_BUILD_SOCKET,
  process.env.RESUMIDE_BUILD_PSQL,
);
const owner = localSqlLiteral(ownerId);
const org = localSqlLiteral(organizationId);
const policy = localSqlLiteral(BUILD_AI_POLICY_VERSION);
assert.deepEqual(
  JSON.parse(sql("select public.read_ai_budget_source_readiness();")),
  {
    ...AI_BUDGET_SOURCE_REGROUP_PROFILE,
    schemaReady: true,
    reserveExecutable: true,
    exportExecutable: false,
  },
);
const buildRpcs = [
  "consume_analysis_rate_limit",
  "read_ai_budget_source_readiness",
  "ai_budget_reserve_source_next",
  "ai_budget_claim_dispatch",
  "ai_budget_settle",
  "ai_budget_release",
  "ai_budget_mark_unknown",
];
const transport = localSupabaseFetch({
  origin: authOrigin,
  sql,
  account,
  tables: new Set(["memberships"]),
  rpcs: new Set(buildRpcs),
});
const source = [
  "\\documentclass{article}",
  "\\begin{document}",
  "% FAR_PRIVATE_CANARY",
  "Nearby first context.",
  "Nearby second context.",
  outcome === "advice"
    ? "Helped reduce incidents 12 percent. METRIC_OUTPUT"
    : "Helped reduce incidents 12 percent.",
  "Nearby third context.",
  "Nearby fourth context.",
  "% FAR_PRIVATE_CANARY",
  "\\end{document}",
].join("\n");
const selection = getBuildSelection(source, 6, 6);
const modes = ["fix", "rewrite", "resume"] as const;
const recovery = outcome !== "advice" && outcome !== "replace";
const received: string[] = [];
const transportPaths: string[] = [];
const mockOpenAi = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  transportPaths.push(`${request.method} ${url.pathname}`);
  if (url.href === "https://api.openai.com/v1/chat/completions") {
    const body = await request.clone().json();
    const context = JSON.parse(
      body.messages.find((message: { role: string }) => message.role === "user")
        .content,
    );
    const mode = recovery ? "fix" : modes[received.length];
    assert(mode);
    assert.deepEqual(context, {
      mode,
      selectedText: selection.originalText,
      beforeContext: selection.beforeContext,
      afterContext: selection.afterContext,
    });
    assert(!JSON.stringify(body).includes("FAR_PRIVATE_CANARY"));
    const dispatches = sql(
      `select count(*) from private.ai_budget_attempts
      where organization_id=${org} and state='dispatched';`,
      "postgres",
    );
    assert.equal(dispatches, "1");
    received.push(mode);
    if (outcome === "provider_auth" || outcome === "provider_transient") {
      assert.equal(received.length, 1);
      return Response.json(
        { error: { message: "PRIVATE_PROVIDER_CANARY" } },
        { status: outcome === "provider_auth" ? 401 : 503 },
      );
    }
    if (outcome === "provider_refused" && received.length === 1) {
      const scripted = await mockOpenAi(request);
      const completion = await scripted.json();
      completion.choices[0].message = {
        content: null,
        refusal: "PRIVATE_PROVIDER_CANARY",
      };
      return Response.json(completion);
    }
    return mockOpenAi(request);
  }
  assert.equal(url.origin, authOrigin);
  if (request.method === "POST" && url.pathname === "/rest/v1/consents") {
    const record = z
      .strictObject({
        organization_id: z.literal(organizationId),
        user_id: z.literal(ownerId),
        purpose: z.literal("qualitative_ai"),
        policy_version: z.literal(BUILD_AI_POLICY_VERSION),
        captured_at: z.iso.datetime(),
      })
      .parse(await request.json());
    assert.equal(
      url.searchParams.get("on_conflict"),
      "user_id,purpose,policy_version",
    );
    sql(`insert into public.consents (organization_id,user_id,purpose,policy_version,captured_at)
      values (${org},${owner},'qualitative_ai',${policy},${localSqlLiteral(record.captured_at)})
      on conflict (user_id,purpose,policy_version)
      do update set captured_at=excluded.captured_at;`);
    return new Response(null, { status: 201 });
  }
  if (request.method === "POST" && url.pathname === "/rest/v1/audit_events") {
    const record = z
      .strictObject({
        organization_id: z.literal(organizationId),
        actor_id: z.literal(ownerId),
        action: z.literal("build_ai.consent_recorded"),
        target_type: z.literal("consent"),
        outcome: z.literal("success"),
        request_id: z.uuid(),
      })
      .parse(await request.json());
    sql(`insert into public.audit_events (organization_id,actor_id,action,target_type,outcome,request_id)
      values (${org},${owner},'build_ai.consent_recorded','consent','success',${localSqlLiteral(record.request_id)});`);
    return new Response(null, { status: 201 });
  }
  return transport(request);
};

await withLocalFixtureBrowser(
  { authOrigin, ...account },
  "/build",
  async (context, page, base) => {
    const response = await page.goto(`${base}/build`);
    assert.equal(response?.status(), 200);
    assert.match(response.headers()["cache-control"] ?? "", /no-store/u);
    const editor = page.getByRole("textbox", { name: "LaTeX source" });
    const dialog = page.getByRole("dialog", { name: "AI suggestions" });
    const consent = dialog.getByRole("checkbox", {
      name: /I agree to send this selected context/u,
    });
    const modeControl = dialog.getByRole("combobox", {
      name: "Suggestion type",
    });
    const requestButton = dialog.getByRole("button", {
      name: "Ask AI",
      exact: true,
    });
    let requests = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/build/suggest"
      )
        requests++;
    });
    await editor.fill(source);
    await editor.hover({ position: { x: 40, y: 130 } });
    await expect(dialog).toBeVisible();
    await expect(requestButton).toBeDisabled();
    assert.equal(requests, 0);
    await dialog.getByRole("button", { name: "Close AI suggestions" }).click();
    const selectLine = async (line: number) => {
      await editor.evaluate((node, index) => {
        const input = node as HTMLTextAreaElement;
        const lines = input.value.split("\n");
        const start = lines.slice(0, index - 1).join("\n").length + 1;
        input.focus();
        input.setSelectionRange(start, start + lines[index - 1].length);
        input.dispatchEvent(new Event("select", { bubbles: true }));
      }, line);
      await expect(dialog.getByText(`Lines ${line}–${line}`)).toBeVisible();
    };
    const ask = async () => {
      await expect(consent).not.toBeChecked();
      await expect(requestButton).toBeDisabled();
      await consent.check();
      const suggestion = page.waitForResponse(
        (reply) =>
          new URL(reply.url()).pathname === "/build/suggest" &&
          reply.request().method() === "POST",
      );
      await requestButton.click();
      const reply = await suggestion;
      assert.match(reply.headers()["cache-control"], /no-store/u);
      return reply;
    };
    if (recovery) {
      await selectLine(6);
      const cookies = await context.cookies(base);
      assert(cookies.length > 0);
      await context.clearCookies();
      const expired = await ask();
      assert.equal(expired.status(), 401);
      assert.equal((await expired.json()).code, "unauthenticated");
      await expect(dialog.getByRole("alert")).toContainText(
        "Your session has ended",
      );
      await expect(editor).toHaveValue(source);
      assert.equal(received.length, 0);
      assert.equal(
        sql(
          `select count(*) from public.audit_events where actor_id=${owner};`,
          "postgres",
        ),
        "0",
      );

      const popup = page.waitForEvent("popup");
      await dialog.getByRole("link", { name: "Sign in in a new tab" }).click();
      const signIn = await popup;
      try {
        await expect(signIn).toHaveURL(`${base}/auth?next=%2Fbuild`);
        await expect(
          signIn.getByRole("heading", { name: "Sign in to Resumide" }),
        ).toBeVisible();
        // Restore the isolated SDK session without sending a sign-in email.
        await context.addCookies(cookies);
      } finally {
        await signIn.close();
      }
      await expect(editor).toHaveValue(source);
      const expected = {
        provider_auth: "unavailable for this deployment",
        provider_transient: "had a temporary problem",
        provider_refused: "declined this request",
      };
      const failed = await ask();
      assert.equal(failed.status(), outcome === "provider_refused" ? 422 : 503);
      const body = await failed.json();
      assert.equal(body.code, outcome);
      assert(!JSON.stringify(body).includes("PRIVATE_PROVIDER_CANARY"));
      await expect(dialog.getByRole("alert")).toContainText(expected[outcome]);
      await expect(
        dialog.getByRole("link", { name: "Sign in in a new tab" }),
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("button", { name: "Apply suggestion" }),
      ).toHaveCount(0);
      await expect(editor).toHaveValue(source);
      assert.equal(requests, 2);
      assert.equal(received.length, 1);

      const retry = await ask();
      if (outcome === "provider_refused") {
        assert.equal(retry.status(), 200);
        assert.equal((await retry.json()).suggestion.operation, "replace");
        await expect(
          dialog.getByRole("region", { name: "AI suggestion review" }),
        ).toBeVisible();
        assert.equal(received.length, 2);
      } else {
        assert.equal(retry.status(), 429);
        assert.equal((await retry.json()).code, "budget_exhausted");
        await expect(dialog.getByRole("alert")).toContainText("no capacity");
        assert.equal(received.length, 1);
      }
      await expect(editor).toHaveValue(source);
      assert.equal(requests, 3);
      return;
    }

    for (const [index, mode] of modes.entries()) {
      await selectLine(6);
      if (index === 0) {
        await consent.check();
        await selectLine(7);
        await expect(consent).not.toBeChecked();
        await expect(requestButton).toBeDisabled();
        await selectLine(6);
        await modeControl.selectOption("rewrite");
        await consent.check();
      } else {
        await consent.check();
      }
      await modeControl.selectOption(mode);
      await expect(consent).not.toBeChecked();
      await expect(requestButton).toBeDisabled();
      const contextSummary = dialog.getByText("Review selected context", {
        exact: true,
      });
      if ((await dialog.locator("details").getAttribute("open")) === null)
        await contextSummary.click();
      assert.deepEqual(await dialog.locator("details pre").allTextContents(), [
        selection.beforeContext,
        selection.originalText,
        selection.afterContext,
      ]);
      assert.equal(requests, index);
      assert.equal(received.length, index);
      const reply = await ask();
      assert.equal(
        reply.status(),
        200,
        `Build ${mode} status: ${await reply.text()}. Transport: ${transportPaths.join(", ")}`,
      );
      const result = await reply.json();
      assert.equal(result.mode, mode);
      assert.equal(result.suggestion.operation, outcome);
      const review = dialog.getByRole("region", {
        name: "AI suggestion review",
      });
      await expect(review).toBeVisible();
      await expect(editor).toHaveValue(source);
      const apply = review.getByRole("button", {
        name: "Apply suggestion",
        exact: true,
      });
      if (outcome === "advice") {
        assert.equal(result.suggestion.replacement, null);
        await expect(
          review.getByRole("heading", { name: "Questions to resolve" }),
        ).toBeVisible();
        await expect(apply).toHaveCount(0);
        await review
          .getByRole("button", { name: "Discard suggestion" })
          .click();
      } else {
        if (mode === "resume") {
          await expect(apply).toBeDisabled();
          await review
            .getByRole("checkbox", {
              name: /I confirm this draft preserves my facts/u,
            })
            .check();
        }
        await apply.click();
        await expect(editor).toHaveValue(
          source.replace("Helped", "\\textbf{Helped}"),
        );
        await page.getByRole("button", { name: "Undo AI edit" }).click();
        await expect(editor).toHaveValue(source);
      }
    }
    assert.equal(requests, 3);
    assert.deepEqual(received, modes);
  },
);

assert.equal(
  sql(
    `select count(*) from public.consents where user_id=${owner}
  and purpose='qualitative_ai' and policy_version=${policy};`,
    "postgres",
  ),
  "1",
);
assert.equal(
  sql(
    `select count(*) from public.audit_events where actor_id=${owner}
  and action='build_ai.consent_recorded';`,
    "postgres",
  ),
  recovery ? "2" : "3",
);
assert.equal(
  sql(
    `select count(*) from private.ai_budget_operation_sources
  where organization_id=${org} and kind='build_account';`,
    "postgres",
  ),
  String(received.length),
);
assert.equal(
  sql(
    `select count(*) from private.ai_budget_attempts where organization_id=${org}
  and state='settled' and actual_input_tokens=40 and actual_output_tokens=20;`,
    "postgres",
  ),
  recovery ? (outcome === "provider_refused" ? "2" : "0") : "3",
);
assert.equal(
  sql(
    `select count(*) from private.ai_budget_attempts where organization_id=${org}
  and state='held_unknown';`,
    "postgres",
  ),
  outcome === "provider_auth" || outcome === "provider_transient" ? "1" : "0",
);
process.stdout.write(
  recovery
    ? `Chromium verified Build consent, expired-session recovery and ${outcome} with native accounting.\n`
    : `Chromium verified Build consent, selected-context transport and ${outcome} in all three modes.\n`,
);
