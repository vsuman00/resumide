import { expect, it } from "vitest";
import { scoreFixture } from "../fixtures/scoring-v2";
import {
  ArtifactOptionsSchema,
  buildRenderPlan,
  safeArtifactLink,
  verifyArtifact,
} from "../../app/lib/server/artifact-contract";
const fixture = () => scoreFixture().canonical;
it("projects every fact once without modifying canonical content and binds immutable input", () => {
  const doc = fixture(),
    before = JSON.stringify(doc),
    plan = buildRenderPlan(doc);
  expect(plan.blocks.flatMap((b) => b.factIds).sort()).toEqual(
    doc.facts.map((f) => f.id).sort(),
  );
  expect(JSON.stringify(doc)).toBe(before);
  expect(buildRenderPlan(doc)).toEqual(plan);
  expect(() =>
    ArtifactOptionsSchema.parse({
      versionId: doc.versionId,
      format: "pdf",
      pageSize: "A4",
      templateId: "arbitrary",
      html: "<script/>",
    }),
  ).toThrow();
});
it("rejects uncertainty, unsupported locale, divergence and malicious links", () => {
  const doc = fixture();
  doc.facts[0].state = "unconfirmed";
  doc.facts[0].confirmation = null;
  expect(() => buildRenderPlan(doc)).toThrow(/confirm 1 unconfirmed fact/);
  expect(() => buildRenderPlan({ ...fixture(), locale: "hi-IN" })).toThrow(
    /locale/,
  );
  for (const value of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "https://user:pass@example.test",
    "data:text/plain,evil",
    "https://example.test\nattack",
  ])
    expect(safeArtifactLink(value)).toBeNull();
  const d = fixture();
  d.sections[0].entries.push({
    id: crypto.randomUUID(),
    factIds: [],
    bullets: [
      { id: crypto.randomUUID(), text: "invented", factIds: [d.facts[0].id] },
    ],
  });
  expect(() => buildRenderPlan(d)).toThrow(/bullet/);
});
it("fails missing fields, glyphs, reordered content, broken links, omitted anchors and clipping", () => {
  const plan = buildRenderPlan(fixture()),
    options = ArtifactOptionsSchema.parse({
      versionId: plan.versionId,
      format: "pdf",
      pageSize: "A4",
      templateId: "software-engineering-single-column",
    });
  const observation = {
    text: plan.blocks.map((b) => b.text).join("\n"),
    links: plan.blocks.flatMap((b) => (b.link ? [b.link] : [])),
    linkBindings: plan.blocks.flatMap((b) =>
      b.link
        ? [`${b.link}|${b.text.normalize("NFC").replace(/\s+/gu, "")}`]
        : [],
    ),
    pages: 1,
    layoutPass: true,
    structuralAccessibility: true,
    diagnostics: [],
  };
  expect(
    verifyArtifact(plan, options, observation, new Uint8Array([1]), 1).state,
  ).toBe("verified");
  for (const mutation of [
    { text: observation.text.slice(5) },
    {
      text: [...plan.blocks]
        .reverse()
        .map((b) => b.text)
        .join("\n"),
    },
    { links: [] },
    { linkBindings: ["https://attacker.test|wrong"] },
    { text: observation.text.replace("Experience", "") },
    { layoutPass: false },
    { structuralAccessibility: false },
    { text: observation.text + "invented" },
  ])
    expect(
      verifyArtifact(
        plan,
        options,
        { ...observation, ...mutation },
        new Uint8Array([1]),
        1,
      ).state,
    ).toBe("export_verification_failed");
});
