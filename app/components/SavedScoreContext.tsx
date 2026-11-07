import styles from "./SavedScoreContext.module.css";

export default function SavedScoreContext({
  createdAt,
  scoringVersion,
  modelRatingsExcluded,
}: {
  createdAt?: string;
  scoringVersion?: string | null;
  modelRatingsExcluded: boolean;
}) {
  const date = createdAt ? new Date(createdAt) : null;
  const validDate = date && Number.isFinite(date.getTime());
  return (
    <details className={styles.context}>
      <summary>How this saved score was calculated</summary>
      <p>
        This number is a resume checklist result, not a percentage of job
        requirements met or a score from an employer's ATS.
      </p>
      <p>
        {modelRatingsExcluded
          ? "Only resume checks contributed to this saved score. AI writing feedback did not change the number."
          : "This older result combined resume checks and AI ratings. Its method differs from current analyses."}
      </p>
      <p>
        Different versions use different checks, so their numbers cannot be
        compared directly. Start a new analysis to run the latest checks.
      </p>
      <dl>
        <div>
          <dt>Saved</dt>
          <dd>
            {validDate ? (
              <time dateTime={createdAt}>
                {new Intl.DateTimeFormat("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Kolkata",
                }).format(date)}{" "}
                IST
              </time>
            ) : (
              "Date unavailable"
            )}
          </dd>
        </div>
        <div>
          <dt>Rules version</dt>
          <dd>
            <code>{scoringVersion ?? "Not recorded"}</code>
          </dd>
        </div>
      </dl>
    </details>
  );
}
