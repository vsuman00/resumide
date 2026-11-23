import { createHash } from "node:crypto";
import {
  AiBudgetError,
  type AiBudgetNextBinding,
  type AiBudgetReceipt,
  type AiBudgetUsage,
  type createAiBudgetClient,
} from "./ai-budget";
import { QualitativeAiFailure } from "./qualitative-ai";

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const nonce = /^[\x20-\x7e]{1,128}$/u;

function technicalUuid(header: string, atoms: readonly string[]): string {
  const hash = createHash("sha256").update(header, "utf8");
  for (const atom of atoms)
    hash.update(`T${Buffer.byteLength(atom, "utf8")}:${atom};`, "utf8");
  const bytes = hash.digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createAiBudgetOperationId(input: {
  userId: string;
  organizationId: string;
  surface: AiBudgetNextBinding["surface"];
  nonce: string;
}): string {
  if (
    !uuid.test(input.userId) ||
    !uuid.test(input.organizationId) ||
    !["qualitative", "rewrite", "build"].includes(input.surface) ||
    !nonce.test(input.nonce)
  )
    throw new AiBudgetError("AI_BUDGET_INVALID");
  return technicalUuid("AIBUDGET-OP1\n", [
    input.userId,
    input.organizationId,
    input.surface,
    input.nonce,
  ]);
}

export function createAiBudgetAttemptId(input: {
  operationId: string;
  attemptNonce: string;
}): string {
  if (!uuid.test(input.operationId) || !nonce.test(input.attemptNonce))
    throw new AiBudgetError("AI_BUDGET_INVALID");
  return technicalUuid("AIBUDGET-ATTEMPT1\n", [
    input.operationId,
    input.attemptNonce,
  ]);
}

/** Reserve one token per serialized UTF8 byte plus 1024 tokens for framing. */
export function reserveAiBudgetTokens(input: {
  system: string;
  user: string;
  schema: unknown;
  maxOutputTokens: number;
}): Pick<AiBudgetNextBinding, "reservedInputTokens" | "reservedOutputTokens"> {
  if (
    typeof input.system !== "string" ||
    typeof input.user !== "string" ||
    !input.schema ||
    typeof input.schema !== "object" ||
    Array.isArray(input.schema) ||
    !Number.isSafeInteger(input.maxOutputTokens) ||
    input.maxOutputTokens < 1
  )
    throw new AiBudgetError("AI_BUDGET_INVALID");
  let serialized: string;
  try {
    serialized = JSON.stringify({
      system: input.system,
      user: input.user,
      schema: input.schema,
    });
  } catch {
    throw new AiBudgetError("AI_BUDGET_INVALID");
  }
  const reservedInputTokens = Buffer.byteLength(serialized, "utf8") + 1_024;
  if (!Number.isSafeInteger(reservedInputTokens))
    throw new AiBudgetError("AI_BUDGET_INVALID");
  return {
    reservedInputTokens,
    reservedOutputTokens: input.maxOutputTokens,
  };
}

function readUsage(raw: unknown): AiBudgetUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (
    typeof value.inputTokens !== "number" ||
    !Number.isSafeInteger(value.inputTokens) ||
    value.inputTokens < 0 ||
    typeof value.outputTokens !== "number" ||
    !Number.isSafeInteger(value.outputTokens) ||
    value.outputTokens < 0
  )
    return null;
  return Object.freeze({
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
  });
}

export async function runBudgetedAiAttempt<T>(input: {
  client: ReturnType<typeof createAiBudgetClient>;
  binding: AiBudgetNextBinding;
  signal?: AbortSignal;
  onAdmitted?: (receipt: AiBudgetReceipt) => void;
  execute: (
    recordUsage: (usage: AiBudgetUsage | null) => void,
    admittedReceipt: AiBudgetReceipt,
  ) => Promise<{ value: T; usage: AiBudgetUsage }>;
}): Promise<T> {
  const cancelled = () => new QualitativeAiFailure("AI_CANCELLED");
  if (input.signal?.aborted) throw cancelled();
  const reserved = await input.client.reserveNext(input.binding);
  const binding = {
    ...input.binding,
    attemptOrdinal: reserved.attemptOrdinal,
  };
  // A reservation-only crash may recover its first dispatch through claim CAS.
  if (reserved.replayed && reserved.state !== "reserved")
    throw new AiBudgetError("AI_BUDGET_STATE");
  try {
    input.onAdmitted?.(reserved);
    if (input.signal?.aborted) throw cancelled();
  } catch (error) {
    if (!reserved.replayed) await input.client.releaseBeforeDispatch(binding);
    throw error;
  }
  // Once claim is invoked its unknown outcome cannot justify a release.
  const admitted = await input.client.claimDispatch(binding);
  if (!admitted.dispatchAllowed) throw new AiBudgetError("AI_BUDGET_STATE");

  const known: { value: AiBudgetUsage | null } = { value: null };
  let conflicting = false;
  const recordUsage = (usage: AiBudgetUsage | null) => {
    if (usage === null) return;
    const observed = readUsage(usage);
    if (
      !observed ||
      (known.value &&
        (known.value.inputTokens !== observed.inputTokens ||
          known.value.outputTokens !== observed.outputTokens))
    ) {
      conflicting = true;
      throw new AiBudgetError("AI_BUDGET_UNAVAILABLE");
    }
    known.value = observed;
  };
  let result: { value: T; usage: AiBudgetUsage };
  try {
    if (input.signal?.aborted) throw cancelled();
    result = await input.execute(recordUsage, admitted);
    recordUsage(result.usage);
    if (!known.value) throw new AiBudgetError("AI_BUDGET_UNAVAILABLE");
    if (input.signal?.aborted) throw cancelled();
  } catch (error) {
    const descriptor =
      error && typeof error === "object"
        ? Object.getOwnPropertyDescriptor(error, "usage")
        : undefined;
    if (descriptor && "value" in descriptor) {
      const usage = readUsage(descriptor.value);
      if (usage) {
        if (
          known.value &&
          (known.value.inputTokens !== usage.inputTokens ||
            known.value.outputTokens !== usage.outputTokens)
        )
          conflicting = true;
        else known.value = usage;
      }
    }
    if (known.value && !conflicting)
      await input.client.settle(binding, known.value);
    else await input.client.markUnknown(binding);
    if (conflicting) throw new AiBudgetError("AI_BUDGET_UNAVAILABLE");
    throw error;
  }
  await input.client.settle(binding, result.usage);
  if (input.signal?.aborted) throw cancelled();
  return result.value;
}
