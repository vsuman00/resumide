import { performance } from "node:perf_hooks";
import { z } from "zod";
import { runProviderAttempt } from "./provider-attempt";
import {
  floorNumber,
  RestoreFloorStore,
  sameFloor,
  type RestoreDeadlineOptions,
  type RestoreFloorState,
} from "./restore-floor";

const counter = z.string().refine((value) => {
  try {
    return floorNumber(value) === value;
  } catch {
    return false;
  }
});
const instance = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u);
const proofFields = {
  generation: counter,
  revision: counter,
  fence: counter,
  instanceId: instance,
};
const FenceSchema = z.strictObject({
  schemaVersion: z.literal("restore-fence/1.0.0"),
  ...proofFields,
});
const OutcomeSchema = z.strictObject({
  schemaVersion: z.literal("restore-outcome/1.0.0"),
  ...proofFields,
  outcome: z.enum(["committed", "not_committed", "unknown"]),
  guardVersion: z.literal("restore-admission-guards/1.0.0"),
});
const CandidateSchema = z.strictObject({
  schemaVersion: z.literal("restore-candidate/1.0.0"),
  ...proofFields,
  guardVersion: z.literal("restore-admission-guards/1.0.0"),
});
const OpenSchema = z.strictObject({
  schemaVersion: z.literal("restore-open/1.0.0"),
  ...proofFields,
});
function evidence<T>(schema: z.ZodType<T>, raw: unknown): T {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw unavailable();
  const proto = Object.getPrototypeOf(raw),
    keys = Reflect.ownKeys(raw);
  if ((proto !== Object.prototype && proto !== null) || keys.length > 8)
    throw unavailable();
  for (const key of keys) {
    const field = Object.getOwnPropertyDescriptor(raw, key);
    if (
      typeof key !== "string" ||
      !field ||
      field.get ||
      field.set ||
      !field.enumerable ||
      typeof field.value !== "string" ||
      field.value.length > 128
    )
      throw unavailable();
  }
  return schema.parse(raw);
}
export type RestoreFenceProof = z.infer<typeof FenceSchema>;
export type RestoreCall = {
  state: RestoreFloorState;
  generation: string;
  signal: AbortSignal;
};
/**
 * Required trusted control-plane adapters; no production implementation is provided here.
 * Evidence must be independently observed, never an echo of these arguments. In particular,
 * fencing/opening must reject stale tokens at their actual effect, even after cancellation.
 * The checkpoint covers the actual instance, guards and cutover commit, not sweep counts.
 */
export interface TrustedRestoreAuthority {
  quarantine(call: RestoreCall): Promise<unknown>;
  transition(
    call: RestoreCall & { fenceProof: RestoreFenceProof },
  ): Promise<unknown>;
  inspect(
    call: RestoreCall & { fenceProof: RestoreFenceProof },
  ): Promise<unknown>;
  inspectCandidate(
    call: RestoreCall & { fenceProof: RestoreFenceProof; candidate: unknown },
  ): Promise<unknown>;
  reopen(
    call: RestoreCall & { fenceProof: RestoreFenceProof },
  ): Promise<unknown>;
}
export class RestoreAdmissionError extends Error {
  constructor() {
    super("Restore admission could not be confirmed; quarantine is required.");
    this.name = "RestoreAdmissionError";
  }
}
const unavailable = () => new RestoreAdmissionError();
export type NonCommitAuthorization = Readonly<{ state: RestoreFloorState }>;
export type RestoreReconciliation =
  | { outcome: "committed"; state: RestoreFloorState }
  | { outcome: "not_committed"; authorization: NonCommitAuthorization }
  | { outcome: "unknown"; state: RestoreFloorState };
/** Bounded orchestration, not proof of physical fencing or storage independence. */
export class RestoreAdmissionController {
  private readonly permissions = new WeakSet<NonCommitAuthorization>();
  private quarantineUnconfirmed = false;
  constructor(
    private readonly store: RestoreFloorStore,
    private readonly authority: TrustedRestoreAuthority,
  ) {
    if (
      !authority ||
      [
        "quarantine",
        "transition",
        "inspect",
        "inspectCandidate",
        "reopen",
      ].some(
        (key) =>
          typeof authority[key as keyof TrustedRestoreAuthority] !== "function",
      )
    )
      throw unavailable();
  }
  private async bounded<T>(
    options: RestoreDeadlineOptions,
    execute: (context: {
      signal: AbortSignal;
      active: () => void;
      remaining: () => RestoreDeadlineOptions;
      markReady: (state: RestoreFloorState | undefined) => void;
    }) => Promise<T>,
  ): Promise<T> {
    const ms = options.timeoutMs ?? 5000;
    if (
      this.quarantineUnconfirmed ||
      !Number.isSafeInteger(ms) ||
      ms < 1 ||
      ms > 5000 ||
      options.signal?.aborted
    )
      throw unavailable();
    const end = performance.now() + ms;
    let published: RestoreFloorState | undefined;
    try {
      const result = await runProviderAttempt({
        timeoutMs: ms,
        signal: options.signal,
        failure: unavailable,
        execute: async (signal) => {
          const active = () => {
            if (signal.aborted || performance.now() >= end) throw unavailable();
          };
          const remaining = () => {
            active();
            return {
              signal,
              timeoutMs: Math.max(1, Math.ceil(end - performance.now())),
            };
          };
          active();
          const result = await execute({
            signal,
            active,
            remaining,
            markReady: (state) => {
              published = state;
            },
          });
          active();
          return result;
        },
      });
      if (options.signal?.aborted || performance.now() >= end)
        throw unavailable();
      return result;
    } catch {
      if (published)
        void this.store.quarantine(published).catch(() => {
          this.quarantineUnconfirmed = true;
        });
      throw unavailable();
    }
  }
  private async current(
    state: RestoreFloorState,
    options: RestoreDeadlineOptions,
  ) {
    if (!sameFloor(await this.store.read(options), state)) throw unavailable();
  }
  private match(
    proof:
      | z.infer<typeof FenceSchema>
      | z.infer<typeof OutcomeSchema>
      | z.infer<typeof CandidateSchema>
      | z.infer<typeof OpenSchema>,
    state: RestoreFloorState,
    generation: string,
    instanceId?: string,
  ) {
    if (
      proof.generation !== generation ||
      proof.revision !== state.revision ||
      proof.fence !== state.fence ||
      (instanceId !== undefined && proof.instanceId !== instanceId)
    )
      throw unavailable();
  }
  /** Exactly one transition. Missing/unknown outcome never authorizes an automatic retry. */
  async transition(
    options: RestoreDeadlineOptions = {},
    authorization?: NonCommitAuthorization,
  ): Promise<RestoreFloorState> {
    return this.bounded(
      options,
      async ({ signal, active, remaining, markReady }) => {
        const prior = await this.store.read(remaining());
        const bootstrap =
          prior.generation === "0" &&
          prior.revision === "0" &&
          prior.fence === "0";
        if (prior.phase !== "ready" && !bootstrap) {
          if (
            !authorization ||
            !this.permissions.has(authorization) ||
            !sameFloor(authorization.state, prior)
          )
            throw unavailable();
          this.permissions.delete(authorization);
        }
        const quarantined = await this.store.quarantine(prior, remaining());
        const generation = floorNumber(
          (BigInt(quarantined.generation) + 1n).toString(),
        );
        const proof = evidence(
          FenceSchema,
          await this.authority.quarantine({
            state: quarantined,
            generation,
            signal,
          }),
        );
        active();
        this.match(proof, quarantined, generation);
        await this.current(quarantined, remaining());
        const advanced = await this.store.advance(quarantined, remaining());
        active();
        await this.current(advanced, remaining());
        await this.authority.transition({
          state: advanced,
          generation,
          signal,
          fenceProof: proof,
        });
        active();
        await this.current(advanced, remaining());
        const outcome = evidence(
          OutcomeSchema,
          await this.authority.inspect({
            state: advanced,
            generation,
            signal,
            fenceProof: proof,
          }),
        );
        active();
        this.match(outcome, advanced, generation, proof.instanceId);
        await this.current(advanced, remaining());
        if (outcome.outcome !== "committed") throw unavailable();
        return this.open(advanced, proof, signal, active, remaining, markReady);
      },
    );
  }
  /** Checkpoint-outcome reconciliation requires a readable journal. It cannot recover
   * a crash-left physical lock or prove that an outstanding disk operation quiesced.
   * The trusted external fence must reject earlier controllers at actual effects. */
  async reconcileQuarantine(
    options: RestoreDeadlineOptions = {},
  ): Promise<RestoreReconciliation> {
    return this.bounded(
      options,
      async ({ signal, active, remaining, markReady }) => {
        const prior = await this.store.read(remaining());
        if (prior.phase !== "quarantined") throw unavailable();
        const state = await this.store.quarantine(prior, remaining());
        const generation = state.generation;
        const proof = evidence(
          FenceSchema,
          await this.authority.quarantine({ state, generation, signal }),
        );
        active();
        this.match(proof, state, generation);
        await this.current(state, remaining());
        const outcome = evidence(
          OutcomeSchema,
          await this.authority.inspect({
            state,
            generation,
            signal,
            fenceProof: proof,
          }),
        );
        active();
        this.match(outcome, state, generation, proof.instanceId);
        await this.current(state, remaining());
        if (outcome.outcome === "unknown") return { outcome: "unknown", state };
        if (outcome.outcome === "not_committed") {
          const authorization = Object.freeze({ state });
          this.permissions.add(authorization);
          return { outcome: "not_committed", authorization };
        }
        if (generation === "0") throw unavailable();
        return {
          outcome: "committed",
          state: await this.open(
            state,
            proof,
            signal,
            active,
            remaining,
            markReady,
          ),
        };
      },
    );
  }
  /** Candidate is only a handle for trusted provenance inspection, never a claimed timestamp/epoch. */
  async admitRestoredCandidate(
    candidate: unknown,
    options: RestoreDeadlineOptions = {},
  ): Promise<RestoreFloorState> {
    return this.bounded(
      options,
      async ({ signal, active, remaining, markReady }) => {
        const state = await this.store.quarantine(
          await this.store.read(remaining()),
          remaining(),
        );
        const generation = state.generation;
        if (generation === "0") throw unavailable();
        const proof = evidence(
          FenceSchema,
          await this.authority.quarantine({ state, generation, signal }),
        );
        active();
        this.match(proof, state, generation);
        await this.current(state, remaining());
        const provenance = evidence(
          CandidateSchema,
          await this.authority.inspectCandidate({
            state,
            generation,
            signal,
            fenceProof: proof,
            candidate,
          }),
        );
        active();
        this.match(provenance, state, generation, proof.instanceId);
        await this.current(state, remaining());
        const outcome = evidence(
          OutcomeSchema,
          await this.authority.inspect({
            state,
            generation,
            signal,
            fenceProof: proof,
          }),
        );
        active();
        this.match(outcome, state, generation, proof.instanceId);
        await this.current(state, remaining());
        if (outcome.outcome !== "committed") throw unavailable();
        return this.open(state, proof, signal, active, remaining, markReady);
      },
    );
  }
  private async open(
    state: RestoreFloorState,
    proof: RestoreFenceProof,
    signal: AbortSignal,
    active: () => void,
    remaining: () => RestoreDeadlineOptions,
    markReady: (state: RestoreFloorState | undefined) => void,
  ): Promise<RestoreFloorState> {
    active();
    await this.current(state, remaining());
    const intended = Object.freeze({
      ...state,
      revision: floorNumber((BigInt(state.revision) + 1n).toString()),
      phase: "ready" as const,
    });
    markReady(intended);
    try {
      const ready = await this.store.ready(state, remaining());
      active();
      await this.current(ready, remaining());
      const opened = evidence(
        OpenSchema,
        await this.authority.reopen({
          state: ready,
          generation: ready.generation,
          signal,
          fenceProof: proof,
        }),
      );
      active();
      this.match(opened, ready, ready.generation, proof.instanceId);
      await this.current(ready, remaining());
      return ready;
    } catch {
      // Fence a delayed reopen with a newer durable token. Underlying adapter effects must
      // consult current authority; a timer cannot forcibly cancel an external operation.
      try {
        const observed = await this.store.read(remaining());
        if (sameFloor(observed, intended))
          await this.store.quarantine(intended, remaining());
        else if (observed.phase !== "quarantined") throw unavailable();
        markReady(undefined);
      } catch {
        markReady(intended);
      }
      throw unavailable();
    }
  }
}
