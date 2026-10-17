import { parseContact } from "./parsing/contact";
import { extractDateStrings } from "./parsing/dates";
import { detectSectionType, normalizeHeading } from "./parsing/sections";

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

const ROLE_WORD =
  /\b(?:engineer|developer|architect|designer|analyst|manager|consultant|administrator|specialist|scientist|lead|director|tester|technician|officer|coordinator|researcher|fellow|intern|programmer|product owner|SRE|SDE|SDET)\b/iu;
const ACTION_START =
  /^(?:[-*•]\s*|I\b|we\b|built\b|worked\b|helped\b|led\b|developed\b|implemented\b|managed\b|supported\b|collaborated\b|delivered\b|responsible\b|maintained\b|improved\b|optimized\b|created\b|designed\b|automated\b)/iu;
const FIELD_LABELS: Record<string, EvidenceField> = {
  name: "name",
  "full name": "name",
  candidate: "name",
  "candidate name": "name",
  email: "email",
  phone: "phone",
  employer: "employer",
  "employer name": "employer",
  company: "employer",
  "company name": "employer",
  organization: "employer",
  organisation: "employer",
  role: "role",
  "job title": "role",
  "job role": "role",
  title: "role",
  position: "role",
  dates: "dates",
  "employment dates": "dates",
  "employment period": "dates",
  tenure: "dates",
  period: "dates",
  education: "education",
  degree: "education",
  qualification: "education",
  qualifications: "education",
  certification: "certification",
  certificate: "certification",
  certifications: "certification",
  credential: "certification",
  license: "certification",
};
const LABEL_PATTERN = new RegExp(
  `(?:^|[|;]\\s*)(${Object.keys(FIELD_LABELS)
    .sort((a, b) => b.length - a.length)
    .join("|")})\\s*:\\s*`,
  "giu",
);
const DEGREE =
  /\b(?:[BM]\.?\s*(?:Sc|Tech|Eng|E|A|S|CA|BA|Com|FA|Arch)\.?|MBA|Bachelor(?:['’]?s)?|Master(?:['’]?s)?|Doctor(?:ate)?|Ph\.?D\.?|Associate(?:['’]?s)?\s+(?:Degree|of)|Diploma)(?=\s|[,;:(]|$)/iu;
const COMPANY_END =
  /\b(?:Co\.?|Company|Systems|Technologies|Solutions|Labs|Studio|Infrastructure|Corporation|Limited|Ltd\.?|LLC|LLP|PLC|Inc\.?)$/iu;
const shortHeader = (line: string) =>
  Boolean(line.trim()) &&
  line.trim().length <= 100 &&
  !ACTION_START.test(line.trim()) &&
  !/[!?]$/u.test(line.trim());
const roleHeader = (line: string) =>
  shortHeader(line) &&
  ROLE_WORD.test(line) &&
  (!/\.$/u.test(line.trim()) || /[|•]|\s+at\s+/iu.test(line));
const companyHeader = (line: string) =>
  shortHeader(line) &&
  !ROLE_WORD.test(line) &&
  !line.includes("@") &&
  !line.includes(":") &&
  (!line.includes(",") || COMPANY_END.test(line.trim())) &&
  !/,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/u.test(line.trim()) &&
  (!/\.$/u.test(line.trim()) || COMPANY_END.test(line.trim())) &&
  (!/^(?:senior|junior|principal|staff|lead)\b/iu.test(line.trim()) ||
    COMPANY_END.test(line.trim()));
const properNameHeader = (line: string) =>
  /^[\p{Lu}\d][\p{L}\p{N}&'’.-]*(?:\s+(?:[\p{Lu}\d][\p{L}\p{N}&'’.-]*|and|of|the|&))*$/u.test(
    line.trim(),
  );
const organizationHeading = (line: string) =>
  companyHeader(line) &&
  properNameHeader(line) &&
  (COMPANY_END.test(line.trim()) ||
    /\b(?:Digital|Analytics|Software|Research|Partners|Services|Group|Ventures|Collective|Consulting|Enterprises|Network|Organization|Guild)$/iu.test(
      line.trim(),
    ));
const credentialTitle = (line: string) =>
  /\b(?:certificat(?:e|ion)|certified|fundamentals|practitioner|associate|professional|foundation)\b/iu.test(
    line,
  ) || /^[A-Z][A-Z0-9-]{2,14}$/u.test(line);

function phoneFromLine(line: string) {
  // Search again after calendar dates instead of dropping a later real phone.
  // This only changes new proposals; historical contact replay stays frozen.
  let searchable = line.replace(
    /(?<!\d)(?:0?[1-9]|[12]\d|3[01])[./-](?:0?[1-9]|1[0-2])[./-](?:19|20)\d{2}(?!\d)/gu,
    " | ",
  );
  for (const date of extractDateStrings(line)) {
    if (date.replace(/\D/gu, "").length >= 7)
      searchable = searchable.replace(date, " | ");
  }
  return parseContact([searchable]).phone;
}

const fieldSection = (line: string) =>
  detectSectionType(line) ??
  (/^(?:skill\s*set|(?:tech(?:nical)?\s+)?stack|tools|toolkit|toolbox|technical toolkit|capabilities)$/u.test(
    normalizeHeading(line),
  )
    ? "skills"
    : null) ??
  (/^(?:(?:(?:selected|relevant|recent|professional|previous|industry)\s+)?(?:professional|work|employment|career)\s+(?:experience|history|record)|(?:career|professional|employment|work) background|(?:selected|relevant|recent|professional|previous) work|work|career|career highlights|professional engagements|selected employment|employment record|industry experience)$/u.test(
    normalizeHeading(line),
  )
    ? "experience"
    : /^(?:academic qualifications|academic record|learning):?$/iu.test(line)
      ? "education"
      : /^(?:(?:professional\s+)?(?:certificat(?:es?|ions?)|credentials)(?:\s+(?:and|&)\s+(?:training|licenses|licences))?):?$/iu.test(
            line,
          )
        ? "certifications"
        : null);

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
    const source = spans.filter(
      (span) => span.method === method && span.text.trim(),
    );
    const contactEnd = source.findIndex(
      (span) =>
        fieldSection(span.text.trim()) ||
        Array.from(span.text.matchAll(LABEL_PATTERN)).some(
          (label) =>
            !["name", "email", "phone"].includes(
              FIELD_LABELS[label[1].toLowerCase()],
            ),
        ),
    );
    const contact = parseContact(
      source
        .slice(0, contactEnd < 0 ? source.length : contactEnd)
        .filter(
          (span) =>
            !/^(?:curriculum vitae|contact details|contact information|personal information):?$/iu.test(
              span.text.trim(),
            ) &&
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
          const value =
            field === "phone"
              ? phoneFromLine(span.text)
              : parseContact([span.text])[field];
          add(field, value, span);
        }
      }
    }
    let section: string | null = null;
    let sectionStart = -1;
    let certificationSeen = false;
    for (const [index, span] of source.entries()) {
      const line = span.text.trim();
      const parts = line.split(/\s+(?:and|&)\s+|\s*\/\s*/iu).map(fieldSection);
      const heading =
        fieldSection(line) ??
        (parts.includes("experience") ? "experience" : null);
      if (heading) {
        section = heading;
        sectionStart = index;
        certificationSeen = false;
      }
      const labels = Array.from(line.matchAll(LABEL_PATTERN));
      const labelled = labels.length > 0;
      // A profile headline is a flat, unconfirmed role proposal. It does not
      // establish a historical job or a relationship to an employer candidate.
      if (
        !heading &&
        !labelled &&
        section === null &&
        (contact.name ||
          candidates.some(
            (item) =>
              item.field === "name" &&
              source
                .slice(0, index)
                .some((prior) => prior.id === item.evidence[0].spanId),
          )) &&
        index < 6 &&
        !source
          .slice(0, index)
          .some((item) => extractDateStrings(item.text).length) &&
        roleHeader(line) &&
        line.split(/\s+/u).length <= 8 &&
        !/[|:@]/u.test(line) &&
        !/\b(?:aspiring|seeking|opportunit(?:y|ies)|objective|looking|interested|hiring)\b/iu.test(
          line,
        )
      )
        add("role", line, span);
      for (const [labelIndex, label] of labels.entries()) {
        const key = label[1].toLowerCase();
        const field = FIELD_LABELS[key];
        let value = line
          .slice(
            label.index + label[0].length,
            labels[labelIndex + 1]?.index ?? line.length,
          )
          .trim();
        let valueSpan = span;
        const next = source[index + 1];
        if (
          !value &&
          labels.length === 1 &&
          next?.pageId === span.pageId &&
          !fieldSection(next.text.trim()) &&
          !Array.from(next.text.matchAll(LABEL_PATTERN)).length
        ) {
          value = next.text.trim();
          valueSpan = next;
        }
        add(
          field,
          field === "phone"
            ? phoneFromLine(value)
            : field === "email"
              ? parseContact([value]).email
              : value,
          valueSpan,
        );
        if (field === "certification" && value) certificationSeen = true;
      }
      for (const dates of labelled ? [] : extractDateStrings(line)) {
        if (
          section === "experience" ||
          /^(?:dates|employment)\s*:/iu.test(line)
        )
          add("dates", dates, span);
      }
      const degreeMatch = DEGREE.exec(line);
      const degree =
        degreeMatch &&
        !extractDateStrings(line).some((date) => {
          const start = line.indexOf(date);
          return (
            degreeMatch.index >= start &&
            degreeMatch.index < start + date.length
          );
        })
          ? degreeMatch
          : null;
      const isEducation =
        !labelled &&
        Boolean(degree) &&
        !ACTION_START.test(line) &&
        (degree!.index === 0 ||
          section === "education" ||
          /(?:[|,]|\s[-–—]|^(?:19|20)\d{2}:)\s*$/u.test(
            line.slice(0, degree!.index),
          ));
      if (isEducation) {
        const qualification = line
          .slice(degree!.index)
          .split(/\s*\|\s*|\s+[-–—]\s+/u)[0]
          .replace(
            /,\s*[^,]*\b(?:university|college|institute|school|polytechnic)\b.*$/iu,
            "",
          )
          .trim();
        add("education", qualification, span);
      }
      if (
        !heading &&
        !labelled &&
        !isEducation &&
        (!degree || credentialTitle(line)) &&
        (section !== "certifications" ||
          !certificationSeen ||
          credentialTitle(line)) &&
        !/^(?:issuer|issued by|awarded by|provider|training provider)(?:\s*:|\s+)/iu.test(
          line,
        ) &&
        (!/\b(?:institute|university|college|academy|council|board|training (?:centre|center)|LLC|Ltd|Inc)\b/iu.test(
          line,
        ) ||
          /\b(?:certificate|certification|certified)\b/iu.test(line)) &&
        !extractDateStrings(line).some((date) => date === line) &&
        shortHeader(line) &&
        !/\.$/u.test(line) &&
        (section === "certifications" ||
          /\b(?:certificat(?:e|ion)|certified)\b/iu.test(line))
      ) {
        add(
          "certification",
          line.replace(/^(?:certification|(?:19|20)\d{2})\s*:\s*/iu, ""),
          span,
        );
        certificationSeen = true;
      }
      // A dated organization line supplies local employment context even when
      // the preceding role crosses a page break. Never join source offsets.
      const following = source[index + 1];
      const labelledRole =
        following &&
        Array.from(following.text.matchAll(LABEL_PATTERN)).some(
          (label) => FIELD_LABELS[label[1].toLowerCase()] === "role",
        );
      const followingDates = source[index + 2];
      if (
        section === "experience" &&
        !heading &&
        !labelled &&
        companyHeader(line) &&
        properNameHeader(line) &&
        !extractDateStrings(line).length &&
        labelledRole &&
        followingDates?.pageId === following?.pageId &&
        (following?.pageId === span.pageId ||
          (index === sectionStart + 1 &&
            source[sectionStart].pageId === span.pageId)) &&
        extractDateStrings(followingDates.text).length &&
        Array.from(followingDates.text.matchAll(LABEL_PATTERN)).some(
          (label) => FIELD_LABELS[label[1].toLowerCase()] === "dates",
        )
      )
        add("employer", line, span);
      if (
        section === "experience" &&
        index === sectionStart + 1 &&
        source[sectionStart].pageId === span.pageId &&
        !heading &&
        !labelled &&
        organizationHeading(line) &&
        !extractDateStrings(line).length
      )
        add("employer", line, span);
      if (
        section === "experience" &&
        !heading &&
        !labelled &&
        companyHeader(line) &&
        !extractDateStrings(line).length
      ) {
        // A date line may sit between title and company in a compact header.
        // Require all three source lines on one page and a recognized work section.
        for (const direction of [-1, 1]) {
          const date = source[index + direction];
          const role = source[index + direction * 2];
          if (
            date?.pageId === span.pageId &&
            role?.pageId === span.pageId &&
            extractDateStrings(date.text).some(
              (value) => value === date.text.trim(),
            ) &&
            roleHeader(role.text) &&
            !/[|•]|\s+[-–—]\s+|\s+at\s+/iu.test(role.text)
          )
            add("employer", line, span);
        }
      }
      if (
        section === "experience" &&
        !heading &&
        !labelled &&
        !ROLE_WORD.test(line)
      ) {
        const dates = extractDateStrings(line);
        let company = line;
        for (const date of dates) company = company.replace(date, "");
        company = company.replace(/^[\s|,;–—-]+|[\s|,;–—-]+$/gu, "");
        if (
          dates.length &&
          companyHeader(company) &&
          !fieldSection(company) &&
          [source[index - 1], following].some(
            (adjacent) =>
              adjacent?.pageId === span.pageId && roleHeader(adjacent.text),
          )
        )
          add("employer", company, span);
      }
      if (
        section === "experience" &&
        !heading &&
        !labelled &&
        !ROLE_WORD.test(line) &&
        following?.pageId === span.pageId &&
        extractDateStrings(following.text).length &&
        (COMPANY_END.test(line) ||
          (companyHeader(line) &&
            extractDateStrings(following.text).some(
              (date) => date === following.text.trim(),
            ))) &&
        line.length <= 100 &&
        shortHeader(line)
      ) {
        add("employer", line, span);
      }
      if (
        section === "experience" &&
        !heading &&
        !labelled &&
        roleHeader(line)
      ) {
        // A delimited header can cite distinct role, employer and date
        // candidates without treating their concatenation as a job title.
        const dates = extractDateStrings(line);
        let header = line;
        for (const date of dates) {
          header = header.replace(`(${date})`, "").replace(date, "");
        }
        header = header.replace(/^[\s|,;–—-]+|[\s|,;–—-]+$/gu, "");
        const explicitSeparator = /[|•]|\s+[-–—]\s+|\s+at\s+/iu.test(header);
        const companyComma = header
          .split(/\s*,\s*/u)
          .some((part) => COMPANY_END.test(part));
        const commaParts = header.split(/\s*,\s*/u);
        const companyFirst =
          commaParts.length === 2 &&
          !ROLE_WORD.test(commaParts[0]) &&
          roleHeader(commaParts[1]);
        const segments = (
          explicitSeparator
            ? header.split(/\s*[|•]\s*|\s+[-–—]\s+|\s+at\s+/iu)
            : dates.length || companyComma || companyFirst
              ? header.split(/\s*,\s*|\s+[–—]\s+/u)
              : [header]
        ).filter(Boolean);
        const rolePattern = ROLE_WORD;
        const roleSegments = segments.filter((segment) =>
          rolePattern.test(segment),
        );
        const role = roleSegments.length === 1 ? roleSegments[0] : header;
        add("role", role, span);
        if (
          segments.length === 2 &&
          roleSegments.length === 1 &&
          (explicitSeparator ||
            companyComma ||
            companyFirst ||
            segments[1] === role)
        ) {
          const employer = segments.find((segment) => segment !== role)!;
          if (
            employer &&
            companyHeader(employer) &&
            (!/\.$/u.test(employer) || COMPANY_END.test(employer))
          )
            add("employer", employer, span);
        }
        for (const adjacent of [source[index - 1], source[index + 1]]) {
          if (
            adjacent &&
            adjacent.pageId === span.pageId &&
            !fieldSection(adjacent.text.trim()) &&
            !/\b(?:experience|employment|projects|engineer|developer|manager|architect|certificat(?:e|ion))\b/iu.test(
              adjacent.text,
            ) &&
            !extractDateStrings(adjacent.text).length &&
            adjacent.text.trim().length <= 100 &&
            companyHeader(adjacent.text) &&
            (COMPANY_END.test(adjacent.text.trim()) ||
              // A heading plus company/title pair is locally sufficient even
              // when a subsequent date wraps onto the next source page.
              (sectionStart >= 0 &&
                source[sectionStart].pageId === span.pageId &&
                index - sectionStart <= 2 &&
                source.indexOf(adjacent) - sectionStart > 0 &&
                source.indexOf(adjacent) - sectionStart <= 2) ||
              // Unlabelled employers need a complete local employment header:
              // company, role and dates on three adjacent lines of one page.
              [
                source[index - 2],
                source[index - 1],
                source[index + 1],
                source[index + 2],
              ].some(
                (dateSpan) =>
                  dateSpan?.pageId === span.pageId &&
                  extractDateStrings(dateSpan.text).length > 0 &&
                  Math.max(
                    index,
                    source.indexOf(dateSpan),
                    source.indexOf(adjacent),
                  ) -
                    Math.min(
                      index,
                      source.indexOf(dateSpan),
                      source.indexOf(adjacent),
                    ) ===
                    2,
              )) &&
            (!/\.$/u.test(adjacent.text.trim()) ||
              COMPANY_END.test(adjacent.text.trim()))
          )
            add("employer", adjacent.text.trim(), adjacent);
        }
      }
    }
  }
  return candidates;
}
