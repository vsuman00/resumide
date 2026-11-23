import {
  data,
  redirect,
  Link,
  useLoaderData,
  useActionData,
  useRouteError,
  isRouteErrorResponse,
  type HeadersFunction,
} from "react-router";
import AuthoringWorkspace, {
  type AuthoringFeedback,
} from "~/components/AuthoringWorkspace";
import { loadAuthoring } from "~/lib/server/authoring-repository";
import WorkspaceShell from "~/components/WorkspaceShell";
import { getServerConfig } from "~/lib/server/config";
import { getAuthenticatedUser } from "~/lib/server/auth";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "~/lib/server/supabase";
import { CanonicalError } from "~/lib/server/canonical-repository";
import { loadScoreDiagnostics } from "~/lib/server/score-v2-repository";
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
  const h = privateHeaders();
  for (const source of [
    parentHeaders,
    loaderHeaders,
    actionHeaders,
    errorHeaders,
  ])
    if (source)
      for (const c of source.getSetCookie()) h.append("Set-Cookie", c);
  return h;
};
export const meta = () => [{ title: "Scoring diagnostics | Resumide" }];
export async function loader({ request, params }: Args) {
  const h = privateHeaders();
  try {
    if (!getServerConfig().SCORING_V2_ENABLED)
      throw new CanonicalError(404, "Scoring diagnostics are not enabled.");
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, h),
    );
    if (!user)
      throw redirect(
        `/auth?next=${encodeURIComponent(`/analysis/${params.id ?? ""}/score`)}`,
        { headers: h },
      );
    const options: Record<string, string> = {};
    let focus: string | undefined;
    for (const [key, value] of new URL(request.url).searchParams) {
      if (key === "focus" && getServerConfig().AUTHORING_ENABLED) {
        if (focus !== undefined)
          throw new CanonicalError(422, "Choose one contribution.");
        focus = value;
        continue;
      }
      if (
        ![
          "canonical",
          "requirements",
          "expectedCanonical",
          "expectedRequirements",
        ].includes(key) ||
        Object.hasOwn(options, key)
      )
        throw new CanonicalError(
          422,
          "Choose supported, distinct input versions.",
        );
      options[key] = value;
    }
    const client = createSupabaseAdminClient();
    const model = await loadScoreDiagnostics(
      client,
      params.id ?? "",
      user.id,
      options,
    );
    const authoring = getServerConfig().AUTHORING_ENABLED
      ? await loadAuthoring(client, params.id ?? "", user.id, model, focus)
      : null;
    return data(
      {
        ...model,
        authoring,
        artifactEnabled: getServerConfig().ARTIFACT_RENDERING_ENABLED,
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
            : "Scoring diagnostics are unavailable.",
      },
      {
        status: error instanceof CanonicalError ? error.status : 503,
        headers: h,
      },
    );
  }
}
export function action() {
  const h = privateHeaders();
  h.set("Allow", "GET");
  return data(
    { error: "Scoring diagnostics are read-only." },
    { status: 405, headers: h },
  );
}
const labels = {
  ats_compatibility: "ATS compatibility",
  job_alignment_required: "Required job alignment",
  job_alignment_preferred: "Preferred job alignment",
};
const words = (value: string) => value.replaceAll("_", " ");
export default function ScoreDiagnostics() {
  const model = useLoaderData<typeof loader>(),
    d = model.diagnostics;
  const feedback = useActionData<AuthoringFeedback>();
  const base = `/analysis/${model.analysisId}`;
  return (
    <WorkspaceShell
      eyebrow="Evidence review"
      title="Review scoring diagnostics"
      description="Review recovered evidence and missing information before using a score."
    >
      <div style={{ overflowWrap: "anywhere" }}>
        {model.authoring && (
          <AuthoringWorkspace
            model={model.authoring}
            analysisId={model.analysisId}
            feedback={feedback}
          />
        )}
        <nav aria-label="Evidence workspace">
          <Link to={`${base}/evidence`}>Review source evidence</Link>
          {" · "}
          <Link to={`${base}/canonical`}>Review structured resume</Link>
          {" · "}
          <Link to={`${base}/requirements`}>Review job requirements</Link>
          {model.artifactEnabled && " · "}
          {model.artifactEnabled && (
            <Link to={`${base}/export`}>Preview and export resume</Link>
          )}
        </nav>
        <p>
          Numeric scores are unavailable while evidence and scoring calibration
          need review. These diagnostics do not predict employer acceptance.
        </p>
        {model.historical && (
          <p role="status">
            Historical input versions. Changes to the current resume do not
            update this view.
          </p>
        )}
        <section aria-label="Score dimensions">
          {d.score.dimensions.map((dimension) => (
            <article key={dimension.id}>
              <h2>{labels[dimension.id]}</h2>
              <p>Unavailable</p>
              <p>{dimension.blockers.map(words).join("; ")}</p>
            </article>
          ))}
        </section>
        <section>
          <h2>Evidence readiness</h2>
          <p>
            {words(d.readiness.state)}. Recovered text appears on{" "}
            {Math.round(d.readiness.observedPageCoverage * 100)}% of the
            declared or retained pages. This is an observation, not confidence
            in accuracy.
          </p>
          <ul>
            {d.readiness.blockers.map((b) => (
              <li key={b}>{words(b)}</li>
            ))}
          </ul>
          {d.readiness.sourceWarnings.map((w) => (
            <p key={w}>{words(w)}</p>
          ))}
          <p>Application Readiness aggregate: unavailable.</p>
        </section>
        <section>
          <h2>Next repair priorities</h2>
          <p>
            Ordered by missing evidence and review needs. No estimated score
            gains.
          </p>
          <ol>
            {d.improvements.map((i) => (
              <li key={i.id}>
                {i.reason}{" "}
                <Link
                  to={`${base}/${i.target === "canonical" ? "canonical" : i.target === "requirements" ? "requirements" : "evidence"}`}
                >
                  Review this evidence
                </Link>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h2>Recovered observations</h2>
          {d.strengths.length ? (
            <ul>
              {d.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <p>No complete observations available.</p>
          )}
        </section>
        <section>
          <h2>Technical evidence checks</h2>
          {d.rules.map((r) => (
            <article key={r.id}>
              <h3>{r.label}</h3>
              <p>
                {words(r.state)}: {r.reason}
              </p>
              <p>
                Observed rule credit:{" "}
                {r.credit === null ? "unavailable" : r.credit}; policy weight:
                unavailable.
              </p>
              <ul>
                {r.citations.map((c) => (
                  <li key={`${c.kind}:${c.id}`}>
                    <Link
                      to={
                        c.kind === "fact"
                          ? `${base}/canonical?version=${model.canonical.versionId}#fact-${c.id}`
                          : `#span-${c.id}`
                      }
                    >
                      {words(c.kind)} {c.id}
                    </Link>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
        <section>
          <h2>Cited source excerpts</h2>
          {model.sourceExcerpts.map((span) => (
            <article key={span.id} id={`span-${span.id}`}>
              <h3>Source span {span.id}</h3>
              <blockquote>{span.text}</blockquote>
              {span.truncated && (
                <p>Excerpt truncated; review the complete source evidence.</p>
              )}
            </article>
          ))}
        </section>
        {(["required", "preferred", "contextual", "unknown"] as const).map(
          (importance) => (
            <section key={importance}>
              <h2>{words(importance)} requirements</h2>
              {d.alignment
                .filter((a) => a.importance === importance)
                .map((a) => (
                  <article key={a.id}>
                    <h3>
                      {a.type}: {a.value}
                    </h3>
                    <p>
                      Evaluation: {words(a.state)}. Candidate observation:{" "}
                      {words(a.proposedState)}.
                    </p>
                    <p>{a.reason}</p>
                    <p>
                      {a.sourceRequirementIds.length} source clause(s), grouped
                      once.
                    </p>
                    <Link
                      to={`${base}/requirements${model.requirements ? `?version=${model.requirements.versionId}` : ""}`}
                    >
                      Inspect quoted requirement
                    </Link>
                    {a.factIds.map((id) => (
                      <p key={id}>
                        <Link
                          to={`${base}/canonical?version=${model.canonical.versionId}`}
                        >
                          Inspect fact {id}
                        </Link>
                      </p>
                    ))}
                  </article>
                ))}
            </section>
          ),
        )}
        <details>
          <summary>Input versions and scoring policy</summary>
          <p>
            Structured resume revision {model.canonical.revision}:{" "}
            {model.canonical.versionId}
          </p>
          <p>
            Job requirements:{" "}
            {model.requirements
              ? `${model.requirements.revision}: ${model.requirements.versionId}`
              : "missing"}
          </p>
          <p>Evidence: {d.score.evidenceVersionId}</p>
          <p>Policy: {d.score.policyId}; draft; calibration unavailable.</p>
          <p>
            Engine: {d.score.producerVersion}; input fingerprint:{" "}
            {d.score.inputSha256}
          </p>
          <Link
            to={`${base}/score?canonical=${model.canonical.versionId}${model.requirements ? `&requirements=${model.requirements.versionId}` : ""}`}
          >
            Open these input versions
          </Link>
        </details>
      </div>
    </WorkspaceShell>
  );
}
export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <WorkspaceShell
      eyebrow="Scoring diagnostics"
      title="Diagnostics unavailable"
    >
      <p>
        {isRouteErrorResponse(error) && typeof error.data?.error === "string"
          ? error.data.error
          : "Reload or review your evidence workspace."}
      </p>
    </WorkspaceShell>
  );
}
