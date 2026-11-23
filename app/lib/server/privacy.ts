import { createHash } from "node:crypto";
import { PublicApiError } from "./errors";
import { createSupabaseAdminClient } from "./supabase";

export const AI_CONSENT_POLICY_VERSION = "candidate-ai-v1";

function privacyMutationFailure(error: { code?: string }, message: string) {
  return error.code === "55P03"
    ? new PublicApiError(
        "SERVICE_UNAVAILABLE",
        "Privacy changes are busy. Try again shortly.",
        503,
        true,
      )
    : new Error(message);
}

async function getPersonalOrganizationId(userId: string): Promise<string> {
  const { data, error } = await createSupabaseAdminClient()
    .from("memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error("Personal organization is unavailable.");
  return data.organization_id;
}

export async function requireAndRecordAiConsent(args: {
  userId: string;
  accepted: boolean;
  requestId: string;
}): Promise<void> {
  if (!args.accepted) {
    throw new PublicApiError(
      "FORBIDDEN",
      "Consent is required before AI processing.",
      403,
    );
  }

  const organizationId = await getPersonalOrganizationId(args.userId);
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("consents").upsert(
    {
      organization_id: organizationId,
      user_id: args.userId,
      purpose: "qualitative_ai",
      policy_version: AI_CONSENT_POLICY_VERSION,
    },
    { onConflict: "user_id,purpose,policy_version" },
  );
  if (error) throw new Error("Consent could not be recorded.");

  await admin.from("audit_events").insert({
    organization_id: organizationId,
    actor_id: args.userId,
    action: "consent.recorded",
    target_type: "consent",
    outcome: "success",
    request_id: args.requestId,
  });
}

export async function createDataRequest(args: {
  userId: string;
  kind: "export" | "deletion";
  submissionKey: string;
  requestId: string;
}) {
  const organizationId = await getPersonalOrganizationId(args.userId);
  // Use the existing primary key as the idempotency boundary for concurrent
  // submissions. Keep request IDs distinct across candidates and request types.
  const hash = createHash("sha256")
    .update(
      JSON.stringify([
        "privacy-request-v1",
        args.userId,
        args.kind,
        args.submissionKey,
      ]),
    )
    .digest("hex");
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  const admin = createSupabaseAdminClient();
  const retry = () =>
    new PublicApiError(
      "SERVICE_UNAVAILABLE",
      "We could not confirm your privacy request. Try submitting it again.",
      503,
      true,
    );
  const alreadyExists = async () => {
    const { data, error } = await admin
      .from("data_requests")
      .select("id")
      .eq("id", id)
      .eq("user_id", args.userId)
      .eq("organization_id", organizationId)
      .eq("kind", args.kind)
      .maybeSingle();
    if (error) throw retry();
    return data?.id === id;
  };
  let replayed = await alreadyExists();
  if (!replayed) {
    const { error, status } = await admin.from("data_requests").insert({
      id,
      organization_id: organizationId,
      user_id: args.userId,
      kind: args.kind,
      status: "queued",
    });
    if (error) {
      if (error.code === "23505") replayed = await alreadyExists();
      if (!replayed) {
        if (error.code !== "55P03" && (status === 0 || status >= 500))
          throw retry();
        throw privacyMutationFailure(
          error,
          "Privacy request could not be created.",
        );
      }
    }
  }
  // An exact retry can complete the audit write if the request already exists.
  // Ignore a duplicate audit so the original event and request ID stay intact.
  const { error } = await admin.from("audit_events").upsert(
    {
      id,
      organization_id: organizationId,
      actor_id: args.userId,
      action: `${args.kind}.requested`,
      target_type: "data_request",
      target_id: id,
      outcome: "success",
      request_id: args.requestId,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) throw retry();
  const status = replayed ? "already_requested" : "queued";
  return { id, status };
}

export async function cancelDataRequest(args: {
  userId: string;
  requestId: string;
  auditRequestId: string;
}) {
  const organizationId = await getPersonalOrganizationId(args.userId);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("data_requests")
    .update({ status: "cancelled" })
    .eq("id", args.requestId)
    .eq("user_id", args.userId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  if (error)
    throw privacyMutationFailure(
      error,
      "Privacy request could not be cancelled.",
    );
  if (!data) return { status: "not_cancellable" as const };

  await admin.from("audit_events").insert({
    organization_id: organizationId,
    actor_id: args.userId,
    action: "data_request.cancelled",
    target_type: "data_request",
    target_id: args.requestId,
    outcome: "success",
    request_id: args.auditRequestId,
  });
  return { status: "cancelled" as const };
}

export async function recordAuditEvent(args: {
  userId: string;
  action: string;
  targetType: string;
  targetId?: string;
  requestId: string;
}): Promise<void> {
  const organizationId = await getPersonalOrganizationId(args.userId);
  const { error } = await createSupabaseAdminClient()
    .from("audit_events")
    .insert({
      organization_id: organizationId,
      actor_id: args.userId,
      action: args.action,
      target_type: args.targetType,
      target_id: args.targetId,
      outcome: "success",
      request_id: args.requestId,
    });
  if (error) throw new Error("Audit event could not be recorded.");
}
