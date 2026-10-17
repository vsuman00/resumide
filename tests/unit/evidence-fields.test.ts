import { describe, expect, it } from "vitest";
import {
  extractEvidenceFields,
  CRITICAL_FIELDS,
} from "../../app/lib/server/evidence-fields";

function spans(
  text: string,
  method: "native_text" | "local_ocr" = "native_text",
) {
  return text.split("\n").map((line, index) => ({
    id: `${method}-${index}`,
    pageId: "page-1",
    text: line,
    method,
  }));
}
describe("critical evidence candidates", () => {
  it("separates a dated employer-comma-title header without guessing a role specialty as employer", () => {
    const result = extractEvidenceFields(
      spans(
        "Professional Experience\nFictional Labs, Software Engineer – Jan 2020 - Dec 2023",
      ),
    );
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "employer", value: "Fictional Labs" }),
        expect.objectContaining({ field: "role", value: "Software Engineer" }),
      ]),
    );
    expect(
      extractEvidenceFields(
        spans("Experience\nSoftware Engineer, Platform\nBuilt reliable tests"),
      ).filter((item) => item.field === "employer"),
    ).toEqual([]);
  });
  it("keeps delimited employment header fields distinct and exactly cited", () => {
    const source = spans(
      "Professional Experience\nSoftware Engineer | Fictional Labs | 2020 - 2023",
    );
    const result = extractEvidenceFields(source).filter((item) =>
      ["role", "employer", "dates"].includes(item.field),
    );
    expect(result.map((item) => [item.field, item.value])).toEqual(
      expect.arrayContaining([
        ["role", "Software Engineer"],
        ["employer", "Fictional Labs"],
        ["dates", "2020 - 2023"],
      ]),
    );
    expect(result).toHaveLength(3);
    for (const item of result) {
      const citation = item.evidence[0];
      expect(
        Array.from(source[1].text).slice(citation.start, citation.end).join(""),
      ).toBe(item.value);
    }
  });
  it("keeps a career heading out of name candidates", () => {
    const result = extractEvidenceFields(
      spans("Engineering Profile\nDemo Person\ndemo@example.test"),
    );
    expect(
      result.filter((item) => item.field === "name").map((item) => item.value),
    ).toEqual(["Demo Person"]);
  });
  it("retains reversed employer/role order in a combined employment section", () => {
    const result = extractEvidenceFields(
      spans(
        "Projects and Employment\nFictional Systems\nSoftware Engineer\n2020 - 2023",
      ),
    );
    expect(
      result
        .filter((item) => item.field === "employer")
        .map((item) => item.value),
    ).toEqual(["Fictional Systems"]);
    expect(
      result.filter((item) => item.field === "dates").map((item) => item.value),
    ).toEqual(["2020 - 2023"]);
  });
  it("uses a dated organization block without joining cross-page sources", () => {
    const source = spans(
      "Experience\nSoftware Engineer\nExample Technologies\n2020 - 2023",
    );
    source[2].pageId = source[3].pageId = "page-3";
    const employer = extractEvidenceFields(source).find(
      (item) => item.field === "employer",
    );
    expect(employer?.value).toBe("Example Technologies");
    expect(employer?.evidence).toEqual([
      { spanId: source[2].id, start: 0, end: 20 },
    ]);
    expect(
      extractEvidenceFields(
        spans("Summary\nExample Technologies\n2020 - 2023"),
      ).some((item) => item.field === "employer"),
    ).toBe(false);
  });
  it("extracts all eight explicitly labelled fields with exact source offsets", () => {
    const source = spans(
      "Name: Demo Person\nEmail: demo@example.test\nPhone: 0000000000\nEmployer: Fictional Co\nRole: Software Engineer\nDates: 2021 - 2024\nEducation: BSc Computer Science\nCertification: Demo Certificate",
    );
    const result = extractEvidenceFields(source);
    expect(new Set(result.map((item) => item.field))).toEqual(
      new Set(CRITICAL_FIELDS),
    );
    for (const item of result) {
      const reference = item.evidence[0];
      const span = source.find((entry) => entry.id === reference.spanId)!;
      expect(
        Array.from(span.text).slice(reference.start, reference.end).join(""),
      ).toBe(item.value);
      expect(item.confidence.kind).toBe("uncalibrated");
    }
  });
  it("does not create a second role or employer containing its field label", () => {
    const result = extractEvidenceFields(
      spans(
        "Experience\nEmployer: Fictional Co\nRole: Software Engineer\nDates: 2021 - 2024",
      ),
    );
    expect(
      result.filter((item) => item.field === "role").map((item) => item.value),
    ).toEqual(["Software Engineer"]);
    expect(
      result
        .filter((item) => item.field === "employer")
        .map((item) => item.value),
    ).toEqual(["Fictional Co"]);
  });
  it("preserves competing native and OCR values without selecting a winner", () => {
    const result = extractEvidenceFields([
      ...spans("Employer: Fictional Native"),
      ...spans("Employer: Fictional OCR", "local_ocr"),
    ]);
    expect(
      result
        .filter((item) => item.field === "employer")
        .map((item) => item.value),
    ).toEqual(["Fictional Native", "Fictional OCR"]);
  });
  it("does not infer dates or employers from arbitrary proximity outside experience", () => {
    expect(
      extractEvidenceFields(
        spans("2022 - 2024\nFictional Co\nSoftware Engineer"),
      ).filter((item) => ["dates", "employer", "role"].includes(item.field)),
    ).toEqual([]);
  });
  it("grounds Unicode labelled values without converting to byte or UTF-16 offsets", () => {
    const result = extractEvidenceFields(spans("Employer: 😀 Fictional Co"));
    const candidate = result.find((item) => item.field === "employer")!;
    expect(candidate.evidence[0].end - candidate.evidence[0].start).toBe(
      Array.from(candidate.value).length,
    );
  });
});
