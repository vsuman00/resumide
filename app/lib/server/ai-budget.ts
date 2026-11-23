import { createHash } from "node:crypto";
import { z } from "zod";

export const AI_BUDGET_SCHEMA_VERSION = "ai-budget/1.0.0";
const codes = [
  "AI_BUDGET_INVALID",
  "AI_BUDGET_UNAVAILABLE",
  "AI_BUDGET_DISABLED",
  "AI_BUDGET_DENIED",
  "AI_BUDGET_EXHAUSTED",
  "AI_BUDGET_CONFLICT",
  "AI_BUDGET_STATE",
  "AI_BUDGET_BLOCKED",
] as const;
export type AiBudgetErrorCode = (typeof codes)[number];
export class AiBudgetError extends Error {
  readonly code: AiBudgetErrorCode;
  constructor(code: AiBudgetErrorCode) {
    super("AI budget admission is unavailable.");
    this.name = "AiBudgetError";
    this.code = code;
  }
}

const id = z.string().regex(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u);
const sha = z.string().regex(/^[a-f0-9]{64}$/u);
const version = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/u);
const counterPattern = /^(?:0|[1-9][0-9]{0,127})$/u;
const counter = z.string().regex(counterPattern);
const rate = counter.refine(
  (value) =>
    counterPattern.test(value) &&
    BigInt(value) > 0n &&
    BigInt(value) <= 9_223_372_036_854_775_807n,
);
const knownTokens = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const reservedTokens = knownTokens.positive();
const bindingSchema = z.strictObject({
  userId: id,
  organizationId: id,
  operationId: id,
  attemptId: id,
  attemptOrdinal: z.number().int().min(1).max(3),
  surface: z.enum(["qualitative", "rewrite", "build"]),
  payloadSha256: sha,
  model: version,
  promptPolicyVersion: version,
  policyVersion: version,
  reservedInputTokens: reservedTokens,
  reservedOutputTokens: reservedTokens,
});
const nextBindingSchema = bindingSchema.omit({ attemptOrdinal: true });
const usageSchema = z.strictObject({
  inputTokens: knownTokens,
  outputTokens: knownTokens,
});
const reconciliationSchema = z.strictObject({
  reconciliationId: id,
  operatorId: id,
  evidenceSha256: sha,
  usage: usageSchema,
});
export type AiBudgetBinding = z.infer<typeof bindingSchema>;
export type AiBudgetNextBinding = z.infer<typeof nextBindingSchema>;
export type AiBudgetUsage = Readonly<z.infer<typeof usageSchema>>;
export type AiBudgetReconciliation = z.infer<typeof reconciliationSchema>;

function ceilCost(
  input: bigint,
  output: bigint,
  inputRate: bigint,
  outputRate: bigint,
) {
  return (input * inputRate + output * outputRate + 999_999n) / 1_000_000n;
}

/** Explicit integer rates only; this is arithmetic, never a price lookup/default. */
export function calculateAiBudgetCost(input: {
  inputTokens: number;
  outputTokens: number;
  inputMicrousdPerMillion: string;
  outputMicrousdPerMillion: string;
}): string {
  const parsed = z
    .strictObject({
      inputTokens: knownTokens,
      outputTokens: knownTokens,
      inputMicrousdPerMillion: rate,
      outputMicrousdPerMillion: rate,
    })
    .safeParse(input);
  if (!parsed.success) throw new AiBudgetError("AI_BUDGET_INVALID");
  const value = parsed.data;
  return ceilCost(
    BigInt(value.inputTokens),
    BigInt(value.outputTokens),
    BigInt(value.inputMicrousdPerMillion),
    BigInt(value.outputMicrousdPerMillion),
  ).toString();
}

/** Immutable logical-operation identity; actual attempts bind UUID/ordinal separately. */
export function hashAiBudgetBinding(input: AiBudgetBinding): string {
  const parsed = bindingSchema.safeParse(input);
  if (!parsed.success) throw new AiBudgetError("AI_BUDGET_INVALID");
  const value = parsed.data;
  const atoms = [
    value.userId,
    value.organizationId,
    value.operationId,
    value.surface,
    value.payloadSha256,
    value.model,
    value.promptPolicyVersion,
    value.policyVersion,
    String(value.reservedInputTokens),
    String(value.reservedOutputTokens),
  ];
  const hash = createHash("sha256").update("AIBUDGET1\n", "utf8");
  for (const atom of atoms)
    hash.update(`T${Buffer.byteLength(atom, "utf8")}:${atom};`, "utf8");
  return hash.digest("hex");
}

const receiptSchema = z.strictObject({
  schemaVersion: z.literal(AI_BUDGET_SCHEMA_VERSION),
  userId: id,
  organizationId: id,
  operationId: id,
  attemptId: id,
  attemptOrdinal: z.number().int().min(1).max(3),
  attemptLimit: z.number().int().min(1).max(3),
  surface: z.enum(["qualitative", "rewrite", "build"]),
  payloadSha256: sha,
  model: version,
  promptPolicyVersion: version,
  policyVersion: version,
  poolPolicyVersion: version,
  bindingSha256: sha,
  period: z.string().regex(/^[0-9]{4}-(?:0[1-9]|1[0-2])-01$/u),
  state: z.enum([
    "reserved",
    "dispatched",
    "held_unknown",
    "settled",
    "released",
  ]),
  reservedInputTokens: counter,
  reservedOutputTokens: counter,
  reservedCostMicrousd: counter,
  inputMicrousdPerMillion: rate,
  outputMicrousdPerMillion: rate,
  actualInputTokens: counter.nullable(),
  actualOutputTokens: counter.nullable(),
  actualCostMicrousd: counter.nullable(),
  replayed: z.boolean(),
  dispatchAllowed: z.boolean(),
  poolBlocked: z.boolean(),
});
export type AiBudgetReceipt = Readonly<z.infer<typeof receiptSchema>>;
const envelopeSchema = z.discriminatedUnion("status", [
  z.strictObject({
    schemaVersion: z.literal(AI_BUDGET_SCHEMA_VERSION),
    status: z.literal("ok"),
    receipt: receiptSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(AI_BUDGET_SCHEMA_VERSION),
    status: z.literal("denied"),
    code: z.enum(codes),
  }),
]);
export interface AiBudgetRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}
type Command =
  | "reserve"
  | "reserve_next"
  | "claim_dispatch"
  | "release"
  | "mark_unknown"
  | "settle"
  | "reconcile";

function validateReceipt(
  binding: AiBudgetBinding,
  receipt: z.infer<typeof receiptSchema>,
  command: Command,
  usage?: AiBudgetUsage,
): AiBudgetReceipt {
  const unavailable = () => {
    throw new AiBudgetError("AI_BUDGET_UNAVAILABLE");
  };
  for (const key of [
    "userId",
    "organizationId",
    "operationId",
    "attemptId",
    "attemptOrdinal",
    "surface",
    "payloadSha256",
    "model",
    "promptPolicyVersion",
    "policyVersion",
  ] as const)
    if (receipt[key] !== binding[key]) unavailable();
  if (
    receipt.attemptOrdinal > receipt.attemptLimit ||
    receipt.bindingSha256 !== hashAiBudgetBinding(binding) ||
    receipt.reservedInputTokens !== String(binding.reservedInputTokens) ||
    receipt.reservedOutputTokens !== String(binding.reservedOutputTokens)
  )
    unavailable();
  const cost = (input: string, output: string) =>
    ceilCost(
      BigInt(input),
      BigInt(output),
      BigInt(receipt.inputMicrousdPerMillion),
      BigInt(receipt.outputMicrousdPerMillion),
    ).toString();
  if (
    receipt.reservedCostMicrousd !==
    cost(receipt.reservedInputTokens, receipt.reservedOutputTokens)
  )
    unavailable();
  if (receipt.state === "settled") {
    if (
      receipt.actualInputTokens === null ||
      receipt.actualOutputTokens === null ||
      receipt.actualCostMicrousd === null
    )
      unavailable();
    if (
      receipt.actualCostMicrousd !==
      cost(receipt.actualInputTokens!, receipt.actualOutputTokens!)
    )
      unavailable();
  } else if (
    receipt.actualInputTokens !== null ||
    receipt.actualOutputTokens !== null ||
    receipt.actualCostMicrousd !== null
  )
    unavailable();
  if (
    receipt.dispatchAllowed &&
    (command !== "claim_dispatch" ||
      receipt.state !== "dispatched" ||
      receipt.replayed ||
      receipt.poolBlocked)
  )
    unavailable();
  if (command === "reserve" || command === "reserve_next") {
    if (
      !receipt.replayed &&
      (receipt.state !== "reserved" || receipt.poolBlocked)
    )
      unavailable();
  } else if (command === "claim_dispatch") {
    if (receipt.replayed) {
      if (
        !["dispatched", "held_unknown", "settled"].includes(receipt.state) ||
        receipt.dispatchAllowed
      )
        unavailable();
    } else if (!receipt.dispatchAllowed) unavailable();
  } else if (command === "release" && receipt.state !== "released")
    unavailable();
  else if (command === "mark_unknown" && receipt.state !== "held_unknown")
    unavailable();
  else if (command === "settle" || command === "reconcile") {
    if (
      receipt.state !== "settled" ||
      !usage ||
      receipt.actualInputTokens !== String(usage.inputTokens) ||
      receipt.actualOutputTokens !== String(usage.outputTokens)
    )
      unavailable();
    if (
      command === "settle" &&
      !receipt.replayed &&
      !receipt.poolBlocked &&
      (BigInt(receipt.actualInputTokens!) >
        BigInt(receipt.reservedInputTokens) ||
        BigInt(receipt.actualOutputTokens!) >
          BigInt(receipt.reservedOutputTokens) ||
        BigInt(receipt.actualCostMicrousd!) >
          BigInt(receipt.reservedCostMicrousd))
    )
      unavailable();
  }
  return Object.freeze(receipt);
}

/** RPC-only admission. A pure/client check cannot provide SQL atomicity or permission. */
export function createAiBudgetClient(client: AiBudgetRpcClient) {
  const invoke = async (
    command: Command,
    input: AiBudgetBinding | AiBudgetNextBinding,
    extras?: AiBudgetUsage | AiBudgetReconciliation,
  ): Promise<AiBudgetReceipt> => {
    const parsed = (
      command === "reserve_next" ? nextBindingSchema : bindingSchema
    ).safeParse(input);
    if (!parsed.success) throw new AiBudgetError("AI_BUDGET_INVALID");
    const binding = parsed.data;
    let usage: AiBudgetUsage | undefined;
    let extraRequest: Record<string, unknown> = {};
    if (command === "settle") {
      const parsedUsage = usageSchema.safeParse(extras);
      if (!parsedUsage.success) throw new AiBudgetError("AI_BUDGET_INVALID");
      usage = parsedUsage.data;
    } else if (command === "reconcile") {
      const reconciliation = reconciliationSchema.safeParse(extras);
      if (!reconciliation.success) throw new AiBudgetError("AI_BUDGET_INVALID");
      const { usage: observed, ...identity } = reconciliation.data;
      usage = observed;
      extraRequest = identity;
    }
    if (usage)
      extraRequest.usage = {
        inputTokens: String(usage.inputTokens),
        outputTokens: String(usage.outputTokens),
      };
    const { userId, organizationId, ...request } = binding;
    let result: { data: unknown; error: unknown };
    try {
      result = await client.rpc(`ai_budget_${command}`, {
        p_user_id: userId,
        p_organization_id: organizationId,
        p_request: {
          ...request,
          reservedInputTokens: String(binding.reservedInputTokens),
          reservedOutputTokens: String(binding.reservedOutputTokens),
          ...extraRequest,
        },
      });
    } catch {
      throw new AiBudgetError("AI_BUDGET_UNAVAILABLE");
    }
    if (!result || result.error !== null)
      throw new AiBudgetError("AI_BUDGET_UNAVAILABLE");
    const envelope = envelopeSchema.safeParse(result.data);
    if (!envelope.success) throw new AiBudgetError("AI_BUDGET_UNAVAILABLE");
    if (envelope.data.status === "denied")
      throw new AiBudgetError(envelope.data.code);
    const fullBinding = bindingSchema.safeParse({
      ...binding,
      attemptOrdinal:
        "attemptOrdinal" in binding
          ? binding.attemptOrdinal
          : envelope.data.receipt.attemptOrdinal,
    });
    if (!fullBinding.success) throw new AiBudgetError("AI_BUDGET_UNAVAILABLE");
    return validateReceipt(
      fullBinding.data,
      envelope.data.receipt,
      command,
      usage,
    );
  };
  return Object.freeze({
    reserve: (binding: AiBudgetBinding) => invoke("reserve", binding),
    reserveNext: (binding: AiBudgetNextBinding) =>
      invoke("reserve_next", binding),
    claimDispatch: (binding: AiBudgetBinding) =>
      invoke("claim_dispatch", binding),
    releaseBeforeDispatch: (binding: AiBudgetBinding) =>
      invoke("release", binding),
    markUnknown: (binding: AiBudgetBinding) => invoke("mark_unknown", binding),
    settle: (binding: AiBudgetBinding, usage: AiBudgetUsage) =>
      invoke("settle", binding, usage),
    reconcile: (
      binding: AiBudgetBinding,
      reconciliation: AiBudgetReconciliation,
    ) => invoke("reconcile", binding, reconciliation),
  });
}
