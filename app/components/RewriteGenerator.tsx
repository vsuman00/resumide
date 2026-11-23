import { useFetcher } from "react-router";

const failureMessages = new Map<string, string>([
  ["unauthenticated", "Sign in to request writing suggestions."],
  ["AI_DISABLED", "Writing generation is disabled on this server."],
  [
    "AI_PROVIDER_UNAVAILABLE",
    "Writing suggestions are unavailable from the AI provider. Review any saved drafts.",
  ],
  [
    "AI_PROVIDER_AUTH",
    "Writing suggestions are unavailable for this deployment. Review any saved drafts.",
  ],
  [
    "AI_PROVIDER_TRANSIENT",
    "The AI service had a temporary problem. Review any saved drafts and try again later.",
  ],
  [
    "AI_REFUSED",
    "The AI provider declined this writing request. Review any saved drafts.",
  ],
  [
    "AI_RATE_LIMITED",
    "Writing requests are temporarily limited. Wait before trying again.",
  ],
  [
    "AI_TIMEOUT",
    "Writing generation timed out. Review any saved drafts before trying again.",
  ],
  [
    "AI_CANCELLED",
    "The writing request was cancelled. Review any saved drafts.",
  ],
  [
    "AI_OUTPUT_INVALID",
    "The AI response could not be used safely. Review any saved drafts.",
  ],
  [
    "AI_BUDGET_EXHAUSTED",
    "The writing service has no capacity for another request. Review any saved drafts.",
  ],
  [
    "AI_BUDGET_BLOCKED",
    "The writing service has no capacity for another request. Review any saved drafts.",
  ],
  [
    "AI_BUDGET_CONFLICT",
    "This writing request cannot run again. Reload to review any saved draft.",
  ],
  [
    "AI_BUDGET_STATE",
    "This writing request cannot run again. Reload to review any saved draft.",
  ],
]);

export default function RewriteGenerator({
  analysisId,
}: {
  analysisId: string;
}) {
  const fetcher = useFetcher<{
    ok?: boolean;
    code?: string;
    error?: string;
    bulletCount?: number;
  }>();
  const busy = fetcher.state !== "idle";
  const failureMessage =
    typeof fetcher.data?.code === "string"
      ? (failureMessages.get(fetcher.data.code) ?? fetcher.data.error)
      : fetcher.data?.error;
  return (
    <section
      className="rewrite-generator"
      aria-labelledby="generate-rewrite-heading"
    >
      <h2 id="generate-rewrite-heading">Generate writing drafts</h2>
      <p>
        Use this analysis's saved resume and job description to draft wording.
        Compare each draft with the original text and check every fact before
        saving an edit.
      </p>
      <fetcher.Form
        method="post"
        action={`/resume/${analysisId}/rewrite`}
        aria-busy={busy}
      >
        <label className="rewrite-consent">
          <input
            type="checkbox"
            name="aiConsent"
            value="accepted"
            required
            disabled={busy}
          />
          <span>
            I agree to send the saved resume and job description to the AI
            provider for writing suggestions.
          </span>
        </label>
        <button type="submit" className="primary-button w-fit" disabled={busy}>
          {busy ? "Generating suggestions…" : "Generate suggestions"}
        </button>
      </fetcher.Form>
      <div aria-live="polite" role="status">
        {busy
          ? "Generating writing drafts. This may take a few seconds."
          : fetcher.data?.ok
            ? "Writing drafts saved for review. Review and save resume edits in the resume workspace."
            : null}
      </div>
      {!busy && fetcher.data?.error ? (
        <div>
          <p role="alert" className="field-error">
            {failureMessage}
          </p>
          {fetcher.data.code === "unauthenticated" && (
            <a
              href={`/auth?next=${encodeURIComponent(`/resume/${analysisId}`)}`}
              target="_blank"
              rel="noopener"
            >
              Sign in in a new tab
            </a>
          )}
        </div>
      ) : null}
    </section>
  );
}
