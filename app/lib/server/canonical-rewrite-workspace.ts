import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  buildCanonicalRewriteWorkspace,
  canonicalRewritePolicy,
  CanonicalRewriteError,
  CanonicalRewriteWorkspaceSchema,
} from "./canonical-rewrite-contract";
import { CANONICAL_REWRITE_READINESS_PROFILES } from "./canonical-rewrite-readiness-profile";
import { CANONICAL_REWRITE_WORKSPACE_PROFILES } from "./canonical-rewrite-workspace-profile";
import { TypedAuthoringBindingSchema } from "./typed-authoring-contract";
import { validateRequirementRelationshipContext } from "./requirement-relationship-context";
import { getServerConfig } from "./config";
import { getAuthenticatedUser } from "./auth";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "./supabase";
import { runProviderAttempt } from "./provider-attempt";

const uuid = z.uuid().regex(/^[a-f0-9-]+$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const CanonicalRewriteWorkspaceSelectionSchema = z.strictObject({
  canonicalVersionId: uuid,
  requirementVersionId: uuid,
});
export type CanonicalRewriteWorkspaceSelection = z.infer<
  typeof CanonicalRewriteWorkspaceSelectionSchema
>;
export const CanonicalRewriteWorkspaceStateSchema = z.discriminatedUnion(
  "status",
  [
    z.strictObject({
      status: z.literal("available"),
      workspace: CanonicalRewriteWorkspaceSchema,
    }),
    z.strictObject({
      status: z.literal("initialization_required"),
      binding: TypedAuthoringBindingSchema,
      canInitialize: z.boolean(),
    }),
  ],
);
export type CanonicalRewriteWorkspaceState = z.infer<
  typeof CanonicalRewriteWorkspaceStateSchema
>;
export const CanonicalRewriteWorkspaceInitializationSchema = z.strictObject({
  kind: z.literal("workspace_initialized"),
  created: z.boolean(),
  workspace: CanonicalRewriteWorkspaceSchema,
});
export type CanonicalRewriteWorkspaceInitialization = z.infer<
  typeof CanonicalRewriteWorkspaceInitializationSchema
>;
const bootstrapProfileSchema = z.strictObject({
  schemaVersion: z.literal("canonical-rewrite-workspace-readiness/1.0.0"),
  profileVersion: z.literal("canonical-rewrite-workspace-profile/1.0.0"),
  checkerSha256: digest,
  readerSha256: digest,
  initializerSha256: digest,
  metadataSha256: digest,
});
const readinessSchema = bootstrapProfileSchema.extend({
  schemaReady: z.boolean(),
  initializerExecutable: z.boolean(),
});
const availableNative = z.strictObject({
  schemaVersion: z.literal("canonical-rewrite-workspace-state/1.0.0"),
  status: z.literal("available"),
  context: z.unknown(),
  readiness: readinessSchema,
});
const nativeStateSchema = z.discriminatedUnion("status", [
  availableNative,
  z.strictObject({
    schemaVersion: z.literal("canonical-rewrite-workspace-state/1.0.0"),
    status: z.literal("initialization_required"),
    relationshipContext: z.unknown(),
    readiness: readinessSchema,
  }),
]);
const nativeInitializationSchema = z.strictObject({
  schemaVersion: z.literal("canonical-rewrite-workspace-initialization/1.0.0"),
  created: z.boolean(),
  state: availableNative,
});
const optionsSchema = z.strictObject({
  canonicalVersionId: uuid.nullable().optional(),
  requirementVersionId: uuid.nullable().optional(),
});
type Reply = { data: unknown; error: unknown };
type Pending = PromiseLike<Reply> & {
  abortSignal?: (signal: AbortSignal) => PromiseLike<Reply>;
};
export interface CanonicalRewriteWorkspaceClient {
  rpc(name: string, args: Record<string, unknown>): Pending;
}
export type CanonicalRewriteWorkspaceOptions = {
  canonicalVersionId?: string | null;
  requirementVersionId?: string | null;
  model?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  expectedProfile?: unknown;
  expectedRewriteProfile?: unknown;
};
const unavailable = () =>
  new CanonicalRewriteError("unavailable", "retry_exact");
function invalidResult() {
  return new CanonicalRewriteError("invalid_result", "retry_exact");
}
function bounded(raw: unknown) {
  let text: string;
  try {
    text = JSON.stringify(raw);
  } catch {
    throw invalidResult();
  }
  if (
    typeof text !== "string" ||
    Buffer.byteLength(text, "utf8") > 32 * 1024 * 1024
  )
    throw invalidResult();
}
function nativeError(raw: unknown): CanonicalRewriteError {
  const code =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>).code
      : null;
  if (code === "P0C01")
    return new CanonicalRewriteError("stale_inputs", "review_again");
  if (code === "42501" || code === "P0002")
    return new CanonicalRewriteError("not_found", "unavailable");
  if (code === "22023")
    return new CanonicalRewriteError("invalid_input", "review_again");
  return unavailable();
}
async function call(
  client: CanonicalRewriteWorkspaceClient,
  name: string,
  args: Record<string, unknown>,
  options: CanonicalRewriteWorkspaceOptions,
) {
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000)
    throw new CanonicalRewriteError("invalid_input");
  const deadline = Date.now() + timeoutMs;
  let reply: Reply;
  try {
    reply = await runProviderAttempt({
      timeoutMs,
      signal: options.signal,
      failure: unavailable,
      execute: async (signal) => {
        if (Date.now() >= deadline) throw unavailable();
        const pending = client.rpc(name, args);
        return await (typeof pending.abortSignal === "function"
          ? pending.abortSignal(signal)
          : pending);
      },
    });
  } catch {
    throw unavailable();
  }
  if (options.signal?.aborted || Date.now() >= deadline) throw unavailable();
  if (!reply || reply.error) throw nativeError(reply?.error);
  bounded(reply.data);
  return reply.data;
}
function selection(
  analysisId: string,
  ownerId: string,
  options: CanonicalRewriteWorkspaceOptions,
) {
  const value = optionsSchema.safeParse({
    canonicalVersionId: options.canonicalVersionId,
    requirementVersionId: options.requirementVersionId,
  });
  if (
    !uuid.safeParse(analysisId).success ||
    !uuid.safeParse(ownerId).success ||
    !value.success
  )
    throw new CanonicalRewriteError("invalid_input");
  return {
    canonicalVersionId: value.data.canonicalVersionId ?? null,
    requirementVersionId: value.data.requirementVersionId ?? null,
  };
}
function scope(
  binding: z.infer<typeof TypedAuthoringBindingSchema>,
  analysisId: string,
  ownerId: string,
  selected: ReturnType<typeof selection>,
) {
  if (
    binding.source.ownerId !== ownerId ||
    binding.source.analysisId !== analysisId ||
    (selected.canonicalVersionId !== null &&
      binding.canonical.versionId !== selected.canonicalVersionId) ||
    (selected.requirementVersionId !== null &&
      binding.requirements.versionId !== selected.requirementVersionId) ||
    (selected.canonicalVersionId === null &&
      binding.canonical.versionId !== binding.heads.canonicalHeadId) ||
    (selected.requirementVersionId === null &&
      binding.requirements.versionId !== binding.heads.requirementHeadId)
  )
    throw invalidResult();
}
function current(binding: z.infer<typeof TypedAuthoringBindingSchema>) {
  return (
    binding.canonical.versionId === binding.heads.canonicalHeadId &&
    binding.canonical.revision === binding.heads.canonicalHeadRevision &&
    binding.requirements.versionId === binding.heads.requirementHeadId &&
    binding.requirements.revision === binding.heads.requirementHeadRevision
  );
}
/** Full owned context validation precedes projection. Parsing readiness never authenticates a caller. */
export function decodeCanonicalRewriteWorkspaceState(
  raw: unknown,
  analysisId: string,
  ownerId: string,
  options: CanonicalRewriteWorkspaceOptions,
): CanonicalRewriteWorkspaceState {
  const selected = selection(analysisId, ownerId, options);
  bounded(raw);
  const parsed = nativeStateSchema.safeParse(raw);
  const profiles = bootstrapProfileSchema
    .array()
    .min(1)
    .max(2)
    .safeParse(
      options.expectedProfile == null
        ? CANONICAL_REWRITE_WORKSPACE_PROFILES
        : [options.expectedProfile],
    );
  if (!parsed.success || !profiles.success) throw invalidResult();
  if (
    !parsed.data.readiness.schemaReady ||
    !profiles.data.some((profile) =>
      (Object.keys(profile) as (keyof typeof profile)[]).every(
        (key) => parsed.data.readiness[key] === profile[key],
      ),
    )
  )
    throw new CanonicalRewriteError("unavailable", "unavailable");
  const model = options.model ?? getServerConfig().OPENAI_MODEL;
  if (parsed.data.status === "available") {
    const workspace = buildCanonicalRewriteWorkspace(
      parsed.data.context,
      model,
      options.expectedRewriteProfile ?? CANONICAL_REWRITE_READINESS_PROFILES,
    );
    scope(workspace.binding.authoring, analysisId, ownerId, selected);
    return CanonicalRewriteWorkspaceStateSchema.parse({
      status: "available",
      workspace,
    });
  }
  let context: ReturnType<typeof validateRequirementRelationshipContext>;
  try {
    context = validateRequirementRelationshipContext(
      parsed.data.relationshipContext,
      analysisId,
      ownerId,
      selected,
    );
  } catch {
    throw invalidResult();
  }
  const binding = TypedAuthoringBindingSchema.parse({
    source: context.source,
    canonical: {
      versionId: context.canonical.versionId,
      revision: context.canonical.revision,
      contentSha256: context.canonical.contentSha256,
    },
    requirements: {
      versionId: context.requirements.versionId,
      revision: context.requirements.revision,
      inputSha256: context.requirements.inputSha256,
      contentSha256: context.requirements.contentSha256,
    },
    heads: context.heads,
    profilesSha256: createHash("sha256")
      .update(JSON.stringify(context.profiles))
      .digest("hex"),
  });
  scope(binding, analysisId, ownerId, selected);
  return CanonicalRewriteWorkspaceStateSchema.parse({
    status: "initialization_required",
    binding,
    canInitialize:
      parsed.data.readiness.initializerExecutable && current(binding),
  });
}
export async function loadCanonicalRewriteWorkspaceState(
  client: CanonicalRewriteWorkspaceClient,
  analysisId: string,
  ownerId: string,
  options: CanonicalRewriteWorkspaceOptions = {},
): Promise<CanonicalRewriteWorkspaceState> {
  const selected = selection(analysisId, ownerId, options),
    model = options.model ?? getServerConfig().OPENAI_MODEL;
  const raw = await call(
    client,
    "read_canonical_rewrite_workspace_state",
    {
      p_user_id: ownerId,
      p_analysis_id: analysisId,
      p_selection: selected,
      p_policy: canonicalRewritePolicy(model),
    },
    options,
  );
  return decodeCanonicalRewriteWorkspaceState(raw, analysisId, ownerId, {
    ...options,
    model,
  });
}
export async function initializeCanonicalRewriteWorkspace(
  client: CanonicalRewriteWorkspaceClient,
  analysisId: string,
  ownerId: string,
  rawSelection: unknown,
  options: CanonicalRewriteWorkspaceOptions = {},
): Promise<CanonicalRewriteWorkspaceInitialization> {
  const parsed =
    CanonicalRewriteWorkspaceSelectionSchema.safeParse(rawSelection);
  if (!parsed.success) throw new CanonicalRewriteError("invalid_input");
  const selected = parsed.data,
    checked = { ...options, ...selected },
    model = options.model ?? getServerConfig().OPENAI_MODEL;
  const before = await loadCanonicalRewriteWorkspaceState(
    client,
    analysisId,
    ownerId,
    { ...checked, model },
  );
  const binding =
    before.status === "available"
      ? before.workspace.binding.authoring
      : before.binding;
  if (!current(binding))
    throw new CanonicalRewriteError("stale_inputs", "review_again");
  if (before.status === "available")
    return {
      kind: "workspace_initialized",
      created: false,
      workspace: before.workspace,
    };
  if (!before.canInitialize)
    throw new CanonicalRewriteError("unavailable", "unavailable");
  const raw = await call(
    client,
    "initialize_canonical_rewrite_workspace",
    {
      p_user_id: ownerId,
      p_analysis_id: analysisId,
      p_selection: selected,
      p_policy: canonicalRewritePolicy(model),
    },
    options,
  );
  const result = nativeInitializationSchema.safeParse(raw);
  if (!result.success) throw invalidResult();
  const after = decodeCanonicalRewriteWorkspaceState(
    result.data.state,
    analysisId,
    ownerId,
    { ...checked, model },
  );
  if (
    after.status !== "available" ||
    !current(after.workspace.binding.authoring)
  )
    throw invalidResult();
  if (
    result.data.created &&
    (!isDeepStrictEqual(after.workspace.saved, {
      state: "legacy_unbound",
      publication: null,
      legacyDraft: { summary: null, bullets: [] },
    }) ||
      after.workspace.binding.draft.revision !== 0 ||
      after.workspace.binding.draft.versionId !== null ||
      after.workspace.binding.draft.headId !== null)
  )
    throw invalidResult();
  return CanonicalRewriteWorkspaceInitializationSchema.parse({
    kind: "workspace_initialized",
    created: result.data.created,
    workspace: after.workspace,
  });
}
export function canonicalRewriteWorkspacePrivateHeaders() {
  return new Headers({
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    Vary: "Cookie, Origin",
  });
}
class FormError extends Error {
  constructor(readonly status: 400 | 413 | 415 | 422) {
    super("Workspace initialization request refused.");
  }
}
function release(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    void reader.cancel().then(
      () => true,
      () => false,
    );
  } catch {
    return unlock(reader);
  }
  return unlock(reader);
}
function unlock(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    reader.releaseLock();
    return true;
  } catch {
    return false;
  }
}
export async function readCanonicalRewriteWorkspaceSelection(
  request: Request,
  timeoutMs = 5000,
): Promise<CanonicalRewriteWorkspaceSelection> {
  const type = request.headers.get("Content-Type") ?? "";
  if (
    !/^(application\/x-www-form-urlencoded|multipart\/form-data)(?:;|$)/iu.test(
      type,
    )
  )
    throw new FormError(415);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000)
    throw new FormError(422);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const deadline = Date.now() + timeoutMs;
  try {
    return await runProviderAttempt({
      timeoutMs,
      signal: request.signal,
      failure: unavailable,
      execute: async (signal) => {
        if (!request.body) throw new FormError(422);
        reader = request.body.getReader();
        const parts: Uint8Array[] = [];
        let total = 0;
        for (;;) {
          const next = await reader.read();
          if (signal.aborted || Date.now() >= deadline) throw unavailable();
          if (next.done) break;
          total += next.value.byteLength;
          if (total > 4096) throw new FormError(413);
          parts.push(next.value);
        }
        const bytes = Buffer.concat(parts);
        try {
          new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
          throw new FormError(422);
        }
        let form: FormData;
        try {
          form = await new Response(bytes, {
            headers: { "Content-Type": type },
          }).formData();
        } catch {
          throw new FormError(422);
        }
        if (signal.aborted || Date.now() >= deadline) throw unavailable();
        const entries = [...form.entries()];
        if (
          entries.length !== 2 ||
          new Set(entries.map(([name]) => name)).size !== 2 ||
          entries.some(
            ([name, value]) =>
              !["canonicalVersionId", "requirementVersionId"].includes(name) ||
              typeof value !== "string",
          )
        )
          throw new FormError(422);
        const parsed = CanonicalRewriteWorkspaceSelectionSchema.safeParse(
          Object.fromEntries(entries),
        );
        if (!parsed.success) throw new FormError(422);
        return parsed.data;
      },
    });
  } finally {
    if (reader) release(reader);
  }
}
export async function canonicalRewriteWorkspaceAction(
  request: Request,
  analysisId: string | undefined,
): Promise<Response> {
  const headers = canonicalRewriteWorkspacePrivateHeaders(),
    respond = (body: unknown, status = 200) =>
      Response.json(body, { status, headers });
  if (request.method !== "POST") {
    headers.set("Allow", "POST");
    return respond(
      { kind: "error", reason: "invalid_input", recovery: "unavailable" },
      405,
    );
  }
  try {
    const config = getServerConfig();
    if (
      !config.CANONICAL_REWRITE_ENABLED ||
      !config.AUTHORING_ENABLED ||
      !config.SCORING_V2_ENABLED
    )
      throw new CanonicalRewriteError("disabled", "unavailable");
    const origin = new URL(config.APP_ORIGIN).origin;
    if (
      new URL(request.url).origin !== origin ||
      request.headers.get("Origin") !== origin
    )
      return respond(
        { kind: "error", reason: "invalid_input", recovery: "unavailable" },
        403,
      );
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, headers),
    );
    if (!user)
      return respond(
        { kind: "error", reason: "not_found", recovery: "unavailable" },
        401,
      );
    if (!uuid.safeParse(analysisId).success || !uuid.safeParse(user.id).success)
      return respond(
        { kind: "error", reason: "not_found", recovery: "unavailable" },
        404,
      );
    const selected = await readCanonicalRewriteWorkspaceSelection(request),
      client = createSupabaseAdminClient();
    const result = await initializeCanonicalRewriteWorkspace(
      client,
      analysisId!,
      user.id,
      selected,
      { model: config.OPENAI_MODEL, signal: request.signal },
    );
    return respond({
      ...result,
      workspace: config.AI_ENABLED
        ? result.workspace
        : { ...result.workspace, canGenerate: false },
    });
  } catch (error) {
    if (error instanceof FormError)
      return respond(
        { kind: "error", reason: "invalid_input", recovery: "review_again" },
        error.status,
      );
    if (error instanceof CanonicalRewriteError)
      return respond(
        { kind: "error", reason: error.reason, recovery: error.recovery },
        error.status,
      );
    return respond(
      { kind: "error", reason: "unavailable", recovery: "retry_exact" },
      503,
    );
  }
}
