import { useState } from "react";

const ResumeWriter = ({
  writer,
  unavailable = false,
}: {
  writer?: ResumeWriter;
  unavailable?: boolean;
}) => {
  const [copied, setCopied] = useState<{
    key: string;
    text: string;
  } | null>(null);
  const [copyError, setCopyError] = useState("");

  const copySuggestion = async (key: string, text: string) => {
    setCopied(null);
    setCopyError("");
    try {
      if (!navigator.clipboard) {
        throw new Error("Copy is not available in this browser.");
      }
      await navigator.clipboard.writeText(text);
      setCopied({ key, text });
      setCopyError("");
    } catch (error) {
      setCopyError(
        error instanceof Error
          ? error.message
          : "Unable to copy the suggestion.",
      );
    }
  };

  if (!writer || (!writer.summary && writer.bullets.length === 0)) {
    return (
      <section
        className="rewrite-empty-state"
        aria-labelledby="rewrite-heading"
      >
        <p className="workspace-eyebrow">Writing drafts</p>
        <h2 id="rewrite-heading">
          {unavailable
            ? "Writing generation did not complete"
            : "No rewrite was saved"}
        </h2>
        <p>
          {unavailable
            ? "Writing could not be completed for this analysis. You can retry with Generate suggestions above."
            : "No suggestions are saved for this analysis yet. Use Generate suggestions above to try with this saved resume and job description."}
        </p>
        <div className="rewrite-empty-actions">
          <a href="#overview" className="back-button w-fit">
            Review available feedback
          </a>
          <a href="/upload" className="back-button w-fit">
            Start a new analysis
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="rewrite-diff" aria-labelledby="rewrite-heading">
      <div className="result-section-heading">
        <div>
          <p className="workspace-eyebrow">Writing drafts</p>
          <h2 id="rewrite-heading">Review writing drafts</h2>
        </div>
      </div>
      <p className="rewrite-intro">
        These saved writing drafts still need review. Compare them with the
        original text and check every fact before using them.
      </p>
      <p className="rewrite-intro">
        This saved legacy draft has no canonical resume or job-requirement
        version binding. Its source support and relationship to the current
        versions are unknown.
      </p>
      <p id="rewrite-copy-note" className="rewrite-intro">
        Copy a draft to your clipboard. Review and save resume edits in the
        resume workspace, where you confirm the facts.
      </p>
      {unavailable ? (
        <p role="status">
          Writing generation did not complete. Your saved drafts remain
          available to review.
        </p>
      ) : null}
      {copyError ? (
        <p className="field-error" role="alert">
          {copyError}
        </p>
      ) : null}

      {writer.summary ? (
        <article className="rewrite-summary">
          <div className="rewrite-row-heading">
            <div>
              <p>Professional summary</p>
              <span>Suggested wording</span>
            </div>
            <button
              type="button"
              className="rewrite-copy-button"
              aria-describedby="rewrite-copy-note"
              onClick={() => copySuggestion("summary", writer.summary!)}
            >
              {copied?.key === "summary" && copied.text === writer.summary
                ? "Copied"
                : "Copy"}
            </button>
          </div>
          <p>{writer.summary}</p>
        </article>
      ) : null}

      {writer.bullets.length > 0 ? (
        <div className="rewrite-bullet-list">
          <h3>Experience bullets</h3>
          {writer.bullets.map((bullet, index) => {
            const key = `bullet-${index}`;
            return (
              <article
                key={`${bullet.original}-${bullet.rewrite}-${index}`}
                className="rewrite-bullet"
              >
                <div className="rewrite-source-copy">
                  <span>Original</span>
                  <p>{bullet.original}</p>
                </div>
                <div className="rewrite-proposed-copy">
                  <div className="rewrite-row-heading">
                    <span>Suggested</span>
                    <button
                      type="button"
                      className="rewrite-copy-button"
                      aria-describedby="rewrite-copy-note"
                      onClick={() => copySuggestion(key, bullet.rewrite)}
                    >
                      {copied?.key === key && copied.text === bullet.rewrite
                        ? "Copied"
                        : "Copy"}
                    </button>
                  </div>
                  <p>{bullet.rewrite}</p>
                  <small>{bullet.reasoning}</small>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
};

export default ResumeWriter;
