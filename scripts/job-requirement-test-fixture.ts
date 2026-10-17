import { randomUUID } from "node:crypto";
import { createCanonicalFixture } from "./canonical-test-fixture";
export const SYNTHETIC_JD =
  "Requirements\nMust have 3+ years experience in TypeScript and SQL\nBachelor degree required\nAWS certification preferred\nLocated in Bengaluru\nMust have work authorization in India\nResponsibilities\nDevelop reliable services\nPreferred\nPython";
export async function createJobRequirementFixture(description = SYNTHETIC_JD) {
  const fixture = await createCanonicalFixture();
  const jobId = randomUUID();
  try {
    const job = await fixture.admin.from("jobs").insert({
      id: jobId,
      owner_id: fixture.ownerId,
      organization_id: fixture.organizationId,
      title: "Fictional Software Engineer",
      description,
    });
    const analysis = await fixture.admin
      .from("analyses")
      .update({ job_id: jobId })
      .eq("id", fixture.analysisId);
    if (job.error || analysis.error) throw Error("Synthetic JD setup failed");
    return { ...fixture, jobId, description };
  } catch (error) {
    await fixture.cleanup();
    throw error;
  }
}
