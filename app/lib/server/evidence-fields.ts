import { parseContact } from "./parsing/contact";
import { extractDateStrings } from "./parsing/dates";
import { detectSectionType } from "./parsing/sections";

export const CRITICAL_FIELDS = [
  "name",
  "email",
  "phone",
  "employer",
  "role",
  "dates",
  "education",
  "certification",
] as const;
export type EvidenceField = (typeof CRITICAL_FIELDS)[number];
export type FieldSourceSpan = {
  id: string;
  pageId: string;
  method: "native_text" | "local_ocr";
  text: string;
};
export type EvidenceFieldCandidate = {
  id: string;
  field: EvidenceField;
  value: string;
  evidence: { spanId: string; start: number; end: number }[];
  state: "review_required";
  confidence: { kind: "uncalibrated"; value: null };
};

/** Proposes grounded candidates, never verified facts. No model, truth labels,
 * normalized replacement text or calibrated probability enters this parser. */
export function extractEvidenceFields(
  spans: readonly FieldSourceSpan[],
): EvidenceFieldCandidate[] {
  const candidates: EvidenceFieldCandidate[] = [];
  const add = (
    field: EvidenceField,
    value: string | null,
    span: FieldSourceSpan,
  ) => {
    if (!value || value.length > 500) return;
    const index = span.text.indexOf(value);
    if (
      index < 0 ||
      candidates.some(
        (item) =>
          item.field === field &&
          item.value === value &&
          item.evidence[0].spanId === span.id,
      )
    )
      return;
    const start = Array.from(span.text.slice(0, index)).length;
    candidates.push({
      id: `assertion-${candidates.length + 1}`,
      field,
      value,
      evidence: [
        { spanId: span.id, start, end: start + Array.from(value).length },
      ],
      state: "review_required",
      confidence: { kind: "uncalibrated", value: null },
    });
  };
  // Parse contacts independently per extraction method so disagreements survive.
  for (const method of ["native_text", "local_ocr"] as const) {
    const source = spans.filter((span) => span.method === method);
    const contact = parseContact(
      source
        .filter(
          (span) =>
            !/\b(?:profile|resume|portfolio|engineering|summary|experience|education|skills|certifications|engineer|developer|manager|architect)\b/iu.test(
              span.text,
            ),
        )
        .map((span) => span.text),
    );
    for (const field of ["name", "email", "phone"] as const) {
      for (const span of source) {
        if (field === "name") {
          if (contact.name === span.text.trim()) add(field, contact.name, span);
        } else {
          add(field, parseContact([span.text])[field], span);
        }
      }
    }
    let section: string | null = null;
    for (const [index, span] of source.entries()) {
      const line = span.text.trim();
      const parts = line
        .split(/\s+(?:and|&)\s+|\s*\/\s*/iu)
        .map(detectSectionType);
      const heading =
        detectSectionType(line) ??
        (parts.includes("experience") ? "experience" : null);
      if (heading) section = heading;
      const labelled = line.match(
        /^(name|email|phone|employer|company|organization|role|job title|dates|education|certification)\s*:\s*(\S.*)$/iu,
      );
      if (labelled) {
        const key = labelled[1].toLowerCase();
        const field =
          key === "company" || key === "organization"
            ? "employer"
            : key === "job title"
              ? "role"
              : (key as EvidenceField);
        add(field, labelled[2].trim(), span);
      }
      for (const dates of extractDateStrings(line)) {
        if (
          section === "experience" ||
          /^(?:dates|employment)\s*:/iu.test(line)
        )
          add("dates", dates, span);
      }
      if (
        /^(?:education\s*:\s*)?(?:BSc|BTech|B\.Sc\.?|B\.Tech\.?|MSc|MTech|BA|BS|MS|MBA|Bachelor(?:'s)?|Master(?:'s)?|Doctor(?:ate)?|PhD|Diploma)\b/iu.test(
          line,
        )
      ) {
        add("education", line.replace(/^education\s*:\s*/iu, ""), span);
      }
      if (/\b(?:certificat(?:e|ion)|certified)\b/iu.test(line) && !heading) {
        add("certification", line.replace(/^certification\s*:\s*/iu, ""), span);
      }
      // A dated organization line supplies local employment context even when
      // the preceding role crosses a page break. Never join source offsets.
      const following = source[index + 1];
      if (
        section === "experience" &&
        !heading &&
        !labelled &&
        following?.pageId === span.pageId &&
        extractDateStrings(following.text).length &&
        /\b(?:Systems|Technologies|Solutions|Labs|Studio|Infrastructure|Corporation|Ltd\.?|LLC|Inc\.?)$/iu.test(
          line,
        ) &&
        line.length <= 100 &&
        !/[!?]$/u.test(line)
      ) {
        add("employer", line, span);
      }
      if (
        section === "experience" &&
        !heading &&
        !labelled &&
        /\b(?:engineer|developer|architect|designer|analyst|manager|consultant|administrator|specialist)\b/iu.test(
          line,
        ) &&
        !/[.!?]$/u.test(line) &&
        line.length <= 100
      ) {
        // A delimited header can cite distinct role, employer and date
        // candidates without treating their concatenation as a job title.
        const dates = extractDateStrings(line);
        let header = line;
        for (const date of dates) header = header.replace(date, "");
        header = header.replace(/^[\s|,;–—-]+|[\s|,;–—-]+$/gu, "");
        const explicitSeparator = /[|•]|\s+at\s+/iu.test(header);
        const segments = (
          explicitSeparator
            ? header.split(/\s*[|•]\s*|\s+at\s+/iu)
            : dates.length
              ? header.split(/\s*,\s*|\s+[–—]\s+/u)
              : [header]
        ).filter(Boolean);
        const rolePattern =
          /\b(?:engineer|developer|architect|designer|analyst|manager|consultant|administrator|specialist)\b/iu;
        const roleSegments = segments.filter((segment) =>
          rolePattern.test(segment),
        );
        const role = roleSegments.length === 1 ? roleSegments[0] : header;
        add("role", role, span);
        if (
          segments.length === 2 &&
          roleSegments.length === 1 &&
          (explicitSeparator || segments[1] === role)
        ) {
          const employer = segments.find((segment) => segment !== role)!;
          if (employer && !/[.!?]$/u.test(employer))
            add("employer", employer, span);
        }
        for (const adjacent of [source[index - 1], source[index + 1]]) {
          if (
            adjacent &&
            adjacent.pageId === span.pageId &&
            !detectSectionType(adjacent.text.trim()) &&
            !/\b(?:experience|employment|projects|engineer|developer|manager|architect|certificat(?:e|ion))\b/iu.test(
              adjacent.text,
            ) &&
            !extractDateStrings(adjacent.text).length &&
            adjacent.text.trim().length <= 100 &&
            /\b(?:Co\.?|Company|Systems|Technologies|Solutions|Labs|Studio|Infrastructure|Corporation|Ltd\.?|LLC|Inc\.?)$/iu.test(
              adjacent.text.trim(),
            ) &&
            !/[.!?]$/u.test(adjacent.text.trim())
          )
            add("employer", adjacent.text.trim(), adjacent);
        }
      }
    }
  }
  return candidates;
}
