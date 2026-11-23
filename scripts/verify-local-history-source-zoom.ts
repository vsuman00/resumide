/** Built history and original PDF routes with a synthetic two-account browser fixture. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { INITIAL_FEEDBACK_REGROUP_PROFILE } from "../app/lib/server/initial-feedback-profile";
import { OWNED_AI_DISPOSITION_REGROUP_PROFILE } from "../app/lib/server/owned-ai-disposition-profile";
import { createResumeStorageKey } from "../app/lib/server/storage";
import { syntheticPdf } from "../tests/fixtures/native-pdf";
import {
  setLocalFixtureViewport,
  verifyLocalFixtureZoom,
  withLocalFixtureBrowser,
} from "./local-fixture-browser";
import { localBrowserAccount } from "./local-postgres-supabase";

const authOrigin = "https://local-cv04.invalid";
assert.equal(process.env.RESUMIDE_PRIVATE_VERIFY, "aa7-owned-synthetic");
assert.equal(process.env.SUPABASE_URL, authOrigin);
assert.equal(process.env.SUPABASE_PUBLISHABLE_KEY, "synthetic-unused");
assert.equal(process.env.SUPABASE_SECRET_KEY, "synthetic-unused");
assert.equal(process.env.OPENAI_API_KEY, "synthetic-unused");
assert.equal(process.env.AI_ENABLED, "false");

const owner = randomUUID();
const other = randomUUID();
const analysisId = randomUUID();
const organizationId = randomUUID();
const resumeId = randomUUID();
const versionId = randomUUID();
const accountA = localBrowserAccount(owner, "history-a@example.test");
const accountB = localBrowserAccount(other, "history-b@example.test");
const binding = {
  id: analysisId,
  owner_id: owner,
  organization_id: organizationId,
  resume_version_id: versionId,
};
const row = (ownerId: string, index: number, status = "needs_review") => ({
  id: ownerId === owner && index === 12 ? analysisId : randomUUID(),
  owner_id: ownerId,
  organization_id: organizationId,
  status,
  created_at: new Date(Date.UTC(2026, 9, index + 1)).toISOString(),
  jobs: {
    title: (ownerId === owner ? "Alpha history " : "Bravo history ") + index,
    company_name: null,
  },
  analysis_results: {
    feedback: { overallScore: index, detail: "history-unneeded-detail" },
  },
  resume_versions: {
    owner_id: ownerId,
    organization_id: organizationId,
    resumes: {
      owner_id: ownerId,
      organization_id: organizationId,
      status: "active",
    },
  },
});
const rowStatuses: Record<number, string> = {
  1: "completed",
  2: "failed",
  12: "partial",
};
const rowsA = Array.from({ length: 13 }, (_, index) =>
  row(owner, index, rowStatuses[index]),
);
const rowsB = [row(other, 0)];
const category = {
  score: 12,
  tips: Array.from({ length: 3 }, () => ({
    type: "good",
    tip: "Synthetic review tip",
    explanation: "Synthetic explanation",
  })),
};
const analysis = {
  ...binding,
  status: "partial",
  writer_drafts: [{ draft: { summary: null, bullets: [] } }],
  analysis_results: {
    feedback: {
      overallScore: 12,
      ATS: category,
      toneAndStyle: category,
      content: category,
      structure: category,
      skills: category,
    },
    parse_view: {
      totalPages: 1,
      totalLines: 0,
      contact: {
        name: null,
        email: null,
        phone: null,
        links: [],
        location: null,
      },
      sections: [],
      warnings: [],
    },
    rule_trace: [],
    keyword_coverage: { job: [], matched: [], missing: [] },
  },
};
const source = syntheticPdf();
const checksum = createHash("sha256").update(source).digest("hex");
const storageKey = createResumeStorageKey({
  organizationId,
  resumeId,
  versionId,
});
let account = accountA;
let deletion: "clear" | "inflight" | "blocked" = "clear";
let sourceState: "valid" | "mismatch" | "revoke" = "valid";
let historyReads = 0;
let storageReads = 0;
let signOuts = 0;
const originalFetch = globalThis.fetch;

try {
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, authOrigin);
    const auth = await account.reply(request, url);
    if (auth) return auth;
    const ownerId = account === accountA ? owner : other;
    const query = url.searchParams;
    switch (url.pathname) {
      case "/auth/v1/logout":
        assert.equal(request.method, "POST");
        signOuts++;
        return new Response(null, { status: 204 });
      case "/rest/v1/rpc/read_owned_ai_disposition_readiness":
        return Response.json({
          ...OWNED_AI_DISPOSITION_REGROUP_PROFILE,
          schemaReady: true,
          exportExecutable: false,
          accessExecutable: true,
        });
      case "/rest/v1/rpc/read_candidate_privacy_access":
        assert.equal((await request.json()).p_user_id, ownerId);
        return Response.json({
          schemaVersion: "candidate-privacy-access/1.0.0",
          ownerId,
          deletionPrepared: false,
          blockingRequest: deletion === "blocked",
        });
      case "/rest/v1/analyses":
        assert.equal(query.get("owner_id"), "eq." + ownerId);
        if (query.has("id")) {
          if (ownerId !== owner || query.get("id") !== "eq." + analysisId)
            return Response.json([]);
          return Response.json([
            (query.get("select") ?? "").includes("analysis_results")
              ? analysis
              : binding,
          ]);
        }
        assert.notEqual(
          request.headers.get("authorization"),
          "Bearer synthetic-unused",
        );
        assert.equal(query.get("resume_versions.owner_id"), "eq." + ownerId);
        assert.equal(
          query.get("resume_versions.resumes.owner_id"),
          "eq." + ownerId,
        );
        assert.equal(query.get("resume_versions.resumes.status"), "eq.active");
        assert.match(query.get("select") ?? "", /resume_versions!inner/u);
        historyReads++;
        if (deletion === "inflight") deletion = "blocked";
        return Response.json(account === accountA ? rowsA : rowsB);
      case "/rest/v1/memberships":
        assert.equal(query.get("user_id"), "eq." + ownerId);
        return Response.json([
          { user_id: ownerId, organization_id: organizationId },
        ]);
      case "/rest/v1/resume_versions":
        assert.equal(query.get("id"), "eq." + versionId);
        assert.equal(query.get("owner_id"), "eq." + owner);
        assert.equal(query.get("organization_id"), "eq." + organizationId);
        if (query.get("select") === "storage_key,checksum,bytes") {
          assert.equal(query.get("resume_id"), "eq." + resumeId);
          return Response.json([
            { storage_key: storageKey, checksum, bytes: source.length },
          ]);
        }
        return Response.json([
          {
            id: versionId,
            resume_id: resumeId,
            owner_id: owner,
            organization_id: organizationId,
            active_resume: {
              id: resumeId,
              owner_id: owner,
              organization_id: organizationId,
              status: "active",
            },
          },
        ]);
      case "/rest/v1/document_evidence_attempts":
      case "/rest/v1/analysis_extractions":
        return Response.json([]);
      case "/rest/v1/rpc/read_initial_feedback_readiness":
        return Response.json({
          ...INITIAL_FEEDBACK_REGROUP_PROFILE,
          schemaReady: true,
          readerExecutable: true,
          prepareExecutable: false,
          claimExecutable: false,
          settleExecutable: false,
          finishExecutable: false,
          usageExecutable: false,
          exportExecutable: false,
        });
      case "/rest/v1/rpc/read_initial_feedback":
        assert.deepEqual(await request.json(), {
          p_user_id: owner,
          p_analysis_id: analysisId,
        });
        return Response.json({
          schemaVersion: "initial-feedback-read/1.0.0",
          status: "legacy_unbound",
          analysisId,
        });
      case "/rest/v1/audit_events":
        assert.equal(request.method, "POST");
        return new Response(null, { status: 201 });
      case "/storage/v1/object/resumes/" + storageKey: {
        assert.equal(request.method, "GET");
        storageReads++;
        if (sourceState === "revoke") deletion = "blocked";
        const bytes = Uint8Array.from(source);
        if (sourceState === "mismatch") bytes[bytes.length - 1] ^= 1;
        return new Response(bytes, {
          headers: { "Content-Type": "application/pdf" },
        });
      }
      default:
        throw Error("Unexpected synthetic history or source endpoint.");
    }
  };

  await withLocalFixtureBrowser(
    { authOrigin, analysisId, ...accountA, browserZoom: true },
    "/evidence",
    async (context, page, base) => {
      const origin = new URL(base).origin;
      const sourceUrl = base + "/source";
      const visitHistory = async () => {
        const response = await page.goto(origin + "/analyses");
        assert.equal(response?.status(), 200);
        assert.match(response.headers()["cache-control"], /no-store/u);
        return response;
      };
      const authenticate = async (next: typeof accountA) => {
        account = next;
        const cookies = new Map<string, string>();
        const auth = createServerClient(authOrigin, "synthetic-unused", {
          global: { fetch: globalThis.fetch },
          cookies: {
            getAll: () =>
              [...cookies].map(([name, value]) => ({ name, value })),
            setAll: (items) => {
              for (const { name, value } of items) cookies.set(name, value);
            },
          },
        });
        const session = await auth.auth.signInWithPassword({
          email: next.email,
          password: next.password,
        });
        assert(session.data.session && !session.error);
        await context.clearCookies();
        await context.addCookies(
          [...cookies].map(([name, value]) => ({
            name,
            value,
            url: origin,
            httpOnly: true,
            sameSite: "Lax",
          })),
        );
      };
      const fits = (control: Locator) =>
        control.evaluate((element) => {
          const { left, right } = element.getBoundingClientRect();
          return left >= 0 && right <= innerWidth;
        });
      await setLocalFixtureViewport(page, 390, 740);
      const response = await visitHistory();
      await verifyLocalFixtureZoom(page, 390);
      assert(!(await response.text()).includes("history-unneeded-detail"));
      const table = page.getByRole("table");
      const heading = page.getByRole("heading", { name: "Analysis history" });
      await expect(
        table.getByText("Alpha history 12", { exact: true }),
      ).toBeVisible();
      const sort = page.getByRole("combobox", { name: "Sort analyses" });
      await sort.focus();
      await sort.selectOption("lowest");
      await expect(page).toHaveURL(/\/analyses\?page=1&sort=lowest$/u);
      await expect(
        table.getByText("Alpha history 0", { exact: true }),
      ).toBeVisible();
      await expect(sort).toBeFocused();
      await setLocalFixtureViewport(page, 320, 640);
      await verifyLocalFixtureZoom(page, 320);
      const historyViolations: {
        colorScheme: string;
        id: string;
        targets: unknown[];
      }[] = [];
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          colorScheme,
        );
        const historyAudit = await new AxeBuilder({ page })
          .include(".analysis-history")
          .analyze();
        historyViolations.push(
          ...historyAudit.violations
            .filter(
              ({ impact }) => impact === "serious" || impact === "critical",
            )
            .map(({ id, nodes }) => ({
              colorScheme,
              id,
              targets: nodes.map(({ target }) => target),
            })),
        );
      }
      const next = page.getByRole("link", { name: "Next", exact: true });
      assert(await fits(sort));
      assert(await fits(next));
      await next.press("Enter");
      await expect(page).toHaveURL(/\/analyses\?page=2&sort=lowest$/u);
      await expect(
        table.getByText("Alpha history 12", { exact: true }),
      ).toBeVisible();
      await expect(heading).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(sort).toBeFocused();
      const resultLink = table.getByRole("link", { name: "View result" });
      assert(await fits(resultLink));
      await resultLink.press("Enter");
      await expect(page).toHaveURL(origin + "/resume/" + analysisId);
      await verifyLocalFixtureZoom(page, 320);
      const openSource = page.getByRole("link", { name: "Open source PDF" });
      await expect(openSource).toBeVisible();
      assert(await fits(openSource));
      const navigation = context.waitForEvent("response", {
        predicate: (reply) =>
          reply.url() === sourceUrl && reply.request().isNavigationRequest(),
      });
      await openSource.press("Enter");
      const pdf = await navigation;
      assert.equal(pdf.status(), 200);
      assert.equal(pdf.headers()["content-type"], "application/pdf");
      assert.match(pdf.headers()["cache-control"], /no-store/u);
      const valid = await context.request.get(sourceUrl);
      assert.deepEqual(await valid.body(), Buffer.from(source));
      sourceState = "mismatch";
      assert.equal((await context.request.get(sourceUrl)).status(), 503);
      sourceState = "revoke";
      assert.equal((await context.request.get(sourceUrl)).status(), 404);
      deletion = "clear";
      sourceState = "valid";
      await page.goBack();
      await page.reload();
      await expect(
        table.getByText("Alpha history 12", { exact: true }),
      ).toBeVisible();
      await page.getByLabel("Open site menu").press("Enter");
      await page
        .getByRole("button", { name: "Sign out", exact: true })
        .press("Enter");
      await expect(page).toHaveURL(origin + "/");
      assert.equal(signOuts, 1);
      await page.goBack();
      await expect(page).toHaveURL(/\/auth\?next=%2Fanalyses$/u);
      await expect(page.getByText(/^Alpha history /u)).toHaveCount(0);
      const readsBeforeAnonymous = storageReads;
      assert.equal((await context.request.get(sourceUrl)).status(), 404);
      await authenticate(accountB);
      await visitHistory();
      await expect(
        table.getByText("Bravo history 0", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(/^Alpha history /u)).toHaveCount(0);
      assert.equal((await context.request.get(sourceUrl)).status(), 404);
      assert.equal(storageReads, readsBeforeAnonymous);
      await authenticate(accountA);
      await visitHistory();
      await expect(
        table.getByText("Alpha history 12", { exact: true }),
      ).toBeVisible();
      deletion = "inflight";
      await visitHistory();
      await expect(page.getByText(/^Alpha history /u)).toHaveCount(0);
      const before = historyReads;
      await visitHistory();
      assert.equal(historyReads, before);
      await expect(page.getByText(/^Alpha history /u)).toHaveCount(0);
      assert.deepEqual(historyViolations, []);
    },
  );
  process.stdout.write(
    "Chromium verified history pagination focus, original PDF bytes, and session recovery at 200% page zoom.\n",
  );
} finally {
  globalThis.fetch = originalFetch;
}
