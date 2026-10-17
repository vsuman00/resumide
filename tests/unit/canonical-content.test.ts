import { describe, expect, it } from "vitest";
import { buildNativeEvidence } from "../../app/lib/server/native-evidence";
import { reconcileDocumentEvidence } from "../../app/lib/server/document-evidence";
import { runSelectiveLocalOcr } from "../../app/lib/server/ocr/selective";
import { buildRenderPlan } from "../../app/lib/server/artifact-contract";
import {
  importCanonicalEvidence,
  reviseCanonical,
  rollbackCanonical,
  compareCanonical,
} from "../../app/lib/server/canonical-content";
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function imported(
  text = "Name: Demo Person\nExperience\nEmployer: Fictional Co\nRole: Engineer\nDates: 2020 - 2022\nBuilt reliable tests\nSkills\nTypeScript",
) {
  const evidence = reconcileDocumentEvidence(
    {
      id: id(1),
      ownerId: id(2),
      analysisId: id(3),
      sourceId: id(4),
      inputSha256: "a".repeat(64),
      createdAt: "2026-10-12T00:00:00.000Z",
      retentionPolicyId: "synthetic/1.0.0",
    },
    buildNativeEvidence([text]),
  );
  return importCanonicalEvidence(evidence, {
    resumeId: id(5),
    organizationId: id(6),
    ownerId: id(2),
  });
}
describe("canonical content and immutable revisions", () => {
  it("records the repaired importer version while retaining historical producer compatibility", () => {
    const doc = imported();
    expect(doc.producerVersion).toBe("canonical-engine/1.0.1");
    expect(
      reviseCanonical(
        { ...doc, producerVersion: "canonical-engine/1.0.0" },
        { operation: "confirm", factId: doc.facts[0].id },
      ).facts[0].state,
    ).toBe("candidate_confirmed");
  });
  it.each(["Professional Experience", "Employment History", "Work History"])(
    "uses the shared section vocabulary for %s",
    (heading) => {
      const doc = imported(
        `Professional Summary\nBuilds useful software\nTechnical Skills\nTypeScript\n${heading}\nSoftware Engineer | Fictional Labs | 2020 - 2023\nBuilt reliable tests`,
      );
      expect(doc.sections.map((section) => section.type)).toEqual([
        "summary",
        "skills",
        "experience",
      ]);
      const experience = doc.sections[2];
      expect(
        experience.entries
          .flatMap((entry) => [
            ...entry.factIds,
            ...entry.bullets.flatMap((bullet) => bullet.factIds),
          ])
          .map((id) => doc.facts.find((fact) => fact.id === id)!.value),
      ).toEqual([
        "Software Engineer",
        "Fictional Labs",
        "2020 - 2023",
        "Built reliable tests",
      ]);
      expect(
        doc.facts.find((fact) => fact.value === "Built reliable tests")?.type,
      ).toBe("contribution");
      expect(doc.facts.every((fact) => fact.state === "unconfirmed")).toBe(
        true,
      );
    },
  );
  it("renders shared contact lines once while preserving uncaptured source text", () => {
    const doc = imported(
      "Demo Person\ndemo@example.test | +1 202 555 0123 | Remote\nProfessional Summary\nBuilds useful software",
    );
    for (const fact of doc.facts) {
      fact.state = "candidate_confirmed";
      fact.confirmation = {
        actorId: doc.ownerId,
        value: fact.value,
        confirmedAt: doc.createdAt,
      };
    }
    const plan = buildRenderPlan(doc);
    const text = plan.blocks.map((block) => block.text).join("\n");
    expect(text.match(/demo@example\.test/gu)).toHaveLength(1);
    expect(text.match(/\+1 202 555 0123/gu)).toHaveLength(1);
    expect(text).toContain("Remote");
    expect(plan.blocks.flatMap((block) => block.factIds).sort()).toEqual(
      doc.facts.map((fact) => fact.id).sort(),
    );
  });
  it("maps mixed native/OCR pages in order with their original method citations", async () => {
    const nativeTexts = ["Name: Demo Person\nSkills\nTypeScript", ""];
    const text = "Experience\nEmployer: OCR Company\nRole: OCR Engineer";
    const context = {
      id: id(1),
      ownerId: id(2),
      analysisId: id(3),
      sourceId: id(4),
      inputSha256: "a".repeat(64),
      createdAt: "2026-10-12T00:00:00.000Z",
      retentionPolicyId: "synthetic/1.0.0",
    };
    const ocr = await runSelectiveLocalOcr(
      {
        schemaVersion: "selective-ocr-request-v1",
        attemptId: context.id,
        ownerId: context.ownerId,
        analysisId: context.analysisId,
        sourceId: context.sourceId,
        createdAt: context.createdAt,
        retentionPolicyId: context.retentionPolicyId,
        sourceSha256: context.inputSha256,
        nativePageTexts: nativeTexts,
        selectedPages: [{ pageId: "page-2", pageNumber: 2 }],
        remainingDeadlineMs: 1000,
        limits: { maxCharacters: 100000, maxPages: 10 },
        allocation: {
          id: "aa2-synthetic",
          maxWallTimeMs: 1000,
          maxPages: 10,
          externalApiFeeMicros: 0,
        },
        policy: {
          executionMode: "self_hosted",
          purpose: "synthetic_local_test",
          allowThirdPartyProcessing: false,
        },
      },
      {
        versions: {
          engine: "tesseract/5.3.0",
          renderer: "poppler/22.12.0",
          languageData: "eng/sha256-pinned-test",
        },
        recognize: async () => ({
          durationMs: 10,
          pages: [
            {
              pageId: "page-2",
              pageNumber: 2,
              imageSha256: "b".repeat(64),
              widthPixels: 100,
              heightPixels: 200,
              rotation: 0,
              text,
              words: [...text.matchAll(/\S+/gu)].map((match) => ({
                text: match[0],
                start: match.index,
                end: match.index + match[0].length,
                box: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 },
                confidence: 90,
              })),
            },
          ],
        }),
      },
    );
    const evidence = reconcileDocumentEvidence(
      context,
      buildNativeEvidence(nativeTexts),
      ocr,
    );
    const draft = importCanonicalEvidence(evidence, {
      resumeId: id(5),
      organizationId: id(6),
      ownerId: id(2),
    });
    expect(draft.sections.map((section) => section.type)).toEqual([
      "other",
      "skills",
      "experience",
    ]);
    expect(
      draft.facts.find((f) => f.value === "OCR Company")?.sources[0].spanId,
    ).toMatch(/^ocr-/u);
    expect(
      draft.facts.find((f) => f.value === "TypeScript")?.sources[0].spanId,
    ).toMatch(/^native-/u);
    expect(
      draft.sections[2].entries.flatMap((entry) =>
        entry.factIds.map(
          (id) => draft.facts.find((fact) => fact.id === id)!.value,
        ),
      ),
    ).toEqual(["OCR Company", "OCR Engineer"]);
    expect(draft.facts.every((fact) => fact.state === "unconfirmed")).toBe(
      true,
    );
  });
  it("retains ordered sections, roles, dates, skills and exact citations without promoting uncertainty", () => {
    const value = imported();
    expect(value.sections.map((s) => s.type)).toEqual([
      "other",
      "experience",
      "skills",
    ]);
    expect(value.facts.map((f) => f.type)).toEqual(
      expect.arrayContaining(["name", "employer", "role", "dates", "skill"]),
    );
    expect(
      value.facts.every(
        (f) => f.state === "unconfirmed" && f.sources.length > 0,
      ),
    ).toBe(true);
    expect(
      value.sections[1].entries.flatMap((entry) => [
        ...entry.factIds.map(
          (id) => value.facts.find((fact) => fact.id === id)!.value,
        ),
        ...entry.bullets.map((bullet) => bullet.text),
      ]),
    ).toEqual([
      "Fictional Co",
      "Engineer",
      "2020 - 2022",
      "Built reliable tests",
    ]);
  });
  it("edits create unconfirmed child facts while preserving the original", () => {
    const base = imported();
    const original = structuredClone(base);
    const fact = base.facts.find((f) => f.type === "employer")!;
    const next = reviseCanonical(base, {
      operation: "edit",
      factId: fact.id,
      value: "Candidate correction",
    });
    expect(base).toEqual(original);
    expect(next.parentVersionId).toBe(base.versionId);
    expect(next.facts.find((f) => f.id === fact.id)).toMatchObject({
      value: "Candidate correction",
      sources: [],
      state: "unconfirmed",
      confirmation: null,
    });
    expect(next.changes[0].priorValue).toBe(fact.value);
    expect(next.sections[1].entries[0].factIds).toEqual([fact.id]);
  });
  it("only an explicit confirm operation binds the exact owner/value/time", () => {
    const base = imported();
    const fact = base.facts[0];
    const next = reviseCanonical(base, {
      operation: "confirm",
      factId: fact.id,
    });
    expect(next.facts[0].confirmation).toEqual({
      actorId: base.ownerId,
      value: fact.value,
      confirmedAt: next.createdAt,
    });
    expect(next.facts[0].sources).toEqual(fact.sources);
    expect(compareCanonical(base, next)).toHaveLength(1);
  });
  it("rollback creates another child and retains old confirmation/provenance", () => {
    const base = imported();
    const edited = reviseCanonical(base, {
      operation: "edit",
      factId: base.facts[0].id,
      value: "New name",
    });
    const restored = rollbackCanonical(edited, base);
    expect(restored.versionId).not.toBe(base.versionId);
    expect(restored.parentVersionId).toBe(edited.versionId);
    expect(restored.facts).toEqual(base.facts);
    expect(restored.changes[0].action).toBe("rollback");
  });
  it("rejects foreign lineage and unknown targets", () => {
    const base = imported();
    expect(() =>
      reviseCanonical(base, { operation: "confirm", factId: id(99) }),
    ).toThrow();
    expect(() =>
      compareCanonical(base, { ...base, ownerId: id(99) }),
    ).toThrow();
  });
  it("splits long Unicode source lines without silently losing text", () => {
    const line = "界".repeat(1999);
    const doc = imported(line);
    expect(
      doc.sections[0].entries
        .flatMap((e) => e.bullets.map((b) => b.text))
        .join(""),
    ).toBe(line);
  });
});
