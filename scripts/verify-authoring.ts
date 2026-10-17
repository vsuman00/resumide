import assert from "node:assert/strict";
import { SupabasePrivacyRequestRepository } from "../app/lib/server/privacy-worker";
import { randomUUID } from "node:crypto";
import { createScoreFixture } from "./score-v2-test-fixture";
import {
  loadCanonical,
  CanonicalError,
} from "../app/lib/server/canonical-repository";
import {
  applyAuthoring,
  loadAuthoring,
} from "../app/lib/server/authoring-repository";
import { loadScoreDiagnostics } from "../app/lib/server/score-v2-repository";
const f = await createScoreFixture(),
  other = await createScoreFixture();
let assertions = 0;
const check = (v: unknown, m: string) => {
  assert.ok(v, m);
  assertions++;
};
const reject = async (fn: () => Promise<unknown>, status: number) => {
  await assert.rejects(
    fn,
    (e) => e instanceof CanonicalError && e.status === status,
  );
  assertions++;
};
const load = () => loadCanonical(f.admin, f.analysisId, f.ownerId);
const send = (command: unknown) =>
  applyAuthoring(f.admin, f.analysisId, f.ownerId, command, "aa5-local");
try {
  const initial = (await load()).current!.document;
  const fact = initial.facts.find((v) => v.type === "contribution")!;
  const edit = {
    action: "edit",
    targetFactId: fact.id,
    value: "Built candidate-owned services",
    expectedVersionId: initial.versionId,
    idempotencyKey: randomUUID(),
  };
  const edited = await send(edit);
  check(edited.revision === 2, "Edit not saved");
  check(
    (await load()).current!.document.facts.find((v) => v.id === fact.id)
      ?.state === "unconfirmed",
    "Edit promoted trust",
  );
  check((await send(edit)).idempotent, "Idempotency failed");
  await reject(() => send({ ...edit, value: "Different" }), 409);
  await reject(() => send({ ...edit, idempotencyKey: randomUUID() }), 409);
  await reject(
    () =>
      applyAuthoring(
        f.admin,
        f.analysisId,
        other.ownerId,
        edit,
        "aa5-cross-owner",
      ),
    404,
  );
  const rename = await send({
    action: "rename",
    sectionId: initial.sections[0].id,
    value: "Candidate profile",
    expectedVersionId: edited.versionId,
    idempotencyKey: randomUUID(),
  });
  check(
    (await load()).current!.document.sections[0].title === "Candidate profile",
    "Section rename failed",
  );
  check(
    (
      await loadCanonical(f.admin, f.analysisId, f.ownerId, {
        versionId: initial.versionId,
      })
    ).current!.document.sections[0].title === initial.sections[0].title,
    "Historical title changed",
  );
  let head = rename;
  for (const [questionKind, value] of [
    ["result", "Fewer failed releases"],
    ["scope", "Internal deployment workflow"],
    ["method", "Tested deployment checks"],
    ["measurement", "Five fewer failed releases"],
  ]) {
    head = await send({
      action: "clarify",
      targetFactId: fact.id,
      questionKind,
      value,
      confirmation: true,
      expectedVersionId: head.versionId,
      idempotencyKey: randomUUID(),
    });
    check(
      (await load()).current!.document.facts.find((v) => v.id === fact.id)
        ?.state === "candidate_confirmed",
      "Clarification not candidate-confirmed",
    );
  }
  const model = await loadScoreDiagnostics(f.admin, f.analysisId, f.ownerId),
    workspace = await loadAuthoring(
      f.admin,
      f.analysisId,
      f.ownerId,
      model,
      fact.id,
    );
  check(workspace.findings.top.length <= 5, "Unbounded findings");
  const patch = workspace.patches.find((p) => p.pattern === "xyz")!;
  check(patch.state === "ready", "XYZ missing after known clarification");
  await reject(
    () =>
      send({
        action: "accept",
        patch: {
          ...patch,
          operations: [
            { ...patch.operations[0], value: "Invented AWS and 99% gain" },
          ],
        },
        confirmation: true,
        expectedVersionId: head.versionId,
        idempotencyKey: randomUUID(),
      }),
    422,
  );
  await reject(
    () =>
      send({
        action: "accept",
        patch,
        expectedVersionId: head.versionId,
        idempotencyKey: randomUUID(),
      }),
    422,
  );
  const rejection = {
    action: "reject",
    patch,
    expectedVersionId: head.versionId,
    idempotencyKey: randomUUID(),
  };
  const rejected = await send(rejection);
  check(rejected.versionId === head.versionId, "Reject changed content");
  check((await send(rejection)).idempotent, "Reject replay failed");
  const beforeFailure = (await load()).current!.document.versionId;
  const faulty = {
    from: f.admin.from.bind(f.admin),
    rpc: ((name: string, params: Record<string, unknown>) =>
      f.admin.rpc(name, {
        ...params,
        p_confirmation_body: null,
      })) as typeof f.admin.rpc,
  };
  await reject(
    () =>
      applyAuthoring(
        faulty,
        f.analysisId,
        f.ownerId,
        {
          action: "accept",
          patch,
          confirmation: true,
          expectedVersionId: head.versionId,
          idempotencyKey: randomUUID(),
        },
        "aa5-atomic-failure",
      ),
    422,
  );
  check(
    (await load()).current!.document.versionId === beforeFailure,
    "Failed confirmation published a partial version",
  );
  const priorLedger = await f.admin
    .from("authoring_events")
    .select("id")
    .eq("analysis_id", f.analysisId);
  check(
    !priorLedger.error && priorLedger.data?.length === 7,
    "Failed transaction appended a decision",
  );
  const accepted = await send({
    action: "accept",
    patch,
    confirmation: true,
    expectedVersionId: head.versionId,
    idempotencyKey: randomUUID(),
  });
  check(
    (await load()).current!.document.facts.find((v) => v.id === fact.id)
      ?.value === patch.operations[0].value,
    "Acceptance wrong value",
  );
  const undo = {
    action: "undo",
    expectedVersionId: accepted.versionId,
    idempotencyKey: randomUUID(),
  };
  const undone = await send(undo);
  check((await send(undo)).idempotent, "Undo replay failed");
  check(
    (await load()).current!.document.facts.find((v) => v.id === fact.id)
      ?.value === workspace.document.facts.find((v) => v.id === fact.id)?.value,
    "Undo failed to restore pre-acceptance facts",
  );
  check(
    undone.versionId !== workspace.document.versionId,
    "Undo mutated old version",
  );
  const restored = await send({
    action: "restore",
    targetVersionId: initial.versionId,
    expectedVersionId: undone.versionId,
    idempotencyKey: randomUUID(),
  });
  check(
    (await load()).current!.document.facts.find((v) => v.id === fact.id)
      ?.value === fact.value,
    "Restore failed",
  );
  const competitors = await Promise.allSettled(
    ["First owner edit", "Second owner edit"].map((value) =>
      send({
        action: "edit",
        targetFactId: fact.id,
        value,
        expectedVersionId: restored.versionId,
        idempotencyKey: randomUUID(),
      }),
    ),
  );
  check(
    competitors.filter((r) => r.status === "fulfilled").length === 1,
    "CAS had multiple winners",
  );
  check(
    competitors.filter(
      (r) =>
        r.status === "rejected" &&
        r.reason instanceof CanonicalError &&
        r.reason.status === 409,
    ).length === 1,
    "CAS losing save not rejected",
  );
  const exported = await f.admin.rpc("export_authoring_records", {
    p_user_id: f.ownerId,
  });
  check(
    !exported.error && exported.data.authoringEvents.length >= 10,
    "Authoring ledger not exported",
  );
  const manifest =
    await new SupabasePrivacyRequestRepository().buildExportManifest({
      id: randomUUID(),
      kind: "export",
      userId: f.ownerId,
      organizationId: f.organizationId,
      attempt: 1,
      workerId: "aa5-local",
    });
  check(
    manifest.records.authoringEvents.length ===
      exported.data.authoringEvents.length,
    "Privacy manifest lost authoring decisions",
  );
  check(
    manifest.records.canonicalResumeVersions.length > 0 &&
      manifest.records.jobRequirementVersions.length === 1,
    "Workspace export lost bound inputs",
  );
  const audit = await f.admin
    .from("audit_events")
    .select("action")
    .eq("actor_id", f.ownerId)
    .like("action", "authoring.%");
  check(
    !audit.error && audit.data?.length === exported.data.authoringEvents.length,
    "Authoring audit and ledger differ",
  );
  const immutable = await f.admin
    .from("authoring_events")
    .update({ action: "reject" })
    .eq("analysis_id", f.analysisId);
  check(!!immutable.error, "Service client overwrote authoring history");
  check(
    exported.data.authoringEvents.every(
      (e: { owner_id: string }) => e.owner_id === f.ownerId,
    ),
    "Foreign events exported",
  );
  const foreign = await other.user
    .from("authoring_events")
    .select("id")
    .eq("owner_id", f.ownerId);
  check(!foreign.error && foreign.data?.length === 0, "RLS exposed events");
  const forbidden = await f.user.rpc("apply_authoring_action", {
    p_user_id: f.ownerId,
    p_analysis_id: f.analysisId,
    p_command: {},
    p_body: null,
    p_confirmation_body: null,
    p_request_id: "forbidden",
  });
  check(!!forbidden.error, "Client accessed privileged mutation");
  const diag = await loadScoreDiagnostics(f.admin, f.analysisId, f.ownerId);
  check(
    diag.diagnostics.score.dimensions.every((d) => d.value === null),
    "Edit invented score delta",
  );
  check(
    !(
      await f.admin.from("data_requests").insert({
        user_id: f.ownerId,
        organization_id: f.organizationId,
        kind: "deletion",
      })
    ).error,
    "Deletion setup failed",
  );
  await reject(() => send(edit), 404);
  check(
    (await f.user.from("authoring_events").select("id")).data?.length === 0,
    "Pending deletion RLS leaked history",
  );
  process.stdout.write(
    JSON.stringify({
      scope: "local synthetic AA5",
      assertions,
      providerCalls: 0,
      passed: true,
    }) + "\n",
  );
} finally {
  await f.cleanup();
  await other.cleanup();
}
