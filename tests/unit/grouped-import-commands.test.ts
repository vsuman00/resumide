import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  encodeCorrectionCommandAtoms,
  hashCorrectionCommandAtoms,
} from "../../app/lib/server/correction-command-codec";
import { buildNativeEvidence } from "../../app/lib/server/native-evidence";
import { reconcileDocumentEvidence } from "../../app/lib/server/document-evidence";
import { deriveEvidenceEntryAssociations } from "../../app/lib/server/evidence-entry-associations";
import {
  prepareGroupedOriginalCommand,
  normalizeGroupedOriginalCommand,
  GroupedOriginalCommandSchema,
  GroupedOriginalPreviewRequestSchema,
  type GroupedOriginalCommandPreparation,
} from "../../app/lib/server/grouped-import-commands";
import {
  encodeGroupedImportCommandAtoms,
  hashGroupedImportCommandAtoms,
} from "../../app/lib/server/grouped-import-command-codec";

const context = {
  id: "10000000-0000-4000-8000-000000000001",
  ownerId: "10000000-0000-4000-8000-000000000002",
  analysisId: "10000000-0000-4000-8000-000000000003",
  sourceId: "10000000-0000-4000-8000-000000000004",
  inputSha256: "a".repeat(64),
  createdAt: "2026-11-13T00:00:00.000Z",
  retentionPolicyId: "synthetic/1.0.0",
};
const owned = {
  ownerId: context.ownerId,
  analysisId: context.analysisId,
  sourceId: context.sourceId,
  inputSha256: context.inputSha256,
  attemptId: context.id,
  resumeId: "10000000-0000-4000-8000-000000000005",
  organizationId: "10000000-0000-4000-8000-000000000006",
};
function fixture(
  text = "Experience\nEmployer: Synthetic North Labs\nRole: Engineer\nDates: 2020 - 2022\nEmployer: Synthetic South Labs\nRole: Analyst\nDates: 2021 - 2023",
) {
  const evidence = reconcileDocumentEvidence(
    context,
    buildNativeEvidence([text]),
  );
  const review = deriveEvidenceEntryAssociations(evidence, owned);
  const request = {
    schemaVersion: "grouped-original-command/1.0.0",
    operation: "approve_and_import_grouped_original",
    binding: {
      ...owned,
      evidenceSchemaVersion: "evidence/2.0.0",
      fieldExtractorVersion: "evidence-fields/1.0.1",
      targetModelVersion: "evidence-targets/1.0.0",
      associationModelVersion: "evidence-entry-associations/1.0.0",
      producerVersion: "canonical-engine/1.0.3",
      admissionPolicyVersion: "grouped-original-admission/1.0.0",
      structuralTextProfileVersion: "a02-structural-text/1.0.0",
      correctionProjectionModelVersion: "canonical-corrections/1.0.1",
      correctionAdmissionPolicyVersion: "candidate-correction-admission/1.0.0",
      effectiveLocale: "en-IN",
    },
    expected: {
      reviewRevision: 0,
      reviewHeadId: null,
      assignmentRevision: 0,
      assignmentHeadId: null,
      associationRevision: 0,
      associationHeadId: null,
      canonicalHeadId: null,
    },
    selectedGroupIds: review.groups.map((group) => group.id),
    unselectedDisposition: "retain_original",
  };
  return { evidence, review, request };
}
function requirePrepared(result: GroupedOriginalCommandPreparation) {
  expect(result.state).toBe("prepared");
  if (result.state !== "prepared") throw Error("EXPECTED_PREPARED");
  return result;
}
function commitFixture() {
  const f = fixture();
  const preview = requirePrepared(
    prepareGroupedOriginalCommand(f.evidence, owned, f.request),
  );
  return {
    ...f,
    preview,
    command: {
      ...f.request,
      acknowledgement: true,
      previewHash: preview.previewHash,
      idempotencyKey: "20000000-0000-4000-8000-000000000001",
    },
  };
}
function expectUnavailable(
  result: GroupedOriginalCommandPreparation,
  reason?: string,
) {
  expect(result).toEqual({
    authority: "derived_review_only",
    persistable: false,
    scoringEligible: false,
    requiresDurableAdmission: true,
    state: "unavailable",
    reason: reason ?? expect.any(String),
  });
}

describe("existing C02 protocol characterization", () => {
  it("retains its healthy independent framing and hash golden", () => {
    const atoms = [null, "", "é", "😀", "T:;N\n"];
    expect(encodeCorrectionCommandAtoms(atoms).toString("hex")).toBe(
      "4330324f50310a4e3b54303a3b54323ac3a93b54343af09f98803b54353a543a3b4e0a3b",
    );
    expect(hashCorrectionCommandAtoms(atoms)).toBe(
      "b9ef6a4794f1d0100663a2a6d560ccffe0a9a56cdfdbcc8147dc0a9640bef389",
    );
  });
});

describe("grouped original prospective command", () => {
  it("normalizes two actual jobs and matches preview/commit without durable authority", () => {
    const { evidence, review, request } = fixture();
    expect(review.groups).toHaveLength(2);
    const preview = prepareGroupedOriginalCommand(evidence, owned, request);
    expect(preview.state).toBe("prepared");
    if (preview.state !== "prepared") throw Error("EXPECTED_PREPARED");
    expect(
      preview.normalForm.selections.map((group) => group.members.length),
    ).toEqual([3, 3]);
    // Independently framed from fixed source lines and the contract's field order.
    expect(preview.semanticAtoms).toHaveLength(102);
    expect(encodeGroupedImportCommandAtoms(preview.semanticAtoms)).toHaveLength(
      1723,
    );
    expect(preview.previewHash).toBe(
      "a3317f16273a02b72c5d5a6e527e73c477b105a68bc97527517023b4573847fe",
    );
    const command = {
      ...request,
      acknowledgement: true,
      previewHash: preview.previewHash,
      idempotencyKey: "20000000-0000-4000-8000-000000000001",
    };
    const commit = normalizeGroupedOriginalCommand(evidence, owned, command);
    expect(commit).toMatchObject({
      ...preview,
      command,
      idempotencyKey: command.idempotencyKey,
    });
    expect(preview).toMatchObject({
      authority: "derived_review_only",
      persistable: false,
      scoringEligible: false,
      requiresDurableAdmission: true,
    });
    const encoded = encodeGroupedImportCommandAtoms(
      preview.semanticAtoms,
    ).toString("utf8");
    for (const value of [
      "Synthetic North Labs",
      "Engineer",
      ...request.selectedGroupIds,
    ])
      expect(encoded).not.toContain(value);
    expect(encoded).not.toContain("observation-");
    expect(encoded).not.toContain("target-");
  });

  it("matches the independent A02 UTF8 byte and hash golden", () => {
    const atoms = [null, "", "é", "😀", "T:;N\n"];
    expect(encodeGroupedImportCommandAtoms(atoms).toString("hex")).toBe(
      "4130324f50310a4e3b54303a3b54323ac3a93b54343af09f98803b54353a543a3b4e0a3b",
    );
    expect(hashGroupedImportCommandAtoms(atoms)).toBe(
      "64f1eedbd02050e0f12a26d8cae4e9950633f9fdaada316b1140a07b3d719173",
    );
  });

  it("canonicalizes browser selection order to actual helper/source order", () => {
    const { evidence, request } = fixture();
    const first = requirePrepared(
      prepareGroupedOriginalCommand(evidence, owned, request),
    );
    const reverse = requirePrepared(
      prepareGroupedOriginalCommand(evidence, owned, {
        ...request,
        selectedGroupIds: [...request.selectedGroupIds].reverse(),
      }),
    );
    expect(reverse).toEqual(first);
  });

  it("selects a subset without modifying source, helper IDs or unselected groups", () => {
    const { evidence, review, request } = fixture();
    const before = JSON.stringify({ evidence, review });
    const result = requirePrepared(
      prepareGroupedOriginalCommand(evidence, owned, {
        ...request,
        selectedGroupIds: [request.selectedGroupIds[1]],
      }),
    );
    expect(result.selectedGroupIds).toEqual([review.groups[1].id]);
    expect(result.normalForm.selections).toHaveLength(1);
    expect(
      result.normalForm.selections[0].members.map((m) => m.assertionId),
    ).toEqual(review.groups[1].members.map((m) => m.assertionId));
    expect(JSON.stringify({ evidence, review })).toBe(before);
    expect(deriveEvidenceEntryAssociations(evidence, owned)).toEqual(review);
  });

  it("retains original nonzero prefix identities and explicit locale without current-state authority", () => {
    const { evidence, request } = fixture();
    const capture = {
      reviewRevision: 2_147_483_647,
      reviewHeadId: "30000000-0000-4000-8000-000000000001",
      assignmentRevision: 8,
      assignmentHeadId: "30000000-0000-4000-8000-000000000002",
      associationRevision: 9,
      associationHeadId: "30000000-0000-4000-8000-000000000003",
      canonicalHeadId: null,
    };
    const original = {
      ...request,
      expected: capture,
      binding: { ...request.binding, effectiveLocale: "fr-FR" },
    };
    const runtimeOwned = {
      ...owned,
      locale: "de-DE",
      reviewRevision: 300,
      headId: "ignored-current-state",
    };
    const result = requirePrepared(
      prepareGroupedOriginalCommand(evidence, runtimeOwned, original),
    );
    expect(result.normalForm.expected).toEqual(capture);
    expect(result.normalForm.binding.effectiveLocale).toBe("fr-FR");
    const command = {
      ...original,
      acknowledgement: true,
      previewHash: result.previewHash,
      idempotencyKey: "20000000-0000-4000-8000-000000000001",
    };
    const normalized = normalizeGroupedOriginalCommand(
      evidence,
      runtimeOwned,
      command,
    );
    expect(normalized).toMatchObject({
      state: "prepared",
      normalForm: result.normalForm,
      command,
    });
  });

  it("binds exact code-point offsets for actual Unicode source members", () => {
    const line = "Employer: Synthetic Café 😀 Labs";
    const { evidence, request } = fixture(
      `EMPLOYMENT\n${line}\nRole: Data Engineer\nDates: 2020 - 2022`,
    );
    const result = requirePrepared(
      prepareGroupedOriginalCommand(evidence, owned, request),
    );
    const member = result.normalForm.selections[0].members[0];
    expect(member.citations).toEqual([
      {
        attemptId: context.id,
        spanId: "native-page-1-line-2",
        pageId: "page-1",
        method: "native_text",
        start: 10,
        end: Array.from(line).length,
        pageStart: 21,
        pageEnd: 11 + Array.from(line).length,
      },
    ]);
    expect(
      evidence.assertions.find((a) => a.id === member.assertionId)?.value,
    ).toBe("Synthetic Café 😀 Labs");
  });

  it("admits all 32 actual two-member groups without a lower source limit", () => {
    const text =
      "Experience\n" +
      Array.from(
        { length: 32 },
        (_, i) => `Employer: Synthetic Team ${i}\nRole: Engineer ${i}`,
      ).join("\n");
    const { evidence, request } = fixture(text);
    expect(request.selectedGroupIds).toHaveLength(32);
    const result = requirePrepared(
      prepareGroupedOriginalCommand(evidence, owned, request),
    );
    expect(result.normalForm.selections).toHaveLength(32);
    expect(result.semanticAtoms.length).toBeLessThanOrEqual(2048);
  });

  it.each([
    "ownerId",
    "organizationId",
    "resumeId",
    "analysisId",
    "sourceId",
    "attemptId",
    "inputSha256",
  ] as const)("rejects wrong owned %s", (key) => {
    const { evidence, request } = fixture();
    const value =
      key === "inputSha256"
        ? "b".repeat(64)
        : "30000000-0000-4000-8000-000000000001";
    expectUnavailable(
      prepareGroupedOriginalCommand(evidence, owned, {
        ...request,
        binding: { ...request.binding, [key]: value },
      }),
      "binding_mismatch",
    );
  });

  it.each([
    "evidenceSchemaVersion",
    "fieldExtractorVersion",
    "targetModelVersion",
    "associationModelVersion",
    "producerVersion",
    "admissionPolicyVersion",
    "structuralTextProfileVersion",
    "correctionProjectionModelVersion",
    "correctionAdmissionPolicyVersion",
  ])("rejects stale %s", (key) => {
    const { evidence, request } = fixture();
    expectUnavailable(
      prepareGroupedOriginalCommand(evidence, owned, {
        ...request,
        binding: { ...request.binding, [key]: "unsupported/0.0.0" },
      }),
      "invalid_command",
    );
  });

  it.each(["review", "assignment", "association"])(
    "rejects inconsistent %s revision/head pairs",
    (prefix) => {
      const { evidence, request } = fixture();
      for (const pair of [
        { [`${prefix}Revision`]: 1 },
        { [`${prefix}HeadId`]: "30000000-0000-4000-8000-000000000001" },
      ])
        expectUnavailable(
          prepareGroupedOriginalCommand(evidence, owned, {
            ...request,
            expected: { ...request.expected, ...pair },
          }),
          "invalid_command",
        );
    },
  );

  it.each([
    -1,
    0.5,
    2_147_483_648,
    Number.MAX_SAFE_INTEGER,
    Infinity,
    NaN,
    "1",
  ])("rejects invalid captured revision %s", (reviewRevision) => {
    const { evidence, request } = fixture();
    expectUnavailable(
      prepareGroupedOriginalCommand(evidence, owned, {
        ...request,
        expected: { ...request.expected, reviewRevision },
      }),
      "invalid_command",
    );
  });

  it("rejects an existing-head request without attempting regrouping", () => {
    const { evidence, request } = fixture();
    expectUnavailable(
      prepareGroupedOriginalCommand(evidence, owned, {
        ...request,
        expected: { ...request.expected, canonicalHeadId: owned.resumeId },
      }),
      "invalid_command",
    );
  });

  it.each(["root", "binding", "expected"])(
    "rejects extra browser %s properties",
    (location) => {
      const { evidence, request } = fixture();
      const raw =
        location === "root"
          ? { ...request, sourceValue: "unexpected" }
          : {
              ...request,
              [location]: {
                ...request[location as "binding" | "expected"],
                sourceValue: "unexpected",
              },
            };
      expectUnavailable(
        prepareGroupedOriginalCommand(evidence, owned, raw),
        "invalid_command",
      );
    },
  );

  it.each(["EN-in", "en_US", "english", "en-in", "en-IN-extra", ""])(
    "rejects invalid locale %s",
    (effectiveLocale) => {
      const { evidence, request } = fixture();
      expectUnavailable(
        prepareGroupedOriginalCommand(evidence, owned, {
          ...request,
          binding: { ...request.binding, effectiveLocale },
        }),
        "invalid_command",
      );
    },
  );

  it("rejects uppercase UUIDs, malformed IDs and oversized scalar fields", () => {
    const { evidence, request } = fixture();
    for (const ownerId of [
      "ABCDEF00-0000-4000-8000-000000000001",
      "invalid",
      "x".repeat(201),
    ])
      expectUnavailable(
        prepareGroupedOriginalCommand(evidence, owned, {
          ...request,
          binding: { ...request.binding, ownerId },
        }),
        "invalid_command",
      );
  });

  it("rejects empty, duplicate, unknown, sparse and excessive selected groups", () => {
    const { evidence, request } = fixture();
    const id = request.selectedGroupIds[0];
    for (const selectedGroupIds of [
      [],
      [id, id],
      ["entry-association-" + "0".repeat(64)],
      new Array(1),
      Array(33).fill(id),
      [id + "x".repeat(201)],
    ])
      expectUnavailable(
        prepareGroupedOriginalCommand(evidence, owned, {
          ...request,
          selectedGroupIds,
        }),
      );
  });

  it("refuses a stale real-source selector and malformed stored replay without a partial normal form", () => {
    const original = fixture();
    const changed = fixture(
      "Experience\nEmployer: Synthetic Changed Labs\nRole: Engineer",
    );
    expectUnavailable(
      prepareGroupedOriginalCommand(changed.evidence, owned, original.request),
      "invalid_selection",
    );
    const forged = structuredClone(original.evidence);
    forged.assertions[0].evidence[0].start++;
    expectUnavailable(
      prepareGroupedOriginalCommand(forged, owned, original.request),
      "association_unavailable",
    );
  });

  it("requires a complete strict preview and a separate complete strict commit", () => {
    const { request, command } = commitFixture();
    expect(GroupedOriginalPreviewRequestSchema.safeParse(request).success).toBe(
      true,
    );
    expect(GroupedOriginalCommandSchema.safeParse(command).success).toBe(true);
    expect(GroupedOriginalCommandSchema.safeParse(request).success).toBe(false);
    expect(GroupedOriginalPreviewRequestSchema.safeParse(command).success).toBe(
      false,
    );
  });

  it.each([false, null, "true", 1, undefined])(
    "rejects acknowledgement %s",
    (acknowledgement) => {
      const { evidence, command } = commitFixture();
      expectUnavailable(
        normalizeGroupedOriginalCommand(evidence, owned, {
          ...command,
          acknowledgement,
        }),
        "invalid_command",
      );
    },
  );

  it("binds preview to original captures, locale, selections and actual acknowledgement", () => {
    const { evidence, command } = commitFixture();
    for (const changed of [
      { ...command, previewHash: "0".repeat(64) },
      { ...command, binding: { ...command.binding, effectiveLocale: "en-US" } },
      {
        ...command,
        expected: {
          ...command.expected,
          reviewRevision: 1,
          reviewHeadId: owned.resumeId,
        },
      },
      { ...command, selectedGroupIds: command.selectedGroupIds.slice(0, 1) },
    ])
      expectUnavailable(
        normalizeGroupedOriginalCommand(evidence, owned, changed),
        "preview_mismatch",
      );
  });

  it("keeps idempotency identity outside semantic bytes while retaining the original command", () => {
    const { evidence, command, preview } = commitFixture();
    const second = {
      ...command,
      idempotencyKey: "20000000-0000-4000-8000-000000000002",
    };
    expect(
      normalizeGroupedOriginalCommand(evidence, owned, second),
    ).toMatchObject({
      state: "prepared",
      semanticAtoms: preview.semanticAtoms,
      previewHash: preview.previewHash,
      command: second,
      idempotencyKey: second.idempotencyKey,
    });
    expectUnavailable(
      normalizeGroupedOriginalCommand(evidence, owned, {
        ...command,
        idempotencyKey: "ABCDEF00-0000-4000-8000-000000000001",
      }),
      "invalid_command",
    );
  });
});

describe("A02 framing work and text bounds", () => {
  it("encodes empty atoms, null and empty strings without collisions", () => {
    expect(encodeGroupedImportCommandAtoms([]).toString("hex")).toBe(
      "4130324f50310a",
    );
    const encoded = [[null], [""], ["N;"], ["a", "bc"], ["ab", "c"]].map((a) =>
      hashGroupedImportCommandAtoms(a),
    );
    expect(new Set(encoded).size).toBe(encoded.length);
  });
  it("preserves composed/decomposed Unicode and supplementary characters exactly", () => {
    expect(hashGroupedImportCommandAtoms(["é"])).not.toBe(
      hashGroupedImportCommandAtoms(["e\u0301"]),
    );
    expect(encodeGroupedImportCommandAtoms(["😀"]).toString("utf8")).toBe(
      "A02OP1\nT4:😀;",
    );
  });
  it.each(["\0", "a\0b", "\ud800", "\udfff", "\ud800a", "\ud800\ud800"])(
    "rejects non-PostgreSQL text %#",
    (value) => {
      expect(() => encodeGroupedImportCommandAtoms([value])).toThrow(
        "GROUPED_IMPORT_CODEC_TEXT",
      );
    },
  );
  it.each([0, false, {}, undefined])("rejects nonstring atom %#", (value) => {
    expect(() => encodeGroupedImportCommandAtoms([value] as never)).toThrow(
      "GROUPED_IMPORT_CODEC_ATOM",
    );
  });
  it("rejects nonarray and sparse atom collections", () => {
    expect(() => encodeGroupedImportCommandAtoms(null as never)).toThrow(
      "GROUPED_IMPORT_CODEC_ATOMS",
    );
    expect(() => encodeGroupedImportCommandAtoms(new Array(1))).toThrow(
      "GROUPED_IMPORT_CODEC_ATOM",
    );
  });
  it("accepts 2048 atoms and rejects 2049 before atom work", () => {
    expect(encodeGroupedImportCommandAtoms(Array(2048).fill(null)).length).toBe(
      4103,
    );
    expect(() =>
      encodeGroupedImportCommandAtoms(Array(2049).fill(null)),
    ).toThrow("GROUPED_IMPORT_CODEC_LIMIT");
  });
  it("includes header, prefix and delimiters at the exact 128KiB byte boundary", () => {
    expect(encodeGroupedImportCommandAtoms(["x".repeat(131056)]).length).toBe(
      131072,
    );
    expect(encodeGroupedImportCommandAtoms(["é".repeat(65528)]).length).toBe(
      131072,
    );
    expect(() => encodeGroupedImportCommandAtoms(["x".repeat(131057)])).toThrow(
      "GROUPED_IMPORT_CODEC_LIMIT",
    );
    expect(() => encodeGroupedImportCommandAtoms(["é".repeat(65529)])).toThrow(
      "GROUPED_IMPORT_CODEC_LIMIT",
    );
    expect(() => encodeGroupedImportCommandAtoms(["x".repeat(131073)])).toThrow(
      "GROUPED_IMPORT_CODEC_LIMIT",
    );
  });
});

describe("private SQL foundation source contract only", () => {
  it("contains only two revoked invoker helpers in one transaction, without writer authority", () => {
    const sql = readFileSync(
      new URL(
        "../../supabase/migrations/20261113113504_grouped_import_structural_codec.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql.startsWith("begin;\n")).toBe(true);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(
      sql.match(/create function private\.grouped_import_command_/g),
    ).toHaveLength(2);
    expect(
      sql.match(/immutable security invoker set search_path = ''/g),
    ).toHaveLength(2);
    for (const name of ["bytes", "sha256"])
      expect(sql).toContain(
        `revoke all on function private.grouped_import_command_${name}(text[]) from public,anon,authenticated,service_role;`,
      );
    expect(sql).toContain("convert_to(E'A02OP1\\n','UTF8')");
    expect(sql).toContain("cardinality(p_atoms)>2048");
    expect(sql).toContain("array_lower(p_atoms,1)<>1");
    expect(sql).toContain("octet_length(result)+octet_length(token)>131072");
    expect(sql).not.toMatch(
      /create table|create function public\.|grant execute|canonical_shape_valid|C02OP1/i,
    );
  });
});
