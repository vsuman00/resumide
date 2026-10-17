import { useEffect, useRef, useState } from "react";
import {
  Link,
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  data,
  type HeadersFunction,
} from "react-router";
import type { Route } from "./+types/privacy";
import WorkspaceShell from "~/components/WorkspaceShell";
import EvidenceScene3D from "~/components/EvidenceScene3D";
import { getAuthenticatedUser } from "~/lib/server/auth";
import { cancelDataRequest, createDataRequest } from "~/lib/server/privacy";
import { createRequestId } from "~/lib/server/request-context";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "~/lib/server/supabase";
import { assertSameOrigin } from "~/lib/server/security";
import { getServerConfig } from "~/lib/server/config";

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
  return headers;
};

async function requireRouteUser(request: Request, headers: Headers) {
  const user = await getAuthenticatedUser(
    createSupabaseServerClient(request, headers),
  );
  if (!user) throw redirect("/auth?next=/privacy", { headers });
  return user;
}

export async function loader({ request }: Route.LoaderArgs) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
  });
  const user = await requireRouteUser(request, headers);
  const { data: requests } = await createSupabaseAdminClient()
    .from("data_requests")
    .select("id, kind, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const { data: consents } = await createSupabaseAdminClient()
    .from("consents")
    .select("purpose, policy_version, captured_at")
    .eq("user_id", user.id)
    .order("captured_at", { ascending: false });
  return data(
    { requests: requests ?? [], consents: consents ?? [] },
    { headers },
  );
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request, getServerConfig().APP_ORIGIN);
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    Vary: "Cookie",
  });
  const user = await requireRouteUser(request, headers);
  const formData = await request.formData();
  const kind = formData.get("kind");
  if (kind === "cancel") {
    const requestId = formData.get("requestId");
    if (typeof requestId !== "string" || !requestId) {
      return data(
        { error: "Choose a valid privacy request.", success: null },
        { headers },
      );
    }
    const cancelled = await cancelDataRequest({
      userId: user.id,
      requestId,
      auditRequestId: createRequestId(),
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
  }
  if (kind !== "export" && kind !== "deletion") {
    return data(
      { error: "Choose a valid privacy request.", success: null },
      { headers },
    );
  }
  const created = await createDataRequest({
    userId: user.id,
    kind,
    requestId: createRequestId(),
  });
  return data(
    { error: null, success: `${kind} request ${created.status}.` },
    { headers },
  );
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

function statusLabel(status: string) {
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
  const { requests, consents } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const deleteDialogRef = useRef<HTMLElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const wasDialogOpen = useRef(false);

  useEffect(() => {
    if (deleteDialogOpen) deleteDialogRef.current?.focus();
    else if (wasDialogOpen.current) deleteTriggerRef.current?.focus();
    wasDialogOpen.current = deleteDialogOpen;
  }, [deleteDialogOpen]);

  useEffect(() => {
    if (actionData?.success) setDeleteDialogOpen(false);
  }, [actionData?.success]);

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

        {actionData ? (
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
            <span>{requests.length} shown</span>
          </div>
          {requests.length > 0 ? (
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
                      {statusLabel(item.status)}
                    </span>
                    {item.status === "queued" ? (
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
                    {item.kind === "export" && item.status === "completed" ? (
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

      {deleteDialogOpen ? (
        <div
          className="privacy-dialog-backdrop"
          onMouseDown={() => setDeleteDialogOpen(false)}
        >
          <section
            ref={deleteDialogRef}
            className="privacy-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-heading"
            aria-describedby="delete-dialog-description"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") setDeleteDialogOpen(false);
            }}
          >
            <p className="workspace-eyebrow">Confirm request</p>
            <h2 id="delete-dialog-heading">Start account deletion?</h2>
            <p id="delete-dialog-description">
              This starts a deletion request. Its progress will remain visible
              in your request history.
            </p>
            <div className="privacy-dialog-actions">
              <button
                type="button"
                className="back-button"
                onClick={() => setDeleteDialogOpen(false)}
              >
                Cancel
              </button>
              <Form method="post">
                <button
                  className="privacy-delete-confirm"
                  name="kind"
                  value="deletion"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting…" : "Start deletion request"}
                </button>
              </Form>
            </div>
          </section>
        </div>
      ) : null}
    </WorkspaceShell>
  );
}
