import { createHash } from "node:crypto";
import { z } from "zod";
import policy from "../jd-clause-order-decision-policy.json";
import profile from "../jd-clause-order-character-profile.json";
import { validateRequirementRelationshipContext } from "./requirement-relationship-context";
import { JdClauseOrderDraftSchema } from "./jd-clause-order-drafting";
import { TypedAuthoringError } from "./typed-authoring-contract";
const sha = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const ranges = z.array(z.tuple([z.number().int(), z.number().int()]));
const letter = ranges.parse(profile.data.letterRanges),
  lm = ranges.parse(profile.data.letterOrMarkRanges),
  word = ranges.parse(profile.data.regexWordIuRanges);
const skeleton = new Map(
  z
    .array(z.tuple([z.number().int(), z.array(z.number().int())]))
    .parse(profile.data.letterSkeletonMappings),
);
const folds = new Map(
  z
    .array(z.tuple([z.number().int(), z.number().int()]))
    .parse(profile.data.nonAsciiToAsciiSimpleFoldExceptions),
);
const whitespace = new Set<number>(
  policy.body.writerScope.whitespaceCodepoints,
);
const forbidden = new Set<string>(policy.body.writerScope.forbiddenTokens);
const scope = policy.body.writerScope;
const neutral = new RegExp(scope.neutralHeadingPattern, "iu"),
  role = new RegExp(
    `^(${scope.roleTitleSource})\\s+at\\s+([^;\\n]+?)\\.?$`,
    "iu",
  ),
  contribution = new RegExp(scope.contributionClausePattern, "u");
const fail: () => never = () => {
  throw new TypedAuthoringError("writing_support_rejected");
};
function inRanges(cp: number, table: readonly [number, number][]) {
  let low = 0,
    high = table.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1,
      [first, last] = table[mid];
    if (cp < first) high = mid - 1;
    else if (cp > last) low = mid + 1;
    else return true;
  }
  return false;
}
function metadata(text: string) {
  let result = "",
    prior = false;
  for (const c of text) {
    if (whitespace.has(c.codePointAt(0)!)) {
      if (!prior) result += " ";
      prior = true;
    } else {
      result += c;
      prior = false;
    }
  }
  return result.trim();
}
function forbiddenWord(text: string) {
  let token = "";
  for (const c of text) {
    const cp = c.codePointAt(0)!;
    if (inRanges(cp, word)) {
      const folded = folds.get(cp) ?? (cp >= 65 && cp <= 90 ? cp + 32 : cp);
      token += String.fromCodePoint(folded);
    } else {
      if (forbidden.has(token)) return true;
      token = "";
    }
  }
  return forbidden.has(token);
}
function closed(text: string) {
  if (
    text !== text.trim() ||
    text.length < 1 ||
    text.length > policy.body.limits.factUtf16 ||
    /[\r\n0-9"'`“”‘’]/u.test(text) ||
    forbiddenWord(text)
  )
    return false;
  const body = text.endsWith(".") ? text.slice(0, -1) : text,
    parts = body.split("; ");
  return (
    parts.length >= 1 &&
    parts.length <= 2 &&
    parts.every(
      (p) => !/[;.!?:]/u.test(p) && p.trim() === p && contribution.test(p),
    )
  );
}
function roleHeading(raw: string) {
  // The raw IR role grammar must admit the line before metadata whitespace is collapsed.
  if (!role.test(raw)) return false;
  const normalized = metadata(raw),
    match = role.exec(normalized);
  if (!match || forbiddenWord(normalized)) return false;
  const employer = match[2];
  if (employer.length < 1 || employer.length > scope.employerUtf16)
    return false;
  const points = Array.from(employer);
  return (
    inRanges(points[0].codePointAt(0)!, letter) &&
    points.every(
      (c) => inRanges(c.codePointAt(0)!, lm) || c === " " || c === "-",
    )
  );
}
function key(text: string) {
  let value = "";
  for (const c of text) {
    const cp = c.codePointAt(0)!,
      mapped = skeleton.get(cp);
    value +=
      inRanges(cp, lm) && mapped !== undefined
        ? String.fromCodePoint(...mapped)
        : c;
  }
  return metadata(value).replace(/\.$/u, "");
}
/** Additional closed Native-writer scope only. It never substitutes for the owned draft proof. */
export function assertJdClauseOrderWriterScope(
  rawContext: unknown,
  expected: { analysisId: string; ownerId: string },
  rawDraft: unknown,
): void {
  try {
    if (
      sha(policy.body) !== policy.sha256 ||
      profile.schemaVersion !== policy.body.characterProfile.schemaVersion ||
      profile.dataSha256 !== policy.body.characterProfile.dataSha256 ||
      profile.rulesSha256 !== policy.body.characterProfile.rulesSha256 ||
      sha(profile.data) !== profile.dataSha256 ||
      sha(profile.rules) !== profile.rulesSha256
    )
      throw new TypedAuthoringError("unavailable");
    const draft = JdClauseOrderDraftSchema.parse(rawDraft),
      context = validateRequirementRelationshipContext(
        rawContext,
        expected.analysisId,
        expected.ownerId,
        {
          canonicalVersionId: draft.selection.canonicalVersionId,
          requirementVersionId: draft.selection.requirementVersionId,
        },
      );
    const fact = context.canonical.content.facts.find(
      (f) => f.id === draft.target.factId,
    );
    if (!fact || fact.value !== draft.before) fail();
    let locations = 0;
    if (
      context.canonical.content.contactFactIds.includes(fact.id) ||
      context.canonical.content.sections.some((s) =>
        s.factIds.includes(fact.id),
      )
    )
      fail();
    for (const section of context.canonical.content.sections)
      for (const entry of section.entries) {
        if (entry.factIds.includes(fact.id)) {
          locations++;
          if (
            section.id !== draft.target.sectionId ||
            entry.id !== draft.target.entryId ||
            draft.target.bulletId !== null
          )
            fail();
        }
        for (const bullet of entry.bullets)
          if (bullet.factIds.includes(fact.id)) {
            locations++;
            if (
              section.id !== draft.target.sectionId ||
              entry.id !== draft.target.entryId ||
              bullet.id !== draft.target.bulletId ||
              bullet.factIds.length !== 1 ||
              bullet.factIds[0] !== fact.id
            )
              fail();
          }
      }
    if (locations !== 1) fail();
    const env = context.attempt.envelope,
      pages = env.nativeSource.pages;
    if (context.sourceMetadata.pageCount !== pages.length) fail();
    const streams = pages.map(
      (p) =>
        env.ocrSource?.pages.find((o) => o.pageNumber === p.pageNumber)?.text ??
        p.text,
    );
    if (streams.some((t) => !t.trim())) fail();
    const text = streams.join("\n\n");
    if (text.length > policy.body.limits.sourceUtf16) fail();
    const targetKey = key(fact.value);
    let matches = 0,
      nonblank = 0,
      previousContribution: string | null = null;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) {
        previousContribution = null;
        continue;
      }
      if (++nonblank > policy.body.limits.nonblankAnchors) fail();
      if (neutral.test(metadata(line))) {
        previousContribution = null;
        continue;
      }
      if (roleHeading(line)) {
        previousContribution = null;
        continue;
      }
      if (!closed(line)) fail();
      if (
        previousContribution !== null &&
        !previousContribution.endsWith(".") &&
        /^(?:built|created|developed)(?= )/u.test(line)
      )
        fail();
      if (key(line) === targetKey) matches++;
      previousContribution = line;
    }
    if (matches !== 1) fail();
  } catch (error) {
    if (error instanceof TypedAuthoringError) throw error;
    fail();
  }
}
