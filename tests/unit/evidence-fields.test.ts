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
  const workplaceProfile = "mixed-ocr-review/1.0.2" as const;
  const workplaceHeader =
    "Data Engineer | Fictional Copper Systems | Remote | May 2021 - Aug 2023";

  it.each([
    workplaceHeader,
    "Fictional Copper Systems | Data Engineer | Hybrid | May 2021 - Aug 2023",
  ])("recovers a same-line OCR employer beside a workplace mode", (header) => {
    const source = spans(`Work History\n${header}`, "local_ocr");
    const employer = extractEvidenceFields(source, workplaceProfile).filter(
      ({ field }) => field === "employer",
    );
    const start = header.indexOf("Fictional Copper Systems");
    expect(employer).toEqual([
      expect.objectContaining({
        value: "Fictional Copper Systems",
        state: "review_required",
        confidence: { kind: "uncalibrated", value: null },
        evidence: [{ spanId: source[1].id, start, end: start + 24 }],
      }),
    ]);
    expect(
      extractEvidenceFields(source, "mixed-ocr-review/1.0.1").filter(
        ({ field }) => field === "employer",
      ),
    ).toEqual([]);
  });

  it.each([
    "Release Engineer | Fictional Cedar Lab | Remote | Mar 2019 - Sep 2021",
    "Fictional Cedar Lab | Release Engineer | Hybrid | Mar 2019 - Sep 2021",
  ])(
    "recovers singular Lab names only in the new OCR workplace profile",
    (header) => {
      const source = spans(`Professional Experience\n${header}`, "local_ocr");
      const employer = "Fictional Cedar Lab";
      const start = header.indexOf(employer);
      const proposals = extractEvidenceFields(source, "mixed-ocr-review/1.0.3");
      expect(proposals.filter(({ field }) => field === "employer")).toEqual([
        expect.objectContaining({
          value: employer,
          state: "review_required",
          confidence: { kind: "uncalibrated", value: null },
          evidence: [
            { spanId: source[1].id, start, end: start + employer.length },
          ],
        }),
      ]);
      expect(
        extractEvidenceFields(source, workplaceProfile).some(
          ({ field }) => field === "employer",
        ),
      ).toBe(false);
    },
  );

  it.each([
    ["Projects", "Fictional Cedar Lab", "local_ocr", "page-1", "Remote", true],
    [
      "Work History",
      "Fictional Cedar Lab",
      "native_text",
      "page-1",
      "Remote",
      true,
    ],
    [
      "Work History",
      "Fictional Cedar Lab",
      "local_ocr",
      "page-2",
      "Remote",
      true,
    ],
    [
      "Work History",
      "Fictional Cedar Lab",
      "local_ocr",
      "page-1",
      "Unknown",
      true,
    ],
    [
      "Work History",
      "Fictional Cedar Lab",
      "local_ocr",
      "page-1",
      "Remote",
      false,
    ],
    ["Work History", "shared home lab", "local_ocr", "page-1", "Remote", true],
    ["Work History", "Lab", "local_ocr", "page-1", "Remote", true],
  ] as const)(
    "does not expand OCR employer proposals outside the named workplace header (%#)",
    (heading, name, method, pageId, mode, dated) => {
      const period = dated ? "Mar 2019 - Sep 2021" : "Unknown";
      const source = spans(
        `${heading}\nRelease Engineer | ${name} | ${mode} | ${period}`,
        method,
      );
      source[1].pageId = pageId;
      expect(extractEvidenceFields(source, "mixed-ocr-review/1.0.3")).toEqual(
        extractEvidenceFields(source, workplaceProfile),
      );
    },
  );

  it.each([
    ["project heading", "Projects", workplaceHeader, "local_ocr", "page-1"],
    ["native text", "Work History", workplaceHeader, "native_text", "page-1"],
    ["prior page", "Work History", workplaceHeader, "local_ocr", "page-2"],
    [
      "free text",
      "Work History",
      workplaceHeader.replace("Remote", "Onboarding"),
      "local_ocr",
      "page-1",
    ],
    [
      "multiple organizations",
      "Work History",
      workplaceHeader.replace("Remote", "Fictional Stone Labs"),
      "local_ocr",
      "page-1",
    ],
    [
      "missing date range",
      "Work History",
      workplaceHeader.replace("May 2021 - Aug 2023", "Ongoing"),
      "local_ocr",
      "page-1",
    ],
  ] as const)(
    "abstains from adding a workplace employer for %s",
    (_, heading, header, method, pageId) => {
      const source = spans(`${heading}\n${header}`, method);
      source[1].pageId = pageId;
      expect(extractEvidenceFields(source, workplaceProfile)).toEqual(
        extractEvidenceFields(source, "mixed-ocr-review/1.0.1"),
      );
    },
  );

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
  it("proposes a split OCR employer using only the cited employment page", () => {
    const source = spans(
      "Experience\nFictional Novella Laboratory\nSoftware Engineer\n2020 - 2023",
      "local_ocr",
    );
    source[2].pageId = source[3].pageId = "page-3";
    const mixed = [
      ...source.slice(0, 2),
      { ...spans("Skills")[0], pageId: "page-2" },
      ...source.slice(2),
    ];
    const employer = extractEvidenceFields(
      mixed,
      "mixed-ocr-review/1.0.0",
    ).find((item) => item.field === "employer");
    expect(employer).toMatchObject({
      value: source[1].text,
      evidence: [{ spanId: source[1].id, start: 0, end: 28 }],
      state: "review_required",
      confidence: { kind: "uncalibrated", value: null },
    });
    expect(
      extractEvidenceFields(mixed).some((item) => item.field === "employer"),
    ).toBe(false);
  });

  it.each([
    ["Projects", "Fictional Novella Laboratory", true, "local_ocr"],
    ["Experience", "Skills Laboratory", true, "local_ocr"],
    ["Experience", "Fictional Novella Laboratory", false, "local_ocr"],
    ["Experience", "Fictional Novella Laboratory", true, "native_text"],
  ] as const)(
    "withholds a split employer without eligible local source evidence: %s / %s / %s / %s",
    (heading, company, samePage, method) => {
      const source = spans(
        `${heading}\n${company}\nSoftware Engineer\n2020 - 2023`,
        method,
      );
      source[2].pageId = source[3].pageId = "page-3";
      if (!samePage) source[0].pageId = "page-0";
      expect(
        extractEvidenceFields(source, "mixed-ocr-review/1.0.0").filter(
          (item) => item.field === "employer",
        ),
      ).toEqual([]);
    },
  );
  it("does not carry an added OCR employment heading into a different page", () => {
    const source = spans(
      "Employment Details\nPlatform Engineer\nFictional Driftwood Studio\nSep 2020 - Nov 2022",
      "local_ocr",
    );
    for (const row of source.slice(1)) row.pageId = "page-3";
    expect(
      extractEvidenceFields(source, "mixed-ocr-review/1.0.1").filter(
        ({ field }) => field === "employer" || field === "dates",
      ),
    ).toEqual([]);
  });

  it("does not borrow labelled role and dates from another page in the mixed profile", () => {
    const source = spans(
      "Experience\nFictional Novella Workshop\nRole: Software Engineer\nDates: 2020 - 2023",
      "local_ocr",
    );
    source[2].pageId = source[3].pageId = "page-3";
    expect(extractEvidenceFields(source)).toContainEqual(
      expect.objectContaining({ field: "employer", value: source[1].text }),
    );
    expect(
      extractEvidenceFields(source, "mixed-ocr-review/1.0.0").filter(
        (item) => item.field === "employer",
      ),
    ).toEqual([]);
  });
  it.each([
    [
      "Employment Details",
      "Data Software Engineer",
      "Fictional Paperbridge Studio",
      "May 2021 - Aug 2023",
    ],
    [
      "Industry Placements",
      "Systems Engineer",
      "Fictional Seagrass Networks",
      "Jun 2020 to Sep 2022",
    ],
  ] as const)(
    "extracts same-page employer and period under %s in OCR review",
    (heading, role, employer, period) => {
      const source = spans(
        [heading, role, employer, period].join("\n"),
        "local_ocr",
      );
      const found = extractEvidenceFields(source, "mixed-ocr-review/1.0.1");
      for (const [field, value, span] of [
        ["role", role, source[1]],
        ["employer", employer, source[2]],
        ["dates", period, source[3]],
      ] as const) {
        expect(found).toContainEqual(
          expect.objectContaining({
            field,
            value,
            evidence: [{ spanId: span.id, start: 0, end: value.length }],
            state: "review_required",
            confidence: { kind: "uncalibrated", value: null },
          }),
        );
      }
      expect(extractEvidenceFields(source, "mixed-ocr-review/1.0.0")).toEqual(
        extractEvidenceFields(source),
      );
    },
  );
  it("splits an explicitly delimited OCR employment header into exact source spans", () => {
    const line =
      "Platform Engineer @ Fictional Driftwood Studio · Sep 2020 - Nov 2022";
    const source = spans(`Experience\n${line}`, "local_ocr");
    const found = extractEvidenceFields(source, "mixed-ocr-review/1.0.1");
    expect(
      found
        .filter(
          ({ field }) =>
            field === "employer" || field === "role" || field === "dates",
        )
        .map(({ field, value, evidence }) => {
          expect(evidence[0].spanId).toBe(source[1].id);
          expect(line.slice(evidence[0].start, evidence[0].end)).toBe(value);
          return [field, value];
        }),
    ).toEqual(
      expect.arrayContaining([
        ["role", "Platform Engineer"],
        ["employer", "Fictional Driftwood Studio"],
        ["dates", "Sep 2020 - Nov 2022"],
      ]),
    );
  });
  it.each([
    [
      "Projects",
      "Platform Engineer @ Fictional Driftwood Studio · Sep 2020 - Nov 2022",
      "local_ocr",
    ],
    [
      "Experience",
      "Platform Engineer @ team@example.test · Sep 2020 - Nov 2022",
      "local_ocr",
    ],
    [
      "Employment Details",
      "Platform Engineer @ Fictional Driftwood Studio · Sep 2020 - Nov 2022",
      "native_text",
    ],
  ] as const)(
    "withholds employer proposals from %s without qualifying OCR employment evidence",
    (heading, line, method) => {
      expect(
        extractEvidenceFields(
          spans(`${heading}\n${line}`, method),
          "mixed-ocr-review/1.0.1",
        ).filter(({ field }) => field === "employer"),
      ).toEqual([]);
    },
  );
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
