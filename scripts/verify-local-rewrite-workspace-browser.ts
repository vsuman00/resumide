import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Request } from "@playwright/test";
import { loadCanonicalRewriteWorkspaceState } from "../app/lib/server/canonical-rewrite-workspace";
import { CANONICAL_REWRITE_REGROUP_READINESS_PROFILE } from "../app/lib/server/canonical-rewrite-readiness-profile";
import { CANONICAL_REWRITE_REGROUP_WORKSPACE_PROFILE } from "../app/lib/server/canonical-rewrite-workspace-profile";
import {
  setLocalFixtureViewport,
  verifyLocalFixtureZoom,
} from "./local-fixture-browser";
import {
  type connectLocalPostgres,
  localSqlArgument,
  localSqlLiteral,
} from "./local-postgres-supabase";

export async function verifyLocalRewriteWorkspaceBrowser({
  page,
  base,
  client,
  sql,
  analysisId,
  ownerId,
  historicalUrl,
}: {
  page: Page;
  base: string;
  client: Parameters<typeof loadCanonicalRewriteWorkspaceState>[0];
  sql: ReturnType<typeof connectLocalPostgres>;
  analysisId: string;
  ownerId: string;
  historicalUrl: string;
}) {
  const access = await client.rpc(
    "read_canonical_rewrite_workspace_readiness",
    {},
  );
  assert.equal(access.error, null);
  assert.deepEqual(access.data, {
    ...CANONICAL_REWRITE_REGROUP_WORKSPACE_PROFILE,
    schemaReady: true,
    initializerExecutable: false,
  });
  const rewrite = await client.rpc("read_canonical_rewrite_readiness", {});
  assert.equal(rewrite.error, null);
  assert.deepEqual(rewrite.data, {
    ...CANONICAL_REWRITE_REGROUP_READINESS_PROFILE,
    schemaReady: true,
    mutatorsExecutable: false,
  });

  const analysis = localSqlLiteral(analysisId);
  const owner = localSqlLiteral(ownerId);
  const inventory = () =>
    sql(
      `
    select jsonb_build_object(
      'drafts', (select coalesce(jsonb_agg(to_jsonb(d) order by id), '[]'::jsonb)
        from public.writer_drafts d where analysis_id=${analysis} and owner_id=${owner}),
      'versions', (select jsonb_agg(id order by id)
        from public.canonical_resume_versions v where v.resume_id=s.resume_id),
      'head', (select to_jsonb(h)
        from public.canonical_resume_heads h where h.resume_id=s.resume_id)
    )
    from public.analyses a join public.resume_versions s on s.id=a.resume_version_id
    where a.id=${analysis} and a.owner_id=${owner};
  `,
      "postgres",
    );
  const workspace = page.getByRole("region", {
    name: "Writing drafts from saved claims",
  });
  const open = async (url: string) => {
    const response = await page.goto(url);
    assert.equal(response?.status(), 200);
    assert.match(response?.headers()["cache-control"] ?? "", /no-store/u);
  };
  const browserZoom = process.env.RESUMIDE_A10_BROWSER_ZOOM === "true";
  if (browserZoom) await setLocalFixtureViewport(page, 390, 740);
  await open(`${base}/score`);
  await verifyLocalFixtureZoom(page, 390);
  await expect(
    workspace.getByRole("button", { name: "Set up writing workspace" }),
  ).toBeDisabled();
  assert.deepEqual(JSON.parse(inventory()).drafts, []);

  // Seed the legacy row that an older application could have saved. This is
  // only a fixture and does not grant the current initializer or writer.
  const summary = "Synthetic saved summary for the local rewrite fixture.";
  const bullet = {
    original: "Built services using Python.",
    rewrite: "Built Python services.",
    reasoning: "Shortens the original wording.",
  };
  assert.match(
    sql(
      `
    insert into public.writer_drafts (analysis_id, organization_id, owner_id, kind, draft)
    select id, organization_id, owner_id, 'summary', ${localSqlArgument({ summary, bullets: [bullet] })}
    from public.analyses where id=${analysis} and owner_id=${owner} returning id;
  `,
      "postgres",
    ),
    /^[0-9a-f-]+$/u,
  );
  const before = inventory();
  const initial = JSON.parse(before);
  assert.equal(initial.drafts.length, 1);
  assert.ok(initial.versions.length > 0);
  assert.ok(initial.head);
  const saved = await loadCanonicalRewriteWorkspaceState(
    client,
    analysisId,
    ownerId,
  );
  assert.equal(saved.status, "available");
  assert.equal(saved.workspace.saved.state, "legacy_unbound");
  assert.equal(saved.workspace.saved.legacyDraft?.summary, summary);
  assert.deepEqual(saved.workspace.saved.legacyDraft?.bullets, [bullet]);
  assert.equal(saved.workspace.canGenerate, false);

  // Keep clipboard writes in this fixture's page, without device access.
  await page.addInitScript(() => {
    let clipboardText = "";
    let firstWrite = true;
    Object.defineProperty(navigator, "clipboard", {
      value: {
        readText: async () => clipboardText,
        writeText: async (text: string) => {
          if (firstWrite) {
            firstWrite = false;
            throw new DOMException(
              "Clipboard permission denied.",
              "NotAllowedError",
            );
          }
          clipboardText = text;
        },
      },
    });
  });
  const amendments: string[] = [];
  const checkRequest = (request: Request) => {
    const method = request.method();
    const path = new URL(request.url()).pathname;
    if (
      !["GET", "HEAD", "OPTIONS"].includes(method) &&
      path !== "/api/telemetry"
    ) {
      amendments.push(`${method} ${path}`);
    }
  };
  page.on("request", checkRequest);
  if (browserZoom) await setLocalFixtureViewport(page, 320, 640);
  for (const url of [`${base}/score`, historicalUrl]) {
    await open(url);
    await verifyLocalFixtureZoom(page, 320);
    await expect(workspace.getByText(summary, { exact: true })).toBeVisible();
    await expect(
      workspace.getByText(
        /This saved legacy draft has no canonical resume or job-requirement version binding/u,
      ),
    ).toBeVisible();
    await expect(
      workspace.getByText(/Saved drafts remain available for review/u),
    ).toBeVisible();
    await expect(
      workspace.getByRole("button", { name: "Generate writing drafts" }),
    ).toBeDisabled();
    const summaryRow = workspace.getByRole("article").filter({
      hasText: summary,
    });
    const bulletRow = workspace.getByRole("article").filter({
      hasText: bullet.original,
    });
    const summaryCopy = summaryRow.getByRole("button", {
      name: "Copy",
      exact: true,
    });
    if (browserZoom)
      assert(
        await summaryCopy.evaluate((element) => {
          const { left, right } = element.getBoundingClientRect();
          return left >= 0 && right <= innerWidth;
        }),
      );
    await summaryCopy.press("Enter");
    await expect(workspace.getByRole("alert")).toHaveText(
      "Clipboard permission denied.",
    );
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "");
    await expect(summaryRow.getByText(summary, { exact: true })).toBeVisible();
    await expect(summaryCopy).toBeFocused();
    if (browserZoom) {
      const headingId = await workspace.getAttribute("aria-labelledby");
      assert(headingId);
      const axe = await new AxeBuilder({ page })
        .include(`[aria-labelledby="${headingId}"]`)
        .analyze();
      assert.deepEqual(
        axe.violations
          .filter(({ impact }) => impact === "critical" || impact === "serious")
          .map(({ id, nodes }) => ({
            id,
            targets: nodes.map(({ target }) => target),
          })),
        [],
      );
    }
    await page.keyboard.press("Enter");
    await expect(
      summaryRow.getByRole("button", { name: "Copied", exact: true }),
    ).toBeVisible();
    await expect(
      summaryRow.getByRole("button", { name: "Copied", exact: true }),
    ).toBeFocused();
    await expect(workspace.getByRole("alert")).toHaveCount(0);
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      summary,
    );
    await page.keyboard.press("Tab");
    await expect(
      bulletRow.getByRole("button", { name: "Copy", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      bulletRow.getByRole("button", { name: "Copied", exact: true }),
    ).toBeVisible();
    await expect(summaryCopy).toBeVisible();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      bullet.rewrite,
    );
  }
  page.off("request", checkRequest);
  assert.deepEqual(amendments, []);
  assert.equal(inventory(), before);
  process.stdout.write(
    "Chromium verified saved rewrite workspace reads and copy without writes.\n",
  );
}
