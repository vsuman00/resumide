const stages = [
  {
    title: "Secure upload",
    description: "Validate and save your document",
  },
  {
    title: "Extract and parse",
    description: "Read text and inspect its structure",
  },
  {
    title: "Score evidence",
    description: "Run deterministic compatibility checks",
  },
  {
    title: "Generate feedback",
    description: "Prepare grounded writing suggestions",
  },
  {
    title: "Save result",
    description: "Make your analysis available to review",
  },
] as const;

const activeStageByStatus: Record<string, number> = {
  created: 0,
  uploading: 0,
  quarantined: 0,
  queued: 0,
  extracting: 1,
  scoring: 2,
  qualitative_review: 3,
};

function formatUpdatedAt(updatedAt: string) {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "Updated recently";
  return (
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      hour: "numeric",
      minute: "2-digit",
    }).format(date) + " UTC"
  );
}

export function StageTimeline({
  status,
  updatedAt,
}: {
  status: string;
  updatedAt: string;
}) {
  const isCompleted = status === "completed";
  const isPartial = status === "partial";
  const needsReview = status === "needs_ocr";
  const isStopped = ["failed", "cancelled", "rejected"].includes(status);
  const activeStage = activeStageByStatus[status];

  return (
    <ol className="stage-timeline" aria-label="Analysis stages">
      {stages.map((stage, index) => {
        const isCurrent = activeStage === index;
        const isComplete =
          isCompleted || isPartial
            ? true
            : needsReview
              ? index === 0
              : activeStage !== undefined && index < activeStage;
        const isPartialStage = isPartial && index === 3;
        const isReviewStage = needsReview && index === 1;
        const state = isCurrent
          ? "is-current"
          : isPartialStage || isReviewStage
            ? "is-partial"
            : isComplete
              ? "is-complete"
              : "";

        return (
          <li
            key={stage.title}
            className={state}
            aria-current={isCurrent ? "step" : undefined}
          >
            <span className="stage-timeline-indicator" aria-hidden="true" />
            <div>
              <div className="stage-timeline-title-row">
                <strong>{stage.title}</strong>
                {isCurrent ? (
                  <time dateTime={updatedAt}>{formatUpdatedAt(updatedAt)}</time>
                ) : null}
                {isPartialStage ? <span>Unavailable</span> : null}
                {isReviewStage ? <span>Needs review</span> : null}
              </div>
              <p>{stage.description}</p>
              <span className="sr-only">
                {isCurrent
                  ? "Current stage"
                  : isPartialStage
                    ? "Unavailable"
                    : isReviewStage
                      ? "Needs review"
                      : isComplete
                        ? "Complete"
                        : needsReview
                          ? "Blocked pending evidence review"
                          : isStopped
                            ? "Not completed"
                            : "Pending"}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
