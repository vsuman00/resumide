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
import type { JobRequirementRelations } from "~/lib/server/job-requirement-admission";
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
        jobRelationsWriterEnabled: getServerConfig().JOB_RELATIONS_ENABLED,
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
type TypedClause = JobRequirementRelations["relations"]["clauses"][number];
type TypedMapping = JobRequirementRelations["requirements"][number]["mapping"];
const reviewReason = (reason: string) => reason.replaceAll("_", " ");
function StoredMapping({
  value,
  mapping,
}: {
  value: string;
  mapping: TypedMapping;
}) {
  if (!mapping) return null;
  const label = mapping.canonicalValue;
  return (
    <p>
      {mapping.kind === "alias" && label
        ? `Alias mapping: ${value} → ${label}.`
        : mapping.kind === "exact" && label
          ? `Exact local label: ${label}.`
          : `No local concept mapping for ${value}.`}
    </p>
  );
}
function TypedSkillReview({
  expression,
}: {
  expression: TypedClause["skillExpression"];
}) {
  if (expression.kind === "unknown")
    return (
      <p>{`Skill interpretation needs review: ${reviewReason(expression.reason)}.`}</p>
    );
  if (expression.kind === "atom")
    return (
      <>
        <p>Source skill: {expression.value}</p>
        <StoredMapping value={expression.value} mapping={expression.mapping} />
      </>
    );
  return (
    <>
      <p>
        {expression.kind === "any_of"
          ? "Any one of these skills (OR)"
          : "All of these skills (AND)"}
      </p>
      <ul>
        {expression.operands.map((operand) => (
          <li key={`${operand.evidence.start}:${operand.evidence.end}`}>
            <p>{operand.value}</p>
            <StoredMapping value={operand.value} mapping={operand.mapping} />
          </li>
        ))}
      </ul>
      <p>
        Connector wording:{" "}
        {expression.operatorEvidence.map((span) => span.quote).join(", ")}
      </p>
    </>
  );
}
function TypedDurationReview({
  duration,
}: {
  duration: TypedClause["duration"];
}) {
  const labels = {
    range: "range",
    at_least: "at least",
    more_than: "more than",
    at_most: "at most",
    less_than: "less than",
    exactly: "exactly",
    unknown: "needs review",
    not_stated: "not stated",
  } satisfies Record<TypedClause["duration"]["kind"], string>;
  const bound = (
    label: string,
    value: NonNullable<TypedClause["duration"]["lower"]>,
  ) =>
    `${label}: ${value.value} ${value.value === 1 ? "year" : "years"} (${value.inclusive ? "included" : "excluded"}).`;
  return (
    <>
      <p>
        {duration.kind === "unknown"
          ? `Duration interpretation needs review${duration.reason ? `: ${reviewReason(duration.reason)}` : ""}.`
          : duration.kind === "not_stated"
            ? "No explicit duration was identified."
            : `Duration interpretation: ${labels[duration.kind]}.`}
      </p>
      {duration.evidence && <p>Duration wording: {duration.evidence.quote}</p>}
      {duration.lower && <p>{bound("Lower bound", duration.lower)}</p>}
      {duration.upper && <p>{bound("Upper bound", duration.upper)}</p>}
      {duration.kind === "unknown" && duration.candidateEvidence.length > 0 && (
        <ul>
          {duration.candidateEvidence.map((span) => (
            <li key={`${span.start}:${span.end}`}>{span.quote}</li>
          ))}
        </ul>
      )}
      {duration.kind !== "not_stated" && (
        <p>
          These bounds describe this JD clause. Candidate experience has not
          been evaluated.
        </p>
      )}
    </>
  );
}
function TypedRequirementsReview({
  document,
}: {
  document: JobRequirementRelations;
}) {
  return (
    <section aria-labelledby="typed-jd-review">
      <h3 id="typed-jd-review">Typed JD clause review</h3>
      <p>
        Review the quoted alternatives, combined requirements and experience
        bounds. No match or numeric credit has been assigned.
      </p>
      {document.relations.clauses.length ? (
        <ol>
          {document.relations.clauses.map((clause) => (
            <li key={clause.id}>
              <p>
                Importance: {clause.scope.importance}.{" "}
                {clause.scope.negated
                  ? "Negated wording needs review."
                  : "Interpretation needs review."}
              </p>
              <blockquote
                style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
              >
                {clause.evidence.quote}
              </blockquote>
              <p>
                JD characters {clause.evidence.start}–{clause.evidence.end}
              </p>
              <TypedSkillReview expression={clause.skillExpression} />
              <TypedDurationReview duration={clause.duration} />
            </li>
          ))}
        </ol>
      ) : (
        <p>
          No typed clauses were identified. Review the literal observations and
          original JD.
        </p>
      )}
      <details>
        <summary>Literal observations and mappings</summary>
        <p>
          These are source observations. Grouped clauses above must not be
          treated as separate evaluated keywords.
        </p>
        <ol>
          {document.requirements.map((item) => (
            <li key={item.id}>
              <h4>
                {item.type}: {item.value}
              </h4>
              <StoredMapping value={item.value} mapping={item.mapping} />
              <blockquote
                style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
              >
                {item.evidence.quote}
              </blockquote>
              <p>
                JD characters {item.evidence.start}–{item.evidence.end}
              </p>
              {item.tokenEvidence.length > 0 && (
                <p>
                  Literal tokens:{" "}
                  {item.tokenEvidence.map((span) => span.quote).join(", ")}
                </p>
              )}
            </li>
          ))}
        </ol>
      </details>
      <details>
        <summary>Retained source clauses</summary>
        <ul>
          {document.retainedClauses.map((clause) => (
            <li key={`${clause.evidence.start}:${clause.evidence.end}`}>
              <blockquote
                style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
              >
                {clause.evidence.quote}
              </blockquote>
              <p>
                {reviewReason(clause.interpretation)}; review required. JD
                characters {clause.evidence.start}–{clause.evidence.end}
              </p>
            </li>
          ))}
        </ul>
      </details>
      <details style={{ overflowWrap: "anywhere" }}>
        <summary>Stored JD version and policies</summary>
        <dl>
          <dt>Stored version</dt>
          <dd>{document.id}</dd>
          <dt>Schema</dt>
          <dd>{document.schemaVersion}</dd>
          <dt>Producer</dt>
          <dd>{document.producerVersion}</dd>
          <dt>Source fingerprint</dt>
          <dd>{document.inputSha256}</dd>
          <dt>Locale and domain</dt>
          <dd>
            {document.locale}; {document.domain}
          </dd>
          <dt>Alias policy</dt>
          <dd>{document.mappingPolicy.version}</dd>
          <dt>Alias policy fingerprint</dt>
          <dd>{document.mappingPolicy.lexiconSha256}</dd>
          <dt>Relation policy</dt>
          <dd>{document.relationPolicy.version}</dd>
          <dt>Relation policy fingerprint</dt>
          <dd>{document.relationPolicy.sha256}</dd>
        </dl>
        <p>
          Mappings and interpretations belong to this saved version. No external
          taxonomy or scoring authority is claimed.
        </p>
        {document.warnings.length > 0 && (
          <ul>
            {document.warnings.map((warning) => (
              <li key={warning}>
                {warning === "local_alias_policy_not_admitted"
                  ? "Local alias mapping still needs review and scoring adoption."
                  : reviewReason(warning)}
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
export default function JobRequirements() {
  const model = useLoaderData<typeof loader>(),
    feedback = useActionData<typeof action>(),
    busy = useNavigation().state !== "idle";
  const doc = model.current?.document;
  const historical = Boolean(doc && doc.id !== model.headId);
  const typedSavingPaused =
    doc?.schemaVersion === "requirements/2.0.0" &&
    !model.jobRelationsWriterEnabled;
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
      {doc && (
        <p role="status">
          {historical
            ? `Historical JD version ${model.current!.revision}. This saved snapshot is read-only.`
            : `Current JD version ${model.current!.revision}.`}
        </p>
      )}
      {historical ? (
        <Link
          to={`/analysis/${model.analysisId}/requirements`}
          className="back-button"
        >
          Review current JD version
        </Link>
      ) : typedSavingPaused ? (
        <p role="status">
          Saving typed JD updates is paused. This saved version remains
          available for review.
        </p>
      ) : (
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
      )}
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
          {doc.schemaVersion === "requirements/2.0.0" ? (
            <TypedRequirementsReview document={doc} />
          ) : (
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
          )}
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
