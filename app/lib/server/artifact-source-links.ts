import { getDocumentProxy } from "unpdf";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  buildRenderPlan,
  hash,
  safeArtifactLink,
  type RenderPlan,
} from "./artifact-contract";
import {
  CanonicalResumeDraftSchema,
  type CanonicalResumeDraft,
} from "./canonical-resume-schema";

type LinkVersion = {
  document: CanonicalResumeDraft;
  sourceId: string;
  revision: number;
};
export type SourceLinkLineage = {
  current: LinkVersion;
  loadParent: (versionId: string) => Promise<LinkVersion | null>;
};
const MAX_ANCESTORS = 64;
const MAX_LINEAGE_BYTES = 2 * 1024 * 1024;
const MAX_LINEAGE_FACTS = 20_000;
const BINDING_FIELDS = [
  "ownerId",
  "organizationId",
  "resumeId",
  "analysisId",
  "inputSha256",
  "sourceEvidenceVersionId",
  "retentionPolicyId",
] as const;
const failure = (
  code: "SOURCE_LINK_CHECK_FAILED" | "SOURCE_LINKS_NOT_PRESERVED",
): never => {
  throw new Error(code);
};

function factLink(fact: CanonicalResumeDraft["facts"][number]) {
  return fact.type === "email"
    ? safeArtifactLink(`mailto:${fact.value}`)
    : fact.type === "link"
      ? safeArtifactLink(fact.value)
      : null;
}

async function assertConfirmedReplacements(
  source: Uint8Array,
  plan: RenderPlan,
  missing: Set<string>,
  lineage: SourceLinkLineage,
) {
  const bounds = { bytes: 0, facts: 0 };
  const read = (raw: LinkVersion): LinkVersion => {
    bounds.bytes += Buffer.byteLength(JSON.stringify(raw.document), "utf8");
    if (bounds.bytes > MAX_LINEAGE_BYTES) failure("SOURCE_LINK_CHECK_FAILED");
    const document = CanonicalResumeDraftSchema.safeParse(raw.document);
    if (
      !document.success ||
      !z.uuid().safeParse(raw.sourceId).success ||
      !Number.isInteger(raw.revision) ||
      raw.revision < 1 ||
      raw.revision > 2_147_483_647
    )
      return failure("SOURCE_LINK_CHECK_FAILED");
    bounds.facts += document.data.facts.length;
    if (bounds.facts > MAX_LINEAGE_FACTS) failure("SOURCE_LINK_CHECK_FAILED");
    return { ...raw, document: document.data };
  };
  const current = read(lineage.current);
  if (
    current.document.sourceEvidenceVersionId === null ||
    hash(source) !== current.document.inputSha256 ||
    !isDeepStrictEqual(plan, buildRenderPlan(current.document))
  )
    failure("SOURCE_LINK_CHECK_FAILED");
  const candidates = new Map(
    current.document.facts
      .filter(
        (fact) =>
          ["email", "link"].includes(fact.type) &&
          fact.state === "candidate_confirmed" &&
          fact.confirmation?.actorId === current.document.ownerId &&
          fact.confirmation.value === fact.value &&
          fact.sources.length === 0,
      )
      .flatMap((fact) => {
        const link = factLink(fact);
        return link &&
          plan.blocks.some(
            (block) =>
              block.factIds.includes(fact.id) &&
              block.text === fact.value &&
              block.link === link,
          )
          ? [[fact.id, { type: fact.type, link }] as const]
          : [];
      }),
  );
  let child = current;
  const seen = new Set([current.document.versionId]);
  for (
    let depth = 0;
    depth < MAX_ANCESTORS && missing.size && candidates.size;
    depth++
  ) {
    const parentId = child.document.parentVersionId;
    if (!parentId || seen.has(parentId)) break;
    const raw = await lineage.loadParent(parentId);
    if (!raw) break;
    const parent = read(raw);
    if (
      parent.document.versionId !== parentId ||
      parent.revision !== child.revision - 1 ||
      parent.sourceId !== current.sourceId ||
      BINDING_FIELDS.some(
        (field) => parent.document[field] !== current.document[field],
      )
    )
      failure("SOURCE_LINK_CHECK_FAILED");
    const childFacts = new Map(
      child.document.facts.map((fact) => [fact.id, fact]),
    );
    const parentFacts = new Map(
      parent.document.facts.map((fact) => [fact.id, fact]),
    );
    for (const [factId, candidate] of candidates) {
      const before = parentFacts.get(factId),
        after = childFacts.get(factId);
      if (
        !before ||
        !after ||
        before.type !== candidate.type ||
        after.type !== candidate.type
      ) {
        candidates.delete(factId);
        continue;
      }
      if (before.sources.length) {
        const original = factLink(before);
        if (original && original !== candidate.link) missing.delete(original);
        // Never search past a nearer cited origin for a convenient old URL.
        candidates.delete(factId);
      }
    }
    seen.add(parentId);
    child = parent;
  }
  if (missing.size) failure("SOURCE_LINKS_NOT_PRESERVED");
}

/** Read transient annotation metadata only. Targets are never promoted to
 * candidate facts, fetched, logged or returned in a verification report. */
export async function assertSourceLinksPreserved(
  source: Uint8Array,
  plan: RenderPlan,
  lineage?: SourceLinkLineage,
): Promise<void> {
  const document = await getDocumentProxy(new Uint8Array(source));
  try {
    if (document.numPages > 10) throw new Error("SOURCE_LINK_CHECK_FAILED");
    const represented = new Set(
      plan.blocks.flatMap((block) => (block.link ? [block.link] : [])),
    );
    const missing = new Set<string>();
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      for (const annotation of await page.getAnnotations()) {
        if (annotation.subtype !== "Link") continue;
        const target = annotation.url ?? annotation.unsafeUrl;
        // Internal page destinations do not represent external contact links.
        if (typeof target !== "string") continue;
        const safe = safeArtifactLink(target);
        if (!safe) throw new Error("SOURCE_LINKS_NOT_PRESERVED");
        if (!represented.has(safe)) missing.add(safe);
      }
    }
    if (missing.size) {
      if (!lineage) return failure("SOURCE_LINKS_NOT_PRESERVED");
      await assertConfirmedReplacements(source, plan, missing, lineage);
    }
  } finally {
    await document.destroy();
  }
}
