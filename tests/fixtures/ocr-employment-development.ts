import { createOcrPrintFixture, type Family } from "./ocr-print-pilot";

const families = [
  {
    id: "reliability-dev-paperbridge-employment",
    partition: "development",
    left: 48,
    top: 80,
    gap: 28,
    fields: {
      name: "Demo Candidate Juniper",
      email: "juniper.paperbridge@example.test",
      phone: "0000000000",
      employer: "Fictional Paperbridge Studio",
      role: "Data Software Engineer",
      dates: "May 2021 - Aug 2023",
      education: "BSc Data Engineering",
      certification: "Demo Database Certificate",
    },
    lines: [
      "Demo Candidate Juniper",
      "Email: juniper.paperbridge@example.test",
      "Phone: 0000000000",
      "Employment Details",
      "Data Software Engineer",
      "Fictional Paperbridge Studio",
      "May 2021 - Aug 2023",
      "Built document checks and batch imports.",
      "Skills: SQL and Python",
      "Education: BSc Data Engineering",
      "Certification: Demo Database Certificate",
      "Documentation and validation",
      "Data stewardship",
      "Synthetic engineering fixture",
    ],
  },
  {
    id: "reliability-dev-driftwood-employment",
    partition: "development",
    left: 58,
    top: 70,
    gap: 25,
    fields: {
      name: "Demo Candidate Rowan",
      email: "rowan.driftwood@example.test",
      phone: "0000000000",
      employer: "Fictional Driftwood Studio",
      role: "Platform Engineer",
      dates: "Sep 2020 - Nov 2022",
      education: "BEng Software Engineering",
      certification: "Demo Platform Certificate",
    },
    lines: [
      "Demo Candidate Rowan",
      "Email: rowan.driftwood@example.test",
      "Phone: 0000000000",
      "Work History",
      "Platform Engineer @ Fictional Driftwood Studio | Sep 2020 - Nov 2022",
      "Maintained scheduled tasks and build tools.",
      "Wrote troubleshooting notes.",
      "Education: BEng Software Engineering",
      "Certification: Demo Platform Certificate",
      "Skills: TypeScript and Linux",
      "Release engineering",
      "Fictional training example",
    ],
  },
] as const satisfies readonly Family[];

export async function createOcrEmploymentDevelopmentFixtures() {
  const fixtures = [];
  for (const [index, family] of families.entries())
    for (const segment of ["clean", "challenging", "mixed"] as const)
      fixtures.push(await createOcrPrintFixture(index, segment, family));
  return fixtures;
}

const workplaceFamilies = [
  {
    id: "reliability-dev-copper-workplace",
    partition: "development",
    left: 46,
    top: 74,
    gap: 27,
    fields: {
      name: "Demo Candidate Hazel",
      email: "hazel.copper@example.test",
      phone: "0000000000",
      employer: "Fictional Copper Systems",
      role: "Data Engineer",
      dates: "May 2021 - Aug 2023",
      education: "BSc Applied Computing",
      certification: "Demo Data Quality Certificate",
    },
    lines: [
      "Demo Candidate Hazel",
      "Email: hazel.copper@example.test",
      "Phone: 0000000000",
      "Work History",
      "Data Engineer | Fictional Copper Systems | Remote | May 2021 - Aug 2023",
      "Checked 10 input files; sorted archive labels A–Z.",
      "Skills: SQL and validation",
      "Education: BSc Applied Computing",
      "Certification: Demo Data Quality Certificate",
      "Small batch documentation",
      "Synthetic fixture notes",
      "Original engineering example",
    ],
  },
  {
    id: "reliability-dev-lantern-workplace",
    partition: "development",
    left: 57,
    top: 83,
    gap: 25,
    fields: {
      name: "Demo Candidate Aspen",
      email: "aspen.lantern@example.test",
      phone: "0000000000",
      employer: "Fictional Lantern Studio",
      role: "Platform Engineer",
      dates: "Jan 2019 - Dec 2021",
      education: "BEng Systems Engineering",
      certification: "Demo Release Certificate",
    },
    lines: [
      "Demo Candidate Aspen",
      "Email: aspen.lantern@example.test",
      "Phone: 0000000000",
      "Professional Experience",
      "Fictional Lantern Studio | Platform Engineer | Hybrid | Jan 2019 - Dec 2021",
      "Wrote version notes (v1.0) and verified short links.",
      "Skills: Linux and TypeScript",
      "Education: BEng Systems Engineering",
      "Certification: Demo Release Certificate",
      "Release documentation",
      "Synthetic fixture notes",
      "Original engineering example",
    ],
  },
] as const satisfies readonly Family[];

export async function createOcrWorkplaceDevelopmentFixtures() {
  const fixtures = [];
  for (const [index, family] of workplaceFamilies.entries())
    for (const segment of ["clean", "challenging", "mixed"] as const)
      fixtures.push(await createOcrPrintFixture(index, segment, family));
  return fixtures;
}
