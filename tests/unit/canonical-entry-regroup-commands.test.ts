import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildNativeEvidence } from "../../app/lib/server/native-evidence";
import { reconcileDocumentEvidence } from "../../app/lib/server/document-evidence";
import { deriveNativePageDiagnostics } from "../../app/lib/server/ocr/pdf-detection";
import { deriveEvidenceReviewTargets } from "../../app/lib/server/evidence-targets";
import { deriveEvidenceEntryAssociations } from "../../app/lib/server/evidence-entry-associations";
import {
  importCanonicalEvidence,
  reviseCanonical,
} from "../../app/lib/server/canonical-content";
import {
  CanonicalResumeDraftSchema,
  type CanonicalResumeDraft,
} from "../../app/lib/server/canonical-resume-schema";
import { projectCanonicalCorrectionSourceChoices } from "../../app/lib/server/canonical-corrections";
import { prepareCanonicalEntryRegroup } from "../../app/lib/server/canonical-entry-regroup";
import { encodeGroupedImportCommandAtoms } from "../../app/lib/server/grouped-import-command-codec";
import {
  prepareCanonicalEntryRegroupCommand,
  normalizeCanonicalEntryRegroupCommand,
  CanonicalEntryRegroupRequestSchema,
  CanonicalEntryRegroupCommandSchema,
  type CanonicalEntryRegroupCommandContext,
  type CanonicalEntryRegroupRequest,
  type CanonicalEntryRegroupCommandPreparation,
} from "../../app/lib/server/canonical-entry-regroup-commands";
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const defaultText =
  "Experience\nEmployer: Synthetic Alpha Labs\nRole: Platform Engineer\nDates: 2020 - 2022\nEmployer: Synthetic Beta Labs\nRole: Data Engineer\nDates: 2021 - 2023";
function stableBase(doc: CanonicalResumeDraft) {
  const identities = [
    doc.versionId,
    ...doc.facts.map((f) => f.id),
    ...doc.sections.flatMap((s) => [
      s.id,
      ...s.entries.flatMap((e) => [e.id, ...e.bullets.map((b) => b.id)]),
    ]),
    ...doc.changes.map((c) => c.id),
  ];
  const mapped = new Map(
    identities.map((value, index) => [value, id(100 + index)]),
  );
  const stable = JSON.parse(
    JSON.stringify(doc, (_key, value) =>
      typeof value === "string" && mapped.has(value)
        ? mapped.get(value)
        : value,
    ),
  );
  stable.createdAt = "2026-11-13T00:00:00.000Z";
  for (const event of stable.changes) event.createdAt = stable.createdAt;
  return CanonicalResumeDraftSchema.parse(stable);
}
function fixture(text = defaultText): CanonicalEntryRegroupCommandContext {
  const evidence = reconcileDocumentEvidence(
    {
      id: id(1),
      ownerId: id(2),
      analysisId: id(3),
      sourceId: id(4),
      inputSha256: "a".repeat(64),
      createdAt: "2026-11-13T00:00:00.000Z",
      retentionPolicyId: "synthetic/1.0.0",
    },
    buildNativeEvidence([text]),
  );
  const ownedContext = {
    ownerId: id(2),
    analysisId: id(3),
    sourceId: id(4),
    inputSha256: "a".repeat(64),
    attemptId: id(1),
    resumeId: id(5),
    organizationId: id(6),
  };
  const targets = deriveEvidenceReviewTargets(evidence, ownedContext),
    base = stableBase(importCanonicalEvidence(evidence, ownedContext));
  const context: CanonicalEntryRegroupCommandContext = {
    sqlBaseContentSha256: "b".repeat(64),
    historicalBaseView: {
      canonicalRevision: 1,
      ownedContext,
      review: {
        analysisId: id(3),
        attemptId: id(1),
        attemptNumber: 1,
        evidence,
        corrections: [],
        revision: 0,
        scoringEligible: false,
        nativePageDiagnostics: deriveNativePageDiagnostics(
          evidence.nativeSource,
        ),
        targets,
      },
      expectedBinding: {
        ...targets.binding,
        resumeId: id(5),
        organizationId: id(6),
        targetModelVersion: targets.modelVersion,
        projectionModelVersion: "canonical-corrections/1.0.1",
        reviewRevision: 0,
        canonicalHeadId: base.versionId,
      },
      canonicalSnapshot: {
        sourceId: id(4),
        headId: base.versionId,
        current: base,
        ancestors: [],
      },
      selections: [],
    },
  };
  attest(context);
  return context;
}
function attest(context: CanonicalEntryRegroupCommandContext) {
  const v = context.historicalBaseView;
  v.review.historyAttestation = {
    schemaVersion: "evidence-review-history/1.0.0",
    state: "complete_captured_prefix",
    binding: {
      ...v.review.targets.binding,
      targetModelVersion: v.review.targets.modelVersion,
    },
    highWaterRevision: v.review.revision,
    highWaterEventId: v.review.corrections.at(-1)?.id ?? null,
    receivedCount: v.review.corrections.length,
    pageCount: Math.ceil(v.review.corrections.length / 100),
  };
  v.expectedBinding.reviewRevision = v.review.revision;
}
function request(
  context: CanonicalEntryRegroupCommandContext,
): CanonicalEntryRegroupRequest {
  const v = context.historicalBaseView,
    groups = deriveEvidenceEntryAssociations(
      v.review.evidence,
      v.ownedContext,
    ).groups;
  const choices =
    projectCanonicalCorrectionSourceChoices(v).choicesBySourceTarget;
  return {
    schemaVersion: "canonical-entry-regroup-command/1.0.0",
    operation: "approve_whole_entry_regroup",
    binding: {
      ...v.ownedContext,
      evidenceSchemaVersion: "evidence/2.0.0",
      fieldExtractorVersion: "evidence-fields/1.0.1",
      targetModelVersion: "evidence-targets/1.0.0",
      associationModelVersion: "evidence-entry-associations/1.0.0",
      producerVersion: "canonical-engine/1.0.4",
      admissionPolicyVersion: "whole-entry-regroup-admission/1.0.0",
      structuralTextProfileVersion: "a02-structural-text/1.0.0",
      correctionProjectionModelVersion: "canonical-corrections/1.0.1",
      correctionAdmissionPolicyVersion: "candidate-correction-admission/1.0.0",
      regroupModelVersion: "canonical-entry-regroup/1.0.0",
    },
    base: {
      versionId: v.canonicalSnapshot!.current.versionId,
      revision: v.canonicalRevision,
      contentSha256: context.sqlBaseContentSha256,
      locale: v.canonicalSnapshot!.current.locale,
    },
    expected: {
      reviewRevision: v.review.revision,
      reviewHeadId: v.review.corrections.at(-1)?.id ?? null,
      assignmentRevision: 0,
      assignmentHeadId: null,
      associationRevision: 0,
      associationHeadId: null,
      regroupRevision: 0,
      regroupHeadId: null,
      canonicalHeadId: v.canonicalSnapshot!.headId,
    },
    selections: groups.map((g) => ({
      groupId: g.id,
      factIds: g.members.map((m) => choices.get(m.targetId)![0].factId),
    })),
    unselectedDisposition: "retain_eligible_original_origins",
  };
}
function prepared(value: CanonicalEntryRegroupCommandPreparation) {
  expect(value.state).toBe("prepared");
  if (value.state !== "prepared") throw Error("EXPECTED_PREPARED");
  return value;
}
function commit(context: CanonicalEntryRegroupCommandContext) {
  const raw = request(context),
    p = prepared(prepareCanonicalEntryRegroupCommand(context, raw));
  return {
    ...raw,
    acknowledgement: true as const,
    previewHash: p.previewHash,
    idempotencyKey: id(900),
  };
}
describe("real whole-entry command normalization", () => {
  it("derives an actual two-job normal form and captures an explicit placeholder-native-SHA oracle", () => {
    const context = fixture(),
      raw = request(context),
      p = prepared(prepareCanonicalEntryRegroupCommand(context, raw));
    expect(p.normalForm.selections).toHaveLength(2);
    expect(p.semanticAtoms).toHaveLength(140);
    expect(p.semanticAtoms[21]).toBe("b".repeat(64));
    expect(p.previewHash).toBe(
      createHash("sha256")
        .update(encodeGroupedImportCommandAtoms(p.semanticAtoms))
        .digest("hex"),
    );
    expect(JSON.stringify(p.normalForm)).not.toMatch(
      /entry-association-|observationId|targetId|sourceValue|currentValue|contentDigest/,
    );
    expect(
      normalizeCanonicalEntryRegroupCommand(context, commit(context)),
    ).toMatchObject({
      state: "prepared",
      normalForm: p.normalForm,
      previewHash: p.previewHash,
      idempotencyKey: id(900),
    });
    expect(p.normalForm).toEqual(NODE_REGROUP_LITERAL.normalForm);
    expect(p.semanticAtoms).toEqual(NODE_REGROUP_LITERAL.semanticAtoms);
    expect(p.previewHash).toBe(NODE_REGROUP_LITERAL.previewHash);
    expect(context.historicalBaseView.review.evidence).toEqual(
      NODE_REGROUP_LITERAL.evidence,
    );
    expect(context.historicalBaseView.canonicalSnapshot!.current).toEqual(
      NODE_REGROUP_LITERAL.base,
    );
  });
  it("keeps all32x3 genuine source/Core selections within actual wire/framing budgets", () => {
    const text =
      "Experience\n" +
      Array.from(
        { length: 32 },
        (_, i) =>
          `Employer: Synthetic Employer ${i}\nRole: Synthetic Role ${i}\nDates: 2020 - 2022`,
      ).join("\n");
    const c = fixture(text),
      raw = commit(c),
      p = prepared(prepareCanonicalEntryRegroupCommand(c, request(c)));
    expect(p.normalForm.selections).toHaveLength(32);
    expect(p.semanticAtoms).toHaveLength(1700);
    expect(
      encodeGroupedImportCommandAtoms(p.semanticAtoms).byteLength,
    ).toBeLessThanOrEqual(131072);
    const wire = new URLSearchParams({
      command: JSON.stringify(raw),
      wholeEntryAcknowledgement: "accepted",
    }).toString();
    expect(Buffer.byteLength(wire, "utf8")).toBeLessThanOrEqual(16384);
    expect(CanonicalEntryRegroupCommandSchema.safeParse(raw).success).toBe(
      true,
    );
  });
});

// Frozen actual Node/Core oracle. Base SHA is a placeholder, not a JS/native digest claim.
// Native verifier may substitute ONLY normalForm.base.contentSha256 and semanticAtoms[21].
export const NODE_REGROUP_LITERAL_JSON = String.raw`{
  "evidence": {
    "id": "10000000-0000-4000-8000-000000000001",
    "ownerId": "10000000-0000-4000-8000-000000000002",
    "analysisId": "10000000-0000-4000-8000-000000000003",
    "sourceId": "10000000-0000-4000-8000-000000000004",
    "inputSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "createdAt": "2026-11-13T00:00:00.000Z",
    "retentionPolicyId": "synthetic/1.0.0",
    "schemaVersion": "evidence/2.0.0",
    "fieldExtractorVersion": "evidence-fields/1.0.1",
    "nativeSource": {
      "schemaVersion": "native-evidence-v1",
      "extractorVersion": "unpdf-v1",
      "offsetUnit": "unicode_code_point",
      "pages": [
        {
          "id": "page-1",
          "pageNumber": 1,
          "text": "Experience\nEmployer: Synthetic Alpha Labs\nRole: Platform Engineer\nDates: 2020 - 2022\nEmployer: Synthetic Beta Labs\nRole: Data Engineer\nDates: 2021 - 2023",
          "method": "native_text",
          "confidence": "uncalibrated"
        }
      ],
      "spans": [
        {
          "id": "page-1-line-1",
          "pageId": "page-1",
          "start": 0,
          "end": 10,
          "text": "Experience"
        },
        {
          "id": "page-1-line-2",
          "pageId": "page-1",
          "start": 11,
          "end": 41,
          "text": "Employer: Synthetic Alpha Labs"
        },
        {
          "id": "page-1-line-3",
          "pageId": "page-1",
          "start": 42,
          "end": 65,
          "text": "Role: Platform Engineer"
        },
        {
          "id": "page-1-line-4",
          "pageId": "page-1",
          "start": 66,
          "end": 84,
          "text": "Dates: 2020 - 2022"
        },
        {
          "id": "page-1-line-5",
          "pageId": "page-1",
          "start": 85,
          "end": 114,
          "text": "Employer: Synthetic Beta Labs"
        },
        {
          "id": "page-1-line-6",
          "pageId": "page-1",
          "start": 115,
          "end": 134,
          "text": "Role: Data Engineer"
        },
        {
          "id": "page-1-line-7",
          "pageId": "page-1",
          "start": 135,
          "end": 153,
          "text": "Dates: 2021 - 2023"
        }
      ],
      "assertions": [
        {
          "field": "name",
          "value": null,
          "state": "not_evaluated",
          "confidence": "uncalibrated",
          "evidence": null
        },
        {
          "field": "email",
          "value": null,
          "state": "not_evaluated",
          "confidence": "uncalibrated",
          "evidence": null
        },
        {
          "field": "phone",
          "value": null,
          "state": "not_evaluated",
          "confidence": "uncalibrated",
          "evidence": null
        }
      ]
    },
    "ocrSource": null,
    "ocrFailure": null,
    "status": "review_required",
    "scoringEligible": false,
    "confidence": {
      "kind": "uncalibrated",
      "reason": "calibration_not_approved"
    },
    "spans": [
      {
        "id": "native-page-1-line-1",
        "pageId": "page-1",
        "method": "native_text",
        "text": "Experience",
        "start": 0,
        "end": 10,
        "box": null,
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "native-page-1-line-2",
        "pageId": "page-1",
        "method": "native_text",
        "text": "Employer: Synthetic Alpha Labs",
        "start": 11,
        "end": 41,
        "box": null,
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "native-page-1-line-3",
        "pageId": "page-1",
        "method": "native_text",
        "text": "Role: Platform Engineer",
        "start": 42,
        "end": 65,
        "box": null,
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "native-page-1-line-4",
        "pageId": "page-1",
        "method": "native_text",
        "text": "Dates: 2020 - 2022",
        "start": 66,
        "end": 84,
        "box": null,
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "native-page-1-line-5",
        "pageId": "page-1",
        "method": "native_text",
        "text": "Employer: Synthetic Beta Labs",
        "start": 85,
        "end": 114,
        "box": null,
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "native-page-1-line-6",
        "pageId": "page-1",
        "method": "native_text",
        "text": "Role: Data Engineer",
        "start": 115,
        "end": 134,
        "box": null,
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "native-page-1-line-7",
        "pageId": "page-1",
        "method": "native_text",
        "text": "Dates: 2021 - 2023",
        "start": 135,
        "end": 153,
        "box": null,
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      }
    ],
    "assertions": [
      {
        "id": "assertion-1",
        "field": "employer",
        "value": "Synthetic Alpha Labs",
        "evidence": [
          {
            "spanId": "native-page-1-line-2",
            "start": 10,
            "end": 30
          }
        ],
        "state": "review_required",
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "assertion-2",
        "field": "role",
        "value": "Platform Engineer",
        "evidence": [
          {
            "spanId": "native-page-1-line-3",
            "start": 6,
            "end": 23
          }
        ],
        "state": "review_required",
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "assertion-3",
        "field": "dates",
        "value": "2020 - 2022",
        "evidence": [
          {
            "spanId": "native-page-1-line-4",
            "start": 7,
            "end": 18
          }
        ],
        "state": "review_required",
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "assertion-4",
        "field": "employer",
        "value": "Synthetic Beta Labs",
        "evidence": [
          {
            "spanId": "native-page-1-line-5",
            "start": 10,
            "end": 29
          }
        ],
        "state": "review_required",
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "assertion-5",
        "field": "role",
        "value": "Data Engineer",
        "evidence": [
          {
            "spanId": "native-page-1-line-6",
            "start": 6,
            "end": 19
          }
        ],
        "state": "review_required",
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      },
      {
        "id": "assertion-6",
        "field": "dates",
        "value": "2021 - 2023",
        "evidence": [
          {
            "spanId": "native-page-1-line-7",
            "start": 7,
            "end": 18
          }
        ],
        "state": "review_required",
        "confidence": {
          "kind": "uncalibrated",
          "value": null
        }
      }
    ],
    "fields": [
      {
        "field": "name",
        "state": "not_evaluated"
      },
      {
        "field": "email",
        "state": "not_evaluated"
      },
      {
        "field": "phone",
        "state": "not_evaluated"
      },
      {
        "field": "employer",
        "state": "conflict"
      },
      {
        "field": "role",
        "state": "conflict"
      },
      {
        "field": "dates",
        "state": "conflict"
      },
      {
        "field": "education",
        "state": "not_evaluated"
      },
      {
        "field": "certification",
        "state": "not_evaluated"
      }
    ],
    "blockers": [
      "uncalibrated_confidence",
      "missing_critical_fields",
      "conflicting_critical_fields"
    ]
  },
  "base": {
    "schemaVersion": "canonical-resume/1.0.0",
    "producerVersion": "canonical-engine/1.0.1",
    "analysisId": "10000000-0000-4000-8000-000000000003",
    "inputSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "retentionPolicyId": "synthetic/1.0.0",
    "resumeId": "10000000-0000-4000-8000-000000000005",
    "versionId": "10000000-0000-4000-8000-000000000100",
    "parentVersionId": null,
    "ownerId": "10000000-0000-4000-8000-000000000002",
    "organizationId": "10000000-0000-4000-8000-000000000006",
    "locale": "en-IN",
    "createdAt": "2026-11-13T00:00:00.000Z",
    "state": "review_required",
    "sourceEvidenceVersionId": "10000000-0000-4000-8000-000000000001",
    "contactFactIds": [],
    "facts": [
      {
        "id": "10000000-0000-4000-8000-000000000101",
        "type": "employer",
        "value": "Synthetic Alpha Labs",
        "state": "unconfirmed",
        "sources": [
          {
            "attemptId": "10000000-0000-4000-8000-000000000001",
            "spanId": "native-page-1-line-2",
            "start": 10,
            "end": 30
          }
        ],
        "confirmation": null
      },
      {
        "id": "10000000-0000-4000-8000-000000000102",
        "type": "role",
        "value": "Platform Engineer",
        "state": "unconfirmed",
        "sources": [
          {
            "attemptId": "10000000-0000-4000-8000-000000000001",
            "spanId": "native-page-1-line-3",
            "start": 6,
            "end": 23
          }
        ],
        "confirmation": null
      },
      {
        "id": "10000000-0000-4000-8000-000000000103",
        "type": "dates",
        "value": "2020 - 2022",
        "state": "unconfirmed",
        "sources": [
          {
            "attemptId": "10000000-0000-4000-8000-000000000001",
            "spanId": "native-page-1-line-4",
            "start": 7,
            "end": 18
          }
        ],
        "confirmation": null
      },
      {
        "id": "10000000-0000-4000-8000-000000000104",
        "type": "employer",
        "value": "Synthetic Beta Labs",
        "state": "unconfirmed",
        "sources": [
          {
            "attemptId": "10000000-0000-4000-8000-000000000001",
            "spanId": "native-page-1-line-5",
            "start": 10,
            "end": 29
          }
        ],
        "confirmation": null
      },
      {
        "id": "10000000-0000-4000-8000-000000000105",
        "type": "role",
        "value": "Data Engineer",
        "state": "unconfirmed",
        "sources": [
          {
            "attemptId": "10000000-0000-4000-8000-000000000001",
            "spanId": "native-page-1-line-6",
            "start": 6,
            "end": 19
          }
        ],
        "confirmation": null
      },
      {
        "id": "10000000-0000-4000-8000-000000000106",
        "type": "dates",
        "value": "2021 - 2023",
        "state": "unconfirmed",
        "sources": [
          {
            "attemptId": "10000000-0000-4000-8000-000000000001",
            "spanId": "native-page-1-line-7",
            "start": 7,
            "end": 18
          }
        ],
        "confirmation": null
      }
    ],
    "sections": [
      {
        "id": "10000000-0000-4000-8000-000000000107",
        "type": "experience",
        "title": "Experience",
        "factIds": [],
        "entries": [
          {
            "id": "10000000-0000-4000-8000-000000000108",
            "factIds": [
              "10000000-0000-4000-8000-000000000101"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000109",
            "factIds": [
              "10000000-0000-4000-8000-000000000102"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000110",
            "factIds": [
              "10000000-0000-4000-8000-000000000103"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000111",
            "factIds": [
              "10000000-0000-4000-8000-000000000104"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000112",
            "factIds": [
              "10000000-0000-4000-8000-000000000105"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000113",
            "factIds": [
              "10000000-0000-4000-8000-000000000106"
            ],
            "bullets": []
          }
        ]
      }
    ],
    "changes": [
      {
        "id": "10000000-0000-4000-8000-000000000114",
        "actorId": "10000000-0000-4000-8000-000000000002",
        "action": "import",
        "targetId": "10000000-0000-4000-8000-000000000100",
        "priorValue": null,
        "createdAt": "2026-11-13T00:00:00.000Z"
      }
    ]
  },
  "request": {
    "schemaVersion": "canonical-entry-regroup-command/1.0.0",
    "operation": "approve_whole_entry_regroup",
    "binding": {
      "ownerId": "10000000-0000-4000-8000-000000000002",
      "analysisId": "10000000-0000-4000-8000-000000000003",
      "sourceId": "10000000-0000-4000-8000-000000000004",
      "inputSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "attemptId": "10000000-0000-4000-8000-000000000001",
      "resumeId": "10000000-0000-4000-8000-000000000005",
      "organizationId": "10000000-0000-4000-8000-000000000006",
      "evidenceSchemaVersion": "evidence/2.0.0",
      "fieldExtractorVersion": "evidence-fields/1.0.1",
      "targetModelVersion": "evidence-targets/1.0.0",
      "associationModelVersion": "evidence-entry-associations/1.0.0",
      "producerVersion": "canonical-engine/1.0.4",
      "admissionPolicyVersion": "whole-entry-regroup-admission/1.0.0",
      "structuralTextProfileVersion": "a02-structural-text/1.0.0",
      "correctionProjectionModelVersion": "canonical-corrections/1.0.1",
      "correctionAdmissionPolicyVersion": "candidate-correction-admission/1.0.0",
      "regroupModelVersion": "canonical-entry-regroup/1.0.0"
    },
    "base": {
      "versionId": "10000000-0000-4000-8000-000000000100",
      "revision": 1,
      "contentSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "locale": "en-IN"
    },
    "expected": {
      "reviewRevision": 0,
      "reviewHeadId": null,
      "assignmentRevision": 0,
      "assignmentHeadId": null,
      "associationRevision": 0,
      "associationHeadId": null,
      "regroupRevision": 0,
      "regroupHeadId": null,
      "canonicalHeadId": "10000000-0000-4000-8000-000000000100"
    },
    "selections": [
      {
        "groupId": "entry-association-1036212579a5a6954c04df1e78a8d8efad6fdda28830f8849823bab1975597ac",
        "factIds": [
          "10000000-0000-4000-8000-000000000101",
          "10000000-0000-4000-8000-000000000102",
          "10000000-0000-4000-8000-000000000103"
        ]
      },
      {
        "groupId": "entry-association-308c9d651e3adc564eca1807b2641f3f171d7ea0e64aeb1e8e199c78ecc00a82",
        "factIds": [
          "10000000-0000-4000-8000-000000000104",
          "10000000-0000-4000-8000-000000000105",
          "10000000-0000-4000-8000-000000000106"
        ]
      }
    ],
    "unselectedDisposition": "retain_eligible_original_origins"
  },
  "normalForm": {
    "schemaVersion": "canonical-entry-regroup-command/1.0.0",
    "operation": "approve_whole_entry_regroup",
    "binding": {
      "ownerId": "10000000-0000-4000-8000-000000000002",
      "organizationId": "10000000-0000-4000-8000-000000000006",
      "resumeId": "10000000-0000-4000-8000-000000000005",
      "analysisId": "10000000-0000-4000-8000-000000000003",
      "sourceId": "10000000-0000-4000-8000-000000000004",
      "attemptId": "10000000-0000-4000-8000-000000000001",
      "inputSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "evidenceSchemaVersion": "evidence/2.0.0",
      "fieldExtractorVersion": "evidence-fields/1.0.1",
      "targetModelVersion": "evidence-targets/1.0.0",
      "associationModelVersion": "evidence-entry-associations/1.0.0",
      "producerVersion": "canonical-engine/1.0.4",
      "admissionPolicyVersion": "whole-entry-regroup-admission/1.0.0",
      "structuralTextProfileVersion": "a02-structural-text/1.0.0",
      "correctionProjectionModelVersion": "canonical-corrections/1.0.1",
      "correctionAdmissionPolicyVersion": "candidate-correction-admission/1.0.0",
      "regroupModelVersion": "canonical-entry-regroup/1.0.0"
    },
    "base": {
      "versionId": "10000000-0000-4000-8000-000000000100",
      "revision": 1,
      "contentSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "locale": "en-IN"
    },
    "expected": {
      "reviewRevision": 0,
      "reviewHeadId": null,
      "assignmentRevision": 0,
      "assignmentHeadId": null,
      "associationRevision": 0,
      "associationHeadId": null,
      "regroupRevision": 0,
      "regroupHeadId": null,
      "canonicalHeadId": "10000000-0000-4000-8000-000000000100"
    },
    "acknowledgementPolicy": "whole_entry_merge_not_fact_confirmation",
    "acknowledgement": true,
    "unselectedDisposition": "retain_eligible_original_origins",
    "selections": [
      {
        "pageId": "page-1",
        "method": "native_text",
        "sectionId": "10000000-0000-4000-8000-000000000107",
        "anchorEntryId": "10000000-0000-4000-8000-000000000108",
        "insertionIndex": 0,
        "affectedEntryIds": [
          "10000000-0000-4000-8000-000000000108",
          "10000000-0000-4000-8000-000000000109",
          "10000000-0000-4000-8000-000000000110"
        ],
        "members": [
          {
            "assertionId": "assertion-1",
            "field": "employer",
            "factId": "10000000-0000-4000-8000-000000000101",
            "citations": [
              {
                "attemptId": "10000000-0000-4000-8000-000000000001",
                "spanId": "native-page-1-line-2",
                "pageId": "page-1",
                "method": "native_text",
                "start": 10,
                "end": 30,
                "pageStart": 21,
                "pageEnd": 41
              }
            ],
            "mappedThrough": "current_citations",
            "originVersionId": null,
            "location": {
              "kind": "entry",
              "sectionId": "10000000-0000-4000-8000-000000000107",
              "entryId": "10000000-0000-4000-8000-000000000108",
              "bulletId": null
            }
          },
          {
            "assertionId": "assertion-2",
            "field": "role",
            "factId": "10000000-0000-4000-8000-000000000102",
            "citations": [
              {
                "attemptId": "10000000-0000-4000-8000-000000000001",
                "spanId": "native-page-1-line-3",
                "pageId": "page-1",
                "method": "native_text",
                "start": 6,
                "end": 23,
                "pageStart": 48,
                "pageEnd": 65
              }
            ],
            "mappedThrough": "current_citations",
            "originVersionId": null,
            "location": {
              "kind": "entry",
              "sectionId": "10000000-0000-4000-8000-000000000107",
              "entryId": "10000000-0000-4000-8000-000000000109",
              "bulletId": null
            }
          },
          {
            "assertionId": "assertion-3",
            "field": "dates",
            "factId": "10000000-0000-4000-8000-000000000103",
            "citations": [
              {
                "attemptId": "10000000-0000-4000-8000-000000000001",
                "spanId": "native-page-1-line-4",
                "pageId": "page-1",
                "method": "native_text",
                "start": 7,
                "end": 18,
                "pageStart": 73,
                "pageEnd": 84
              }
            ],
            "mappedThrough": "current_citations",
            "originVersionId": null,
            "location": {
              "kind": "entry",
              "sectionId": "10000000-0000-4000-8000-000000000107",
              "entryId": "10000000-0000-4000-8000-000000000110",
              "bulletId": null
            }
          }
        ]
      },
      {
        "pageId": "page-1",
        "method": "native_text",
        "sectionId": "10000000-0000-4000-8000-000000000107",
        "anchorEntryId": "10000000-0000-4000-8000-000000000111",
        "insertionIndex": 3,
        "affectedEntryIds": [
          "10000000-0000-4000-8000-000000000111",
          "10000000-0000-4000-8000-000000000112",
          "10000000-0000-4000-8000-000000000113"
        ],
        "members": [
          {
            "assertionId": "assertion-4",
            "field": "employer",
            "factId": "10000000-0000-4000-8000-000000000104",
            "citations": [
              {
                "attemptId": "10000000-0000-4000-8000-000000000001",
                "spanId": "native-page-1-line-5",
                "pageId": "page-1",
                "method": "native_text",
                "start": 10,
                "end": 29,
                "pageStart": 95,
                "pageEnd": 114
              }
            ],
            "mappedThrough": "current_citations",
            "originVersionId": null,
            "location": {
              "kind": "entry",
              "sectionId": "10000000-0000-4000-8000-000000000107",
              "entryId": "10000000-0000-4000-8000-000000000111",
              "bulletId": null
            }
          },
          {
            "assertionId": "assertion-5",
            "field": "role",
            "factId": "10000000-0000-4000-8000-000000000105",
            "citations": [
              {
                "attemptId": "10000000-0000-4000-8000-000000000001",
                "spanId": "native-page-1-line-6",
                "pageId": "page-1",
                "method": "native_text",
                "start": 6,
                "end": 19,
                "pageStart": 121,
                "pageEnd": 134
              }
            ],
            "mappedThrough": "current_citations",
            "originVersionId": null,
            "location": {
              "kind": "entry",
              "sectionId": "10000000-0000-4000-8000-000000000107",
              "entryId": "10000000-0000-4000-8000-000000000112",
              "bulletId": null
            }
          },
          {
            "assertionId": "assertion-6",
            "field": "dates",
            "factId": "10000000-0000-4000-8000-000000000106",
            "citations": [
              {
                "attemptId": "10000000-0000-4000-8000-000000000001",
                "spanId": "native-page-1-line-7",
                "pageId": "page-1",
                "method": "native_text",
                "start": 7,
                "end": 18,
                "pageStart": 142,
                "pageEnd": 153
              }
            ],
            "mappedThrough": "current_citations",
            "originVersionId": null,
            "location": {
              "kind": "entry",
              "sectionId": "10000000-0000-4000-8000-000000000107",
              "entryId": "10000000-0000-4000-8000-000000000113",
              "bulletId": null
            }
          }
        ]
      }
    ]
  },
  "semanticAtoms": [
    "canonical-entry-regroup-command/1.0.0",
    "approve_whole_entry_regroup",
    "10000000-0000-4000-8000-000000000002",
    "10000000-0000-4000-8000-000000000006",
    "10000000-0000-4000-8000-000000000005",
    "10000000-0000-4000-8000-000000000003",
    "10000000-0000-4000-8000-000000000004",
    "10000000-0000-4000-8000-000000000001",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "evidence/2.0.0",
    "evidence-fields/1.0.1",
    "evidence-targets/1.0.0",
    "evidence-entry-associations/1.0.0",
    "canonical-engine/1.0.4",
    "whole-entry-regroup-admission/1.0.0",
    "a02-structural-text/1.0.0",
    "canonical-corrections/1.0.1",
    "candidate-correction-admission/1.0.0",
    "canonical-entry-regroup/1.0.0",
    "10000000-0000-4000-8000-000000000100",
    "1",
    "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "en-IN",
    "0",
    null,
    "0",
    null,
    "0",
    null,
    "0",
    null,
    "10000000-0000-4000-8000-000000000100",
    "whole_entry_merge_not_fact_confirmation",
    "1",
    "retain_eligible_original_origins",
    "2",
    "page-1",
    "native_text",
    "10000000-0000-4000-8000-000000000107",
    "10000000-0000-4000-8000-000000000108",
    "0",
    "3",
    "10000000-0000-4000-8000-000000000108",
    "10000000-0000-4000-8000-000000000109",
    "10000000-0000-4000-8000-000000000110",
    "3",
    "assertion-1",
    "employer",
    "10000000-0000-4000-8000-000000000101",
    "1",
    "native-page-1-line-2",
    "10",
    "30",
    "21",
    "41",
    "current_citations",
    null,
    "entry",
    "10000000-0000-4000-8000-000000000108",
    null,
    "assertion-2",
    "role",
    "10000000-0000-4000-8000-000000000102",
    "1",
    "native-page-1-line-3",
    "6",
    "23",
    "48",
    "65",
    "current_citations",
    null,
    "entry",
    "10000000-0000-4000-8000-000000000109",
    null,
    "assertion-3",
    "dates",
    "10000000-0000-4000-8000-000000000103",
    "1",
    "native-page-1-line-4",
    "7",
    "18",
    "73",
    "84",
    "current_citations",
    null,
    "entry",
    "10000000-0000-4000-8000-000000000110",
    null,
    "page-1",
    "native_text",
    "10000000-0000-4000-8000-000000000107",
    "10000000-0000-4000-8000-000000000111",
    "3",
    "3",
    "10000000-0000-4000-8000-000000000111",
    "10000000-0000-4000-8000-000000000112",
    "10000000-0000-4000-8000-000000000113",
    "3",
    "assertion-4",
    "employer",
    "10000000-0000-4000-8000-000000000104",
    "1",
    "native-page-1-line-5",
    "10",
    "29",
    "95",
    "114",
    "current_citations",
    null,
    "entry",
    "10000000-0000-4000-8000-000000000111",
    null,
    "assertion-5",
    "role",
    "10000000-0000-4000-8000-000000000105",
    "1",
    "native-page-1-line-6",
    "6",
    "19",
    "121",
    "134",
    "current_citations",
    null,
    "entry",
    "10000000-0000-4000-8000-000000000112",
    null,
    "assertion-6",
    "dates",
    "10000000-0000-4000-8000-000000000106",
    "1",
    "native-page-1-line-7",
    "7",
    "18",
    "142",
    "153",
    "current_citations",
    null,
    "entry",
    "10000000-0000-4000-8000-000000000113",
    null
  ],
  "previewHash": "635a3b18099c8447b03840335eaef3ee3fae7f8aec84991950afab265d8e457a"
}`;
const NODE_REGROUP_LITERAL = JSON.parse(NODE_REGROUP_LITERAL_JSON) as {
  evidence: CanonicalEntryRegroupCommandContext["historicalBaseView"]["review"]["evidence"];
  base: CanonicalResumeDraft;
  request: CanonicalEntryRegroupRequest;
  normalForm: Extract<
    CanonicalEntryRegroupCommandPreparation,
    { state: "prepared" }
  >["normalForm"];
  semanticAtoms: (string | null)[];
  previewHash: string;
};

function prefix(
  context: CanonicalEntryRegroupCommandContext,
  priorAttempt = true,
) {
  const v = context.historicalBaseView,
    n = v.review.corrections.length;
  v.review.corrections.push({
    id: id(800 + n),
    attempt_id: priorAttempt ? id(799) : id(1),
    analysis_id: id(3),
    owner_id: id(2),
    actor_id: id(2),
    revision: n + 1,
    expected_revision: n,
    field: "role",
    operation: "correct",
    value: `Synthetic captured role ${n}`,
    candidate_id: null,
    created_at: "2026-11-13T01:00:00.000Z",
  });
  v.review.revision = n + 1;
  attest(context);
}
function installBase(
  c: CanonicalEntryRegroupCommandContext,
  base: CanonicalResumeDraft,
  ancestors: CanonicalResumeDraft[],
  revision: number,
) {
  const v = c.historicalBaseView;
  v.canonicalSnapshot = {
    sourceId: id(4),
    headId: base.versionId,
    current: base,
    ancestors,
  };
  v.canonicalRevision = revision;
  v.expectedBinding.canonicalHeadId = base.versionId;
}
function refusal(
  result: CanonicalEntryRegroupCommandPreparation,
  reason?: string,
) {
  expect(result.state).toBe("unavailable");
  if (result.state !== "unavailable") throw Error("EXPECTED_REFUSAL");
  if (reason) expect(result.reason).toBe(reason);
  expect(Object.keys(result).sort()).toEqual(
    [
      "authority",
      "persistable",
      "scoringEligible",
      "requiresDurableAdmission",
      "state",
      "reason",
    ].sort(),
  );
}
describe("captured original history and real historical-base mappings", () => {
  it("keeps a GLOBAL prefix containing a prior-attempt event and all original capture pairs", () => {
    const c = fixture();
    prefix(c);
    const raw = request(c);
    Object.assign(raw.expected, {
      assignmentRevision: 4,
      assignmentHeadId: id(810),
      associationRevision: 2,
      associationHeadId: id(811),
      regroupRevision: 3,
      regroupHeadId: id(812),
    });
    const p = prepared(prepareCanonicalEntryRegroupCommand(c, raw));
    expect(p.normalForm.expected).toEqual(raw.expected);
    const command = {
      ...raw,
      acknowledgement: true as const,
      previewHash: p.previewHash,
      idempotencyKey: id(900),
    };
    const before = structuredClone({ c, command });
    expect(normalizeCanonicalEntryRegroupCommand(c, command)).toMatchObject({
      state: "prepared",
      normalForm: p.normalForm,
    });
    expect({ c, command }).toEqual(before);
    expect(c.historicalBaseView.review.corrections[0].attempt_id).not.toBe(
      id(1),
    );
  });
  it("normalizes the exact original after actual later head/review movement and refuses rebased contexts", () => {
    const original = fixture();
    prefix(original);
    const command = commit(original),
      expected = prepared(
        normalizeCanonicalEntryRegroupCommand(original, command),
      );
    const originalBase = original.historicalBaseView.canonicalSnapshot!.current;
    const laterHead = reviseCanonical(
      originalBase,
      {
        operation: "edit",
        factId: originalBase.facts[0].id,
        value: "Synthetic later employer",
      },
      "2026-11-13T03:00:00.000Z",
    );
    const today = structuredClone(original);
    installBase(today, laterHead, [originalBase], 2);
    prefix(today, false);
    expect(laterHead.versionId).not.toBe(command.base.versionId);
    expect(today.historicalBaseView.review.revision).toBe(2);
    refusal(
      normalizeCanonicalEntryRegroupCommand(today, command),
      "binding_mismatch",
    );
    const wrongPrefix = structuredClone(original);
    prefix(wrongPrefix, false);
    refusal(
      normalizeCanonicalEntryRegroupCommand(wrongPrefix, command),
      "captured_history_mismatch",
    );
    expect(
      prepared(normalizeCanonicalEntryRegroupCommand(original, command))
        .normalForm,
    ).toEqual(expected.normalForm);
    expect(command.expected.reviewRevision).toBe(1);
    expect(command.base.versionId).toBe(originalBase.versionId);
  });
  it("uses actual edit/confirm source continuity without leaking or changing current values", () => {
    const c = fixture(),
      original = c.historicalBaseView.canonicalSnapshot!.current,
      role = original.facts.find((f) => f.type === "role")!;
    const edited = reviseCanonical(
      original,
      {
        operation: "edit",
        factId: role.id,
        value: "Synthetic candidate Principal Engineer",
      },
      "2026-11-13T01:00:00.000Z",
    );
    const confirmed = reviseCanonical(
      edited,
      { operation: "confirm", factId: role.id },
      "2026-11-13T02:00:00.000Z",
    );
    installBase(c, confirmed, [edited, original], 3);
    c.sqlBaseContentSha256 = "c".repeat(64);
    const before = structuredClone(c),
      p = prepared(prepareCanonicalEntryRegroupCommand(c, request(c)));
    expect(
      p.normalForm.selections[0].members.find((m) => m.factId === role.id),
    ).toMatchObject({
      mappedThrough: "owned_ancestor_chain",
      originVersionId: original.versionId,
    });
    expect(JSON.stringify(p.normalForm)).not.toContain(
      "Synthetic candidate Principal Engineer",
    );
    expect(c).toEqual(before);
    expect(confirmed.facts.find((f) => f.id === role.id)).toMatchObject({
      state: "candidate_confirmed",
      sources: [],
      confirmation: { value: "Synthetic candidate Principal Engineer" },
    });
  });
  it("admits partial/already grouped layouts and uniquely placed bullet members through real Core", () => {
    const c = fixture(),
      v = c.historicalBaseView,
      base = v.canonicalSnapshot!.current,
      section = base.sections[0],
      role = section.entries[1],
      roleId = role.factIds[0];
    role.factIds = [];
    role.bullets = [
      {
        id: id(700),
        text: "Synthetic role retained in bullet",
        factIds: [roleId],
      },
    ];
    const raw = request(c),
      first = prepared(prepareCanonicalEntryRegroupCommand(c, raw));
    expect(
      first.normalForm.selections[0].members.find((m) => m.factId === roleId)
        ?.location,
    ).toMatchObject({ kind: "bullet", bulletId: id(700) });
    const source = deriveEvidenceEntryAssociations(
      v.review.evidence,
      v.ownedContext,
    );
    const layout = prepareCanonicalEntryRegroup(v, {
      schemaVersion: "canonical-entry-regroup-intent/1.0.0",
      operation: "preview_whole_entry_merge",
      baseVersionId: raw.base.versionId,
      baseRevision: raw.base.revision,
      selections: source.groups.map((g, i) => ({
        groupId: g.id,
        members: g.members.map((m, j) => ({
          assertionId: m.assertionId,
          factId: raw.selections[i].factIds[j],
        })),
      })),
    });
    if (layout.state !== "prepared") throw Error("EXPECTED_CORE_LAYOUT");
    base.sections = layout.afterSections;
    const already = prepared(
      prepareCanonicalEntryRegroupCommand(c, request(c)),
    );
    expect(
      already.normalForm.selections.every(
        (g) => g.affectedEntryIds.length === 1,
      ),
    ).toBe(true);
    expect(
      already.normalForm.selections[0].members.find((m) => m.factId === roleId)
        ?.location.bulletId,
    ).toBe(id(700));
    const partial = fixture(),
      s = partial.historicalBaseView.canonicalSnapshot!.current.sections[0];
    s.entries[0].factIds.push(...s.entries[1].factIds);
    s.entries.splice(1, 1);
    expect(
      prepared(prepareCanonicalEntryRegroupCommand(partial, request(partial)))
        .normalForm.selections[0].affectedEntryIds,
    ).toHaveLength(2);
  });
  it("distinguishes source code-point offsets for actual astral values; framing width checks are separate", () => {
    const c = fixture(
      defaultText
        .replace("Synthetic Alpha Labs", "🧪 Synthetic Alpha Labs")
        .replace("Platform Engineer", "Synthetic 🛰️ Engineer"),
    );
    const p = prepared(prepareCanonicalEntryRegroupCommand(c, request(c)));
    for (const member of p.normalForm.selections.flatMap((g) => g.members)) {
      const assertion = c.historicalBaseView.review.evidence.assertions.find(
        (a) => a.id === member.assertionId,
      )!;
      expect(member.citations[0].end - member.citations[0].start).toBe(
        Array.from(assertion.value).length,
      );
    }
    const employer = p.normalForm.selections[0].members[0],
      assertion = c.historicalBaseView.review.evidence.assertions.find(
        (a) => a.id === employer.assertionId,
      )!;
    expect(assertion.value.length).toBeGreaterThan(
      Array.from(assertion.value).length,
    );
    expect(employer.citations[0].pageEnd).toBe(43);
  });
  it("frames maximum-width BMP identifiers and astral identifiers under full1700atom budget (framing only)", () => {
    const c = fixture(
      "Experience\n" +
        Array.from(
          { length: 32 },
          (_, i) =>
            `Employer: Synthetic Employer ${i}\nRole: Synthetic Role ${i}\nDates: 2020 - 2022`,
        ).join("\n"),
    );
    const p = prepared(prepareCanonicalEntryRegroupCommand(c, request(c))),
      bmp = [...p.semanticAtoms],
      astral = [...p.semanticAtoms];
    let index = 36;
    for (const group of p.normalForm.selections) {
      bmp[index] = "\u0800".repeat(100);
      astral[index] = "𐀀".repeat(50);
      index += 7 + group.affectedEntryIds.length;
      for (const member of group.members) {
        void member;
        for (const slot of [index, index + 4]) {
          bmp[slot] = "\u0800".repeat(100);
          astral[slot] = "𐀀".repeat(50);
        }
        index += 14;
      }
    }
    expect(index).toBe(1700);
    const bytes = encodeGroupedImportCommandAtoms(bmp).byteLength,
      astralBytes = encodeGroupedImportCommandAtoms(astral).byteLength;
    expect(bytes).toBeLessThanOrEqual(131072);
    expect(bytes - astralBytes).toBe(22400);
    // Generated extractor IDs are ASCII. These vectors prove framing width only.
    expect(p.semanticAtoms).not.toEqual(bmp);
  });
});
describe("strict compact input and deterministic retained commands", () => {
  it.each([
    (r: CanonicalEntryRegroupRequest) => ({ ...r, extra: true }),
    (r: CanonicalEntryRegroupRequest) => ({
      ...r,
      binding: { ...r.binding, producerVersion: "canonical-engine/1.0.3" },
    }),
    (r: CanonicalEntryRegroupRequest) => ({
      ...r,
      base: { ...r.base, revision: 2147483647 },
    }),
    (r: CanonicalEntryRegroupRequest) => ({
      ...r,
      base: { ...r.base, contentSha256: "INVALID" },
    }),
    (r: CanonicalEntryRegroupRequest) => ({
      ...r,
      base: { ...r.base, locale: "en-in" },
    }),
    (r: CanonicalEntryRegroupRequest) => ({
      ...r,
      expected: { ...r.expected, reviewHeadId: id(900) },
    }),
    (r: CanonicalEntryRegroupRequest) => ({
      ...r,
      expected: { ...r.expected, assignmentRevision: 1 },
    }),
    (r: CanonicalEntryRegroupRequest) => ({
      ...r,
      expected: { ...r.expected, canonicalHeadId: id(900) },
    }),
    (r: CanonicalEntryRegroupRequest) => ({ ...r, selections: [] }),
    (r: CanonicalEntryRegroupRequest) => ({
      ...r,
      selections: Array(33).fill(r.selections[0]),
    }),
    (r: CanonicalEntryRegroupRequest) => ({ ...r, selections: new Array(2) }),
    (r: CanonicalEntryRegroupRequest) => ({
      ...r,
      selections: [r.selections[0], r.selections[0]],
    }),
    (r: CanonicalEntryRegroupRequest) => ({
      ...r,
      selections: [{ ...r.selections[0], factIds: new Array(3) }],
    }),
    (r: CanonicalEntryRegroupRequest) => ({
      ...r,
      selections: [{ ...r.selections[0], factIds: Array(4).fill(id(1)) }],
    }),
    (r: CanonicalEntryRegroupRequest) => ({
      ...r,
      selections: [
        {
          ...r.selections[0],
          factIds: [r.selections[0].factIds[0], r.selections[0].factIds[0]],
        },
      ],
    }),
    (r: CanonicalEntryRegroupRequest) => ({
      ...r,
      selections: [
        { ...r.selections[0], factIds: ["x".repeat(500000), id(1)] },
      ],
    }),
    (r: CanonicalEntryRegroupRequest) => ({
      ...r,
      selections: [{ ...r.selections[0], assertionIds: ["not allowed"] }],
    }),
  ])(
    "refuses malformed compact data before expensive source work %#",
    (mutate) => {
      const c = fixture();
      refusal(
        prepareCanonicalEntryRegroupCommand(c, mutate(request(c))),
        "invalid_command",
      );
    },
  );
  it("rejects reversed group/member order rather than silently sorting", () => {
    const c = fixture(),
      r = request(c);
    refusal(
      prepareCanonicalEntryRegroupCommand(c, {
        ...r,
        selections: [...r.selections].reverse(),
      }),
      "invalid_selection",
    );
    const reversed = structuredClone(r);
    reversed.selections[0].factIds.reverse();
    refusal(
      prepareCanonicalEntryRegroupCommand(c, reversed),
      "preparation_unavailable",
    );
  });
  it.each(["source", "native_sha", "locale", "revision", "base_id"])(
    "refuses mismatch%s",
    (kind) => {
      const c = fixture(),
        r = request(c);
      if (kind === "source") r.binding.sourceId = id(999);
      if (kind === "native_sha") r.base.contentSha256 = "d".repeat(64);
      if (kind === "locale") r.base.locale = "en-US";
      if (kind === "revision") r.base.revision = 2;
      if (kind === "base_id") {
        r.base.versionId = id(999);
        r.expected.canonicalHeadId = id(999);
      }
      refusal(prepareCanonicalEntryRegroupCommand(c, r), "binding_mismatch");
    },
  );
  it.each(["missing", "revision", "head", "state", "binding"])(
    "requires an exact coherent captured history attestation%s",
    (kind) => {
      const c = fixture(),
        r = request(c),
        v = c.historicalBaseView;
      if (kind === "missing") delete v.review.historyAttestation;
      if (kind === "revision")
        v.review.historyAttestation!.highWaterRevision = 1;
      if (kind === "head")
        v.review.historyAttestation!.highWaterEventId = id(999);
      if (kind === "state")
        (v.review.historyAttestation as unknown as { state: string }).state =
          "not_attested";
      if (kind === "binding")
        v.review.historyAttestation!.binding.sourceId = id(999);
      refusal(prepareCanonicalEntryRegroupCommand(c, r));
    },
  );
  it("does not guess missing ancestry or ambiguous current placement", () => {
    const c = fixture(),
      base = c.historicalBaseView.canonicalSnapshot!.current,
      role = base.facts.find((f) => f.type === "role")!;
    const edited = reviseCanonical(
      base,
      { operation: "edit", factId: role.id, value: "Synthetic edited role" },
      "2026-11-13T01:00:00.000Z",
    );
    installBase(c, edited, [base], 2);
    const r = request(c);
    c.historicalBaseView.canonicalSnapshot!.ancestors = [];
    refusal(
      prepareCanonicalEntryRegroupCommand(c, r),
      "preparation_unavailable",
    );
    const ambiguous = fixture(),
      raw = request(ambiguous),
      s = ambiguous.historicalBaseView.canonicalSnapshot!.current.sections[0];
    s.entries[0].factIds.push(s.entries[1].factIds[0]);
    refusal(
      prepareCanonicalEntryRegroupCommand(ambiguous, raw),
      "preparation_unavailable",
    );
  });
  it("propagates actual merged-entry resource limits without dropping carried content", () => {
    const c = fixture(),
      base = c.historicalBaseView.canonicalSnapshot!.current;
    base.facts.push({
      id: id(700),
      type: "contribution",
      value: "Synthetic repeated carried fact",
      state: "unconfirmed",
      sources: [],
      confirmation: null,
    });
    for (let i = 0; i < 120; i++)
      base.sections[0].entries[i < 60 ? 0 : 1].bullets.push({
        id: id(710 + i),
        text: `Synthetic carried bullet ${i}`,
        factIds: [id(700)],
      });
    expect(CanonicalResumeDraftSchema.safeParse(base).success).toBe(true);
    const before = structuredClone(base);
    refusal(
      prepareCanonicalEntryRegroupCommand(c, request(c)),
      "resource_limit",
    );
    expect(base).toEqual(before);
  });
  it("keeps idempotency outside semantics and refuses changed hash or missing acknowledgement", () => {
    const c = fixture(),
      command = commit(c),
      p = prepared(normalizeCanonicalEntryRegroupCommand(c, command));
    expect(
      normalizeCanonicalEntryRegroupCommand(c, {
        ...command,
        idempotencyKey: id(901),
      }),
    ).toMatchObject({
      state: "prepared",
      previewHash: p.previewHash,
      semanticAtoms: p.semanticAtoms,
      idempotencyKey: id(901),
    });
    refusal(
      normalizeCanonicalEntryRegroupCommand(c, {
        ...command,
        previewHash: "f".repeat(64),
      }),
      "preview_mismatch",
    );
    refusal(
      normalizeCanonicalEntryRegroupCommand(c, {
        ...command,
        acknowledgement: false,
      }),
      "invalid_command",
    );
    expect(CanonicalEntryRegroupRequestSchema.safeParse(command).success).toBe(
      false,
    );
  });
});
