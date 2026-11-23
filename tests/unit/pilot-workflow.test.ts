import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createPilotWorkflow,
  type PilotWorkflowRuntime,
} from "../../app/lib/server/pilot-workflow";
import {
  PILOT_OPERATIONS,
  PILOT_METRICS,
} from "../../app/lib/server/pilot-evidence";
import { ScoreDimensionId } from "../../app/lib/server/score-v2-contract";

const digest = (digit: string) => digit.repeat(64);
function protocol(external = false) {
  return {
    schemaVersion: 1,
    mode: external ? "external_pilot" : "prerelease_engineering",
    id: "fixture-protocol-0001",
    createdBy: "fixture-owner-0001",
    scope: { domain: "software_engineering", language: "en", locale: "IN" },
    vendor: external
      ? {
          name: "Fictional vendor",
          version: "fixture-1",
          configurationHash: digest("b"),
        }
      : null,
    partnerReference: external ? "fixture-partner-0001" : null,
    environmentReference: external ? "fixture-environment-0001" : null,
    corpus: {
      corpusVersion: "fixture-corpus-0001",
      lockHash: digest("c"),
      annotationEvidenceHash: digest("d"),
    },
    documentHashes: [digest("e")],
    participantReferences: ["fixture-participant-0001"],
    startsAt: "2026-11-07T00:00:00Z",
    endsAt: "2026-11-08T00:00:00Z",
    retentionUntil: "2026-11-30T00:00:00Z",
    controls: Object.fromEntries(
      [...PILOT_OPERATIONS, "rubric", "claim"].map((key) => [
        key,
        `fixture-${key}-policy`,
      ]),
    ),
    claimTextHash: digest("f"),
    limitations: ["fixture-limitations-0001"],
    criteria: PILOT_METRICS.map((metric) => ({
      metric,
      comparison: [
        "rubric_agreement",
        "user_comprehension",
        "workflow_usefulness",
      ].includes(metric)
        ? "minimum"
        : "maximum",
      value: [
        "rubric_agreement",
        "user_comprehension",
        "workflow_usefulness",
      ].includes(metric)
        ? 0.25
        : 1,
    })),
    restrictions: {
      advisoryOnly: true,
      visibleRubric: true,
      overrideRequiresRationale: true,
      automaticRejection: false,
      hiddenScore: false,
      proprietaryScoreInference: false,
      generalVendorEquivalence: false,
      selectionProbabilityClaims: false,
    },
  };
}

function setup(plan = protocol()) {
  let actor = {
    reference: "fixture-owner-0001",
    role: "owner",
    kind: "human",
    asOf: "2026-11-07T10:00:00Z",
  };
  const notice = vi.fn(() => ({ receiptHash: digest("1") }));
  const rubric = vi.fn((binding: { sourceHash: string }) => ({
    schemaVersion: 1,
    producer: "deterministic_rules",
    policyVersion: "synthetic-rules/1.0.0",
    sourceHash: binding.sourceHash,
    evidenceHash: digest("2"),
    dimensions: ScoreDimensionId.options.map((id) => ({
      id,
      value: 80,
      withheldReason: null,
    })),
  }));
  const observe = vi.fn(() => ({
    outcome: "accepted",
    outputHash: digest("3"),
    errorCode: null,
    latencyMs: 0.5,
    costUsd: 0.01,
  }));
  const runtime: PilotWorkflowRuntime = {
    runId: "workflow_run_0001",
    previousPolicyVersion: "previous_policy/1.0.0",
    actors: [
      { reference: "fixture-owner-0001", role: "owner", kind: "human" },
      { reference: "human_adviser_0001", role: "adviser", kind: "human" },
      {
        reference: "fixture-participant-0001",
        role: "participant",
        kind: "human",
      },
      { reference: "ai_adviser_0001", role: "adviser", kind: "ai" },
    ],
    participantSources: [
      {
        participantReference: "fixture-participant-0001",
        sourceHash: digest("e"),
      },
    ],
    actorContext: () => actor,
    deliverNotice: notice,
    readRubric: rubric,
    authorizeSourceUpdate: () => true,
    vendorAdapter: { evidenceTier: "synthetic_engineering", observe },
    deleteRetainedData: () => ({
      deletionReceiptHash: digest("4"),
      remainingDocumentCount: 0,
    }),
  };
  const created = createPilotWorkflow(plan, runtime);
  if (!created.workflow) throw Error("Fixture workflow failed");
  const workflow = created.workflow;
  let next = 0;
  const command = (action: string, fields: Record<string, unknown> = {}) => ({
    schemaVersion: 1,
    runId: runtime.runId,
    commandId: `command_${String(++next).padStart(5, "0")}`,
    expectedRevision: workflow.auditSnapshot().revision,
    action,
    ...fields,
  });
  const execute = (action: string, fields: Record<string, unknown> = {}) =>
    workflow.execute(command(action, fields));
  return {
    workflow,
    runtime,
    notice,
    rubric,
    observe,
    command,
    execute,
    setActor: (value: Partial<typeof actor>) => {
      actor = { ...actor, ...value };
    },
  };
}
const participantReference = "fixture-participant-0001";
async function noticed(f: ReturnType<typeof setup>) {
  expect(
    (
      await f.execute("notice", {
        participantReference,
        noticeReference: "notice_policy_0001",
      })
    ).status,
  ).toBe("applied");
  const read = await f.execute("read_advisory", { participantReference });
  expect(read.status).toBe("applied");
  const event = f.workflow.auditSnapshot().events.at(-1)!;
  return event.details.rubricHash as string;
}

describe("local operational advisory workflow", () => {
  it("requires delivered notice before actual rubric read or human decision", async () => {
    const f = setup();
    expect(
      (await f.execute("read_advisory", { participantReference })).reason,
    ).toBe("NOTICE_REQUIRED");
    expect(f.rubric).not.toHaveBeenCalled();
    expect(
      (
        await f.execute("decision", {
          participantReference,
          rubricHash: digest("a"),
          decision: "confirmed",
          rationaleReference: "rationale_0001",
        })
      ).reason,
    ).toBe("NOTICE_REQUIRED");
    const rubricHash = await noticed(f);
    expect(f.notice).toHaveBeenCalledTimes(1);
    expect(f.rubric).toHaveBeenCalledTimes(1);
    expect(
      (
        await f.execute("decision", {
          participantReference,
          rubricHash,
          decision: "overridden",
          rationaleReference: "rationale_0001",
        })
      ).status,
    ).toBe("applied");
    expect(f.workflow.auditSnapshot().events.at(-1)!.details.decision).toBe(
      "overridden",
    );
  });

  it("requires a human adviser and never accepts command-supplied scores or raw prose", async () => {
    const f = setup();
    const rubricHash = await noticed(f);
    f.setActor({ reference: "ai_adviser_0001", role: "adviser", kind: "ai" });
    expect(
      (
        await f.execute("decision", {
          participantReference,
          rubricHash,
          decision: "confirmed",
          rationaleReference: "rationale_0001",
        })
      ).reason,
    ).toBe("HUMAN_REQUIRED");
    expect(
      (await f.execute("read_advisory", { participantReference, score: 100 }))
        .reason,
    ).toBe("INVALID_COMMAND");
    expect(
      (
        await f.execute("stop", {
          reasonReference: "reason_0001",
          rawText: "PRIVATE_CANARY",
        })
      ).reason,
    ).toBe("INVALID_COMMAND");
    expect(JSON.stringify(f.workflow.auditSnapshot())).not.toContain(
      "PRIVATE_CANARY",
    );
  });

  it("provides candidates their own noticed advisory and denies foreign subjects", async () => {
    const f = setup();
    await noticed(f);
    f.setActor({
      reference: participantReference,
      role: "participant",
      kind: "human",
    });
    expect(
      (await f.execute("read_advisory", { participantReference })).status,
    ).toBe("applied");
    expect(
      (
        await f.execute("read_advisory", {
          participantReference: "foreign_person_0001",
        })
      ).reason,
    ).toBe("ACCESS_DENIED");
  });

  it("keeps correction history immutable and invalidates old-source rubric decisions", async () => {
    const f = setup();
    const oldRubric = await noticed(f);
    const before = f.workflow.auditSnapshot();
    await f.execute("open_correction", {
      participantReference,
      caseReference: "correction_0001",
      reasonReference: "reason_0001",
    });
    await f.execute("resolve_correction", {
      participantReference,
      caseReference: "correction_0001",
      oldSourceHash: digest("e"),
      newSourceHash: digest("5"),
      resolutionReference: "resolution_0001",
    });
    const after = f.workflow.auditSnapshot();
    expect(after.events.slice(0, before.events.length)).toEqual(before.events);
    expect(after.events.at(-1)!.details).toMatchObject({
      oldSourceHash: digest("e"),
      newSourceHash: digest("5"),
    });
    expect(
      (
        await f.execute("decision", {
          participantReference,
          rubricHash: oldRubric,
          decision: "confirmed",
          rationaleReference: "rationale_0001",
        })
      ).reason,
    ).toBe("RUBRIC_DRIFT");
    expect(
      (await f.execute("read_advisory", { participantReference })).rubric
        ?.sourceHash,
    ).toBe(digest("5"));
  });

  it("requires source-update authority and existing bound cases/decisions", async () => {
    const f = setup();
    f.runtime.authorizeSourceUpdate = () => false;
    expect(
      (
        await f.execute("resolve_appeal", {
          participantReference,
          caseReference: "appeal_0001",
          resolutionReference: "resolution_0001",
        })
      ).reason,
    ).toBe("CASE_NOT_OPEN");
    expect(
      (
        await f.execute("open_appeal", {
          participantReference,
          caseReference: "appeal_0001",
          decisionEventHash: digest("a"),
          reasonReference: "reason_0001",
        })
      ).reason,
    ).toBe("DECISION_NOT_FOUND");
    await f.execute("open_correction", {
      participantReference,
      caseReference: "correction_0001",
      reasonReference: "reason_0001",
    });
    expect(
      (
        await f.execute("resolve_correction", {
          participantReference,
          caseReference: "correction_0001",
          oldSourceHash: digest("e"),
          newSourceHash: digest("5"),
          resolutionReference: "resolution_0001",
        })
      ).reason,
    ).toBe("SOURCE_UPDATE_DENIED");
    const rubricHash = await noticed(f);
    const decision = await f.execute("decision", {
      participantReference,
      rubricHash,
      decision: "confirmed",
      rationaleReference: "rationale_0001",
    });
    expect(
      (
        await f.execute("open_appeal", {
          participantReference,
          caseReference: "appeal_0001",
          decisionEventHash: decision.eventHash,
          reasonReference: "reason_0001",
        })
      ).status,
    ).toBe("applied");
    expect(
      (
        await f.execute("resolve_appeal", {
          participantReference,
          caseReference: "appeal_0001",
          resolutionReference: "resolution_0001",
        })
      ).status,
    ).toBe("applied");
  });

  it("denies expired, revoked or corrected-source cached reads", async () => {
    for (const mode of ["expired", "revoked", "corrected"]) {
      const f = setup();
      await f.execute("notice", {
        participantReference,
        noticeReference: "notice_policy_0001",
      });
      const read = f.command("read_advisory", { participantReference });
      expect((await f.workflow.execute(read)).status).toBe("applied");
      if (mode === "expired") f.setActor({ asOf: "2026-12-01T00:00:00Z" });
      if (mode === "revoked")
        await f.execute("revoke", { reasonReference: "revocation_0001" });
      if (mode === "corrected") {
        await f.execute("open_correction", {
          participantReference,
          caseReference: "correction_0001",
          reasonReference: "reason_0001",
        });
        await f.execute("resolve_correction", {
          participantReference,
          caseReference: "correction_0001",
          oldSourceHash: digest("e"),
          newSourceHash: digest("5"),
          resolutionReference: "resolution_0001",
        });
      }
      expect((await f.workflow.execute(read)).status).toBe("rejected");
      expect(f.rubric).toHaveBeenCalledTimes(1);
    }
  });

  it("uses actual repeat adapters, replay protection and stale-version denial", async () => {
    const f = setup();
    const command = f.command("vendor_observe", {
      documentHash: digest("e"),
      attempts: 2,
    });
    expect((await f.workflow.execute(command)).status).toBe("applied");
    expect(f.observe).toHaveBeenCalledTimes(2);
    expect((await f.workflow.execute(command)).status).toBe("idempotent");
    expect(f.observe).toHaveBeenCalledTimes(2);
    expect(
      (
        await f.workflow.execute({
          ...command,
          commandId: "stale_command_0001",
        })
      ).reason,
    ).toBe("REVISION_CONFLICT");
    expect((await f.workflow.execute({ ...command, attempts: 3 })).reason).toBe(
      "COMMAND_CONFLICT",
    );
    const details = f.workflow.auditSnapshot().events[0].details;
    expect(details).toMatchObject({
      completedAttempts: 2,
      requestedAttempts: 2,
      evidenceTier: "synthetic_engineering",
    });
  });

  it("holds a run lock across asynchronous adapters and rejects concurrent calls before execution", async () => {
    const f = setup();
    let release!: () => void;
    f.runtime.vendorAdapter!.observe = async () => {
      await new Promise<void>((r) => {
        release = r;
      });
      return {
        outcome: "accepted",
        outputHash: digest("3"),
        errorCode: null,
        latencyMs: 0.5,
        costUsd: 0.01,
      };
    };
    const pending = f.execute("vendor_observe", {
      documentHash: digest("e"),
      attempts: 2,
    });
    expect(
      (
        await f.execute("vendor_observe", {
          documentHash: digest("e"),
          attempts: 2,
        })
      ).reason,
    ).toBe("RUN_BUSY");
    release();
    await new Promise((r) => setTimeout(r, 0));
    release();
    expect((await pending).status).toBe("applied");
  });

  it("blocks unapproved named external adapters before any callback", async () => {
    const f = setup(protocol(true));
    f.runtime.vendorAdapter!.evidenceTier = "external_vendor";
    expect(
      (
        await f.execute("vendor_observe", {
          documentHash: digest("e"),
          attempts: 2,
        })
      ).reason,
    ).toBe("VENDOR_AUTHORITY_REQUIRED");
    expect(f.observe).not.toHaveBeenCalled();
    f.runtime.authorizeExternalVendor = () => true;
    expect(
      (
        await f.execute("vendor_observe", {
          documentHash: digest("e"),
          attempts: 2,
        })
      ).status,
    ).toBe("applied");
  });

  it("records typed failures without inventing zero measurements and stops further work", async () => {
    const f = setup();
    f.runtime.vendorAdapter!.observe = () => {
      throw new Error("PRIVATE_VENDOR_ERROR");
    };
    expect(
      (
        await f.execute("vendor_observe", {
          documentHash: digest("e"),
          attempts: 16,
        })
      ).status,
    ).toBe("applied");
    const snapshot = f.workflow.auditSnapshot();
    expect(snapshot.state).toBe("stopped");
    expect(snapshot.events[0].details.completedAttempts).toBe(1);
    expect(JSON.stringify(snapshot)).not.toContain("PRIVATE_VENDOR_ERROR");
    expect(JSON.stringify(snapshot)).toContain('"latencyMs":null');
    expect(
      (await f.execute("read_advisory", { participantReference })).reason,
    ).toBe("RUN_NOT_ACTIVE");
  });

  it("stops on declared monitor failures/missing policy and binds rollback version", async () => {
    const f = setup();
    await f.execute("monitor", {
      measurement: { metric: "safety_incidents", value: 2 },
    });
    expect(f.workflow.auditSnapshot().state).toBe("stopped");
    expect(
      (
        await f.execute("rollback", {
          previousPolicyVersion: "wrong_policy/1.0",
          reasonReference: "rollback_0001",
        })
      ).reason,
    ).toBe("ROLLBACK_BINDING");
    expect(
      (
        await f.execute("rollback", {
          previousPolicyVersion: f.runtime.previousPolicyVersion,
          reasonReference: "rollback_0001",
        })
      ).status,
    ).toBe("applied");
    expect(f.workflow.auditSnapshot().state).toBe("rolled_back");
    const plan = protocol();
    plan.criteria = plan.criteria.filter((c) => c.metric !== "cost_usd");
    const missing = setup(plan);
    await missing.execute("vendor_observe", {
      documentHash: digest("e"),
      attempts: 2,
    });
    expect(missing.workflow.auditSnapshot().state).toBe("stopped");
  });

  it("verifies deletion through the trusted handler and preserves sanitized audit history", async () => {
    const f = setup();
    await noticed(f);
    const before = f.workflow.auditSnapshot();
    expect(
      (
        await f.execute("delete_retained", {
          reasonReference: "retention_0001",
        })
      ).status,
    ).toBe("applied");
    const after = f.workflow.auditSnapshot();
    expect(after.state).toBe("deleted");
    expect(after.events.slice(0, before.events.length)).toEqual(before.events);
    expect(
      (await f.execute("read_advisory", { participantReference })).status,
    ).toBe("rejected");
    const bad = setup();
    bad.runtime.deleteRetainedData = () => ({
      deletionReceiptHash: digest("4"),
      remainingDocumentCount: 1,
    });
    expect(
      (
        await bad.execute("delete_retained", {
          reasonReference: "retention_0001",
        })
      ).reason,
    ).toBe("DELETION_NOT_VERIFIED");
  });

  it("stops on malformed adapter output instead of continuing with unknown safety", async () => {
    const f = setup();
    f.runtime.vendorAdapter!.observe = () => ({
      rawError: "PRIVATE_ADAPTER_CANARY",
    });
    await f.execute("vendor_observe", {
      documentHash: digest("e"),
      attempts: 2,
    });
    expect(f.workflow.auditSnapshot().state).toBe("stopped");
    expect(JSON.stringify(f.workflow.auditSnapshot())).not.toContain(
      "PRIVATE_ADAPTER_CANARY",
    );
  });

  it("blocks cached reads during deletion and revokes access when deletion cannot be verified", async () => {
    const f = setup();
    await f.execute("notice", {
      participantReference,
      noticeReference: "notice_policy_0001",
    });
    const read = f.command("read_advisory", { participantReference });
    await f.workflow.execute(read);
    let release!: () => void;
    f.runtime.deleteRetainedData = async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { deletionReceiptHash: digest("4"), remainingDocumentCount: 1 };
    };
    const pending = f.execute("delete_retained", {
      reasonReference: "retention_0001",
    });
    expect((await f.workflow.execute(read)).reason).toBe("RUN_BUSY");
    release();
    expect((await pending).reason).toBe("DELETION_NOT_VERIFIED");
    expect(f.workflow.auditSnapshot().state).toBe("revoked");
    expect((await f.workflow.execute(read)).status).toBe("rejected");
  });

  it("rechecks the trusted clock and actor after asynchronous rubric loading", async () => {
    for (const change of ["expiry", "actor"]) {
      const f = setup();
      await f.execute("notice", {
        participantReference,
        noticeReference: "notice_policy_0001",
      });
      f.runtime.readRubric = async (binding) => {
        if (change === "expiry") f.setActor({ asOf: "2026-12-01T00:00:00Z" });
        else
          f.setActor({
            reference: "human_adviser_0001",
            role: "adviser",
            kind: "human",
          });
        return f.rubric(binding);
      };
      const result = await f.execute("read_advisory", { participantReference });
      expect(result.status).toBe("rejected");
      expect(result.rubric).toBeUndefined();
      expect(f.workflow.auditSnapshot().revision).toBe(1);
    }
  });

  it("rechecks external authority between attempts and preserves the already completed receipt", async () => {
    const f = setup(protocol(true));
    let allowed = true;
    f.runtime.vendorAdapter!.evidenceTier = "external_vendor";
    f.runtime.authorizeExternalVendor = () => allowed;
    const observe = vi.fn(async () => {
      allowed = false;
      return {
        outcome: "accepted",
        outputHash: digest("3"),
        errorCode: null,
        latencyMs: 0.5,
        costUsd: 0.01,
      };
    });
    f.runtime.vendorAdapter!.observe = observe;
    await f.execute("vendor_observe", {
      documentHash: digest("e"),
      attempts: 2,
    });
    expect(observe).toHaveBeenCalledTimes(1);
    const snapshot = f.workflow.auditSnapshot();
    expect(snapshot.state).toBe("stopped");
    expect(snapshot.events[0].details).toMatchObject({
      completedAttempts: 1,
      requestedAttempts: 2,
      interruptionReason: "VENDOR_AUTHORITY_REQUIRED",
    });
    expect(JSON.stringify(snapshot)).toContain(digest("3"));
  });

  it("produces an append-only hash chain and cannot be changed through returned snapshots", async () => {
    const f = setup();
    await noticed(f);
    await f.execute("stop", { reasonReference: "stop_reason_0001" });
    const snapshot = f.workflow.auditSnapshot();
    let previous: string | null = null;
    const stable = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(stable)
        : value !== null && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                .map(([k, v]) => [k, stable(v)]),
            )
          : value;
    snapshot.events.forEach((event, index) => {
      expect(event.revision).toBe(index + 1);
      expect(event.previousEventHash).toBe(previous);
      const { eventHash, ...payload } = event;
      expect(
        createHash("sha256")
          .update(JSON.stringify(stable(payload)))
          .digest("hex"),
      ).toBe(eventHash);
      previous = eventHash;
    });
    snapshot.events[0].details.rawText = "PRIVATE_CANARY";
    expect(JSON.stringify(f.workflow.auditSnapshot())).not.toContain(
      "PRIVATE_CANARY",
    );
  });
});
