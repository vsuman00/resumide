import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { z } from "zod";
import {
  loadCanonical,
  mutateCanonical,
} from "../app/lib/server/canonical-repository";
import { createSupabaseAdminClient } from "../app/lib/server/supabase";
import { withLocalFixtureBrowser } from "./local-fixture-browser";
import {
  connectLocalPostgres,
  localBrowserAccount,
  localSupabaseFetch,
} from "./local-postgres-supabase";
import { verifyLocalTypedAuthoringJourney } from "./verify-local-typed-authoring-journey";
import { verifyLocalRewriteWorkspaceBrowser } from "./verify-local-rewrite-workspace-browser";
import { verifyLocalJdClauseOrderBrowser } from "./verify-local-jd-clause-order-browser";
import { verifyLocalClarificationBrowser } from "./verify-local-clarification-browser";

export async function verifyLocalTypedScoreBrowser(raw: unknown) {
  const baseFixture = z.strictObject({
    ownerId: z.uuid(),
    analysisId: z.uuid(),
    canonicalVersionId: z.uuid(),
  });
  const clarification = process.env.RESUMIDE_U06_BROWSER === "true";
  const fixture = (
    clarification
      ? baseFixture
      : baseFixture.extend({
          historicalRequirementsId: z.uuid(),
          latestRequirementsId: z.uuid(),
        })
  ).parse(raw);
  const authOrigin = "https://local-a10.invalid";
  const account = localBrowserAccount(
    fixture.ownerId,
    `a10-${fixture.ownerId}@example.test`,
  );
  const sql = connectLocalPostgres(
    process.env.RESUMIDE_A10_SOCKET,
    process.env.RESUMIDE_A10_PSQL,
  );
  const clauseOrder = process.env.RESUMIDE_A14_BROWSER === "true";
  globalThis.fetch = localSupabaseFetch({
    origin: authOrigin,
    sql,
    account,
    tables: new Set([
      "analyses",
      "jobs",
      "resume_versions",
      "memberships",
      "canonical_resume_versions",
      "canonical_resume_heads",
      "job_requirement_versions",
      "document_evidence_attempts",
      ...(clauseOrder || clarification ? ["authoring_events"] : []),
    ]),
    rpcs: new Set([
      "read_owned_ai_disposition_readiness",
      "read_candidate_privacy_access",
      "read_requirement_relationship_context",
      "read_typed_authoring_readiness",
      "read_canonical_rewrite_readiness",
      "read_canonical_rewrite_workspace_readiness",
      "read_canonical_rewrite_workspace_state",
      "save_canonical_version",
      ...(clauseOrder || clarification ? ["apply_authoring_action"] : []),
      ...(clauseOrder
        ? ["read_jd_clause_order_readiness", "apply_jd_clause_order_action"]
        : []),
    ]),
  });
  const client = createSupabaseAdminClient(globalThis.fetch);
  const baseVersion = await loadCanonical(
    client,
    fixture.analysisId,
    fixture.ownerId,
  );
  assert(
    baseVersion.current?.document.versionId === fixture.canonicalVersionId,
  );
  const browserAccount = {
    ...fixture,
    authOrigin,
    email: account.email,
    password: account.password,
    browserZoom: process.env.RESUMIDE_A10_BROWSER_ZOOM === "true",
  };
  if (clarification) {
    await withLocalFixtureBrowser(
      browserAccount,
      "/score",
      (_context, page, base) =>
        verifyLocalClarificationBrowser({ fixture, client, sql, page, base }),
    );
    return;
  }
  const typedFixture = baseFixture
    .extend({
      historicalRequirementsId: z.uuid(),
      latestRequirementsId: z.uuid(),
    })
    .parse(raw);
  if (clauseOrder) {
    await withLocalFixtureBrowser(
      browserAccount,
      "/score",
      (context, page, base) =>
        verifyLocalJdClauseOrderBrowser({
          fixture: typedFixture,
          client,
          sql,
          context,
          page,
          base,
        }),
    );
    return;
  }
  const employer = baseVersion.current.document.facts.find(
    (fact) => fact.type === "employer",
  );
  assert(employer);
  const current = await mutateCanonical(
    client,
    fixture.analysisId,
    fixture.ownerId,
    {
      operation: "confirm",
      expectedVersionId: fixture.canonicalVersionId,
      idempotencyKey: randomUUID(),
      factId: employer.id,
    },
    "a10-browser-fixture",
  );
  const relative = `/analysis/${fixture.analysisId}`;
  await withLocalFixtureBrowser(
    browserAccount,
    "/score",
    async (context, page, base) => {
      const open = async (url: string) => {
        const response = await page.goto(url);
        assert(response);
        if (response.status() !== 200) {
          const description = await page
            .locator("main p")
            .first()
            .textContent();
          throw Error(
            `Score route returned ${response.status()}. ${description}`,
          );
        }
        assert.match(response.headers()["cache-control"], /no-store/u);
        await expect(
          page.getByRole("heading", { name: "Review scoring diagnostics" }),
        ).toBeVisible();
        const notice = page.getByRole("region", {
          name: "Why scores are unavailable",
        });
        await expect(
          notice.getByText(
            /Reviewing or confirming your inputs does not enable numerical scores/u,
          ),
        ).toBeVisible();
        await expect(
          notice.getByRole("heading", {
            name: "Service validation is still required",
          }),
        ).toBeVisible();
        await expect(
          page
            .getByRole("region", { name: "Score dimensions" })
            .getByText("Unavailable", { exact: true }),
        ).toHaveCount(3);
      };

      await open(`${base}/score`);
      await expect(
        page.getByText(/claimed intervals do not establish the stated bound/u),
      ).toBeVisible();
      await expect(
        page.getByText(/Resume revision 2; job requirements revision 2/u),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Open pinned job requirements" }),
      ).toHaveAttribute(
        "href",
        `${relative}/requirements?version=${typedFixture.latestRequirementsId}`,
      );
      await expect(
        page.getByRole("link", { name: "Preview and export resume" }),
      ).toHaveAttribute(
        "href",
        `${relative}/export?version=${current.versionId}`,
      );

      const historicalUrl = `${base}/score?canonical=${fixture.canonicalVersionId}&requirements=${typedFixture.historicalRequirementsId}`;
      await open(historicalUrl);
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: /^Historical input versions\./u }),
      ).toBeVisible();
      await expect(
        page.getByText(
          /the stated bound is supported by the claimed intervals/u,
        ),
      ).toBeVisible();
      await expect(
        page.getByText(/Resume revision 1; job requirements revision 1/u),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Open pinned resume version" }),
      ).toHaveAttribute(
        "href",
        `${relative}/canonical?version=${fixture.canonicalVersionId}`,
      );
      await expect(
        page.getByRole("link", { name: "Open pinned job requirements" }),
      ).toHaveAttribute(
        "href",
        `${relative}/requirements?version=${typedFixture.historicalRequirementsId}`,
      );
      await expect(
        page.getByRole("link", { name: "Preview and export resume" }),
      ).toHaveCount(0);
      assert.equal(
        (
          await context.request.get(
            `${historicalUrl}&expectedRequirements=${typedFixture.historicalRequirementsId}`,
          )
        ).status(),
        409,
      );
      if (process.env.RESUMIDE_A11_BROWSER === "true")
        await verifyLocalTypedAuthoringJourney({
          page,
          base,
          client,
          analysisId: fixture.analysisId,
          ownerId: fixture.ownerId,
        });
      if (process.env.RESUMIDE_A12_BROWSER === "true")
        await verifyLocalRewriteWorkspaceBrowser({
          page,
          base,
          client,
          sql,
          analysisId: fixture.analysisId,
          ownerId: fixture.ownerId,
          historicalUrl,
        });
    },
  );
  process.stdout.write(
    "Chromium verified the pinned score review, duration evidence and withholding.\n",
  );
}
