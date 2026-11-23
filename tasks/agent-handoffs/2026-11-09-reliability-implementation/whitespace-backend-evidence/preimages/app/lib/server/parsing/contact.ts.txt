import { detectSectionType } from "./sections";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/iu;
const URL_PATTERN =
  /\b(?:(?:https?:\/\/|www\.)[^\s,;|]+|(?:linkedin|github)\.com\/[^\s,;|]+)/giu;
const PHONE_CANDIDATE_PATTERN =
  /(?:\+|00)?[\d(][\d\s()./\-–—]{5,}\d(?:\s*(?:x|ext(?:ension)?\.?)\s*\d{1,6})?/giu;
const NAME_WORD_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}'’.-]*$/u;
const NAME_PARTICLES = new Set([
  "al",
  "bin",
  "da",
  "de",
  "del",
  "der",
  "di",
  "dos",
  "la",
  "le",
  "van",
  "von",
]);

const COUNTRY_NAMES = new Set(
  [
    "argentina",
    "australia",
    "austria",
    "belgium",
    "brasil",
    "brazil",
    "canada",
    "chile",
    "china",
    "colombia",
    "deutschland",
    "egypt",
    "espana",
    "france",
    "germany",
    "ghana",
    "hong kong",
    "india",
    "indonesia",
    "ireland",
    "italia",
    "italy",
    "japan",
    "kenya",
    "malaysia",
    "mexico",
    "netherlands",
    "new zealand",
    "nigeria",
    "norway",
    "pakistan",
    "peru",
    "philippines",
    "poland",
    "portugal",
    "republic of korea",
    "singapore",
    "south africa",
    "south korea",
    "spain",
    "suisse",
    "sweden",
    "switzerland",
    "taiwan",
    "thailand",
    "turkiye",
    "turkey",
    "uae",
    "uk",
    "united arab emirates",
    "united kingdom",
    "united states",
    "uruguay",
    "us",
    "usa",
    "vietnam",
  ].map(normalizeWords),
);

export function parseContact(lines: readonly string[]): ParseViewContact {
  const text = lines.join("\n");
  const email = pickFirstMatch(lines, EMAIL_PATTERN);
  const phone = findPhone(lines);
  const name = detectName(lines);
  const location = detectLocation(lines);
  const links = uniqueLinks(
    Array.from(text.matchAll(URL_PATTERN), (match) => match[0]),
  );

  return { name, email, phone, links, location };
}

export function lineHasContactSignal(line: string): boolean {
  return EMAIL_PATTERN.test(line) || findPhone([line]) !== null;
}

function pickFirstMatch(
  lines: readonly string[],
  pattern: RegExp,
): string | null {
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function findPhone(lines: readonly string[]): string | null {
  for (const line of lines) {
    PHONE_CANDIDATE_PATTERN.lastIndex = 0;
    for (const match of line.matchAll(PHONE_CANDIDATE_PATTERN)) {
      const candidate = match[0].trim();
      if (isPlausiblePhone(candidate)) return candidate;
    }
  }
  return null;
}

function isPlausiblePhone(candidate: string): boolean {
  const withoutExtension = candidate.replace(
    /\s*(?:x|ext(?:ension)?\.?)\s*\d{1,6}$/iu,
    "",
  );
  const digits = withoutExtension.replace(/\D/gu, "");
  if (digits.length < 7 || digits.length > 15) return false;

  if (/^(?:19|20)\d{2}\s*[-–—]\s*(?:19|20)\d{2}$/u.test(candidate)) {
    return false;
  }
  if (
    /^(?:0?[1-9]|1[0-2])[./-](?:19|20)\d{2}\s*[-–—]\s*(?:0?[1-9]|1[0-2])[./-](?:19|20)\d{2}$/u.test(
      candidate,
    )
  ) {
    return false;
  }

  const hasInternationalPrefix = /^(?:\+|00)/u.test(candidate);
  const hasGrouping = /[\s()./-]/u.test(candidate);
  return hasInternationalPrefix || hasGrouping || digits.length >= 10;
}

function detectName(lines: readonly string[]): string | null {
  for (const line of lines.slice(0, 10)) {
    const trimmed = line.trim();
    if (!trimmed || detectSectionType(trimmed)) continue;
    if (EMAIL_PATTERN.test(trimmed) || /\d|[,|•]/u.test(trimmed)) continue;

    const words = trimmed.split(/\s+/u);
    if (words.length < 2 || words.length > 6) continue;
    if (!words.every((word) => NAME_WORD_PATTERN.test(word))) continue;

    const first = words[0];
    const last = words[words.length - 1];
    if (!startsWithUppercaseLetter(first) || !startsWithUppercaseLetter(last)) {
      continue;
    }
    if (
      !words.slice(1, -1).every((word) => {
        return (
          startsWithUppercaseLetter(word) ||
          NAME_PARTICLES.has(normalizeWords(word))
        );
      })
    ) {
      continue;
    }

    return trimmed;
  }
  return null;
}

function startsWithUppercaseLetter(word: string): boolean {
  const first = Array.from(word)[0];
  return (
    first.toLocaleUpperCase() === first && first.toLocaleLowerCase() !== first
  );
}

function detectLocation(lines: readonly string[]): string | null {
  for (const line of lines.slice(0, 15)) {
    const candidates = line.split(/\s*(?:\||•|·)\s*/u);
    for (const value of candidates) {
      const candidate = value
        .replace(/^\s*(?:location|based in|address)\s*:\s*/iu, "")
        .trim();
      if (isLocationCandidate(candidate)) return candidate;
    }
  }
  return null;
}

function isLocationCandidate(candidate: string): boolean {
  if (!candidate || candidate.length > 100) return false;
  if (detectSectionType(candidate)) return false;
  if (EMAIL_PATTERN.test(candidate) || /https?:\/\//iu.test(candidate)) {
    return false;
  }
  if (!/^[\p{L}\p{M}\d .,'’\-]+$/u.test(candidate)) return false;

  const normalized = normalizeWords(candidate);
  if (normalized === "remote" || COUNTRY_NAMES.has(normalized)) return true;

  const parts = candidate.split(",").map((part) => part.trim());
  if (parts.length < 2 || parts.some((part) => !part)) return false;

  const finalPart = normalizeWords(parts[parts.length - 1]);
  if (COUNTRY_NAMES.has(finalPart)) return true;

  return /^[\p{Lu}]{2,3}(?:\s+\d{4,6})?$/u.test(parts[parts.length - 1]);
}

function uniqueLinks(links: readonly string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const link of links) {
    const cleaned = link.replace(/[).,;]+$/u, "");
    const key = cleaned.toLocaleLowerCase("en");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(cleaned);
  }
  return output;
}

function normalizeWords(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/\s+/gu, " ")
    .trim();
}
