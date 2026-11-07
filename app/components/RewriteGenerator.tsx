import { useFetcher } from "react-router";

export default function RewriteGenerator({
  analysisId,
}: {
  analysisId: string;
}) {
  const fetcher = useFetcher<{
    ok?: boolean;
    error?: string;
    bulletCount?: number;
  }>();
  const busy = fetcher.state !== "idle";
  return (
    <section
      className="rewrite-generator"
      aria-labelledby="generate-rewrite-heading"
    >
      <h2 id="generate-rewrite-heading">Generate grounded suggestions</h2>
      <p>
        Use this analysis's saved resume and job description to improve the
        wording of supported contributions. Review each suggestion before using
        it.
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
          ? "Generating and checking source evidence. This may take a few seconds."
          : fetcher.data?.ok
            ? "Suggestions saved. Review the source and proposed wording below."
            : null}
      </div>
      {!busy && fetcher.data?.error ? (
        <p role="alert" className="field-error">
          {fetcher.data.error}
        </p>
      ) : null}
    </section>
  );
}
