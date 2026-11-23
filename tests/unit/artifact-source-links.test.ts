import { expect, it } from "vitest";
import PDFDocument from "pdfkit";
import { vi } from "vitest";
import {
  assertSourceLinksPreserved,
  type SourceLinkLineage,
} from "../../app/lib/server/artifact-source-links";
import { buildRenderPlan, hash } from "../../app/lib/server/artifact-contract";
import {
  reviseCanonical,
  rollbackCanonical,
} from "../../app/lib/server/canonical-content";
import { CanonicalResumeDraftSchema } from "../../app/lib/server/canonical-resume-schema";
import { scoreFixture, SCORE_SOURCE } from "../fixtures/scoring-v2";

async function sourcePdf(
  target: string,
  text = "Portfolio",
  additional: string[] = [],
) {
  const pdf = new PDFDocument();
  const chunks: Buffer[] = [];
  const bytes = new Promise<Uint8Array>((resolve, reject) => {
    pdf.on("data", (chunk) => chunks.push(chunk));
    pdf.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    pdf.on("error", reject);
  });
  pdf.text(text, { link: target });
  for (const link of additional) pdf.text("Additional source link", { link });
  pdf.end();
  return bytes;
}
it("blocks hidden annotation targets absent from the canonical render plan", async () => {
  const plan = buildRenderPlan(scoreFixture().canonical);
  const bytes = await sourcePdf("https://portfolio.example.test/work");
  await expect(assertSourceLinksPreserved(bytes, plan)).rejects.toThrow(
    "SOURCE_LINKS_NOT_PRESERVED",
  );
  plan.blocks.push({
    id: "link",
    kind: "fact",
    text: "https://portfolio.example.test/work",
    factIds: [],
    link: "https://portfolio.example.test/work",
  });
  await expect(
    assertSourceLinksPreserved(bytes, plan),
  ).resolves.toBeUndefined();
});

async function replacement(
  type: "email" | "link" = "email",
  additional: string[] = [],
  suffix = "",
) {
  const oldValue =
    type === "email"
      ? "fictional@example.test"
      : "https://portfolio.example.test/original";
  const newValue =
    type === "email"
      ? "corrected@example.test"
      : "https://portfolio.example.test/current";
  const target = type === "email" ? `mailto:${oldValue}` : oldValue;
  const text =
    (type === "email" ? SCORE_SOURCE : `${SCORE_SOURCE}\n${oldValue}`) + suffix;
  const bytes = await sourcePdf(target, text, additional);
  const fixture = scoreFixture(text),
    original = fixture.canonical;
  original.inputSha256 = hash(bytes);
  let factId: string;
  if (type === "email")
    factId = original.facts.find((fact) => fact.type === type)!.id;
  else {
    const span = fixture.evidence.spans.find((span) => span.text === oldValue)!;
    factId = crypto.randomUUID();
    original.facts.push({
      id: factId,
      type,
      value: oldValue,
      state: "candidate_confirmed",
      sources: [
        {
          attemptId: fixture.evidence.id,
          spanId: span.id,
          start: 0,
          end: Array.from(oldValue).length,
        },
      ],
      confirmation: {
        actorId: original.ownerId,
        value: oldValue,
        confirmedAt: original.createdAt,
      },
    });
    original.contactFactIds.push(factId);
  }
  const edited = reviseCanonical(original, {
    operation: "edit",
    factId,
    value: newValue,
  });
  const confirmed = reviseCanonical(edited, { operation: "confirm", factId });
  const versions = new Map(
    [original, edited, confirmed].map((document, index) => [
      document.versionId,
      { document, revision: index + 1, sourceId: fixture.evidence.sourceId },
    ]),
  );
  const loadParent = vi.fn(
    async (versionId: string) => versions.get(versionId) ?? null,
  );
  const lineage: SourceLinkLineage = {
    current: versions.get(confirmed.versionId)!,
    loadParent,
  };
  return {
    bytes,
    original,
    evidence: fixture.evidence,
    edited,
    confirmed,
    factId,
    newValue,
    versions,
    lineage,
    loadParent,
    plan: buildRenderPlan(confirmed),
  };
}

it.each(["email", "link"] as const)(
  "permits only a confirmed stable-fact %s replacement with cited source lineage",
  async (type) => {
    const f = await replacement(type),
      before = structuredClone([f.original, f.edited, f.confirmed]);
    await expect(
      assertSourceLinksPreserved(f.bytes, f.plan, f.lineage),
    ).resolves.toBeUndefined();
    expect(f.loadParent.mock.calls.map(([version]) => version)).toEqual([
      f.edited.versionId,
      f.original.versionId,
    ]);
    expect([f.original, f.edited, f.confirmed]).toEqual(before);
  },
);

it.each([
  "owner",
  "organization",
  "resume",
  "analysis",
  "hash",
  "attempt",
  "source",
  "revision",
  "parent",
])(
  "rejects %s lineage drift instead of authorizing a missing annotation",
  async (kind) => {
    const f = await replacement(),
      parent = f.versions.get(f.edited.versionId)!;
    const foreign = crypto.randomUUID();
    if (kind === "owner") {
      parent.document.ownerId = foreign;
      for (const fact of parent.document.facts)
        if (fact.confirmation) fact.confirmation.actorId = foreign;
      for (const change of parent.document.changes) change.actorId = foreign;
    }
    if (kind === "organization") parent.document.organizationId = foreign;
    if (kind === "resume") parent.document.resumeId = foreign;
    if (kind === "analysis") parent.document.analysisId = foreign;
    if (kind === "hash") parent.document.inputSha256 = "b".repeat(64);
    if (kind === "attempt") {
      parent.document.sourceEvidenceVersionId = foreign;
      for (const fact of parent.document.facts)
        for (const source of fact.sources) source.attemptId = foreign;
    }
    if (kind === "source") parent.sourceId = foreign;
    if (kind === "revision") parent.revision = 99;
    if (kind === "parent") parent.document.versionId = foreign;
    expect(CanonicalResumeDraftSchema.safeParse(parent.document).success).toBe(
      true,
    );
    await expect(
      assertSourceLinksPreserved(f.bytes, f.plan, f.lineage),
    ).rejects.toThrow("SOURCE_LINK_CHECK_FAILED");
  },
);

it.each([
  "missing_fact",
  "changed_type",
  "missing_parent",
  "cycle",
  "uncited_origin",
  "borrowed_citation",
])("does not bridge %s when proving a replacement", async (kind) => {
  const f = await replacement();
  const parentFact = f.edited.facts.find((fact) => fact.id === f.factId)!;
  if (kind === "missing_fact") {
    const replacementId = crypto.randomUUID();
    parentFact.id = replacementId;
    f.edited.contactFactIds = f.edited.contactFactIds.map((id) =>
      id === f.factId ? replacementId : id,
    );
    for (const section of f.edited.sections) {
      section.factIds = section.factIds.map((id) =>
        id === f.factId ? replacementId : id,
      );
      for (const entry of section.entries) {
        entry.factIds = entry.factIds.map((id) =>
          id === f.factId ? replacementId : id,
        );
        for (const bullet of entry.bullets)
          bullet.factIds = bullet.factIds.map((id) =>
            id === f.factId ? replacementId : id,
          );
      }
    }
    for (const change of f.edited.changes)
      if (change.targetId === f.factId) change.targetId = replacementId;
  }
  if (kind === "changed_type") parentFact.type = "link";
  if (kind === "missing_parent") f.versions.delete(f.edited.versionId);
  if (kind === "cycle") f.edited.parentVersionId = f.confirmed.versionId;
  if (kind === "uncited_origin")
    f.original.facts.find((fact) => fact.id === f.factId)!.sources = [];
  if (kind === "borrowed_citation")
    f.confirmed.facts.find((fact) => fact.id === f.factId)!.sources =
      structuredClone(
        f.original.facts.find((fact) => fact.id === f.factId)!.sources,
      );
  await expect(
    assertSourceLinksPreserved(f.bytes, f.plan, f.lineage),
  ).rejects.toThrow();
});

it.each([
  "actor",
  "value",
  "unconfirmed",
  "plan_version",
  "plan_content",
  "plan_link",
  "source_bytes",
])("keeps %s mismatch blocked despite a historical email", async (kind) => {
  const f = await replacement(),
    fact = f.confirmed.facts.find((fact) => fact.id === f.factId)!;
  if (kind === "actor") fact.confirmation!.actorId = crypto.randomUUID();
  if (kind === "value") fact.confirmation!.value = "Another statement";
  if (kind === "unconfirmed") {
    fact.state = "unconfirmed";
    fact.confirmation = null;
  }
  if (kind === "plan_version") f.plan.versionId = crypto.randomUUID();
  if (kind === "plan_content") f.plan.contentHash = "a".repeat(64);
  if (kind === "plan_link")
    f.plan.blocks.find((block) => block.factIds.includes(f.factId))!.link =
      null;
  const bytes =
    kind === "source_bytes"
      ? await sourcePdf("mailto:another@example.test")
      : f.bytes;
  await expect(
    assertSourceLinksPreserved(bytes, f.plan, f.lineage),
  ).rejects.toThrow();
});

it("keeps every unexplained or unsafe annotation blocked beside a valid replacement", async () => {
  for (const extra of [
    "https://unmapped.example.test/private",
    "javascript:alert(1)",
  ]) {
    const f = await replacement("email", [extra]);
    await expect(
      assertSourceLinksPreserved(f.bytes, f.plan, f.lineage),
    ).rejects.toThrow("SOURCE_LINKS_NOT_PRESERVED");
  }
});

it("does not render an unsafe replacement email after candidate confirmation", async () => {
  const f = await replacement();
  const edited = reviseCanonical(f.confirmed, {
    operation: "edit",
    factId: f.factId,
    value: "corrected@example.test\nunsafe",
  });
  const confirmed = reviseCanonical(edited, {
    operation: "confirm",
    factId: f.factId,
  });
  expect(() => buildRenderPlan(confirmed)).toThrow("Correct the email address");
});

it("restores the selected old link without fetching or reapplying later corrections", async () => {
  const f = await replacement(),
    restored = rollbackCanonical(f.confirmed, f.original);
  const loadParent = vi.fn(async () => {
    throw Error("Must not load unnecessary history");
  });
  await expect(
    assertSourceLinksPreserved(f.bytes, buildRenderPlan(restored), {
      current: {
        document: restored,
        revision: 4,
        sourceId: f.lineage.current.sourceId,
      },
      loadParent,
    }),
  ).resolves.toBeUndefined();
  expect(loadParent).not.toHaveBeenCalled();
});

it("bounds history traversal rather than accepting an origin beyond the admitted work", async () => {
  const f = await replacement();
  let current = f.confirmed;
  for (let index = 0; index < 64; index++) {
    current = reviseCanonical(current, {
      operation: "rename_section",
      sectionId: current.sections[0].id,
      value: `Profile ${index}`,
    });
    f.versions.set(current.versionId, {
      document: current,
      revision: index + 4,
      sourceId: f.lineage.current.sourceId,
    });
  }
  await expect(
    assertSourceLinksPreserved(f.bytes, buildRenderPlan(current), {
      current: f.versions.get(current.versionId)!,
      loadParent: f.loadParent,
    }),
  ).rejects.toThrow();
  expect(f.loadParent).toHaveBeenCalledTimes(64);
});

it("stops at a nearer cited origin instead of borrowing an older matching annotation", async () => {
  const nearerValue = "nearer@example.test";
  const f = await replacement("email", [], `\n${nearerValue}`);
  const nearer = f.edited;
  const fact = nearer.facts.find((item) => item.id === f.factId)!;
  const span = f.evidence.spans.find((item) => item.text === nearerValue)!;
  fact.value = nearerValue;
  fact.state = "source_supported";
  fact.confirmation = null;
  fact.sources = [
    {
      attemptId: f.evidence.id,
      spanId: span.id,
      start: 0,
      end: Array.from(nearerValue).length,
    },
  ];
  expect(CanonicalResumeDraftSchema.safeParse(nearer).success).toBe(true);
  const edited = reviseCanonical(nearer, {
    operation: "edit",
    factId: f.factId,
    value: f.newValue,
  });
  const confirmed = reviseCanonical(edited, {
    operation: "confirm",
    factId: f.factId,
  });
  const versions = new Map(
    [f.original, nearer, edited, confirmed].map((document, index) => [
      document.versionId,
      { document, revision: index + 1, sourceId: f.lineage.current.sourceId },
    ]),
  );
  const loadParent = vi.fn(async (id: string) => versions.get(id) ?? null);
  await expect(
    assertSourceLinksPreserved(f.bytes, buildRenderPlan(confirmed), {
      current: versions.get(confirmed.versionId)!,
      loadParent,
    }),
  ).rejects.toThrow("SOURCE_LINKS_NOT_PRESERVED");
  expect(loadParent.mock.calls.map(([id]) => id)).toEqual([
    edited.versionId,
    nearer.versionId,
  ]);
});
