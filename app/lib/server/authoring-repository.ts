import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { createSupabaseAdminClient } from "./supabase";
import { loadCanonical, CanonicalError } from "./canonical-repository";
import { reviseCanonical, rollbackCanonical } from "./canonical-content";
import {
  AuthoringCommandSchema,
  BulletPattern,
  buildFindings,
  buildSuggestion,
  validateSuggestion,
  clarifyValue,
  withheldDelta,
  type AuthoringCommand,
} from "./authoring-contract";
import { loadScoreDiagnostics } from "./score-v2-repository";
type Client = Pick<
  ReturnType<typeof createSupabaseAdminClient>,
  "from" | "rpc"
>;
const event = z.object({
  id: z.uuid(),
  action: z.enum([
    "edit",
    "confirm",
    "rename",
    "clarify",
    "accept",
    "reject",
    "undo",
    "restore",
  ]),
  base_version_id: z.uuid(),
  result_version_id: z.uuid().nullable(),
  created_at: z.iso.datetime({ offset: true }),
  command: z.unknown(),
});
export async function loadAuthoring(
  client: Client,
  analysisId: string,
  ownerId: string,
  model: Awaited<ReturnType<typeof loadScoreDiagnostics>>,
  focus?: string,
) {
  const c = await loadCanonical(client, analysisId, ownerId, {
    versionId: model.canonical.versionId,
  });
  if (!c.current || c.headId !== model.canonical.headId)
    throw new CanonicalError(409, "The resume changed. Reload before editing.");
  const doc = c.current.document;
  const events = await client
    .from("authoring_events")
    .select("id,action,base_version_id,result_version_id,created_at,command")
    .eq("analysis_id", analysisId)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(20);
  const parsed = z.array(event).safeParse(events.data);
  if (events.error || !parsed.success)
    throw new CanonicalError(503, "Authoring history is unavailable.");
  if (
    focus &&
    (!z.uuid().safeParse(focus).success ||
      !doc.facts.some((f) => f.id === focus && f.type === "contribution"))
  )
    throw new CanonicalError(422, "Choose an existing contribution to review.");
  const selected =
    focus ?? doc.facts.find((f) => f.type === "contribution")?.id;
  const patches =
    selected && model.diagnostics.readiness.state !== "unsupported"
      ? BulletPattern.options
          .map((pattern) => {
            try {
              return buildSuggestion(doc, selected, pattern, model.diagnostics);
            } catch {
              return null;
            }
          })
          .filter((p) => p !== null)
      : [];
  return {
    document: doc,
    editable: doc.versionId === c.headId,
    findings: buildFindings(doc, model.diagnostics),
    patches,
    selectedFactId: selected ?? null,
    events: parsed.data,
    history: c.history,
    nextOffset: c.nextOffset,
    formKey: randomUUID(),
    formKeys: Object.fromEntries([
      ...doc.facts.flatMap((f) =>
        ["edit", "confirm"].map((action) => [
          `${action}:${f.id}`,
          randomUUID(),
        ]),
      ),
      ...doc.sections.map((s) => [`rename:${s.id}`, randomUUID()]),
      ...["result", "measurement", "scope", "method", "ownership"].map(
        (kind) => [`clarify:${selected}:${kind}`, randomUUID()],
      ),
      ...patches.flatMap((p) =>
        ["accept", "reject"].map((action) => [
          `${action}:${p.id}`,
          randomUUID(),
        ]),
      ),
      ...c.history.map((v) => [`restore:${v.id}`, randomUUID()]),
      ["undo:undo", randomUUID()],
    ]),
    projected: withheldDelta(
      doc.versionId,
      null,
      model.diagnostics.score.policyId,
    ),
    actual: withheldDelta(
      doc.parentVersionId ?? doc.versionId,
      doc.versionId,
      model.diagnostics.score.policyId,
    ),
  };
}
export async function applyAuthoring(
  client: Client,
  analysisId: string,
  ownerId: string,
  raw: unknown,
  requestId: string,
) {
  const parsed = AuthoringCommandSchema.safeParse(raw);
  if (!parsed.success)
    throw new CanonicalError(422, "Submit a valid authoring action.");
  const cmd = parsed.data;
  // Ownership/deletion checks precede retries; an old idempotency receipt cannot restore access.
  const canonical = await loadCanonical(client, analysisId, ownerId, {
    versionId: cmd.expectedVersionId,
  });
  if (!canonical.current)
    throw new CanonicalError(404, "Structured resume not found.");
  const prior = await client
    .from("authoring_events")
    .select("command,result")
    .eq("analysis_id", analysisId)
    .eq("owner_id", ownerId)
    .eq("idempotency_key", cmd.idempotencyKey)
    .maybeSingle();
  if (prior.error)
    throw new CanonicalError(503, "Authoring history is unavailable.");
  // Universal wire shape is stable across retries and SQL validates it independently.
  const wire = {
    action: cmd.action,
    expectedVersionId: cmd.expectedVersionId,
    idempotencyKey: cmd.idempotencyKey,
    targetFactId:
      "targetFactId" in cmd
        ? cmd.targetFactId
        : "patch" in cmd
          ? cmd.patch.targetFactId
          : null,
    sectionId: "sectionId" in cmd ? cmd.sectionId : null,
    value:
      "value" in cmd
        ? cmd.value
        : cmd.action === "accept"
          ? cmd.patch.operations[0].value
          : null,
    questionKind: "questionKind" in cmd ? cmd.questionKind : null,
    pattern: "patch" in cmd ? cmd.patch.pattern : null,
    targetVersionId: "targetVersionId" in cmd ? cmd.targetVersionId : null,
    confirmation: "confirmation" in cmd ? cmd.confirmation : false,
    patch: "patch" in cmd ? cmd.patch : null,
  };
  if (prior.data) {
    if (cmd.action === "undo" && prior.data.command.action === "undo")
      wire.targetVersionId = prior.data.command.targetVersionId;
    if (!isDeepStrictEqual(prior.data.command, wire))
      throw new CanonicalError(
        409,
        "The submission key was reused. Reload before retrying.",
      );
    const receipt = z
      .object({
        status: z.literal("applied"),
        versionId: z.uuid(),
        revision: z.number().int().positive(),
        eventId: z.uuid(),
        action: z.literal(cmd.action),
        idempotent: z.boolean(),
      })
      .safeParse(prior.data.result);
    if (!receipt.success)
      throw new CanonicalError(
        503,
        "Authoring history failed integrity checks.",
      );
    return { ...receipt.data, idempotent: true };
  }
  if (!prior.data && canonical.headId !== cmd.expectedVersionId)
    throw new CanonicalError(409, "The resume changed. Reload before editing.");
  const doc = canonical.current.document;
  let body = null,
    confirmationBody = null;
  try {
    if (cmd.action === "accept" || cmd.action === "reject") {
      const score = await loadScoreDiagnostics(client, analysisId, ownerId, {
        canonical: cmd.expectedVersionId,
      });
      if (cmd.action === "accept")
        validateSuggestion(cmd.patch, doc, score.diagnostics);
      else if (
        JSON.stringify(cmd.patch) !==
        JSON.stringify(
          buildSuggestion(
            doc,
            cmd.patch.targetFactId,
            cmd.patch.pattern,
            score.diagnostics,
          ),
        )
      )
        throw Error("INVALID_PATCH");
    }
    if (cmd.action === "edit")
      body = reviseCanonical(doc, {
        operation: "edit",
        factId: cmd.targetFactId,
        value: cmd.value,
      });
    else if (cmd.action === "confirm")
      body = reviseCanonical(doc, {
        operation: "confirm",
        factId: cmd.targetFactId,
      });
    else if (cmd.action === "rename")
      body = reviseCanonical(doc, {
        operation: "rename_section",
        sectionId: cmd.sectionId,
        value: cmd.value,
      });
    else if (cmd.action === "clarify" || cmd.action === "accept") {
      const target = doc.facts.find((f) => f.id === wire.targetFactId);
      if (!target || target.type !== "contribution")
        throw Error("INVALID_TARGET");
      const value =
        cmd.action === "clarify"
          ? clarifyValue(target.value, cmd.questionKind, cmd.value)
          : cmd.patch.operations[0].value;
      body = reviseCanonical(doc, {
        operation: "edit",
        factId: target.id,
        value,
      });
      confirmationBody = reviseCanonical(body, {
        operation: "confirm",
        factId: target.id,
      });
    } else if (cmd.action === "undo" || cmd.action === "restore") {
      if (cmd.action === "undo") {
        const last = await client
          .from("authoring_events")
          .select("base_version_id")
          .eq("resume_id", doc.resumeId)
          .eq("owner_id", ownerId)
          .eq("result_version_id", doc.versionId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (last.error)
          throw new CanonicalError(503, "Undo history is unavailable.");
        wire.targetVersionId =
          last.data?.base_version_id ?? doc.parentVersionId;
        if (!wire.targetVersionId) throw Error("NO_UNDO_TARGET");
      }
      const target = await loadCanonical(client, analysisId, ownerId, {
        versionId: wire.targetVersionId!,
      });
      if (!target.current) throw Error("INVALID_RESTORE");
      body = rollbackCanonical(doc, target.current.document);
    }
  } catch (error) {
    if (error instanceof CanonicalError) throw error;
    throw new CanonicalError(
      422,
      "Review the target, confirmations and source facts before applying this change.",
    );
  }
  const saved = await client.rpc("apply_authoring_action", {
    p_user_id: ownerId,
    p_analysis_id: analysisId,
    p_command: wire,
    p_body: body,
    p_confirmation_body: confirmationBody,
    p_request_id: requestId,
  });
  if (saved.error) {
    if (["22023", "23514", "22P02"].includes(saved.error.code))
      throw new CanonicalError(
        422,
        "The change failed factual or provenance validation.",
      );
    throw new CanonicalError(
      503,
      "Your save could not be confirmed. Retry the same submission.",
    );
  }
  if (saved.data?.status === "not_found")
    throw new CanonicalError(404, "Authoring workspace not found.");
  if (saved.data?.status === "conflict")
    throw new CanonicalError(
      409,
      "The resume changed or the submission key was reused. Reload before editing.",
    );
  const result = z
    .object({
      status: z.literal("applied"),
      versionId: z.uuid(),
      revision: z.number().int().positive(),
      eventId: z.uuid(),
      action: z.string(),
      idempotent: z.boolean(),
    })
    .safeParse(saved.data);
  if (!result.success)
    throw new CanonicalError(
      503,
      "Your save could not be confirmed. Retry the same submission.",
    );
  return result.data;
}
export async function readAuthoringForm(
  request: Request,
): Promise<AuthoringCommand> {
  if (
    !/^application\/x-www-form-urlencoded(?:;|$)/iu.test(
      request.headers.get("content-type") ?? "",
    )
  )
    throw new CanonicalError(422, "Submit the authoring form.");
  const reader = request.body?.getReader();
  if (!reader) throw new CanonicalError(422, "Submit the authoring form.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "",
    bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 16384)
        throw new CanonicalError(422, "The form exceeds its size limit.");
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch (e) {
    if (e instanceof CanonicalError) throw e;
    throw new CanonicalError(422, "The form contains invalid text.");
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const values: Record<string, unknown> = {};
  for (const [key, value] of new URLSearchParams(text)) {
    if (
      ![
        "action",
        "expectedVersionId",
        "idempotencyKey",
        "targetFactId",
        "sectionId",
        "value",
        "questionKind",
        "confirmation",
        "patch",
        "targetVersionId",
      ].includes(key) ||
      Object.hasOwn(values, key)
    )
      throw new CanonicalError(422, "Choose distinct supported form fields.");
    if (key === "patch") {
      try {
        values[key] = JSON.parse(value);
      } catch {
        throw new CanonicalError(422, "The patch is malformed.");
      }
    } else values[key] = key === "confirmation" ? value === "true" : value;
  }
  const result = AuthoringCommandSchema.safeParse(values);
  if (!result.success)
    throw new CanonicalError(422, "Submit a valid authoring action.");
  return result.data;
}
