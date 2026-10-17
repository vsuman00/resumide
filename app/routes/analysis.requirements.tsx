import { randomUUID } from "node:crypto";
import {
  data,
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  useRouteError,
  isRouteErrorResponse,
  type HeadersFunction,
} from "react-router";
import WorkspaceShell from "~/components/WorkspaceShell";
import { getServerConfig } from "~/lib/server/config";
import { getAuthenticatedUser } from "~/lib/server/auth";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "~/lib/server/supabase";
import { assertSameOrigin } from "~/lib/server/security";
import { CanonicalError } from "~/lib/server/canonical-repository";
import { PublicApiError } from "~/lib/server/errors";
import {
  loadJobRequirements,
  readJobRequirementForm,
  saveJobRequirements,
} from "~/lib/server/job-requirement-repository";
type Args = { request: Request; params: { id?: string } };
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
  const h = new Headers(parentHeaders);
  for (const source of [loaderHeaders, actionHeaders, errorHeaders])
    if (source) {
      for (const [k, v] of source)
        if (k.toLowerCase() !== "set-cookie") h.set(k, v);
      for (const c of source.getSetCookie()) h.append("Set-Cookie", c);
    }
  h.set("Cache-Control", "private, no-store");
  h.set("X-Robots-Tag", "noindex, nofollow");
  return h;
};
export const meta = () => [{ title: "Review job requirements | Resumide" }];
function enabled() {
  if (!getServerConfig().JOB_INTELLIGENCE_ENABLED)
    throw new CanonicalError(404, "Job intelligence is not enabled.");
}
export async function loader({ request, params }: Args) {
  const h = privateHeaders();
  try {
    enabled();
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, h),
    );
    if (!user)
      throw redirect(
        `/auth?next=${encodeURIComponent(`/analysis/${params.id ?? ""}/requirements`)}`,
        { headers: h },
      );
    const url = new URL(request.url);
    const offset = url.searchParams.get("offset") ?? "0";
    if (!/^(?:0|[1-9]\d*)$/u.test(offset))
      throw new CanonicalError(422, "Choose a valid history page.");
    return data(
      {
        ...(await loadJobRequirements(
          createSupabaseAdminClient(),
          params.id ?? "",
          user.id,
          {
            versionId: url.searchParams.get("version") ?? undefined,
            offset: Number(offset),
          },
        )),
        scoringDiagnosticsEnabled: getServerConfig().SCORING_V2_ENABLED,
        formKey: randomUUID(),
      },
      { headers: h },
    );
  } catch (error) {
    if (error instanceof Response) throw error;
    throw data(
      {
        error:
          error instanceof CanonicalError
            ? error.message
            : "Job requirements are unavailable.",
      },
      {
        status: error instanceof CanonicalError ? error.status : 503,
        headers: h,
      },
    );
  }
}
export async function action({ request, params }: Args) {
  const h = privateHeaders();
  try {
    enabled();
    if (request.method !== "POST") {
      h.set("Allow", "POST");
      return data({ error: "Use POST." }, { status: 405, headers: h });
    }
    assertSameOrigin(request, getServerConfig().APP_ORIGIN);
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, h),
    );
    if (!user)
      return data(
        { error: "Sign in to review job requirements." },
        { status: 401, headers: h },
      );
    const command = await readJobRequirementForm(request);
    const r = await saveJobRequirements(
      createSupabaseAdminClient(),
      params.id ?? "",
      user.id,
      command,
      randomUUID(),
    );
    return data(
      { success: `JD version ${r.revision} saved.`, error: null },
      { headers: h },
    );
  } catch (error) {
    return data(
      {
        error:
          error instanceof CanonicalError || error instanceof PublicApiError
            ? error.message
            : "Your JD could not be saved. Retry the same submission.",
        success: null,
      },
      {
        status:
          error instanceof CanonicalError || error instanceof PublicApiError
            ? error.status
            : 503,
        headers: h,
      },
    );
  }
}
export default function JobRequirements() {
  const model = useLoaderData<typeof loader>(),
    feedback = useActionData<typeof action>(),
    busy = useNavigation().state !== "idle";
  const doc = model.current?.document;
  return (
    <WorkspaceShell
      action={
        model.scoringDiagnosticsEnabled ? (
          <Link
            to={`/analysis/${model.analysisId}/score${doc ? `?requirements=${doc.id}` : ""}`}
          >
            Review scoring diagnostics
          </Link>
        ) : undefined
      }
      eyebrow="Job intelligence"
      title="Review the job requirements"
      description="Inspect the exact job description behind each proposed requirement."
    >
      <p role="status">
        These requirements need review. Inferred importance is labeled
        separately. Job alignment scoring is unavailable.
      </p>
      {feedback && (
        <p role={feedback.error ? "alert" : "status"} aria-live="polite">
          {feedback.error ?? feedback.success}
        </p>
      )}
      <Link to={`/analysis/${model.analysisId}`}>Back to analysis</Link>
      <Form method="post">
        <input
          type="hidden"
          name="expectedVersionId"
          value={model.headId ?? ""}
        />
        <input type="hidden" name="idempotencyKey" value={model.formKey} />
        <button className="back-button" type="submit" disabled={busy}>
          Save job requirements for review
        </button>
      </Form>
      {doc && (
        <>
          <h2>JD version {model.current!.revision}</h2>
          <p>State: {doc.state.replaceAll("_", " ")}</p>
          {doc.state === "unsupported" && (
            <p role="alert">
              This domain or locale is outside the current review pack.
            </p>
          )}
          {doc.state === "insufficient" && (
            <p role="alert">
              No supported explicit requirements were found. Inspect the
              original JD.
            </p>
          )}
          <ol>
            {doc.requirements.map((r) => (
              <li key={r.id}>
                <h3>
                  {r.type}: {r.value}
                </h3>
                <p>
                  Importance: {r.importance} ({r.importanceBasis});{" "}
                  {r.negated
                    ? "negated clause — review before use"
                    : "unconfirmed"}
                </p>
                {r.minimumYears !== null && (
                  <p>Explicit minimum experience: {r.minimumYears} years</p>
                )}
                <blockquote>{r.evidence.quote}</blockquote>
                {r.importanceEvidence && (
                  <p>
                    Importance evidence: “{r.importanceEvidence.quote}” (JD
                    characters {r.importanceEvidence.start}–
                    {r.importanceEvidence.end})
                  </p>
                )}
                <p>
                  JD characters {r.evidence.start}–{r.evidence.end}
                </p>
                {r.ambiguity.length > 0 && (
                  <p>Review: {r.ambiguity.join(", ").replaceAll("_", " ")}</p>
                )}
              </li>
            ))}
          </ol>
          <h2>JD history</h2>
          <ul>
            {model.history.map((v) => (
              <li key={v.id}>
                <Link to={`?version=${v.id}`}>
                  View JD version {v.revision}
                </Link>
              </li>
            ))}
          </ul>
          {model.nextOffset !== null && (
            <Link to={`?offset=${model.nextOffset}`}>Older JD versions</Link>
          )}
        </>
      )}
      <section aria-labelledby="jd-source">
        <h2 id="jd-source">Original job description</h2>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {model.sourceText || "No job description supplied."}
        </pre>
      </section>
    </WorkspaceShell>
  );
}
export function ErrorBoundary() {
  const e = useRouteError();
  return (
    <WorkspaceShell
      eyebrow="Job intelligence"
      title="Job requirements unavailable"
      description={
        isRouteErrorResponse(e)
          ? (e.data?.error ?? "Try again later.")
          : "Try again later."
      }
    >
      <Link to="/">Return home</Link>
    </WorkspaceShell>
  );
}
