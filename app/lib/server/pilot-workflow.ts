import { createHash } from "node:crypto";
import { z } from "zod";
import { ScoreDimensionId } from "./score-v2-contract";
import {
  PILOT_METRICS,
  hashPilotProtocol,
  pilotProtocolSchema,
} from "./pilot-evidence";

const id = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const version = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_./-]{0,99}$/);
const time = z.iso.datetime({ offset: true });
const role = z.enum(["owner", "adviser", "participant", "adapter"]);
const kind = z.enum(["human", "ai", "service"]);
const actorSchema = z.strictObject({ reference: id, role, kind });
const contextSchema = actorSchema.extend({ asOf: time });
const runtimeMetadata = z.strictObject({
  runId: id,
  previousPolicyVersion: version,
  actors: z.array(actorSchema).min(1).max(64),
  participantSources: z
    .array(z.strictObject({ participantReference: id, sourceHash: hash }))
    .min(1)
    .max(256),
});
const measurement = z
  .strictObject({ metric: z.enum(PILOT_METRICS), value: z.number().finite() })
  .refine(({ metric, value }) => {
    if (metric === "rubric_agreement") return value >= -1 && value <= 1;
    if (metric === "safety_incidents")
      return Number.isInteger(value) && value >= 0;
    if (metric === "latency_ms" || metric === "cost_usd") return value >= 0;
    return value >= 0 && value <= 1;
  });
const base = {
  schemaVersion: z.literal(1),
  runId: id,
  commandId: id,
  expectedRevision: z.number().int().min(0).max(4096),
};
const subject = { participantReference: id };
const commandSchema = z.discriminatedUnion("action", [
  z.strictObject({
    ...base,
    action: z.literal("notice"),
    ...subject,
    noticeReference: id,
  }),
  z.strictObject({ ...base, action: z.literal("read_advisory"), ...subject }),
  z.strictObject({
    ...base,
    action: z.literal("decision"),
    ...subject,
    rubricHash: hash,
    decision: z.enum(["confirmed", "overridden"]),
    rationaleReference: id,
  }),
  z.strictObject({
    ...base,
    action: z.literal("open_correction"),
    ...subject,
    caseReference: id,
    reasonReference: id,
  }),
  z.strictObject({
    ...base,
    action: z.literal("resolve_correction"),
    ...subject,
    caseReference: id,
    oldSourceHash: hash,
    newSourceHash: hash,
    resolutionReference: id,
  }),
  z.strictObject({
    ...base,
    action: z.literal("open_appeal"),
    ...subject,
    caseReference: id,
    decisionEventHash: hash,
    reasonReference: id,
  }),
  z.strictObject({
    ...base,
    action: z.literal("resolve_appeal"),
    ...subject,
    caseReference: id,
    resolutionReference: id,
  }),
  z.strictObject({
    ...base,
    action: z.literal("vendor_observe"),
    documentHash: hash,
    attempts: z.number().int().min(2).max(16),
  }),
  z.strictObject({ ...base, action: z.literal("monitor"), measurement }),
  z.strictObject({ ...base, action: z.literal("stop"), reasonReference: id }),
  z.strictObject({
    ...base,
    action: z.literal("rollback"),
    previousPolicyVersion: version,
    reasonReference: id,
  }),
  z.strictObject({ ...base, action: z.literal("revoke"), reasonReference: id }),
  z.strictObject({
    ...base,
    action: z.literal("delete_retained"),
    reasonReference: id,
  }),
]);
const rubricSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    producer: z.literal("deterministic_rules"),
    policyVersion: version,
    sourceHash: hash,
    evidenceHash: hash,
    dimensions: z
      .array(
        z
          .strictObject({
            id: ScoreDimensionId,
            value: z.number().min(0).max(100).nullable(),
            withheldReason: z
              .enum(["uncalibrated", "review_required", "unsupported"])
              .nullable(),
          })
          .refine((d) =>
            d.value === null
              ? d.withheldReason !== null
              : d.withheldReason === null,
          ),
      )
      .length(3),
  })
  .refine((r) => new Set(r.dimensions.map((d) => d.id)).size === 3);
const adapterResult = z
  .strictObject({
    outcome: z.enum(["accepted", "rejected", "error"]),
    outputHash: hash.nullable(),
    errorCode: z
      .enum([
        "unsupported_input",
        "ingestion_failed",
        "timeout",
        "vendor_rejected",
      ])
      .nullable(),
    latencyMs: z.number().finite().nonnegative().nullable(),
    costUsd: z.number().finite().nonnegative().nullable(),
  })
  .refine((r) =>
    r.outcome === "accepted"
      ? r.outputHash !== null &&
        r.errorCode === null &&
        r.latencyMs !== null &&
        r.costUsd !== null
      : r.outputHash === null && r.errorCode !== null,
  );
type Rubric = z.infer<typeof rubricSchema>;
export type PilotWorkflowRuntime = z.infer<typeof runtimeMetadata> & {
  actorContext(): unknown;
  deliverNotice(binding: {
    participantReference: string;
    noticeReference: string;
    protocolHash: string;
  }): unknown | Promise<unknown>;
  readRubric(binding: {
    participantReference: string;
    sourceHash: string;
    protocolHash: string;
  }): unknown | Promise<unknown>;
  authorizeSourceUpdate?(binding: {
    participantReference: string;
    oldSourceHash: string;
    newSourceHash: string;
    protocolHash: string;
  }): boolean;
  vendorAdapter?: {
    evidenceTier: "synthetic_engineering" | "external_vendor";
    observe(binding: {
      documentHash: string;
      attempt: number;
      requestId: string;
      protocolHash: string;
    }): unknown | Promise<unknown>;
  };
  authorizeExternalVendor?(binding: {
    protocolHash: string;
    vendor: NonNullable<z.infer<typeof pilotProtocolSchema>["vendor"]>;
  }): boolean;
  deleteRetainedData?(binding: {
    runId: string;
    protocolHash: string;
  }): unknown | Promise<unknown>;
};
export type PilotWorkflowReason =
  | "INVALID_PROTOCOL"
  | "INVALID_RUNTIME"
  | "INVALID_COMMAND"
  | "ACCESS_DENIED"
  | "REVISION_CONFLICT"
  | "COMMAND_CONFLICT"
  | "RUN_BUSY"
  | "EVENT_LIMIT"
  | "TIME_BOUNDARY"
  | "RUN_NOT_ACTIVE"
  | "NOTICE_REQUIRED"
  | "HUMAN_REQUIRED"
  | "RUBRIC_INVALID"
  | "RUBRIC_DRIFT"
  | "CASE_CONFLICT"
  | "CASE_NOT_OPEN"
  | "SOURCE_UPDATE_DENIED"
  | "DECISION_NOT_FOUND"
  | "CALLBACK_FAILED"
  | "VENDOR_AUTHORITY_REQUIRED"
  | "ROLLBACK_BINDING"
  | "DELETION_NOT_VERIFIED";
export type PilotWorkflowResult = {
  status: "applied" | "idempotent" | "rejected";
  reason: PilotWorkflowReason | null;
  revision: number;
  eventHash: string | null;
  rubric?: Rubric;
};
type Event = {
  schemaVersion: 1;
  revision: number;
  runId: string;
  protocolHash: string;
  commandId: string;
  action: z.infer<typeof commandSchema>["action"];
  actorReference: string;
  actorKind: z.infer<typeof kind>;
  recordedAt: string;
  previousEventHash: string | null;
  details: Record<string, unknown>;
  eventHash: string;
};
type RunState = "active" | "stopped" | "rolled_back" | "revoked" | "deleted";
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, stable(v)]),
    );
  return value;
}
const digest = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
export type PilotWorkflow = {
  execute(command: unknown): Promise<PilotWorkflowResult>;
  /** Server-only sanitized audit metadata; never a candidate advisory read bypass. */
  auditSnapshot(): {
    schemaVersion: 1;
    runId: string;
    protocolHash: string;
    revision: number;
    state: RunState;
    events: Event[];
  };
};

/** One ephemeral server-owned run. No hosted persistence or external contact is created. */
export function createPilotWorkflow(
  protocolInput: unknown,
  runtime: PilotWorkflowRuntime,
): {
  status: "created" | "rejected";
  reason: "INVALID_PROTOCOL" | "INVALID_RUNTIME" | null;
  workflow: PilotWorkflow | null;
} {
  const parsed = pilotProtocolSchema.safeParse(protocolInput);
  if (!parsed.success)
    return { status: "rejected", reason: "INVALID_PROTOCOL", workflow: null };
  const protocol = parsed.data;
  const flags = protocol.restrictions;
  if (
    protocol.scope.domain !== "software_engineering" ||
    protocol.scope.language !== "en" ||
    protocol.scope.locale !== "IN" ||
    !flags.advisoryOnly ||
    !flags.visibleRubric ||
    !flags.overrideRequiresRationale ||
    flags.automaticRejection ||
    flags.hiddenScore ||
    flags.proprietaryScoreInference ||
    flags.generalVendorEquivalence ||
    flags.selectionProbabilityClaims ||
    !(
      Date.parse(protocol.startsAt) < Date.parse(protocol.endsAt) &&
      Date.parse(protocol.endsAt) <= Date.parse(protocol.retentionUntil)
    ) ||
    !protocol.participantReferences.length ||
    new Set(protocol.participantReferences).size !==
      protocol.participantReferences.length ||
    new Set(protocol.documentHashes).size !== protocol.documentHashes.length
  )
    return { status: "rejected", reason: "INVALID_PROTOCOL", workflow: null };
  const metadata = runtimeMetadata.safeParse({
    runId: runtime?.runId,
    previousPolicyVersion: runtime?.previousPolicyVersion,
    actors: runtime?.actors,
    participantSources: runtime?.participantSources,
  });
  if (
    !metadata.success ||
    typeof runtime?.actorContext !== "function" ||
    typeof runtime.deliverNotice !== "function" ||
    typeof runtime.readRubric !== "function"
  )
    return { status: "rejected", reason: "INVALID_RUNTIME", workflow: null };
  const config = metadata.data;
  if (
    new Set(config.actors.map((a) => a.reference)).size !==
      config.actors.length ||
    !config.actors.some((a) => a.role === "owner" && a.kind === "human") ||
    config.participantSources.length !==
      protocol.participantReferences.length ||
    new Set(config.participantSources.map((s) => s.participantReference))
      .size !== config.participantSources.length ||
    config.participantSources.some(
      (s) =>
        !protocol.participantReferences.includes(s.participantReference) ||
        !protocol.documentHashes.includes(s.sourceHash),
    )
  )
    return { status: "rejected", reason: "INVALID_RUNTIME", workflow: null };
  const protocolHash = hashPilotProtocol(protocol)!;
  const sources = new Map(
    config.participantSources.map((s) => [
      s.participantReference,
      s.sourceHash,
    ]),
  );
  const events: Event[] = [];
  const notices = new Set<string>();
  const rubrics = new Map<string, { hash: string; value: Rubric }>();
  const decisions = new Map<string, string>();
  const cases = new Map<
    string,
    { participant: string; type: "correction" | "appeal"; open: boolean }
  >();
  const commands = new Map<
    string,
    { hash: string; actor: string; result: PilotWorkflowResult }
  >();
  let state: RunState = "active";
  let busy = false;
  let lastTime = Date.parse(protocol.startsAt);
  const rejected = (reason: PilotWorkflowReason): PilotWorkflowResult => ({
    status: "rejected",
    reason,
    revision: events.length,
    eventHash: null,
  });
  const thresholdBreached = (metric: string, value: number) =>
    !protocol.criteria.some((c) => c.metric === metric) ||
    protocol.criteria.some(
      (c) =>
        c.metric === metric &&
        (c.comparison === "maximum" ? value > c.value : value < c.value),
    );
  const execute = async (input: unknown): Promise<PilotWorkflowResult> => {
    const parsedCommand = commandSchema.safeParse(input);
    if (!parsedCommand.success) return rejected("INVALID_COMMAND");
    const command = parsedCommand.data;
    let actor: z.infer<typeof contextSchema>;
    try {
      const context = contextSchema.safeParse(runtime.actorContext());
      if (!context.success) return rejected("ACCESS_DENIED");
      actor = context.data;
    } catch {
      return rejected("ACCESS_DENIED");
    }
    if (
      command.runId !== config.runId ||
      !config.actors.some(
        (a) =>
          a.reference === actor.reference &&
          a.role === actor.role &&
          a.kind === actor.kind,
      )
    )
      return rejected("ACCESS_DENIED");
    const now = Date.parse(actor.asOf);
    const requestHash = digest(command);
    if (now < lastTime || now < Date.parse(protocol.startsAt))
      return rejected("TIME_BOUNDARY");
    const cleanup = ["rollback", "stop", "revoke", "delete_retained"].includes(
      command.action,
    );
    if (
      (!cleanup &&
        (now > Date.parse(protocol.endsAt) ||
          now >= Date.parse(protocol.retentionUntil))) ||
      state === "deleted"
    )
      return rejected("TIME_BOUNDARY");
    if (
      state !== "active" &&
      !["rollback", "delete_retained", "revoke"].includes(command.action)
    )
      return rejected("RUN_NOT_ACTIVE");
    const participant =
      "participantReference" in command ? command.participantReference : null;
    if (
      participant &&
      (!sources.has(participant) ||
        (actor.role === "participant" && actor.reference !== participant))
    )
      return rejected("ACCESS_DENIED");
    const staff = actor.role === "owner" || actor.role === "adviser";
    if (
      ["stop", "rollback", "revoke", "delete_retained", "monitor"].includes(
        command.action,
      ) &&
      actor.role !== "owner"
    )
      return rejected("ACCESS_DENIED");
    if (
      ["notice", "decision", "resolve_correction", "resolve_appeal"].includes(
        command.action,
      ) &&
      !staff
    )
      return rejected("ACCESS_DENIED");
    if (
      ["open_correction", "open_appeal"].includes(command.action) &&
      !staff &&
      actor.role !== "participant"
    )
      return rejected("ACCESS_DENIED");
    if (
      ["decision", "resolve_correction", "resolve_appeal"].includes(
        command.action,
      ) &&
      actor.kind !== "human"
    )
      return rejected("HUMAN_REQUIRED");
    if (
      command.action === "vendor_observe" &&
      !["owner", "adapter"].includes(actor.role)
    )
      return rejected("ACCESS_DENIED");
    if (
      command.action === "read_advisory" &&
      !staff &&
      actor.role !== "participant"
    )
      return rejected("ACCESS_DENIED");
    const freshContextReason = (): PilotWorkflowReason | null => {
      try {
        const current = contextSchema.safeParse(runtime.actorContext());
        if (
          !current.success ||
          current.data.reference !== actor.reference ||
          current.data.role !== actor.role ||
          current.data.kind !== actor.kind
        )
          return "ACCESS_DENIED";
        const latest = Date.parse(current.data.asOf);
        if (
          latest < Math.max(lastTime, Date.parse(actor.asOf)) ||
          latest > Date.parse(protocol.endsAt) ||
          latest >= Date.parse(protocol.retentionUntil)
        )
          return "TIME_BOUNDARY";
        actor = current.data;
        return null;
      } catch {
        return "ACCESS_DENIED";
      }
    };
    if (busy) return rejected("RUN_BUSY");
    const prior = commands.get(command.commandId);
    if (prior) {
      if (prior.hash !== requestHash || prior.actor !== actor.reference)
        return rejected("COMMAND_CONFLICT");
      if (
        prior.result.rubric &&
        participant &&
        prior.result.rubric.sourceHash !== sources.get(participant)
      )
        return rejected("RUBRIC_DRIFT");
      return { ...structuredClone(prior.result), status: "idempotent" };
    }
    if (command.expectedRevision !== events.length)
      return rejected("REVISION_CONFLICT");
    if (events.length >= 4096) return rejected("EVENT_LIMIT");
    busy = true;
    try {
      let details: Record<string, unknown> = {};
      let visibleRubric: Rubric | undefined;
      let commandFailure: PilotWorkflowReason | null = null;
      let change: () => void = () => undefined;
      switch (command.action) {
        case "notice": {
          const receipt = z.strictObject({ receiptHash: hash }).safeParse(
            await runtime.deliverNotice({
              participantReference: command.participantReference,
              noticeReference: command.noticeReference,
              protocolHash,
            }),
          );
          if (!receipt.success) return rejected("CALLBACK_FAILED");
          details = {
            participantReference: command.participantReference,
            noticeReference: command.noticeReference,
            receiptHash: receipt.data.receiptHash,
          };
          change = () => {
            notices.add(command.participantReference);
          };
          break;
        }
        case "read_advisory": {
          if (!notices.has(command.participantReference))
            return rejected("NOTICE_REQUIRED");
          const read = rubricSchema.safeParse(
            await runtime.readRubric({
              participantReference: command.participantReference,
              sourceHash: sources.get(command.participantReference)!,
              protocolHash,
            }),
          );
          const freshness = freshContextReason();
          if (freshness) return rejected(freshness);
          if (
            !read.success ||
            read.data.sourceHash !== sources.get(command.participantReference)
          )
            return rejected("RUBRIC_INVALID");
          const rubricHash = digest(read.data);
          visibleRubric = read.data;
          details = {
            participantReference: command.participantReference,
            rubricHash,
            sourceHash: read.data.sourceHash,
            policyVersion: read.data.policyVersion,
          };
          change = () => {
            rubrics.set(command.participantReference, {
              hash: rubricHash,
              value: read.data,
            });
          };
          break;
        }
        case "decision": {
          if (!notices.has(command.participantReference))
            return rejected("NOTICE_REQUIRED");
          if (
            rubrics.get(command.participantReference)?.hash !==
            command.rubricHash
          )
            return rejected("RUBRIC_DRIFT");
          details = {
            participantReference: command.participantReference,
            rubricHash: command.rubricHash,
            decision: command.decision,
            rationaleReference: command.rationaleReference,
            sourceHash: sources.get(command.participantReference)!,
          };
          break;
        }
        case "open_correction":
        case "open_appeal": {
          if (cases.has(command.caseReference))
            return rejected("CASE_CONFLICT");
          if (
            command.action === "open_appeal" &&
            decisions.get(command.decisionEventHash) !==
              command.participantReference
          )
            return rejected("DECISION_NOT_FOUND");
          details = {
            participantReference: command.participantReference,
            caseReference: command.caseReference,
            reasonReference: command.reasonReference,
            sourceHash: sources.get(command.participantReference)!,
            ...(command.action === "open_appeal"
              ? { decisionEventHash: command.decisionEventHash }
              : {}),
          };
          change = () => {
            cases.set(command.caseReference, {
              participant: command.participantReference,
              type:
                command.action === "open_correction" ? "correction" : "appeal",
              open: true,
            });
          };
          break;
        }
        case "resolve_correction":
        case "resolve_appeal": {
          const opened = cases.get(command.caseReference);
          if (
            !opened?.open ||
            opened.participant !== command.participantReference ||
            opened.type !==
              (command.action === "resolve_correction"
                ? "correction"
                : "appeal")
          )
            return rejected("CASE_NOT_OPEN");
          if (command.action === "resolve_correction") {
            if (
              sources.get(command.participantReference) !==
                command.oldSourceHash ||
              runtime.authorizeSourceUpdate?.({
                participantReference: command.participantReference,
                oldSourceHash: command.oldSourceHash,
                newSourceHash: command.newSourceHash,
                protocolHash,
              }) !== true
            )
              return rejected("SOURCE_UPDATE_DENIED");
            details = {
              oldSourceHash: command.oldSourceHash,
              newSourceHash: command.newSourceHash,
            };
          }
          details = {
            ...details,
            participantReference: command.participantReference,
            caseReference: command.caseReference,
            resolutionReference: command.resolutionReference,
          };
          change = () => {
            opened.open = false;
            rubrics.delete(command.participantReference);
            if (command.action === "resolve_correction")
              sources.set(command.participantReference, command.newSourceHash);
          };
          break;
        }
        case "vendor_observe": {
          const adapter = runtime.vendorAdapter;
          if (
            !adapter ||
            !protocol.documentHashes.includes(command.documentHash) ||
            (protocol.mode === "prerelease_engineering" &&
              adapter.evidenceTier !== "synthetic_engineering") ||
            (protocol.mode === "external_pilot" &&
              (adapter.evidenceTier !== "external_vendor" ||
                !protocol.vendor ||
                runtime.authorizeExternalVendor?.({
                  protocolHash,
                  vendor: protocol.vendor,
                }) !== true))
          )
            return rejected("VENDOR_AUTHORITY_REQUIRED");
          const observations = [];
          let interruptionReason: PilotWorkflowReason | null = null;
          const authorizedAttempt = (): PilotWorkflowReason | null => {
            const freshness = freshContextReason();
            if (freshness) return freshness;
            if (protocol.mode !== "external_pilot") return null;
            try {
              return protocol.vendor &&
                runtime.authorizeExternalVendor?.({
                  protocolHash,
                  vendor: protocol.vendor,
                }) === true
                ? null
                : "VENDOR_AUTHORITY_REQUIRED";
            } catch {
              return "VENDOR_AUTHORITY_REQUIRED";
            }
          };
          for (let attempt = 1; attempt <= command.attempts; attempt++) {
            interruptionReason = authorizedAttempt();
            if (interruptionReason) break;
            let output: unknown;
            try {
              output = await adapter.observe({
                documentHash: command.documentHash,
                attempt,
                requestId: `${command.commandId}_${attempt}`,
                protocolHash,
              });
            } catch {
              output = {
                outcome: "error",
                outputHash: null,
                errorCode: "ingestion_failed",
                latencyMs: null,
                costUsd: null,
              };
            }
            const parsedOutput = adapterResult.safeParse(output);
            const value: z.infer<typeof adapterResult> = parsedOutput.success
              ? parsedOutput.data
              : {
                  outcome: "error",
                  outputHash: null,
                  errorCode: "ingestion_failed",
                  latencyMs: null,
                  costUsd: null,
                };
            observations.push({ attempt, ...value });
            interruptionReason = authorizedAttempt();
            if (interruptionReason) break;
            if (
              value.latencyMs === null ||
              value.costUsd === null ||
              thresholdBreached("latency_ms", value.latencyMs) ||
              thresholdBreached("cost_usd", value.costUsd) ||
              thresholdBreached(
                "error_rate",
                observations.filter((o) => o.outcome !== "accepted").length /
                  observations.length,
              )
            )
              break;
          }
          if (!observations.length)
            return rejected(interruptionReason ?? "VENDOR_AUTHORITY_REQUIRED");
          const errorRate =
            observations.filter((o) => o.outcome !== "accepted").length /
            observations.length;
          const stopped =
            interruptionReason !== null ||
            thresholdBreached("error_rate", errorRate) ||
            observations.some(
              (o) =>
                o.latencyMs === null ||
                o.costUsd === null ||
                thresholdBreached("latency_ms", o.latencyMs) ||
                thresholdBreached("cost_usd", o.costUsd),
            );
          details = {
            documentHash: command.documentHash,
            evidenceTier: adapter.evidenceTier,
            requestedAttempts: command.attempts,
            completedAttempts: observations.length,
            interruptionReason,
            observations,
            errorRate,
            stopped,
          };
          if (stopped)
            change = () => {
              state = "stopped";
            };
          break;
        }
        case "monitor": {
          const stopped = thresholdBreached(
            command.measurement.metric,
            command.measurement.value,
          );
          details = { ...command.measurement, stopped };
          if (stopped)
            change = () => {
              state = "stopped";
            };
          break;
        }
        case "rollback":
          if (command.previousPolicyVersion !== config.previousPolicyVersion)
            return rejected("ROLLBACK_BINDING");
          details = {
            previousPolicyVersion: config.previousPolicyVersion,
            reasonReference: command.reasonReference,
          };
          change = () => {
            state = "rolled_back";
          };
          break;
        case "stop":
        case "revoke":
          details = { reasonReference: command.reasonReference };
          change = () => {
            state = command.action === "stop" ? "stopped" : "revoked";
          };
          break;
        case "delete_retained": {
          let output: unknown = null;
          try {
            output = await runtime.deleteRetainedData?.({
              runId: config.runId,
              protocolHash,
            });
          } catch {
            output = null;
          }
          const receipt = z
            .strictObject({
              deletionReceiptHash: hash,
              remainingDocumentCount: z.literal(0),
            })
            .safeParse(output);
          if (!receipt.success) {
            commandFailure = "DELETION_NOT_VERIFIED";
            details = {
              deletionVerified: false,
              reasonReference: command.reasonReference,
            };
            change = () => {
              state = "revoked";
              rubrics.clear();
            };
            break;
          }
          details = {
            ...receipt.data,
            deletionVerified: true,
            reasonReference: command.reasonReference,
          };
          change = () => {
            state = "deleted";
            rubrics.clear();
            sources.clear();
            notices.clear();
          };
          break;
        }
      }
      const payload = {
        schemaVersion: 1 as const,
        revision: events.length + 1,
        runId: config.runId,
        protocolHash,
        commandId: command.commandId,
        action: command.action,
        actorReference: actor.reference,
        actorKind: actor.kind,
        recordedAt: actor.asOf,
        previousEventHash: events.at(-1)?.eventHash ?? null,
        details,
      };
      const event = { ...payload, eventHash: digest(payload) };
      events.push(event);
      change();
      lastTime = Date.parse(actor.asOf);
      if (command.action === "decision")
        decisions.set(event.eventHash, command.participantReference);
      const result: PilotWorkflowResult = {
        status: commandFailure ? "rejected" : "applied",
        reason: commandFailure,
        revision: event.revision,
        eventHash: event.eventHash,
        ...(visibleRubric ? { rubric: structuredClone(visibleRubric) } : {}),
      };
      commands.set(command.commandId, {
        hash: requestHash,
        actor: actor.reference,
        result: structuredClone(result),
      });
      return result;
    } catch {
      return rejected("CALLBACK_FAILED");
    } finally {
      busy = false;
    }
  };
  return {
    status: "created",
    reason: null,
    workflow: {
      execute,
      auditSnapshot: () =>
        structuredClone({
          schemaVersion: 1 as const,
          runId: config.runId,
          protocolHash,
          revision: events.length,
          state,
          events,
        }),
    },
  };
}
