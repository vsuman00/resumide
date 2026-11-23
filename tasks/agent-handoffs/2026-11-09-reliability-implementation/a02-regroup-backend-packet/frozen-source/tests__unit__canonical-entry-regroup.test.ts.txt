import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildNativeEvidence } from "../../app/lib/server/native-evidence";
import { reconcileDocumentEvidence } from "../../app/lib/server/document-evidence";
import { deriveEvidenceReviewTargets } from "../../app/lib/server/evidence-targets";
import { deriveEvidenceEntryAssociations } from "../../app/lib/server/evidence-entry-associations";
import { deriveNativePageDiagnostics } from "../../app/lib/server/ocr/pdf-detection";
import {
  importCanonicalEvidence,
  reviseCanonical,
} from "../../app/lib/server/canonical-content";
import { projectCanonicalCorrectionSourceChoices } from "../../app/lib/server/canonical-corrections";
import { CanonicalResumeDraftSchema } from "../../app/lib/server/canonical-resume-schema";
import { encodeGroupedImportCommandAtoms } from "../../app/lib/server/grouped-import-command-codec";
import {
  prepareCanonicalEntryRegroup,
  type CanonicalEntryRegroupInput,
  type CanonicalEntryRegroupIntent,
  type CanonicalEntryRegroupPreparation,
} from "../../app/lib/server/canonical-entry-regroup";
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture(): CanonicalEntryRegroupInput {
  const evidence = reconcileDocumentEvidence(
    {
      id: id(1),
      ownerId: id(2),
      analysisId: id(3),
      sourceId: id(4),
      inputSha256: "a".repeat(64),
      createdAt: "2026-11-13T00:00:00.000Z",
      retentionPolicyId: "synthetic/1.0.0",
    },
    buildNativeEvidence([
      "Experience\nEmployer: Synthetic Alpha Labs\nRole: Platform Engineer\nDates: 2020 - 2022\nEmployer: Synthetic Beta Labs\nRole: Data Engineer\nDates: 2021 - 2023",
    ]),
  );
  const source = {
    ownerId: id(2),
    analysisId: id(3),
    sourceId: id(4),
    inputSha256: "a".repeat(64),
    attemptId: id(1),
  };
  const targets = deriveEvidenceReviewTargets(evidence, source);
  const current = importCanonicalEvidence(evidence, {
    resumeId: id(5),
    organizationId: id(6),
    ownerId: id(2),
  });
  return {
    canonicalRevision: 1,
    review: {
      analysisId: id(3),
      attemptId: id(1),
      attemptNumber: 1,
      evidence,
      corrections: [],
      revision: 0,
      scoringEligible: false,
      nativePageDiagnostics: deriveNativePageDiagnostics(evidence.nativeSource),
      targets,
    },
    ownedContext: { ...source, resumeId: id(5), organizationId: id(6) },
    expectedBinding: {
      ...targets.binding,
      resumeId: id(5),
      organizationId: id(6),
      targetModelVersion: targets.modelVersion,
      projectionModelVersion: "canonical-corrections/1.0.1",
      reviewRevision: 0,
      canonicalHeadId: current.versionId,
    },
    canonicalSnapshot: {
      sourceId: id(4),
      headId: current.versionId,
      current,
      ancestors: [],
    },
    selections: [],
  };
}
function intent(
  input: CanonicalEntryRegroupInput,
  indices = [0, 1],
): CanonicalEntryRegroupIntent {
  const groups = deriveEvidenceEntryAssociations(
    input.review.evidence,
    input.ownedContext,
  ).groups;
  const choices =
    projectCanonicalCorrectionSourceChoices(input).choicesBySourceTarget;
  return {
    schemaVersion: "canonical-entry-regroup-intent/1.0.0",
    operation: "preview_whole_entry_merge",
    baseVersionId: input.canonicalSnapshot!.headId,
    baseRevision: input.canonicalRevision,
    selections: indices.map((i) => ({
      groupId: groups[i].id,
      members: groups[i].members.map((m) => ({
        assertionId: m.assertionId,
        factId: choices.get(m.targetId)![0].factId,
      })),
    })),
  };
}
function prepared(value: CanonicalEntryRegroupPreparation) {
  expect(value.state).toBe("prepared");
  if (value.state !== "prepared") throw Error("EXPECTED_PREPARED");
  return value;
}
function current(input: CanonicalEntryRegroupInput) {
  return input.canonicalSnapshot!.current;
}
function install(
  input: CanonicalEntryRegroupInput,
  doc: ReturnType<typeof current>,
  ancestors: ReturnType<typeof current>[],
  revision: number,
) {
  input.canonicalSnapshot = {
    sourceId: id(4),
    headId: doc.versionId,
    current: doc,
    ancestors,
  };
  input.expectedBinding.canonicalHeadId = doc.versionId;
  input.canonicalRevision = revision;
}
function carry(
  input: CanonicalEntryRegroupInput,
  entryIndex: number,
  n: number,
  kind: "direct" | "bullet" = "bullet",
) {
  const doc = current(input),
    entry = doc.sections[0].entries[entryIndex];
  doc.facts.push({
    id: id(n),
    type: "contribution",
    value: `Synthetic carried item ${n}`,
    state: "unconfirmed",
    sources: [],
    confirmation: null,
  });
  if (kind === "direct") entry.factIds.push(id(n));
  else
    entry.bullets.push({
      id: id(n + 1),
      text: `Synthetic bullet ${n}`,
      factIds: [id(n)],
    });
}
describe("whole-entry existing-head regroup preparation", () => {
  it("prepares actual two-job entries without constructor, child IDs, events or source mutation", () => {
    const f = fixture(),
      before = structuredClone(f),
      r = prepared(prepareCanonicalEntryRegroup(f, intent(f)));
    expect(current(f).sections[0].entries).toHaveLength(6);
    expect(r.afterSections[0].entries).toHaveLength(2);
    expect(r.facts).toEqual(current(f).facts);
    expect(f).toEqual(before);
    expect(r.beforeSections).toEqual(current(f).sections);
    expect(r).toMatchObject({
      persistable: false,
      scoringEligible: false,
      requiresDurableAdmission: true,
      requiredProducerVersion: "canonical-engine/1.0.4",
      changed: true,
    });
    expect(r.retiredEntryIds).toHaveLength(4);
    expect(r.groups).toHaveLength(2);
    expect(r).not.toHaveProperty("document");
    expect(r).not.toHaveProperty("versionId");
  });
  it("preserves an actual edited and confirmed member through its unchanged owned fact identity", () => {
    const f = fixture(),
      base = current(f),
      role = base.facts.find((a) => a.type === "role")!;
    const edit = reviseCanonical(
      base,
      {
        operation: "edit",
        factId: role.id,
        value: "Candidate supplied Principal Engineer",
      },
      "2026-11-13T01:00:00.000Z",
    );
    const confirm = reviseCanonical(
      edit,
      { operation: "confirm", factId: role.id },
      "2026-11-13T02:00:00.000Z",
    );
    install(f, confirm, [edit, base], 3);
    const r = prepared(prepareCanonicalEntryRegroup(f, intent(f))),
      mapped = r.groups[0].members.find((m) => m.factId === role.id)!;
    expect(r.facts).toEqual(confirm.facts);
    expect(mapped).toMatchObject({
      sourceValue: "Platform Engineer",
      currentValue: "Candidate supplied Principal Engineer",
      mappedThrough: "owned_ancestor_chain",
      originVersionId: base.versionId,
      originFactId: role.id,
    });
    expect(r.facts.find((a) => a.id === role.id)).toMatchObject({
      state: "candidate_confirmed",
      sources: [],
      confirmation: confirm.facts.find((a) => a.id === role.id)!.confirmation,
    });
  });
  it("carries partial groups, other direct facts and unchanged bullets", () => {
    const f = fixture();
    carry(f, 0, 100, "direct");
    carry(f, 1, 110);
    carry(f, 2, 120);
    const section = current(f).sections[0],
      employer = section.entries[0],
      role = section.entries[1];
    employer.factIds.push(...role.factIds);
    employer.bullets.push(...role.bullets);
    section.entries.splice(1, 1);
    const before = structuredClone(current(f));
    const r = prepared(prepareCanonicalEntryRegroup(f, intent(f, [0])));
    expect(r.afterSections[0].entries[0]).toEqual({
      id: employer.id,
      factIds: [...employer.factIds, ...section.entries[1].factIds],
      bullets: [...employer.bullets, ...section.entries[1].bullets],
    });
    expect(r.facts).toEqual(before.facts);
    expect(r.afterSections[0].entries.slice(1)).toEqual(
      section.entries.slice(2),
    );
    expect(r.mappings).toHaveLength(1);
  });
});

describe("complete current placement and deterministic identity", () => {
  it("places employer anchor at earliest affected index and preserves crossed entries and current concatenation order", () => {
    const f = fixture();
    carry(f, 0, 100);
    carry(f, 1, 110);
    carry(f, 2, 120);
    const section = current(f).sections[0],
      old = section.entries.slice();
    // Role precedes employer, with another job's untouched entry between them.
    section.entries = [old[1], old[3], old[0], old[2], old[4], old[5]];
    const before = structuredClone(section);
    const r = prepared(prepareCanonicalEntryRegroup(f, intent(f, [0])));
    expect(r.groups[0]).toMatchObject({
      anchorEntryId: old[0].id,
      insertionIndex: 0,
      affectedEntryIds: [old[1].id, old[0].id, old[2].id],
    });
    expect(r.afterSections[0].entries).toEqual([
      {
        id: old[0].id,
        factIds: [...old[1].factIds, ...old[0].factIds, ...old[2].factIds],
        bullets: [...old[1].bullets, ...old[0].bullets, ...old[2].bullets],
      },
      old[3],
      old[4],
      old[5],
    ]);
    expect(r.beforeSections[0]).toEqual(before);
    expect(r.mappings.map((m) => m.retiredEntryId)).toEqual([
      old[1].id,
      old[2].id,
    ]);
  });
  it("allows uniquely placed selected members inside unchanged bullets without promotion", () => {
    const f = fixture(),
      section = current(f).sections[0],
      role = section.entries[1],
      roleFact = role.factIds[0];
    role.factIds = [];
    role.bullets = [
      {
        id: id(150),
        text: "Synthetic retained role bullet",
        factIds: [roleFact],
      },
    ];
    const r = prepared(prepareCanonicalEntryRegroup(f, intent(f, [0])));
    expect(
      r.groups[0].members.find((m) => m.factId === roleFact)?.location,
    ).toMatchObject({ kind: "bullet", bulletId: id(150) });
    expect(r.afterSections[0].entries[0].factIds).not.toContain(roleFact);
    expect(r.afterSections[0].entries[0].bullets).toEqual(role.bullets);
  });
  it("retains repeated nonselected fact references in distinct bullets without deduplication", () => {
    const f = fixture();
    carry(f, 0, 160);
    const section = current(f).sections[0];
    section.entries[1].bullets.push({
      id: id(162),
      text: "Synthetic second use",
      factIds: [id(160)],
    });
    const r = prepared(prepareCanonicalEntryRegroup(f, intent(f, [0])));
    expect(r.afterSections[0].entries[0].bullets.map((b) => b.factIds)).toEqual(
      [[id(160)], [id(160)]],
    );
    expect(r.facts).toEqual(current(f).facts);
  });
  it("prepares already-grouped mixed entries with changedfalse independent of JSON key order", () => {
    const f = fixture();
    carry(f, 0, 170);
    const first = prepared(prepareCanonicalEntryRegroup(f, intent(f)));
    current(f).sections = structuredClone(first.afterSections);
    current(f).sections[0].entries = current(f).sections[0].entries.map(
      (e) => ({ bullets: e.bullets, factIds: e.factIds, id: e.id }),
    );
    const r = prepared(prepareCanonicalEntryRegroup(f, intent(f)));
    expect(r.changed).toBe(false);
    expect(r.retiredEntryIds).toEqual([]);
    expect(r.mappings).toEqual([]);
    expect(r.afterSections).toEqual(r.beforeSections);
    expect(r.groups.map((g) => g.affectedEntryIds.length)).toEqual([1, 1]);
  });
  it("orders multiple interleaved independent groups by source and preserves every unaffected section", () => {
    const f = fixture(),
      doc = current(f),
      entries = doc.sections[0].entries.slice();
    doc.sections[0].entries = [
      entries[3],
      entries[1],
      entries[4],
      entries[0],
      entries[5],
      entries[2],
    ];
    doc.sections.push({
      id: id(180),
      type: "other",
      title: "Synthetic unchanged section",
      factIds: [],
      entries: [],
    });
    const request = intent(f);
    request.selections.reverse();
    for (const s of request.selections) s.members.reverse();
    const r = prepared(prepareCanonicalEntryRegroup(f, request));
    expect(r.groups[0].anchorEntryId).toBe(entries[0].id);
    expect(r.groups[1].anchorEntryId).toBe(entries[3].id);
    expect(r.afterSections[0].entries.map((e) => e.id)).toEqual([
      entries[3].id,
      entries[0].id,
    ]);
    expect(r.afterSections[1]).toEqual(doc.sections[1]);
    expect(r).toEqual(prepareCanonicalEntryRegroup(f, intent(f)));
  });
  it("hashes the fixed domain through unchanged A02OP1 and binds full content, locale and owned revision", () => {
    const f = fixture(),
      request = intent(f),
      r = prepared(prepareCanonicalEntryRegroup(f, request)),
      b = f.expectedBinding;
    const atoms = [
      "canonical-entry-regroup-preview/1.0.0",
      "preview_whole_entry_merge",
      b.ownerId,
      b.organizationId,
      b.resumeId,
      b.analysisId,
      b.sourceId,
      b.attemptId,
      b.inputSha256,
      b.evidenceSchemaVersion,
      b.fieldExtractorVersion,
      b.targetModelVersion,
      "evidence-entry-associations/1.0.0",
      b.projectionModelVersion,
      String(b.reviewRevision),
      r.baseVersionId,
      String(r.baseRevision),
      r.locale,
      r.contentDigest,
    ];
    expect(r.previewHash).toBe(
      createHash("sha256")
        .update(encodeGroupedImportCommandAtoms(atoms))
        .digest("hex"),
    );
    expect(r).toEqual(
      prepareCanonicalEntryRegroup(
        structuredClone(f),
        structuredClone(request),
      ),
    );
    const revised = structuredClone(f);
    revised.canonicalRevision = 7;
    const r2 = prepared(
      prepareCanonicalEntryRegroup(revised, { ...request, baseRevision: 7 }),
    );
    expect(r2.contentDigest).toBe(r.contentDigest);
    expect(r2.previewHash).not.toBe(r.previewHash);
    current(revised).locale = "en-US";
    const r3 = prepared(
      prepareCanonicalEntryRegroup(revised, { ...request, baseRevision: 7 }),
    );
    expect(r3.previewHash).not.toBe(r2.previewHash);
    carry(f, 0, 190);
    const withCarry = prepared(prepareCanonicalEntryRegroup(f, request));
    expect(withCarry.contentDigest).not.toBe(r.contentDigest);
    expect(withCarry.previewHash).not.toBe(r.previewHash);
  });
  it("returns detached preparation data so preview mutation cannot edit the input", () => {
    const f = fixture(),
      before = structuredClone(f),
      r = prepared(prepareCanonicalEntryRegroup(f, intent(f)));
    r.facts[0].value = "Changed preview only";
    r.afterSections[0].entries[0].factIds = [];
    r.beforeSections[0].title = "Changed preview only";
    r.groups[0].members[0].sourceCitations[0].start = 0;
    expect(f).toEqual(before);
  });
});
function refused(value: CanonicalEntryRegroupPreparation, reason?: string) {
  expect(value.state).toBe("unavailable");
  if (value.state !== "unavailable") throw Error("EXPECTED_REFUSAL");
  if (reason) expect(value.reason).toBe(reason);
  expect(Object.keys(value).sort()).toEqual(
    [
      "modelVersion",
      "authority",
      "persistable",
      "scoringEligible",
      "requiresDurableAdmission",
      "requiredProducerVersion",
      "state",
      "reason",
    ].sort(),
  );
}
describe("strict intent and owned snapshot refusal", () => {
  it.each([
    (r: CanonicalEntryRegroupIntent) => ({ ...r, extra: true }),
    (r: CanonicalEntryRegroupIntent) => ({ ...r, baseRevision: 0 }),
    (r: CanonicalEntryRegroupIntent) => ({ ...r, baseRevision: 2_147_483_648 }),
    (r: CanonicalEntryRegroupIntent) => ({
      ...r,
      baseVersionId: r.baseVersionId.toUpperCase(),
    }),
    (r: CanonicalEntryRegroupIntent) => ({ ...r, selections: [] }),
    (r: CanonicalEntryRegroupIntent) => ({
      ...r,
      selections: Array(33).fill(r.selections[0]),
    }),
    (r: CanonicalEntryRegroupIntent) => ({
      ...r,
      selections: [...r.selections, r.selections[0]],
    }),
    (r: CanonicalEntryRegroupIntent) => ({
      ...r,
      selections: [
        {
          ...r.selections[0],
          members: [r.selections[0].members[0], r.selections[0].members[0]],
        },
      ],
    }),
    (r: CanonicalEntryRegroupIntent) => ({
      ...r,
      selections: [
        {
          ...r.selections[0],
          members: r.selections[0].members.map((m) => ({
            ...m,
            factId: r.selections[0].members[0].factId,
          })),
        },
      ],
    }),
    (r: CanonicalEntryRegroupIntent) => ({
      ...r,
      selections: [
        {
          ...r.selections[0],
          members: [
            { ...r.selections[0].members[0], value: "not allowed" },
            ...r.selections[0].members.slice(1),
          ],
        },
      ],
    }),
    (r: CanonicalEntryRegroupIntent) => ({
      ...r,
      selections: [
        {
          ...r.selections[0],
          members: [
            { ...r.selections[0].members[0], assertionId: "x".repeat(201) },
            ...r.selections[0].members.slice(1),
          ],
        },
      ],
    }),
    (r: CanonicalEntryRegroupIntent) => ({ ...r, selections: new Array(2) }),
  ])("rejects unknown/duplicate/oversized/sparse intent %#", (mutate) => {
    const f = fixture();
    refused(
      prepareCanonicalEntryRegroup(f, mutate(intent(f))),
      "invalid_intent",
    );
  });
  it.each([0, -1, 1.5, 2_147_483_648, NaN])(
    "rejects invalid owned row revision%s",
    (revision) => {
      const f = fixture(),
        r = intent(f);
      f.canonicalRevision = revision;
      refused(prepareCanonicalEntryRegroup(f, r), "invalid_snapshot");
    },
  );
  it("checks actual row revision and current head identity rather than ancestry length", () => {
    const f = fixture(),
      r = intent(f);
    f.canonicalRevision = 9;
    refused(prepareCanonicalEntryRegroup(f, r), "binding_mismatch");
    refused(
      prepareCanonicalEntryRegroup(f, {
        ...r,
        baseRevision: 9,
        baseVersionId: id(999),
      }),
      "binding_mismatch",
    );
  });
  it.each([
    "current",
    "review",
    "ownedContext",
    "expectedBinding",
    "ancestors",
  ])("returns fixed data-free refusal for malformed runtime %s", (key) => {
    const f = fixture(),
      r = intent(f),
      raw = f as unknown as Record<string, unknown>;
    if (key === "current" || key === "ancestors")
      (raw.canonicalSnapshot as Record<string, unknown>)[key] = null;
    else raw[key] = null;
    refused(prepareCanonicalEntryRegroup(f, r));
  });
  it("rejects replay/source and owned binding changes with no returned candidate data", () => {
    const f = fixture(),
      r = intent(f);
    f.review.evidence.assertions[0].value = "Forged source value";
    refused(prepareCanonicalEntryRegroup(f, r), "association_unavailable");
    const other = fixture(),
      i = intent(other);
    current(other).ownerId = id(999);
    refused(prepareCanonicalEntryRegroup(other, i), "invalid_snapshot");
  });
  it("rejects a missing group, incomplete member set, foreign assertion and wrong explicit fact choice", () => {
    const f = fixture(),
      r = intent(f, [0]);
    refused(
      prepareCanonicalEntryRegroup(f, {
        ...r,
        selections: [
          {
            ...r.selections[0],
            groupId: "entry-association-" + "0".repeat(64),
          },
        ],
      }),
      "selection_mismatch",
    );
    refused(
      prepareCanonicalEntryRegroup(f, {
        ...r,
        selections: [
          { ...r.selections[0], members: r.selections[0].members.slice(0, 2) },
        ],
      }),
      "selection_mismatch",
    );
    const foreign = structuredClone(r);
    foreign.selections[0].members[0].assertionId = "assertion-999";
    refused(prepareCanonicalEntryRegroup(f, foreign), "selection_mismatch");
    const wrong = structuredClone(r);
    wrong.selections[0].members[0].factId = id(999);
    refused(prepareCanonicalEntryRegroup(f, wrong), "ambiguous_mapping");
  });
});
describe("lineage, placement and whole-entry conflict refusals", () => {
  it.each(["missing_origin", "missing_identity", "type_gap", "broken_parent"])(
    "preserves candidate edit but refuses%s",
    (kind) => {
      const f = fixture(),
        base = current(f),
        role = base.facts.find((a) => a.type === "role")!;
      const edit = reviseCanonical(
        base,
        {
          operation: "edit",
          factId: role.id,
          value: "Synthetic candidate role",
        },
        "2026-11-13T01:00:00.000Z",
      );
      install(f, edit, [base], 2);
      const request = intent(f, [0]);
      if (kind === "missing_origin") f.canonicalSnapshot!.ancestors = [];
      if (kind === "missing_identity") {
        base.facts = base.facts.filter((a) => a.id !== role.id);
        for (const section of base.sections)
          for (const entry of section.entries)
            entry.factIds = entry.factIds.filter((a) => a !== role.id);
      }
      if (kind === "type_gap")
        edit.facts.find((a) => a.id === role.id)!.type = "location";
      if (kind === "broken_parent") edit.parentVersionId = id(999);
      refused(prepareCanonicalEntryRegroup(f, request));
      expect(edit.facts.find((a) => a.id === role.id)!.value).toBe(
        "Synthetic candidate role",
      );
    },
  );
  it.each([
    "duplicate",
    "section_only",
    "contact_only",
    "cross_section",
    "foreign_header_direct",
    "foreign_header_bullet",
    "structural_id",
  ])("refuses unsafe whole-entry placement%s", (kind) => {
    const f = fixture(),
      request = intent(f, [0]),
      doc = current(f),
      section = doc.sections[0],
      role = section.entries[1].factIds[0];
    if (kind === "duplicate") section.entries[0].factIds.push(role);
    if (kind === "section_only") {
      section.entries[1].factIds = [];
      section.factIds.push(role);
    }
    if (kind === "contact_only") {
      section.entries[1].factIds = [];
      doc.contactFactIds.push(role);
    }
    if (kind === "cross_section")
      doc.sections.push({
        id: id(220),
        type: "experience",
        title: "Synthetic second section",
        factIds: [],
        entries: section.entries.splice(1, 1),
      });
    if (kind === "foreign_header_direct")
      section.entries[0].factIds.push(section.entries[4].factIds[0]);
    if (kind === "foreign_header_bullet")
      section.entries[0].bullets.push({
        id: id(221),
        text: "Synthetic foreign role",
        factIds: [section.entries[4].factIds[0]],
      });
    if (kind === "structural_id") section.entries[1].id = section.entries[0].id;
    refused(prepareCanonicalEntryRegroup(f, request));
  });
  it("refuses shared affected entries across independently selected groups without partial output", () => {
    const f = fixture(),
      request = intent(f),
      s = current(f).sections[0];
    s.entries[0].factIds.push(...s.entries[3].factIds);
    s.entries.splice(3, 1);
    refused(prepareCanonicalEntryRegroup(f, request));
  });
  it("refuses duplicate resulting direct references while retaining original valid graph", () => {
    const f = fixture();
    carry(f, 0, 230, "direct");
    current(f).sections[0].entries[1].factIds.push(id(230));
    expect(CanonicalResumeDraftSchema.safeParse(current(f)).success).toBe(true);
    refused(
      prepareCanonicalEntryRegroup(f, intent(f, [0])),
      "unsafe_placement",
    );
  });
  it.each(["direct", "bullets"])(
    "retains actual schema limits for merged%s",
    (kind) => {
      const f = fixture();
      const s = current(f).sections[0];
      for (let i = 0; i < 102; i++) {
        const entry = i < 51 ? 0 : 1;
        if (kind === "direct") carry(f, entry, 300 + i, "direct");
        else {
          if (i === 0) carry(f, 0, 500);
          else
            s.entries[entry].bullets.push({
              id: id(501 + i),
              text: `Synthetic retained bullet ${i}`,
              factIds: [id(500)],
            });
        }
      }
      expect(CanonicalResumeDraftSchema.safeParse(current(f)).success).toBe(
        true,
      );
      refused(
        prepareCanonicalEntryRegroup(f, intent(f, [0])),
        "resource_limit",
      );
    },
  );
});
