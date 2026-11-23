import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import PDFDocument from "pdfkit";
import { strFromU8, unzipSync } from "fflate";
import { extractText } from "unpdf";
import { hash, TEMPLATE } from "../app/lib/server/artifact-contract";
import {
  loadArtifactPreview,
  renderOwnedArtifact,
} from "../app/lib/server/artifact-repository";
import {
  loadCanonicalCorrectionWorkspace,
  mutateCanonical,
  mutateCanonicalCorrection,
} from "../app/lib/server/canonical-repository";
import {
  correctEvidenceReview,
  loadEvidenceReview,
} from "../app/lib/server/evidence-review";
import { buildNativeEvidence } from "../app/lib/server/native-evidence";
import { reconcileDocumentEvidence } from "../app/lib/server/document-evidence";
import { createResumeStorageKey } from "../app/lib/server/storage";
import { createSupabaseAdminClient } from "../app/lib/server/supabase";
import { OWNED_AI_DISPOSITION_REGROUP_PROFILE } from "../app/lib/server/owned-ai-disposition-profile";
import type { CanonicalResumeDraft } from "../app/lib/server/canonical-resume-schema";
import { verifyLocalCorrectionBrowser } from "./verify-local-correction-browser";

import {
  connectLocalPostgres,
  localBrowserAccount,
  localSqlArgument as argument,
  localSqlLiteral as literal,
  localSupabaseFetch,
} from "./local-postgres-supabase";

const origin = "https://local-cv04.invalid";
const sql = connectLocalPostgres(
  process.env.RESUMIDE_CV04_SOCKET,
  process.env.RESUMIDE_CV04_PSQL,
);

const tables = new Set([
  "analyses",
  "resume_versions",
  "memberships",
  "canonical_resume_versions",
  "canonical_resume_heads",
  "document_evidence_attempts",
  "evidence_corrections",
]);
const rpcs = new Set([
  "read_owned_ai_disposition_readiness",
  "read_candidate_privacy_access",
  "correct_document_evidence",
  "read_candidate_correction_ledger",
  "assign_candidate_correction_targets",
  "apply_candidate_corrections",
  "save_canonical_version",
  "read_grouped_original_workspace",
  "read_canonical_entry_regroup_workspace",
]);
const ownerId = randomUUID(),
  resumeId = randomUUID(),
  sourceId = randomUUID(),
  analysisId = randomUUID(),
  attemptId = randomUUID();
const original = "Original Synthetic Person";
const corrected = "Reviewed Synthetic Person";
const originalEmail = "old-cv04@example.test";
const correctedEmail = "reviewed-cv04@example.test";
const text = `Name: ${original}\nEmail: ${originalEmail}\nExperience\nEmployer: Fictional Cedar Labs\nRole: Engineer\nDates: 2020 - 2022`;
const pdf = new PDFDocument();
const parts: Buffer[] = [];
const inputPdf = new Promise<Buffer>((resolve, reject) => {
  pdf.on("data", (part: Buffer) => parts.push(part));
  pdf.on("end", () => resolve(Buffer.concat(parts)));
  pdf.on("error", reject);
});
pdf.text(`Name: ${original}`);
pdf.text(`Email: ${originalEmail}`, { link: `mailto:${originalEmail}` });
pdf.text(text.split("\n").slice(2).join("\n"));
pdf.end();
const bytes = await inputPdf;
const organizationId = JSON.parse(
  sql(
    `
  insert into auth.users(id,email) values (${literal(ownerId)},'cv04-'||${literal(ownerId)}||'@example.test');
  select to_json(id) from public.organizations where owner_id=${literal(ownerId)};
`,
    "postgres",
  ),
) as string;
const storageKey = createResumeStorageKey({
  organizationId,
  resumeId,
  versionId: sourceId,
});
const account = localBrowserAccount(ownerId, `cv04-${ownerId}@example.test`);
const envelope = reconcileDocumentEvidence(
  {
    id: attemptId,
    ownerId,
    analysisId,
    sourceId,
    inputSha256: hash(bytes),
    createdAt: new Date().toISOString(),
    retentionPolicyId: "synthetic-engineering/1",
  },
  buildNativeEvidence([text]),
);
sql(
  `
  insert into public.resumes(id, organization_id, owner_id, display_name)
  values (${literal(resumeId)},${literal(organizationId)},${literal(ownerId)},'Synthetic CV04');
  insert into public.resume_versions(id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,media_type)
  values (${literal(sourceId)},${literal(resumeId)},${literal(organizationId)},${literal(ownerId)},${literal(storageKey)},${literal(hash(bytes))},${bytes.length},'application/pdf');
  insert into public.analyses(id,resume_version_id,organization_id,owner_id,status,idempotency_key)
  values (${literal(analysisId)},${literal(sourceId)},${literal(organizationId)},${literal(ownerId)},'extracting',gen_random_uuid());
`,
  "postgres",
);
assert.equal(
  sql(
    `select public.persist_document_evidence(${literal(analysisId)},${argument(envelope)},'native-cv04','native-cv04',1);`,
  ),
  "t",
);

// The SDK still creates the requests. This adapter maps the exercised Data API
// shapes to the disposable database and serves only the exact synthetic PDF.
let sourceReads = 0;
globalThis.fetch = localSupabaseFetch({
  origin,
  sql,
  tables,
  rpcs,
  account: process.env.RESUMIDE_CV04_BROWSER === "true" ? account : undefined,
  storage(request, url) {
    if (
      url.pathname !== `/storage/v1/object/resumes/${storageKey}` ||
      request.method !== "GET"
    )
      return undefined;
    sourceReads++;
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "application/pdf" },
    });
  },
});
const client = createSupabaseAdminClient(globalThis.fetch);
assert.deepEqual(
  (await client.rpc("read_owned_ai_disposition_readiness")).data,
  {
    ...OWNED_AI_DISPOSITION_REGROUP_PROFILE,
    schemaReady: true,
    exportExecutable: false,
    accessExecutable: true,
  },
);
const review = () => loadEvidenceReview(client, analysisId, ownerId);
const workspace = () =>
  loadCanonicalCorrectionWorkspace(client, analysisId, ownerId);

if (process.env.RESUMIDE_CV04_BROWSER === "true") {
  await verifyLocalCorrectionBrowser({
    authOrigin: origin,
    email: account.email,
    password: account.password,
    analysisId,
    original,
    corrected,
    review,
    workspace,
  });
} else {
  await verifyRepositoryJourney();
}

async function verifyRepositoryJourney() {
  const before = await review();
  for (const [index, [field, value]] of (
    [
      ["name", corrected],
      ["email", correctedEmail],
    ] as const
  ).entries()) {
    await correctEvidenceReview(
      client,
      analysisId,
      ownerId,
      {
        attemptId,
        expectedRevision: index,
        operation: "correct",
        field,
        value,
        candidateId: null,
        idempotencyKey: randomUUID(),
      },
      "native-cv04",
    );
  }
  const pending = await workspace();
  assert.equal(pending.headId, null);
  assert.equal(pending.corrections.items.length, 2);
  assert(
    pending.corrections.items.every(
      (item) => item.state === "needs_assignment",
    ),
  );
  assert.deepEqual((await review()).evidence, before.evidence);
  const { reviewRevision, assignmentRevision, canonicalHeadId, ...scope } =
    pending.corrections.binding;
  const binding = {
    sourceId: scope.sourceId,
    attemptId: scope.attemptId,
    inputSha256: scope.inputSha256,
    evidenceSchemaVersion: scope.evidenceSchemaVersion,
    fieldExtractorVersion: scope.fieldExtractorVersion,
    targetModelVersion: scope.targetModelVersion,
    projectionModelVersion: scope.projectionModelVersion,
    admissionPolicyVersion: scope.admissionPolicyVersion,
    schemaVersion: "candidate-correction-command/1.0.0",
    expectedReviewRevision: reviewRevision,
    expectedAssignmentRevision: assignmentRevision,
    expectedVersionId: canonicalHeadId,
    acknowledgement: true,
  } as const;
  const assign = await mutateCanonicalCorrection(
    client,
    analysisId,
    ownerId,
    {
      ...binding,
      kind: "assign",
      idempotencyKey: randomUUID(),
      selectors: pending.corrections.items.map((item) => {
        assert.equal(item.assignmentOptions.length, 1);
        assert(item.sourceChoices[0].quote);
        return item.assignmentOptions[0].selector;
      }),
    },
    "native-cv04",
  );
  const ready = await workspace();
  assert(
    ready.corrections.items.every((item) => item.state === "ready_to_apply"),
  );
  const apply = {
    ...binding,
    kind: "apply",
    idempotencyKey: randomUUID(),
    expectedAssignmentRevision: assign.assignmentRevision,
    selectors: ready.corrections.items.map((item) => {
      assert(item.assignment);
      return { assignmentId: item.assignment.id, priorApplicationId: null };
    }),
  };
  const applied = await mutateCanonicalCorrection(
    client,
    analysisId,
    ownerId,
    apply,
    "native-cv04",
  );
  assert.equal(applied.childVersionIds.length, 3);
  assert.deepEqual(
    await mutateCanonicalCorrection(
      client,
      analysisId,
      ownerId,
      apply,
      "native-cv04-replay",
    ),
    { ...applied, idempotent: true },
  );
  const saved = await workspace();
  assert.equal(saved.headId, applied.versionId);
  assert(saved.corrections.items.every((item) => item.state === "applied"));
  assert.equal(saved.corrections.snapshot.activeApplicationIds.length, 2);
  assert(saved.current);
  for (const value of [corrected, correctedEmail]) {
    const facts: CanonicalResumeDraft["facts"] =
      saved.current.document.facts.filter((fact) => fact.value === value);
    assert.equal(facts.length, 1);
    assert.equal(facts[0].state, "unconfirmed");
    assert.deepEqual(facts[0].sources, []);
  }
  assert(
    !saved.current.document.facts.some((fact) =>
      [original, originalEmail].includes(fact.value),
    ),
  );
  await assert.rejects(
    loadArtifactPreview(client, analysisId, ownerId, saved.headId!),
    { status: 422 },
  );
  assert.equal(sourceReads, 0);

  let head = saved.current.document.versionId;
  for (const fact of saved.current.document.facts) {
    head = (
      await mutateCanonical(
        client,
        analysisId,
        ownerId,
        {
          operation: "confirm",
          expectedVersionId: head,
          idempotencyKey: randomUUID(),
          factId: fact.id,
        },
        "native-cv04",
      )
    ).versionId;
  }
  const confirmed = await workspace();
  assert.equal(confirmed.headId, head);
  assert.equal(confirmed.scoringEligible, false);
  assert(
    confirmed.current?.document.facts.every(
      (fact) =>
        fact.state === "candidate_confirmed" &&
        fact.confirmation?.actorId === ownerId &&
        fact.confirmation.value === fact.value,
    ),
  );
  assert.deepEqual(
    confirmed.corrections.snapshot.activeApplicationIds.sort(),
    saved.corrections.snapshot.activeApplicationIds.sort(),
  );
  const preview = await loadArtifactPreview(client, analysisId, ownerId, head);
  assert.equal(preview.plan.versionId, head);
  for (const format of ["pdf", "docx"] as const) {
    const result = await renderOwnedArtifact(client, analysisId, ownerId, {
      versionId: head,
      format,
      pageSize: "A4",
      templateId: TEMPLATE.id,
    });
    assert.equal(result.report.state, "verified");
    assert.equal(result.report.versionId, head);
    assert(result.bytes);
    assert.equal(result.report.artifactSha256, hash(result.bytes));
    const recovered =
      format === "pdf"
        ? (await extractText(result.bytes, { mergePages: true })).text
        : strFromU8(unzipSync(result.bytes)["word/document.xml"]);
    for (const value of [corrected, correctedEmail])
      assert.equal(recovered.split(value).length, 2);
    for (const value of [original, originalEmail])
      assert(!recovered.includes(value));
  }
  const restored = await mutateCanonical(
    client,
    analysisId,
    ownerId,
    {
      operation: "rollback",
      expectedVersionId: head,
      idempotencyKey: randomUUID(),
      targetVersionId: applied.childVersionIds[0],
    },
    "native-cv04",
  );
  const after = await workspace();
  assert.equal(after.headId, restored.versionId);
  assert.notEqual(after.headId, applied.childVersionIds[0]);
  assert.equal(after.current?.document.parentVersionId, head);
  assert.equal(
    after.corrections.snapshot.restoredFromVersionId,
    applied.childVersionIds[0],
  );
  assert.equal(after.corrections.snapshot.activeApplicationIds.length, 0);
  assert(
    after.current?.document.facts.some(
      (fact) => fact.value === original && fact.sources.length > 0,
    ),
  );
  assert(
    !after.current?.document.facts.some((fact) => fact.value === corrected),
  );
  assert.deepEqual((await review()).evidence, before.evidence);
  await assert.rejects(loadArtifactPreview(client, analysisId, ownerId, head), {
    status: 409,
  });
  sql(
    `insert into public.data_requests(organization_id,user_id,kind)
    values (${literal(organizationId)},${literal(ownerId)},'deletion');`,
    "postgres",
  );
  const readsBeforeDeletionCheck = sourceReads;
  await assert.rejects(
    loadArtifactPreview(client, analysisId, ownerId, restored.versionId),
    { status: 404 },
  );
  assert.equal(sourceReads, readsBeforeDeletionCheck);
  process.stdout.write(
    "Native CV04 evidence, assignment, replay, confirmation, PDF/DOCX parity, restore and deletion refusal passed.\n",
  );
}
