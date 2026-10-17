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
  correctEvidenceReview,
  EvidenceReviewError,
  loadEvidenceReview,
  readEvidenceCorrectionForm,
} from "~/lib/server/evidence-review";
import { CRITICAL_FIELDS } from "~/lib/server/evidence-fields";
import { PublicApiError } from "~/lib/server/errors";

type Args = { request: Request; params: { id?: string } };
const privateHeaders = () =>
  new Headers({
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
  });
// Document SSR responses require an explicit route header export; data headers
// alone only cover data requests. Preserve session refresh cookies on every path.
export const headers: HeadersFunction = ({
  parentHeaders,
  loaderHeaders,
  actionHeaders,
  errorHeaders,
}) => {
  const result = new Headers(parentHeaders);
  for (const source of [loaderHeaders, actionHeaders, errorHeaders]) {
    if (!source) continue;
    for (const [key, value] of source)
      if (key.toLowerCase() !== "set-cookie") result.set(key, value);
    for (const cookie of source.getSetCookie())
      result.append("Set-Cookie", cookie);
  }
  result.set("Cache-Control", "private, no-store");
  result.set("X-Robots-Tag", "noindex, nofollow");
  return result;
};
export async function loader({ request, params }: Args) {
  const headers = privateHeaders();
  const user = await getAuthenticatedUser(
    createSupabaseServerClient(request, headers),
  );
  if (!user)
    throw redirect(
      `/auth?next=${encodeURIComponent(`/analysis/${params.id ?? ""}/evidence`)}`,
      { headers },
    );
  try {
    const review = await loadEvidenceReview(
      createSupabaseAdminClient(),
      params.id ?? "",
      user.id,
    );
    return data(
      {
        ...review,
        scoringDiagnosticsEnabled: getServerConfig().SCORING_V2_ENABLED,
        canonicalEnabled: getServerConfig().CANONICAL_AUTHORING_ENABLED,
        jobReviewEnabled: getServerConfig().JOB_INTELLIGENCE_ENABLED,
        formKeys: Object.fromEntries(
          CRITICAL_FIELDS.map((field) => [
            field,
            {
              correct: randomUUID(),
              confirm: Object.fromEntries(
                review.evidence.assertions
                  .filter((candidate) => candidate.field === field)
                  .map((candidate) => [candidate.id, randomUUID()]),
              ),
            },
          ]),
        ),
      },
      { headers },
    );
  } catch (error) {
    throw data(
      {
        error:
          error instanceof EvidenceReviewError
            ? error.message
            : "Evidence is unavailable. Try again later.",
      },
      {
        status: error instanceof EvidenceReviewError ? error.status : 503,
        headers,
      },
    );
  }
}
export async function action({ request, params }: Args) {
  const headers = privateHeaders();
  try {
    if (request.method !== "POST")
      return data(
        { error: "Submit a review using POST.", success: null },
        { status: 405, headers },
      );
    assertSameOrigin(request, getServerConfig().APP_ORIGIN);
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, headers),
    );
    if (!user)
      return data(
        { error: "Sign in to review your evidence.", success: null },
        { status: 401, headers },
      );
    const input = await readEvidenceCorrectionForm(request);
    await correctEvidenceReview(
      createSupabaseAdminClient(),
      params.id ?? "",
      user.id,
      input,
      randomUUID(),
    );
    return data(
      {
        error: null,
        success:
          "Your review was saved separately from the original extraction. This evidence remains unscored.",
      },
      { headers },
    );
  } catch (error) {
    const status =
      error instanceof EvidenceReviewError
        ? error.status
        : error instanceof PublicApiError
          ? error.status
          : 503;
    const message =
      error instanceof EvidenceReviewError || error instanceof PublicApiError
        ? error.message
        : "The review could not be saved. Retry the same submission.";
    return data({ error: message, success: null }, { status, headers });
  }
}
export function meta() {
  return [
    { title: "Resumide | Review document evidence" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export default function AnalysisEvidence() {
  const review = useLoaderData<typeof loader>();
  const feedback = useActionData<typeof action>();
  const busy = useNavigation().state === "submitting";
  return (
    <WorkspaceShell
      eyebrow="Document evidence"
      title="Review your extracted information"
      description="Review source candidates and record your own corrections. Original extraction remains unchanged, confidence is uncalibrated, and no score is available."
    >
      <p role="status">
        Evidence state: {review.evidence.status.replaceAll("_", " ")}. Review
        revision {review.revision}. Scoring is unavailable.
      </p>
      {feedback ? (
        <p role={feedback.error ? "alert" : "status"} aria-live="polite">
          {feedback.error ?? feedback.success}
        </p>
      ) : null}
      <Link
        to={`/analysis/${review.analysisId}/evidence`}
        reloadDocument
        className="back-button"
      >
        Reload latest evidence
      </Link>
      {review.scoringDiagnosticsEnabled && (
        <Link to={`/analysis/${review.analysisId}/score`}>
          Review scoring diagnostics
        </Link>
      )}
      {review.canonicalEnabled ? (
        <Link
          to={`/analysis/${review.analysisId}/canonical`}
          className="back-button"
        >
          Review structured resume
        </Link>
      ) : null}
      {review.jobReviewEnabled ? (
        <Link
          to={`/analysis/${review.analysisId}/requirements`}
          className="back-button"
        >
          Review job description
        </Link>
      ) : null}
      <section aria-labelledby="original-evidence-heading">
        <h2 id="original-evidence-heading">Original extracted candidates</h2>
        <p>
          Confirm only values supported by the cited source. Your confirmation
          records your decision; it does not validate OCR accuracy.
        </p>
        {review.evidence.fields.map((field) => (
          <section
            key={field.field}
            aria-labelledby={`field-${field.field}`}
            className="account-card"
          >
            <h3 id={`field-${field.field}`}>
              {field.field === "dates"
                ? "Employment dates"
                : field.field.charAt(0).toUpperCase() + field.field.slice(1)}
            </h3>
            <p>Extraction state: {field.state.replaceAll("_", " ")}</p>
            {review.evidence.assertions
              .filter((candidate) => candidate.field === field.field)
              .map((candidate) => (
                <article
                  key={candidate.id}
                  aria-label={`${field.field} candidate`}
                >
                  <p>
                    <strong>{candidate.value}</strong>
                  </p>
                  <ul>
                    {candidate.evidence.map((citation, index) => {
                      const source = review.evidence.spans.find(
                        (span) => span.id === citation.spanId,
                      )!;
                      return (
                        <li key={`${citation.spanId}-${index}`}>
                          <a href={`#source-${source.id}`}>
                            {source.pageId},{" "}
                            {source.method === "local_ocr"
                              ? "local OCR"
                              : "native text"}
                            , characters {citation.start}–{citation.end}
                          </a>
                          <blockquote>
                            {Array.from(source.text)
                              .slice(citation.start, citation.end)
                              .join("")}
                          </blockquote>
                        </li>
                      );
                    })}
                  </ul>
                  <Form method="post">
                    <input
                      type="hidden"
                      name="attemptId"
                      value={review.attemptId}
                    />
                    <input
                      type="hidden"
                      name="expectedRevision"
                      value={review.revision}
                    />
                    <input type="hidden" name="field" value={field.field} />
                    <input type="hidden" name="operation" value="confirm" />
                    <input type="hidden" name="value" value={candidate.value} />
                    <input
                      type="hidden"
                      name="candidateId"
                      value={candidate.id}
                    />
                    <input
                      type="hidden"
                      name="idempotencyKey"
                      value={review.formKeys[field.field].confirm[candidate.id]}
                    />
                    <button
                      type="submit"
                      className="back-button"
                      disabled={busy}
                    >
                      Confirm {candidate.value}
                    </button>
                  </Form>
                </article>
              ))}
            {!review.evidence.assertions.some(
              (candidate) => candidate.field === field.field,
            ) ? (
              <p>No candidate was extracted for this field.</p>
            ) : null}
            <Form method="post">
              <input type="hidden" name="attemptId" value={review.attemptId} />
              <input
                type="hidden"
                name="expectedRevision"
                value={review.revision}
              />
              <input type="hidden" name="field" value={field.field} />
              <input type="hidden" name="operation" value="correct" />
              <input type="hidden" name="candidateId" value="" />
              <input
                type="hidden"
                name="idempotencyKey"
                value={review.formKeys[field.field].correct}
              />
              <label htmlFor={`correct-${field.field}`}>
                Your correction for {field.field} (up to 500 characters)
              </label>
              <textarea
                id={`correct-${field.field}`}
                name="value"
                maxLength={500}
                required
              />
              <button type="submit" className="back-button" disabled={busy}>
                Save {field.field} correction
              </button>
            </Form>
          </section>
        ))}
      </section>
      <section aria-labelledby="review-history-heading">
        <h2 id="review-history-heading">Your review history</h2>
        <p>
          These owner decisions are separate from source assertions and do not
          calibrate confidence or enable scoring.
        </p>
        {review.corrections.length ? (
          <ol>
            {review.corrections.map((event) => (
              <li key={event.id}>
                Revision {event.revision}: {event.field}{" "}
                {event.operation === "confirm" ? "confirmed" : "corrected"} as{" "}
                <strong>{event.value}</strong>{" "}
                <time dateTime={event.created_at}>{event.created_at}</time>
                {event.attempt_id !== review.attemptId
                  ? " (earlier extraction attempt)"
                  : ""}
              </li>
            ))}
          </ol>
        ) : (
          <p>No owner reviews have been recorded.</p>
        )}
      </section>
      <section aria-labelledby="source-text-heading">
        <h2 id="source-text-heading">Immutable source text</h2>
        {review.evidence.spans.map((span) => (
          <details key={span.id} id={`source-${span.id}`}>
            <summary>
              {span.pageId}:{" "}
              {span.method === "local_ocr" ? "local OCR" : "native text"};
              characters {span.start}–{span.end}
            </summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>{span.text}</pre>
          </details>
        ))}
      </section>
    </WorkspaceShell>
  );
}
export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <WorkspaceShell
      eyebrow="Document evidence"
      title="Evidence unavailable"
      description="Your document has not been scored."
    >
      <p role="alert">
        {isRouteErrorResponse(error) && typeof error.data?.error === "string"
          ? error.data.error
          : "Evidence could not be loaded safely."}
      </p>
      <Link to="/upload" className="back-button">
        Return to uploads
      </Link>
    </WorkspaceShell>
  );
}
