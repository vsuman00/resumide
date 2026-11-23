import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  assessQualitativeProse,
  QualitativeSourceProseSchema,
  type QualitativeSourceProse,
  type QualitativeSupport,
} from "./qualitative-support";
import { legacyCategoryFromProse } from "./qualitative-prose";
import {
  buildWritingSupportDocument,
  type WritingSourceAnchor,
  type WritingClause,
} from "./writing-support";
import {
  INITIAL_FEEDBACK_CATEGORIES,
  INITIAL_FEEDBACK_VERBS,
  INITIAL_FEEDBACK_MEASURED_TEMPLATES,
  INITIAL_FEEDBACK_PLAN_POLICY,
  INITIAL_FEEDBACK_PLAN_POLICY_VERSION,
  INITIAL_FEEDBACK_PLAN_POLICY_SHA256,
  InitialFeedbackPlanSchema,
  InitialFeedbackRenderSchema,
  InitialFeedbackCompileResultSchema,
  InitialFeedbackPlanError,
  type InitialFeedbackPlan,
  type InitialFeedbackTextExpr,
  type InitialFeedbackSpanRef,
  type InitialFeedbackRender,
  type InitialFeedbackCompileResult,
} from "./initial-feedback-contract";

const hash = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");
const bad = (
  reason: InitialFeedbackPlanError["reason"] = "native_incompatible",
) => new InitialFeedbackPlanError(reason);
const actions =
  "built|created|developed|designed|implemented|improved|reduced|increased|supported|helped|led|lead|managed|owned|maintained|worked";
const actionPattern = new RegExp(
  `^(?:(I|We)\\s+)?(?:(did\\s+not|never)\\s+)?(${actions})\\b`,
  "iu",
);
function stripBullet(text: string): string {
  return text.trim().replace(/^[•●·▪–—-]\s+(?=\p{L})/u, "");
}
function comparable(text: string): string {
  const normalized = stripBullet(text).normalize("NFC").replace(/\s+/gu, " ");
  return /https?:\/\/|mailto:/iu.test(normalized)
    ? normalized
    : normalized.replace(/\.$/u, "");
}
const proseLigatures: Readonly<Record<string, string>> = {
  "\uFB00": "ff",
  "\uFB01": "fi",
  "\uFB02": "fl",
  "\uFB03": "ffi",
  "\uFB04": "ffl",
  "\uFB05": "st",
  "\uFB06": "st",
};
const opaqueProseCues = new Set([
  "argument",
  "called",
  "class",
  "code",
  "column",
  "command",
  "email",
  "field",
  "file",
  "filename",
  "function",
  "identifier",
  "key",
  "literal",
  "mailbox",
  "method",
  "metric",
  "model",
  "module",
  "named",
  "namespace",
  "package",
  "parameter",
  "path",
  "property",
  "symbol",
  "token",
  "unit",
  "url",
  "variable",
]);
/** Comparison of admitted prose only. Never use this for anchor lookup or IR. */
function comparableProse(text: string): string {
  const literal = comparable(text);
  // Numeric/technical/quoted contexts retain their existing exact comparison.
  // This deliberately withholds uncertain typography instead of interpreting
  // opaque identifiers, code, contact details or metric names/units as prose.
  if (
    !actionPattern.test(literal) ||
    /\p{N}|[`"'“”‘’\\/<>\[\]{}=:@_$#|*]/u.test(literal)
  )
    return literal;
  const words = literal.split(" ");
  return words
    .map((word, index) => {
      const token = /^([a-z\u00AD\uFB00-\uFB06]+)([.,;!?]?)$/u.exec(word);
      if (!token || !/[\u00AD\uFB00-\uFB06]/u.test(token[1])) return word;
      const previous = words[index - 1]?.toLowerCase().replace(/[.,;!?]$/u, "");
      if (previous && opaqueProseCues.has(previous)) return word;
      // A discretionary hyphen must have alphabetic neighbors in this same
      // lower-case word. Leading, trailing and consecutive marks remain opaque.
      if (
        /(?<![a-z\uFB00-\uFB06])\u00AD|\u00AD(?![a-z\uFB00-\uFB06])/u.test(
          token[1],
        )
      )
        return word;
      return (
        token[1]
          .replace(/[\uFB00-\uFB06]/gu, (glyph) => proseLigatures[glyph])
          .replace(/\u00AD/gu, "") + token[2]
      );
    })
    .join(" ");
}

function bytes(raw: unknown) {
  let value: string;
  try {
    value = JSON.stringify(raw);
  } catch {
    throw bad("invalid_input");
  }
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 65536)
    throw bad("source_resource_limit");
}
function sourceString(raw: unknown): string {
  if (
    typeof raw !== "string" ||
    raw.includes("\0") ||
    /[\uD800-\uDFFF]/u.test(raw)
  )
    throw bad("invalid_input");
  if (raw.length > 100000) throw bad("source_resource_limit");
  return raw;
}
function engine(source: string) {
  let work = 0;
  const charge = (units = 1) => {
    work += units;
    if (work > INITIAL_FEEDBACK_PLAN_POLICY.limits.plannerWorkUnits)
      throw bad("source_resource_limit");
  };
  charge(source.length);
  let document: ReturnType<typeof buildWritingSupportDocument>;
  try {
    document = buildWritingSupportDocument(source);
  } catch {
    throw bad("source_resource_limit");
  }
  const points = Array.from(source),
    at = new Uint32Array(source.length + 1);
  let cp = 0;
  for (let u = 0; u < source.length;) {
    const width = source.codePointAt(u)! > 0xffff ? 2 : 1;
    at[u] = cp;
    if (width === 2) at[u + 1] = cp;
    u += width;
    at[u] = ++cp;
  }
  const id = new Map(document.anchors.map((a) => [a.span.id, a]));
  const refs = new Map<WritingSourceAnchor, InitialFeedbackSpanRef>();
  const byRef = new Map<string, WritingSourceAnchor>();
  const byComparable = new Map<string, WritingSourceAnchor[]>();
  const key = (r: InitialFeedbackSpanRef) =>
    `${r.start}:${r.end}:${r.textSha256}`;
  for (const a of document.anchors) {
    charge(a.span.text.length);
    const r = {
      start: a.span.start,
      end: a.span.end,
      textSha256: hash(a.span.text),
    };
    refs.set(a, r);
    byRef.set(key(r), a);
    const c = comparable(a.span.text),
      list = byComparable.get(c) ?? [];
    list.push(a);
    byComparable.set(c, list);
  }
  const ref = (a: WritingSourceAnchor) => {
    charge();
    const r = refs.get(a);
    if (!r) throw bad();
    return r;
  };
  const slice = (r: InitialFeedbackSpanRef) => {
    charge(r.end - r.start + 1);
    if (r.end > points.length || r.start >= r.end) throw bad();
    const value = points.slice(r.start, r.end).join("");
    if (hash(value) !== r.textSha256) throw bad();
    return value;
  };
  const anchor = (r: InitialFeedbackSpanRef) => {
    slice(r);
    charge();
    const a = byRef.get(key(r));
    if (!a) throw bad();
    return a;
  };
  const unique = (text: string) => {
    charge(source.length + text.length);
    const start = source.indexOf(text);
    if (!text || start < 0 || source.indexOf(text, start + 1) >= 0) throw bad();
    return {
      start: at[start],
      end: at[start + text.length],
      textSha256: hash(text),
    };
  };
  const original = (text: string) => {
    charge(text.length);
    const a = byComparable.get(comparable(text));
    if (a?.length !== 1) throw bad();
    return a[0];
  };
  return { source, document, id, charge, ref, slice, anchor, unique, original };
}
type Engine = ReturnType<typeof engine>;
type Verb = (typeof INITIAL_FEEDBACK_VERBS)[number];
function variant(c: WritingClause, choice: Verb) {
  const literal = comparable(c.span.text),
    m = actionPattern.exec(literal);
  if (!m) {
    if (choice === "original") return literal;
    throw bad();
  }
  const surface = m[3],
    allowed = new Set([
      surface,
      surface.toLowerCase(),
      surface[0].toUpperCase() + surface.slice(1),
    ]);
  if (!c.negated && c.action.concept === "create")
    for (const v of ["Built", "Created", "Developed"]) {
      allowed.add(v);
      allowed.add(v.toLowerCase());
    }
  if (
    !c.negated &&
    c.action.concept === "improve" &&
    c.direction === "decrease"
  ) {
    allowed.add("Reduced");
    allowed.add("reduced");
  }
  const selected =
    choice === "original"
      ? surface
      : choice === "source_lower"
        ? surface.toLowerCase()
        : choice === "source_title"
          ? surface[0].toUpperCase() + surface.slice(1)
          : choice;
  if (!allowed.has(selected)) throw bad();
  return (
    literal.slice(0, m[0].length - surface.length) +
    selected +
    literal.slice(m[0].length)
  );
}
function terminal(text: string, choice: "as_rendered" | "append_period") {
  if (choice === "as_rendered") return text;
  if (/https?:\/\/|mailto:/iu.test(text) || text.endsWith(".")) throw bad();
  return text + ".";
}
function period(text: string, selected: boolean) {
  return text.replace(/\.$/u, "") + (selected ? "." : "");
}
function roleDisplay(text: string) {
  return text.replace(
    /\b(?:Engineer|Developer|Analyst|Architect|Designer|Scientist)\b/gu,
    (word) => word.toLowerCase(),
  );
}
function unqualified(a: WritingSourceAnchor) {
  if (a.context.kind !== "unqualified_resume_clause") throw bad();
}
function renderExpr(
  e: Engine,
  x: InitialFeedbackTextExpr,
  position: "tip" | "rewrite" | "reasoning" | "summary",
): string {
  e.charge();
  const editorial = x.kind.startsWith("editorial_"),
    clarification = x.kind.startsWith("clarification_");
  if (
    (editorial && position !== "tip" && position !== "reasoning") ||
    (clarification && position !== "tip") ||
    ((x.kind === "role_summary" ||
      x.kind === "compose_explicit_role_contribution") &&
      position !== "summary")
  )
    throw bad();
  let value: string;
  switch (x.kind) {
    case "copy_source": {
      value = e.anchor(x.anchor).span.text;
      break;
    }
    case "normalize_layout": {
      const a = e.anchor(x.anchor);
      value = terminal(
        (x.typography === "basic" ? comparable : comparableProse)(a.span.text),
        x.terminal,
      );
      break;
    }
    case "rewrite_clauses": {
      const a = e.anchor(x.anchor);
      unqualified(a);
      if (
        x.clauses.length !== a.clauses.length ||
        new Set(x.clauses.map((c) => c.sourceIndex)).size !==
          a.clauses.length ||
        x.clauses.some((c) => c.sourceIndex >= a.clauses.length)
      )
        throw bad();
      if (x.clauses.some((c, i) => c.sourceIndex !== i) && !a.reorderable)
        throw bad();
      value = terminal(
        x.clauses
          .map((c) =>
            (x.typography === "basic" ? comparable : comparableProse)(
              variant(a.clauses[c.sourceIndex], c.verb),
            ),
          )
          .join("; "),
        x.terminal,
      );
      break;
    }
    case "role_summary": {
      const a = e.anchor(x.role);
      unqualified(a);
      if (!a.role) throw bad();
      value = terminal(
        comparable(roleDisplay(a.role.title) + " at " + a.role.employer),
        x.terminal,
      );
      break;
    }
    case "compose_explicit_role_contribution": {
      const r = e.anchor(x.role),
        a = e.anchor(x.contribution);
      unqualified(r);
      unqualified(a);
      if (
        !r.role ||
        e.document.anchors.filter((v) => v.role?.employer === r.role!.employer)
          .length !== 1 ||
        a.context.adjacentRoleId !== r.span.id ||
        a.clauses.length !== 1
      )
        throw bad();
      const c = a.clauses[0];
      if (
        c.actor.kind !== "implicit_source_subject" ||
        c.action.concept === "unknown" ||
        !c.object ||
        c.negated ||
        /\s+at\s+([^;]+?)\.?$/iu.exec(c.object.text)?.[1] !== r.role.employer
      )
        throw bad();
      const sentence = variant(c, x.verb);
      if (!actionPattern.test(sentence)) throw bad();
      value = terminal(
        comparable(
          roleDisplay(r.role.title) +
            " who " +
            sentence[0].toLowerCase() +
            sentence.slice(1),
        ),
        x.terminal,
      );
      break;
    }
    case "editorial_fixed":
      value = period(
        INITIAL_FEEDBACK_PLAN_POLICY.editorialTemplates[x.templateIndex],
        x.period,
      );
      break;
    case "editorial_measured": {
      const a = e.anchor(x.anchor);
      if (!a.clauses.some((c) => c.metrics.length)) throw bad();
      value = period(
        INITIAL_FEEDBACK_MEASURED_TEMPLATES[x.templateIndex],
        x.period,
      );
      break;
    }
    case "editorial_object_prefix": {
      const a = e.anchor(x.anchor),
        object = a.clauses[0]?.object?.text
          .replace(/^(?:a|an|the)\s+/iu, "")
          .replace(/\.$/u, "");
      if (!object) throw bad();
      const words = object.split(/\s+/u);
      if (
        words.length < x.wordCount ||
        words
          .slice(0, x.wordCount)
          .some((w) =>
            /\b(?:at|for|with|during|within|in|by|and)\b|\d/iu.test(w),
          )
      )
        throw bad();
      value = period(
        "Clarifies " + words.slice(0, x.wordCount).join(" ") + " wording.",
        x.period,
      );
      break;
    }
    case "clarification_fixed":
      value = period(
        INITIAL_FEEDBACK_PLAN_POLICY.clarificationTemplates[x.templateIndex],
        x.period,
      );
      break;
    case "clarification_question":
      value =
        x.form === "what_verify"
          ? `What ${x.topic} can you verify?`
          : x.form === "what_confirm"
            ? `What ${x.topic} can you confirm?`
            : `Can you verify the ${x.topic}?`;
      break;
  }
  e.charge(value.length);
  if (!value || value.length > 2000) throw bad("source_resource_limit");
  return value;
}
function ordered(indices: number[]) {
  if (indices.some((v, i) => i > 0 && v <= indices[i - 1]))
    throw bad("invalid_input");
}
function candidate(
  e: Engine,
  plan: InitialFeedbackPlan,
): QualitativeSourceProse {
  if (plan.sourceTextSha256 !== e.document.sourceSha256)
    throw bad("invalid_input");
  const prose: QualitativeSourceProse = {
    toneAndStyle: { tips: [] },
    content: { tips: [] },
    structure: { tips: [] },
    skills: { tips: [] },
    writer: { summary: null, bullets: [] },
  };
  for (const category of INITIAL_FEEDBACK_CATEGORIES) {
    ordered(plan[category].map((t) => t.originalIndex));
    for (const t of plan[category])
      prose[category].tips.push({
        type: t.requestedType,
        quote: e.slice(t.quote),
        tip: renderExpr(e, t.title, "tip"),
        explanation: renderExpr(e, t.explanation, "tip"),
      });
  }
  ordered(plan.writer.bullets.map((b) => b.originalIndex));
  if (plan.writer.summary)
    prose.writer.summary = renderExpr(e, plan.writer.summary, "summary");
  for (const b of plan.writer.bullets)
    prose.writer.bullets.push({
      original: e.slice(b.original),
      rewrite: renderExpr(e, b.rewrite, "rewrite"),
      reasoning: renderExpr(e, b.reasoning, "reasoning"),
    });
  bytes(prose);
  const parsed = QualitativeSourceProseSchema.safeParse(prose);
  if (!parsed.success) throw bad();
  return parsed.data;
}
function materialize(
  e: Engine,
  plan: InitialFeedbackPlan,
  prose: QualitativeSourceProse,
  observation: QualitativeSupport,
  originalIndices: boolean,
): InitialFeedbackRender {
  const empty =
    INITIAL_FEEDBACK_CATEGORIES.every((c) => prose[c].tips.length === 0) &&
    prose.writer.summary === null &&
    prose.writer.bullets.length === 0;
  if (empty) throw bad("unsupported_output");
  const asPart = (p: NonNullable<QualitativeSupport["writer"]["summary"]>) => ({
    kind: p.kind,
    state: p.state,
    reason: p.reason,
    textSha256: p.textSha256,
    sourceRefs: p.anchorIds.map((id) => {
      const a = e.id.get(id);
      if (!a) throw bad();
      return e.ref(a);
    }),
  });
  const tips = [],
    mappingTips = [],
    padding = [];
  for (const category of INITIAL_FEEDBACK_CATEGORIES) {
    for (const [i, t] of plan[category].entries()) {
      const recorded = observation.items.find(
        (v) =>
          v.category === category &&
          v.index === (originalIndices ? t.originalIndex : i),
      );
      if (!recorded?.retained) throw bad();
      tips.push({
        category,
        originalIndex: t.originalIndex,
        retainedIndex: i,
        type: recorded.type,
        kind: recorded.kind,
        state: recorded.state,
        reason: recorded.reason,
        quote: t.quote,
        title: asPart(recorded.title),
        explanation: asPart(recorded.explanation),
      });
      mappingTips.push({
        category,
        originalIndex: t.originalIndex,
        retainedIndex: i,
        compatibilityIndex: i,
      });
    }
    for (let i = prose[category].tips.length; i < 3; i++)
      padding.push({
        category,
        compatibilityIndex: i,
        origin: null,
        scope: "compatibility_only",
      });
  }
  const bullets = plan.writer.bullets.map((b, i) => {
    const recorded = observation.writer.bullets.find(
      (v) => v.index === (originalIndices ? b.originalIndex : i),
    );
    if (!recorded?.retained) throw bad();
    return {
      originalIndex: b.originalIndex,
      retainedIndex: i,
      original: b.original,
      rewrite: asPart(recorded.rewrite),
      reasoning: asPart(recorded.reasoning),
    };
  });
  const summary = plan.writer.summary ? observation.writer.summary : null;
  if (plan.writer.summary && summary?.state !== "supported") throw bad();
  const compatibility = {
    toneAndStyle: legacyCategoryFromProse(prose.toneAndStyle),
    content: legacyCategoryFromProse(prose.content),
    structure: legacyCategoryFromProse(prose.structure),
    skills: legacyCategoryFromProse(prose.skills),
    writer: prose.writer,
  };
  const value = {
    schemaVersion: "initial-feedback-render/1.0.0",
    authority: "source_content_only",
    ownedVersionProof: "not_provided",
    sourceTextSha256: e.document.sourceSha256,
    policyVersion: INITIAL_FEEDBACK_PLAN_POLICY_VERSION,
    policySha256: INITIAL_FEEDBACK_PLAN_POLICY_SHA256,
    prose,
    parts: {
      tips,
      writer: { summary: summary ? asPart(summary) : null, bullets },
    },
    mapping: {
      tips: mappingTips,
      bullets: bullets.map((b) => ({
        originalIndex: b.originalIndex,
        retainedIndex: b.retainedIndex,
      })),
      summary: summary ? { retainedIndex: 0 } : null,
      padding,
    },
    compatibility,
  };
  const parsed = InitialFeedbackRenderSchema.safeParse(value);
  if (!parsed.success) throw bad();
  return parsed.data;
}
export function renderInitialFeedbackPlan(
  rawSource: unknown,
  rawPlan: unknown,
): InitialFeedbackRender {
  const source = sourceString(rawSource);
  bytes(rawPlan);
  const parsed = InitialFeedbackPlanSchema.safeParse(rawPlan);
  if (!parsed.success) throw bad("invalid_input");
  const e = engine(source),
    proposed = candidate(e, parsed.data),
    assessed = assessQualitativeProse(proposed, source);
  if (
    assessed.support.status !== "assessed" ||
    assessed.support.items.some((t) => !t.retained) ||
    assessed.support.writer.bullets.some((b) => !b.retained) ||
    (proposed.writer.summary !== null && assessed.prose.writer.summary === null)
  )
    throw bad("unsupported_output");
  return materialize(e, parsed.data, assessed.prose, assessed.support, false);
}

function compileExpression(
  e: Engine,
  text: string,
  position: "tip" | "rewrite" | "reasoning" | "summary",
  anchors: WritingSourceAnchor[],
  cache: Map<string, Map<string, Array<{ sourceIndex: number; verb: Verb }>>>,
): InitialFeedbackTextExpr {
  const attempt = (x: InitialFeedbackTextExpr) => {
    try {
      return renderExpr(e, x, position) === text ? x : null;
    } catch (error) {
      if (
        error instanceof InitialFeedbackPlanError &&
        error.reason !== "source_resource_limit"
      )
        return null;
      throw error;
    }
  };
  if (position === "tip" || position === "reasoning") {
    for (const [
      templateIndex,
      v,
    ] of INITIAL_FEEDBACK_PLAN_POLICY.editorialTemplates.entries())
      for (const period of [false, true]) {
        e.charge(v.length);
        if (v.replace(/\.$/u, "") + (period ? "." : "") === text)
          return { kind: "editorial_fixed", templateIndex, period };
      }
  }
  if (position === "tip") {
    for (const [
      templateIndex,
      v,
    ] of INITIAL_FEEDBACK_PLAN_POLICY.clarificationTemplates.entries())
      for (const period of [false, true]) {
        e.charge(v.length);
        if (v.replace(/\.$/u, "") + (period ? "." : "") === text)
          return { kind: "clarification_fixed", templateIndex, period };
      }
    for (const topic of [
      "outcome",
      "result",
      "context",
      "scope",
      "method",
      "role",
      "contribution",
    ] as const)
      for (const form of [
        "what_verify",
        "what_confirm",
        "can_verify",
      ] as const) {
        const x: InitialFeedbackTextExpr = {
            kind: "clarification_question",
            topic,
            form,
          },
          found = attempt(x);
        if (found) return found;
      }
  }
  for (const a of anchors) {
    e.charge();
    const anchor = e.ref(a);
    if (a.span.text === text) {
      const found = attempt({ kind: "copy_source", anchor });
      if (found) return found;
    }
    for (const typography of ["basic", "admitted_prose"] as const)
      for (const end of ["as_rendered", "append_period"] as const) {
        const found = attempt({
          kind: "normalize_layout",
          anchor,
          typography,
          terminal: end,
        });
        if (found) return found;
      }
    if (position === "tip" || position === "reasoning") {
      for (let templateIndex = 0; templateIndex < 5; templateIndex++)
        for (const period of [false, true]) {
          const found = attempt({
            kind: "editorial_measured",
            anchor,
            templateIndex,
            period,
          });
          if (found) return found;
        }
      for (let wordCount = 1; wordCount <= 4; wordCount++)
        for (const period of [false, true]) {
          const found = attempt({
            kind: "editorial_object_prefix",
            anchor,
            wordCount,
            period,
          });
          if (found) return found;
        }
    }
    if (position === "summary" && a.role)
      for (const end of ["as_rendered", "append_period"] as const) {
        const found = attempt({
          kind: "role_summary",
          role: anchor,
          terminal: end,
        });
        if (found) return found;
      }
    for (const typography of ["basic", "admitted_prose"] as const) {
      const cacheKey = a.span.id + ":" + typography;
      let choices = cache.get(cacheKey);
      if (!choices) {
        choices = new Map();
        for (const [sourceIndex, c] of a.clauses.entries())
          for (const verb of INITIAL_FEEDBACK_VERBS) {
            let value: string;
            try {
              value = (typography === "basic" ? comparable : comparableProse)(
                variant(c, verb),
              );
            } catch (error) {
              if (error instanceof InitialFeedbackPlanError) continue;
              throw error;
            }
            e.charge(value.length);
            const matches = choices.get(value) ?? [];
            if (!matches.some((m) => m.sourceIndex === sourceIndex))
              matches.push({ sourceIndex, verb });
            choices.set(value, matches);
          }
        cache.set(cacheKey, choices);
      }
      for (const end of ["as_rendered", "append_period"] as const) {
        if (end === "append_period" && !text.endsWith(".")) continue;
        const body = end === "append_period" ? text.slice(0, -1) : text,
          pieces = body.split("; ");
        if (pieces.length !== a.clauses.length) continue;
        const used = new Set<number>(),
          clauses: Array<{ sourceIndex: number; verb: Verb }> = [];
        for (const piece of pieces) {
          e.charge(piece.length);
          const match = choices
            .get(piece)
            ?.find((m) => !used.has(m.sourceIndex));
          if (!match) break;
          used.add(match.sourceIndex);
          clauses.push(match);
        }
        if (clauses.length === pieces.length) {
          const found = attempt({
            kind: "rewrite_clauses",
            anchor,
            clauses,
            typography,
            terminal: end,
          });
          if (found) return found;
        }
      }
    }
  }
  if (position === "summary") {
    const roles = new Map(
      anchors.filter((a) => a.role).map((a) => [a.span.id, a]),
    );
    for (const a of anchors) {
      const role = roles.get(a.context.adjacentRoleId ?? "");
      if (!role) continue;
      for (const verb of INITIAL_FEEDBACK_VERBS)
        for (const end of ["as_rendered", "append_period"] as const) {
          const found = attempt({
            kind: "compose_explicit_role_contribution",
            role: e.ref(role),
            contribution: e.ref(a),
            verb,
            terminal: end,
          });
          if (found) return found;
        }
    }
  }
  throw bad();
}
/** Derives the full observation itself; no supplied assessment/authority is accepted. */
export function compileInitialFeedbackPlan(
  rawSource: unknown,
  rawProse: unknown,
): InitialFeedbackCompileResult {
  let observation: QualitativeSupport | null = null;
  try {
    const source = sourceString(rawSource);
    bytes(rawProse);
    const assessed = assessQualitativeProse(rawProse, source);
    observation = assessed.support;
    if (observation.status !== "assessed")
      return {
        status: "unavailable",
        reason:
          observation.reason === "source_resource_limit"
            ? "source_resource_limit"
            : "invalid_input",
        recordedObservation: observation,
      };
    const input = QualitativeSourceProseSchema.safeParse(rawProse);
    if (!input.success) throw bad("invalid_input");
    const e = engine(source),
      cache = new Map<
        string,
        Map<string, Array<{ sourceIndex: number; verb: Verb }>>
      >();
    const anchors = (ids: string[]) => {
      if (ids.length > 16) throw bad("source_resource_limit");
      return ids.map((id) => {
        const a = e.id.get(id);
        if (!a) throw bad();
        return a;
      });
    };
    const plan: InitialFeedbackPlan = {
      schemaVersion: "initial-feedback-plan/1.0.0",
      sourceTextSha256: e.document.sourceSha256,
      policyVersion: INITIAL_FEEDBACK_PLAN_POLICY_VERSION,
      toneAndStyle: [],
      content: [],
      structure: [],
      skills: [],
      writer: { summary: null, bullets: [] },
    };
    for (const recorded of observation.items) {
      if (!recorded.retained) continue;
      const t = input.data[recorded.category].tips[recorded.index];
      if (!t) throw bad();
      plan[recorded.category].push({
        originalIndex: recorded.index,
        requestedType: t.type,
        quote: e.unique(t.quote),
        title: compileExpression(
          e,
          t.tip,
          "tip",
          anchors(recorded.title.anchorIds),
          cache,
        ),
        explanation: compileExpression(
          e,
          t.explanation,
          "tip",
          anchors(recorded.explanation.anchorIds),
          cache,
        ),
      });
    }
    if (observation.writer.summary?.state === "supported") {
      if (input.data.writer.summary === null) throw bad();
      plan.writer.summary = compileExpression(
        e,
        input.data.writer.summary,
        "summary",
        anchors(observation.writer.summary.anchorIds),
        cache,
      );
    }
    for (const recorded of observation.writer.bullets) {
      if (!recorded.retained) continue;
      const b = input.data.writer.bullets[recorded.index];
      if (!b) throw bad();
      plan.writer.bullets.push({
        originalIndex: recorded.index,
        original: e.unique(b.original),
        rewrite: compileExpression(
          e,
          b.rewrite,
          "rewrite",
          anchors(recorded.rewrite.anchorIds),
          cache,
        ),
        reasoning: compileExpression(
          e,
          b.reasoning,
          "reasoning",
          anchors(recorded.reasoning.anchorIds),
          cache,
        ),
      });
    }
    bytes(plan);
    const valid = InitialFeedbackPlanSchema.safeParse(plan);
    if (!valid.success) throw bad();
    const renderedCandidate = candidate(e, valid.data);
    // The core alone may downgrade requested type. Every retained text must stay exact.
    for (const c of INITIAL_FEEDBACK_CATEGORIES)
      for (const [i, t] of renderedCandidate[c].tips.entries())
        t.type = assessed.prose[c].tips[i].type;
    if (!isDeepStrictEqual(renderedCandidate, assessed.prose)) throw bad();
    const rendered = materialize(
      e,
      valid.data,
      assessed.prose,
      observation,
      true,
    );
    return InitialFeedbackCompileResultSchema.parse({
      status: "available",
      plan: valid.data,
      rendered,
      recordedObservation: observation,
    });
  } catch (error) {
    if (error instanceof InitialFeedbackPlanError)
      return {
        status: "unavailable",
        reason: error.reason,
        recordedObservation: observation,
      };
    throw error;
  }
}
