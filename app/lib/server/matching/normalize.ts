// Shared by the JD and the resume so neither side matches on rules the other skipped.
// shortcut: rule-based English inflection, not a full lemmatizer; upgrade only with a version bump.
export const NORMALIZER_VERSION = "match-normalizer/1.0.0";

export interface Token {
  /** Stemmed, lower-case form used for matching. */
  token: string;
  /** Original text as written. */
  raw: string;
  start: number;
  end: number;
}

// Words and tech names that must survive intact: c++, c#, node.js, .net.
const WORD = /\.?[\p{L}\p{N}][\p{L}\p{N}]*(?:[+#]+|(?:\.[\p{L}\p{N}]+)+)?/gu;
const IRREGULAR: Record<string, string> = {
  built: "build",
  led: "lead",
  ran: "run",
  wrote: "write",
  written: "write",
  made: "make",
  drove: "drive",
  driven: "drive",
  grew: "grow",
  taught: "teach",
  data: "data",
  analyses: "analysis",
  analysis: "analysis",
};
const SUFFIXES: readonly (readonly [string, string])[] = [
  ["ational", "ate"],
  ["ations", ""],
  ["ation", ""],
  ["ments", ""],
  ["ment", ""],
  ["ities", "ity"],
  ["ings", ""],
  ["ing", ""],
  ["ies", "y"],
  ["ied", "y"],
  ["ers", ""],
  ["er", ""],
  ["ed", ""],
  ["es", ""],
  ["s", ""],
];

/** Stem one lower-case word. Tokens with symbols (c++, node.js) are never altered. */
export function stem(word: string): string {
  // Repeat until stable so engineering -> engineer -> engin matches engineer -> engin.
  let current = word;
  for (let pass = 0; pass < 3; pass++) {
    const next = stemOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function stemOnce(word: string): string {
  if (IRREGULAR[word]) return IRREGULAR[word];
  if (!/^[a-z]+$/.test(word) || word.length < 4) return word;
  for (const [suffix, replacement] of SUFFIXES) {
    if (!word.endsWith(suffix)) continue;
    let base = word.slice(0, -suffix.length);
    if (base.length < 3) continue;
    // Doubled consonant from -ing/-ed (mapping -> mapp -> map).
    if (/(ing|ed|er)$/.test(suffix) && /([^aeiouls])\1$/.test(base))
      base = base.slice(0, -1);
    base += replacement;
    // Trailing silent "e" so design = designed = designing.
    return base.endsWith("e") && base.length > 3 ? base.slice(0, -1) : base;
  }
  return word.endsWith("e") && word.length > 4 ? word.slice(0, -1) : word;
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.normalize("NFKC").matchAll(WORD)) {
    const raw = match[0];
    const lower = raw.toLowerCase().replace(/^\.(?!net$)/, "");
    tokens.push({
      token: stem(lower.replace(/\.$/, "")),
      raw,
      start: match.index,
      end: match.index + raw.length,
    });
  }
  return tokens;
}

export function normalizeTerm(text: string): string {
  return tokenize(text)
    .map((t) => t.token)
    .join(" ");
}
