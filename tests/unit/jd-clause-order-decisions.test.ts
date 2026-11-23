import { createHash } from "node:crypto";
import vectors from "../../tasks/agent-handoffs/2026-11-09-reliability-implementation/decisions-golden-vectors.json";
import policy from "../../app/lib/jd-clause-order-decision-policy.json";
import characterProfile from "../../app/lib/jd-clause-order-character-profile.json";
import { REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES } from "../../app/lib/server/requirement-relationship-context";
import {
  JD_CLAUSE_ORDER_POLICY_VERSION,
  JD_CLAUSE_ORDER_POLICY_SHA256,
} from "../../app/lib/server/jd-clause-order-drafting";
import { WRITING_SUPPORT_POLICY_VERSION } from "../../app/lib/server/writing-support";
import {
  encodeClauseOrderCommandAtoms,
  hashClauseOrderCommandAtoms,
} from "../../app/lib/server/clause-order-command-codec";
import {
  clauseOrderCommandAtoms,
  parseClauseOrderCommand,
  validateClauseOrderReceipt,
  JdClauseOrderCommandSchema,
} from "../../app/lib/server/clause-order-authoring";
import {
  buildClauseOrderProposal,
  verifyOriginalClauseOrderCommand,
  clauseOrderCommandSha256,
} from "../../app/lib/server/clause-order-authoring";
import { jdClauseOrderFixtureId as decisionId } from "../fixtures/jd-clause-order";
import { expect, it } from "vitest";
import { createJdClauseOrderFixture } from "../fixtures/jd-clause-order";
import { createJdClauseOrderStore } from "../fixtures/jd-clause-order-store";
import { reviseCanonical } from "../../app/lib/server/canonical-content";
import { createJobRequirementRelations } from "../../app/lib/server/job-requirement-admission";
import { loadRequirementRelationshipContext } from "../../app/lib/server/requirement-relationship-context";
import {
  buildJdClauseOrderDraft,
  rebuildOriginalJdClauseOrderDraft,
  buildJdClauseOrderPlan,
} from "../../app/lib/server/jd-clause-order-drafting";
async function originalPairAfterHeadsMove() {
  const f = await createJdClauseOrderFixture();
  const selection = {
    canonicalVersionId: f.context.canonical.versionId,
    requirementVersionId: f.context.requirements.versionId,
    clauseId: f.context.requirements.content.relations.clauses[0].id,
    targetFactId: f.targetFactId,
  };
  const expected = { ownerId: f.owned.ownerId, analysisId: f.owned.analysisId };
  const original = buildJdClauseOrderDraft(f.context, expected, selection);
  const nextCanonical = reviseCanonical(f.context.canonical.content, {
    operation: "rename_section",
    sectionId: f.context.canonical.content.sections[0].id,
    value: "Reviewed experience",
  });
  const nextRequirements = createJobRequirementRelations(
    "Requirements\nGit preferred",
    {
      ownerId: f.owned.ownerId,
      organizationId: f.owned.organizationId,
      analysisId: f.owned.analysisId,
      jobId: f.context.requirements.content.jobId,
      parentVersionId: f.context.requirements.versionId,
      locale: "en-IN",
      domain: "software-engineering",
    },
  );
  const raw = structuredClone(f.context);
  raw.heads = {
    canonicalHeadId: nextCanonical.versionId,
    canonicalHeadRevision: f.context.canonical.revision + 1,
    requirementHeadId: nextRequirements.id,
    requirementHeadRevision: f.context.requirements.revision + 1,
  };
  const context = await loadRequirementRelationshipContext(
    createJdClauseOrderStore(raw).client,
    f.owned.analysisId,
    f.owned.ownerId,
    {
      canonicalVersionId: selection.canonicalVersionId,
      requirementVersionId: selection.requirementVersionId,
    },
  );
  return {
    f,
    selection,
    expected,
    original,
    context,
    nextCanonical,
    nextRequirements,
  };
}
it("rebuilds the actual original owned pair after later canonical and JD heads move", async () => {
  const { selection, expected, original, context } =
    await originalPairAfterHeadsMove();
  const before = JSON.stringify(context),
    actualHeads = { ...context.heads };
  Object.freeze(context.heads);
  const rebuilt = rebuildOriginalJdClauseOrderDraft(
    context,
    expected,
    selection,
  );
  expect(JSON.stringify(context)).toBe(before);
  expect(context.heads).toEqual(actualHeads);
  expect(() => buildJdClauseOrderDraft(context, expected, selection)).toThrow();
  expect(
    buildJdClauseOrderPlan(context, {
      ...expected,
      canonicalVersionId: selection.canonicalVersionId,
      requirementVersionId: selection.requirementVersionId,
    }),
  ).toMatchObject({ state: "unavailable", reason: "historical_inputs" });
  expect(rebuilt).toEqual(original);
});

it("keeps current-pair original and fresh draft bytes identical", async () => {
  const f = await createJdClauseOrderFixture(),
    selection = {
      canonicalVersionId: f.context.canonical.versionId,
      requirementVersionId: f.context.requirements.versionId,
      clauseId: f.context.requirements.content.relations.clauses[0].id,
      targetFactId: f.targetFactId,
    },
    expected = { ownerId: f.owned.ownerId, analysisId: f.owned.analysisId };
  expect(
    rebuildOriginalJdClauseOrderDraft(f.context, expected, selection),
  ).toEqual(buildJdClauseOrderDraft(f.context, expected, selection));
});
it.each(["ownerId", "analysisId"] as const)(
  "rejects original proof with wrong expected %s",
  async (key) => {
    const { selection, expected, context } = await originalPairAfterHeadsMove();
    expect(() =>
      rebuildOriginalJdClauseOrderDraft(
        context,
        { ...expected, [key]: "30000000-0000-4000-8000-000000000999" },
        selection,
      ),
    ).toThrow();
  },
);
it.each([
  "source",
  "canonical-hash",
  "requirement-hash",
  "confirmation",
  "selection",
])("does not waive %s integrity for historical proof", async (kind) => {
  const { selection, expected, context } = await originalPairAfterHeadsMove();
  if (kind === "source")
    context.source.sourceId = "30000000-0000-4000-8000-000000000999";
  if (kind === "canonical-hash")
    context.canonical.contentSha256 = "f".repeat(64);
  if (kind === "requirement-hash")
    context.requirements.inputSha256 = "f".repeat(64);
  if (kind === "confirmation")
    context.canonical.content.facts.find(
      (f) => f.id === selection.targetFactId,
    )!.confirmation!.actorId = "30000000-0000-4000-8000-000000000999";
  if (kind === "selection")
    selection.canonicalVersionId = context.heads.canonicalHeadId;
  expect(() =>
    rebuildOriginalJdClauseOrderDraft(context, expected, selection),
  ).toThrow();
});
it.each([
  "unconfirmed",
  "declaration-only",
  "first-only-relevance",
  "missing-relevance",
  "incomplete-source",
])("retains %s refusal in original mode", async (kind) => {
  const f = await createJdClauseOrderFixture({
    confirm: kind !== "unconfirmed",
    ...(kind === "declaration-only"
      ? { edit: "Built services using Python; Developed helpers using Git" }
      : {}),
    ...(kind === "first-only-relevance"
      ? { jdText: "Requirements\nPython required" }
      : {}),
    ...(kind === "missing-relevance"
      ? { jdText: "Requirements\nRAG required" }
      : {}),
    ...(kind === "incomplete-source" ? { pageCount: null } : {}),
  });
  const selection = {
    canonicalVersionId: f.context.canonical.versionId,
    requirementVersionId: f.context.requirements.versionId,
    clauseId: f.context.requirements.content.relations.clauses[0].id,
    targetFactId: f.targetFactId,
  };
  expect(() =>
    rebuildOriginalJdClauseOrderDraft(
      f.context,
      { ownerId: f.owned.ownerId, analysisId: f.owned.analysisId },
      selection,
    ),
  ).toThrow();
});

it("builds an actual owned proposal and verifies its original commands after heads move", async () => {
  const { f, selection, expected, context } =
    await originalPairAfterHeadsMove();
  const proposal = buildClauseOrderProposal(f.context, expected, selection, {
    acceptKey: decisionId(901),
    rejectKey: decisionId(902),
  });
  expect(proposal.draft).toEqual(
    buildJdClauseOrderDraft(f.context, expected, selection),
  );
  expect(
    verifyOriginalClauseOrderCommand(context, expected, proposal.acceptCommand),
  ).toEqual(proposal.acceptCommand);
  expect(
    verifyOriginalClauseOrderCommand(context, expected, proposal.rejectCommand),
  ).toEqual(proposal.rejectCommand);
  expect(proposal.acceptCommandSha256).toBe(
    clauseOrderCommandSha256(proposal.acceptCommand),
  );
});

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
async function actualProposal(
  options: Parameters<typeof createJdClauseOrderFixture>[0] = {},
) {
  const f = await createJdClauseOrderFixture(options),
    expected = { ownerId: f.owned.ownerId, analysisId: f.owned.analysisId },
    selection = {
      canonicalVersionId: f.context.canonical.versionId,
      requirementVersionId: f.context.requirements.versionId,
      clauseId: f.context.requirements.content.relations.clauses[0].id,
      targetFactId: f.targetFactId,
    };
  return {
    f,
    expected,
    selection,
    proposal: buildClauseOrderProposal(f.context, expected, selection, {
      acceptKey: decisionId(901),
      rejectKey: decisionId(902),
    }),
  };
}
it("binds the actual policy body and current imported producer profiles", () => {
  expect(digest(JSON.stringify(policy.body))).toBe(policy.sha256);
  expect(policy.body.draftPolicies).toEqual({
    clauseOrderVersion: JD_CLAUSE_ORDER_POLICY_VERSION,
    clauseOrderSha256: JD_CLAUSE_ORDER_POLICY_SHA256,
    writingSupportVersion: WRITING_SUPPORT_POLICY_VERSION,
  });
  expect(policy.body.profilesSha256).toBe(
    digest(JSON.stringify(REQUIREMENT_RELATIONSHIP_CONTEXT_PROFILES)),
  );
  expect(policy.body.characterProfile).toMatchObject({
    schemaVersion: characterProfile.schemaVersion,
    dataSha256: digest(JSON.stringify(characterProfile.data)),
    rulesSha256: digest(JSON.stringify(characterProfile.rules)),
  });
});
it.each(vectors.vectors)(
  "matches independent UTF8 framing vector $sha256",
  (v) => {
    expect(encodeClauseOrderCommandAtoms(v.atoms).toString("hex")).toBe(
      v.framedHex,
    );
    expect(hashClauseOrderCommandAtoms(v.atoms)).toBe(v.sha256);
  },
);
it.each(vectors.commandVectors)(
  "matches the independent complete 53+8N command vector",
  (v) => {
    const command = parseClauseOrderCommand(v.command),
      atoms = clauseOrderCommandAtoms(command);
    expect(atoms).toEqual(v.atoms);
    expect(atoms).toHaveLength(53 + 8 * command.sourceCitations.length);
    expect(encodeClauseOrderCommandAtoms(atoms).toString("hex")).toBe(
      v.framedHex,
    );
    expect(clauseOrderCommandSha256(command)).toBe(v.sha256);
  },
);
it.each(["\0", "\ud800", "\udc00"])(
  "refuses non-Postgres scalar text %j",
  (text) => expect(() => encodeClauseOrderCommandAtoms([text])).toThrow(),
);
it("enforces finite byte and atom bounds without ambiguous null/empty framing", () => {
  expect(() => encodeClauseOrderCommandAtoms(Array(257).fill(null))).toThrow();
  expect(() => encodeClauseOrderCommandAtoms(["é".repeat(8192)])).toThrow();
  expect(hashClauseOrderCommandAtoms([null])).not.toBe(
    hashClauseOrderCommandAtoms([""]),
  );
  expect(hashClauseOrderCommandAtoms(["a", "b"])).not.toBe(
    hashClauseOrderCommandAtoms(["ab"]),
  );
});
it("generates distinct validated keys and preserves nonidentity review bytes", async () => {
  const { f, expected, selection, proposal } = await actualProposal();
  expect(proposal.draft.after).not.toBe(proposal.draft.before);
  const next = buildClauseOrderProposal(f.context, expected, selection);
  expect(next.acceptCommand.idempotencyKey).not.toBe(
    next.rejectCommand.idempotencyKey,
  );
  expect(next.draft).toEqual(proposal.draft);
  expect(() =>
    buildClauseOrderProposal(f.context, expected, selection, {
      acceptKey: decisionId(901),
      rejectKey: decisionId(901),
    }),
  ).toThrow();
  expect(() =>
    buildClauseOrderProposal(f.context, expected, selection, {
      acceptKey: "ABCDEFAB-0000-4000-8000-000000000001",
      rejectKey: decisionId(902),
    }),
  ).toThrow();
});
it.each([
  "draftId",
  "afterSha256",
  "clauseRange",
  "clauseHash",
  "citation",
  "policy",
  "profiles",
  "head",
  "owner",
  "uppercase",
])("a rehashed %s mutation supplies no original authority", async (kind) => {
  const { f, expected, proposal } = await actualProposal(),
    command = structuredClone(proposal.acceptCommand);
  if (kind === "draftId") command.draftId = "f".repeat(64);
  if (kind === "afterSha256") command.afterSha256 = "f".repeat(64);
  if (kind === "clauseRange") command.sourceClauses[0].start++;
  if (kind === "clauseHash") command.sourceClauses[0].sha256 = "f".repeat(64);
  if (kind === "citation") command.sourceCitations[0].end--;
  if (kind === "policy")
    command.decisionPolicy.sha256 = "f".repeat(
      64,
    ) as typeof command.decisionPolicy.sha256;
  if (kind === "profiles")
    command.binding.profilesSha256 = "f".repeat(
      64,
    ) as typeof command.binding.profilesSha256;
  if (kind === "head") command.binding.heads.canonicalHeadId = decisionId(998);
  if (kind === "owner") command.binding.source.ownerId = decisionId(998);
  if (kind === "uppercase")
    command.idempotencyKey = "ABCDEFAB-0000-4000-8000-000000000001";
  // A digest is a correlation check, never independent admission.
  if (JdClauseOrderCommandSchema.safeParse(command).success)
    expect(clauseOrderCommandSha256(command)).not.toBe(
      proposal.acceptCommandSha256,
    );
  expect(() =>
    verifyOriginalClauseOrderCommand(f.context, expected, command),
  ).toThrow();
});
it.each(["accept", "reject"] as const)(
  "validates only the exact %s receipt and revision semantics",
  async (operation) => {
    const { proposal } = await actualProposal(),
      command =
        operation === "accept"
          ? proposal.acceptCommand
          : proposal.rejectCommand;
    const receipt = {
      schemaVersion: "jd-clause-order-receipt/2.0.0",
      status: "applied",
      action: operation,
      idempotencyKey: command.idempotencyKey,
      commandSha256: clauseOrderCommandSha256(command),
      draftId: command.draftId,
      baseVersionId: command.binding.canonical.versionId,
      baseRevision: command.binding.canonical.revision,
      requirementVersionId: command.binding.requirements.versionId,
      requirementRevision: command.binding.requirements.revision,
      versionId:
        operation === "accept"
          ? decisionId(997)
          : command.binding.canonical.versionId,
      revision:
        command.binding.canonical.revision + (operation === "accept" ? 2 : 0),
      eventId: decisionId(996),
      idempotent: false,
    };
    expect(validateClauseOrderReceipt(receipt, command)).toEqual(receipt);
    expect(
      validateClauseOrderReceipt({ ...receipt, idempotent: true }, command)
        .idempotent,
    ).toBe(true);
    for (const mutation of [
      { commandSha256: "f".repeat(64) },
      { draftId: "f".repeat(64) },
      { idempotencyKey: decisionId(995) },
      { requirementVersionId: decisionId(994) },
      { revision: receipt.revision + 1 },
      { action: operation === "accept" ? "reject" : "accept" },
      {
        versionId:
          operation === "accept" ? receipt.baseVersionId : decisionId(993),
      },
      { status: "unknown" },
    ])
      expect(() =>
        validateClauseOrderReceipt({ ...receipt, ...mutation }, command),
      ).toThrow();
  },
);
it.each([
  "Experience\nFull\u00a0Stack Engineer at Orchard Labs",
  "Experience\nMachine  Learning Engineer at Orchard Labs",
  "Candidate Name\nExperience\nSoftware Engineer at Orchard Labs",
  "https://example.invalid\nExperience\nSoftware Engineer at Orchard Labs",
])("refuses unsupported full-stream writer scope: %s", async (header) => {
  const f = await createJdClauseOrderFixture({ header }),
    expected = { ownerId: f.owned.ownerId, analysisId: f.owned.analysisId },
    selection = {
      canonicalVersionId: f.context.canonical.versionId,
      requirementVersionId: f.context.requirements.versionId,
      clauseId: f.context.requirements.content.relations.clauses[0].id,
      targetFactId: f.targetFactId,
    };
  expect(() =>
    buildClauseOrderProposal(f.context, expected, selection),
  ).toThrow();
});
it.each([
  [
    "Built cafés using Python; Developed tools using Git",
    "Built cafes using Python; Developed tools using Git",
  ],
  [
    "Built cafés using Python; Developed tools using Git",
    "Built cafe\u0301s using Python; Developed tools using Git",
  ],
  [
    "Built café using Python; Developed tools using Git",
    "Built cafè using Python; Developed tools using Git",
  ],
  [
    "Built 가 using Python; Developed tools using Git",
    "Built 가 using Python; Developed tools using Git",
  ],
])(
  "refuses whole-source canonical letter-skeleton collision %s / %s",
  async (first, second) => {
    const f = await createJdClauseOrderFixture({ clauses: [first, second] }),
      expected = { ownerId: f.owned.ownerId, analysisId: f.owned.analysisId },
      selection = {
        canonicalVersionId: f.context.canonical.versionId,
        requirementVersionId: f.context.requirements.versionId,
        clauseId: f.context.requirements.content.relations.clauses[0].id,
        targetFactId: f.targetFactId,
      };
    expect(() =>
      buildClauseOrderProposal(f.context, expected, selection),
    ).toThrow();
  },
);
it("refuses adjacent lower-case action continuation but permits a real sentence boundary", async () => {
  const first = "Built services using Python; Developed tools using Git";
  for (const clauses of [
    [first, "built helpers using Rust"],
    [first + ".", "built helpers using Rust"],
  ]) {
    const f = await createJdClauseOrderFixture({ clauses }),
      expected = { ownerId: f.owned.ownerId, analysisId: f.owned.analysisId },
      selection = {
        canonicalVersionId: f.context.canonical.versionId,
        requirementVersionId: f.context.requirements.versionId,
        clauseId: f.context.requirements.content.relations.clauses[0].id,
        targetFactId: f.targetFactId,
      };
    if (clauses[0].endsWith("."))
      expect(
        buildClauseOrderProposal(f.context, expected, selection).draft.before,
      ).toBe(clauses[0]);
    else
      expect(() =>
        buildClauseOrderProposal(f.context, expected, selection),
      ).toThrow();
  }
});

it("requires a singleton target bullet even when a compound bullet is otherwise schema-valid", async () => {
  const f = await createJdClauseOrderFixture({
      clauses: [
        "Built services using Python; Developed tools using Git.",
        "Built helpers using Rust.",
      ],
    }),
    expected = { ownerId: f.owned.ownerId, analysisId: f.owned.analysisId },
    selection = {
      canonicalVersionId: f.context.canonical.versionId,
      requirementVersionId: f.context.requirements.versionId,
      clauseId: f.context.requirements.content.relations.clauses[0].id,
      targetFactId: f.targetFactId,
    };
  const entries = f.context.canonical.content.sections.flatMap(
      (s) => s.entries,
    ),
    entry = entries.find((e) =>
      e.bullets.some((b) => b.factIds.includes(f.targetFactId)),
    )!;
  const extra = f.context.canonical.content.facts.find(
    (fact) => fact.type === "contribution" && fact.id !== f.targetFactId,
  )!.id;
  for (const e of entries)
    e.bullets = e.bullets.filter((b) => !b.factIds.includes(extra));
  entry.bullets
    .find((b) => b.factIds.includes(f.targetFactId))!
    .factIds.push(extra);
  expect(() =>
    buildJdClauseOrderDraft(f.context, expected, selection),
  ).not.toThrow();
  expect(() =>
    buildClauseOrderProposal(f.context, expected, selection),
  ).toThrow();
});
it("binds citation order as semantic atoms, even when a forged reordered list is rehashed", async () => {
  const { f, expected, proposal } = await actualProposal(),
    command = structuredClone(proposal.acceptCommand),
    cite = command.sourceCitations[0];
  command.sourceCitations = [{ ...cite, end: cite.end - 1 }, cite];
  const hash = clauseOrderCommandSha256(command);
  command.sourceCitations.reverse();
  expect(clauseOrderCommandSha256(command)).not.toBe(hash);
  expect(() =>
    verifyOriginalClauseOrderCommand(f.context, expected, command),
  ).toThrow();
});
