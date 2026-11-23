import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  type Page,
  type Response as BrowserResponse,
} from "@playwright/test";
import {
  loadCanonical,
  mutateCanonical,
} from "../app/lib/server/canonical-repository";
import { TYPED_AUTHORING_REGROUP_READINESS_PROFILE } from "../app/lib/server/typed-authoring-readiness-profile";
import {
  setLocalFixtureViewport,
  verifyLocalFixtureZoom,
} from "./local-fixture-browser";

export async function verifyLocalTypedAuthoringJourney({
  page,
  base,
  client,
  analysisId,
  ownerId,
}: {
  page: Page;
  base: string;
  client: Parameters<typeof loadCanonical>[0];
  analysisId: string;
  ownerId: string;
}) {
  const readiness = await client.rpc("read_typed_authoring_readiness");
  assert.equal(readiness.error, null);
  assert.deepEqual(readiness.data, {
    ...TYPED_AUTHORING_REGROUP_READINESS_PROFILE,
    schemaReady: true,
    writerExecutable: false,
  });
  const load = () => loadCanonical(client, analysisId, ownerId);
  const original = (await load()).current;
  assert(original);
  const fact = original.document.facts.find(
    (entry) =>
      entry.type === "contribution" &&
      entry.value === "Built services using Python",
  );
  assert(fact && fact.sources.length > 0);
  const confirm = (versionId: string) =>
    mutateCanonical(
      client,
      analysisId,
      ownerId,
      {
        operation: "confirm",
        expectedVersionId: versionId,
        idempotencyKey: randomUUID(),
        factId: fact.id,
      },
      "local-a11-fixture",
    );
  const confirmed = await confirm(original.document.versionId);
  const editor = page.getByRole("region", { name: "Review a wording change" });
  const proposal = editor.getByRole("region", {
    name: "Proposed wording review",
  });
  const reviewHeading = proposal.getByRole("heading", {
    name: "Review the complete wording change",
  });
  const contribution = editor.getByLabel("Current contribution", {
    exact: true,
  });
  const select = async (value: string) => {
    await editor
      .getByLabel("Job requirement")
      .selectOption({ label: "Python required" });
    await contribution.selectOption({ label: value });
    await contribution.focus();
  };
  const submit = async (button: string, status: number) => {
    await expect(
      editor.getByRole("button", { name: button, exact: true }),
    ).toBeFocused();
    const [response] = await Promise.all([
      page.waitForResponse((result) => result.url() === `${base}/author/typed`),
      page.keyboard.press("Enter"),
    ]);
    assert.equal(response.status(), status);
    assert.match(response.headers()["cache-control"], /no-store/u);
    return response;
  };
  const commandFrom = async (response: BrowserResponse) => {
    const request = response.request();
    const body = request.postDataBuffer();
    assert(body);
    const form = await new Response(new Uint8Array(body), {
      headers: { "Content-Type": request.headers()["content-type"] },
    }).formData();
    assert.equal(form.get("action"), "decision");
    assert.equal(form.get("reviewAcknowledgement"), "accepted");
    const command = form.get("command");
    assert.equal(typeof command, "string");
    return command;
  };

  await setLocalFixtureViewport(page, 390, 740);
  assert.equal((await page.goto(`${base}/score`))?.status(), 200);
  await verifyLocalFixtureZoom(page, 390);
  await select(fact.value);
  await page.keyboard.press("Tab");
  await submit("Prepare wording change", 200);
  await expect(
    proposal.getByText("Quoted source claim", { exact: true }),
  ).toBeVisible();
  await expect(reviewHeading).toBeFocused();
  await expect(
    proposal.getByText("Created services using Python", { exact: true }),
  ).toBeVisible();
  await expect(
    proposal.getByRole("button", { name: "Accept reviewed wording" }),
  ).toBeDisabled();

  const declaration = "Developed internal services using Python";
  const changed = await mutateCanonical(
    client,
    analysisId,
    ownerId,
    {
      operation: "edit",
      expectedVersionId: confirmed.versionId,
      idempotencyKey: randomUUID(),
      factId: fact.id,
      value: declaration,
    },
    "local-a11-fixture",
  );
  await setLocalFixtureViewport(page, 320, 640);
  await verifyLocalFixtureZoom(page, 320);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await contribution.focus();
  await page.keyboard.press("Tab");
  const stale = await submit("Prepare wording change", 409);
  assert.equal((await stale.json()).reason, "stale_inputs");
  await expect(proposal).toHaveCount(0);
  const staleAlert = editor.getByRole("alert");
  await expect(staleAlert).toHaveText(/The reviewed inputs changed/u);
  await expect(staleAlert).toBeFocused();
  const refresh = editor.getByRole("link", {
    name: "Open current input versions",
  });
  await expect(refresh).toHaveAttribute(
    "href",
    new URL(`${base}/score`).pathname,
  );
  await expect(
    editor.getByRole("button", { name: "Prepare wording change" }),
  ).toBeDisabled();

  const current = await confirm(changed.versionId);
  await page.keyboard.press("Tab");
  await expect(refresh).toBeFocused();
  await Promise.all([
    page.waitForEvent("domcontentloaded"),
    page.keyboard.press("Enter"),
  ]);
  await verifyLocalFixtureZoom(page, 320);
  await select(declaration);
  await page.keyboard.press("Tab");
  await submit("Prepare wording change", 200);
  await expect(
    proposal.getByText("Your confirmed declaration", { exact: true }),
  ).toBeVisible();
  await expect(
    proposal.getByText(
      "No current source quote is linked to this edited wording.",
    ),
  ).toBeVisible();
  await expect(
    proposal.getByText("Built internal services using Python", { exact: true }),
  ).toBeVisible();
  await expect(reviewHeading).toBeFocused();
  const accept = proposal.getByRole("button", {
    name: "Accept reviewed wording",
  });
  for (const control of [proposal.getByRole("checkbox"), accept]) {
    const bounds = await control.boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320);
  }
  await page.emulateMedia({ forcedColors: "none" });
  const axe = await new AxeBuilder({ page })
    .include('[aria-label="Proposed wording review"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  assert.deepEqual(
    axe.violations
      .filter(({ impact }) => impact === "critical" || impact === "serious")
      .map(({ id }) => id),
    [],
  );
  await page.keyboard.press("Tab");
  await expect(
    proposal.getByText("Claim and version references"),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(proposal.getByRole("checkbox")).toBeFocused();
  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  const denied = await submit("Accept reviewed wording", 503);
  assert.deepEqual(await denied.json(), {
    kind: "error",
    reason: "unavailable",
    recovery: "retry_exact",
  });
  const retained = editor.getByRole("region", {
    name: "Retained exact submission",
  });
  await expect(
    retained.getByRole("button", { name: "Retry exact accept submission" }),
  ).toBeDisabled();
  await expect(retained.getByRole("alert")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(retained.getByRole("checkbox")).toBeFocused();
  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  const retried = await submit("Retry exact accept submission", 503);
  assert.equal(await commandFrom(denied), await commandFrom(retried));
  await expect(retained.getByRole("alert")).toBeFocused();
  await expect(
    editor.getByRole("button", { name: "Undo this saved change" }),
  ).toHaveCount(0);
  assert.equal((await load()).headId, current.versionId);
  process.stdout.write("Chromium verified the staged authoring journey.\n");
}
