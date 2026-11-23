import { useEffect, useId, useRef, useState, type Ref } from "react";
import type {
  TypedAuthoringCommand,
  TypedAuthoringPatch,
  TypedAuthoringReceipt,
  TypedAuthoringReason,
  TypedAuthoringSelection,
  TypedAuthoringProposal,
  TypedAuthoringWorkspace,
} from "~/lib/server/typed-authoring-protocol";

export type TypedAuthoringPreparedReview = TypedAuthoringProposal;
type TypedAuthoringPreviewResult =
  TypedAuthoringPreparedReview | "stale_inputs";
export type TypedAuthoringDecisionResult =
  | { kind: "applied"; receipt: TypedAuthoringReceipt }
  | {
      kind: "error";
      reason: TypedAuthoringReason;
      recovery: "retry_exact" | "review_again" | "unavailable";
    };
export type TypedAuthoringReviewProps = {
  workspace: TypedAuthoringWorkspace;
  busy?: boolean;
  onRequestProposal: (
    selection: TypedAuthoringSelection,
  ) => Promise<TypedAuthoringPreviewResult>;
  onDecision: (
    command: TypedAuthoringCommand,
    reviewAcknowledgement: "accepted" | null,
  ) => Promise<TypedAuthoringDecisionResult>;
  onUndo?: (receipt: TypedAuthoringReceipt) => Promise<void>;
};
type Submission = {
  review: TypedAuthoringPreparedReview;
  command: TypedAuthoringCommand;
};
const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  )
    return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => same(value, b[index]))
    );
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.keys(left).every(
      (key) => Object.hasOwn(right, key) && same(left[key], right[key]),
    )
  );
};
function validReview(
  review: TypedAuthoringPreparedReview,
  selection: TypedAuthoringSelection,
  workspace: TypedAuthoringWorkspace,
  before: string,
) {
  const binding = workspace.binding;
  if (
    !review ||
    !review.patch ||
    !review.acceptCommand ||
    !review.rejectCommand
  )
    return false;
  const patch = review.patch;
  if (
    !["typed-authoring-patch/1.0.0", "typed-authoring-patch/1.1.0"].includes(
      patch.schemaVersion,
    ) ||
    !same(patch.selection, selection) ||
    !same(patch.binding, binding) ||
    patch.diagnosticDigest !== workspace.diagnosticDigest ||
    patch.coverageDigest !== workspace.coverageDigest ||
    patch.semanticDigest !== workspace.semanticDigest ||
    patch.before !== before ||
    typeof patch.after !== "string" ||
    !patch.after ||
    patch.after === patch.before ||
    patch.scoreValue !== null ||
    patch.scoreDelta !== null ||
    patch.target?.factId !== selection.targetFactId ||
    patch.support?.sourceClause !== null ||
    patch.support?.offsetSpace !== "current_fact"
  )
    return false;
  if (
    patch.schemaVersion === "typed-authoring-patch/1.1.0" &&
    (patch.support.basis !== "candidate_declaration" ||
      patch.sourceCitations.length !== 0 ||
      !/^declaration-witness-[a-f0-9]{64}$/u.test(patch.support.witnessId))
  )
    return false;
  return (["accept", "reject"] as const).every((operation) => {
    const command =
      operation === "accept" ? review.acceptCommand : review.rejectCommand;
    return (
      command.schemaVersion ===
        (patch.schemaVersion === "typed-authoring-patch/1.1.0"
          ? "typed-authoring-command/1.1.0"
          : "typed-authoring-command/1.0.0") &&
      command.operation === operation &&
      command.acknowledgement === (operation === "accept") &&
      /^[a-f0-9-]{36}$/u.test(command.idempotencyKey) &&
      same(command.clauseIds, [selection.clauseId]) &&
      (
        [
          "binding",
          "diagnosticDigest",
          "coverageDigest",
          "semanticDigest",
          "policies",
          "target",
          "transform",
          "sourceCitations",
        ] as const
      ).every((key) => same(command[key], patch[key]))
    );
  });
}
function receiptMatches(
  receipt: TypedAuthoringReceipt,
  command: TypedAuthoringCommand,
) {
  return (
    receipt?.schemaVersion === "typed-authoring-receipt/1.0.0" &&
    receipt.status === "applied" &&
    receipt.action === command.operation &&
    receipt.idempotencyKey === command.idempotencyKey &&
    receipt.baseVersionId === command.binding.canonical.versionId &&
    receipt.baseRevision === command.binding.canonical.revision &&
    receipt.requirementVersionId === command.binding.requirements.versionId &&
    receipt.requirementRevision === command.binding.requirements.revision &&
    /^[a-f0-9]{64}$/u.test(receipt.commandSha256) &&
    /^[a-f0-9-]{36}$/u.test(receipt.versionId) &&
    Number.isSafeInteger(receipt.revision) &&
    receipt.revision ===
      command.binding.canonical.revision +
        (command.operation === "accept" ? 2 : 0) &&
    (command.operation === "accept"
      ? receipt.versionId !== command.binding.canonical.versionId
      : receipt.versionId === command.binding.canonical.versionId)
  );
}
function useHistoryReset(reset: () => void) {
  const latest = useRef(reset);
  latest.current = reset;
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) latest.current();
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
}
function CompleteWordingChange({
  patch,
  headingRef,
}: {
  patch: TypedAuthoringPatch;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const declaration = patch.support.basis === "candidate_declaration";
  return (
    <section aria-label="Complete wording change">
      <h3 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
        Review the complete wording change
      </h3>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <h4>Current wording</h4>
          <blockquote className="whitespace-pre-wrap break-words">
            {patch.before}
          </blockquote>
        </div>
        <div className="min-w-0">
          <h4>Proposed wording</h4>
          <blockquote className="whitespace-pre-wrap break-words">
            {patch.after}
          </blockquote>
        </div>
      </div>
      <p>{patch.rationale}</p>
      <p>
        {declaration ? "Your confirmed declaration" : "Quoted source claim"}
      </p>
      <p>
        {patch.support.basis === "source_quote"
          ? "This wording change retains the cited source claim; it does not independently verify it."
          : "This wording change retains your confirmed declaration; it is not independent source verification."}
      </p>
      <p>
        Current fact confirmation recorded on{" "}
        <time dateTime={patch.target.confirmedAt}>
          {patch.target.confirmedAt}
        </time>
        .
      </p>
      {declaration && patch.sourceCitations.length === 0 && (
        <p>No current source quote is linked to this edited wording.</p>
      )}
      <p>
        Numeric score change: unavailable. A wording change does not establish
        proficiency or add qualification credit.
      </p>
      <details>
        <summary>Claim and version references</summary>
        <p>
          Resume version: <code>{patch.binding.canonical.versionId}</code>. Job
          requirements version:{" "}
          <code>{patch.binding.requirements.versionId}</code>.
        </p>
        <p>
          Proposal: <code>{patch.id}</code>. Current fact:{" "}
          <code>{patch.target.factId}</code>.
        </p>
        <p>
          <a
            href={`/analysis/${patch.binding.source.analysisId}/canonical?version=${patch.binding.canonical.versionId}#fact-${patch.target.factId}`}
          >
            Inspect this pinned fact
          </a>
          .
        </p>
        <p>
          Recorded confirmation actor:{" "}
          <code>{patch.target.confirmationActorId}</code>.
        </p>
        <ul>
          {patch.sourceCitations.map((citation, index) => (
            <li key={`${citation.spanId}:${index}`}>
              <a
                href={`/analysis/${patch.binding.source.analysisId}/evidence#source-${encodeURIComponent(citation.spanId)}`}
              >
                Inspect cited source
              </a>{" "}
              <code>{citation.spanId}</code>, characters {citation.start} to{" "}
              {citation.end}.
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
function DecisionControls({
  submission,
  busy,
  onSubmit,
  retry = false,
}: {
  submission: Submission;
  busy: boolean;
  onSubmit: (ack: "accepted" | null) => void;
  retry?: boolean;
}) {
  const [checked, setChecked] = useState(false);
  const id = useId();
  useHistoryReset(() => setChecked(false));
  const accepting = submission.command.operation === "accept";
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && (!accepting || checked)) {
          setChecked(false);
          onSubmit(accepting ? "accepted" : null);
        }
      }}
    >
      <fieldset disabled={busy}>
        <legend>
          {retry ? "Review the retained submission" : "Review your decision"}
        </legend>
        {accepting && (
          <label htmlFor={id}>
            <input
              id={id}
              name="proposalAcknowledgement"
              type="checkbox"
              value="accepted"
              checked={checked}
              required
              onChange={(event) => setChecked(event.currentTarget.checked)}
            />
            {submission.review.patch.support.basis === "candidate_declaration"
              ? "I reviewed the complete proposed change and my recorded declaration."
              : "I reviewed the complete proposed change and its source support."}
          </label>
        )}
        <button
          type="submit"
          className={accepting ? "primary-button" : "back-button"}
          disabled={busy || (accepting && !checked)}
        >
          {retry
            ? `Retry exact ${submission.command.operation} submission`
            : accepting
              ? "Accept reviewed wording"
              : "Reject this proposal"}
        </button>
      </fieldset>
    </form>
  );
}
const errorCopy = (reason: TypedAuthoringReason) =>
  reason === "stale_inputs"
    ? "The reviewed inputs changed. Prepare a new proposal from the current versions."
    : reason === "no_change"
      ? "The wording is unchanged. No improvement has been saved."
      : reason === "invalid_result"
        ? "The save could not be confirmed from its receipt. Keep this exact submission and check your version history."
        : "The request could not be confirmed. Keep the original submission and check your version history before retrying.";

export default function TypedAuthoringReview({
  workspace,
  busy = false,
  onRequestProposal,
  onDecision,
  onUndo,
}: TypedAuthoringReviewProps) {
  const binding = workspace.binding;
  const targets = workspace.targets
    .filter((target) => target.state === "eligible")
    .map((target) => ({
      factId: target.factId,
      label: target.value,
      currentValue: target.value,
    }));
  const clauses = workspace.clauses.map((clause) => ({
    id: clause.clauseId,
    quote: clause.quote,
    targets,
    explanations: [clause.explanation],
  }));
  const heading = useId();
  const scope = JSON.stringify([
    binding,
    workspace.diagnosticDigest,
    workspace.coverageDigest,
    workspace.semanticDigest,
  ]);
  const sourceScope = JSON.stringify(binding.source);
  const latestScope = useRef(scope);
  const generation = useRef(0);
  const undoGeneration = useRef(0);
  if (latestScope.current !== scope) {
    latestScope.current = scope;
    generation.current++;
  }
  const active = useRef(false);
  const [working, setWorking] = useState(false);
  const [clauseId, setClauseId] = useState("");
  const [targetFactId, setTargetFactId] = useState("");
  const [review, setReview] = useState<{
    scope: string;
    value: TypedAuthoringPreparedReview;
  } | null>(null);
  const [requestError, setRequestError] = useState<TypedAuthoringReason | null>(
    null,
  );
  const [pending, setPending] = useState<Submission | null>(null);
  const pendingRef = useRef<Submission | null>(null);
  const [failure, setFailure] = useState<Extract<
    TypedAuthoringDecisionResult,
    { kind: "error" }
  > | null>(null);
  const [receipt, setReceipt] = useState<{
    value: TypedAuthoringReceipt;
    sourceScope: string;
  } | null>(null);
  const [undoMessage, setUndoMessage] = useState<string | null>(null);
  const [reviewEpoch, setReviewEpoch] = useState(0);
  const invalidate = () => {
    generation.current++;
    setReview(null);
    setRequestError(null);
    setReviewEpoch((value) => value + 1);
  };
  useEffect(() => {
    undoGeneration.current++;
    setUndoMessage(null);
    setClauseId("");
    setTargetFactId("");
    setReview(null);
    setRequestError(null);
    setReviewEpoch((value) => value + 1);
  }, [scope]);
  useEffect(() => {
    undoGeneration.current++;
    setUndoMessage(null);
    setPending(null);
    pendingRef.current = null;
    setFailure(null);
    setReceipt(null);
  }, [sourceScope]);
  useHistoryReset(() => {
    invalidate();
    setClauseId("");
    setTargetFactId("");
  });
  const clause = clauses.find((candidate) => candidate.id === clauseId);
  const target = clause?.targets.find(
    (candidate) => candidate.factId === targetFactId,
  );
  const current =
    review?.scope === scope &&
    review.value.patch.selection.clauseId === clauseId &&
    review.value.patch.selection.targetFactId === targetFactId
      ? review.value
      : null;
  const retained =
    pending && same(pending.command.binding.source, binding.source)
      ? pending
      : null;
  const saved = receipt?.sourceScope === sourceScope ? receipt.value : null;
  const proposalHeading = useRef<HTMLHeadingElement>(null);
  const requestAlert = useRef<HTMLParagraphElement>(null);
  const retainedAlert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (requestError) requestAlert.current?.focus();
    else if (failure) retainedAlert.current?.focus();
    else if (current) proposalHeading.current?.focus();
  }, [current, failure, requestError]);

  const blockedByRetry = Boolean(
    retained && failure?.recovery !== "review_again",
  );
  const locked = busy || working;
  const isCurrent =
    binding.canonical.versionId === binding.heads.canonicalHeadId &&
    binding.canonical.revision === binding.heads.canonicalHeadRevision &&
    binding.requirements.versionId === binding.heads.requirementHeadId &&
    binding.requirements.revision === binding.heads.requirementHeadRevision;
  const begin = () => {
    if (busy || active.current) return false;
    active.current = true;
    setWorking(true);
    return true;
  };
  const finish = () => {
    active.current = false;
    setWorking(false);
  };
  const prepare = async () => {
    if (!clause || !target || !isCurrent || blockedByRetry || !begin()) return;
    const selection: TypedAuthoringSelection = {
      canonicalVersionId: binding.canonical.versionId,
      requirementVersionId: binding.requirements.versionId,
      clauseId: clause.id,
      targetFactId: target.factId,
    };
    const capturedScope = scope,
      capturedGeneration = ++generation.current;
    setRequestError(null);
    setReviewEpoch((value) => value + 1);
    try {
      const response = await onRequestProposal(selection);
      if (
        latestScope.current !== capturedScope ||
        generation.current !== capturedGeneration
      )
        return;
      if (response === "stale_inputs") {
        setRequestError("stale_inputs");
        setReview(null);
        return;
      }
      if (!validReview(response, selection, workspace, target.currentValue)) {
        setRequestError("invalid_result");
        setReview(null);
        return;
      }
      // Only an explicit successful fresh preview supersedes a definite stale refusal.
      // Ambiguous saves keep their original command and exact retry path.
      if (failure?.recovery === "review_again") {
        setPending(null);
        pendingRef.current = null;
        setFailure(null);
      }
      undoGeneration.current++;
      setReceipt(null);
      setUndoMessage(null);
      setReview({ scope: capturedScope, value: response });
    } catch {
      if (
        latestScope.current === capturedScope &&
        generation.current === capturedGeneration
      ) {
        setRequestError("unavailable");
        setReview(null);
      }
    } finally {
      finish();
    }
  };
  const decide = async (
    submission: Submission,
    ack: "accepted" | null,
    retry: boolean,
  ) => {
    if (submission.command.operation === "accept" && ack !== "accepted") return;
    if (
      !same(submission.command.binding.source, binding.source) ||
      (!retry && pendingRef.current && failure?.recovery !== "review_again") ||
      !begin()
    )
      return;
    const original = retry ? pendingRef.current : submission;
    if (!original) {
      finish();
      return;
    }
    pendingRef.current = original;
    undoGeneration.current++;
    setUndoMessage(null);
    setPending(original);
    setFailure(null);
    setReceipt(null);
    try {
      const result = await onDecision(original.command, ack);
      if (
        result.kind === "applied" &&
        receiptMatches(result.receipt, original.command)
      ) {
        setReceipt({
          value: result.receipt,
          sourceScope: JSON.stringify(original.command.binding.source),
        });
        setPending(null);
        pendingRef.current = null;
        setReview(null);
      } else
        setFailure(
          result.kind === "error"
            ? result
            : {
                kind: "error",
                reason: "invalid_result",
                recovery: "retry_exact",
              },
        );
    } catch {
      setFailure({
        kind: "error",
        reason: "unavailable",
        recovery: "retry_exact",
      });
    } finally {
      setReviewEpoch((value) => value + 1);
      finish();
    }
  };
  return (
    <section aria-labelledby={heading} className="rule-trace">
      <h2 id={heading}>Review a wording change</h2>
      <p>
        Choose a job requirement and a complete current contribution. Review the
        full change before a decision. This panel does not generate or promise a
        score increase.
      </p>
      {locked && <p role="status">Preparing or recording your request…</p>}
      {!isCurrent && (
        <p role="status">
          These are historical input versions. Prepare new changes from the
          current resume and job requirements.
        </p>
      )}
      <form
        aria-label="Choose a requirement and contribution"
        onSubmit={(event) => {
          event.preventDefault();
          void prepare();
        }}
      >
        <fieldset
          disabled={
            locked ||
            blockedByRetry ||
            !isCurrent ||
            requestError === "stale_inputs"
          }
        >
          <legend>Choose the exact contribution to review</legend>
          <label htmlFor={`${heading}-clause`}>Job requirement</label>
          <select
            id={`${heading}-clause`}
            className="min-w-0 max-w-full"
            value={clauseId}
            required
            onChange={(event) => {
              if (!locked) {
                invalidate();
                setClauseId(event.currentTarget.value);
                setTargetFactId("");
              }
            }}
          >
            <option value="">Choose a requirement</option>
            {clauses.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.quote}
              </option>
            ))}
          </select>
          <label htmlFor={`${heading}-target`}>Current contribution</label>
          <select
            id={`${heading}-target`}
            className="min-w-0 max-w-full"
            value={targetFactId}
            required
            disabled={!clause?.targets.length || locked}
            onChange={(event) => {
              if (!locked) {
                invalidate();
                setTargetFactId(event.currentTarget.value);
              }
            }}
          >
            <option value="">Choose a contribution</option>
            {clause?.targets.map((choice) => (
              <option key={choice.factId} value={choice.factId}>
                {choice.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="back-button"
            disabled={!target || locked}
          >
            Prepare wording change
          </button>
        </fieldset>
      </form>
      {clause && (
        <section aria-label="Selected requirement">
          <h3>Selected job requirement</h3>
          <blockquote>{clause.quote}</blockquote>
          {clause.explanations.map((text, index) => (
            <p key={index}>{text}</p>
          ))}
          {!clause.targets.length && (
            <p>
              This requirement has no complete editable contribution target.
              Skill listings and reconstructed source fragments are
              explanations, not replacement targets. You can review them on the
              canonical page.
            </p>
          )}
        </section>
      )}
      {target && !current && !retained && (
        <blockquote aria-label="Selected current contribution">
          {target.currentValue}
        </blockquote>
      )}
      {workspace.targets.some(
        (target) => target.state === "explanation_only",
      ) && (
        <section aria-label="Claims for explanation only">
          <h3>Claims that are not replacement targets</h3>
          <ul>
            {workspace.targets
              .filter((target) => target.state === "explanation_only")
              .map((target) => (
                <li key={target.factId}>
                  <blockquote>{target.value}</blockquote>
                  <p>
                    {target.reason === "fragmented_source_clause"
                      ? "This dated claim is reconstructed from source fragments and is explanation-only."
                      : target.reason === "confirmation_required"
                        ? "Review and confirm the complete current claim before requesting a supported wording change."
                        : "This claim is not a full current contribution rewrite target. Review its source and provenance."}
                  </p>
                  <a
                    href={`/analysis/${binding.source.analysisId}/canonical?version=${binding.canonical.versionId}#fact-${target.factId}`}
                  >
                    Review this saved claim
                  </a>
                </li>
              ))}
          </ul>
        </section>
      )}
      {requestError && (
        <p ref={requestAlert} role="alert" tabIndex={-1}>
          {requestError === "invalid_result"
            ? "The returned proposal did not match the chosen contribution. Review the current input versions."
            : errorCopy(requestError)}
        </p>
      )}
      {requestError === "stale_inputs" && (
        <p>
          <a href={`/analysis/${binding.source.analysisId}/score`}>
            Open current input versions
          </a>
        </p>
      )}
      {current && !retained && !saved && (
        <section aria-label="Proposed wording review">
          <CompleteWordingChange
            patch={current.patch}
            headingRef={proposalHeading}
          />
          <DecisionControls
            key={`accept:${current.acceptCommand.idempotencyKey}:${reviewEpoch}`}
            submission={{ review: current, command: current.acceptCommand }}
            busy={locked}
            onSubmit={(ack) => {
              void decide(
                { review: current, command: current.acceptCommand },
                ack,
                false,
              );
            }}
          />
          <DecisionControls
            key={`reject:${current.rejectCommand.idempotencyKey}:${reviewEpoch}`}
            submission={{ review: current, command: current.rejectCommand }}
            busy={locked}
            onSubmit={(ack) => {
              void decide(
                { review: current, command: current.rejectCommand },
                ack,
                false,
              );
            }}
          />
        </section>
      )}
      {retained && (
        <section aria-label="Retained exact submission">
          <h3>Retained {retained.command.operation} request</h3>
          <CompleteWordingChange patch={retained.review.patch} />
          <p>
            Your original command and retry key are retained. Retrying does not
            create a new proposal or rebase it onto the current inputs.
          </p>
          {failure && (
            <p ref={retainedAlert} role="alert" tabIndex={-1}>
              {errorCopy(failure.reason)}
            </p>
          )}
          {failure?.recovery === "retry_exact" && (
            <DecisionControls
              key={`retry:${retained.command.idempotencyKey}:${reviewEpoch}`}
              submission={retained}
              retry
              busy={locked}
              onSubmit={(ack) => {
                void decide(retained, ack, true);
              }}
            />
          )}
          {failure?.recovery === "review_again" && (
            <p>
              Choose the current inputs and prepare a new proposal. This earlier
              decision has not been accepted by this panel.
            </p>
          )}
        </section>
      )}
      {saved && (
        <section aria-label="Recorded decision">
          <h3>
            {saved.action === "accept"
              ? "Wording change saved"
              : "Rejection recorded"}
          </h3>
          <p>
            Recorded resume revision {saved.revision}. This may be an earlier
            version than the current head.
          </p>
          <a
            href={`/analysis/${binding.source.analysisId}/canonical?version=${saved.versionId}&compare=${saved.baseVersionId}`}
          >
            Inspect the exact recorded version
          </a>
          {saved.action === "accept" && onUndo && (
            <button
              className="back-button"
              type="button"
              disabled={locked}
              onClick={() => {
                if (!begin()) return;
                const capturedScope = scope;
                const undoAttempt = ++undoGeneration.current;
                const stillCurrent = () =>
                  latestScope.current === capturedScope &&
                  undoGeneration.current === undoAttempt;
                setUndoMessage(null);
                void Promise.resolve()
                  .then(() => onUndo(saved))
                  .then(
                    () => {
                      if (stillCurrent())
                        setUndoMessage(
                          "Undo request returned. Review your version history for the owning route's result.",
                        );
                    },
                    () => {
                      if (stillCurrent())
                        setUndoMessage(
                          "Undo could not be confirmed. Check your version history before trying again.",
                        );
                    },
                  )
                  .finally(finish);
              }}
            >
              Undo this saved change
            </button>
          )}
          {undoMessage && <p role="status">{undoMessage}</p>}
        </section>
      )}
    </section>
  );
}
