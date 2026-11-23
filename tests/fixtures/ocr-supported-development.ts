import { createHash } from "node:crypto";
import { createOcrPrintFixture, type Family } from "./ocr-print-pilot";

export const OCR_SUPPORTED_DEVELOPMENT_VERSION =
  "ocr-reliability-development/1.0.0";
export const OCR_SUPPORTED_DEVELOPMENT_SEGMENTS = [
  "clean",
  "challenging",
  "mixed",
] as const;

// Fresh original synthetic DEVELOPMENT content. These are not held-out sources
// and do not replace any prior calibration/locked/regression family.
export const OCR_SUPPORTED_DEVELOPMENT_FAMILIES = [
  {
    id: "reliability-dev-saffron-data-20261110",
    partition: "development",
    left: 44,
    top: 66,
    gap: 28,
    fields: {
      name: "Demo Candidate Saffron",
      email: "saffron.dev@example.test",
      phone: "0000000000",
      employer: "Fictional Saffron Data Lab",
      role: "Data Software Engineer",
      dates: "2020 - 2023",
      education: "BSc Information Systems",
      certification: "Demo SQL Certificate",
    },
    lines: [
      "Demo Candidate Saffron",
      "Contact Details",
      "Email: saffron.dev@example.test",
      "Phone: 0000000000",
      "Data Engineering Profile",
      "Experience",
      "Fictional Saffron Data Lab",
      "Data Software Engineer",
      "2020 - 2023",
      "Maintained Python data validation services.",
      "Skills: Python, SQL, data pipelines",
      "Education: BSc Information Systems",
      "Certification: Demo SQL Certificate",
      "Fictional development fixture - no real candidate",
    ],
  },
  {
    id: "reliability-dev-mistral-security-20261110",
    partition: "development",
    left: 56,
    top: 72,
    gap: 25,
    fields: {
      name: "Demo Candidate Mistral",
      email: "mistral.dev@example.test",
      phone: "0000000000",
      employer: "Fictional Mistral Access Lab",
      role: "Security Software Engineer",
      dates: "2021 - 2024",
      education: "BEng Software Engineering",
      certification: "Demo Security Certificate",
    },
    lines: [
      "Security Engineering Profile",
      "Demo Candidate Mistral",
      "mistral.dev@example.test",
      "Phone: 0000000000",
      "Qualifications",
      "Demo Security Certificate",
      "BEng Software Engineering",
      "Work History",
      "Security Software Engineer",
      "Fictional Mistral Access Lab",
      "2021 - 2024",
      "Built TypeScript access audit tools.",
      "Skills: TypeScript, Linux, testing",
      "Fictional development fixture - no real candidate",
    ],
  },
] as const satisfies readonly Family[];

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export async function createOcrSupportedDevelopmentFixtures() {
  const fixtures = [];
  for (const [
    familyIndex,
    family,
  ] of OCR_SUPPORTED_DEVELOPMENT_FAMILIES.entries()) {
    for (const segment of OCR_SUPPORTED_DEVELOPMENT_SEGMENTS) {
      const fixture = await createOcrPrintFixture(familyIndex, segment, family);
      fixtures.push({
        ...fixture,
        manifest: {
          ...fixture.manifest,
          collectionVersion: OCR_SUPPORTED_DEVELOPMENT_VERSION,
          familyDefinitionSha256: hash(JSON.stringify(family)),
          expectedTextSha256: hash(JSON.stringify(fixture.expectedPageTexts)),
          labelsSha256: hash(JSON.stringify(fixture.labels)),
          lineOrderSha256: hash(JSON.stringify(fixture.expectedLineOrder)),
          purpose: "ocr_reliability_development_only",
          registrationStage: "before_recognition",
          recognitionExecuted: false,
          qualityStatus: "not_evaluated",
        },
      });
    }
  }
  return fixtures;
}
