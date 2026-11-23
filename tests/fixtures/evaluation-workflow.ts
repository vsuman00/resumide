import { createHash } from "node:crypto";
import { syntheticPdf } from "./native-pdf";
import { createEvaluationCorpusRecord } from "./evaluation-corpus";

export const WORKFLOW_AS_OF = "2026-11-07T00:00:00Z";
export const WORKFLOW_CORPUS_VERSION = "synthetic_workflow_v1";
export const WORKFLOW_SERIALIZER = "native-pdf/ascii-xref-v1";
const digest = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
const escape = (value: string) => value.replace(/([\\()])/gu, "\\$1");
function stream(lines: string[], family: number) {
  const [x, y, size, gap] = [
    [50, 750, 12, 18],
    [82, 730, 11, 22],
    [40, 760, 10, 17],
  ][family];
  return `BT /F1 ${size} Tf ${x} ${y} Td ${lines.map((line, index) => `${index ? `0 -${gap} Td ` : ""}(${escape(line)}) Tj`).join(" ")} ET`;
}

/** Three authored composition families share a PDF serializer, not independent real-data provenance. */
export function createEvaluationWorkflowFixture() {
  const sizes = [8, 4, 8];
  const partitions = ["development", "calibration", "locked_test"] as const;
  const documents = sizes.flatMap((size, family) =>
    Array.from({ length: size }, (_, index) => {
      const id = `workflow_source_${family}_${index}`;
      const name = `Fictional Profile ${family}${index}`;
      const email = `profile-${family}-${index}@example.test`;
      const phone = `+1 202 555 01${family}${index}`;
      const employer = `Fictional Employer ${family}${index}`;
      const rich = index % 4 === 0;
      const cohort =
        index % 4 < 2 || (family !== 2 && index % 4 === 2)
          ? "native"
          : index % 4 === 2
            ? "simulated_scanned"
            : "simulated_mixed";
      const contact = [`Name: ${name}`, `Email: ${email}`, `Phone: ${phone}`];
      const experience = [
        "Experience",
        `Employer: ${employer}`,
        "Role: Software Engineer",
        "Built reliable services",
      ];
      const education = ["Education", "Education: Bachelor"];
      const skills = ["Skills", ...(rich ? ["Python", "SQL"] : ["TypeScript"])];
      // Composition/ordering, wording and geometry are separate authored templates.
      const lines =
        family === 0
          ? [
              ...contact,
              "Summary",
              "Backend service development",
              ...experience,
              ...education,
              ...skills,
            ]
          : family === 1
            ? [
                ...contact,
                ...skills,
                "Projects",
                "Built bounded API components",
                ...education,
                ...experience,
              ]
            : [
                ...contact,
                ...experience,
                ...skills,
                "Projects",
                "Maintained application workflows",
                ...education,
              ];
      const text = lines.join("\n");
      const bytes =
        cohort === "simulated_scanned"
          ? syntheticPdf("", 0, 1 + Math.floor(index / 4))
          : cohort === "simulated_mixed"
            ? syntheticPdf([stream(lines, family), ""])
            : syntheticPdf(stream(lines, family));
      const sourceHash = digest(bytes);
      const jd =
        family === 0
          ? "Requirements\nPython required\nPreferred\nSQL preferred"
          : family === 1
            ? "Required Skills\nMust have Python\nNice to have\nSQL"
            : "Minimum Qualifications\nPython\nPreferred Qualifications\nSQL";
      const metadata = createEvaluationCorpusRecord();
      metadata.id = id;
      metadata.contentHash = sourceHash;
      metadata.partition = partitions[family];
      metadata.provenance.sourceFamilyId = `authored_family_${family}`;
      metadata.provenance.templateId = `authored_template_${family}`;
      metadata.provenance.nearDuplicateGroupId = `related_documents_${family}`;
      metadata.segment.documentClass =
        cohort === "native"
          ? "native"
          : cohort === "simulated_scanned"
            ? "scanned"
            : "mixed";
      return {
        id,
        bytes,
        sourceHash,
        metadata,
        cohort,
        family,
        partition: partitions[family],
        serializer: WORKFLOW_SERIALIZER,
        // Empty-page controls are not actual scanned resumes or OCR validation.
        simulatedOcrControl: cohort !== "native",
        text,
        jd,
        rich,
        reference:
          cohort === "simulated_scanned"
            ? null
            : {
                name,
                email,
                phone,
                employer,
                skills: rich ? ["Python", "SQL"] : ["TypeScript"],
                originalBullet: "Built reliable services",
                expectsOcr: cohort !== "native",
              },
      };
    }),
  );
  const families = [
    "critical_fields",
    "requirements",
    "reading_order",
    "evidence_spans",
    "expert_rubric",
    "ambiguity",
    "unsupported_boundaries",
  ];
  const handbookHash = digest(
    "Synthetic known-source workflow handbook v1; technical regression only",
  );
  const annotationEvidence = {
    schemaVersion: 1,
    provenance: "synthetic",
    handbookHash,
    annotators: ["synthetic_ai_annotator_1", "synthetic_ai_annotator_2"].map(
      (id) => ({
        id,
        kind: "ai",
        trainingHandbookHash: handbookHash,
        independent: false,
        blindedToOtherLabels: false,
        blindedToModelOutput: false,
      }),
    ),
    adjudicator: {
      id: "synthetic_ai_adjudicator",
      kind: "ai",
      trainingHandbookHash: handbookHash,
      blindedToModelOutput: false,
      blindedToAnnotatorIdentity: false,
    },
    declaredFamilies: families,
    units: documents.flatMap((doc, index) =>
      families.map((family, labelIndex) => {
        const labelHash = digest(
          JSON.stringify({
            family,
            knownSyntheticReference: doc.reference,
            cohort: doc.cohort,
          }),
        );
        return {
          id: `label_unit_${index}_${labelIndex}`,
          sourceId: doc.id,
          sourceHash: doc.sourceHash,
          family,
          critical: true,
          submissions: [
            "synthetic_ai_annotator_1",
            "synthetic_ai_annotator_2",
          ].map((annotatorId, rater) => ({
            id: `label_submission_${index}_${labelIndex}_${rater}`,
            annotatorId,
            labelHash,
            handbookHash,
            sourceHash: doc.sourceHash,
            submittedAt: WORKFLOW_AS_OF,
          })),
        };
      }),
    ),
  };
  const partitionInput = {
    schemaVersion: 1,
    corpusVersion: WORKFLOW_CORPUS_VERSION,
    annotationEvidence,
    accessGroups: {
      development: ["workflow_development_group"],
      calibration: ["workflow_calibration_group"],
      locked_test: ["workflow_locked_group"],
    },
    records: documents.map((doc) => ({
      id: doc.id,
      contentHash: doc.sourceHash,
      partition: doc.partition,
      clusters: {
        person: [`fictional_person_${doc.family}_${doc.id}`],
        employer:
          doc.cohort === "simulated_scanned"
            ? {
                status: "not_applicable",
                reasonReference: "empty_control_no_employer",
                evidenceReference: "authored_empty_control",
              }
            : {
                status: "known",
                ids: [`fictional_employer_${doc.family}_${doc.id}`],
              },
        template: [doc.metadata.provenance.templateId],
        sourceFamily: [doc.metadata.provenance.sourceFamilyId],
        nearDuplicate: [doc.metadata.provenance.nearDuplicateGroupId],
      },
    })),
  };
  return {
    documents,
    partitionInput,
    manifestHash: digest(
      JSON.stringify(
        documents.map((doc) => ({
          id: doc.id,
          sourceHash: doc.sourceHash,
          partition: doc.partition,
          cohort: doc.cohort,
          family: doc.family,
          serializer: doc.serializer,
        })),
      ),
    ),
  };
}
export type EvaluationWorkflowDocument = ReturnType<
  typeof createEvaluationWorkflowFixture
>["documents"][number];
