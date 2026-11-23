import process from "node:process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const expectedRuntime = Object.freeze({
  node: "v22.23.4",
  unicode: "17.0",
  icu: "78.3",
  v8: "12.4.254.21-node.57",
});
const runtime = {
  node: process.version,
  unicode: process.versions.unicode,
  icu: process.versions.icu,
  v8: process.versions.v8,
};
if (
  Object.keys(expectedRuntime).some(
    (key) => runtime[key] !== expectedRuntime[key],
  )
)
  throw Error("JD_CLAUSE_CHARACTER_RUNTIME_UNSUPPORTED");
const args = process.argv.slice(2);
if (args.length !== 1 || !["--write", "--check"].includes(args[0]))
  throw Error("Use exactly --write or --check");
const target = new URL(
  "../app/lib/jd-clause-order-character-profile.json",
  import.meta.url,
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const jsonHash = (value) => hash(JSON.stringify(value));
const rules = {
  scalarUniverse: "U+0000..U+10FFFF excluding U+D800..U+DFFF",
  letter: "ECMAScript /^\\p{L}$/u",
  letterOrMark: "ECMAScript /^[\\p{L}\\p{M}]$/u",
  regexWordIu: "ECMAScript /^\\w$/iu",
  asciiFold: "Non-ASCII scalars equivalent to one ASCII word scalar under /iu",
  asciiCanonical: "Lowercase a-z, digits 0-9 and underscore",
  offsets: "Unicode codepoints; UTF16 size limits remain separate",
  letterSkeleton: "Per L/M scalar: NFD then keep L; omit identity mappings",
};
const data = {
  letterRanges: [],
  letterOrMarkRanges: [],
  regexWordIuRanges: [],
  nonAsciiToAsciiSimpleFoldExceptions: [],
  letterSkeletonMappings: [],
};
const counts = {
  letter: 0,
  letterOrMark: 0,
  regexWordIu: 0,
  nonAsciiToAsciiSimpleFoldExceptions: 0,
  letterSkeletonMappings: 0,
  letterSkeletonDeletions: 0,
};
const properties = [
  ["letterRanges", "letter", /^\p{L}$/u],
  ["letterOrMarkRanges", "letterOrMark", /^[\p{L}\p{M}]$/u],
  ["regexWordIuRanges", "regexWordIu", /^\w$/iu],
];
const asciiWord = [..."abcdefghijklmnopqrstuvwxyz0123456789_"].map((value) => ({
  codepoint: value.codePointAt(0),
  pattern: new RegExp(`^${value}$`, "iu"),
}));
function appendRange(ranges, point) {
  const previous = ranges.at(-1);
  if (previous && previous[1] + 1 === point) previous[1] = point;
  else ranges.push([point, point]);
}
const start = performance.now();
let scalarCount = 0;
for (let point = 0; point <= 0x10ffff; point++) {
  if (point >= 0xd800 && point <= 0xdfff) continue;
  if ((point & 4095) === 0 && performance.now() - start > 20000)
    throw Error("JD_CLAUSE_CHARACTER_GENERATION_DEADLINE");
  scalarCount++;
  const scalar = String.fromCodePoint(point);
  for (const [ranges, count, pattern] of properties) {
    if (!pattern.test(scalar)) continue;
    appendRange(data[ranges], point);
    counts[count]++;
  }
  if (/^[\p{L}\p{M}]$/u.test(scalar)) {
    const letters = Array.from(scalar.normalize("NFD"))
      .filter((value) => /^\p{L}$/u.test(value))
      .map((value) => value.codePointAt(0));
    if (letters.length !== 1 || letters[0] !== point) {
      data.letterSkeletonMappings.push([point, letters]);
      counts.letterSkeletonMappings++;
      if (letters.length === 0) counts.letterSkeletonDeletions++;
    }
  }
  if (point > 127 && /^\w$/iu.test(scalar)) {
    const matches = asciiWord.filter(({ pattern }) => pattern.test(scalar));
    if (matches.length !== 1)
      throw Error("JD_CLAUSE_CHARACTER_ASCII_FOLD_NOT_UNIQUE");
    data.nonAsciiToAsciiSimpleFoldExceptions.push([
      point,
      matches[0].codepoint,
    ]);
    counts.nonAsciiToAsciiSimpleFoldExceptions++;
  }
}
if (scalarCount !== 0x110000 - 0x800)
  throw Error("JD_CLAUSE_CHARACTER_SCALAR_COUNT");
for (const [ranges, count] of properties) {
  let previous = -2;
  let members = 0;
  for (const [first, last] of data[ranges]) {
    if (
      first <= previous + 1 ||
      first > last ||
      (first <= 0xdfff && last >= 0xd800)
    )
      throw Error("JD_CLAUSE_CHARACTER_RANGE_INVARIANT");
    previous = last;
    members += last - first + 1;
  }
  if (members !== counts[count])
    throw Error("JD_CLAUSE_CHARACTER_MEMBER_COUNT");
}
const profile = {
  schemaVersion: "jd-clause-order-character-profile/1.1.0",
  generator: {
    path: "scripts/generate-jd-clause-order-character-profile.mjs",
    sha256: hash(readFileSync(new URL(import.meta.url))),
  },
  runtime,
  rules,
  rulesSha256: jsonHash(rules),
  scalarCount,
  counts,
  rangeCounts: {
    letter: data.letterRanges.length,
    letterOrMark: data.letterOrMarkRanges.length,
    regexWordIu: data.regexWordIuRanges.length,
  },
  dataSha256: jsonHash(data),
  data,
};
const skeletonMappings = new Map(data.letterSkeletonMappings);
const skeletonKey = (input) =>
  Array.from(input, (value) => {
    const point = value.codePointAt(0);
    const mapped = skeletonMappings.get(point);
    return mapped === undefined ? value : String.fromCodePoint(...mapped);
  })
    .join("")
    .trim()
    .replace(/\s+/gu, " ")
    .replace(/\.$/u, "");
const vectors = [
  {
    kind: "canonical_accent",
    inputs: ["café", "cafe\u0301"],
    expected: "cafe",
  },
  {
    kind: "hangul",
    inputs: ["한", "\u1112\u1161\u11ab"],
    expected: "\u1112\u1161\u11ab",
  },
  { kind: "conservative_accent", inputs: ["café", "cafè"], expected: "cafe" },
];
for (const vector of vectors) {
  if (vector.inputs.some((input) => skeletonKey(input) !== vector.expected))
    throw Error("JD_CLAUSE_CHARACTER_SKELETON_VECTOR");
}
const rendered =
  JSON.stringify(profile, null, 2)
    .replace(
      /\[\n\s+((?:\d+,\n\s+)*\d+)\n\s+\]/gu,
      (_, values) => "[" + values.replace(/\s+/gu, " ") + "]",
    )
    .replace(/\[\n\s+(\d+),\n\s+(\[[^\n]*\])\n\s+\]/gu, "[$1, $2]") + "\n";
if (args[0] === "--write") writeFileSync(target, rendered);
else if (readFileSync(target, "utf8") !== rendered)
  throw Error("JD_CLAUSE_CHARACTER_ARTIFACT_DRIFT");
console.log(
  JSON.stringify({
    mode: args[0],
    runtime,
    scalarCount,
    counts,
    rangeCounts: profile.rangeCounts,
    generatorSha256: profile.generator.sha256,
    rulesSha256: profile.rulesSha256,
    dataSha256: profile.dataSha256,
    artifactSha256: hash(rendered),
    skeletonVectors: vectors,
  }),
);
