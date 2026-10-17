import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { buildNativeEvidence } from "../app/lib/server/native-evidence";
import { reconcileDocumentEvidence } from "../app/lib/server/document-evidence";

test("owner confirms and corrects evidence by keyboard with CAS, privacy and no-score guards", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  if (!process.env.SUPABASE_URL) process.loadEnvFile(".env");
  const url = process.env.SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });
  const users: string[] = [];
  const sessions: ReturnType<typeof createServerClient>[] = [];
  const analysisId = randomUUID(),
    resumeId = randomUUID(),
    versionId = randomUUID(),
    attemptId = randomUUID();
  function check(error: unknown, stage: string) {
    if (error) throw new Error(stage);
  }
  async function login() {
    const email = `aa014-browser-${randomUUID()}@example.test`,
      password = randomUUID() + randomUUID();
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    check(created.error, "Synthetic user creation failed");
    const id = created.data.user!.id;
    users.push(id);
    const cookies: { name: string; value: string }[] = [];
    const auth = createServerClient(
      url,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll: () => cookies,
          setAll: (values) => {
            cookies.splice(
              0,
              cookies.length,
              ...values.map(({ name, value }) => ({ name, value })),
            );
          },
        },
      },
    );
    sessions.push(auth);
    check(
      (await auth.auth.signInWithPassword({ email, password })).error,
      "Synthetic sign-in failed",
    );
    await context.clearCookies();
    await context.addCookies(
      cookies.map((cookie) => ({
        ...cookie,
        url: "http://127.0.0.1:3110",
        httpOnly: true,
        sameSite: "Lax" as const,
      })),
    );
    return id;
  }
  try {
    const owner = await login();
    const org = await admin
      .from("organizations")
      .select("id")
      .eq("owner_id", owner)
      .single();
    check(org.error, "Synthetic workspace lookup failed");
    const organizationId = org.data!.id;
    check(
      (
        await admin.from("resumes").insert({
          id: resumeId,
          organization_id: organizationId,
          owner_id: owner,
          display_name: "aa014-synthetic.pdf",
        })
      ).error,
      "Synthetic resume creation failed",
    );
    check(
      (
        await admin.from("resume_versions").insert({
          id: versionId,
          resume_id: resumeId,
          organization_id: organizationId,
          owner_id: owner,
          storage_key: `organizations/${organizationId}/resumes/${resumeId}/${versionId}.pdf`,
          checksum: "a".repeat(64),
          bytes: 100,
          media_type: "application/pdf",
        })
      ).error,
      "Synthetic version creation failed",
    );
    check(
      (
        await admin.from("analyses").insert({
          id: analysisId,
          resume_version_id: versionId,
          organization_id: organizationId,
          owner_id: owner,
          status: "extracting",
          idempotency_key: randomUUID(),
        })
      ).error,
      "Synthetic analysis creation failed",
    );
    const native = buildNativeEvidence([
      "Name: Demo Browser\nEmail: browser@example.test\nPhone: 0000000000\nEmployer: Fictional Browser Co\nRole: Software Engineer\nDates: 2021 - 2024\nEducation: BSc Computer Science\nCertification: Demo Certificate",
    ]);
    const envelope = reconcileDocumentEvidence(
      {
        id: attemptId,
        ownerId: owner,
        analysisId,
        sourceId: versionId,
        inputSha256: "a".repeat(64),
        createdAt: new Date().toISOString(),
        retentionPolicyId: "synthetic-local-30d/1.0.0",
      },
      native,
    );
    const persisted = await admin.rpc("persist_document_evidence", {
      p_analysis_id: analysisId,
      p_envelope: envelope,
      p_process_id: "aa014-browser",
      p_request_id: randomUUID(),
    });
    check(persisted.error, "Synthetic evidence RPC failed");
    expect(persisted.data).toBe(true);
    const response = await page.goto(`/analysis/${analysisId}/evidence`);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    await expect(
      page.getByRole("heading", { name: "Review your extracted information" }),
    ).toBeVisible();
    await expect(
      page.getByText("Scoring is unavailable.", { exact: false }),
    ).toBeVisible();
    const confirm = page.getByRole("button", {
      name: "Confirm Demo Browser",
      exact: true,
    });
    const staleForm = await confirm
      .locator("..")
      .evaluate((form) =>
        Object.fromEntries(
          Array.from(new FormData(form as HTMLFormElement), ([key, value]) => [
            key,
            String(value),
          ]),
        ),
      );
    await confirm.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("status").filter({ hasText: "Your review was saved" }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Review revision 1" }),
    ).toBeVisible();
    const retry = await context.request.post(
      `/analysis/${analysisId}/evidence`,
      { form: staleForm, headers: { Origin: "http://127.0.0.1:3110" } },
    );
    expect(retry.status()).toBe(200);
    const stale = await context.request.post(
      `/analysis/${analysisId}/evidence`,
      {
        form: { ...staleForm, idempotencyKey: randomUUID() },
        headers: { Origin: "http://127.0.0.1:3110" },
      },
    );
    expect(stale.status()).toBe(409);
    const crossOrigin = await context.request.post(
      `/analysis/${analysisId}/evidence`,
      { form: staleForm, headers: { Origin: "https://attacker.example.test" } },
    );
    // React Router rejects foreign-origin document actions before the route.
    expect(crossOrigin.status()).toBe(400);
    const correction = page.getByLabel(
      "Your correction for name (up to 500 characters)",
    );
    await correction.fill("Demo Browser Corrected");
    const save = page.getByRole("button", {
      name: "Save name correction",
      exact: true,
    });
    await save.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("status").filter({ hasText: "Review revision 2" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your review history" }),
    ).toBeVisible();
    await expect(page.getByText(/Revision 2: name corrected as/)).toContainText(
      "Demo Browser Corrected",
    );
    await expect(
      page.getByRole("button", { name: "Confirm Demo Browser", exact: true }),
    ).toBeVisible();
    const sourceSummary = page.locator("details summary").first();
    await sourceSummary.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("details").first()).toHaveAttribute("open", "");
    const { violations } = await new AxeBuilder({ page })
      .include("main")
      .analyze();
    expect(
      violations.filter(({ impact }) =>
        ["serious", "critical"].includes(impact ?? ""),
      ),
    ).toEqual([]);
    const after = await admin
      .from("document_evidence_attempts")
      .select("envelope")
      .eq("id", attemptId)
      .single();
    check(after.error, "Synthetic immutable evidence read failed");
    expect(after.data!.envelope.nativeSource).toEqual(native);
    expect(after.data!.envelope.assertions).toEqual(envelope.assertions);
    expect(after.data!.envelope.scoringEligible).toBe(false);
    const history = await admin
      .from("evidence_corrections")
      .select("revision")
      .eq("analysis_id", analysisId)
      .order("revision");
    check(history.error, "Synthetic correction history read failed");
    expect(history.data).toEqual([{ revision: 1 }, { revision: 2 }]);
    const scores = await admin
      .from("analysis_results")
      .select("analysis_id")
      .eq("analysis_id", analysisId);
    check(scores.error, "Synthetic score absence read failed");
    expect(scores.data).toEqual([]);
    await login();
    expect(
      (await page.goto(`/analysis/${analysisId}/evidence`))?.status(),
    ).toBe(404);
    await expect(
      page.getByRole("button", { name: "Confirm Demo Browser", exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await context.request.post(`/analysis/${analysisId}/evidence`, {
          form: {
            ...staleForm,
            idempotencyKey: randomUUID(),
            expectedRevision: "2",
          },
          headers: { Origin: "http://127.0.0.1:3110" },
        })
      ).status(),
    ).toBe(404);
  } finally {
    const errors: string[] = [];
    for (const session of sessions)
      if ((await session.auth.signOut()).error) errors.push("session");
    for (const id of users)
      if ((await admin.auth.admin.deleteUser(id)).error) errors.push("user");
    expect(errors, "Synthetic evidence fixtures must be removed").toEqual([]);
  }
});
