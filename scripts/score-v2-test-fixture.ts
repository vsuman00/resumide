import { randomUUID } from "node:crypto";
import { createJobRequirementFixture } from "./job-requirement-test-fixture";
import { mutateCanonical } from "../app/lib/server/canonical-repository";
import { saveJobRequirements } from "../app/lib/server/job-requirement-repository";
export async function createScoreFixture() {
  const f = await createJobRequirementFixture();
  try {
    const canonical = await mutateCanonical(
      f.admin,
      f.analysisId,
      f.ownerId,
      {
        operation: "import",
        expectedVersionId: null,
        idempotencyKey: randomUUID(),
      },
      "aa4-fixture",
    );
    const requirements = await saveJobRequirements(
      f.admin,
      f.analysisId,
      f.ownerId,
      { expectedVersionId: null, idempotencyKey: randomUUID() },
      "aa4-fixture",
    );
    return { ...f, canonical, requirements };
  } catch (error) {
    await f.cleanup();
    throw error;
  }
}
