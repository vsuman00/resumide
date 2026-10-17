import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createArtifactFixture } from "./artifact-test-fixture";
import {
  loadCanonical,
  mutateCanonical,
  CanonicalError,
} from "../app/lib/server/canonical-repository";
import {
  loadArtifactPreview,
  renderOwnedArtifact,
} from "../app/lib/server/artifact-repository";
import { TEMPLATE } from "../app/lib/server/artifact-contract";
const a = await createArtifactFixture(),
  b = await createArtifactFixture();
let checks = 0;
const check = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks++;
};
const reject = async (fn: () => Promise<unknown>, status: number) => {
  await assert.rejects(
    fn,
    (e) => e instanceof CanonicalError && e.status === status,
  );
  checks++;
};
try {
  const imported = await mutateCanonical(
    a.admin,
    a.analysisId,
    a.ownerId,
    {
      operation: "import",
      expectedVersionId: null,
      idempotencyKey: randomUUID(),
    },
    "aa6-fixture",
  );
  await reject(
    () => loadArtifactPreview(a.admin, a.analysisId, a.ownerId),
    422,
  );
  let current = imported;
  const initial = (await loadCanonical(a.admin, a.analysisId, a.ownerId))
    .current!.document;
  for (const fact of initial.facts)
    current = await mutateCanonical(
      a.admin,
      a.analysisId,
      a.ownerId,
      {
        operation: "confirm",
        factId: fact.id,
        expectedVersionId: current.versionId,
        idempotencyKey: randomUUID(),
      },
      "aa6-confirm",
    );
  const preview = await loadArtifactPreview(a.admin, a.analysisId, a.ownerId);
  check(preview.headId === current.versionId, "Wrong head after confirmation");
  const doc = (await loadCanonical(a.admin, a.analysisId, a.ownerId)).current!
    .document;
  check(
    preview.plan.blocks.flatMap((v) => v.factIds).length === doc.facts.length,
    "Facts omitted",
  );
  await reject(
    () => loadArtifactPreview(a.admin, a.analysisId, b.ownerId),
    404,
  );
  const options = (format: "pdf" | "docx", pageSize: "A4" | "LETTER") => ({
    versionId: current.versionId,
    format,
    pageSize,
    templateId: TEMPLATE.id,
  });
  for (const format of ["pdf", "docx"] as const)
    for (const page of ["A4", "LETTER"] as const) {
      const result = await renderOwnedArtifact(
        a.admin,
        a.analysisId,
        a.ownerId,
        options(format, page),
      );
      check(
        result.report.state === "verified" && !!result.bytes,
        `Valid ${format}/${page} unavailable`,
      );
      check(
        result.report.criticalParity === 1 &&
          result.report.normalizedTextCoverage === 1,
        `Parse-back mismatch ${format}/${page}`,
      );
      check(
        result.report.assistiveTechnologyValidated === false,
        "Unmeasured assistive claim",
      );
    }
  await reject(
    () =>
      renderOwnedArtifact(
        a.admin,
        a.analysisId,
        b.ownerId,
        options("pdf", "A4"),
      ),
    404,
  );
  await reject(
    () =>
      renderOwnedArtifact(a.admin, a.analysisId, a.ownerId, {
        ...options("pdf", "A4"),
        versionId: randomUUID(),
      }),
    409,
  );
  const changed = await mutateCanonical(
    a.admin,
    a.analysisId,
    a.ownerId,
    {
      operation: "edit",
      factId: doc.facts[0].id,
      value: "Updated fictional name",
      expectedVersionId: current.versionId,
      idempotencyKey: randomUUID(),
    },
    "aa6-edit",
  );
  check(
    changed.versionId !== current.versionId,
    "Edit did not create new version",
  );
  await reject(
    () =>
      renderOwnedArtifact(
        a.admin,
        a.analysisId,
        a.ownerId,
        options("pdf", "A4"),
      ),
    409,
  );
  await reject(
    () => loadArtifactPreview(a.admin, a.analysisId, a.ownerId),
    422,
  );
  const root = await a.admin
    .from("resumes")
    .update({ status: "deleted" })
    .eq("id", a.resumeId);
  check(!root.error, "Could not mark synthetic source deleted");
  await reject(
    () => loadArtifactPreview(a.admin, a.analysisId, a.ownerId),
    404,
  );
  process.stdout.write(
    JSON.stringify({
      checks,
      formats: ["pdf", "docx"],
      pageSizes: ["A4", "LETTER"],
      result: "pass",
    }) + "\n",
  );
} finally {
  await a.cleanup();
  await b.cleanup();
}
