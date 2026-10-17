import { z } from "zod";

const id = z.uuid();
const text = z
  .string()
  .min(1)
  .max(2_000)
  .refine(
    (value) => value === value.trim(),
    "Preserve explicit values without silently normalizing them",
  );
const citation = z
  .strictObject({
    attemptId: id,
    spanId: z.string().min(1).max(100),
    start: z.number().int().nonnegative().max(200_000),
    end: z.number().int().positive().max(200_000),
  })
  .refine((value) => value.end > value.start);
const confirmation = z.strictObject({
  actorId: id,
  confirmedAt: z.iso.datetime(),
  value: text,
});
const fact = z.strictObject({
  id,
  type: z.enum([
    "name",
    "email",
    "phone",
    "employer",
    "role",
    "dates",
    "education",
    "certification",
    "skill",
    "contribution",
    "metric",
    "link",
    "location",
  ]),
  value: text,
  state: z.enum(["source_supported", "candidate_confirmed", "unconfirmed"]),
  sources: z.array(citation).max(20),
  confirmation: confirmation.nullable(),
});
const bullet = z.strictObject({ id, text, factIds: z.array(id).max(100) });
const entry = z.strictObject({
  id,
  factIds: z.array(id).max(100),
  bullets: z.array(bullet).max(100),
});
const section = z.strictObject({
  id,
  type: z.enum([
    "summary",
    "experience",
    "education",
    "skills",
    "certifications",
    "projects",
    "other",
  ]),
  title: z.string().trim().min(1).max(100),
  factIds: z.array(id).max(100),
  entries: z.array(entry).max(100),
});

/** AA020 structural draft boundary. Source authenticity, ownership and lineage
 * require the later persistence/import services; parsing never grants trust. */
export const CanonicalResumeDraftSchema = z
  .strictObject({
    schemaVersion: z.literal("canonical-resume/1.0.0"),
    producerVersion: z.enum([
      "canonical-engine/1.0.0",
      "canonical-engine/1.0.1",
    ]),
    analysisId: id,
    inputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    retentionPolicyId: z.string().min(1).max(100),
    resumeId: id,
    versionId: id,
    parentVersionId: id.nullable(),
    ownerId: id,
    organizationId: id,
    locale: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/u),
    createdAt: z.iso.datetime(),
    state: z.enum(["draft", "review_required"]),
    sourceEvidenceVersionId: id.nullable(),
    contactFactIds: z.array(id).max(20),
    facts: z.array(fact).max(1_000),
    sections: z.array(section).max(30),
    changes: z
      .array(
        z.strictObject({
          id,
          actorId: id,
          action: z.enum(["create", "import", "edit", "rollback"]),
          targetId: id,
          priorValue: text.nullable(),
          createdAt: z.iso.datetime(),
        }),
      )
      .max(1_000),
  })
  .superRefine((document, context) => {
    const fail = (message: string) =>
      context.addIssue({ code: "custom", message });
    if (document.parentVersionId === document.versionId)
      fail("A version cannot be its own parent");
    const identities = [
      document.resumeId,
      document.versionId,
      ...document.facts.map((item) => item.id),
      ...document.sections.flatMap((item) => [
        item.id,
        ...item.entries.flatMap((item) => [
          item.id,
          ...item.bullets.map((item) => item.id),
        ]),
      ]),
      ...document.changes.map((item) => item.id),
    ];
    if (new Set(identities).size !== identities.length)
      fail("Stable object IDs must be unique");
    const facts = new Map(document.facts.map((item) => [item.id, item]));
    const checkReferences = (references: string[]) => {
      if (
        new Set(references).size !== references.length ||
        references.some((reference) => !facts.has(reference))
      )
        fail(
          "Fact references must be distinct and resolve inside this version",
        );
    };
    checkReferences(document.contactFactIds);
    for (const reference of document.contactFactIds) {
      if (
        !facts.has(reference) ||
        !["name", "email", "phone", "link", "location"].includes(
          facts.get(reference)!.type,
        )
      )
        fail("Contact references require contact facts");
    }
    for (const section of document.sections) {
      checkReferences(section.factIds);
      for (const entry of section.entries) {
        checkReferences(entry.factIds);
        for (const bullet of entry.bullets) checkReferences(bullet.factIds);
      }
    }
    for (const item of document.facts) {
      if (
        item.sources.some(
          (source) => source.attemptId !== document.sourceEvidenceVersionId,
        )
      )
        fail("Citations must bind the declared evidence version");
      if (item.state === "source_supported" && !item.sources.length)
        fail("Source-supported facts require citations");
      if (
        (item.state === "candidate_confirmed") !==
        (item.confirmation !== null)
      )
        fail("Candidate confirmation requires an explicit matching record");
      if (
        item.confirmation &&
        (item.confirmation.actorId !== document.ownerId ||
          item.confirmation.value !== item.value)
      )
        fail("Confirmation must bind the owner and exact fact value");
    }
    const targets = new Set(identities);
    for (const change of document.changes) {
      if (
        change.actorId !== document.ownerId ||
        !targets.has(change.targetId) ||
        document.changes.some((item) => item.id === change.targetId)
      )
        fail("Change events must bind an owner and content target");
    }
    const characters =
      document.facts.reduce((sum, item) => sum + item.value.length, 0) +
      document.sections.reduce(
        (sum, item) =>
          sum +
          item.title.length +
          item.entries.reduce(
            (sum, item) =>
              sum +
              item.bullets.reduce((sum, item) => sum + item.text.length, 0),
            0,
          ),
        0,
      );
    if (characters > 200_000)
      fail("Canonical content exceeds the aggregate text limit");
  });

export type CanonicalResumeDraft = z.infer<typeof CanonicalResumeDraftSchema>;
