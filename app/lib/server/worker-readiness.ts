import type { createSupabaseAdminClient } from "./supabase";

export async function assertWorkerSchemaReady(
  client: Pick<ReturnType<typeof createSupabaseAdminClient>, "from">,
) {
  // Check before claiming: missing score guards must never consume job retries.
  for (const table of ["document_evidence_attempts", "evidence_corrections"]) {
    const { error } = await client.from(table).select("id").limit(0);
    if (error) {
      throw new Error(
        "Worker startup blocked: verify database connectivity and apply the document-evidence migration 20261011140000 before processing analyses.",
      );
    }
  }
}
