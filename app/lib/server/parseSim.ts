// Parse-simulation engine.
//
// This is a transparent heuristic simulation, not an implementation of any
// proprietary ATS parser. Parsing details live in focused modules so their
// accuracy and limitations can be tested independently.

import { countBullets } from "./parsing/bullets";
import { parseContact } from "./parsing/contact";
import { extractDateStrings } from "./parsing/dates";
import { parseHealthWarnings } from "./parsing/health";
import { structureWarnings } from "./pdf-structure";
import { parseLayoutWarnings } from "./parsing/layout";
import { parseSections } from "./parsing/sections";

export function parseSim(args: {
  text: string;
  totalPages: number;
  pageTexts?: readonly string[];
  /** Stored extraction warnings; only PDF-structure findings are used. */
  extractionWarnings?: readonly unknown[] | null;
}): ParseViewData {
  const lines = args.text.split(/\r?\n/u);
  const warnings: ParseViewWarning[] = [];
  const contact = parseContact(lines);
  const detectedSections = parseSections(lines);
  const sections: ParseViewSection[] = detectedSections.map((section) => {
    const sectionLines = lines.slice(section.startLine + 1, section.endLine);
    return {
      type: section.type,
      title: section.title,
      startLine: section.startLine,
      lineCount: sectionLines.length,
      bulletCount: countBullets(sectionLines),
      dateStrings: extractDateStrings(sectionLines.join("\n")),
    };
  });

  if (!contact.name) {
    warnings.push({
      field: "name",
      severity: "warn",
      message: "No name detected at the top of the resume.",
    });
  }
  if (!contact.email) {
    warnings.push({
      field: "email",
      severity: "error",
      message: "No email address found. Most ATS systems require one.",
    });
  }
  if (!contact.phone) {
    warnings.push({
      field: "phone",
      severity: "info",
      message: "No phone number detected.",
    });
  }
  if (!contact.location) {
    warnings.push({
      field: "location",
      severity: "info",
      message: "No location line detected (e.g. 'City, ST').",
    });
  }

  if (sections.length === 0) {
    warnings.push({
      field: "sections",
      severity: "error",
      message:
        "No section headers detected (Experience / Education / Skills). ATS relies on them.",
    });
  } else {
    if (!sections.some((section) => section.type === "experience")) {
      warnings.push({
        field: "sections",
        severity: "warn",
        message: "No 'Experience' section header detected.",
      });
    }
    if (!sections.some((section) => section.type === "education")) {
      warnings.push({
        field: "sections",
        severity: "warn",
        message: "No 'Education' section header detected.",
      });
    }
    if (!sections.some((section) => section.type === "skills")) {
      warnings.push({
        field: "sections",
        severity: "warn",
        message: "No 'Skills' section header detected.",
      });
    }
  }

  for (const section of sections) {
    if (
      section.bulletCount === 0 &&
      (section.type === "experience" || section.type === "projects")
    ) {
      warnings.push({
        field: "bullets",
        severity: "warn",
        message: `Section "${section.title}" has no bullet points — experience should be scannable.`,
      });
    }
    if (section.dateStrings.length === 0 && section.type === "experience") {
      warnings.push({
        field: "dates",
        severity: "warn",
        message: `Section "${section.title}" has no detectable dates. ATS may drop these roles.`,
      });
    }
  }

  warnings.push(...parseLayoutWarnings({ lines, sections: detectedSections }));
  warnings.push(
    ...parseHealthWarnings({
      lines,
      pageTexts: args.pageTexts,
      totalPages: args.totalPages,
    }),
  );

  warnings.push(...structureWarnings(args.extractionWarnings));

  const pageTexts = buildPageTexts(args);

  return {
    totalPages: args.totalPages,
    totalLines: lines.length,
    contact,
    sections,
    warnings,
    pages: pageTexts.map((pageText, index) => {
      const pageLines = pageText.split(/\r?\n/u);
      const characters = pageText.replace(/\s/gu, "").length;
      const confidence: ParseViewPage["confidence"] =
        characters >= 40 ? "high" : characters >= 8 ? "medium" : "low";
      const pageWarnings =
        characters === 0
          ? ["No extractable text was found on this page."]
          : confidence === "low"
            ? ["Limited text was extracted from this page."]
            : [];
      return {
        pageNumber: index + 1,
        text: pageText,
        lineCount: pageText.trim() ? pageLines.length : 0,
        confidence,
        warnings: pageWarnings,
      };
    }),
  };
}

function buildPageTexts(args: {
  text: string;
  totalPages: number;
  pageTexts?: readonly string[];
}): string[] {
  if (args.pageTexts?.length === args.totalPages) return [...args.pageTexts];
  const pageCount = Math.max(1, args.totalPages);
  const lines = args.text.split(/\r?\n/u);
  const pageSize = Math.max(1, Math.ceil(lines.length / pageCount));
  return Array.from({ length: pageCount }, (_, index) =>
    lines.slice(index * pageSize, (index + 1) * pageSize).join("\n"),
  );
}
