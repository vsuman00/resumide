import type { createSupabaseAdminClient } from "./supabase";

/** Every v2 attempt is uncalibrated. Database triggers serialize publication;
 * this guard also prevents unnecessary scorer/model execution. */
export async function hasUncalibratedEvidence(
  client: Pick<ReturnType<typeof createSupabaseAdminClient>, "from">,
  analysisId: string,
) {
  const result = await client
    .from("document_evidence_attempts")
    .select("id")
    .eq("analysis_id", analysisId)
    .limit(1);
  if (result.error || !Array.isArray(result.data))
    throw new Error("Evidence scoring guard unavailable.");
  return result.data.length > 0;
}
