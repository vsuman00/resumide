import { z } from "zod";
import type { createSupabaseAdminClient } from "../app/lib/server/supabase";

type PrivacyClient = Pick<ReturnType<typeof createSupabaseAdminClient>, "from">;

export async function submitManagedDocumentDeletion(
  client: PrivacyClient,
  origin: URL,
  cookie: string,
  scope: { ownerId: string; organizationId: string; requestKey: string },
  fetchImpl = globalThis.fetch,
) {
  const response = await fetchImpl(new URL("/privacy", origin), {
    method: "POST",
    redirect: "error",
    headers: {
      Origin: origin.origin,
      Cookie: cookie,
      "X-Request-Id": scope.requestKey,
    },
    body: new URLSearchParams({ kind: "deletion" }),
  });
  const cache = response.headers.get("Cache-Control")?.split(/\s*,\s*/);
  if (
    response.status !== 200 ||
    response.headers.get("Content-Type")?.split(";")[0] !== "text/html" ||
    response.headers.get("X-Request-Id") !== scope.requestKey ||
    !cache?.includes("private") ||
    !cache.includes("no-store") ||
    !(await response.text()).includes("deletion request queued.")
  )
    throw new Error("PRIVACY_ROUTE_UNVERIFIED");

  const event = await client
    .from("audit_events")
    .select("target_id")
    .eq("request_id", scope.requestKey)
    .eq("actor_id", scope.ownerId)
    .eq("organization_id", scope.organizationId)
    .eq("action", "deletion.requested")
    .eq("target_type", "data_request")
    .eq("outcome", "success")
    .maybeSingle();
  const id = z.uuid().safeParse(event.data?.target_id);
  if (event.error || !id.success)
    throw new Error("PRIVACY_ROUTE_AUDIT_UNVERIFIED");

  const deletion = await client
    .from("data_requests")
    .select("id")
    .eq("id", id.data)
    .eq("user_id", scope.ownerId)
    .eq("organization_id", scope.organizationId)
    .eq("kind", "deletion")
    .eq("status", "queued")
    .maybeSingle();
  if (deletion.error || deletion.data?.id !== id.data)
    throw new Error("PRIVACY_ROUTE_QUEUE_UNVERIFIED");
  return id.data;
}
