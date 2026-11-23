import { createHash } from "node:crypto";

export const JOB_ALIAS_POLICY_VERSION = "jd-local-aliases/1.0.0" as const;
const boundaryVersion = "unicode-identifier-and-dot/1.0.1";
// A narrow local engineering policy, not an adopted external taxonomy.
const lexicon = Object.freeze([
  Object.freeze({
    conceptId: "local-software:javascript",
    canonicalValue: "JavaScript",
    aliases: Object.freeze(["JS"]),
  }),
  Object.freeze({
    conceptId: "local-software:postgresql",
    canonicalValue: "PostgreSQL",
    aliases: Object.freeze(["Postgres"]),
  }),
]);
export const JOB_ALIAS_LEXICON_SHA256 = createHash("sha256")
  .update(
    JSON.stringify({
      policy: JOB_ALIAS_POLICY_VERSION,
      boundaryVersion,
      lexicon,
    }),
  )
  .digest("hex");

export type JobAliasMapping = {
  kind: "exact" | "alias" | "unmapped";
  policyVersion: typeof JOB_ALIAS_POLICY_VERSION;
  conceptId: string | null;
  canonicalValue: string | null;
  // A grouping proposal only. This model cannot grant numeric credit.
  prospectiveCreditGroup: string | null;
};
export type JobAliasMention = {
  value: string;
  mapping: JobAliasMapping;
  evidence: { start: number; end: number; quote: string };
};

export function resolveJobAlias(value: string): JobAliasMapping {
  const literal = value.toLowerCase();
  for (const entry of lexicon) {
    const exact = entry.canonicalValue.toLowerCase() === literal;
    if (exact || entry.aliases.some((alias) => alias.toLowerCase() === literal))
      return {
        kind: exact ? "exact" : "alias",
        policyVersion: JOB_ALIAS_POLICY_VERSION,
        conceptId: entry.conceptId,
        canonicalValue: entry.canonicalValue,
        prospectiveCreditGroup: createHash("sha256")
          .update(`${JOB_ALIAS_POLICY_VERSION}:${entry.conceptId}`)
          .digest("hex"),
      };
  }
  return {
    kind: "unmapped",
    policyVersion: JOB_ALIAS_POLICY_VERSION,
    conceptId: null,
    canonicalValue: null,
    prospectiveCreditGroup: null,
  };
}

export function discoverJobAliasMentions(text: string): JobAliasMention[] {
  if (text.length > 20000) throw new Error("JD_ALIAS_INPUT_LIMIT");
  const offsets = new Map<number, number>();
  let utf16 = 0,
    codepoint = 0;
  for (const char of text) {
    offsets.set(utf16, codepoint++);
    utf16 += char.length;
  }
  offsets.set(utf16, codepoint);
  const results: JobAliasMention[] = [];
  const pattern =
    /(?<![\p{L}\p{N}\p{M}_$])(?:JavaScript|PostgreSQL|Postgres|JS)(?![\p{L}\p{N}\p{M}_$])/giu;
  for (const match of text.matchAll(pattern)) {
    const begin = match.index,
      end = begin + match[0].length;
    const following = text.codePointAt(end + 1);
    // Node.js, file.js and JS.config are qualified identifiers, not JS mentions.
    if (
      text[begin - 1] === "." ||
      (text[end] === "." &&
        following !== undefined &&
        /[\p{L}\p{N}\p{M}_$]/u.test(String.fromCodePoint(following)))
    )
      continue;
    if (results.length >= 300) throw new Error("JD_ALIAS_MENTION_LIMIT");
    results.push({
      value: match[0],
      mapping: resolveJobAlias(match[0]),
      evidence: {
        start: offsets.get(begin)!,
        end: offsets.get(end)!,
        quote: match[0],
      },
    });
  }
  return results;
}
