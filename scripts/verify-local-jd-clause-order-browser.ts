import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  JdClauseOrderCommandSchema,
  JdClauseOrderHttpSuccessSchema,
} from "../app/lib/jd-clause-order-decisions";
import {
  loadCanonical,
  mutateCanonical,
} from "../app/lib/server/canonical-repository";
import { JD_CLAUSE_ORDER_REGROUP_READINESS_PROFILE } from "../app/lib/server/jd-clause-order-readiness-profile";
import {
  setLocalFixtureViewport,
  verifyLocalFixtureZoom,
} from "./local-fixture-browser";
import {
  type connectLocalPostgres,
  localSqlLiteral,
} from "./local-postgres-supabase";

const before = "Built services using Python; Developed tools using Git";
const after = "Developed tools using Git; Built services using Python";

export async function verifyLocalJdClauseOrderBrowser({
  fixture,
  client,
  sql,
  context,
  page,
  base,
}: {
  fixture: {
    ownerId: string;
    analysisId: string;
    canonicalVersionId: string;
    historicalRequirementsId: string;
    latestRequirementsId: string;
  };
  client: Parameters<typeof loadCanonical>[0];
  sql: ReturnType<typeof connectLocalPostgres>;
  context: BrowserContext;
  page: Page;
  base: string;
}) {
  const { ownerId, analysisId } = fixture;
  const analysis = localSqlLiteral(analysisId);
  const pathname = new URL(base).pathname;
  const load = () => loadCanonical(client, analysisId, ownerId);
  const original = (await load()).current;
  assert(original);
  const fact = original.document.facts.find(
    (entry) => entry.type === "contribution" && entry.value === before,
  );
  assert(fact && fact.sources.length);
  const confirmed = await mutateCanonical(
    client,
    analysisId,
    ownerId,
    {
      operation: "confirm",
      expectedVersionId: fixture.canonicalVersionId,
      idempotencyKey: randomUUID(),
      factId: fact.id,
    },
    "local-a14-confirm",
  );
  const readiness = async (writerExecutable: boolean) => {
    const reply = await client.rpc("read_jd_clause_order_readiness");
    assert.equal(reply.error, null);
    assert.deepEqual(reply.data, {
      ...JD_CLAUSE_ORDER_REGROUP_READINESS_PROFILE,
      schemaReady: true,
      writerExecutable,
    });
  };
  const open = async (url: string) => {
    const response = await page.goto(url);
    assert.equal(response?.status(), 200);
    assert.match(response.headers()["cache-control"], /no-store/u);
  };
  const priority = page.getByRole("region", { name: "JD review priorities" });
  const comparison = page.getByRole("region", {
    name: "JD-focused wording previews",
  });
  const decisions = page.getByRole("region", {
    name: "Review clause-order decision",
    exact: true,
  });
  const scoreUrl = `${base}/score`;
  const browserZoom = process.env.RESUMIDE_A10_BROWSER_ZOOM === "true";
  const fits = (control: Locator) =>
    control.evaluate((element) => {
      const { left, right } = element.getBoundingClientRect();
      return left >= 0 && right <= innerWidth;
    });
  if (browserZoom) await setLocalFixtureViewport(page, 390, 740);
  await readiness(false);
  await open(scoreUrl);
  await verifyLocalFixtureZoom(page, 390);
  await expect(
    priority.getByText("Git required", { exact: true }),
  ).toBeVisible();
  await expect(
    comparison.getByLabel("Complete current wording", { exact: true }),
  ).toHaveText(before);
  await expect(
    comparison.getByLabel("Complete proposed wording", { exact: true }),
  ).toHaveText(after);
  await expect(decisions).toHaveCount(0);
  await open(
    `${scoreUrl}?canonical=${confirmed.versionId}&requirements=${fixture.historicalRequirementsId}`,
  );
  await expect(
    priority.getByText("Python required", { exact: true }),
  ).toBeVisible();
  await expect(priority.getByText("Git required", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    comparison.getByText(/^Fresh clause-order previews are unavailable/u),
  ).toBeVisible();
  await expect(decisions).toHaveCount(0);

  const endpoint = `${base}/author/clause-order`;
  const submit = async (button: string) => {
    const control = page.getByRole("button", { name: button, exact: true });
    if (browserZoom) assert(await fits(control));
    const [response] = await Promise.all([
      page.waitForResponse((reply) => reply.url() === endpoint),
      control.press("Enter"),
    ]);
    const body = await response.json();
    if (response.status() !== 200)
      throw Error(
        `Clause-order ${button} returned ${response.status()}: ${JSON.stringify(body)}`,
      );
    assert.match(response.headers()["cache-control"], /no-store/u);
    return { response, body: JdClauseOrderHttpSuccessSchema.parse(body) };
  };

  // Only the disposable fixture temporarily has service-role execute.
  const signature = "public.apply_jd_clause_order_action(uuid,uuid,jsonb,text)";
  sql(`grant execute on function ${signature} to service_role;`, "postgres");
  try {
    await readiness(true);
    await open(scoreUrl);
    if (browserZoom) await setLocalFixtureViewport(page, 320, 640);
    await verifyLocalFixtureZoom(page, 320);
    await expect(
      decisions.getByLabel("Complete current wording", { exact: true }),
    ).toHaveText(before);
    await expect(
      decisions.getByLabel("Complete proposed wording", { exact: true }),
    ).toHaveText(after);
    await expect(
      decisions.getByLabel("Exact saved JD quote", { exact: true }),
    ).toHaveText("Git required");
    await expect(
      decisions.getByRole("link", {
        name: "Inspect the saved job requirements",
      }),
    ).toHaveAttribute(
      "href",
      `${pathname}/requirements?version=${fixture.latestRequirementsId}`,
    );
    await expect(
      decisions.getByText(/Numeric score and score change: unavailable/u),
    ).toBeVisible();
    await expect(
      decisions.getByRole("button", {
        name: "Accept reviewed wording",
        exact: true,
      }),
    ).toBeDisabled();
    const rejected = await submit("Reject this proposal");
    assert.equal(rejected.body.kind, "applied");
    assert.equal(rejected.body.receipt.action, "reject");
    assert.equal(rejected.body.receipt.versionId, confirmed.versionId);
    assert.equal((await load()).headId, confirmed.versionId);
    await expect(
      decisions
        .getByRole("status")
        .filter({ hasText: "Rejection was confirmed" }),
    ).toBeFocused();
    await open(scoreUrl);
    const acknowledgement = decisions.getByRole("checkbox");
    if (browserZoom) {
      assert(await fits(acknowledgement));
      const headingId = await decisions
        .getByRole("heading", { level: 2 })
        .getAttribute("id");
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
    await acknowledgement.press("Space");
    await page.keyboard.press("Tab");
    await expect(
      decisions.getByRole("button", { name: "Accept reviewed wording" }),
    ).toBeFocused();
    const accepted = await submit("Accept reviewed wording");
    await expect(
      decisions
        .getByRole("status")
        .filter({ hasText: "The exact decision was confirmed as saved" }),
    ).toBeFocused();
    assert.equal(accepted.body.kind, "applied");
    const receipt = accepted.body.receipt;
    assert.equal(receipt.action, "accept");
    assert.equal(receipt.baseVersionId, confirmed.versionId);
    assert.equal(receipt.requirementVersionId, fixture.latestRequirementsId);
    const saved = (await load()).current;
    assert.equal(saved?.document.versionId, receipt.versionId);
    assert.equal(saved.revision, original.revision + 3);
    const savedFact = saved.document.facts.find(
      (entry) => entry.id === fact.id,
    );
    assert.equal(savedFact?.value, after);
    assert.equal(savedFact?.confirmation?.value, after);
    assert.deepEqual(savedFact?.sources, []);

    const request = accepted.response.request();
    const bytes = request.postDataBuffer();
    assert(bytes);
    const replay = await context.request.post(endpoint, {
      headers: {
        Origin: new URL(base).origin,
        "Content-Type": request.headers()["content-type"],
      },
      data: bytes,
    });
    assert.equal(replay.status(), 200);
    assert.deepEqual(
      JdClauseOrderHttpSuccessSchema.parse(await replay.json()),
      {
        kind: "applied",
        receipt: { ...receipt, idempotent: true },
      },
    );
    assert.equal((await load()).headId, receipt.versionId);

    const submitted = await new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": request.headers()["content-type"] },
    }).formData();
    const raw = submitted.get("command");
    assert(typeof raw === "string");
    const command = JdClauseOrderCommandSchema.parse(JSON.parse(raw));
    const stale = await context.request.post(endpoint, {
      headers: { Origin: new URL(base).origin },
      form: {
        action: "decision",
        reviewAcknowledgement: "accepted",
        command: JSON.stringify({ ...command, idempotencyKey: randomUUID() }),
      },
    });
    assert.equal(stale.status(), 409);
    assert.equal((await stale.json()).reason, "stale_inputs");
    assert.equal((await load()).headId, receipt.versionId);

    await page.keyboard.press("Tab");
    await expect(
      decisions.getByRole("link", {
        name: "Inspect the confirmed saved version",
      }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Review current inputs" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: "Undo this saved change" }),
    ).toBeFocused();
    const undone = await submit("Undo this saved change");
    assert.equal(undone.body.kind, "undone");
    await expect(
      page.getByRole("status").filter({ hasText: "Undo was confirmed" }),
    ).toBeFocused();
    const restored = (await load()).current;
    assert.equal(restored?.document.versionId, undone.body.receipt.versionId);
    assert.equal(restored.revision, saved.revision + 1);
    assert.deepEqual(
      restored.document.facts.find((entry) => entry.id === fact.id)?.sources,
      fact.sources,
    );
    assert.equal(
      restored.document.facts.find((entry) => entry.id === fact.id)?.value,
      before,
    );
    assert.equal(
      sql(
        `select count(*) from public.authoring_events where analysis_id=${analysis};`,
        "postgres",
      ),
      "3",
    );
  } finally {
    sql(
      `revoke execute on function ${signature} from service_role;`,
      "postgres",
    );
  }
  await readiness(false);
  process.stdout.write(
    "Chromium verified clause-order preview, decision, replay and undo.\n",
  );
}
