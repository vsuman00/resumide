import { createHash } from "node:crypto";
import { z } from "zod";
import { CanonicalResumeDraftSchema } from "./canonical-resume-schema";

export const TEMPLATE = {
  id: "software-engineering-single-column",
  version: "1.0.2",
  rendererVersion: "core-renderer/1.0.2",
  locales: ["en-IN", "en-US", "en-GB"],
  formats: ["pdf", "docx"],
  font: "Noto Sans",
  fallbackFont: "Noto Sans Math",
  maxPages: 10,
  maxCharacters: 30000,
  maxBytes: 5 * 1024 * 1024,
} as const;
export const ArtifactOptionsSchema = z.strictObject({
  versionId: z.uuid(),
  format: z.enum(["pdf", "docx"]),
  pageSize: z.enum(["A4", "LETTER"]),
  templateId: z.literal(TEMPLATE.id),
});
export type ArtifactOptions = z.infer<typeof ArtifactOptionsSchema>;
export type RenderBlock = {
  id: string;
  kind: "name" | "heading" | "fact";
  text: string;
  factIds: string[];
  link: string | null;
};
export type RenderPlan = {
  versionId: string;
  locale: string;
  contentHash: string;
  blocks: RenderBlock[];
  critical: string[];
};
export type ArtifactReport = {
  schemaVersion: "artifact-verification/1.0.0";
  state: "verified" | "export_verification_failed";
  transitions: string[];
  versionId: string;
  contentHash: string;
  artifactSha256: string | null;
  templateId: string;
  templateVersion: string;
  rendererVersion: string;
  format: "pdf" | "docx";
  pageSize: "A4" | "LETTER";
  criticalParity: number;
  normalizedTextCoverage: number;
  orderParity: boolean;
  linkParity: boolean;
  sectionParity: boolean;
  layoutPass: boolean;
  structuralAccessibility: boolean;
  assistiveTechnologyValidated: false;
  pages: number | null;
  estimatedPages: number | null;
  durationMs: number;
  diagnostics: string[];
};
export const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export const normalizeArtifactText = (value: string) =>
  value.normalize("NFC").replace(/\s+/gu, "");
export function safeArtifactLink(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !["https:", "http:", "mailto:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      Array.from(value).some(
        (c) => c.codePointAt(0)! <= 32 || c.codePointAt(0) === 127,
      ) ||
      value.length > 2000
    )
      return null;
    if (url.protocol === "mailto:" && !/^[^?@]+@[^?@]+$/u.test(url.pathname))
      return null;
    return url.href;
  } catch {
    return null;
  }
}
export function buildRenderPlan(raw: unknown): RenderPlan {
  const doc = CanonicalResumeDraftSchema.parse(raw);
  if (
    !TEMPLATE.locales.includes(doc.locale as (typeof TEMPLATE.locales)[number])
  )
    throw new Error("Choose a supported English locale before exporting.");
  const pendingCount = doc.facts.filter(
    (f) => f.state === "unconfirmed",
  ).length;
  if (!doc.facts.length)
    throw new Error("Import and review your resume facts before exporting.");
  if (pendingCount)
    throw new Error(
      `Review and confirm ${pendingCount} unconfirmed ${pendingCount === 1 ? "fact" : "facts"} before exporting.`,
    );
  const facts = new Map(doc.facts.map((f) => [f.id, f]));
  const blocks: RenderBlock[] = [],
    seen = new Set<string>(),
    renderedByValue = new Map<string, RenderBlock>();
  const referencedInSections = new Set(
    doc.sections.flatMap((section) => [
      ...section.factIds,
      ...section.entries.flatMap((entry) => [
        ...entry.factIds,
        ...entry.bullets.flatMap((bullet) => bullet.factIds),
      ]),
    ]),
  );
  const add = (ids: string[]) => {
    for (const id of ids) {
      if (seen.has(id)) continue;
      const fact = facts.get(id)!;
      seen.add(id);
      const duplicate = !referencedInSections.has(id)
        ? renderedByValue.get(`${fact.type}\0${fact.value}`)
        : undefined;
      if (duplicate) {
        duplicate.factIds.push(id);
        continue;
      }
      let link: string | null = null;
      if (fact.type === "link") {
        link = safeArtifactLink(fact.value);
        if (!link)
          throw new Error(
            "Correct the unsupported or unsafe link before exporting.",
          );
      } else if (fact.type === "email") {
        link = safeArtifactLink(`mailto:${fact.value}`);
        if (!link)
          throw new Error("Correct the email address before exporting.");
      }
      const block = {
        id,
        kind: fact.type === "name" ? ("name" as const) : ("fact" as const),
        text: fact.value,
        factIds: [id],
        link,
      };
      blocks.push(block);
      renderedByValue.set(`${fact.type}\0${fact.value}`, block);
    }
  };
  // The header starts with the candidate name even when extraction listed email first.
  add(doc.contactFactIds.filter((id) => facts.get(id)?.type === "name"));
  add(doc.contactFactIds.filter((id) => facts.get(id)?.type !== "name"));
  for (const section of doc.sections) {
    const sectionIds = [
      ...section.factIds,
      ...section.entries.flatMap((entry) => [
        ...entry.factIds,
        ...entry.bullets.flatMap((bullet) => bullet.factIds),
      ]),
    ];
    for (const entry of section.entries)
      for (const bullet of entry.bullets) {
        if (
          !bullet.factIds.length ||
          bullet.text !==
            bullet.factIds.map((id) => facts.get(id)!.value).join(" ")
        )
          throw new Error(
            "Review a bullet that no longer matches its current facts.",
          );
      }
    if (section.type === "other" && sectionIds.every((id) => seen.has(id)))
      continue;
    blocks.push({
      id: section.id,
      kind: "heading",
      text: section.title,
      factIds: [],
      link: null,
    });
    add(section.factIds);
    for (const entry of section.entries) {
      add(entry.factIds);
      for (const bullet of entry.bullets) {
        // Bullet prose is a presentation mirror; reject divergent unsupported text.
        if (
          !bullet.factIds.length ||
          bullet.text !==
            bullet.factIds.map((id) => facts.get(id)!.value).join(" ")
        )
          throw new Error(
            "Review a bullet that no longer matches its current facts.",
          );
        add(bullet.factIds);
      }
    }
    const inferredTypes: Record<string, string[]> = {
      experience: ["employer", "role", "dates", "contribution", "metric"],
      education: ["education"],
      skills: ["skill"],
      certifications: ["certification"],
    };
    add(
      doc.facts
        .filter(
          (f) =>
            !referencedInSections.has(f.id) &&
            !seen.has(f.id) &&
            (inferredTypes[section.type] ?? []).includes(f.type),
        )
        .map((f) => f.id),
    );
  }
  const orphaned = doc.facts.filter((f) => !seen.has(f.id));
  if (orphaned.length) {
    blocks.push({
      id: "additional",
      kind: "heading",
      text: "Other confirmed information",
      factIds: [],
      link: null,
    });
    add(orphaned.map((f) => f.id));
  }
  const text = blocks.map((b) => b.text).join("\n");
  if (text.length > TEMPLATE.maxCharacters || blocks.length > 1200)
    throw new Error(
      "Shorten the resume to the supported export size before exporting.",
    );
  if (
    Array.from(text).some((c) => {
      const n = c.codePointAt(0)!;
      return (
        (n < 32 && n !== 9 && n !== 10) ||
        n === 127 ||
        (n >= 0x202a && n <= 0x202e) ||
        (n >= 0x2066 && n <= 0x2069)
      );
    })
  )
    throw new Error(
      "Remove unsupported control or directional characters before exporting.",
    );
  return {
    versionId: doc.versionId,
    locale: doc.locale,
    contentHash: hash(
      JSON.stringify({ versionId: doc.versionId, locale: doc.locale, blocks }),
    ),
    blocks,
    critical: doc.facts
      .filter((f) =>
        [
          "name",
          "email",
          "phone",
          "employer",
          "role",
          "dates",
          "education",
          "certification",
        ].includes(f.type),
      )
      .map((f) => f.value),
  };
}
export type ArtifactObservation = {
  text: string;
  links: string[];
  linkBindings: string[];
  pages: number | null;
  estimatedPages?: number | null;
  layoutPass: boolean;
  structuralAccessibility: boolean;
  diagnostics: string[];
};
export function verifyArtifact(
  plan: RenderPlan,
  options: ArtifactOptions,
  observation: ArtifactObservation,
  bytes: Uint8Array,
  durationMs: number,
): ArtifactReport {
  const actual = normalizeArtifactText(observation.text);
  const expected = normalizeArtifactText(
    plan.blocks.map((b) => b.text).join("\n"),
  );
  // Exact normalized equality is stricter than the 99.5% coverage floor and rejects extra text too.
  const exact = actual === expected;
  let cursor = 0;
  const ordered = plan.blocks.every((b) => {
    const text = normalizeArtifactText(b.text),
      position = actual.indexOf(text, cursor);
    if (position < 0) return false;
    cursor = position + text.length;
    return true;
  });
  const recovered = plan.critical.filter((text) =>
    actual.includes(normalizeArtifactText(text)),
  ).length;
  const criticalParity = plan.critical.length
    ? recovered / plan.critical.length
    : 1;
  const expectedLinks = [
    ...new Set(plan.blocks.flatMap((b) => (b.link ? [b.link] : []))),
  ].sort();
  const expectedBindings = plan.blocks
    .filter((b) => b.link)
    .map((b) => `${b.link}|${normalizeArtifactText(b.text)}`);
  const linkParity =
    JSON.stringify([...new Set(observation.links)].sort()) ===
      JSON.stringify(expectedLinks) &&
    JSON.stringify(observation.linkBindings) ===
      JSON.stringify(expectedBindings);
  const sectionParity = plan.blocks
    .filter((b) => b.kind === "heading")
    .every((b) => actual.includes(normalizeArtifactText(b.text)));
  const pass =
    exact &&
    ordered &&
    criticalParity === 1 &&
    linkParity &&
    sectionParity &&
    observation.layoutPass &&
    observation.structuralAccessibility &&
    bytes.length > 0 &&
    bytes.length <= TEMPLATE.maxBytes;
  const diagnostics = [...observation.diagnostics];
  if (!exact)
    diagnostics.push(
      "Text differs from the saved resume; review missing or changed content.",
    );
  if (!ordered)
    diagnostics.push("Reading order differs from the saved resume.");
  if (!linkParity) diagnostics.push("Links differ from the saved resume.");
  if (!observation.layoutPass)
    diagnostics.push(
      "Layout or font checks failed. Shorten long content or correct unsupported characters.",
    );
  if (!observation.structuralAccessibility)
    diagnostics.push("Document structure checks failed.");
  if (observation.pages && observation.pages > 2)
    diagnostics.push("This resume exceeds two pages; review its length.");
  if (
    options.format === "docx" &&
    observation.estimatedPages &&
    observation.estimatedPages > 2
  )
    diagnostics.push(
      "Estimated DOCX length exceeds two pages; review page flow in your viewer.",
    );
  if (options.format === "docx")
    diagnostics.push(
      "DOCX pagination depends on your viewer; inspect page flow before sharing.",
    );
  return {
    schemaVersion: "artifact-verification/1.0.0",
    state: pass ? "verified" : "export_verification_failed",
    transitions: [
      "queued",
      "rendered",
      pass ? "verified" : "export_verification_failed",
    ],
    versionId: plan.versionId,
    contentHash: plan.contentHash,
    artifactSha256: hash(bytes),
    templateId: TEMPLATE.id,
    templateVersion: TEMPLATE.version,
    rendererVersion: TEMPLATE.rendererVersion,
    format: options.format,
    pageSize: options.pageSize,
    criticalParity,
    normalizedTextCoverage: exact ? 1 : 0,
    orderParity: ordered,
    linkParity,
    sectionParity,
    layoutPass: observation.layoutPass,
    structuralAccessibility: observation.structuralAccessibility,
    assistiveTechnologyValidated: false,
    pages: observation.pages,
    estimatedPages: observation.estimatedPages ?? null,
    durationMs,
    diagnostics,
  };
}
