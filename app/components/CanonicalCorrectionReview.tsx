import { useId, useState } from "react";
import { Form, Link } from "react-router";
import type {
  CanonicalCorrectionAssignmentSelector,
  CanonicalCorrectionCommand,
  CanonicalCorrectionWorkspace,
  CanonicalCorrectionWorkspaceBinding,
  CanonicalCorrectionWorkspaceItem,
} from "~/lib/server/canonical-correction-commands";

type Props = {
  corrections: CanonicalCorrectionWorkspace["corrections"];
  analysisId: string;
  editable: boolean;
  busy: boolean;
  onSubmit?: () => void;
};

function commandBinding(
  binding: CanonicalCorrectionWorkspaceBinding,
  idempotencyKey: string,
) {
  return {
    schemaVersion: "candidate-correction-command/1.0.0" as const,
    idempotencyKey,
    sourceId: binding.sourceId,
    attemptId: binding.attemptId,
    inputSha256: binding.inputSha256,
    evidenceSchemaVersion: binding.evidenceSchemaVersion,
    fieldExtractorVersion: binding.fieldExtractorVersion,
    targetModelVersion: binding.targetModelVersion,
    projectionModelVersion: binding.projectionModelVersion,
    admissionPolicyVersion: binding.admissionPolicyVersion,
    expectedReviewRevision: binding.reviewRevision,
    expectedAssignmentRevision: binding.assignmentRevision,
    expectedVersionId: binding.canonicalHeadId,
    acknowledgement: true as const,
  };
}

const statusText: Record<CanonicalCorrectionWorkspaceItem["state"], string> = {
  needs_assignment:
    "Choose the source and resume target before applying this correction.",
  ready_to_apply: "The target is saved. Review the change before applying it.",
  requires_add: "This correction needs an explicit place in your resume.",
  needs_reassignment:
    "Choose the target again for the latest version, then review reapplying the correction.",
  needs_reapply:
    "The new target is saved. Reapply only after reviewing this version.",
  applied: "This correction is included in the current version.",
  blocked: "Resolve the source review before applying this correction.",
  stale:
    "This correction belongs to an earlier source review. Reload the latest review.",
  superseded:
    "A later correction replaces this proposal. It remains in your history.",
};

function CorrectionItem({
  item,
  binding,
  analysisId,
  disabled,
  onSubmit,
}: {
  item: CanonicalCorrectionWorkspaceItem;
  binding: CanonicalCorrectionWorkspaceBinding;
  analysisId: string;
  disabled: boolean;
  onSubmit?: () => void;
}) {
  const fieldId = useId();
  const [keys] = useState(() => ({ ...item.actionKeys }));
  const [selectedId, select] = useState("");
  const [placementId, place] = useState("");
  const [acknowledged, acknowledge] = useState(false);
  const option = item.assignmentOptions.find(
    (choice) => choice.id === selectedId,
  );
  const placement = item.placementOptions.find(
    (choice) => choice.id === placementId,
  );
  const needsPlacement = option?.selector.mappingMode === "add";
  const needsAssignment = [
    "needs_assignment",
    "requires_add",
    "needs_reassignment",
  ].includes(item.state);
  const actionable =
    item.event.operation === "correct" && item.proposedValue !== null;
  let command: CanonicalCorrectionCommand | null = null;
  if (
    actionable &&
    needsAssignment &&
    option &&
    (!needsPlacement || placement)
  ) {
    const selector: CanonicalCorrectionAssignmentSelector = {
      ...option.selector,
      ...(needsPlacement && placement ? { location: placement.location } : {}),
    };
    command = {
      ...commandBinding(binding, keys.assign),
      kind: "assign",
      selectors: [selector],
    };
  } else if (
    actionable &&
    item.assignment &&
    (item.state === "ready_to_apply" || item.state === "needs_reapply")
  ) {
    const kind =
      item.state === "needs_reapply"
        ? "reapply"
        : item.assignment.mappingMode === "add"
          ? "add"
          : "apply";
    if (kind !== "reapply" || item.priorApplicationId) {
      command = {
        ...commandBinding(binding, keys[kind]),
        kind,
        selectors: [
          {
            assignmentId: item.assignment.id,
            priorApplicationId:
              kind === "reapply" ? item.priorApplicationId : null,
          },
        ],
      };
    }
  }
  const canSubmit = !disabled && acknowledged && command !== null;
  const buttonText = needsAssignment
    ? "Save correction target"
    : command?.kind === "add"
      ? "Add correction as a fact"
      : item.state === "needs_reapply"
        ? "Reapply correction"
        : "Apply correction";
  const showForm =
    actionable &&
    (needsAssignment ||
      item.state === "ready_to_apply" ||
      item.state === "needs_reapply");
  return (
    <article
      className="account-card canonical-correction-card"
      aria-labelledby={`${fieldId}-heading`}
    >
      <h3 id={`${fieldId}-heading`}>
        {item.event.field.replaceAll("_", " ")} correction
      </h3>
      <p>Your saved correction · review {item.event.revision}</p>
      <p>
        <time dateTime={item.event.created_at}>{item.event.created_at}</time>
      </p>
      <dl>
        <dt>Current resume value</dt>
        <dd>{item.currentValue ?? "No current value"}</dd>
        <dt>Proposed value</dt>
        <dd>{item.proposedValue ?? "No replacement proposed"}</dd>
      </dl>
      <p>{statusText[item.state]}</p>
      <p>
        Applying a correction saves an unconfirmed fact. Confirm the new fact
        separately in the resume workspace.
      </p>
      {item.sourceChoices.length > 0 && (
        <section aria-label="Source context">
          <h4>Original source context</h4>
          {item.sourceChoices.map((choice) => (
            <div key={choice.targetId}>
              <p>{choice.label}</p>
              {choice.quote !== null && <blockquote>{choice.quote}</blockquote>}
              <ul>
                {choice.references.map((reference, index) => (
                  <li key={`${reference.spanId}-${index}`}>
                    <Link
                      to={`/analysis/${analysisId}/evidence#source-${encodeURIComponent(reference.spanId)}`}
                    >
                      View cited source (
                      {reference.method === "local_ocr"
                        ? "local OCR"
                        : "native text"}
                      , characters {reference.start}–{reference.end})
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      {item.assignment && (
        <>
          <p>
            Saved target: <strong>{item.assignment.label}</strong>
          </p>
          <p>Target saved in choice revision {item.assignment.revision}.</p>
        </>
      )}
      {item.applications.some((application) => !application.active) && (
        <p>
          An earlier application is not active in this version. Reapplying
          requires your review.
        </p>
      )}
      {item.applications.some((application) => application.active) && (
        <p>
          The current version retains this correction's application history.
        </p>
      )}
      {showForm && (
        <Form
          method="post"
          onSubmit={(event) => {
            if (!canSubmit) event.preventDefault();
            else onSubmit?.();
          }}
        >
          <input type="hidden" name="operation" value="correction" />
          <input
            type="hidden"
            name="command"
            value={command ? JSON.stringify(command) : ""}
          />
          {needsAssignment && (
            <>
              <label htmlFor={`${fieldId}-target`}>
                Choose the source and resume target
              </label>
              <select
                id={`${fieldId}-target`}
                value={selectedId}
                onChange={(event) => {
                  select(event.target.value);
                  place("");
                  acknowledge(false);
                }}
                disabled={disabled}
                required
              >
                <option value="">Choose a target</option>
                {item.assignmentOptions.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
              {option && <p>Selected target · {option.label}</p>}
              {item.assignmentOptions.length === 0 && (
                <p>
                  No safe target is available. Review the source evidence before
                  applying this correction.
                </p>
              )}
              {needsPlacement && (
                <>
                  <label htmlFor={`${fieldId}-placement`}>
                    Choose where to add the fact
                  </label>
                  <select
                    id={`${fieldId}-placement`}
                    value={placementId}
                    onChange={(event) => {
                      place(event.target.value);
                      acknowledge(false);
                    }}
                    disabled={disabled}
                    required
                  >
                    <option value="">Choose a placement</option>
                    {item.placementOptions.map((choice) => (
                      <option key={choice.id} value={choice.id}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </>
          )}
          <label
            className="canonical-correction-acknowledgement"
            htmlFor={`${fieldId}-acknowledgement`}
          >
            <input
              id={`${fieldId}-acknowledgement`}
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => acknowledge(event.target.checked)}
              disabled={disabled}
              required
            />
            I reviewed this target and proposed change.
          </label>
          <button type="submit" className="back-button" disabled={!canSubmit}>
            {buttonText}
          </button>
        </Form>
      )}
    </article>
  );
}

function BoundReview({
  corrections,
  analysisId,
  editable,
  busy,
  onSubmit,
}: Props) {
  const disabled = busy || !editable || !corrections.writeReady;
  return (
    <section aria-labelledby="canonical-corrections-heading" aria-busy={busy}>
      <h2 id="canonical-corrections-heading">Saved evidence corrections</h2>
      <p>
        Review each saved correction and its target before creating a new resume
        version. Original evidence stays in your source review.
      </p>
      {!corrections.writeReady && (
        <p role="status">
          Saved corrections are available to review. Applying them is
          temporarily unavailable. Reload the latest review to try again.
        </p>
      )}
      {!editable && (
        <p role="status">Open the latest version to apply a correction.</p>
      )}
      <Link to={`/analysis/${analysisId}/canonical`} reloadDocument>
        Reload correction review
      </Link>
      {corrections.snapshot.state === "legacy_unrecorded" && (
        <p>
          This version predates correction tracking. Review each target before
          applying a saved correction.
        </p>
      )}
      {corrections.snapshot.restoredFromVersionId !== null && (
        <p>
          Restored versions keep the correction history. Corrections are not
          automatically reapplied.
        </p>
      )}
      {corrections.items.length === 0 ? (
        <p>No saved evidence corrections need review.</p>
      ) : (
        corrections.items.map((item) => (
          <CorrectionItem
            key={item.event.id}
            item={item}
            binding={corrections.binding}
            analysisId={analysisId}
            disabled={disabled}
            onSubmit={onSubmit}
          />
        ))
      )}
    </section>
  );
}

/** A new source/review/assignment/head binding clears acknowledgements and choices.
 * Revalidation of that same binding preserves each form's original operation key. */
export default function CanonicalCorrectionReview(props: Props) {
  return (
    <BoundReview key={JSON.stringify(props.corrections.binding)} {...props} />
  );
}
