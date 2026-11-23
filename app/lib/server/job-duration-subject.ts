import { createHash } from "node:crypto";
import { z } from "zod";
import {
  JobRequirementRelationsSchema,
  JOB_RELATION_ADMISSION_PROFILE_SHA256,
} from "./job-requirement-admission";
import { resolveJobAlias } from "./job-aliases";
import { deriveJobListClauses } from "./job-relations";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const fold = (value: string) =>
  value
    .replace(/[A-Z]/gu, (c) => c.toLowerCase())
    .replace(/[\t ]+/gu, " ")
    .trim();
export const JOB_DURATION_SUBJECT_POLICY_VERSION =
  "job-duration-subject-rules/1.1.0" as const;
export const JOB_DURATION_SUBJECT_POLICY = Object.freeze({
  version: JOB_DURATION_SUBJECT_POLICY_VERSION,
  source:
    "strict-replayed-requirements/2.0.0; original stored expressions unchanged",
  grammar:
    "upfront-known-duration of <skills> experience | upfront-known-duration of experience with/in <skills>",
  listFormatting:
    "one physical-line bullet (•, -, *) followed by horizontal whitespace",
  admittedCuePrefixes: Object.freeze([
    "",
    "must have",
    "requires",
    "required:",
  ]),
  single: "one exact cited skill token",
  alternatives: "flat or with explicit either",
  conjunction: "flat and with explicit each-of prefix or each suffix",
  authority:
    "nonpersistable-source-interpretation-only; no numeric credit or proficiency",
  limits: Object.freeze({
    clauses: 300,
    operands: 1024,
    perClauseOperands: 32,
    work: 500000,
    outputUtf8Bytes: 1048576,
  }),
});
export const JOB_DURATION_SUBJECT_POLICY_SHA256 = sha(
  JSON.stringify(JOB_DURATION_SUBJECT_POLICY),
);
const clauseSchema =
  JobRequirementRelationsSchema.shape.relations.shape.clauses.element;
const storedExpression = clauseSchema.shape.skillExpression;
const expression = z.union([
  storedExpression.options[0],
  storedExpression.options[1],
  storedExpression.options[2],
]);
const reason = z.enum([
  "explicit_single_skill",
  "explicit_either",
  "explicit_each",
  "stored_expression_available",
  "list_expression_available",
  "negated_clause",
  "unsupported_document",
  "duration_not_known",
  "unsupported_grammar",
  "uncited_or_ambiguous_skill",
]);
export const JobDurationSubjectInterpretationSchema = z
  .strictObject({
    clauseId: clauseSchema.shape.id,
    storedExpressionKind: z.enum(["atom", "any_of", "all_of", "unknown"]),
    listMarker: clauseSchema.shape.evidence.nullable(),
    listExpression: expression.nullable(),
    state: z.enum(["derived", "unresolved"]),
    subjectBinding: z
      .enum(["single_operand", "each_operand", "alternative_operand"])
      .nullable(),
    expression: expression.nullable(),
    duration: clauseSchema.shape.duration,
    reason,
  })
  .superRefine((value, ctx) => {
    if (
      (value.state === "derived") !==
        (value.expression !== null && value.subjectBinding !== null) ||
      (value.state === "unresolved" &&
        (value.expression !== null || value.subjectBinding !== null)) ||
      (value.listExpression !== null &&
        (value.listMarker === null || value.storedExpressionKind !== "unknown"))
    )
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent duration subject interpretation",
      });
  });
export type JobDurationSubjectInterpretation = z.infer<
  typeof JobDurationSubjectInterpretationSchema
>;
const binding = z.strictObject({
  versionId: z.uuid(),
  ownerId: z.uuid(),
  organizationId: z.uuid(),
  analysisId: z.uuid(),
  jobId: z.uuid(),
  inputSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  admissionProfileSha256: z.literal(JOB_RELATION_ADMISSION_PROFILE_SHA256),
});
const common = {
  schemaVersion: z.literal("job-duration-subjects/1.1.0"),
  authority: z.literal("derived_explicit_duration_subjects"),
  persistable: z.literal(false),
  scoringEligible: z.literal(false),
  policy: z.strictObject({
    version: z.literal(JOB_DURATION_SUBJECT_POLICY_VERSION),
    sha256: z.literal(JOB_DURATION_SUBJECT_POLICY_SHA256),
  }),
};
export const JobDurationSubjectsSchema = z.discriminatedUnion("state", [
  z.strictObject({
    ...common,
    state: z.literal("available"),
    binding,
    interpretations: z.array(JobDurationSubjectInterpretationSchema).max(300),
    unavailableReason: z.null(),
  }),
  z.strictObject({
    ...common,
    state: z.literal("unavailable"),
    binding: z.null(),
    interpretations: z.array(JobDurationSubjectInterpretationSchema).length(0),
    unavailableReason: z.enum(["invalid_document", "resource_limit"]),
  }),
]);
export type JobDurationSubjects = z.infer<typeof JobDurationSubjectsSchema>;
const flags = {
  schemaVersion: "job-duration-subjects/1.1.0",
  authority: "derived_explicit_duration_subjects",
  persistable: false,
  scoringEligible: false,
  policy: {
    version: JOB_DURATION_SUBJECT_POLICY_VERSION,
    sha256: JOB_DURATION_SUBJECT_POLICY_SHA256,
  },
} as const;
class ResourceLimit extends Error {}
function unavailable(
  why: "invalid_document" | "resource_limit",
): JobDurationSubjects {
  return {
    ...flags,
    state: "unavailable",
    binding: null,
    interpretations: [],
    unavailableReason: why,
  };
}
function bounded(raw: unknown) {
  const stack = [{ value: raw, depth: 0 }];
  let nodes = 0,
    text = 0;
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    if (++nodes > 50000 || depth > 32) throw new ResourceLimit();
    if (typeof value === "string") {
      text += value.length;
      if (value.length > 20000 || text > 1048576) throw new ResourceLimit();
    } else if (Array.isArray(value)) {
      if (value.length > 1000) throw new ResourceLimit();
      for (const child of value) stack.push({ value: child, depth: depth + 1 });
    } else if (value !== null && typeof value === "object") {
      const entries = Object.entries(value);
      if (entries.length > 40) throw new ResourceLimit();
      for (const [key, child] of entries) {
        if (key.length > 200) throw new ResourceLimit();
        stack.push({ value: child, depth: depth + 1 });
      }
    }
  }
}
/** Adds a versioned interpretation beside the stored clause. It neither changes
 * persisted atoms nor authenticates ownership of a caller-supplied document. */
export function deriveJobDurationSubjects(
  rawDocument: unknown,
): JobDurationSubjects {
  try {
    bounded(rawDocument);
    const doc = JobRequirementRelationsSchema.parse(rawDocument);
    const listClauses = deriveJobListClauses(doc);
    const chars = Array.from(doc.sourceText);
    let work = chars.length,
      operands = 0;
    const charge = (n = 1) => {
      work += n;
      if (work > 500000) throw new ResourceLimit();
    };
    const span = (start: number, end: number) => ({
      spanId: `jd-${start}-${end}`,
      start,
      end,
      quote: chars.slice(start, end).join(""),
    });
    type SkillToken = {
      evidence: z.infer<(typeof storedExpression.options)[0]>["evidence"];
      requirementIds: string[];
    };
    const tokens = new Map<string, SkillToken>();
    for (const item of doc.requirements) {
      charge();
      if (item.type !== "skill") continue;
      for (const evidence of item.tokenEvidence) {
        charge();
        const key = `${evidence.start}:${evidence.end}`;
        const old = tokens.get(key);
        if (old) {
          if (!old.requirementIds.includes(item.id))
            old.requirementIds.push(item.id);
        } else tokens.set(key, { evidence, requirementIds: [item.id] });
      }
    }
    const allTokens = [...tokens.values()].sort(
      (a, b) =>
        a.evidence.start - b.evidence.start || a.evidence.end - b.evidence.end,
    );
    const interpretations: JobDurationSubjectInterpretation[] = [];
    for (const clause of doc.relations.clauses) {
      charge();
      const list = listClauses.get(clause.evidence.spanId);
      const listExpression = list?.clause.skillExpression;
      const listDuration = list?.clause.duration;
      const duration =
        clause.duration.kind === "unknown" &&
        listDuration &&
        listDuration.kind !== "unknown"
          ? listDuration
          : clause.duration;
      const base = {
        clauseId: clause.id,
        storedExpressionKind: clause.skillExpression.kind,
        listMarker: list?.marker ?? null,
        listExpression:
          clause.skillExpression.kind === "unknown" &&
          listExpression &&
          listExpression.kind !== "unknown"
            ? listExpression
            : null,
        duration,
      };
      const miss = (why: z.infer<typeof reason>) =>
        interpretations.push({
          ...base,
          state: "unresolved",
          subjectBinding: null,
          expression: null,
          reason: why,
        });
      if (
        doc.locale !== "en-IN" ||
        doc.domain !== "software-engineering" ||
        doc.state === "unsupported"
      ) {
        miss("unsupported_document");
        continue;
      }
      if (clause.scope.negated) {
        miss("negated_clause");
        continue;
      }
      if (clause.skillExpression.kind !== "unknown") {
        miss("stored_expression_available");
        continue;
      }
      if (base.listExpression) {
        miss("list_expression_available");
        continue;
      }
      if (
        duration.kind === "unknown" ||
        duration.kind === "not_stated" ||
        !duration.evidence ||
        !duration.candidateEvidence.length
      ) {
        miss("duration_not_known");
        continue;
      }
      if (
        duration.candidateEvidence.length !== 1 ||
        duration.evidence.start < clause.evidence.start ||
        duration.evidence.end > clause.evidence.end ||
        !JOB_DURATION_SUBJECT_POLICY.admittedCuePrefixes.includes(
          fold(
            chars
              .slice(
                base.listMarker?.end ?? clause.evidence.start,
                duration.evidence.start,
              )
              .join(""),
          ),
        )
      ) {
        miss("unsupported_grammar");
        continue;
      }
      const observed = new Set(clause.skillExpression.observedRequirementIds);
      const selected = allTokens.filter((token) => {
        charge();
        return (
          token.evidence.start >= duration.evidence!.end &&
          token.evidence.end <= clause.evidence.end &&
          token.requirementIds.some((id) => observed.has(id))
        );
      });
      if (!selected.length || selected.length > 32) {
        miss("uncited_or_ambiguous_skill");
        continue;
      }
      const first = selected[0].evidence,
        last = selected.at(-1)!.evidence;
      let prefix = fold(
        chars.slice(duration.evidence.end, first.start).join(""),
      );
      let suffix = fold(chars.slice(last.end, clause.evidence.end).join(""));
      suffix = suffix
        .replace(/\.$/u, "")
        .trim()
        .replace(
          /(?:^| )(?:is required|required|preferred|mandatory|essential|optional)$/u,
          "",
        )
        .trim();
      let each = false,
        either = false;
      if (/(?:^| )either$/u.test(prefix)) {
        either = true;
        prefix = prefix.replace(/(?:^| )either$/u, "").trim();
      } else if (/(?:^| )each of$/u.test(prefix)) {
        each = true;
        prefix = prefix.replace(/(?:^| )each of$/u, "").trim();
      }
      if (/(?:^| )each$/u.test(suffix)) {
        each = true;
        suffix = suffix.replace(/(?:^| )each$/u, "").trim();
      }
      const grammar =
        (prefix === "of" && suffix === "experience") ||
        (["of experience with", "of experience in"].includes(prefix) &&
          suffix === "");
      if (!grammar || (each && either)) {
        miss("unsupported_grammar");
        continue;
      }
      const operators: ReturnType<typeof span>[] = [];
      let operator: "and" | "or" | null = null,
        bad = false;
      for (let i = 1; i < selected.length; i++) {
        charge();
        const left = selected[i - 1].evidence,
          right = selected[i].evidence;
        const between = chars.slice(left.end, right.start).join("");
        const match = /^[\t ]*(and|or)[\t ]*$/iu.exec(between);
        if (left.end > right.start || !match) {
          bad = true;
          break;
        }
        const word = fold(match[1]) as "and" | "or";
        if (operator && operator !== word) {
          bad = true;
          break;
        }
        operator = word;
        const start =
          left.end +
          Array.from(between.slice(0, between.indexOf(match[1]))).length;
        operators.push(span(start, start + match[1].length));
      }
      if (
        bad ||
        (selected.length === 1 && (each || either)) ||
        (selected.length > 1 &&
          ((operator === "or" && (!either || each)) ||
            (operator === "and" && (!each || either))))
      ) {
        miss("unsupported_grammar");
        continue;
      }
      const members = selected.map((token) => {
        charge();
        if (++operands > 1024) throw new ResourceLimit();
        return {
          kind: "atom" as const,
          value: token.evidence.quote,
          evidence: token.evidence,
          requirementIds: token.requirementIds.filter((id) => observed.has(id)),
          mapping: resolveJobAlias(token.evidence.quote),
        };
      });
      const effective =
        members.length === 1
          ? members[0]
          : {
              kind:
                operator === "or" ? ("any_of" as const) : ("all_of" as const),
              evidence: span(first.start, last.end),
              operands: members,
              operatorEvidence: operators,
            };
      interpretations.push({
        ...base,
        state: "derived",
        subjectBinding:
          members.length === 1
            ? "single_operand"
            : operator === "or"
              ? "alternative_operand"
              : "each_operand",
        expression: effective,
        reason:
          members.length === 1
            ? "explicit_single_skill"
            : operator === "or"
              ? "explicit_either"
              : "explicit_each",
      });
    }
    const output = {
      ...flags,
      state: "available" as const,
      binding: {
        versionId: doc.id,
        ownerId: doc.ownerId,
        organizationId: doc.organizationId,
        analysisId: doc.analysisId,
        jobId: doc.jobId,
        inputSha256: doc.inputSha256,
        admissionProfileSha256: JOB_RELATION_ADMISSION_PROFILE_SHA256,
      },
      interpretations,
      unavailableReason: null,
    };
    if (Buffer.byteLength(JSON.stringify(output), "utf8") > 1048576)
      throw new ResourceLimit();
    return JobDurationSubjectsSchema.parse(output);
  } catch (error) {
    return unavailable(
      error instanceof ResourceLimit ? "resource_limit" : "invalid_document",
    );
  }
}
