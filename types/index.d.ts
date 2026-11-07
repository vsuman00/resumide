interface Job {
  title: string;
  description: string;
  location: string;
  requiredSkills: string[];
}

interface Resume {
  id: string;
  companyName?: string;
  jobTitle?: string;
  imagePath: string;
  resumePath: string;
  feedback: Feedback;
}

// Additive to the frozen Feedback contract (see docs/archive/PLAN.md §4.0).
// Feeds the new Parse View screen. Pure data — no UI changes required.
interface ParseViewContact {
  name: string | null;
  email: string | null;
  phone: string | null;
  links: string[];
  location: string | null;
}

interface ParseViewSection {
  type:
    | "summary"
    | "experience"
    | "education"
    | "skills"
    | "projects"
    | "certifications"
    | "awards"
    | "publications"
    | "volunteer"
    | "languages"
    | "interests"
    | "references"
    | "other";
  title: string; // text used to detect the section
  startLine: number; // 0-indexed in the source text
  lineCount: number; // how many lines the section spans
  bulletCount: number; // bullets detected in the section
  dateStrings: string[]; // date substrings (raw)
}

interface ParseViewWarning {
  field:
    | "name"
    | "email"
    | "phone"
    | "location"
    | "links"
    | "sections"
    | "dates"
    | "bullets"
    | "overall";
  severity: "info" | "warn" | "error";
  message: string;
}

interface ParseViewPage {
  pageNumber: number;
  text: string;
  lineCount: number;
  confidence: "high" | "medium" | "low";
  warnings: string[];
}

interface ParseViewData {
  totalPages: number;
  totalLines: number;
  contact: ParseViewContact;
  sections: ParseViewSection[];
  warnings: ParseViewWarning[];
  pages: ParseViewPage[];
}

// The full server response envelope. Additive to the frozen Feedback
// contract (see docs/archive/PLAN.md §4.0). `feedback` feeds the existing UI unchanged;
// the rest feeds the new Parse View + Heatmap screens.
interface RuleTrace {
  ruleId: string;
  label: string;
  passed: boolean;
  outcome?: "passed" | "failed" | "not_evaluated";
  confidence?: "high" | "none";
  weight: number;
  credit?: number;
  detail: string;
  evidence?: string[];
}

interface AnalysisResult {
  feedback: Feedback;
  parseView: ParseViewData;
  ruleTrace: RuleTrace[];
  jdKeywords: string[];
  matchedKeywords: string[];
  missingKeywords: string[];
  uncertainKeywords: string[];
  keywordEvidence: KeywordEvidence[];
  writer: ResumeWriter;
}

interface EvidenceSpan {
  start: number;
  end: number;
  text: string;
  alias: string;
}

interface KeywordEvidence {
  term: string;
  taxonomyId: string | null;
  kind: "taxonomy" | "keyword";
  uncertain?: boolean;
  job: { occurrenceCount: number; spans: EvidenceSpan[] };
  resume: { occurrenceCount: number; spans: EvidenceSpan[] };
}

interface ResumeWriter {
  summary: string | null;
  bullets: {
    original: string;
    rewrite: string;
    reasoning: string;
  }[];
}

interface Feedback {
  overallScore: number;
  ATS: {
    score: number;
    tips: {
      type: "good" | "improve";
      tip: string;
    }[];
  };
  toneAndStyle: {
    score: number;
    tips: {
      type: "good" | "improve";
      tip: string;
      explanation: string;
    }[];
  };
  content: {
    score: number;
    tips: {
      type: "good" | "improve";
      tip: string;
      explanation: string;
    }[];
  };
  structure: {
    score: number;
    tips: {
      type: "good" | "improve";
      tip: string;
      explanation: string;
    }[];
  };
  skills: {
    score: number;
    tips: {
      type: "good" | "improve";
      tip: string;
      explanation: string;
    }[];
  };
}
