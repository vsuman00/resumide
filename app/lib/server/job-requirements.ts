import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { SqlCompatibleIsoDateTimeSchema } from "./iso-datetime";
import {
  discoverJobAliasMentions,
  JOB_ALIAS_LEXICON_SHA256,
  JOB_ALIAS_POLICY_VERSION,
  resolveJobAlias,
  type JobAliasMapping,
} from "./job-aliases";
import {
  deriveLocalJobRelations,
  type LocalJobRelations,
} from "./job-relations";

export const RequirementType = z.enum([
  "skill",
  "experience",
  "education",
  "certification",
  "responsibility",
  "location",
  "authorization",
  "other",
]);
export const RequirementItemSchema = z.strictObject({
  id: z.uuid(),
  type: RequirementType,
  value: z.string().trim().min(1).max(2000),
  importance: z.enum(["required", "preferred", "contextual", "unknown"]),
  importanceBasis: z.enum(["explicit", "inferred", "unknown"]),
  importanceEvidence: z
    .strictObject({
      start: z.number().int().min(0).max(20000),
      end: z.number().int().positive().max(20000),
      quote: z.string().min(1).max(2000),
    })
    .nullable(),
  derivation: z.enum(["exact", "model_proposed"]),
  minimumYears: z.number().min(0).max(100).nullable(),
  negated: z.boolean(),
  ambiguity: z.array(z.string().min(1).max(100)).max(10),
  dedupGroup: z.string().min(1).max(100),
  evidence: z.strictObject({
    spanId: z.string().min(1).max(100),
    start: z.number().int().min(0).max(20000),
    end: z.number().int().positive().max(20000),
    quote: z.string().min(1).max(2000),
  }),
  confidence: z.strictObject({
    kind: z.literal("uncalibrated"),
    value: z.number().min(0).max(1).nullable(),
  }),
});
export const JobRequirementsSchema = z
  .strictObject({
    schemaVersion: z.literal("requirements/1.0.0"),
    producerVersion: z.enum([
      "jd-parser/1.0.0",
      "jd-parser/1.0.1",
      "jd-parser/1.0.2",
    ]),
    id: z.uuid(),
    parentVersionId: z.uuid().nullable(),
    ownerId: z.uuid(),
    organizationId: z.uuid(),
    analysisId: z.uuid(),
    jobId: z.uuid(),
    createdAt: SqlCompatibleIsoDateTimeSchema,
    retentionPolicyId: z.literal("candidate-active-30d/1.0.0"),
    inputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    locale: z.string().min(2).max(20),
    domain: z.string().min(1).max(80),
    state: z.enum(["review_required", "unsupported", "insufficient"]),
    sourceText: z.string().max(20000),
    requirements: z.array(RequirementItemSchema).max(300),
    warnings: z.array(z.string().min(1).max(100)).max(30),
  })
  .superRefine((doc, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (doc.parentVersionId === doc.id) fail("Self lineage is invalid");
    if (
      createHash("sha256").update(doc.sourceText).digest("hex") !==
      doc.inputSha256
    )
      fail("JD hash mismatch");
    const chars = Array.from(doc.sourceText);
    const ids = new Set<string>(),
      spans = new Set<string>();
    for (const item of doc.requirements) {
      const e = item.evidence;
      if (ids.has(item.id) || item.id === doc.id)
        fail("Duplicate requirement ID");
      ids.add(item.id);
      const key = `${item.type}:${e.start}:${e.end}:${item.value}`;
      if (spans.has(key)) fail("Duplicate requirement span");
      spans.add(key);
      if (
        e.end <= e.start ||
        e.end > chars.length ||
        chars.slice(e.start, e.end).join("") !== e.quote ||
        !e.quote.includes(item.value)
      )
        fail("Exact JD evidence required");
      if (item.minimumYears !== null && item.type !== "experience")
        fail("Years belong to experience");
      if (item.minimumYears !== null) {
        const stated =
          /\b(\d{1,2})(?:\s*[-–]\s*\d{1,2}|\s*\+)?\s*(?:years?|yrs?)\b/iu.exec(
            e.quote,
          );
        if (!stated || Number(stated[1]) !== item.minimumYears)
          fail("Minimum years must match the exact JD");
      }
      const cue = item.importanceEvidence;
      if (
        cue &&
        (cue.end <= cue.start ||
          cue.end > chars.length ||
          chars.slice(cue.start, cue.end).join("") !== cue.quote)
      )
        fail("Importance evidence mismatch");
      if ((item.importanceBasis === "explicit") !== (cue !== null))
        fail("Explicit importance needs its own citation");
      if (
        item.importanceBasis !== "explicit" &&
        item.importance !== "unknown" &&
        item.derivation === "exact"
      )
        fail("Exact importance requires explicit evidence");
      if (item.negated && item.importance === "required")
        fail("Negated requirements cannot be required");
    }
    if (!doc.requirements.length && doc.state === "review_required")
      fail("Empty extraction must be insufficient or unsupported");
  });
export type JobRequirements = z.infer<typeof JobRequirementsSchema>;
export type JobRequirement = z.infer<typeof RequirementItemSchema>;

export const JD_PARSER_VERSION = "jd-parser/1.0.2" as const;

// Engineering vocabulary for exact discovery, not an accepted taxonomy mapping.
export const SOFTWARE_SKILLS = [
  "TypeScript",
  "JavaScript",
  "Python",
  "Java",
  "SQL",
  "React",
  "Node.js",
  "PostgreSQL",
  "Docker",
  "Kubernetes",
  "Git",
  "AWS",
  "Azure",
  "C++",
  "C#",
  "FastAPI",
  "Flask",
  "Pydantic",
  "LLMs",
  "LLM",
  "RAG",
  "Generative AI",
  "Retrieval-Augmented Generation",
  "embedding models",
  "embeddings",
  "vector databases",
  "AI agents",
  "AI agent",
  "agent orchestration",
  "NoSQL",
  "Redis",
  "async/await",
  "asynchronous programming",
  "GCP",
  "Google Cloud",
  "Object-Oriented Programming",
  "OOP",
  "REST APIs",
  "microservices",
] as const;
const escaped = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
function importance(text: string, heading: string) {
  const required = /\b(must|required|mandatory|essential|minimum)\b/iu.test(
    text.replace(/\bwhere required\b/giu, ""),
  );
  const preferred =
    /\b(preferred|desirable|nice[ -]to[ -]have|bonus|optional)\b/iu.test(text);
  const conflict = required && preferred;
  if (conflict)
    return {
      importance: "unknown" as const,
      importanceBasis: "unknown" as const,
      ambiguity: ["conflicting_importance"],
    };
  const explicit = required ? "required" : preferred ? "preferred" : heading;
  return {
    importance: explicit as JobRequirement["importance"],
    importanceBasis:
      explicit === "unknown" ? ("unknown" as const) : ("explicit" as const),
    ambiguity: [] as string[],
  };
}
export function statedExperienceRange(text: string) {
  const match =
    /\b(\d{1,2})(?:\s*[-–]\s*(\d{1,2})|\s*\+)?\s*(?:years?|yrs?)\b/iu.exec(
      text,
    );
  return match
    ? {
        minimumYears: Number(match[1]),
        maximumYears: match[2] ? Number(match[2]) : null,
      }
    : null;
}
function sourceLines(source: string) {
  const result: Array<{
    text: string;
    start: number;
    end: number;
    metadata: string | null;
  }> = [];
  let offset = 0;
  for (const line of source.split("\n")) {
    const metadata =
      /^(?:title|role|location|employment\s*type|exp(?:erience)?\s*range)\s*:/iu.test(
        line.trim(),
      );
    const labels = metadata
      ? [
          ...line.matchAll(
            /(?:title|role|location|employment\s*type|exp(?:erience)?\s*range)\s*:/giu,
          ),
        ]
      : [];
    const metadataSegments: Array<{
      begin: number;
      end: number;
      kind: string | null;
    }> = labels.length
      ? labels.map((match, index) => ({
          begin: match.index!,
          end: labels[index + 1]?.index ?? line.length,
          kind: match[0].split(":")[0].trim().toLowerCase(),
        }))
      : [{ begin: 0, end: line.length, kind: null }];
    // Independent clauses need their own polarity, importance and year citation.
    // Keep conjunctions inside skill alternatives intact for explicit review.
    const segments = metadataSegments.flatMap((segment) => {
      if (segment.kind) return [segment];
      const raw = line.slice(segment.begin, segment.end);
      const separators = [
        ...raw.matchAll(
          /;\s*|(?:,\s*|,?\s+and\s+)(?=(?:\d{1,2}\s*\+?\s*years?|no\b|not\b))|\s+but\s+(?=(?:no|not)\b)/giu,
        ),
      ];
      let begin = segment.begin;
      const parts = [];
      for (const match of separators) {
        parts.push({ begin, end: segment.begin + match.index!, kind: null });
        begin = segment.begin + match.index! + match[0].length;
      }
      parts.push({ begin, end: segment.end, kind: null });
      return parts;
    });
    for (const segment of segments) {
      const raw = line.slice(segment.begin, segment.end),
        text = raw.trim();
      const leading = Array.from(raw).findIndex((c) => c.trim() !== "");
      const start =
        offset +
        Array.from(line.slice(0, segment.begin)).length +
        Math.max(leading, 0);
      result.push({
        text,
        start,
        end: start + Array.from(text).length,
        metadata: segment.kind,
      });
    }
    offset += Array.from(line).length + 1;
  }
  return result;
}

const requiredSection =
  /^(requirements|job requirements|qualifications|required qualifications|basic qualifications|minimum qualifications|required skills(?: and experience)?|skills and experience|must have|essential skills):?$/iu;
const preferredSection =
  /^(preferred qualifications|preferred|nice to have):?$/iu;
const contextualSection = /^((?:key |job )?responsibilities|duties):?$/iu;
const roleSection = /^about (?:the job|this role):?$/iu;
const companySection =
  /^(benefits|about (?!the job\b|this role\b)[\p{L}\p{N}][\p{L}\p{N}& .,'’–-]{0,80}|company overview|equal opportunity):?$/iu;
const span = (start: number, end: number, quote: string): ExactJobSpan => ({
  spanId: `jd-${start}-${end}`,
  start,
  end,
  quote,
});
type ReviewedSkillScope = {
  importance: "required" | "preferred";
  heading: ExactJobSpan;
};

/** Read additional skills headings on admitted JD text without changing stored scope. */
export function deriveReviewedSkillSections(source: string) {
  const characters = Array.from(source);
  const headings = new Set<string>();
  const scopes = new Map<string, ReviewedSkillScope>();
  let active: ReviewedSkillScope | null = null;
  let inCompanySection = false;
  for (const { text, start, end, metadata } of sourceLines(source)) {
    if (!text || metadata) continue;
    if (
      requiredSection.test(text) ||
      preferredSection.test(text) ||
      contextualSection.test(text) ||
      roleSection.test(text) ||
      companySection.test(text)
    ) {
      active = null;
      inCompanySection = companySection.test(text);
      continue;
    }
    if (inCompanySection) continue;
    const citation = span(start, end, text);
    const newHeading = /^preferred skills(?: and experience)?:?$/iu.test(text)
      ? "preferred"
      : /^mandatory skills(?: and experience)?:?$/iu.test(text)
        ? "required"
        : null;
    if (newHeading) {
      let before = start - 1;
      while (before >= 0 && /^[\t \u00a0]$/u.test(characters[before])) before--;
      let after = end;
      while (
        after < characters.length &&
        /^[\t \u00a0\r]$/u.test(characters[after])
      )
        after++;
      if (
        (before < 0 || characters[before] === "\n") &&
        (after === characters.length || characters[after] === "\n")
      ) {
        active = { importance: newHeading, heading: citation };
        headings.add(citation.spanId);
        continue;
      }
    }
    if (active) {
      const explicit = importance(text, "unknown");
      if (explicit.importanceBasis === "unknown" && !explicit.ambiguity.length)
        scopes.set(citation.spanId, active);
    }
  }
  return { headings, scopes };
}
export function parseJobRequirements(
  sourceText: string,
  context: {
    ownerId: string;
    organizationId: string;
    analysisId: string;
    jobId: string;
    locale?: string;
    domain?: string;
    parentVersionId?: string | null;
  },
): JobRequirements {
  if (sourceText.length > 20000) throw new Error("JD_INPUT_LIMIT");
  const locale = context.locale ?? "en-IN",
    domain = context.domain ?? "software-engineering";
  const supported = locale === "en-IN" && domain === "software-engineering";
  const requirements: JobRequirement[] = [];
  let heading = "unknown",
    companyContext = false;
  let headingEvidence: JobRequirement["importanceEvidence"] = null;
  for (const { text, start, end, metadata } of sourceLines(sourceText)) {
    if (!text) continue;
    if (requiredSection.test(text)) {
      heading = "required";
      companyContext = false;
      headingEvidence = { start, end, quote: text };
      continue;
    }
    if (preferredSection.test(text)) {
      heading = "preferred";
      companyContext = false;
      headingEvidence = { start, end, quote: text };
      continue;
    }
    if (contextualSection.test(text)) {
      heading = "contextual";
      companyContext = false;
      headingEvidence = { start, end, quote: text };
      continue;
    }
    if (roleSection.test(text)) {
      companyContext = false;
      heading = "unknown";
      headingEvidence = null;
      continue;
    }
    if (companySection.test(text)) {
      companyContext = true;
      heading = "unknown";
      headingEvidence = null;
      continue;
    }
    if (
      companyContext ||
      (metadata && ["title", "role", "employment type"].includes(metadata))
    )
      continue;
    const range = statedExperienceRange(text);
    const experienceMetadata =
      metadata !== null && /^exp(?:erience)?\s*range$/iu.test(metadata);
    const imp =
      experienceMetadata && range
        ? {
            importance: "required" as const,
            importanceBasis: "explicit" as const,
            ambiguity: [] as string[],
          }
        : metadata === "location"
          ? {
              importance: "contextual" as const,
              importanceBasis: "explicit" as const,
              ambiguity: [] as string[],
            }
          : importance(text, heading);
    const negated = /\b(no|not(?!\s+only\b)|without|never)\b/iu.test(text);
    const add = (
      type: JobRequirement["type"],
      value = text,
      minimumYears: number | null = null,
    ) => {
      if (text.length > 2000 || requirements.length >= 300)
        throw new Error("JD_ITEM_LIMIT");
      requirements.push({
        id: randomUUID(),
        type,
        value,
        ...imp,
        importance: negated ? "contextual" : imp.importance,
        importanceBasis: negated ? "explicit" : imp.importanceBasis,
        importanceEvidence:
          metadata !== null ||
          negated ||
          importance(text, "unknown").importanceBasis === "explicit"
            ? { start, end, quote: text }
            : imp.importanceBasis === "explicit"
              ? headingEvidence
              : null,
        derivation: "exact",
        minimumYears,
        negated,
        ambiguity: [
          ...imp.ambiguity,
          ...(type === "experience" &&
          range?.maximumYears !== null &&
          range?.maximumYears !== undefined
            ? ["experience_upper_bound_review"]
            : []),
          ...(type === "skill" && /\bor\b/iu.test(text)
            ? ["skill_alternative_review"]
            : []),
          ...(negated ? ["negated_clause_review"] : []),
        ],
        dedupGroup: createHash("sha256")
          .update(`${type}:${value.toLowerCase().replace(/\s+/gu, " ")}`)
          .digest("hex"),
        evidence: { spanId: `jd-${start}-${end}`, start, end, quote: text },
        confidence: { kind: "uncalibrated", value: null },
      });
    };
    if (
      range &&
      (experienceMetadata ||
        /\b(experience|working|professional)\b/iu.test(text))
    )
      add("experience", text, range.minimumYears);
    if (
      /\b(bachelor|master|degree|B\.Tech|BTech|BSc|MSc|PhD|diploma)\b/iu.test(
        text,
      ) ||
      /(?<![\p{L}\p{N}])B\.?E\.?(?![\p{L}\p{N}])/u.test(text)
    )
      add("education");
    if (/\b(certification|certified|certificate)\b/iu.test(text))
      add("certification");
    if (
      /\b(based in|located in|location|relocate|on[ -]site|hybrid|remote|Bengaluru|Bangalore|Mumbai|Delhi|Hyderabad|Pune)\b/iu.test(
        text,
      )
    )
      add("location");
    if (
      /\b(work authorization|authori[sz]ed to work|visa|sponsorship|right to work|work permit)\b/iu.test(
        text,
      )
    )
      add("authorization");
    // Title/location/experience metadata is not a list of technical requirements.
    if (metadata === null)
      for (const skill of SOFTWARE_SKILLS) {
        const match = new RegExp(
          `(?<![\\p{L}\\p{N}])${escaped(skill)}(?![\\p{L}\\p{N}])`,
          "iu",
        ).exec(text);
        if (match) add("skill", match[0]);
      }
    if (
      heading === "contextual" &&
      /\b(build|develop|design|maintain|implement|test|collaborate|lead|deliver)\b/iu.test(
        text,
      )
    )
      add("responsibility");
  }
  return JobRequirementsSchema.parse({
    schemaVersion: "requirements/1.0.0",
    producerVersion: JD_PARSER_VERSION,
    id: randomUUID(),
    parentVersionId: context.parentVersionId ?? null,
    ownerId: context.ownerId,
    organizationId: context.organizationId,
    analysisId: context.analysisId,
    jobId: context.jobId,
    createdAt: new Date().toISOString(),
    retentionPolicyId: "candidate-active-30d/1.0.0",
    inputSha256: createHash("sha256").update(sourceText).digest("hex"),
    sourceText,
    locale,
    domain,
    state: !supported
      ? "unsupported"
      : requirements.length
        ? "review_required"
        : "insufficient",
    requirements,
    warnings: [
      ...(!supported ? ["unsupported_domain_or_locale"] : []),
      "uncalibrated_requirements",
      "domain_pack_review_pending",
    ],
  });
}

export const LOCAL_JD_ALIAS_MODEL_VERSION =
  "jd-local-alias-parser/1.0.0" as const;
type ExactJobSpan = JobRequirement["evidence"];
export type LocalAliasRequirement = JobRequirement & {
  mapping: JobAliasMapping | null;
  tokenEvidence: ExactJobSpan[];
};
export type LocalAliasJobRequirements = Omit<
  JobRequirements,
  "schemaVersion" | "producerVersion" | "requirements"
> & {
  schemaVersion: "jd-local-discovery/1.0.0";
  modelVersion: typeof LOCAL_JD_ALIAS_MODEL_VERSION;
  legacyParserVersion: typeof JD_PARSER_VERSION;
  authority: "local_review_only";
  persistable: false;
  scoringEligible: false;
  mappingPolicy: {
    version: typeof JOB_ALIAS_POLICY_VERSION;
    lexiconSha256: string;
    externalTaxonomy: null;
  };
  requirements: LocalAliasRequirement[];
  retainedClauses: Array<{
    evidence: ExactJobSpan;
    importance: JobRequirement["importance"];
    negated: boolean;
    interpretation: "unmapped" | "partial_vocabulary";
    reviewRequired: true;
    requirementIds: string[];
  }>;
};

// A separate, opt-in read model. The stored parser above remains frozen.
export function parseJobRequirementsWithAliases(
  sourceText: string,
  context: Parameters<typeof parseJobRequirements>[1],
  options: { modelVersion: typeof LOCAL_JD_ALIAS_MODEL_VERSION },
): LocalAliasJobRequirements {
  if (options?.modelVersion !== LOCAL_JD_ALIAS_MODEL_VERSION)
    throw new Error("JD_ALIAS_MODEL_UNSUPPORTED");
  const legacy = parseJobRequirements(sourceText, context);
  let tokenCount = 0;
  const admitTokens = (tokens: ExactJobSpan[]) => {
    tokenCount += tokens.length;
    if (tokenCount > 1000) throw new Error("JD_ALIAS_TOKEN_LIMIT");
    return tokens;
  };
  const requirements: LocalAliasRequirement[] = legacy.requirements.map(
    (item) => {
      const tokenEvidence: ExactJobSpan[] = [];
      let mapping = item.type === "skill" ? resolveJobAlias(item.value) : null;
      if (mapping?.kind === "exact") {
        for (const mention of discoverJobAliasMentions(item.evidence.quote))
          if (mention.value.toLowerCase() === item.value.toLowerCase())
            tokenEvidence.push(
              span(
                item.evidence.start + mention.evidence.start,
                item.evidence.start + mention.evidence.end,
                mention.evidence.quote,
              ),
            );
        // Retain the frozen raw observation without promoting a qualified fragment.
        if (!tokenEvidence.length) mapping = resolveJobAlias("");
      } else if (item.type === "skill") {
        const pattern = new RegExp(
          `(?<![\\p{L}\\p{N}])${escaped(item.value)}(?![\\p{L}\\p{N}])`,
          "giu",
        );
        for (const match of item.evidence.quote.matchAll(pattern)) {
          const start =
            item.evidence.start +
            Array.from(item.evidence.quote.slice(0, match.index)).length;
          tokenEvidence.push(
            span(start, start + Array.from(match[0]).length, match[0]),
          );
        }
      }
      return {
        ...item,
        mapping,
        tokenEvidence: admitTokens(tokenEvidence),
      };
    },
  );
  const retainedClauses: LocalAliasJobRequirements["retainedClauses"] = [];
  let heading = "unknown",
    companyContext = false;
  let headingEvidence: JobRequirement["importanceEvidence"] = null;
  // These heading rules deliberately retain the frozen parser's scope. Relation
  // interpretation and new storage admission belong to later versioned slices.
  for (const { text, start, end, metadata } of sourceLines(sourceText)) {
    if (!text) continue;
    if (requiredSection.test(text)) {
      heading = "required";
      companyContext = false;
      headingEvidence = { start, end, quote: text };
      continue;
    }
    if (preferredSection.test(text)) {
      heading = "preferred";
      companyContext = false;
      headingEvidence = { start, end, quote: text };
      continue;
    }
    if (contextualSection.test(text)) {
      heading = "contextual";
      companyContext = false;
      headingEvidence = { start, end, quote: text };
      continue;
    }
    if (roleSection.test(text)) {
      heading = "unknown";
      companyContext = false;
      headingEvidence = null;
      continue;
    }
    if (companySection.test(text)) {
      heading = "unknown";
      companyContext = true;
      headingEvidence = null;
      continue;
    }
    if (companyContext || metadata !== null) continue;
    const imp = importance(text, heading);
    const negated = /\b(no|not(?!\s+only\b)|without|never)\b/iu.test(text);
    const mentions = discoverJobAliasMentions(text).filter(
      (m) => m.mapping.kind === "alias",
    );
    const byLiteral = new Map<string, typeof mentions>();
    for (const mention of mentions) {
      const key = mention.value.toLowerCase();
      const group = byLiteral.get(key) ?? [];
      group.push(mention);
      byLiteral.set(key, group);
    }
    for (const group of byLiteral.values()) {
      if (text.length > 2000 || requirements.length >= 300)
        throw new Error("JD_ITEM_LIMIT");
      const first = group[0];
      const raw = RequirementItemSchema.parse({
        id: randomUUID(),
        type: "skill",
        value: first.value,
        ...imp,
        importance: negated ? "contextual" : imp.importance,
        importanceBasis: negated ? "explicit" : imp.importanceBasis,
        importanceEvidence:
          negated || importance(text, "unknown").importanceBasis === "explicit"
            ? { start, end, quote: text }
            : imp.importanceBasis === "explicit"
              ? headingEvidence
              : null,
        derivation: "exact",
        minimumYears: null,
        negated,
        ambiguity: [
          ...imp.ambiguity,
          ...(/\bor\b/iu.test(text) ? ["skill_alternative_review"] : []),
          ...(negated ? ["negated_clause_review"] : []),
        ],
        dedupGroup: createHash("sha256")
          .update(`skill:${first.value.toLowerCase()}`)
          .digest("hex"),
        evidence: span(start, end, text),
        confidence: { kind: "uncalibrated", value: null },
      });
      requirements.push({
        ...raw,
        mapping: first.mapping,
        tokenEvidence: admitTokens(
          group.map((m) =>
            span(
              start + m.evidence.start,
              start + m.evidence.end,
              m.evidence.quote,
            ),
          ),
        ),
      });
    }
    const inClause = requirements.filter(
      (r) => r.evidence.start === start && r.evidence.end === end,
    );
    if (
      inClause.length ||
      imp.importance === "required" ||
      imp.importance === "preferred" ||
      imp.ambiguity.length ||
      negated
    ) {
      if (text.length > 2000 || retainedClauses.length >= 300)
        throw new Error("JD_ALIAS_CLAUSE_LIMIT");
      retainedClauses.push({
        evidence: span(start, end, text),
        importance: negated ? "contextual" : imp.importance,
        negated,
        interpretation: inClause.length ? "partial_vocabulary" : "unmapped",
        reviewRequired: true,
        requirementIds: inClause.map((r) => r.id),
      });
    }
  }
  // Do not expose a legacy producer-labelled body containing new observations.
  return {
    id: legacy.id,
    parentVersionId: legacy.parentVersionId,
    ownerId: legacy.ownerId,
    organizationId: legacy.organizationId,
    analysisId: legacy.analysisId,
    jobId: legacy.jobId,
    createdAt: legacy.createdAt,
    retentionPolicyId: legacy.retentionPolicyId,
    inputSha256: legacy.inputSha256,
    sourceText: legacy.sourceText,
    locale: legacy.locale,
    domain: legacy.domain,
    schemaVersion: "jd-local-discovery/1.0.0",
    modelVersion: LOCAL_JD_ALIAS_MODEL_VERSION,
    legacyParserVersion: JD_PARSER_VERSION,
    authority: "local_review_only",
    persistable: false,
    scoringEligible: false,
    mappingPolicy: {
      version: JOB_ALIAS_POLICY_VERSION,
      lexiconSha256: JOB_ALIAS_LEXICON_SHA256,
      externalTaxonomy: null,
    },
    state:
      legacy.state === "unsupported"
        ? "unsupported"
        : requirements.length || retainedClauses.length
          ? "review_required"
          : "insufficient",
    requirements,
    retainedClauses,
    warnings: [
      ...legacy.warnings,
      "local_alias_policy_not_admitted",
      "clause_interpretation_review_pending",
    ],
  };
}

export const LOCAL_JD_RELATION_MODEL_VERSION =
  "jd-local-relation-parser/1.0.0" as const;
export type LocalRelationalJobRequirements = Omit<
  LocalAliasJobRequirements,
  "schemaVersion" | "modelVersion"
> & {
  schemaVersion: "jd-local-relational-discovery/1.0.0";
  modelVersion: typeof LOCAL_JD_RELATION_MODEL_VERSION;
  baseModelVersion: typeof LOCAL_JD_ALIAS_MODEL_VERSION;
  relations: LocalJobRelations;
};

export function parseJobRequirementsWithRelations(
  sourceText: string,
  context: Parameters<typeof parseJobRequirements>[1],
  options: { modelVersion: typeof LOCAL_JD_RELATION_MODEL_VERSION },
): LocalRelationalJobRequirements {
  if (options?.modelVersion !== LOCAL_JD_RELATION_MODEL_VERSION)
    throw new Error("JD_RELATION_MODEL_UNSUPPORTED");
  const aliases = parseJobRequirementsWithAliases(sourceText, context, {
    modelVersion: LOCAL_JD_ALIAS_MODEL_VERSION,
  });
  return {
    ...aliases,
    schemaVersion: "jd-local-relational-discovery/1.0.0",
    modelVersion: LOCAL_JD_RELATION_MODEL_VERSION,
    baseModelVersion: aliases.modelVersion,
    relations: deriveLocalJobRelations(aliases),
  };
}
