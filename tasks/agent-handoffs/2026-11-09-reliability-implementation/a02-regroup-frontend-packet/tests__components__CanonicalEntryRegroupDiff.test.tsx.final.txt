/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import CanonicalEntryRegroupDiff from "~/components/CanonicalEntryRegroupDiff";
import { buildNativeEvidence } from "~/lib/server/native-evidence";
import {
  DocumentEvidenceSchema,
  reconcileDocumentEvidence,
} from "~/lib/server/document-evidence";
import { deriveEvidenceReviewTargets } from "~/lib/server/evidence-targets";
import { deriveEvidenceEntryAssociations } from "~/lib/server/evidence-entry-associations";
import { deriveNativePageDiagnostics } from "~/lib/server/ocr/pdf-detection";
import {
  importCanonicalEvidence,
  reviseCanonical,
} from "~/lib/server/canonical-content";
import { CanonicalResumeDraftSchema } from "~/lib/server/canonical-resume-schema";
import { projectCanonicalCorrectionSourceChoices } from "~/lib/server/canonical-corrections";
import {
  prepareCanonicalEntryRegroup,
  type CanonicalEntryRegroupInput,
  type CanonicalEntryRegroupIntent,
} from "~/lib/server/canonical-entry-regroup";

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function current(input: CanonicalEntryRegroupInput) {
  if (!input.canonicalSnapshot) throw Error("EXPECTED_OWNED_SNAPSHOT");
  return input.canonicalSnapshot.current;
}
function fixture(
  partial = true,
  edited = true,
  unsafeText = false,
): CanonicalEntryRegroupInput {
  const evidence = DocumentEvidenceSchema.parse(
    reconcileDocumentEvidence(
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
    ),
  );
  const source = {
    ownerId: id(2),
    analysisId: id(3),
    sourceId: id(4),
    inputSha256: "a".repeat(64),
    attemptId: id(1),
  };
  const targets = deriveEvidenceReviewTargets(evidence, source);
  let base = importCanonicalEvidence(evidence, {
    resumeId: id(5),
    organizationId: id(6),
    ownerId: id(2),
  });
  if (partial) {
    const [employer, role, dates, secondEmployer, secondRole, secondDates] =
      base.sections[0].entries;
    const carried = unsafeText
      ? '<img src="synthetic" onerror="synthetic()">'
      : "Synthetic repeated carried detail";
    base.facts.push(
      {
        id: id(60),
        type: "contribution",
        value: carried,
        state: "unconfirmed",
        sources: [],
        confirmation: null,
      },
      {
        id: id(61),
        type: "contribution",
        value: "Synthetic heading note",
        state: "unconfirmed",
        sources: [],
        confirmation: null,
      },
      {
        id: id(71),
        type: "skill",
        value: "Synthetic untouched skill",
        state: "unconfirmed",
        sources: [],
        confirmation: null,
      },
    );
    role.bullets = [{ id: id(62), text: carried, factIds: [id(60)] }];
    employer.factIds.push(...dates.factIds, id(61));
    employer.bullets = [{ id: id(63), text: carried, factIds: [id(60)] }];
    const untouched = {
      ...secondEmployer,
      factIds: [
        ...secondEmployer.factIds,
        ...secondRole.factIds,
        ...secondDates.factIds,
      ],
    };
    base.sections[0].entries = [role, untouched, employer];
    base.sections.push({
      id: id(70),
      type: "skills",
      title: "Unchanged skills section",
      factIds: [id(71)],
      entries: [],
    });
    base = CanonicalResumeDraftSchema.parse(base);
  }
  const ancestors: (typeof base)[] = [];
  let snapshot = base;
  if (edited) {
    const role = base.facts.find((fact) => fact.type === "role")!;
    const edit = reviseCanonical(
      base,
      {
        operation: "edit",
        factId: role.id,
        value: unsafeText
          ? "Synthetic <script>unsafe()</script> Engineer"
          : "Synthetic Principal Engineer",
      },
      "2026-11-13T01:00:00.000Z",
    );
    snapshot = reviseCanonical(
      edit,
      { operation: "confirm", factId: role.id },
      "2026-11-13T02:00:00.000Z",
    );
    ancestors.push(edit, base);
  }
  return {
    canonicalRevision: 7,
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
      canonicalHeadId: snapshot.versionId,
    },
    canonicalSnapshot: {
      sourceId: id(4),
      headId: snapshot.versionId,
      current: snapshot,
      ancestors,
    },
    selections: [],
  };
}
function intent(
  input: CanonicalEntryRegroupInput,
  all = false,
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
    baseVersionId: current(input).versionId,
    baseRevision: input.canonicalRevision,
    selections: (all ? groups : groups.slice(0, 1)).map((group) => ({
      groupId: group.id,
      members: group.members.map((member) => ({
        assertionId: member.assertionId,
        factId: choices.get(member.targetId)![0].factId,
      })),
    })),
  };
}
function prepared(input: CanonicalEntryRegroupInput, all = false) {
  const result = prepareCanonicalEntryRegroup(input, intent(input, all));
  expect(result.state).toBe("prepared");
  if (result.state !== "prepared")
    throw Error(`EXPECTED_PREPARED:${result.reason}`);
  return result;
}
function freeze(value: unknown) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}
afterEach(cleanup);

describe("actual whole-entry prepared diff", () => {
  it("renders the complete affected section and crossed untouched entry in before/after order", () => {
    const input = fixture(),
      plan = prepared(input);
    expect(plan.baseRevision).toBe(7);
    expect(plan.beforeSections[0].entries).toHaveLength(3);
    expect(plan.afterSections[0].entries).toHaveLength(2);
    expect(plan.afterSections[0].entries[0].id).toBe(
      plan.groups[0].anchorEntryId,
    );
    render(<CanonicalEntryRegroupDiff preparation={plan} />);
    const before = within(
      screen.getByRole("region", { name: "Before regrouping" }),
    ).getByRole("list", { name: "Experience entries" });
    const after = within(
      screen.getByRole("region", { name: "Proposed arrangement" }),
    ).getByRole("list", { name: "Experience entries" });
    expect(before.children).toHaveLength(3);
    expect(after.children).toHaveLength(2);
    expect(before.children[0].textContent).toContain(
      "Synthetic Principal Engineer",
    );
    expect(before.children[1].textContent).toContain("Synthetic Beta Labs");
    expect(before.children[2].textContent).toContain("Synthetic Alpha Labs");
    expect(after.children[0].textContent).toContain("Synthetic Alpha Labs");
    expect(after.children[1].textContent).toContain("Synthetic Beta Labs");
    expect(
      screen.getByText(/Moved content can cross untouched entries/),
    ).toBeTruthy();
    expect(screen.queryByText("Unchanged skills section")).toBeNull();
  });
  it("shows edited current wording and recorded confirmation separately from original source provenance", () => {
    const input = fixture(),
      plan = prepared(input);
    expect(
      plan.groups[0].members.find((member) => member.field === "role"),
    ).toMatchObject({
      sourceValue: "Platform Engineer",
      currentValue: "Synthetic Principal Engineer",
      mappedThrough: "owned_ancestor_chain",
    });
    render(<CanonicalEntryRegroupDiff preparation={plan} />);
    const source = within(
      screen.getByRole("region", {
        name: "Source observations and current wording",
      }),
    );
    expect(source.getByText("Platform Engineer")).toBeTruthy();
    expect(source.getByText("Synthetic Principal Engineer")).toBeTruthy();
    expect(
      source.getByText(
        "The current wording differs from the source observation.",
      ),
    ).toBeTruthy();
    expect(source.getByText("Owned version history")).toBeTruthy();
    const before = within(
      screen.getByRole("region", { name: "Before regrouping" }),
    );
    expect(
      before.getByText("Current fact state: Candidate confirmed"),
    ).toBeTruthy();
    expect(before.getByText("2026-11-13T02:00:00.000Z")).toBeTruthy();
    const confirmed = before
      .getByText("Current fact state: Candidate confirmed")
      .closest("div")!;
    expect(
      within(confirmed).getByText(
        "No current source citations are recorded for this fact.",
      ),
    ).toBeTruthy();
    expect(
      source.getByText(/Their citations do not verify edited current wording/),
    ).toBeTruthy();
  });
  it("shows every carried heading fact and repeated bullet without asserting global order preservation", () => {
    const plan = prepared(fixture());
    render(<CanonicalEntryRegroupDiff preparation={plan} />);
    const after = within(
      screen.getByRole("region", { name: "Proposed arrangement" }),
    );
    const headers = after.getByRole("list", { name: "Entry 1 heading facts" });
    expect(
      Array.from(headers.children).map(
        (item) => item.querySelector("p")?.textContent,
      ),
    ).toEqual([
      "role: Synthetic Principal Engineer",
      "employer: Synthetic Alpha Labs",
      "dates: 2020 - 2022",
      "contribution: Synthetic heading note",
    ]);
    const bullets = after.getByRole("list", { name: "Entry 1 bullets" });
    expect(bullets.children).toHaveLength(2);
    for (const bullet of Array.from(bullets.children))
      expect(bullet.textContent).toContain("Synthetic repeated carried detail");
    expect(
      screen.getByText(/Heading facts are collected before bullets/),
    ).toBeTruthy();
  });
  it("shows the exact base and every retired donor/retained anchor mapping", () => {
    const plan = prepared(fixture());
    render(<CanonicalEntryRegroupDiff preparation={plan} />);
    expect(plan.mappings).toHaveLength(1);
    expect(screen.getByText(plan.baseVersionId)).toBeTruthy();
    expect(screen.getByText(plan.previewHash)).toBeTruthy();
    expect(screen.getByText(plan.mappings[0].retiredEntryId)).toBeTruthy();
    expect(screen.getAllByText(plan.mappings[0].anchorEntryId)).toHaveLength(2);
    expect(
      within(
        screen.getByRole("region", { name: "Retired entry destinations" }),
      ).getByRole("table"),
    ).toBeTruthy();
  });
  it("renders a real already-grouped changed:false plan as preview only with no action controls", () => {
    const input = fixture(false, false),
      first = prepared(input, true);
    const snapshot = input.canonicalSnapshot!;
    snapshot.current = CanonicalResumeDraftSchema.parse({
      ...snapshot.current,
      sections: first.afterSections,
    });
    const plan = prepared(input, true);
    expect(plan.changed).toBe(false);
    expect(plan.retiredEntryIds).toEqual([]);
    const { container } = render(
      <CanonicalEntryRegroupDiff preparation={plan} />,
    );
    expect(
      screen.getByText(/No placement changes in this preview/),
    ).toBeTruthy();
    expect(
      screen.getByText("Preview only. Nothing has been saved or approved."),
    ).toBeTruthy();
    expect(
      screen.getByText("No entry identifiers would be retired."),
    ).toBeTruthy();
    expect(container.querySelectorAll("form,input,button")).toHaveLength(0);
    expect(plan).toMatchObject({
      persistable: false,
      scoringEligible: false,
      requiresDurableAdmission: true,
    });
  });
  it("escapes carried bullets and edited values returned through the real producer", () => {
    const plan = prepared(fixture(true, true, true));
    const { container } = render(
      <CanonicalEntryRegroupDiff preparation={plan} />,
    );
    expect(
      screen.getAllByText("Synthetic <script>unsafe()</script> Engineer")
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText('<img src="synthetic" onerror="synthetic()">').length,
    ).toBeGreaterThan(0);
    expect(container.querySelectorAll("script,img,[onerror]")).toHaveLength(0);
  });
  it("does not mutate a frozen prepared DTO or synthesize a canonical child", () => {
    const plan = prepared(fixture());
    const before = JSON.stringify(plan);
    freeze(plan);
    render(<CanonicalEntryRegroupDiff preparation={plan} />);
    expect(JSON.stringify(plan)).toBe(before);
    expect(plan).not.toHaveProperty("document");
    expect(plan).not.toHaveProperty("versionId");
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("shows each anchor's actual after position when earlier groups remove donor entries", () => {
    const plan = prepared(fixture(false, false), true);
    expect(plan.groups[1].insertionIndex).toBe(3);
    expect(
      plan.afterSections[0].entries.findIndex(
        (entry) => entry.id === plan.groups[1].anchorEntryId,
      ),
    ).toBe(1);
    render(<CanonicalEntryRegroupDiff preparation={plan} />);
    const anchor = screen
      .getAllByText(plan.groups[1].anchorEntryId)
      .find((node) =>
        node.closest("li")?.textContent?.includes("Retained employer entry"),
      );
    expect(anchor).toBeTruthy();
    expect(anchor!.closest("li")?.textContent).toContain(
      "proposed placement: Experience, entry 2",
    );
  });
});
