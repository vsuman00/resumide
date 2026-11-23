import { useEffect, useRef } from "react";
import { useRevalidator } from "react-router";
import TypedAuthoringReview from "./TypedAuthoringReview";
import type {
  TypedAuthoringCommand,
  TypedAuthoringProposal,
  TypedAuthoringReceipt,
  TypedAuthoringReason,
  TypedAuthoringWorkspace,
} from "~/lib/server/typed-authoring-protocol";

const reasons = new Set<TypedAuthoringReason>([
  "invalid_input",
  "invalid_context",
  "stale_inputs",
  "incomplete_source_coverage",
  "unsupported_context",
  "target_not_editable",
  "confirmation_required",
  "ambiguous_location",
  "fragmented_source_clause",
  "missing_current_witness",
  "unsupported_action",
  "no_change",
  "writing_support_rejected",
  "unavailable",
  "invalid_result",
]);
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
const text = (value: unknown, max: number) =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const same = (left: unknown, right: unknown): boolean => {
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
};
function citation(value: unknown) {
  return (
    record(value) &&
    keys(value, [
      "attemptId",
      "spanId",
      "pageId",
      "method",
      "start",
      "end",
      "pageStart",
      "pageEnd",
    ]) &&
    uuid(value.attemptId) &&
    text(value.spanId, 200) &&
    text(value.pageId, 200) &&
    ["native_text", "local_ocr"].includes(String(value.method)) &&
    ["start", "end", "pageStart", "pageEnd"].every(
      (key) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0,
    )
  );
}
// Browser checks protect rendering and correlate the response. The owned resource
// validates policy, support and A11OP1 receipt digests on the server.
function proposal(
  value: unknown,
  workspace: TypedAuthoringWorkspace,
): value is TypedAuthoringProposal {
  if (
    !record(value) ||
    !keys(value, ["patch", "acceptCommand", "rejectCommand"]) ||
    !record(value.patch)
  )
    return false;
  const patch = value.patch;
  if (
    !keys(patch, [
      "schemaVersion",
      "id",
      "selection",
      "binding",
      "diagnosticDigest",
      "coverageDigest",
      "semanticDigest",
      "policies",
      "target",
      "transform",
      "sourceCitations",
      "before",
      "after",
      "rationale",
      "support",
      "scoreValue",
      "scoreDelta",
    ]) ||
    !["typed-authoring-patch/1.0.0", "typed-authoring-patch/1.1.0"].includes(
      String(patch.schemaVersion),
    ) ||
    !digest(patch.id) ||
    !same(patch.binding, workspace.binding) ||
    patch.diagnosticDigest !== workspace.diagnosticDigest ||
    patch.coverageDigest !== workspace.coverageDigest ||
    patch.semanticDigest !== workspace.semanticDigest ||
    !text(patch.before, 2000) ||
    !text(patch.after, 2000) ||
    patch.before === patch.after ||
    !text(patch.rationale, 500) ||
    patch.scoreValue !== null ||
    patch.scoreDelta !== null ||
    !record(patch.selection) ||
    !keys(patch.selection, [
      "canonicalVersionId",
      "requirementVersionId",
      "clauseId",
      "targetFactId",
    ]) ||
    !uuid(patch.selection.canonicalVersionId) ||
    !uuid(patch.selection.requirementVersionId) ||
    !digest(patch.selection.clauseId) ||
    !uuid(patch.selection.targetFactId) ||
    !record(patch.target) ||
    !uuid(patch.target.factId) ||
    !record(patch.policies) ||
    !record(patch.transform) ||
    !Array.isArray(patch.sourceCitations) ||
    patch.sourceCitations.length > 20 ||
    !patch.sourceCitations.every(citation) ||
    !record(patch.support)
  )
    return false;
  const support = patch.support;
  if (
    patch.schemaVersion === "typed-authoring-patch/1.1.0" &&
    (support.basis !== "candidate_declaration" ||
      patch.sourceCitations.length !== 0 ||
      typeof support.witnessId !== "string" ||
      !/^declaration-witness-[a-f0-9]{64}$/u.test(support.witnessId))
  )
    return false;
  if (
    !keys(support, [
      "basis",
      "witnessId",
      "sourceClause",
      "offsetSpace",
      "sourceSha256",
      "writingSupportVersion",
      "sourceAnchorIds",
      "operations",
    ]) ||
    !["source_quote", "candidate_declaration"].includes(
      String(support.basis),
    ) ||
    !text(support.witnessId, 100) ||
    support.sourceClause !== null ||
    support.offsetSpace !== "current_fact" ||
    !digest(support.sourceSha256) ||
    !text(support.writingSupportVersion, 100) ||
    !Array.isArray(support.sourceAnchorIds) ||
    support.sourceAnchorIds.length > 20 ||
    !support.sourceAnchorIds.every((id) => text(id, 100)) ||
    !Array.isArray(support.operations) ||
    support.operations.length > 20 ||
    !support.operations.every((operation) => text(operation, 100))
  )
    return false;
  return (["accept", "reject"] as const).every((operation) => {
    const command =
      value[operation === "accept" ? "acceptCommand" : "rejectCommand"];
    return (
      record(command) &&
      keys(command, [
        "schemaVersion",
        "operation",
        "idempotencyKey",
        "acknowledgement",
        "binding",
        "diagnosticDigest",
        "coverageDigest",
        "semanticDigest",
        "policies",
        "target",
        "clauseIds",
        "transform",
        "sourceCitations",
      ]) &&
      command.schemaVersion ===
        (patch.schemaVersion === "typed-authoring-patch/1.1.0"
          ? "typed-authoring-command/1.1.0"
          : "typed-authoring-command/1.0.0") &&
      command.operation === operation &&
      command.acknowledgement === (operation === "accept") &&
      uuid(command.idempotencyKey) &&
      same(command.clauseIds, [
        patch.selection && record(patch.selection)
          ? patch.selection.clauseId
          : null,
      ]) &&
      [
        "binding",
        "diagnosticDigest",
        "coverageDigest",
        "semanticDigest",
        "policies",
        "target",
        "transform",
        "sourceCitations",
      ].every((key) => same(command[key], patch[key]))
    );
  });
}
function receipt(
  value: unknown,
  command: TypedAuthoringCommand,
): value is TypedAuthoringReceipt {
  return (
    record(value) &&
    keys(value, [
      "schemaVersion",
      "status",
      "action",
      "idempotencyKey",
      "commandSha256",
      "baseVersionId",
      "baseRevision",
      "requirementVersionId",
      "requirementRevision",
      "versionId",
      "revision",
      "eventId",
      "idempotent",
    ]) &&
    value.schemaVersion === "typed-authoring-receipt/1.0.0" &&
    value.status === "applied" &&
    value.action === command.operation &&
    value.idempotencyKey === command.idempotencyKey &&
    digest(value.commandSha256) &&
    value.baseVersionId === command.binding.canonical.versionId &&
    value.baseRevision === command.binding.canonical.revision &&
    value.requirementVersionId === command.binding.requirements.versionId &&
    value.requirementRevision === command.binding.requirements.revision &&
    uuid(value.versionId) &&
    uuid(value.eventId) &&
    typeof value.idempotent === "boolean" &&
    value.revision ===
      command.binding.canonical.revision +
        (command.operation === "accept" ? 2 : 0) &&
    (command.operation === "accept"
      ? value.versionId !== command.binding.canonical.versionId
      : value.versionId === command.binding.canonical.versionId)
  );
}
function safeError(value: unknown) {
  if (
    record(value) &&
    keys(value, ["kind", "reason", "recovery"]) &&
    value.kind === "error" &&
    typeof value.reason === "string" &&
    reasons.has(value.reason as TypedAuthoringReason) &&
    ["retry_exact", "review_again", "unavailable"].includes(
      String(value.recovery),
    )
  )
    return {
      kind: "error" as const,
      reason: value.reason as TypedAuthoringReason,
      recovery: value.recovery as
        "retry_exact" | "review_again" | "unavailable",
    };
  return {
    kind: "error" as const,
    reason: "invalid_result" as const,
    recovery: "retry_exact" as const,
  };
}

export default function TypedAuthoringBridge({
  analysisId,
  workspace,
}: {
  analysisId: string;
  workspace: TypedAuthoringWorkspace;
}) {
  const revalidator = useRevalidator();
  const requests = useRef(new Set<AbortController>());
  const undoKeys = useRef(new Map<string, string>());
  useEffect(() => {
    const active = requests.current;
    return () => {
      for (const controller of active) controller.abort();
    };
  }, []);
  const post = async (fields: Record<string, string>): Promise<unknown> => {
    const controller = new AbortController();
    requests.current.add(controller);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let rejectAborted: () => void = () => undefined;
    const aborted = new Promise<never>((_, reject) => {
      rejectAborted = () => reject(Error("UNCONFIRMED_RESPONSE"));
      controller.signal.addEventListener("abort", rejectAborted, {
        once: true,
      });
    });
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const body = new FormData();
      for (const [key, value] of Object.entries(fields)) body.set(key, value);
      const response = await Promise.race([
        fetch(`/analysis/${encodeURIComponent(analysisId)}/author/typed`, {
          method: "POST",
          body,
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        }),
        aborted,
      ]);
      if (
        response.redirected ||
        !response.headers.get("Content-Type")?.includes("application/json")
      )
        throw Error("UNCONFIRMED_RESPONSE");
      if (!response.body) throw Error("UNCONFIRMED_RESPONSE");
      const bodyReader = response.body.getReader();
      reader = bodyReader;
      const drain = async () => {
        const chunks: Uint8Array[] = [];
        let length = 0;
        while (true) {
          const chunk = await bodyReader.read();
          if (chunk.done) break;
          length += chunk.value.byteLength;
          if (length > 131072) throw Error("UNCONFIRMED_RESPONSE");
          chunks.push(chunk.value);
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        const value: unknown = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        );
        return value;
      };
      const result = await Promise.race([drain(), aborted]);
      if (!response.ok && !(record(result) && result.kind === "error"))
        throw Error("UNCONFIRMED_RESPONSE");
      return result;
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", rejectAborted);
      controller.abort();
      if (reader) void reader.cancel().catch(() => undefined);
      requests.current.delete(controller);
    }
  };
  return (
    <>
      <p>
        This preview uses a local rule to replace one equivalent leading action
        word. Review the complete change before saving.
      </p>
      <TypedAuthoringReview
        workspace={workspace}
        busy={revalidator.state !== "idle"}
        onRequestProposal={async (selection) => {
          const result = await post({
            action: "preview",
            selection: JSON.stringify(selection),
          });
          if (record(result) && result.kind === "error") {
            const error = safeError(result);
            if (
              error.reason === "stale_inputs" &&
              error.recovery === "review_again"
            )
              return "stale_inputs";
          }
          if (
            !record(result) ||
            !keys(result, ["kind", "proposal"]) ||
            result.kind !== "proposal" ||
            !proposal(result.proposal, workspace) ||
            !same(result.proposal.patch.selection, selection)
          )
            throw Error("UNCONFIRMED_PROPOSAL");
          return result.proposal;
        }}
        onDecision={async (command, acknowledgement) => {
          try {
            const result = await post({
              action: "decision",
              command: JSON.stringify(command),
              ...(acknowledgement === "accepted"
                ? { reviewAcknowledgement: "accepted" }
                : {}),
            });
            if (
              record(result) &&
              keys(result, ["kind", "receipt"]) &&
              result.kind === "applied" &&
              receipt(result.receipt, command)
            ) {
              revalidator.revalidate();
              return { kind: "applied", receipt: result.receipt };
            }
            return safeError(result);
          } catch {
            return {
              kind: "error",
              reason: "unavailable",
              recovery: "retry_exact",
            };
          }
        }}
        onUndo={async (saved) => {
          let key = undoKeys.current.get(saved.eventId);
          if (!key) {
            key = crypto.randomUUID();
            undoKeys.current.set(saved.eventId, key);
          }
          const result = await post({
            action: "undo",
            receipt: JSON.stringify(saved),
            idempotencyKey: key,
          });
          if (
            !record(result) ||
            !keys(result, ["kind", "receipt", "idempotencyKey"]) ||
            result.kind !== "undone" ||
            result.idempotencyKey !== key ||
            !record(result.receipt) ||
            !keys(result.receipt, [
              "status",
              "action",
              "versionId",
              "revision",
              "eventId",
              "idempotent",
            ]) ||
            result.receipt.status !== "applied" ||
            result.receipt.action !== "undo" ||
            !uuid(result.receipt.versionId) ||
            result.receipt.versionId === saved.versionId ||
            result.receipt.versionId === saved.baseVersionId ||
            result.receipt.revision !== saved.revision + 1 ||
            !uuid(result.receipt.eventId) ||
            typeof result.receipt.idempotent !== "boolean"
          )
            throw Error("UNCONFIRMED_UNDO");
          revalidator.revalidate();
        }}
      />
    </>
  );
}
