import { useEffect, useId, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import ResumeWriter from "./ResumeWriter";
import type {
  CanonicalRewriteWorkspace,
  CanonicalRewriteRequest,
  CanonicalRewritePublication,
  CanonicalRewriteResult,
  CanonicalRewriteReceipt,
} from "~/lib/server/canonical-rewrite-contract";

import type {
  CanonicalRewriteWorkspaceState,
  CanonicalRewriteWorkspaceSelection,
} from "~/lib/server/canonical-rewrite-workspace";

type Initialization = Extract<
  CanonicalRewriteWorkspaceState,
  { status: "initialization_required" }
>;
type RequestMetadata = Readonly<CanonicalRewriteRequest>;
type CurrentSelection = Omit<RequestMetadata, "schemaVersion" | "operationId">;
const sameRequest = (left: RequestMetadata, right: RequestMetadata) =>
  left.schemaVersion === right.schemaVersion &&
  left.operationId === right.operationId &&
  left.canonicalVersionId === right.canonicalVersionId &&
  left.requirementVersionId === right.requirementVersionId &&
  left.draftId === right.draftId &&
  left.expectedDraftUpdatedAt === right.expectedDraftUpdatedAt;
const newRequest = (selection: CurrentSelection): RequestMetadata =>
  Object.freeze({
    schemaVersion: "canonical-rewrite-request/1.0.0",
    operationId: crypto.randomUUID(),
    canonicalVersionId: selection.canonicalVersionId,
    requirementVersionId: selection.requirementVersionId,
    draftId: selection.draftId,
    expectedDraftUpdatedAt: selection.expectedDraftUpdatedAt,
  });

/** One bounded browser attempt. A server-owned operation controls dispatch and
 * publication; this helper never retries, rebases or infers success from text. */
async function postRewrite(
  analysisId: string,
  body: FormData,
  signal: AbortSignal,
  path: "rewrite" | "rewrite/workspace" = "rewrite",
): Promise<unknown> {
  const controller = new AbortController();
  const deadline = Date.now() + 30000;
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  let rejectAborted: () => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectAborted = () => reject(Error("REWRITE_NOT_CONFIRMED"));
    controller.signal.addEventListener("abort", rejectAborted, { once: true });
  });
  const timer = setTimeout(cancel, 30000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const active = () => {
    if (signal.aborted || controller.signal.aborted || Date.now() >= deadline)
      throw Error("REWRITE_NOT_CONFIRMED");
  };
  try {
    active();
    const response = await Promise.race([
      fetch(`/analysis/${encodeURIComponent(analysisId)}/${path}`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        headers: { Accept: "application/json" },
        body,
        signal: controller.signal,
      }),
      aborted,
    ]);
    active();
    if (
      response.redirected ||
      !response.body ||
      !response.headers.get("Content-Type")?.includes("application/json")
    )
      throw Error("REWRITE_NOT_CONFIRMED");
    const bodyReader = response.body.getReader();
    reader = bodyReader;
    const drain = async () => {
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for (;;) {
        const chunk = await bodyReader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 1_048_576) throw Error("REWRITE_NOT_CONFIRMED");
        chunks.push(chunk.value);
      }
      const joined = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const result: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(joined),
      );
      return result;
    };
    const result = await Promise.race([drain(), aborted]);
    active();
    if (
      !response.ok &&
      (!record(result) || !["error", "pending"].includes(String(result.kind)))
    )
      throw Error("REWRITE_NOT_CONFIRMED");
    return result;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", rejectAborted);
    controller.abort();
    if (reader) void reader.cancel().catch(() => undefined);
  }
}

type AttemptOutcome =
  | { state: "saved"; receipt: CanonicalRewriteReceipt }
  | {
      state: "retry_exact" | "review_again" | "unavailable";
      message: string;
      signInRequired?: boolean;
    };
type Attempt = {
  request: RequestMetadata;
  scope: string;
  workspace: CanonicalRewriteWorkspace;
};

/** Request state is separate from saved draft rendering. A failure cannot
 * clear a prior draft, replace its provenance, or silently select newer inputs. */
function useRewriteAttempt(
  analysisId: string,
  ownerScope: string,
  current: CurrentSelection | null,
  workspace: CanonicalRewriteWorkspace | null,
  serialize: (request: RequestMetadata) => FormData,
  inspect: (response: unknown, attempt: Attempt) => AttemptOutcome,
  sharedBusy: { current: boolean },
) {
  const revalidator = useRevalidator();
  const latestScope = useRef(ownerScope);
  latestScope.current = ownerScope;
  const active = sharedBusy;
  const controller = useRef<AbortController | null>(null);
  const pendingRef = useRef<Attempt | null>(null);
  const [pending, setPending] = useState<Attempt | null>(null);
  const [outcome, setOutcome] = useState<AttemptOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const inputScope = JSON.stringify([current, workspace?.bindingSha256]);
  useEffect(() => {
    setConsent(false);
  }, [inputScope]);
  useEffect(() => {
    controller.current?.abort();
    pendingRef.current = null;
    setPending(null);
    setOutcome(null);
    setConsent(false);
  }, [ownerScope]);
  useEffect(() => {
    const reset = () => setConsent(false);
    window.addEventListener("pageshow", reset);
    return () => {
      window.removeEventListener("pageshow", reset);
      controller.current?.abort();
    };
  }, []);
  const submit = async (retry: boolean) => {
    if (active.current || !consent || (!retry && !current)) return;
    const original = retry
      ? pendingRef.current
      : current && workspace
        ? { request: newRequest(current), scope: ownerScope, workspace }
        : null;
    if (!original || original.scope !== ownerScope) return;
    if (!retry && pendingRef.current && outcome?.state !== "review_again")
      return;
    active.current = true;
    setBusy(true);
    setConsent(false);
    setOutcome(null);
    pendingRef.current = original;
    setPending(original);
    const requestController = new AbortController();
    controller.current = requestController;
    try {
      const response = await postRewrite(
        analysisId,
        serialize(original.request),
        requestController.signal,
      );
      if (
        latestScope.current !== original.scope ||
        !pendingRef.current ||
        !sameRequest(pendingRef.current.request, original.request)
      )
        return;
      const next = inspect(response, original);
      setOutcome(next);
      if (next.state === "saved") {
        pendingRef.current = null;
        setPending(null);
        void revalidator.revalidate();
      }
    } catch {
      if (latestScope.current === original.scope)
        setOutcome({
          state: "retry_exact",
          message:
            "The writing request could not be confirmed. Keep this exact request and review your saved drafts before retrying.",
        });
    } finally {
      active.current = false;
      setBusy(false);
      if (controller.current === requestController) controller.current = null;
    }
  };
  return {
    pending,
    outcome,
    busy: busy || revalidator.state !== "idle",
    consent,
    setConsent,
    submit,
  };
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).length === expected.length &&
  expected.every((key) => Object.hasOwn(value, key));
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(
    value,
  );
const digest = (value: unknown) =>
  typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const isoTimestamp = (value: unknown) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?Z$/u.test(value) &&
  Number.isFinite(Date.parse(value));
const boundedText = (value: unknown, maximum: number) =>
  typeof value === "string" && value.length > 0 && value.length <= maximum;
function same(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length &&
      left.every((value, index) => same(value, right[index]))
    );
  return (
    record(left) &&
    record(right) &&
    keys(left, Object.keys(right)) &&
    Object.keys(left).every((key) => same(left[key], right[key]))
  );
}
function validItem(
  value: unknown,
  workspace: CanonicalRewriteWorkspace,
  summary: boolean,
) {
  if (
    !record(value) ||
    !keys(value, [
      "source",
      "clauseId",
      "operation",
      "replacementAction",
      "before",
      "after",
      "rationale",
      "supportPolicyVersion",
    ]) ||
    !record(value.source) ||
    !boundedText(value.before, 2000) ||
    !boundedText(value.after, 2000) ||
    !boundedText(value.rationale, 500) ||
    value.supportPolicyVersion !==
      workspace.binding.policy.writingSupportVersion
  )
    return false;
  const itemSource = value.source;
  const source = workspace.sources.find(
    (item) => item.sourceId === itemSource.sourceId,
  );
  if (
    !source ||
    !same(value.source, source) ||
    value.before !== source.value ||
    !source.clauseIds.includes(String(value.clauseId))
  )
    return false;
  if (value.operation === "copy")
    return value.replacementAction === null && value.after === value.before;
  if (
    summary ||
    value.operation !== "equivalent_action" ||
    !["Built", "Created", "Developed"].includes(String(value.replacementAction))
  )
    return false;
  const match =
    /^(Built|Created|Developed|built|created|developed)(?=[\t ])/u.exec(
      source.value,
    );
  if (
    !match ||
    match[1].toLowerCase() === String(value.replacementAction).toLowerCase()
  )
    return false;
  const word =
    match[1] === match[1].toLowerCase()
      ? String(value.replacementAction).toLowerCase()
      : String(value.replacementAction);
  return value.after === word + source.value.slice(match[1].length);
}
/** Structural browser correlation only. Native result hashes, publication and
 * candidate access are independently validated by the owned server boundary. */
function publicationMatches(
  value: unknown,
  attempt: Attempt,
): value is CanonicalRewritePublication {
  if (
    !record(value) ||
    !keys(value, ["result", "receipt"]) ||
    !record(value.result) ||
    !record(value.receipt)
  )
    return false;
  const result = value.result,
    receipt = value.receipt,
    { request, workspace } = attempt;
  if (
    !keys(result, [
      "schemaVersion",
      "operationId",
      "bindingSha256",
      "binding",
      "summary",
      "bullets",
    ]) ||
    result.schemaVersion !== "canonical-rewrite-result/1.0.0" ||
    result.operationId !== request.operationId ||
    result.bindingSha256 !== workspace.bindingSha256 ||
    !same(result.binding, workspace.binding) ||
    !Array.isArray(result.bullets) ||
    result.bullets.length > 4 ||
    !result.bullets.every((item) => validItem(item, workspace, false)) ||
    (result.summary !== null && !validItem(result.summary, workspace, true)) ||
    (result.summary === null && result.bullets.length === 0)
  )
    return false;
  return (
    keys(receipt, [
      "schemaVersion",
      "state",
      "operationId",
      "bindingSha256",
      "runId",
      "draftId",
      "draftVersionId",
      "revision",
      "draftUpdatedAt",
      "resultSha256",
      "projectionSha256",
      "idempotent",
    ]) &&
    receipt.schemaVersion === "canonical-rewrite-receipt/1.0.0" &&
    receipt.state === "saved_proposals" &&
    receipt.operationId === request.operationId &&
    receipt.bindingSha256 === workspace.bindingSha256 &&
    receipt.draftId === request.draftId &&
    uuid(receipt.runId) &&
    uuid(receipt.draftVersionId) &&
    receipt.draftVersionId !== workspace.binding.draft.versionId &&
    receipt.revision === workspace.binding.draft.revision + 1 &&
    isoTimestamp(receipt.draftUpdatedAt) &&
    digest(receipt.resultSha256) &&
    digest(receipt.projectionSha256) &&
    typeof receipt.idempotent === "boolean"
  );
}
const rewriteFailureMessages = new Map<string, string>([
  [
    "unauthenticated",
    "Your Resumide session has ended. Sign in before retrying the retained request.",
  ],
  [
    "stale_inputs",
    "The saved resume, job requirements or draft changed. Review the current versions before starting a new request. Your earlier drafts remain available.",
  ],
  [
    "unsupported_output",
    "The returned wording could not be supported by these saved claims. Your previous drafts remain available.",
  ],
  [
    "cancelled",
    "The writing request was cancelled. Review your saved drafts before another request.",
  ],
  [
    "provider_auth",
    "Writing suggestions are unavailable for this deployment. Review any saved drafts.",
  ],
  [
    "provider_transient",
    "The AI service had a temporary problem. Review your saved drafts and try again later.",
  ],
  [
    "provider_rate_limited",
    "The AI service is temporarily limiting requests. Wait before asking again.",
  ],
  [
    "provider_timeout",
    "The writing request timed out. Review your saved drafts before asking again.",
  ],
  [
    "provider_refused",
    "The AI provider declined this request. Review the saved claims before asking again.",
  ],
  [
    "invalid_provider_output",
    "The AI response could not be used safely. Your saved drafts are available to review.",
  ],
]);
const reasons = new Set([
  ...rewriteFailureMessages.keys(),
  "invalid_input",
  "not_found",
  "disabled",
  "unavailable",
  "pending",
  "invalid_result",
]);
function inspectResponse(response: unknown, attempt: Attempt): AttemptOutcome {
  if (
    record(response) &&
    keys(response, ["kind", "publication"]) &&
    response.kind === "saved" &&
    publicationMatches(response.publication, attempt)
  )
    return { state: "saved", receipt: response.publication.receipt };
  if (
    record(response) &&
    keys(response, ["kind", "operationId", "state"]) &&
    response.kind === "pending" &&
    response.operationId === attempt.request.operationId &&
    ["reserved", "dispatched", "unknown"].includes(String(response.state))
  )
    return {
      state: "retry_exact",
      message:
        "This request has no confirmed saved result yet. Review your saved drafts. A manual retry checks the same request; it does not start another generation automatically.",
    };
  if (
    record(response) &&
    keys(response, ["kind", "reason", "recovery"]) &&
    response.kind === "error" &&
    typeof response.reason === "string" &&
    reasons.has(response.reason) &&
    ["retry_exact", "review_again", "unavailable"].includes(
      String(response.recovery),
    )
  ) {
    const state = response.recovery as
      "retry_exact" | "review_again" | "unavailable";
    return {
      state,
      message:
        rewriteFailureMessages.get(response.reason) ??
        "Generating or saving the drafts could not be confirmed. Your previous drafts remain available.",
      signInRequired: response.reason === "unauthenticated",
    };
  }
  return {
    state: "retry_exact",
    message:
      "The returned result did not match this request. Keep the exact request and check your saved drafts before retrying.",
  };
}

type SetupAttempt = {
  selection: Readonly<CanonicalRewriteWorkspaceSelection>;
  binding: Initialization["binding"];
  scope: string;
};
type SetupOutcome =
  | { state: "ready" }
  | { state: "retry_exact" | "review_again" | "unavailable"; message: string };
/** Only confirmation metadata is consumed. The returned workspace is never
 * adopted for generation; a fresh owned loader read must supply its tokens. */
function setupConfirmed(raw: unknown, attempt: SetupAttempt): boolean {
  if (
    !record(raw) ||
    !keys(raw, ["kind", "created", "workspace"]) ||
    raw.kind !== "workspace_initialized" ||
    typeof raw.created !== "boolean" ||
    !record(raw.workspace)
  )
    return false;
  const workspace = raw.workspace;
  if (
    !keys(workspace, [
      "schemaVersion",
      "binding",
      "bindingSha256",
      "sources",
      "clauses",
      "canGenerate",
      "saved",
    ]) ||
    workspace.schemaVersion !== "canonical-rewrite-workspace/1.0.0" ||
    !digest(workspace.bindingSha256) ||
    !record(workspace.binding) ||
    !keys(workspace.binding, ["authoring", "draft", "policy"]) ||
    !same(workspace.binding.authoring, attempt.binding) ||
    !record(workspace.binding.draft) ||
    !record(workspace.binding.policy) ||
    !Array.isArray(workspace.sources) ||
    workspace.sources.length > 32 ||
    !Array.isArray(workspace.clauses) ||
    workspace.clauses.length > 300 ||
    typeof workspace.canGenerate !== "boolean" ||
    !record(workspace.saved)
  )
    return false;
  const draft = workspace.binding.draft,
    policy = workspace.binding.policy,
    saved = workspace.saved;
  if (
    !keys(draft, [
      "id",
      "updatedAt",
      "contentSha256",
      "versionId",
      "revision",
      "headId",
    ]) ||
    !uuid(draft.id) ||
    !isoTimestamp(draft.updatedAt) ||
    !digest(draft.contentSha256) ||
    typeof draft.revision !== "number" ||
    !Number.isInteger(draft.revision) ||
    draft.revision < 0 ||
    draft.revision > 2147483647 ||
    draft.versionId !== draft.headId ||
    (draft.revision === 0 ? draft.versionId !== null : !uuid(draft.versionId))
  )
    return false;
  if (
    !keys(policy, [
      "version",
      "sha256",
      "promptVersion",
      "writingSupportVersion",
      "model",
    ]) ||
    !digest(policy.sha256) ||
    ![
      policy.version,
      policy.promptVersion,
      policy.writingSupportVersion,
      policy.model,
    ].every((value) => boundedText(value, 100))
  )
    return false;
  if (
    !keys(saved, ["state", "publication", "legacyDraft"]) ||
    !["legacy_unbound", "current", "historical"].includes(String(saved.state))
  )
    return false;
  if (saved.state === "legacy_unbound") {
    if (
      saved.publication !== null ||
      !record(saved.legacyDraft) ||
      !keys(saved.legacyDraft, ["summary", "bullets"]) ||
      (saved.legacyDraft.summary !== null &&
        !boundedText(saved.legacyDraft.summary, 1200)) ||
      !Array.isArray(saved.legacyDraft.bullets) ||
      saved.legacyDraft.bullets.length > 4
    )
      return false;
  } else if (
    saved.legacyDraft !== null ||
    !record(saved.publication) ||
    !keys(saved.publication, ["result", "receipt"])
  )
    return false;
  return (
    !raw.created ||
    (draft.revision === 0 &&
      draft.versionId === null &&
      draft.headId === null &&
      same(saved, {
        state: "legacy_unbound",
        publication: null,
        legacyDraft: { summary: null, bullets: [] },
      }))
  );
}
function useWorkspaceSetup(
  analysisId: string,
  ownerScope: string,
  initialization: Initialization | null,
  sharedBusy: { current: boolean },
) {
  const revalidator = useRevalidator();
  const latestScope = useRef(ownerScope);
  latestScope.current = ownerScope;
  const controller = useRef<AbortController | null>(null);
  const pendingRef = useRef<SetupAttempt | null>(null);
  const [pending, setPending] = useState<SetupAttempt | null>(null);
  const [outcome, setOutcome] = useState<SetupOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    controller.current?.abort();
    pendingRef.current = null;
    setPending(null);
    setOutcome(null);
  }, [ownerScope]);
  useEffect(() => () => controller.current?.abort(), []);
  const submit = async (retry: boolean) => {
    if (sharedBusy.current || revalidator.state !== "idle") return;
    const original = retry
      ? pendingRef.current
      : initialization?.canInitialize
        ? {
            selection: Object.freeze({
              canonicalVersionId: initialization.binding.canonical.versionId,
              requirementVersionId:
                initialization.binding.requirements.versionId,
            }),
            binding: initialization.binding,
            scope: ownerScope,
          }
        : null;
    if (
      !original ||
      original.scope !== ownerScope ||
      (!retry && pendingRef.current && outcome?.state !== "review_again")
    )
      return;
    sharedBusy.current = true;
    setBusy(true);
    setOutcome(null);
    pendingRef.current = original;
    setPending(original);
    const requestController = new AbortController();
    controller.current = requestController;
    try {
      const form = new FormData();
      form.set("canonicalVersionId", original.selection.canonicalVersionId);
      form.set("requirementVersionId", original.selection.requirementVersionId);
      const response = await postRewrite(
        analysisId,
        form,
        requestController.signal,
        "rewrite/workspace",
      );
      if (
        latestScope.current !== original.scope ||
        pendingRef.current !== original
      )
        return;
      if (setupConfirmed(response, original)) {
        setOutcome({ state: "ready" });
        pendingRef.current = null;
        setPending(null);
        void revalidator.revalidate();
      } else if (
        record(response) &&
        keys(response, ["kind", "reason", "recovery"]) &&
        response.kind === "error" &&
        typeof response.reason === "string" &&
        reasons.has(response.reason) &&
        ["retry_exact", "review_again", "unavailable"].includes(
          String(response.recovery),
        )
      ) {
        setOutcome({
          state: response.recovery as
            "retry_exact" | "review_again" | "unavailable",
          message:
            response.reason === "stale_inputs"
              ? "The saved input versions changed. Review the current versions before setting up the writing workspace."
              : "Workspace setup could not be confirmed. Your saved drafts and retained writing request have not been replaced.",
        });
      } else
        setOutcome({
          state: "retry_exact",
          message:
            "The setup response did not match these saved inputs. Retry the same setup request manually; no writing drafts have been generated.",
        });
    } catch {
      if (latestScope.current === original.scope)
        setOutcome({
          state: "retry_exact",
          message:
            "Workspace setup could not be confirmed. A manual retry uses the same saved input versions; no generation is started automatically.",
        });
    } finally {
      sharedBusy.current = false;
      setBusy(false);
      if (controller.current === requestController) controller.current = null;
    }
  };
  return {
    pending,
    outcome,
    busy: busy || revalidator.state !== "idle",
    submit,
  };
}

function SavedItem({
  item,
  binding,
  summary,
}: {
  item: CanonicalRewriteResult["bullets"][number];
  binding: CanonicalRewriteResult["binding"];
  summary: boolean;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const source = item.source,
    base = `/analysis/${binding.authoring.source.analysisId}`;
  return (
    <article className="rewrite-bullet">
      <h4>
        {summary
          ? "Summary copy"
          : item.operation === "copy"
            ? "Exact copy for review"
            : "Writing draft"}
      </h4>
      <p>
        {source.basis === "source_quote"
          ? "Basis: quoted source claim, not independent verification."
          : "Basis: your recorded declaration, not independent source verification."}
      </p>
      <h5>Saved original claim</h5>
      <blockquote className="whitespace-pre-wrap break-words">
        {item.before}
      </blockquote>
      <h5>Saved draft wording</h5>
      <blockquote className="whitespace-pre-wrap break-words">
        {item.after}
      </blockquote>
      <p>{item.rationale}</p>
      {item.operation === "copy" && (
        <p>This wording is an exact copy. No wording improvement is claimed.</p>
      )}
      <p>
        Confirmation recorded on{" "}
        <time dateTime={source.confirmation.confirmedAt}>
          {source.confirmation.confirmedAt}
        </time>
        .
      </p>
      {source.basis === "candidate_declaration" && (
        <p>No current source quote is linked to this recorded declaration.</p>
      )}
      <p>
        <a
          href={`${base}/canonical?version=${binding.authoring.canonical.versionId}#fact-${source.factId}`}
        >
          Inspect pinned claim
        </a>
      </p>
      <button
        type="button"
        className="back-button"
        onClick={() => {
          setCopied(null);
          setCopyError(false);
          void Promise.resolve()
            .then(() => {
              if (!navigator.clipboard) throw Error("COPY_UNAVAILABLE");
              return navigator.clipboard.writeText(item.after);
            })
            .then(
              () => setCopied(item.after),
              () => setCopyError(true),
            );
        }}
      >
        {copied === item.after ? "Copied" : "Copy draft"}
      </button>
      {copyError && (
        <p role="alert">
          The draft could not be copied. Select the wording and copy it
          manually.
        </p>
      )}
      <details>
        <summary>Claim and source references</summary>
        <p>
          Recorded confirmation actor:{" "}
          <code>{source.confirmation.actorId}</code>. Fact:{" "}
          <code>{source.factId}</code>.
        </p>
        <p>
          Writing support policy: <code>{item.supportPolicyVersion}</code>.
        </p>
        {source.currentCitations.map((citation, index) => (
          <p key={`${citation.spanId}:${index}`}>
            <a
              href={`${base}/evidence#source-${encodeURIComponent(citation.spanId)}`}
            >
              Inspect cited source
            </a>
            , characters {citation.start} to {citation.end}.
          </p>
        ))}
      </details>
    </article>
  );
}
function SavedDrafts({ workspace }: { workspace: CanonicalRewriteWorkspace }) {
  const { saved } = workspace;
  if (saved.state === "legacy_unbound")
    return saved.legacyDraft &&
      (saved.legacyDraft.summary || saved.legacyDraft.bullets.length > 0) ? (
      <ResumeWriter writer={saved.legacyDraft} />
    ) : (
      <p>No version-bound writing drafts are saved here yet.</p>
    );
  const publication = saved.publication;
  if (!publication)
    return (
      <p>
        Saved writing drafts could not be loaded. Review the saved versions
        before using any earlier wording.
      </p>
    );
  const { result, receipt } = publication,
    base = `/analysis/${result.binding.authoring.source.analysisId}`;
  return (
    <section aria-label="Saved writing drafts">
      <h3>Saved writing drafts</h3>
      <p role="status">
        {saved.state === "current"
          ? "These drafts are bound to the displayed input versions."
          : "These drafts were saved from earlier input versions or settings. Review their pinned references before copying."}
      </p>
      <p>
        <a
          href={`${base}/canonical?version=${result.binding.authoring.canonical.versionId}`}
        >
          Pinned resume version
        </a>
        {" · "}
        <a
          href={`${base}/requirements?version=${result.binding.authoring.requirements.versionId}`}
        >
          Pinned job requirements
        </a>
      </p>
      <p>
        Copying a draft does not save a resume edit, confirm a fact or improve a
        score.
      </p>
      {result.summary && (
        <SavedItem item={result.summary} binding={result.binding} summary />
      )}
      {result.bullets.map((item, index) => (
        <SavedItem
          key={`${receipt.draftVersionId}:${index}`}
          item={item}
          binding={result.binding}
          summary={false}
        />
      ))}
      <details>
        <summary>Saved draft references</summary>
        <p>
          Draft revision {receipt.revision}; version{" "}
          <code>{receipt.draftVersionId}</code>. Saved on{" "}
          <time dateTime={receipt.draftUpdatedAt}>
            {receipt.draftUpdatedAt}
          </time>
          .
        </p>
        <p>
          Run: <code>{receipt.runId}</code>; operation:{" "}
          <code>{receipt.operationId}</code>.
        </p>
      </details>
    </section>
  );
}

export default function CanonicalRewritePanel({
  analysisId,
  workspace,
  initialization = null,
  ownerId,
}: {
  analysisId: string;
  workspace: CanonicalRewriteWorkspace | null;
  initialization?: Initialization | null;
  ownerId?: string;
}) {
  const heading = useId();
  const available =
    workspace &&
    workspace.binding.authoring.source.analysisId === analysisId &&
    (!ownerId || workspace.binding.authoring.source.ownerId === ownerId)
      ? workspace
      : null;
  const missing =
    !available &&
    initialization?.binding.source.analysisId === analysisId &&
    (!ownerId || initialization.binding.source.ownerId === ownerId)
      ? initialization
      : null;
  const source = available?.binding.authoring.source ?? missing?.binding.source;
  const rememberedScope = useRef<{
    analysisId: string;
    ownerId: string;
    organizationId: string;
  } | null>(null);
  if (source)
    rememberedScope.current = {
      analysisId,
      ownerId: source.ownerId,
      organizationId: source.organizationId,
    };
  const priorScope =
    rememberedScope.current?.analysisId === analysisId &&
    (!ownerId || rememberedScope.current.ownerId === ownerId)
      ? rememberedScope.current
      : null;
  const ownerScope = JSON.stringify([
    analysisId,
    ownerId ?? source?.ownerId ?? priorScope?.ownerId,
    source?.organizationId ?? priorScope?.organizationId,
  ]);
  const sharedBusy = useRef(false);
  const setup = useWorkspaceSetup(analysisId, ownerScope, missing, sharedBusy);
  const current = available?.canGenerate
    ? {
        canonicalVersionId: available.binding.authoring.canonical.versionId,
        requirementVersionId:
          available.binding.authoring.requirements.versionId,
        draftId: available.binding.draft.id,
        expectedDraftUpdatedAt: available.binding.draft.updatedAt,
      }
    : null;
  const attempt = useRewriteAttempt(
    analysisId,
    ownerScope,
    current,
    available,
    (request) => {
      const form = new FormData();
      form.set("request", JSON.stringify(request));
      form.set("aiConsent", "accepted");
      return form;
    },
    inspectResponse,
    sharedBusy,
  );
  const retry = attempt.pending && attempt.outcome?.state === "retry_exact";
  const setupRetry = Boolean(
    setup.pending && setup.outcome?.state === "retry_exact",
  );
  const setupBlocked = Boolean(
    setup.pending && setup.outcome?.state !== "review_again",
  );
  const busy = attempt.busy || setup.busy;
  const freshBlocked = Boolean(
    attempt.pending && attempt.outcome?.state !== "review_again",
  );
  return (
    <section aria-labelledby={heading} className="account-card">
      <h2 id={heading}>Writing drafts from saved claims</h2>
      <p>
        Generate wording from your confirmed saved claims and the selected job
        requirements. Review every draft before copying it into a separate
        resume edit. Scores and proficiency remain unassessed.
      </p>
      {!available && !missing && (
        <p role="status">
          The writing workspace is unavailable. Reload to review the saved input
          versions.
        </p>
      )}
      {available && <SavedDrafts workspace={available} />}
      {(missing || setup.pending) && (
        <section aria-label="Writing workspace setup">
          <h3>Set up the writing workspace</h3>
          <p>
            Setup creates an empty writing space for these saved resume and
            job-requirement versions. It does not generate text or send data to
            the AI provider.
          </p>
          {missing && !missing.canInitialize && !setupRetry && (
            <p role="status">
              Setup is unavailable from this view. Review the current saved
              versions before trying again.
            </p>
          )}
          {setup.pending && (
            <details>
              <summary>Retained workspace setup request</summary>
              <p>A manual retry keeps the original selected input versions.</p>
              <p>
                <a
                  href={`/analysis/${analysisId}/canonical?version=${setup.pending.selection.canonicalVersionId}`}
                >
                  Resume version for setup
                </a>
                {" · "}
                <a
                  href={`/analysis/${analysisId}/requirements?version=${setup.pending.selection.requirementVersionId}`}
                >
                  Job requirements for setup
                </a>
              </p>
            </details>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy) void setup.submit(setupRetry);
            }}
          >
            <button
              type="submit"
              className="primary-button"
              disabled={
                busy ||
                (!setupRetry && (!missing?.canInitialize || setupBlocked))
              }
            >
              {setupRetry
                ? "Retry workspace setup"
                : "Set up writing workspace"}
            </button>
          </form>
        </section>
      )}
      {setup.busy && (
        <p role="status">
          Setting up the writing workspace. No writing drafts are being
          generated.
        </p>
      )}
      {setup.outcome?.state === "ready" && (
        <p role="status">
          The writing workspace is ready. Review the saved inputs before
          choosing Generate writing drafts.
        </p>
      )}
      {setup.outcome && setup.outcome.state !== "ready" && (
        <p role="alert">{setup.outcome.message}</p>
      )}

      {available && !available.canGenerate && (
        <p role="status">
          New drafts cannot be generated from this view. Saved drafts remain
          available for review.
        </p>
      )}
      {attempt.busy && (
        <p role="status">
          The writing request is pending. No new saved result is being assumed.
        </p>
      )}
      {attempt.outcome?.state === "saved" && (
        <p role="status">
          Writing drafts were saved for review. This does not save edits to your
          resume.
        </p>
      )}
      {attempt.outcome && attempt.outcome.state !== "saved" && (
        <div>
          <p role="alert">{attempt.outcome.message}</p>
          {attempt.outcome.signInRequired && (
            <a
              href={`/auth?next=${encodeURIComponent(`/analysis/${analysisId}/score`)}`}
              target="_blank"
              rel="noopener"
            >
              Sign in in a new tab
            </a>
          )}
        </div>
      )}
      {attempt.pending && (
        <details>
          <summary>Retained writing request</summary>
          <p>
            The exact request is kept while this page stays open.
            {retry &&
              " Retrying uses its original input versions and operation key."}
          </p>
          <p>
            Operation: <code>{attempt.pending.request.operationId}</code>.
            Resume: <code>{attempt.pending.request.canonicalVersionId}</code>.
            Job requirements:{" "}
            <code>{attempt.pending.request.requirementVersionId}</code>.
          </p>
        </details>
      )}
      {(!missing || attempt.pending) && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void attempt.submit(Boolean(retry));
          }}
        >
          <fieldset disabled={busy || (!retry && (!current || freshBlocked))}>
            <legend>
              {retry
                ? "Review the exact retained writing request"
                : "Request writing drafts"}
            </legend>
            <label htmlFor={`${heading}-consent`}>
              <input
                id={`${heading}-consent`}
                type="checkbox"
                name="aiConsent"
                value="accepted"
                required
                checked={attempt.consent}
                onChange={(event) =>
                  attempt.setConsent(event.currentTarget.checked)
                }
              />
              I agree to send these saved resume claims and job requirements to
              the AI provider for writing drafts.
            </label>
            <button
              type="submit"
              className="primary-button"
              disabled={
                busy ||
                !attempt.consent ||
                (!retry && (!current || freshBlocked))
              }
            >
              {retry
                ? "Retry exact writing request"
                : "Generate writing drafts"}
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
