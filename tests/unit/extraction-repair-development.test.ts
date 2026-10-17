import { expect, it } from "vitest";
import {
  extractEvidenceFields,
  CRITICAL_FIELDS,
} from "../../app/lib/server/evidence-fields";
it("extracts compact dated headers and year-prefixed qualifications", () => {
  const lines = [
    "Work",
    "Orchard Systems - Backend Developer (February 2017 - August 2021)",
    "Learning",
    "2016: Bachelor of Science in Computing",
    "2021: Certified Network Professional",
    "Skills",
    "Linux, Python",
  ];
  const result = extractEvidenceFields(
    lines.map((text, index) => ({
      text,
      id: `line-${index}`,
      pageId: "page-1",
      method: "native_text" as const,
    })),
  );
  expect(result.map(({ field, value }) => ({ field, value }))).toEqual(
    expect.arrayContaining([
      { field: "employer", value: "Orchard Systems" },
      { field: "role", value: "Backend Developer" },
      { field: "dates", value: "February 2017 - August 2021" },
      { field: "education", value: "Bachelor of Science in Computing" },
      { field: "certification", value: "Certified Network Professional" },
    ]),
  );
  expect(result).toHaveLength(5);
});
it.each(["STACK", "TECH STACK", "TOOLS", "SKILL SET", "TOOLKIT"])(
  "ends credential proposals at the %s section",
  (heading) => {
    const result = extractEvidenceFields(
      [
        "Certificates",
        "Certified Network Professional",
        heading,
        "Rust, SQL",
      ].map((text, index) => ({
        text,
        id: `line-${index}`,
        pageId: "page-1",
        method: "native_text" as const,
      })),
    );
    expect(
      result
        .filter((item) => item.field === "certification")
        .map((item) => item.value),
    ).toEqual(["Certified Network Professional"]);
  },
);
it("keeps a local company/title header when its date wraps to another page", () => {
  const source = [
    "Experience",
    "Harbor Analytics",
    "Staff Software Engineer",
    "Sep 2019 - Nov 2023",
  ].map((text, index) => ({
    text,
    id: `line-${index}`,
    pageId: index === 3 ? "page-2" : "page-1",
    method: "local_ocr" as const,
  }));
  expect(
    extractEvidenceFields(source)
      .filter((item) => item.field === "employer")
      .map((item) => item.value),
  ).toEqual(["Harbor Analytics"]);
});

it.each([
  ["Full name", "name", "Nora Mehta"],
  ["Organisation", "employer", "Cobalt Services"],
  ["Position", "role", "Platform Engineer"],
  ["Title", "role", "Software Developer"],
  ["Employment dates", "dates", "2020 - 2024"],
  ["Degree", "education", "BSc Computer Science"],
  ["Qualifications", "education", "BEng Software Engineering"],
  ["Credential", "certification", "Cloud Practitioner"],
  ["Certificate", "certification", "Cloud Practitioner"],
  ["Employer name", "employer", "Cobalt Services"],
  ["Certifications", "certification", "Azure Fundamentals"],
])(
  "recognizes an explicit development label %s without retaining its label",
  (label, field, value) => {
    const result = extractEvidenceFields([
      {
        id: "label",
        pageId: "page-1",
        method: "native_text",
        text: `${label}: ${value}`,
      },
    ]);
    expect(result).toEqual([
      expect.objectContaining({
        field,
        value,
        evidence: [
          {
            spanId: "label",
            start: label.length + 2,
            end: label.length + 2 + value.length,
          },
        ],
      }),
    ]);
  },
);

it.each(["Contact Details", "Personal Information", "Contact Information"])(
  "does not confuse %s with a person's name",
  (heading) => {
    const result = extractEvidenceFields(
      [heading, "Nora Mehta", "nora@example.test"].map((text, index) => ({
        text,
        id: `line-${index}`,
        pageId: "page-1",
        method: "native_text" as const,
      })),
    );
    expect(
      result.filter((item) => item.field === "name").map((item) => item.value),
    ).toEqual(["Nora Mehta"]);
  },
);

it("cites the qualification within a school entry and rejects a certification mention in prose", () => {
  const source = [
    "Education",
    "Lakeside Institute - Bachelor of Science in Computing",
    "Summary",
    "I worked with a certified cloud engineer",
  ].map((text, index) => ({
    text,
    id: `line-${index}`,
    pageId: "page-1",
    method: "native_text" as const,
  }));
  const result = extractEvidenceFields(source).filter((item) =>
    ["education", "certification"].includes(item.field),
  );
  expect(result.map(({ field, value }) => ({ field, value }))).toEqual([
    { field: "education", value: "Bachelor of Science in Computing" },
  ]);
});
import { EXTRACTION_REPAIR_DEVELOPMENT_FAMILIES } from "../fixtures/extraction-repair-development";
it("does not suppress Scrum credentials containing the word Master", () => {
  const result = extractEvidenceFields(
    [
      "Certifications",
      "Certified Scrum Master",
      "Scrum Master Certification",
    ].map((text, index) => ({
      text,
      id: `line-${index}`,
      pageId: "page-1",
      method: "native_text" as const,
    })),
  );
  expect(
    result
      .filter((item) => item.field === "certification")
      .map((item) => item.value),
  ).toEqual(["Certified Scrum Master", "Scrum Master Certification"]);
  expect(result.filter((item) => item.field === "education")).toEqual([]);
});
it("retains a locally headed company when its explicit role/date header continues on another OCR page", () => {
  const source = [
    { text: "Career", pageId: "page-1", method: "local_ocr" as const },
    {
      text: "Harbor Applied Intelligence",
      pageId: "page-1",
      method: "local_ocr" as const,
    },
    {
      text: "Skills and Projects",
      pageId: "page-2",
      method: "native_text" as const,
    },
    { text: "Python", pageId: "page-2", method: "native_text" as const },
    {
      text: "Job title: Platform Engineer",
      pageId: "page-3",
      method: "local_ocr" as const,
    },
    {
      text: "Tenure: January 2020 to June 2023",
      pageId: "page-3",
      method: "local_ocr" as const,
    },
  ].map((span, index) => ({ ...span, id: `line-${index}` }));
  const employers = extractEvidenceFields(source).filter(
    (item) => item.field === "employer",
  );
  expect(employers.map((item) => item.value)).toEqual([
    "Harbor Applied Intelligence",
  ]);
  expect(employers[0].evidence).toEqual([
    { spanId: "line-1", start: 0, end: 27 },
  ]);
});
it("does not attach an orphan company to explicit labels on another page without a local work heading", () => {
  const result = extractEvidenceFields(
    [
      "Career",
      "Maintained projects",
      "Notes",
      "Harbor Applied Intelligence",
      "Job title: Platform Engineer",
      "Tenure: January 2020 to June 2023",
    ].map((text, index) => ({
      text,
      id: `line-${index}`,
      pageId: index < 3 ? "page-1" : index === 3 ? "page-2" : "page-3",
      method: "local_ocr" as const,
    })),
  );
  expect(
    result.some(
      (item) =>
        item.field === "employer" &&
        item.value === "Harbor Applied Intelligence",
    ),
  ).toBe(false);
});
it("does not infer company prose from nearby explicit role/date labels", () => {
  const result = extractEvidenceFields(
    [
      "Career",
      "Five years building reliable products",
      "Job title: Platform Engineer",
      "Tenure: January 2020 to June 2023",
    ].map((text, index) => ({
      text,
      id: `line-${index}`,
      pageId: "page-1",
      method: "native_text" as const,
    })),
  );
  expect(result.filter((item) => item.field === "employer")).toEqual([]);
});
it("recognizes clear candidate and work-record labels", () => {
  const source = [
    "Candidate: Nora Mehta",
    "Work Record",
    "Data and Platform Engineer",
    "Company: Cedar Digital",
    "Tenure: January 2020 to June 2023",
  ].map((text, index) => ({
    text,
    id: `line-${index}`,
    pageId: "page-1",
    method: "native_text" as const,
  }));
  const result = extractEvidenceFields(source);
  expect(result.map(({ field, value }) => ({ field, value }))).toEqual(
    expect.arrayContaining([
      { field: "name", value: "Nora Mehta" },
      { field: "role", value: "Data and Platform Engineer" },
      { field: "dates", value: "January 2020 to June 2023" },
    ]),
  );
  expect(
    result
      .filter((item) => item.field === "employer")
      .map((item) => item.value),
  ).toEqual(["Cedar Digital"]);
});
it("uses explicit neighbouring role and date labels to ground an unfamiliar company header", () => {
  const result = extractEvidenceFields(
    [
      "Career",
      "Harbor Applied Intelligence",
      "Job title: Platform Engineer",
      "Tenure: January 2020 to June 2023",
    ].map((text, index) => ({
      text,
      id: `line-${index}`,
      pageId: "page-1",
      method: "native_text" as const,
    })),
  );
  expect(
    result
      .filter((item) => item.field === "employer")
      .map((item) => item.value),
  ).toEqual(["Harbor Applied Intelligence"]);
});
it("never treats a leftover unknown date label as an employer", () => {
  const result = extractEvidenceFields(
    [
      "Experience",
      "Software Engineer",
      "Timeline: January 2020 to June 2023",
    ].map((text, index) => ({
      text,
      id: `line-${index}`,
      pageId: "page-1",
      method: "native_text" as const,
    })),
  );
  expect(
    result.some(
      (item) => item.field === "employer" && item.value.includes(":"),
    ),
  ).toBe(false);
});
it("keeps a stated profile title after an explicitly labelled name", () => {
  const result = extractEvidenceFields(
    ["Candidate name: Nora Mehta", "Platform Engineer", "Education"].map(
      (text, index) => ({
        text,
        id: `line-${index}`,
        pageId: "page-1",
        method: "native_text" as const,
      }),
    ),
  );
  expect(
    result.filter((item) => item.field === "role").map((item) => item.value),
  ).toEqual(["Platform Engineer"]);
});
it.each([
  "Associate Degree in Network Technology",
  "Associate of Applied Science in Computing",
  "Associate's Degree in Computer Science",
  "Ph.D. in Computer Science",
])("recognizes a stated academic qualification %s", (value) => {
  const result = extractEvidenceFields([
    { text: value, id: "degree", pageId: "page-1", method: "native_text" },
  ]);
  expect(
    result
      .filter((item) => item.field === "education")
      .map((item) => item.value),
  ).toEqual([value]);
});
it("does not confuse an action beginning Associate with an academic qualification", () => {
  const result = extractEvidenceFields([
    {
      text: "Associate with colleagues to review changes",
      id: "line",
      pageId: "page-1",
      method: "native_text",
    },
  ]);
  expect(result.filter((item) => item.field === "education")).toEqual([]);
});
it.each([
  "Five years building reliable products",
  "Seattle, Washington",
  "Contributed to reporting infrastructure",
  "New York",
])(
  "does not promote a work-section introduction into an employer: %s",
  (line) => {
    const result = extractEvidenceFields(
      ["Work Experience", line].map((text, index) => ({
        text,
        id: `line-${index}`,
        pageId: "page-1",
        method: "native_text" as const,
      })),
    );
    expect(result.filter((item) => item.field === "employer")).toEqual([]);
  },
);
it("rejects an unmarked issuer after a credential while preserving multiple named credentials", () => {
  const result = extractEvidenceFields(
    [
      "Certifications",
      "Certificate in Cloud Engineering",
      "Harbor Learning Guild",
      "Cloud Fundamentals",
      "CKA",
    ].map((text, index) => ({
      text,
      id: `line-${index}`,
      pageId: "page-1",
      method: "native_text" as const,
    })),
  );
  expect(
    result
      .filter((item) => item.field === "certification")
      .map((item) => item.value),
  ).toEqual(["Certificate in Cloud Engineering", "Cloud Fundamentals", "CKA"]);
});
it.each(["March 2020 - Present", "Software Engineer | March 2020 - Present"])(
  "does not confuse the date month with an architecture degree: %s",
  (line) => {
    const result = extractEvidenceFields(
      ["Experience", line].map((text, index) => ({
        text,
        id: `line-${index}`,
        pageId: "page-1",
        method: "native_text" as const,
      })),
    );
    expect(result.filter((item) => item.field === "education")).toEqual([]);
  },
);
it.each(["Harbor Learning Council", "Awarded by Regional Technical Board"])(
  "does not turn an issuer into another certification: %s",
  (issuer) => {
    const result = extractEvidenceFields(
      ["Certifications", "Certificate in Cloud Engineering", issuer].map(
        (text, index) => ({
          text,
          id: `line-${index}`,
          pageId: "page-1",
          method: "native_text" as const,
        }),
      ),
    );
    expect(
      result
        .filter((item) => item.field === "certification")
        .map((item) => item.value),
    ).toEqual(["Certificate in Cloud Engineering"]);
  },
);
it.each([
  "Bachelors in Computer Science",
  "Masters in Data Science",
  "B. Sc. Computer Science",
])("recognizes a common written qualification %s", (value) => {
  const result = extractEvidenceFields([
    { text: value, id: "degree", pageId: "page-1", method: "native_text" },
  ]);
  expect(
    result
      .filter((item) => item.field === "education")
      .map((item) => item.value),
  ).toEqual([value]);
});
it("keeps issuer lines separate from credential titles", () => {
  const result = extractEvidenceFields(
    [
      "Certifications",
      "Certificate in Cloud Operations",
      "Harbor Learning Institute",
      "Issued by: Cloud Guild",
    ].map((text, index) => ({
      text,
      id: `line-${index}`,
      pageId: "page-1",
      method: "native_text" as const,
    })),
  );
  expect(
    result
      .filter((item) => item.field === "certification")
      .map((item) => item.value),
  ).toEqual(["Certificate in Cloud Operations"]);
});
it("recognizes a bare career heading", () => {
  const result = extractEvidenceFields(
    [
      "Career",
      "Platform Engineer at Cedar Systems",
      "January 2020 - Present",
    ].map((text, index) => ({
      text,
      id: `line-${index}`,
      pageId: "page-1",
      method: "native_text" as const,
    })),
  );
  expect(
    result.filter((item) => ["employer", "role", "dates"].includes(item.field)),
  ).toHaveLength(3);
});
it("proposes a company directly under a work heading without attaching a later cross-page role", () => {
  const source = [
    "Work Experience",
    "Cedar Digital",
    "Skills and Projects",
    "Python",
    "Backend Developer | January 2020 - June 2023",
  ].map((text, index) => ({
    text,
    id: `line-${index}`,
    pageId: index < 2 ? "page-1" : index < 4 ? "page-2" : "page-3",
    method: "local_ocr" as const,
  }));
  const result = extractEvidenceFields(source).filter(
    (item) => item.field === "employer",
  );
  expect(result).toHaveLength(1);
  expect(result[0]).toEqual(
    expect.objectContaining({
      value: "Cedar Digital",
      evidence: [{ spanId: "line-1", start: 0, end: 13 }],
      state: "review_required",
    }),
  );
});
it("excludes a comma-separated institution from the qualification candidate", () => {
  const result = extractEvidenceFields([
    {
      text: "BSc Computer Science, North Shore University",
      id: "degree",
      pageId: "page-1",
      method: "native_text",
    },
  ]);
  expect(
    result
      .filter((item) => item.field === "education")
      .map((item) => item.value),
  ).toEqual(["BSc Computer Science"]);
});
it("keeps a profile title as an unlinked proposal and recognizes a selected-work company/date header", () => {
  const source = [
    "Nora Mehta",
    "Senior Software Engineer",
    "Technical Skills",
    "Python SQL",
    "Selected Work",
    "Cobalt Digital",
    "2019 - 2022",
    "Built internal reporting tools.",
  ].map((text, index) => ({
    text,
    id: `line-${index}`,
    pageId: "page-1",
    method: "native_text" as const,
  }));
  const result = extractEvidenceFields(source).filter((item) =>
    ["employer", "role", "dates"].includes(item.field),
  );
  expect(result.map(({ field, value }) => ({ field, value }))).toEqual(
    expect.arrayContaining([
      { field: "role", value: "Senior Software Engineer" },
      { field: "employer", value: "Cobalt Digital" },
      { field: "dates", value: "2019 - 2022" },
    ]),
  );
  expect(result).toHaveLength(3);
  expect(result.every((item) => item.state === "review_required")).toBe(true);
});
it.each([
  "Aspiring Software Engineer",
  "Seeking Software Engineer opportunities",
  "Looking for a Software Engineer role",
])("does not present an aspiration as a profile role: %s", (title) => {
  const result = extractEvidenceFields(
    ["Nora Mehta", title, "Education"].map((text, index) => ({
      text,
      id: `line-${index}`,
      pageId: "page-1",
      method: "native_text" as const,
    })),
  );
  expect(result.filter((item) => item.field === "role")).toEqual([]);
});
it("extracts qualification text without a school or date suffix", () => {
  const result = extractEvidenceFields(
    [
      "Education",
      "North Shore University | BSc Computer Science | 2014 - 2018",
    ].map((text, index) => ({
      text,
      id: `line-${index}`,
      pageId: "page-1",
      method: "native_text" as const,
    })),
  );
  expect(
    result
      .filter((item) => item.field === "education")
      .map((item) => item.value),
  ).toEqual(["BSc Computer Science"]);
});
it("does not treat an education qualification or a standalone date as a certification", () => {
  const result = extractEvidenceFields(
    [
      "Certifications",
      "Cloud Practitioner",
      "2021",
      "Academic Record",
      "North Shore University | BSc Computer Science",
    ].map((text, index) => ({
      text,
      id: `line-${index}`,
      pageId: "page-1",
      method: "native_text" as const,
    })),
  );
  expect(
    result
      .filter((item) => item.field === "certification")
      .map((item) => item.value),
  ).toEqual(["Cloud Practitioner"]);
});
it.each([
  "Career Highlights",
  "Professional Engagements",
  "Selected Employment",
  "Industry Experience",
])("recognizes the independent work heading %s", (heading) => {
  const result = extractEvidenceFields(
    [heading, "Willow Digital", "Software Engineer", "2021 - 2024"].map(
      (text, index) => ({
        text,
        id: `line-${index}`,
        pageId: "page-1",
        method: "native_text" as const,
      }),
    ),
  );
  expect(
    result.filter((item) => ["employer", "role", "dates"].includes(item.field)),
  ).toHaveLength(3);
});
it.each([
  "Company name: Willow Digital",
  "Employer: Willow Digital | Role: Software Engineer | Dates: 2021 - 2024",
])("keeps explicit inline label values separate: %s", (line) => {
  const result = extractEvidenceFields([
    { text: line, id: "header", pageId: "page-1", method: "native_text" },
  ]);
  expect(result.find((item) => item.field === "employer")?.value).toBe(
    "Willow Digital",
  );
});
it("supports a source-grounded label and value on consecutive lines", () => {
  const result = extractEvidenceFields(
    [
      "Employer:",
      "Willow Digital",
      "Job role:",
      "AI Researcher",
      "Employment period:",
      "2021 - 2024",
    ].map((text, index) => ({
      text,
      id: `line-${index}`,
      pageId: "page-1",
      method: "native_text" as const,
    })),
  );
  expect(result.map(({ field, value }) => ({ field, value }))).toEqual(
    expect.arrayContaining([
      { field: "employer", value: "Willow Digital" },
      { field: "role", value: "AI Researcher" },
      { field: "dates", value: "2021 - 2024" },
    ]),
  );
});
it("does not treat a bare background heading as employment context", () => {
  const result = extractEvidenceFields(
    ["Background", "Personal archive", "Software Engineer", "2021 - 2024"].map(
      (text, index) => ({
        text,
        id: `line-${index}`,
        pageId: "page-1",
        method: "native_text" as const,
      }),
    ),
  );
  expect(
    result.filter((item) => ["employer", "role", "dates"].includes(item.field)),
  ).toEqual([]);
});
it.each(["Seattle, WA", "Senior Machine Learning"])(
  "does not infer an employer from %s",
  (line) => {
    const result = extractEvidenceFields(
      ["Experience", "Willow Digital", line, "Engineer", "2021 - 2024"].map(
        (text, index) => ({
          text,
          id: `line-${index}`,
          pageId: "page-1",
          method: "native_text" as const,
        }),
      ),
    );
    expect(
      result.some((item) => item.field === "employer" && item.value === line),
    ).toBe(false);
  },
);
it("does not turn an employment description after a dated header into another company", () => {
  const result = extractEvidenceFields(
    [
      "Experience",
      "Platform Engineer | Cobalt Digital",
      "2018 - 2022",
      "Maintained deployment automation.",
    ].map((text, index) => ({
      text,
      id: `line-${index}`,
      pageId: "page-1",
      method: "native_text" as const,
    })),
  );
  expect(
    result
      .filter((item) => item.field === "employer")
      .map((item) => item.value),
  ).toEqual(["Cobalt Digital"]);
});
it.each([
  "Selected Work Experience",
  "Professional Work History",
  "Relevant Professional Experience",
])("recognizes a qualified employment heading %s", (heading) => {
  const result = extractEvidenceFields(
    [heading, "Platform Engineer", "2018 - 2022", "Cobalt Digital"].map(
      (text, index) => ({
        text,
        id: `line-${index}`,
        pageId: "page-1",
        method: "native_text" as const,
      }),
    ),
  );
  expect(
    result
      .filter((item) => item.field === "employer")
      .map((item) => item.value),
  ).toEqual(["Cobalt Digital"]);
  expect(
    result.filter((item) => item.field === "dates").map((item) => item.value),
  ).toEqual(["2018 - 2022"]);
});
it("does not include a neighbouring contact label in a labelled phone", () => {
  const result = extractEvidenceFields([
    {
      text: "Phone: 2025550198 | Email: contact@example.test",
      id: "contact",
      pageId: "page-1",
      method: "native_text",
    },
  ]);
  expect(
    result.filter((item) => item.field === "phone").map((item) => item.value),
  ).toEqual(["2025550198"]);
});
it.each([
  ["Willow Digital | January 2021 - December 2023", "Software Engineer"],
  ["Willow Digital, Software Engineer", "2020 - 2024"],
])(
  "retains the employer in an independently authored header %s",
  (first, second) => {
    const result = extractEvidenceFields(
      ["Work Experience", first, second].map((text, index) => ({
        text,
        id: `line-${index}`,
        pageId: "page-1",
        method: "native_text" as const,
      })),
    );
    expect(
      result
        .filter((item) => item.field === "employer")
        .map((item) => item.value),
    ).toEqual(["Willow Digital"]);
    expect(
      result.filter((item) => item.field === "role").map((item) => item.value),
    ).toEqual(["Software Engineer"]);
  },
);
it.each([
  ["2020-01 - 2023-12 | +1 415 555 0198", ["+1 415 555 0198"]],
  ["Born 15/06/1995", []],
  ["Phone: +1 415 555 2020", ["+1 415 555 2020"]],
])("searches past date-like contact candidates in %s", (line, expected) => {
  const result = extractEvidenceFields([
    { text: line, id: "contact", pageId: "page-1", method: "native_text" },
  ]);
  expect(
    result.filter((item) => item.field === "phone").map((item) => item.value),
  ).toEqual(expected);
});
it.each([
  ["Career Experience", "QA Tester - Cobalt Digital", "QA Tester"],
  ["Professional Background", "SDE II | Cobalt Digital", "SDE II"],
  ["Employment", "Product Owner at Cobalt Digital", "Product Owner"],
  ["Experience", "Platform Engineer - Cobalt Digital", "Platform Engineer"],
])(
  "separates a generic employment header under %s",
  (heading, header, role) => {
    const result = extractEvidenceFields(
      [heading, header, "2018 - 2022"].map((text, index) => ({
        text,
        id: `line-${index}`,
        pageId: "page-1",
        method: "native_text" as const,
      })),
    );
    expect(
      result
        .filter((item) => ["employer", "role"].includes(item.field))
        .map(({ field, value }) => ({ field, value })),
    ).toEqual(
      expect.arrayContaining([
        { field: "role", value: role },
        { field: "employer", value: "Cobalt Digital" },
      ]),
    );
  },
);
it.each(["2018-09 - 2022-11", "09.2018 - 11.2022", "2018/09 to 2022/11"])(
  "does not treat a numeric employment range as a phone: %s",
  (dates) => {
    const result = extractEvidenceFields(
      [
        "Experience",
        "Platform Engineer",
        "Cobalt Digital",
        dates,
        "Phone: +1 202 555 0191",
      ].map((text, index) => ({
        text,
        id: `line-${index}`,
        pageId: "page-1",
        method: "native_text" as const,
      })),
    );
    expect(
      result.filter((item) => item.field === "phone").map((item) => item.value),
    ).toEqual(["+1 202 555 0191"]);
  },
);
it("keeps employment header context across blank OCR lines", () => {
  const result = extractEvidenceFields(
    [
      "Experience",
      "",
      "Platform Engineer",
      "",
      "Cobalt Digital",
      "",
      "2018 - 2022",
    ].map((text, index) => ({
      text,
      id: `line-${index}`,
      pageId: "page-1",
      method: "local_ocr" as const,
    })),
  );
  expect(
    result
      .filter((item) => item.field === "employer")
      .map((item) => item.value),
  ).toEqual(["Cobalt Digital"]);
});
it.each([
  [
    "Platform Lead",
    "Cloud Forge LLP",
    "Platform Lead — Cloud Forge LLP",
    "Certificates",
  ],
  [
    "Site Reliability Engineer",
    "Clearwater Limited",
    "Clearwater Limited, Site Reliability Engineer",
    "Certifications and Training",
  ],
  [
    "Principal SRE",
    "Evergreen Technologies",
    "Principal SRE | Evergreen Technologies",
    "Credentials",
  ],
])(
  "handles development heading/header combinations for %s",
  (role, employer, header, heading) => {
    const text = [
      "Curriculum Vitae",
      "Arun Silva",
      "arun@example.test",
      "+1 202 555 0119",
      "Experience",
      header,
      "2020 - 2024",
      "Delivered reliable systems.",
      "Education",
      "M.Eng. in Computer Science",
      heading,
      "Microsoft Azure Fundamentals",
    ];
    const result = extractEvidenceFields(
      text.map((text, index) => ({
        text,
        id: `line-${index}`,
        pageId: "page-1",
        method: "native_text" as const,
      })),
    );
    expect(result.map(({ field, value }) => ({ field, value }))).toEqual(
      expect.arrayContaining([
        { field: "name", value: "Arun Silva" },
        { field: "role", value: role },
        { field: "employer", value: employer },
        { field: "education", value: "M.Eng. in Computer Science" },
        { field: "certification", value: "Microsoft Azure Fundamentals" },
      ]),
    );
    expect(result).toHaveLength(8);
  },
);
it.each(EXTRACTION_REPAIR_DEVELOPMENT_FAMILIES)(
  "recovers exact, unconfirmed development fields: $id",
  (family) => {
    const spans = family.lines.map((text, index) => ({
      id: `line-${index}`,
      pageId: "page-1",
      method: "native_text" as const,
      text,
    }));
    const candidates = extractEvidenceFields(spans);
    expect(
      candidates
        .map(({ field, value }) => ({ field, value }))
        .sort((a, b) => a.field.localeCompare(b.field)),
    ).toEqual(
      CRITICAL_FIELDS.map((field) => ({
        field,
        value: family.fields[field],
      })).sort((a, b) => a.field.localeCompare(b.field)),
    );
    for (const candidate of candidates) {
      expect(candidate.state).toBe("review_required");
      expect(candidate.confidence).toEqual({
        kind: "uncalibrated",
        value: null,
      });
      const ref = candidate.evidence[0];
      expect(
        Array.from(spans.find((s) => s.id === ref.spanId)!.text)
          .slice(ref.start, ref.end)
          .join(""),
      ).toBe(candidate.value);
    }
  },
);
