import { useEffect, useRef, useState } from "react";
import { randomUUID } from "node:crypto";
import {
  Link,
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
  data,
  type HeadersFunction,
} from "react-router";
import type { Route } from "./+types/privacy";
import WorkspaceShell from "~/components/WorkspaceShell";
import EvidenceScene3D from "~/components/EvidenceScene3D";
import { getAuthenticatedUser } from "~/lib/server/auth";
import { cancelDataRequest, createDataRequest } from "~/lib/server/privacy";
import { requestIdFrom } from "~/lib/server/request-context";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "~/lib/server/supabase";
import { assertSameOrigin } from "~/lib/server/security";
import { getServerConfig } from "~/lib/server/config";
import { PublicApiError } from "~/lib/server/errors";
import { isBlockingDeletionRequest } from "~/lib/privacy-deletion";
import { readCandidatePrivacyAccess } from "~/lib/server/privacy-deletion-policy";
import { z } from "zod";
import {
  deletionVerificationIntent,
  getDeletionVerification,
} from "~/lib/server/deletion-verification";

export const headers: HeadersFunction = ({
  loaderHeaders,
  actionHeaders,
  errorHeaders,
}) => {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
  });
  for (const source of [loaderHeaders, actionHeaders, errorHeaders])
    for (const cookie of source?.getSetCookie() ?? [])
      headers.append("Set-Cookie", cookie);
  const retryAfter = actionHeaders?.get("Retry-After");
  if (
    retryAfter &&
    /^[1-9][0-9]{0,3}$/.test(retryAfter) &&
    Number(retryAfter) <= 3600
  )
    headers.set("Retry-After", retryAfter);
  return headers;
};

function privacyServiceFailure(error: unknown, headers: Headers) {
  if (!(error instanceof PublicApiError)) throw error;
  const retryAfter = error.retryAfterSeconds;
  if (
    retryAfter !== undefined &&
    Number.isSafeInteger(retryAfter) &&
    retryAfter > 0 &&
    retryAfter <= 3600
  )
    headers.set("Retry-After", String(retryAfter));
  return data(
    { error: error.message, success: null },
    { status: error.status, headers },
  );
}

async function requireRouteUser(request: Request, headers: Headers) {
  const client = createSupabaseServerClient(request, headers);
  const user = await getAuthenticatedUser(client);
  if (!user) throw redirect("/auth?next=/privacy", { headers });
  return { client, user };
}

export async function loader({ request }: Route.LoaderArgs) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
  });
  const { client, user } = await requireRouteUser(request, headers);
  let historyUnavailable = false;
  let requests: Array<{
    id: string;
    kind: string;
    status: string;
    created_at: string;
    uploadCleanupHold: boolean;
  }> = [];
  try {
    const { data: rows, error } = await createSupabaseAdminClient()
      .from("data_requests")
      .select("id, kind, status, created_at, last_error_code")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error || !Array.isArray(rows)) historyUnavailable = true;
    else
      requests = rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        status: row.status,
        created_at: row.created_at,
        uploadCleanupHold:
          row.last_error_code === "ADMISSION_RETIREMENT_REQUIRED" ||
          row.last_error_code === "ADMISSION_RETIREMENT_INVENTORY_UNAVAILABLE",
      }));
  } catch {
    historyUnavailable = true;
  }
  const { data: consents } = await createSupabaseAdminClient()
    .from("consents")
    .select("purpose, policy_version, captured_at")
    .eq("user_id", user.id)
    .order("captured_at", { ascending: false });
  let exportDownloadAccess: "allowed" | "blocked" | "unavailable" =
    "unavailable";
  let deletionPrepared: boolean | null = null;
  try {
    const access = await readCandidatePrivacyAccess(
      createSupabaseAdminClient(),
      user.id,
      { signal: request.signal },
    );
    deletionPrepared = access.deletionPrepared;
    exportDownloadAccess = access.state === "clear" ? "allowed" : access.state;
  } catch {
    exportDownloadAccess = "unavailable";
  }
  const deletionVerified = await getDeletionVerification(
    request,
    headers,
    client,
    user.id,
    "read",
  )
    .then(async (verification) => Boolean(await verification?.proof()))
    .catch(() => false);
  return data(
    {
      requests,
      historyUnavailable,
      consents: consents ?? [],
      exportDownloadAccess,
      deletionPrepared,
      deletionVerified,
      submissionKey: randomUUID(),
    },
    { headers },
  );
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request, getServerConfig().APP_ORIGIN);
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
  });
  const { client, user } = await requireRouteUser(request, headers);
  const formData = await request.formData();
  const kind = formData.get("kind");
  if (kind === "verify-deletion") {
    const failed = () =>
      data(
        {
          error: "We could not send a verification link. Try again shortly.",
          success: null,
        },
        { status: 503, headers },
      );
    try {
      if (!user.email) return failed();
      const verification = await getDeletionVerification(
        request,
        headers,
        client,
        user.id,
        "start",
      );
      if (!verification) return failed();
      const callback = new URL("/auth/callback", getServerConfig().APP_ORIGIN);
      callback.searchParams.set("intent", deletionVerificationIntent);
      const { error } = await verification.client.auth.signInWithOtp({
        email: user.email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: callback.toString(),
        },
      });
      if (error) return failed();
      verification.clear();
    } catch {
      return failed();
    }
    throw redirect("/privacy?deletion=sent", { headers });
  }
  if (kind === "cancel") {
    const requestId = formData.get("requestId");
    if (typeof requestId !== "string" || !requestId) {
      return data(
        { error: "Choose a valid privacy request.", success: null },
        { headers },
      );
    }
    try {
      const admin = createSupabaseAdminClient();
      const target = await admin
        .from("data_requests")
        .select("kind")
        .eq("id", requestId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (target.error)
        throw new PublicApiError(
          "SERVICE_UNAVAILABLE",
          "Privacy access is unavailable. Try again later.",
          503,
          true,
        );
      if (!target.data || !["export", "deletion"].includes(target.data.kind))
        return data(
          {
            error: null,
            success: "This privacy request can no longer be cancelled.",
          },
          { headers },
        );
      if (target.data.kind === "deletion") {
        const access = await readCandidatePrivacyAccess(admin, user.id, {
          signal: request.signal,
        });
        if (access.state === "unavailable")
          throw new PublicApiError(
            "SERVICE_UNAVAILABLE",
            "Privacy access is unavailable. Try again later.",
            503,
            true,
          );
        if (access.deletionPrepared)
          return data(
            {
              error:
                "Account deletion has already been prepared and cannot be cancelled.",
              success: null,
            },
            { status: 409, headers },
          );
      }
      const cancelled = await cancelDataRequest({
        userId: user.id,
        requestId,
        auditRequestId: requestIdFrom(request),
      });
      return data(
        {
          error: null,
          success:
            cancelled.status === "cancelled"
              ? "Privacy request cancelled."
              : "This privacy request can no longer be cancelled.",
        },
        { headers },
      );
    } catch (error) {
      return privacyServiceFailure(error, headers);
    }
  }
  if (kind !== "export" && kind !== "deletion") {
    return data(
      { error: "Choose a valid privacy request.", success: null },
      { headers },
    );
  }
  const submission = z.uuidv4().safeParse(formData.get("submissionKey"));
  if (kind === "export" && !submission.success)
    return data(
      {
        error: "Reload this page and submit your privacy request again.",
        success: null,
      },
      { status: 400, headers },
    );
  try {
    const verification =
      kind === "deletion"
        ? await getDeletionVerification(
            request,
            headers,
            client,
            user.id,
            "read",
          )
        : null;
    const submissionKey =
      kind === "deletion"
        ? await verification?.proof()
        : submission.data?.toLowerCase();
    if (!submissionKey)
      return data(
        {
          error: "Verify your account by email before starting deletion.",
          success: null,
        },
        { status: 403, headers },
      );
    const created = await createDataRequest({
      userId: user.id,
      kind,
      submissionKey,
      requestId: requestIdFrom(request),
    });
    verification?.clear();
    return data(
      {
        error: null,
        success:
          created.status === "already_requested"
            ? "This privacy request is already in your history."
            : `${kind} request ${created.status}.`,
      },
      { headers },
    );
  } catch (error) {
    return privacyServiceFailure(error, headers);
  }
}

export function meta() {
  return [
    { title: "Resumide | Privacy and data" },
    {
      name: "description",
      content:
        "Manage data export and deletion requests for your Resumide account.",
    },
  ];
}

function requestLabel(kind: string) {
  return kind === "deletion" ? "Account deletion" : "Data export";
}

function statusLabel(status: string, kind: string) {
  if (kind === "deletion" && status === "completed")
    return "Request processing completed";
  return status.replaceAll("_", " ");
}

function formattedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default function Privacy() {
  const {
    requests,
    consents,
    exportDownloadAccess,
    deletionPrepared,
    deletionVerified,
    submissionKey,
    historyUnavailable = false,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const deletionState = searchParams.get("deletion");
  const isSubmitting = navigation.state === "submitting";
  const exportDownloadsUnavailable =
    exportDownloadAccess !== "allowed" ||
    requests.some(isBlockingDeletionRequest);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(
    deletionVerified ||
      deletionState === "sent" ||
      deletionState === "invalid" ||
      deletionState === "verified",
  );
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const deleteConfirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    if (deleteDialogOpen) {
      if (!dialog.open) {
        dialog.showModal();
        deleteCancelRef.current?.focus();
      } else if (isSubmitting || !dialog.contains(document.activeElement)) {
        deleteCancelRef.current?.focus();
      }
    } else if (dialog.open) {
      dialog.close();
      deleteTriggerRef.current?.focus();
    }
  }, [deleteDialogOpen, isSubmitting]);

  useEffect(() => {
    if (actionData?.success) setDeleteDialogOpen(false);
  }, [actionData?.success]);

  useEffect(() => {
    if (
      deletionState === "sent" ||
      deletionState === "invalid" ||
      deletionState === "verified"
    )
      setDeleteDialogOpen(true);
  }, [deletionState]);

  return (
    <WorkspaceShell
      eyebrow="Account controls"
      title="Privacy and data"
      description="Your resumes are private. Manage export and deletion requests with their status visible in one place."
    >
      <section
        className="privacy-page"
        aria-labelledby="privacy-actions-heading"
      >
        <section className="privacy-retention-note">
          <div>
            <p className="workspace-eyebrow">Retention</p>
            <p>
              Active resume files follow the documented retention policy. A
              deletion request removes active access while remaining
              retention-bound copies are processed.
            </p>
          </div>
          <EvidenceScene3D variant="privacy" compact />
        </section>

        <ol
          className="privacy-data-map"
          aria-label="How resume data is handled"
        >
          <li>
            <span>01</span>
            <div>
              <strong>Upload privately</strong>
              <p>Your source file is tied to your authenticated workspace.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Review transparently</strong>
              <p>Analysis history keeps status and evidence visible.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Stay in control</strong>
              <p>Export and deletion requests remain trackable here.</p>
            </div>
          </li>
        </ol>

        <section
          className="privacy-actions"
          aria-labelledby="privacy-actions-heading"
        >
          <div className="result-section-heading">
            <div>
              <p className="workspace-eyebrow">Your controls</p>
              <h2 id="privacy-actions-heading">Manage your data</h2>
            </div>
          </div>
          <article className="privacy-action-row">
            <div>
              <h3>Export your data</h3>
              <p>Request a copy of your stored analyses and account data.</p>
            </div>
            <Form method="post" className="privacy-action-form">
              <input type="hidden" name="submissionKey" value={submissionKey} />
              <button
                className="back-button"
                name="kind"
                value="export"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Submitting…" : "Request export"}
              </button>
            </Form>
          </article>
          <article className="privacy-action-row is-destructive">
            <div>
              <h3>Delete your account</h3>
              <p>
                Start a deletion request for your active account data and resume
                access.
              </p>
            </div>
            <button
              type="button"
              className="privacy-delete-trigger"
              ref={deleteTriggerRef}
              disabled={isSubmitting}
              onClick={() => setDeleteDialogOpen(true)}
            >
              Review deletion
            </button>
          </article>
        </section>

        {actionData && !deleteDialogOpen ? (
          <p
            className={`privacy-status${actionData.error ? " is-error" : ""}`}
            role={actionData.error ? "alert" : "status"}
            aria-live="polite"
          >
            {actionData.error ?? actionData.success}
          </p>
        ) : null}

        <section
          className="privacy-history"
          aria-labelledby="privacy-history-heading"
        >
          <div className="result-section-heading">
            <div>
              <p className="workspace-eyebrow">Request history</p>
              <h2 id="privacy-history-heading">Recent requests</h2>
            </div>
            <span>
              {historyUnavailable
                ? "Status unavailable"
                : `${requests.length} shown`}
            </span>
          </div>
          {exportDownloadsUnavailable ? (
            <p className="privacy-status" role="status">
              {exportDownloadAccess === "unavailable"
                ? "Export download access could not be checked. Try again shortly."
                : deletionPrepared
                  ? "Account deletion has been prepared. Export downloads remain unavailable while deletion is completed."
                  : "Export downloads are unavailable because an account deletion request is on record."}
            </p>
          ) : null}
          {historyUnavailable ? (
            <p className="privacy-status is-error" role="alert">
              Request history is unavailable. Try again later.
            </p>
          ) : requests.length > 0 ? (
            <ul>
              {requests.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{requestLabel(item.kind)}</strong>
                    <span>Submitted {formattedDate(item.created_at)}</span>
                  </div>
                  <div className="privacy-request-status-group">
                    <span
                      className={`privacy-request-status is-${item.status}`}
                    >
                      {statusLabel(item.status, item.kind)}
                    </span>
                    {item.uploadCleanupHold ? (
                      <p role="status">
                        Upload cleanup is still required. Request processing is
                        on hold.
                      </p>
                    ) : null}
                    {item.kind === "deletion" && item.status === "completed" ? (
                      <p>This status does not confirm full account erasure.</p>
                    ) : null}
                    {item.status === "queued" &&
                    (item.kind !== "deletion" || deletionPrepared === false) ? (
                      <Form method="post">
                        <input type="hidden" name="requestId" value={item.id} />
                        <button
                          type="submit"
                          className="privacy-request-cancel"
                          name="kind"
                          value="cancel"
                          disabled={isSubmitting}
                        >
                          Cancel request
                        </button>
                      </Form>
                    ) : null}
                    {item.kind === "export" &&
                    item.status === "completed" &&
                    !exportDownloadsUnavailable ? (
                      <Link
                        reloadDocument
                        to={`/api/privacy/requests/${item.id}/export`}
                      >
                        Download export
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="privacy-history-empty">No privacy requests yet.</p>
          )}
        </section>

        <section
          className="privacy-consent"
          aria-labelledby="privacy-consent-heading"
        >
          <div className="result-section-heading">
            <div>
              <p className="workspace-eyebrow">Consent record</p>
              <h2 id="privacy-consent-heading">AI processing consent</h2>
            </div>
          </div>
          {consents.length > 0 ? (
            <ul>
              {consents.map((consent) => (
                <li key={`${consent.purpose}-${consent.policy_version}`}>
                  <strong>
                    {consent.purpose === "qualitative_ai"
                      ? "AI-assisted feedback"
                      : consent.purpose}
                  </strong>
                  <span>
                    Policy {consent.policy_version}, recorded{" "}
                    {formattedDate(consent.captured_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No AI consent has been recorded for this account.</p>
          )}
        </section>
      </section>

      <dialog
        ref={deleteDialogRef}
        className="privacy-dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-heading"
        aria-describedby="delete-dialog-description"
        onCancel={(event) => {
          event.preventDefault();
          setDeleteDialogOpen(false);
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const { left, right, top, bottom } =
            event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < left ||
            event.clientX > right ||
            event.clientY < top ||
            event.clientY > bottom
          )
            setDeleteDialogOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const first = deleteCancelRef.current;
          const last = deleteConfirmRef.current;
          if (!last || last.disabled) {
            event.preventDefault();
            first?.focus();
          } else if (event.target === (event.shiftKey ? first : last)) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus();
          }
        }}
      >
        <h2 id="delete-dialog-heading">Start account deletion?</h2>
        <p id="delete-dialog-description">
          {deletionVerified
            ? "Your email is verified. Starting deletion removes active access to your account data and resumes. You can track the request here."
            : "Verify your account by email before starting deletion. Open the link in this browser, then confirm the request."}
        </p>
        {actionData?.error ? <p role="alert">{actionData.error}</p> : null}
        {!deletionVerified && deletionState === "sent" ? (
          <p role="status">Check your email for the verification link.</p>
        ) : null}
        {!deletionVerified &&
        (deletionState === "invalid" || deletionState === "verified") ? (
          <p role="status">
            This link is unavailable or has expired. Request a new verification
            link.
          </p>
        ) : null}
        <div className="privacy-dialog-actions">
          <button
            type="button"
            className="back-button"
            ref={deleteCancelRef}
            onClick={() => setDeleteDialogOpen(false)}
          >
            Cancel
          </button>
          <Form method="post">
            <button
              className="privacy-delete-confirm"
              ref={deleteConfirmRef}
              name="kind"
              value={deletionVerified ? "deletion" : "verify-deletion"}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Submitting…"
                : deletionVerified
                  ? "Start deletion request"
                  : "Send verification link"}
            </button>
          </Form>
        </div>
      </dialog>
    </WorkspaceShell>
  );
}
