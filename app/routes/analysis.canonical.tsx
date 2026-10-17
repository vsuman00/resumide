import { randomUUID } from "node:crypto";
import {
  data,
  Form,
  isRouteErrorResponse,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  useRouteError,
  type HeadersFunction,
} from "react-router";
import WorkspaceShell from "~/components/WorkspaceShell";
import { getAuthenticatedUser } from "~/lib/server/auth";
import { getServerConfig } from "~/lib/server/config";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "~/lib/server/supabase";
import { assertSameOrigin } from "~/lib/server/security";
import {
  CanonicalError,
  loadCanonical,
  mutateCanonical,
  readCanonicalForm,
} from "~/lib/server/canonical-repository";
import { PublicApiError } from "~/lib/server/errors";
type Args = { request: Request; params: { id?: string } };
export function meta() {
  return [{ title: "Review structured resume | Resumide" }];
}
const privateHeaders = () =>
  new Headers({
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
  });
export const headers: HeadersFunction = ({
  parentHeaders,
  loaderHeaders,
  actionHeaders,
  errorHeaders,
}) => {
  const result = new Headers(parentHeaders);
  for (const source of [loaderHeaders, actionHeaders, errorHeaders])
    if (source) {
      for (const [key, value] of source)
        if (key.toLowerCase() !== "set-cookie") result.set(key, value);
      for (const cookie of source.getSetCookie())
        result.append("Set-Cookie", cookie);
    }
  result.set("Cache-Control", "private, no-store");
  result.set("X-Robots-Tag", "noindex, nofollow");
  return result;
};
function enabled() {
  if (!getServerConfig().CANONICAL_AUTHORING_ENABLED)
    throw new CanonicalError(404, "Structured resume is not enabled.");
}
export async function loader({ request, params }: Args) {
  const headers = privateHeaders();
  try {
    enabled();
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, headers),
    );
    if (!user)
      throw redirect(
        `/auth?next=${encodeURIComponent(`/analysis/${params.id ?? ""}/canonical`)}`,
        { headers },
      );
    const url = new URL(request.url);
    const offset = url.searchParams.get("offset") ?? "0";
    if (!/^(?:0|[1-9]\d*)$/u.test(offset))
      throw new CanonicalError(422, "Choose a valid history page.");
    const model = await loadCanonical(
      createSupabaseAdminClient(),
      params.id ?? "",
      user.id,
      {
        versionId: url.searchParams.get("version") ?? undefined,
        compareId: url.searchParams.get("compare") ?? undefined,
        offset: Number(offset),
      },
    );
    return data(
      {
        ...model,
        scoringDiagnosticsEnabled: getServerConfig().SCORING_V2_ENABLED,
        formKey: randomUUID(),
        factKeys: Object.fromEntries(
          (model.current?.document.facts ?? []).map((f) => [
            f.id,
            { edit: randomUUID(), confirm: randomUUID() },
          ]),
        ),
        restoreKey: randomUUID(),
      },
      { headers },
    );
  } catch (error) {
    if (error instanceof Response) throw error;
    throw data(
      {
        error:
          error instanceof CanonicalError
            ? error.message
            : "Structured resume is unavailable.",
      },
      { status: error instanceof CanonicalError ? error.status : 503, headers },
    );
  }
}
export async function action({ request, params }: Args) {
  const headers = privateHeaders();
  try {
    enabled();
    if (request.method !== "POST") {
      headers.set("Allow", "POST");
      return data({ error: "Use POST." }, { status: 405, headers });
    }
    assertSameOrigin(request, getServerConfig().APP_ORIGIN);
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, headers),
    );
    if (!user)
      return data(
        { error: "Sign in to review your resume." },
        { status: 401, headers },
      );
    const input = await readCanonicalForm(request);
    const result = await mutateCanonical(
      createSupabaseAdminClient(),
      params.id ?? "",
      user.id,
      input,
      randomUUID(),
    );
    return data(
      { success: `Version ${result.revision} saved.`, error: null },
      { headers },
    );
  } catch (error) {
    return data(
      {
        error:
          error instanceof CanonicalError || error instanceof PublicApiError
            ? error.message
            : "Your change could not be saved. Retry the same submission.",
        success: null,
      },
      {
        status:
          error instanceof CanonicalError || error instanceof PublicApiError
            ? error.status
            : 503,
        headers,
      },
    );
  }
}
export default function CanonicalResume() {
  const model = useLoaderData<typeof loader>();
  const feedback = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";
  const current = model.current?.document;
  const editable = current?.versionId === model.headId;
  return (
    <WorkspaceShell
      eyebrow="Structured resume"
      title="Review your resume facts"
      description="Review imported content, confirm facts and keep a history of your changes."
    >
      {model.scoringDiagnosticsEnabled && (
        <Link
          to={`/analysis/${model.analysisId}/score${current ? `?canonical=${current.versionId}` : ""}`}
        >
          Review scoring diagnostics
        </Link>
      )}
      <p role="status">
        Imported facts need your review. Confirmation records your decision.
        Scoring is unavailable.
      </p>
      {feedback && (
        <p role={feedback.error ? "alert" : "status"} aria-live="polite">
          {feedback.error ?? feedback.success}
        </p>
      )}
      <Link
        to={`/analysis/${model.analysisId}/canonical`}
        reloadDocument
        className="back-button"
      >
        Reload latest version
      </Link>{" "}
      <Link to={`/analysis/${model.analysisId}/evidence`}>
        View source evidence
      </Link>
      {!current ? (
        <Form method="post">
          <input type="hidden" name="operation" value="import" />
          <input type="hidden" name="expectedVersionId" value="" />
          <input type="hidden" name="idempotencyKey" value={model.formKey} />
          <button type="submit" className="back-button" disabled={busy}>
            Import resume for review
          </button>
        </Form>
      ) : (
        <>
          <h2>Version {model.current!.revision}</h2>
          <section aria-labelledby="facts-heading">
            <h2 id="facts-heading">Facts and confirmation</h2>
            {current.facts.map((fact) => (
              <article
                key={fact.id}
                id={`fact-${fact.id}`}
                className="account-card"
              >
                <h3>
                  {fact.type.replaceAll("_", " ")}: {fact.value}
                </h3>
                <p>State: {fact.state.replaceAll("_", " ")}</p>
                {fact.confirmation && (
                  <p>
                    Confirmed{" "}
                    <time dateTime={fact.confirmation.confirmedAt}>
                      {fact.confirmation.confirmedAt}
                    </time>
                  </p>
                )}
                <ul>
                  {fact.sources.map((citation, index) => (
                    <li key={index}>
                      <Link
                        to={`/analysis/${model.analysisId}/evidence#source-${citation.spanId}`}
                      >
                        {citation.spanId}, characters {citation.start}–
                        {citation.end}
                      </Link>
                    </li>
                  ))}
                </ul>
                {editable && (
                  <>
                    <Form method="post">
                      <input type="hidden" name="operation" value="confirm" />
                      <input
                        type="hidden"
                        name="expectedVersionId"
                        value={model.headId!}
                      />
                      <input
                        type="hidden"
                        name="idempotencyKey"
                        value={model.factKeys[fact.id].confirm}
                      />
                      <input type="hidden" name="factId" value={fact.id} />
                      <button
                        className="back-button"
                        type="submit"
                        disabled={busy || fact.state === "candidate_confirmed"}
                      >
                        Confirm {fact.type}: {fact.value}
                      </button>
                    </Form>
                    <Form method="post">
                      <input type="hidden" name="operation" value="edit" />
                      <input
                        type="hidden"
                        name="expectedVersionId"
                        value={model.headId!}
                      />
                      <input
                        type="hidden"
                        name="idempotencyKey"
                        value={model.factKeys[fact.id].edit}
                      />
                      <input type="hidden" name="factId" value={fact.id} />
                      <label htmlFor={`edit-${fact.id}`}>
                        Correct {fact.type}: {fact.value}
                      </label>
                      <textarea
                        id={`edit-${fact.id}`}
                        name="value"
                        defaultValue={fact.value}
                        maxLength={2000}
                        required
                      />
                      <button
                        type="submit"
                        className="back-button"
                        disabled={busy}
                      >
                        Save correction for {fact.type}: {fact.value}
                      </button>
                    </Form>
                  </>
                )}
              </article>
            ))}
          </section>
          <section aria-labelledby="preview-heading">
            <h2 id="preview-heading">Content preview</h2>
            {current.sections.map((section) => (
              <section key={section.id}>
                <h3>{section.title}</h3>
                {section.entries.map((entry) => (
                  <ul key={entry.id}>
                    {entry.factIds.map((id) => {
                      const fact = current.facts.find(
                        (item) => item.id === id,
                      )!;
                      return (
                        <li key={id}>
                          {fact.type}: {fact.value}
                        </li>
                      );
                    })}
                    {entry.bullets.map((bullet) => (
                      <li key={bullet.id}>{bullet.text}</li>
                    ))}
                  </ul>
                ))}
              </section>
            ))}
          </section>
          <section aria-labelledby="changes-heading">
            <h2 id="changes-heading">Version change record</h2>
            <ol>
              {current.changes.map((change) => (
                <li key={change.id}>
                  {change.action}
                  {change.priorValue
                    ? `: previously ${change.priorValue}`
                    : ""}{" "}
                  <time dateTime={change.createdAt}>{change.createdAt}</time>
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="history-heading">
            <h2 id="history-heading">Version history</h2>
            <ol>
              {model.history.map((version) => (
                <li key={version.id}>
                  <Link to={`?version=${version.id}`}>
                    View version {version.revision}
                  </Link>{" "}
                  <Link
                    to={`?version=${current.versionId}&compare=${version.id}`}
                  >
                    Compare with version {version.revision}
                  </Link>
                  {version.id !== model.headId && (
                    <Form method="post">
                      <input type="hidden" name="operation" value="rollback" />
                      <input
                        type="hidden"
                        name="expectedVersionId"
                        value={model.headId!}
                      />
                      <input
                        type="hidden"
                        name="idempotencyKey"
                        value={model.restoreKey}
                      />
                      <input
                        type="hidden"
                        name="targetVersionId"
                        value={version.id}
                      />
                      <button
                        type="submit"
                        disabled={busy}
                        className="back-button"
                      >
                        Restore version {version.revision} as a new version
                      </button>
                    </Form>
                  )}
                </li>
              ))}
            </ol>
            {model.nextOffset !== null && (
              <Link to={`?offset=${model.nextOffset}`}>Older versions</Link>
            )}
          </section>
          {model.comparison !== null && (
            <section aria-labelledby="compare-heading">
              <h2 id="compare-heading">Fact comparison</h2>
              {model.comparison.length ? (
                <ul>
                  {model.comparison.map((change) => (
                    <li key={change.id}>
                      {change.before?.value ?? "Absent"} (
                      {change.before?.state ?? "absent"}) →{" "}
                      {change.after?.value ?? "Absent"} (
                      {change.after?.state ?? "absent"})
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No fact changes.</p>
              )}
            </section>
          )}
        </>
      )}
    </WorkspaceShell>
  );
}
export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <WorkspaceShell
      eyebrow="Structured resume"
      title="Structured resume unavailable"
      description="Your saved versions have not been changed."
    >
      <p role="alert">
        {isRouteErrorResponse(error) && typeof error.data?.error === "string"
          ? error.data.error
          : "Structured content could not be loaded safely."}
      </p>
      <Link to="/upload" className="back-button">
        Return to uploads
      </Link>
    </WorkspaceShell>
  );
}
