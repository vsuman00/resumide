import assert from "node:assert/strict";
import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { clarifyValue } from "../app/lib/server/authoring-contract";
import { loadCanonical } from "../app/lib/server/canonical-repository";
import {
  setLocalFixtureViewport,
  verifyLocalFixtureZoom,
} from "./local-fixture-browser";
import {
  type connectLocalPostgres,
  localSqlLiteral,
} from "./local-postgres-supabase";

export async function verifyLocalClarificationBrowser({
  fixture,
  client,
  sql,
  page,
  base,
}: {
  fixture: { analysisId: string; ownerId: string; canonicalVersionId: string };
  client: Parameters<typeof loadCanonical>[0];
  sql: ReturnType<typeof connectLocalPostgres>;
  page: Page;
  base: string;
}) {
  const load = () => loadCanonical(client, fixture.analysisId, fixture.ownerId);
  const analysis = localSqlLiteral(fixture.analysisId);
  const events = () =>
    JSON.parse(
      sql(
        `select coalesce(jsonb_agg(jsonb_build_object(
          'action', action, 'base', base_version_id, 'result', result_version_id
        ) order by created_at, id), '[]'::jsonb)
        from public.authoring_events where analysis_id=${analysis};`,
        "postgres",
      ),
    );
  const initial = (await load()).current;
  assert.equal(initial?.document.versionId, fixture.canonicalVersionId);
  const fact = initial.document.facts.find(
    ({ type, value }) =>
      type === "contribution" && value === "Built services using Python",
  );
  assert(fact);
  assert(fact.sources.length > 0);
  const url = `${base}/score?focus=${fact.id}`;
  await setLocalFixtureViewport(page, 390, 740);
  const response = await page.goto(url);
  await verifyLocalFixtureZoom(page, 390);
  assert(response);
  if (response.status() !== 200) {
    const message = await page.locator("main p").first().textContent();
    throw Error(`Score route returned ${response.status()}. ${message}`);
  }
  assert.match(response?.headers()["cache-control"] ?? "", /no-store/u);
  const target = page.locator(`#author-fact-${fact.id}`);
  const answer = page.locator("#question-result");
  const previewButton = page.getByRole("button", {
    name: "Preview result clarification",
  });
  const preview = page.getByRole("region", { name: "Clarification preview" });
  const previewHeading = preview.getByRole("heading", {
    name: "Review the complete fact before confirmation",
  });
  const ack = preview.getByRole("checkbox");
  const confirm = preview.getByRole("button", {
    name: "Confirm complete fact",
  });
  const unavailable = page.getByText("Unavailable", { exact: true });
  const supplied = "Fewer release defects";
  const reviewed = clarifyValue(fact.value, "result", supplied);
  await expect(target).toHaveValue(fact.value);
  await expect(unavailable).toHaveCount(3);
  await answer.fill(supplied);
  await page.keyboard.press("Tab");
  await expect(previewButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(preview.getByLabel("Complete fact to confirm")).toHaveText(
    reviewed,
  );
  await expect(previewHeading).toBeFocused();
  await expect(ack).not.toBeChecked();
  await expect(ack).toHaveJSProperty("required", true);
  await ack.check();

  await answer.fill("Different result");
  await expect(confirm).toBeDisabled();
  await expect(preview.getByRole("status")).toHaveText(
    /Preview the answer again/u,
  );
  await answer.fill(supplied);
  await expect(confirm).toBeDisabled();
  await previewButton.click();
  await expect(confirm).toBeEnabled();
  await expect(previewHeading).toBeFocused();
  await expect(preview.getByLabel("Complete fact to confirm")).toHaveText(
    reviewed,
  );
  await expect(ack).not.toBeChecked();
  assert.equal((await load()).headId, initial.document.versionId);
  assert.deepEqual(events(), []);

  await ack.check();
  await confirm.click();
  await expect(page).toHaveURL(url);
  await expect(target).toHaveValue(reviewed);
  await expect(unavailable).toHaveCount(3);
  const saved = (await load()).current;
  assert(saved);
  const savedFact = saved.document.facts.find(({ id }) => id === fact.id);
  assert.equal(saved.revision, initial.revision + 2);
  assert.equal(savedFact?.value, reviewed);
  assert.equal(savedFact.state, "candidate_confirmed");
  assert.equal(savedFact.confirmation?.actorId, fixture.ownerId);
  assert.deepEqual(savedFact.sources, []);
  const clarification = {
    action: "clarify",
    base: initial.document.versionId,
    result: saved.document.versionId,
  };
  assert.deepEqual(events(), [clarification]);

  await page
    .getByRole("button", { name: "Undo last saved change as a new version" })
    .click();
  await expect(target).toHaveValue(fact.value);
  await expect(unavailable).toHaveCount(3);
  const restored = (await load()).current;
  assert(restored);
  assert.equal(restored.revision, saved.revision + 1);
  assert.deepEqual(
    restored.document.facts.find(({ id }) => id === fact.id),
    fact,
  );
  const undo = {
    action: "undo",
    base: saved.document.versionId,
    result: restored.document.versionId,
  };
  assert.deepEqual(events(), [clarification, undo]);

  await setLocalFixtureViewport(page, 320, 640);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.goto(url);
  await verifyLocalFixtureZoom(page, 320);
  await answer.fill(supplied);
  await previewButton.click();
  await expect(preview.getByLabel("Complete fact to confirm")).toHaveText(
    reviewed,
  );
  await expect(previewHeading).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(preview.getByRole("link")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(ack).toBeFocused();
  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  const concurrent = await page.context().newPage();
  const correction = "Built and maintained Python services";
  try {
    await concurrent.goto(url);
    const currentFact = concurrent.locator(`#author-fact-${fact.id}`);
    await currentFact.fill(correction);
    await currentFact
      .locator("..")
      .getByRole("button", { name: "Save fact correction" })
      .click();
    await expect(concurrent).toHaveURL(`${base}/score`);
    await expect(currentFact).toHaveValue(correction);
  } finally {
    await concurrent.close();
  }
  const edited = (await load()).current;
  assert(edited);
  assert.equal(edited.revision, restored.revision + 1);
  const edit = {
    action: "edit",
    base: restored.document.versionId,
    result: edited.document.versionId,
  };
  assert.deepEqual(events(), [clarification, undo, edit]);

  const browserErrors: string[] = [];
  const responses: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("response", (reply) => {
    const url = new URL(reply.url());
    if (/\/author(?:\.data)?$/u.test(url.pathname))
      responses.push(`${reply.request().method()} ${reply.status()}`);
  });
  const staleResponse = page.waitForResponse(
    (reply) =>
      reply.request().method() === "POST" &&
      /\/author(?:\.data)?$/u.test(new URL(reply.url()).pathname),
  );
  await page.keyboard.press("Enter");
  assert.equal((await staleResponse).status(), 409);
  const workspace = page.getByRole("region", {
    name: "Edit your resume on this analysis",
  });
  const alert = workspace.getByRole("alert");
  await expect(alert).toContainText(/resume changed/u);
  await expect(alert).toBeFocused();
  await expect(preview).toHaveCount(0);
  try {
    await expect(answer).toHaveValue(supplied);
  } catch (error) {
    const main = (await page.locator("main").allTextContents())
      .join(" ")
      .slice(0, 450);
    throw new Error(
      `Clarification recovery failed. ${JSON.stringify({ responses, browserErrors, main })}`,
      { cause: error },
    );
  }
  await expect(target).toHaveValue(correction);
  assert.equal((await load()).headId, edited.document.versionId);
  assert.deepEqual(events(), [clarification, undo, edit]);

  const reviewedAgain = clarifyValue(correction, "result", supplied);
  await page.keyboard.press("Tab");
  await expect(
    workspace.getByRole("link", {
      name: "Return to your clarification answer",
    }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(answer).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(previewButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(preview.getByLabel("Complete fact to confirm")).toHaveText(
    reviewedAgain,
  );
  await expect(ack).not.toBeChecked();
  await expect(target).toHaveValue(correction);
  assert.equal((await load()).headId, edited.document.versionId);
  assert.deepEqual(events(), [clarification, undo, edit]);
  await expect(previewHeading).toBeFocused();
  for (const control of [ack, confirm]) {
    const bounds = await control.boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320);
  }
  await page.emulateMedia({ forcedColors: "none" });
  const axe = await new AxeBuilder({ page })
    .include('[aria-label="Clarification preview"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  assert.deepEqual(
    axe.violations
      .filter(({ impact }) => impact === "critical" || impact === "serious")
      .map(({ id }) => id),
    [],
  );
  await page.keyboard.press("Tab");
  await expect(preview.getByRole("link")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(ack).toBeFocused();
  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(target).toHaveValue(reviewedAgain);
  await expect(unavailable).toHaveCount(3);
  const reconciled = (await load()).current;
  assert(reconciled);
  assert.equal(reconciled.revision, edited.revision + 2);
  assert.equal(
    reconciled.document.facts.find(({ id }) => id === fact.id)?.value,
    reviewedAgain,
  );
  assert.deepEqual(events(), [
    clarification,
    undo,
    edit,
    {
      action: "clarify",
      base: edited.document.versionId,
      result: reconciled.document.versionId,
    },
  ]);
  process.stdout.write(
    "Chromium verified clarification review and undo, stale refusal and recovery with native storage.\n",
  );
}
