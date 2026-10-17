import { randomUUID } from "node:crypto";
import {
  CanonicalResumeDraftSchema,
  type CanonicalResumeDraft,
} from "./canonical-resume-schema";
import { DocumentEvidenceSchema } from "./document-evidence";
import { detectSectionType } from "./parsing/sections";

export function importCanonicalEvidence(
  raw: unknown,
  context: {
    resumeId: string;
    organizationId: string;
    ownerId: string;
    locale?: string;
  },
): CanonicalResumeDraft {
  const evidence = DocumentEvidenceSchema.parse(raw);
  if (evidence.ownerId !== context.ownerId)
    throw new Error("CANONICAL_OWNER_MISMATCH");
  const document: CanonicalResumeDraft = {
    schemaVersion: "canonical-resume/1.0.0",
    producerVersion: "canonical-engine/1.0.1",
    analysisId: evidence.analysisId,
    inputSha256: evidence.inputSha256,
    retentionPolicyId: evidence.retentionPolicyId,
    resumeId: context.resumeId,
    versionId: randomUUID(),
    parentVersionId: null,
    ownerId: context.ownerId,
    organizationId: context.organizationId,
    locale: context.locale ?? "en-IN",
    createdAt: new Date().toISOString(),
    state: "review_required",
    sourceEvidenceVersionId: evidence.id,
    contactFactIds: [],
    facts: [],
    sections: [],
    changes: [],
  };
  const sectionTypes = new Set([
    "summary",
    "experience",
    "education",
    "skills",
    "certifications",
    "projects",
  ]);
  const addFact = (
    type: CanonicalResumeDraft["facts"][number]["type"],
    value: string,
    sources: CanonicalResumeDraft["facts"][number]["sources"],
  ) => {
    const item: CanonicalResumeDraft["facts"][number] = {
      id: randomUUID(),
      type,
      value,
      state: "unconfirmed",
      sources,
      confirmation: null,
    };
    document.facts.push(item);
    return item.id;
  };
  // Assertions are candidates, never an automatic source-supported truth grant.
  const assertionFactIds = new Map<string, string>();
  for (const candidate of evidence.assertions) {
    const sources = candidate.evidence.map((source) => ({
      ...source,
      attemptId: evidence.id,
    }));
    const id = addFact(candidate.field, candidate.value, sources);
    assertionFactIds.set(candidate.id, id);
    if (["name", "email", "phone"].includes(candidate.field))
      document.contactFactIds.push(id);
  }
  let section: CanonicalResumeDraft["sections"][number] | undefined;
  // Select one extraction per page. OCR replaces scant native text only on
  // pages actually OCR'd; preserve page/line order and do not duplicate methods.
  for (const page of evidence.nativeSource.pages) {
    const ocrPage = evidence.ocrSource?.pages.find(
      (item) => item.pageNumber === page.pageNumber,
    );
    const method = ocrPage ? "local_ocr" : "native_text";
    const spans = evidence.spans
      .filter(
        (item) =>
          item.method === method &&
          item.pageId === (ocrPage?.pageId ?? page.id),
      )
      .sort((a, b) => a.start - b.start);
    for (const span of spans) {
      if (!span.text.trim()) continue;
      const detectedType = detectSectionType(span.text);
      if (detectedType) {
        section = {
          id: randomUUID(),
          type: sectionTypes.has(detectedType)
            ? (detectedType as CanonicalResumeDraft["sections"][number]["type"])
            : "other",
          title: span.text.trim(),
          factIds: [],
          entries: [],
        };
        document.sections.push(section);
        continue;
      }
      section ??= {
        id: randomUUID(),
        type: "other",
        title: "Imported content",
        factIds: [],
        entries: [],
      };
      if (!document.sections.includes(section)) document.sections.push(section);
      // Typed source fields and their preview share one fact ID. Do not keep
      // an editable employer/date plus an independent stale copy of its line.
      const label =
        /^(name|email|phone|employer|role|dates|education|certification)\s*:/iu
          .exec(span.text.trim())?.[1]
          .toLowerCase();
      const typed = evidence.assertions.filter(
        (candidate) =>
          candidate.evidence.length === 1 &&
          candidate.evidence[0].spanId === span.id &&
          (label
            ? candidate.field === label &&
              candidate.value ===
                span.text.slice(span.text.indexOf(":") + 1).trim()
            : candidate.value === span.text.trim()),
      );
      if (typed.length) {
        section.entries.push({
          id: randomUUID(),
          factIds: typed.map((candidate) =>
            assertionFactIds.get(candidate.id)!,
          ),
          bullets: [],
        });
        continue;
      }
      // Contact/header fields may occupy a shared line. Keep exact typed
      // slices once, and retain any uncaptured text rather than copying the
      // entire line (which duplicated email/phone in exported documents).
      const partial = evidence.assertions
        .filter(
          (candidate) =>
            candidate.evidence.length === 1 &&
            candidate.evidence[0].spanId === span.id &&
            ["name", "email", "phone", "employer", "role", "dates"].includes(
              candidate.field,
            ),
        )
        .sort(
          (a, b) =>
            a.evidence[0].start - b.evidence[0].start ||
            b.evidence[0].end - a.evidence[0].end,
        );
      if (partial.some((candidate) => candidate.field !== "dates")) {
        const characters = Array.from(span.text);
        const ids: string[] = [];
        let cursor = 0;
        const remainder = (start: number, end: number) => {
          const raw = characters.slice(start, end).join("");
          const value = raw.replace(/^[\s|,;•·–—-]+|[\s|,;•·–—-]+$/gu, "");
          if (!value) return;
          const offset =
            start + Array.from(raw.slice(0, raw.indexOf(value))).length;
          ids.push(
            addFact(
              section!.type === "skills" ? "skill" : "contribution",
              value,
              [
                {
                  attemptId: evidence.id,
                  spanId: span.id,
                  start: offset,
                  end: offset + Array.from(value).length,
                },
              ],
            ),
          );
        };
        for (const candidate of partial) {
          const source = candidate.evidence[0];
          if (source.start < cursor) continue;
          remainder(cursor, source.start);
          ids.push(assertionFactIds.get(candidate.id)!);
          cursor = source.end;
        }
        remainder(cursor, characters.length);
        section.entries.push({ id: randomUUID(), factIds: ids, bullets: [] });
        continue;
      }
      // Split long lines without loss rather than truncating an oversized fact.
      const characters = Array.from(span.text);
      for (let start = 0; start < characters.length; start += 1900) {
        const rawText = characters.slice(start, start + 1900).join("");
        const value = rawText.trim();
        if (!value) continue;
        const leading = Array.from(rawText).findIndex(
          (character) => character.trim() !== "",
        );
        const offset = start + leading;
        const factId = addFact(
          section.type === "skills" ? "skill" : "contribution",
          value,
          [
            {
              attemptId: evidence.id,
              spanId: span.id,
              start: offset,
              end: offset + Array.from(value).length,
            },
          ],
        );
        section.entries.push({
          id: randomUUID(),
          factIds: [],
          bullets: [{ id: randomUUID(), text: value, factIds: [factId] }],
        });
      }
    }
  }
  document.changes.push({
    id: randomUUID(),
    actorId: context.ownerId,
    action: "import",
    targetId: document.versionId,
    priorValue: null,
    createdAt: document.createdAt,
  });
  return CanonicalResumeDraftSchema.parse(document);
}

export function reviseCanonical(
  base: CanonicalResumeDraft,
  command:
    | { operation: "edit"; factId: string; value: string }
    | { operation: "confirm"; factId: string }
    | { operation: "rename_section"; sectionId: string; value: string },
  now = new Date().toISOString(),
): CanonicalResumeDraft {
  const document = structuredClone(base);
  if (command.operation === "rename_section") {
    const section = document.sections.find((s) => s.id === command.sectionId);
    if (!section) throw Error("CANONICAL_SECTION_NOT_FOUND");
    const priorValue = section.title;
    section.title = command.value;
    document.versionId = randomUUID();
    document.parentVersionId = base.versionId;
    document.createdAt = now;
    document.state = "review_required";
    document.changes = [
      {
        id: randomUUID(),
        actorId: base.ownerId,
        action: "edit",
        targetId: section.id,
        priorValue,
        createdAt: now,
      },
    ];
    return CanonicalResumeDraftSchema.parse(document);
  }
  const fact = document.facts.find((item) => item.id === command.factId);
  if (!fact) throw new Error("CANONICAL_FACT_NOT_FOUND");
  const priorValue = fact.value;
  if (command.operation === "edit") {
    fact.value = command.value;
    fact.sources = [];
    fact.confirmation = null;
    fact.state = "unconfirmed";
    for (const section of document.sections)
      for (const entry of section.entries)
        for (const bullet of entry.bullets)
          if (bullet.factIds.length === 1 && bullet.factIds[0] === fact.id)
            bullet.text = fact.value;
  } else {
    fact.state = "candidate_confirmed";
    fact.confirmation = {
      actorId: base.ownerId,
      value: fact.value,
      confirmedAt: now,
    };
  }
  document.versionId = randomUUID();
  document.parentVersionId = base.versionId;
  document.createdAt = now;
  document.state = "review_required";
  document.changes = [
    {
      id: randomUUID(),
      actorId: base.ownerId,
      action: "edit",
      targetId: fact.id,
      priorValue,
      createdAt: now,
    },
  ];
  return CanonicalResumeDraftSchema.parse(document);
}

export function rollbackCanonical(
  head: CanonicalResumeDraft,
  target: CanonicalResumeDraft,
): CanonicalResumeDraft {
  if (
    head.resumeId !== target.resumeId ||
    head.ownerId !== target.ownerId ||
    head.organizationId !== target.organizationId
  )
    throw new Error("CANONICAL_LINEAGE_MISMATCH");
  const document = structuredClone(target);
  document.versionId = randomUUID();
  document.parentVersionId = head.versionId;
  document.createdAt = new Date().toISOString();
  document.state = "review_required";
  document.changes = [
    {
      id: randomUUID(),
      actorId: head.ownerId,
      action: "rollback",
      targetId: document.versionId,
      priorValue: null,
      createdAt: document.createdAt,
    },
  ];
  return CanonicalResumeDraftSchema.parse(document);
}

export function compareCanonical(
  before: CanonicalResumeDraft,
  after: CanonicalResumeDraft,
) {
  if (
    before.resumeId !== after.resumeId ||
    before.ownerId !== after.ownerId ||
    before.organizationId !== after.organizationId
  )
    throw new Error("CANONICAL_LINEAGE_MISMATCH");
  const ids = [
    ...new Set([
      ...before.facts.map((item) => item.id),
      ...after.facts.map((item) => item.id),
    ]),
  ].sort();
  return ids.flatMap((id) => {
    const prior = before.facts.find((item) => item.id === id) ?? null;
    const next = after.facts.find((item) => item.id === id) ?? null;
    return JSON.stringify(prior) === JSON.stringify(next)
      ? []
      : [{ id, before: prior, after: next }];
  });
}
