import { randomUUID } from "node:crypto";
import { useEffect, useRef, useState } from "react";
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
  type ShouldRevalidateFunction,
} from "react-router";
import WorkspaceShell from "~/components/WorkspaceShell";
import WritingDiagnosticComparison from "~/components/WritingDiagnosticComparison";
import CanonicalCorrectionReview from "~/components/CanonicalCorrectionReview";
import CanonicalEntryRegroupReview, {
  type CanonicalEntryRegroupFeedback,
} from "~/components/CanonicalEntryRegroupReview";
import {
  CanonicalEntryRegroupError,
  loadCanonicalEntryRegroupWorkspace,
  previewCanonicalEntryRegroup,
  resumeCanonicalEntryRegroup,
  commitCanonicalEntryRegroup,
  readCanonicalEntryRegroupForm,
  type CanonicalEntryRegroupCommand,
} from "~/lib/server/canonical-entry-regroup-repository";
import GroupedOriginalImportReview, {
  type GroupedOriginalFeedback,
} from "~/components/GroupedOriginalImportReview";
import {
  GroupedOriginalError,
  loadGroupedOriginalWorkspace,
  previewGroupedOriginalImport,
  commitGroupedOriginalImport,
  readGroupedOriginalForm,
  type GroupedOriginalCommand,
} from "~/lib/server/grouped-import-repository";
import { getAuthenticatedUser } from "~/lib/server/auth";
import { getServerConfig } from "~/lib/server/config";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "~/lib/server/supabase";
import { assertSameOrigin } from "~/lib/server/security";
import {
  CanonicalError,
  loadCanonical,
  loadCanonicalCorrectionWorkspace,
  mutateCanonical,
  readCanonicalForm,
  type CanonicalCommand,
} from "~/lib/server/canonical-repository";
import { PublicApiError } from "~/lib/server/errors";
type Args = { request: Request; params: { id?: string } };
type RetainedSubmission = Extract<
  CanonicalCommand,
  { operation: "edit" | "rename_section" }
>;
function isRetainedSubmission(value: unknown): value is RetainedSubmission {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const command = value as Record<string, unknown>;
  const target =
    command.operation === "edit"
      ? "factId"
      : command.operation === "rename_section"
        ? "sectionId"
        : null;
  return (
    target !== null &&
    Object.keys(command).length === 5 &&
    ["operation", "expectedVersionId", "idempotencyKey", target, "value"].every(
      (key) => Object.hasOwn(command, key) && typeof command[key] === "string",
    )
  );
}
const MAX_RETAINED_CORRECTIONS = 1_030;
function retainedTargetKey(command: RetainedSubmission) {
  return command.operation === "edit"
    ? `edit:${command.factId}`
    : `rename_section:${command.sectionId}`;
}
function resolvesRetained(
  retained: RetainedSubmission,
  resolved: RetainedSubmission,
) {
  return (
    retainedTargetKey(retained) === retainedTargetKey(resolved) &&
    retained.value === resolved.value
  );
}
export const shouldRevalidate: ShouldRevalidateFunction = ({
  actionResult,
  defaultShouldRevalidate,
}) => {
  if (
    actionResult &&
    typeof actionResult === "object" &&
    "regroup" in actionResult &&
    actionResult.regroup &&
    typeof actionResult.regroup === "object" &&
    "kind" in actionResult.regroup
  ) {
    if (
      actionResult.regroup.kind === "preview" ||
      actionResult.regroup.kind === "retained"
    )
      return false;
    if (
      actionResult.regroup.kind === "applied" ||
      actionResult.regroup.kind === "error"
    )
      return true;
  }
  if (
    actionResult &&
    typeof actionResult === "object" &&
    "grouped" in actionResult &&
    actionResult.grouped &&
    typeof actionResult.grouped === "object" &&
    "kind" in actionResult.grouped
  ) {
    if (actionResult.grouped.kind === "preview") return false;
    if (
      actionResult.grouped.kind === "applied" ||
      actionResult.grouped.kind === "error"
    )
      return true;
  }
  return (
    defaultShouldRevalidate ||
    (Boolean(actionResult) &&
      typeof actionResult === "object" &&
      "submitted" in actionResult &&
      isRetainedSubmission(actionResult.submitted))
  );
};
export function meta() {
  return [{ title: "Review structured resume | Resumide" }];
}
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
  const result = new Headers(parentHeaders);
  for (const source of [loaderHeaders, actionHeaders, errorHeaders])
    if (source) {
      for (const [key, value] of source)
        if (key.toLowerCase() !== "set-cookie") result.set(key, value);
      for (const cookie of source.getSetCookie())
        result.append("Set-Cookie", cookie);
    }
  result.set("Cache-Control", "private, no-store");
  result.set("X-Robots-Tag", "noindex, nofollow");
  return result;
};
function enabled() {
  if (!getServerConfig().CANONICAL_AUTHORING_ENABLED)
    throw new CanonicalError(404, "Structured resume is not enabled.");
}
export async function loader({ request, params }: Args) {
  const headers = privateHeaders();
  try {
    enabled();
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, headers),
    );
    if (!user)
      throw redirect(
        `/auth?next=${encodeURIComponent(`/analysis/${params.id ?? ""}/canonical`)}`,
        { headers },
      );
    const url = new URL(request.url);
    const offset = url.searchParams.get("offset") ?? "0";
    if (!/^(?:0|[1-9]\d*)$/u.test(offset))
      throw new CanonicalError(422, "Choose a valid history page.");
    const read = getServerConfig().CANONICAL_CORRECTIONS_ENABLED
      ? loadCanonicalCorrectionWorkspace
      : loadCanonical;
    const admin = createSupabaseAdminClient();
    const model = await read(admin, params.id ?? "", user.id, {
      versionId: url.searchParams.get("version") ?? undefined,
      compareId: url.searchParams.get("compare") ?? undefined,
      offset: Number(offset),
    });
    const groupedOriginal = await loadGroupedOriginalWorkspace(
      admin,
      params.id ?? "",
      user.id,
    );
    const entryRegroup = await loadCanonicalEntryRegroupWorkspace(
      admin,
      params.id ?? "",
      user.id,
    );
    return data(
      {
        ...model,
        groupedOriginal,
        entryRegroup,
        groupedOwnerId: user.id,
        scoringDiagnosticsEnabled: getServerConfig().SCORING_V2_ENABLED,
        artifactEnabled: getServerConfig().ARTIFACT_RENDERING_ENABLED,
        formKey: randomUUID(),
        factKeys: Object.fromEntries(
          (model.current?.document.facts ?? []).map((f) => [
            f.id,
            { edit: randomUUID(), confirm: randomUUID() },
          ]),
        ),
        retainedKeys: Object.fromEntries([
          ...(model.current?.document.facts ?? []).map((fact) => [
            `edit:${fact.id}`,
            randomUUID(),
          ]),
          ...(model.current?.document.sections ?? []).map((section) => [
            `rename_section:${section.id}`,
            randomUUID(),
          ]),
        ]),
        restoreKey: randomUUID(),
      },
      { headers },
    );
  } catch (error) {
    if (error instanceof Response) throw error;
    throw data(
      {
        error:
          error instanceof CanonicalError
            ? error.message
            : "Structured resume is unavailable.",
      },
      { status: error instanceof CanonicalError ? error.status : 503, headers },
    );
  }
}
export async function action({ request, params }: Args) {
  const headers = privateHeaders();
  let submitted: RetainedSubmission | undefined;
  let groupedRequest = false;
  let groupedSubmitted: GroupedOriginalCommand | undefined;
  let regroupRequest = false;
  let regroupSubmitted: CanonicalEntryRegroupCommand | undefined;
  try {
    enabled();
    if (request.method !== "POST") {
      headers.set("Allow", "POST");
      return data({ error: "Use POST." }, { status: 405, headers });
    }
    assertSameOrigin(request, getServerConfig().APP_ORIGIN);
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, headers),
    );
    if (!user)
      return data(
        { error: "Sign in to review your resume." },
        { status: 401, headers },
      );
    const query = new URL(request.url).searchParams;
    const grouped = query.getAll("grouped"),
      regroup = query.getAll("regroup");
    groupedRequest = grouped.length > 0;
    regroupRequest = regroup.length > 0;
    if (regroupRequest) {
      if (
        groupedRequest ||
        regroup.length !== 1 ||
        !["preview", "resume", "commit"].includes(regroup[0])
      )
        throw new CanonicalEntryRegroupError(
          "invalid_command",
          "review_again",
          422,
        );
      if (
        !getServerConfig().CANONICAL_CORRECTIONS_ENABLED ||
        !getServerConfig().EVIDENCE_REVIEW_ENABLED
      )
        throw new CanonicalEntryRegroupError("disabled", "unavailable", 404);
      if (regroup[0] === "preview") {
        const command = await readCanonicalEntryRegroupForm(request, "preview");
        const preview = await previewCanonicalEntryRegroup(
          createSupabaseAdminClient(),
          params.id ?? "",
          user.id,
          command,
        );
        return data(
          {
            success: null,
            error: null,
            regroup: { kind: "preview" as const, preview },
          },
          { headers },
        );
      }
      if (regroup[0] === "resume") {
        regroupSubmitted = await readCanonicalEntryRegroupForm(
          request,
          "resume",
        );
        const preview = await resumeCanonicalEntryRegroup(
          createSupabaseAdminClient(),
          params.id ?? "",
          user.id,
          regroupSubmitted,
        );
        return data(
          {
            success: null,
            error: null,
            regroup: { kind: "retained" as const, preview },
          },
          { headers },
        );
      }
      regroupSubmitted = await readCanonicalEntryRegroupForm(request, "commit");
      const receipt = await commitCanonicalEntryRegroup(
        createSupabaseAdminClient(),
        params.id ?? "",
        user.id,
        regroupSubmitted,
        randomUUID(),
      );
      return data(
        {
          success: receipt.idempotent
            ? "This arrangement was already saved. Open its saved version."
            : "Entry arrangement saved. Confirm facts separately.",
          error: null,
          regroup: {
            kind: "applied" as const,
            receipt,
            resolved: regroupSubmitted,
          },
        },
        { headers },
      );
    }
    if (groupedRequest) {
      if (
        grouped.length !== 1 ||
        (grouped[0] !== "preview" && grouped[0] !== "commit")
      )
        throw new GroupedOriginalError("invalid_command", "review_again", 422);
      if (
        !getServerConfig().CANONICAL_CORRECTIONS_ENABLED ||
        !getServerConfig().EVIDENCE_REVIEW_ENABLED
      )
        throw new GroupedOriginalError("disabled", "unavailable", 404);
      if (grouped[0] === "preview") {
        const command = await readGroupedOriginalForm(request, "preview");
        const preview = await previewGroupedOriginalImport(
          createSupabaseAdminClient(),
          params.id ?? "",
          user.id,
          command,
        );
        return data(
          {
            success: null,
            error: null,
            grouped: { kind: "preview" as const, preview },
          },
          { headers },
        );
      }
      groupedSubmitted = await readGroupedOriginalForm(request, "commit");
      const receipt = await commitGroupedOriginalImport(
        createSupabaseAdminClient(),
        params.id ?? "",
        user.id,
        groupedSubmitted,
        randomUUID(),
      );
      return data(
        {
          success: receipt.idempotent
            ? "This import was already saved. Open its saved version."
            : "Entry relationships saved. Confirm the facts separately.",
          error: null,
          grouped: {
            kind: "applied" as const,
            receipt,
            resolved: groupedSubmitted,
          },
        },
        { headers },
      );
    }
    const input = await readCanonicalForm(request);
    if (input.operation === "edit" || input.operation === "rename_section")
      submitted = input;
    if (
      input.operation === "correction" &&
      !getServerConfig().CANONICAL_CORRECTIONS_ENABLED
    )
      throw new CanonicalError(404, "Correction review is not enabled.");
    const result = await mutateCanonical(
      createSupabaseAdminClient(),
      params.id ?? "",
      user.id,
      input,
      randomUUID(),
    );
    const success =
      input.operation === "correction"
        ? "status" in result && result.status === "assigned"
          ? "Correction target saved. Review the proposed change before applying it."
          : `Version ${result.revision} saved for review. Confirm the new fact separately.`
        : `Version ${result.revision} saved.`;
    return data(
      { success, error: null, ...(submitted ? { resolved: submitted } : {}) },
      { headers },
    );
  } catch (error) {
    if (regroupRequest) {
      const failure =
        error instanceof CanonicalEntryRegroupError
          ? error
          : new CanonicalEntryRegroupError(
              "unavailable",
              regroupSubmitted ? "retry_exact" : "unavailable",
              503,
            );
      return data(
        {
          error: failure.message,
          success: null,
          regroup: {
            kind: "error" as const,
            reason: failure.reason,
            recovery: failure.recovery,
            ...(regroupSubmitted ? { submitted: regroupSubmitted } : {}),
          },
        },
        { status: failure.status, headers },
      );
    }
    if (groupedRequest) {
      const failure =
        error instanceof GroupedOriginalError
          ? error
          : new GroupedOriginalError(
              "unavailable",
              groupedSubmitted ? "retry_exact" : "unavailable",
              503,
            );
      return data(
        {
          error: failure.message,
          success: null,
          grouped: {
            kind: "error" as const,
            reason: failure.reason,
            recovery: failure.recovery,
            ...(groupedSubmitted ? { submitted: groupedSubmitted } : {}),
          },
        },
        { status: failure.status, headers },
      );
    }
    return data(
      {
        error:
          error instanceof CanonicalError || error instanceof PublicApiError
            ? error.message
            : "Your change could not be saved. Retry the same submission.",
        success: null,
        ...(submitted ? { submitted } : {}),
      },
      {
        status:
          error instanceof CanonicalError || error instanceof PublicApiError
            ? error.status
            : 503,
        headers,
      },
    );
  }
}
function CanonicalReviewAcknowledgement({ disabled }: { disabled: boolean }) {
  const [checked, setChecked] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) {
        if (input.current) input.current.checked = false;
        setChecked(false);
      }
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  return (
    <input
      ref={input}
      type="checkbox"
      required
      checked={checked}
      disabled={disabled}
      onChange={(event) => setChecked(event.target.checked)}
    />
  );
}
function RetainedCorrection({
  submitted,
  target,
  headId,
  reviewKey,
  analysisId,
  editable,
  busy,
}: {
  submitted: RetainedSubmission;
  target?: { id: string; value: string };
  headId: string | null;
  reviewKey: string | undefined;
  analysisId: string;
  editable: boolean;
  busy: boolean;
}) {
  const destination = `/analysis/${analysisId}/canonical`;
  const canRetry = editable && Boolean(target) && headId !== null;
  const binding = JSON.stringify([
    analysisId,
    submitted,
    target,
    headId,
    reviewKey,
  ]);
  return (
    <section aria-label="Retained correction">
      <h2>Your retained correction</h2>
      <p>
        Your last save could not be confirmed. The original submission is kept
        unchanged below. Copy this text before leaving or reloading this page.
      </p>
      <blockquote
        aria-label="Your retained correction"
        style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
      >
        {submitted.value}
      </blockquote>
      <Form
        method="post"
        action={destination}
        onSubmit={(event) => {
          if (!canRetry || busy) event.preventDefault();
        }}
      >
        {Object.entries(submitted).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <button
          type="submit"
          className="back-button"
          disabled={!canRetry || busy}
        >
          Retry this exact correction
        </button>
      </Form>
      {editable &&
      target &&
      headId &&
      reviewKey &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
        reviewKey,
      ) &&
      reviewKey !== submitted.idempotencyKey ? (
        <>
          <h3>Review against the current saved value</h3>
          <p>Current saved value:</p>
          <blockquote
            style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
          >
            {target.value}
          </blockquote>
          <p>
            {submitted.operation === "edit"
              ? "The reviewed attempt uses this current version and saves an unconfirmed fact correction."
              : "The reviewed attempt changes this section title in a new version."}
          </p>
          <Form
            method="post"
            action={destination}
            onSubmit={(event) => {
              if (busy || !event.currentTarget.checkValidity())
                event.preventDefault();
            }}
          >
            <input type="hidden" name="operation" value={submitted.operation} />
            <input type="hidden" name="expectedVersionId" value={headId} />
            <input type="hidden" name="idempotencyKey" value={reviewKey} />
            <input
              type="hidden"
              name={submitted.operation === "edit" ? "factId" : "sectionId"}
              value={target.id}
            />
            <input type="hidden" name="value" value={submitted.value} />
            <label>
              <CanonicalReviewAcknowledgement key={binding} disabled={busy} />I
              reviewed the current saved value and my retained correction.
            </label>
            <button type="submit" className="back-button" disabled={busy}>
              Save reviewed correction
            </button>
          </Form>
        </>
      ) : (
        <p role="status">
          Open the latest editable version with the same target before reviewing
          a new attempt. No replacement target is selected for you.
        </p>
      )}
    </section>
  );
}
export default function CanonicalResume() {
  const model = useLoaderData<typeof loader>();
  const feedback = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";
  const evidenceCorrectionSubmitted = useRef(false);
  const previousFeedback = useRef<typeof feedback>(undefined);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const current = model.current?.document;
  const editable = current?.versionId === model.headId;
  const submitted =
    feedback &&
    "submitted" in feedback &&
    isRetainedSubmission(feedback.submitted)
      ? feedback.submitted
      : undefined;
  const sourceBinding = JSON.stringify([
    model.analysisId,
    model.resumeId,
    model.current?.sourceId,
    current?.ownerId,
  ]);
  const resolved =
    feedback &&
    "resolved" in feedback &&
    isRetainedSubmission(feedback.resolved)
      ? feedback.resolved
      : undefined;
  useEffect(() => {
    if (busy) return;
    const evidenceCorrection = evidenceCorrectionSubmitted.current;
    evidenceCorrectionSubmitted.current = false;
    if (
      feedback &&
      feedback !== previousFeedback.current &&
      (evidenceCorrection || submitted || resolved)
    ) {
      feedbackRef.current?.focus();
    }
    previousFeedback.current = feedback;
  }, [busy, feedback, submitted, resolved]);
  const [draft, setDraft] = useState({
    sourceBinding,
    feedback,
    feedbackIsCurrentSource: true,
    submitted: submitted ? [submitted] : [],
    overflow: undefined as RetainedSubmission | undefined,
  });
  let retained = draft.submitted;
  let overflow = draft.overflow;
  let feedbackIsCurrentSource = draft.feedbackIsCurrentSource;
  if (sourceBinding !== draft.sourceBinding) {
    retained = [];
    overflow = undefined;
    feedbackIsCurrentSource = false;
    setDraft({
      sourceBinding,
      feedback,
      feedbackIsCurrentSource,
      submitted: retained,
      overflow,
    });
  } else if (feedback && feedback !== draft.feedback) {
    feedbackIsCurrentSource = true;
    if (submitted) {
      const key = retainedTargetKey(submitted);
      if (retained.some((command) => retainedTargetKey(command) === key)) {
        retained = retained.map((command) =>
          retainedTargetKey(command) === key ? submitted : command,
        );
      } else if (overflow && retainedTargetKey(overflow) === key) {
        overflow = submitted;
      } else if (retained.length < MAX_RETAINED_CORRECTIONS) {
        retained = [...retained, submitted];
      } else if (!overflow) {
        overflow = submitted;
      }
    } else if (resolved) {
      retained = retained.filter(
        (command) => !resolvesRetained(command, resolved),
      );
      if (overflow && resolvesRetained(overflow, resolved))
        overflow = undefined;
    }
    if (overflow && retained.length < MAX_RETAINED_CORRECTIONS) {
      retained = [...retained, overflow];
      overflow = undefined;
    }
    setDraft({
      sourceBinding,
      feedback,
      feedbackIsCurrentSource,
      submitted: retained,
      overflow,
    });
  }
  const memoryFull =
    retained.length >= MAX_RETAINED_CORRECTIONS || Boolean(overflow);
  const extraFeedback =
    feedbackIsCurrentSource &&
    submitted &&
    !retained.some(
      (command) => retainedTargetKey(command) === retainedTargetKey(submitted),
    ) &&
    (!overflow || retainedTargetKey(overflow) !== retainedTargetKey(submitted))
      ? submitted
      : undefined;
  const targetFor = (command: RetainedSubmission) =>
    command.operation === "edit"
      ? current?.facts.find((fact) => fact.id === command.factId)
      : current?.sections
          .filter((section) => section.id === command.sectionId)
          .map((section) => ({ id: section.id, value: section.title }))[0];
  const newerVersionLoaded =
    feedbackIsCurrentSource &&
    submitted &&
    editable &&
    model.headId !== submitted.expectedVersionId;
  const feedbackMessage =
    feedback?.error && newerVersionLoaded
      ? "A newer resume version is already loaded. Review your retained correction before saving again."
      : (feedback?.error ?? feedback?.success);
  const corrections = "corrections" in model ? model.corrections : null;
  const pendingCorrections = corrections?.items.some(
    (item) =>
      item.event.operation === "correct" &&
      !["applied", "superseded", "stale"].includes(item.state),
  );
  return (
    <WorkspaceShell
      eyebrow="Structured resume"
      title="Review your resume facts"
      description="Review imported content, confirm facts and keep a history of your changes."
    >
      {model.scoringDiagnosticsEnabled && (
        <Link
          to={`/analysis/${model.analysisId}/score${current ? `?canonical=${current.versionId}` : ""}`}
        >
          Review scoring diagnostics
        </Link>
      )}
      <p role="status">
        Imported facts need your review. Confirmation records your decision.
        Scoring is unavailable.
      </p>
      {feedback && (
        <p
          ref={feedbackRef}
          tabIndex={-1}
          role={feedback.error ? "alert" : "status"}
          aria-live="polite"
        >
          {feedbackMessage}
        </p>
      )}
      {memoryFull && (
        <p role="status">
          Draft memory is full. Copy your corrections before leaving. Resolve a
          retained correction before starting another edit; existing reviews,
          retries and fact confirmations remain available.
        </p>
      )}
      {retained.map((command) => (
        <RetainedCorrection
          key={retainedTargetKey(command)}
          submitted={command}
          target={targetFor(command)}
          headId={model.headId}
          reviewKey={model.retainedKeys?.[retainedTargetKey(command)]}
          analysisId={model.analysisId}
          editable={editable}
          busy={busy}
        />
      ))}
      {overflow && (
        <>
          <p>
            Copy this additional correction while resolving another draft to
            make room. It is read-only until space is available.
          </p>
          <RetainedCorrection
            submitted={overflow}
            target={targetFor(overflow)}
            headId={model.headId}
            reviewKey={model.retainedKeys?.[retainedTargetKey(overflow)]}
            analysisId={model.analysisId}
            editable={false}
            busy={busy}
          />
        </>
      )}
      {extraFeedback && (
        <section aria-label="Additional correction to copy">
          <h2>Copy this correction before another action</h2>
          <p>
            Draft memory is full. This additional response is shown for copying
            only and will leave this view after another action. Your retained
            drafts remain unchanged.
          </p>
          <blockquote
            style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
          >
            {extraFeedback.value}
          </blockquote>
        </section>
      )}
      <Link
        to={`/analysis/${model.analysisId}/canonical`}
        reloadDocument
        className="back-button"
      >
        Reload latest version
      </Link>{" "}
      <Link to={`/analysis/${model.analysisId}/evidence`}>
        View source evidence
      </Link>
      {model.groupedOriginal && (
        <GroupedOriginalImportReview
          key={`${model.groupedOwnerId}:${model.analysisId}`}
          workspace={model.groupedOriginal}
          ownerId={model.groupedOwnerId}
          analysisId={model.analysisId}
          feedback={
            feedback && "grouped" in feedback
              ? (feedback.grouped satisfies GroupedOriginalFeedback)
              : undefined
          }
          busy={busy}
          fresh={current === undefined && model.headId === null}
        />
      )}
      <CanonicalEntryRegroupReview
        key={`regroup:${model.groupedOwnerId}:${model.analysisId}`}
        workspace={model.entryRegroup}
        ownerId={model.groupedOwnerId}
        analysisId={model.analysisId}
        feedback={
          feedback && "regroup" in feedback
            ? (feedback.regroup satisfies CanonicalEntryRegroupFeedback)
            : undefined
        }
        busy={busy}
        fresh={Boolean(
          current &&
          editable &&
          model.entryRegroup.state === "available" &&
          current.versionId === model.entryRegroup.base.versionId,
        )}
      />
      {corrections && (
        <CanonicalCorrectionReview
          corrections={corrections}
          analysisId={model.analysisId}
          editable={model.headId === null || editable}
          busy={busy}
          onSubmit={() => {
            evidenceCorrectionSubmitted.current = true;
          }}
        />
      )}
      {!current ? (
        pendingCorrections ? (
          <p>
            Review and apply your saved corrections above to import the
            corrected resume.
          </p>
        ) : (
          <Form method="post">
            <input type="hidden" name="operation" value="import" />
            <input type="hidden" name="expectedVersionId" value="" />
            <input type="hidden" name="idempotencyKey" value={model.formKey} />
            <button
              type="submit"
              className="back-button"
              disabled={busy || corrections?.writeReady === false}
            >
              Import resume for review
            </button>
          </Form>
        )
      ) : (
        <>
          <h2>Version {model.current!.revision}</h2>
          <section aria-labelledby="facts-heading">
            <h2 id="facts-heading">Facts and confirmation</h2>
            {current.facts.map((fact) => (
              <article
                key={fact.id}
                id={`fact-${fact.id}`}
                className="account-card"
              >
                <h3>
                  {fact.type.replaceAll("_", " ")}: {fact.value}
                </h3>
                <p>State: {fact.state.replaceAll("_", " ")}</p>
                {fact.confirmation && (
                  <p>
                    Confirmed{" "}
                    <time dateTime={fact.confirmation.confirmedAt}>
                      {fact.confirmation.confirmedAt}
                    </time>
                  </p>
                )}
                <ul>
                  {fact.sources.map((citation, index) => (
                    <li key={index}>
                      <Link
                        to={`/analysis/${model.analysisId}/evidence#source-${citation.spanId}`}
                      >
                        {citation.spanId}, characters {citation.start}–
                        {citation.end}
                      </Link>
                    </li>
                  ))}
                </ul>
                {editable && (
                  <>
                    <Form method="post">
                      <input type="hidden" name="operation" value="confirm" />
                      <input
                        type="hidden"
                        name="expectedVersionId"
                        value={model.headId!}
                      />
                      <input
                        type="hidden"
                        name="idempotencyKey"
                        value={model.factKeys[fact.id].confirm}
                      />
                      <input type="hidden" name="factId" value={fact.id} />
                      <button
                        className="back-button"
                        type="submit"
                        disabled={busy || fact.state === "candidate_confirmed"}
                      >
                        Confirm {fact.type}: {fact.value}
                      </button>
                    </Form>
                    {!(
                      retained.some(
                        (command) =>
                          command.operation === "edit" &&
                          command.factId === fact.id,
                      ) ||
                      (overflow?.operation === "edit" &&
                        overflow.factId === fact.id)
                    ) && (
                      <Form
                        method="post"
                        action={`/analysis/${model.analysisId}/canonical`}
                        onSubmit={(event) => {
                          if (memoryFull || busy) event.preventDefault();
                        }}
                      >
                        <input type="hidden" name="operation" value="edit" />
                        <input
                          type="hidden"
                          name="expectedVersionId"
                          value={model.headId!}
                        />
                        <input
                          type="hidden"
                          name="idempotencyKey"
                          value={model.factKeys[fact.id].edit}
                        />
                        <input type="hidden" name="factId" value={fact.id} />
                        <label htmlFor={`edit-${fact.id}`}>
                          Correct {fact.type}: {fact.value}
                        </label>
                        <textarea
                          id={`edit-${fact.id}`}
                          name="value"
                          defaultValue={fact.value}
                          maxLength={2000}
                          required
                        />
                        <button
                          type="submit"
                          className="back-button"
                          disabled={busy || memoryFull}
                        >
                          Save correction for {fact.type}: {fact.value}
                        </button>
                      </Form>
                    )}
                  </>
                )}
              </article>
            ))}
            {model.artifactEnabled &&
              editable &&
              current.facts.length > 0 &&
              (current.facts.some((fact) => fact.state === "unconfirmed") ? (
                <p>Confirm the remaining facts before exporting.</p>
              ) : (
                <Link
                  className="back-button"
                  to={`/analysis/${model.analysisId}/export?version=${current.versionId}`}
                >
                  Preview and export this version
                </Link>
              ))}
          </section>
          <section aria-labelledby="preview-heading">
            <h2 id="preview-heading">Content preview</h2>
            {current.sections.map((section) => (
              <section key={section.id}>
                <h3>{section.title}</h3>
                {section.entries.map((entry) => (
                  <ul key={entry.id}>
                    {entry.factIds.map((id) => {
                      const fact = current.facts.find(
                        (item) => item.id === id,
                      )!;
                      return (
                        <li key={id}>
                          {fact.type}: {fact.value}
                        </li>
                      );
                    })}
                    {entry.bullets.map((bullet) => (
                      <li key={bullet.id}>{bullet.text}</li>
                    ))}
                  </ul>
                ))}
              </section>
            ))}
          </section>
          <section aria-labelledby="changes-heading">
            <h2 id="changes-heading">Version change record</h2>
            <ol>
              {current.changes.map((change) => (
                <li key={change.id}>
                  {change.action}
                  {change.priorValue
                    ? `: previously ${change.priorValue}`
                    : ""}{" "}
                  <time dateTime={change.createdAt}>{change.createdAt}</time>
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="history-heading">
            <h2 id="history-heading">Version history</h2>
            <ol>
              {model.history.map((version) => (
                <li key={version.id}>
                  <Link to={`?version=${version.id}`}>
                    View version {version.revision}
                  </Link>{" "}
                  <Link
                    to={`?version=${current.versionId}&compare=${version.id}`}
                  >
                    Compare with version {version.revision}
                  </Link>
                  {version.id !== model.headId && (
                    <Form method="post">
                      <input type="hidden" name="operation" value="rollback" />
                      <input
                        type="hidden"
                        name="expectedVersionId"
                        value={model.headId!}
                      />
                      <input
                        type="hidden"
                        name="idempotencyKey"
                        value={model.restoreKey}
                      />
                      <input
                        type="hidden"
                        name="targetVersionId"
                        value={version.id}
                      />
                      <button
                        type="submit"
                        disabled={busy}
                        className="back-button"
                      >
                        Restore version {version.revision} as a new version
                      </button>
                    </Form>
                  )}
                </li>
              ))}
            </ol>
            {model.nextOffset !== null && (
              <Link to={`?offset=${model.nextOffset}`}>Older versions</Link>
            )}
          </section>
          {model.comparison !== null && (
            <section aria-labelledby="compare-heading">
              <h2 id="compare-heading">Fact comparison</h2>
              {model.writingComparison && (
                <WritingDiagnosticComparison
                  comparison={model.writingComparison}
                  factChanges={model.comparison}
                />
              )}
              {model.comparison.length ? (
                <ul>
                  {model.comparison.map((change) => (
                    <li key={change.id}>
                      {change.before?.value ?? "Absent"} (
                      {change.before?.state ?? "absent"}) →{" "}
                      {change.after?.value ?? "Absent"} (
                      {change.after?.state ?? "absent"})
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No fact changes.</p>
              )}
            </section>
          )}
        </>
      )}
    </WorkspaceShell>
  );
}
export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <WorkspaceShell
      eyebrow="Structured resume"
      title="Structured resume unavailable"
      description="Your saved versions have not been changed."
    >
      <p role="alert">
        {isRouteErrorResponse(error) && typeof error.data?.error === "string"
          ? error.data.error
          : "Structured content could not be loaded safely."}
      </p>
      <Link to="/upload" className="back-button">
        Return to uploads
      </Link>
    </WorkspaceShell>
  );
}
