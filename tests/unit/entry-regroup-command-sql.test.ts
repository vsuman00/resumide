import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DocumentEvidenceSchema } from "../../app/lib/server/document-evidence";
import { CanonicalResumeDraftSchema } from "../../app/lib/server/canonical-resume-schema";
import { deriveEvidenceReviewTargets } from "../../app/lib/server/evidence-targets";
import { deriveEvidenceEntryAssociations } from "../../app/lib/server/evidence-entry-associations";
import { deriveNativePageDiagnostics } from "../../app/lib/server/ocr/pdf-detection";
import {
  prepareCanonicalEntryRegroup,
  type CanonicalEntryRegroupInput,
} from "../../app/lib/server/canonical-entry-regroup";
import {
  CanonicalEntryRegroupRequestSchema,
  type CanonicalEntryRegroupNormalForm,
} from "../../app/lib/server/canonical-entry-regroup-commands";
import {
  encodeGroupedImportCommandAtoms,
  hashGroupedImportCommandAtoms,
} from "../../app/lib/server/grouped-import-command-codec";
const read = (name: string) =>
  readFileSync(new URL("../../" + name, import.meta.url), "utf8");
const migration = read(
  "supabase/migrations/20261113165140_entry_regroup_command_normalization.sql",
);
const verifier = read("scripts/verify-entry-regroup-command.sql");
const names = [
  "entry_regroup_original_base",
  "entry_regroup_resolve",
  "entry_regroup_normalize",
  "entry_regroup_atoms",
];
const body = (name: string) =>
  migration.match(
    new RegExp(
      `create function private.${name}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,
    ),
  )![1];
const payload = (text: string, label: string) =>
  JSON.parse(
    text.match(
      new RegExp(`\\$${label}\\$([\\s\\S]*?)\\$${label}\\$::jsonb`),
    )![1],
  ) as unknown;
type Literal = {
  evidence: unknown;
  base: unknown;
  request: unknown;
  normalForm: CanonicalEntryRegroupNormalForm;
  semanticAtoms: (string | null)[];
  previewHash: string;
};
const literal = payload(verifier, "oracle") as Literal;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

describe("private regroup normalization source, not SQL execution", () => {
  it("declares four complete private invoker helpers without writer or current-state admission", () => {
    for (const name of names)
      expect(migration).toContain(`create function private.${name}(`);
    expect(migration.match(/create function private\./g)).toHaveLength(4);
    expect(
      migration.match(
        /language plpgsql volatile security invoker set search_path=''/g,
      ),
    ).toHaveLength(3);
    expect(
      migration.match(
        /language plpgsql immutable security invoker set search_path=''/g,
      ),
    ).toHaveLength(1);
    expect(migration).not.toMatch(
      /create (?:or replace )?function public\.|security definer|grant execute|canonical_resume_heads|correction_scope\(|canonical_correction_write_ready\(/i,
    );
    expect(migration).toContain("from public,anon,authenticated,service_role");
  });
  it("binds actual immutable row digest and full bounded suffix refinements including genuine .3 proof", () => {
    const source = body(names[0]);
    for (const text of [
      "digest(convert_to(v.content::text,'UTF8'),'sha256')",
      "checked.content->'parentVersionId'",
      "checked.parent_version_id=any(visited)",
      "depth=64",
      "checked.revision<>previous_revision-1",
      "total_facts>20000",
      "total_refs>20000",
      "total_text>2000000",
      "doc_text>200000",
      "private.entry_association_validate_head(checked.id)",
      "'{producerVersion}','\"canonical-engine/1.0.1\"'",
      "checked.content->>'retentionPolicyId')>100",
    ])
      expect(source).toContain(text);
    expect(source).toContain("('name','email','phone','link','location')");
    expect(source).toContain("change->>'actorId'");
    expect(source).toContain("change->>'targetId'=any(targets)");
    expect(source).toContain(
      "jsonb_build_array(observation->>'field',signature::jsonb)",
    );
    expect(source).toContain(
      "jsonb_build_array(fact->>'type',signature::jsonb)",
    );
    expect(source).toContain(
      "jsonb_build_array(origin_json->>'type',signature::jsonb)",
    );
    expect(source).toContain(
      "matches*(1+jsonb_array_length(private.correction_location",
    );
    expect(source).not.toContain("validate_correction_child");
  });
  it("resolves strict single placements, nearest continuous identity and canonical source/current ordering", () => {
    const source = body(names[1]);
    for (const text of [
      "canonical is distinct from requested",
      "jsonb_array_length(places)<>1",
      "version.revision<>previous_revision-1",
      "origin_fact.type",
      "jsonb_array_length(origin_fact.sources)>0 then original_version:=version.id; exit",
      "depth>=64",
      "source_refs",
      "actual_member is distinct from member",
      "actual_group is distinct from selection",
      "order by e.ordinality",
      "insertionIndex",
      "used_entries",
      "jsonb_array_length(direct_refs)>100",
      "jsonb_array_length(bullets)>100",
    ])
      expect(source).toContain(text);
    expect(source).toContain("'producerVersion','canonical-engine/1.0.3'");
    expect(source).toContain(
      "'admissionPolicyVersion','grouped-original-admission/1.0.0'",
    );
    expect(source).not.toMatch(
      /importCanonical|grouped_import_place_original|grouped_original_normalize|correction_normalize|correction_assert_fact_placement|correction_sorted_citations/,
    );
  });
  it("validates original GLOBAL prefix only, including prior attempts and full Node event rules", () => {
    const source = body(names[2]);
    expect(source).toContain("revision<=revision_value");
    expect(source).toContain("assignment_revision<=revision_value");
    expect(source).toContain("association_revision<=revision_value");
    expect(source).toContain("regroup_revision<=revision_value");
    expect(source).toContain("prefix='review' and revision_value>1000");
    expect(source).toContain("e.expected_revision<>e.revision-1");
    expect(source).toContain(
      "private.grouped_import_utf16_length(e.value) not between 1 and 2000",
    );
    expect(source).toContain(
      "e.value is distinct from private.grouped_import_trim(e.value)",
    );
    expect(source).toContain(
      "(e.operation='confirm') is distinct from (e.candidate_id is not null)",
    );
    expect(source).toContain(
      "e.attempt_id=(p_scope->>'attemptId')::uuid and not exists",
    );
    expect(source).not.toMatch(
      /max\(revision\)|headId.*p_scope|attempt_id=.*revision<=|canonical_resume_heads|correction_admit_new/,
    );
  });
  it("retains the actual Node literal and independent frozen A02OP1 framing golden", () => {
    const testSource = read(
      "tests/unit/canonical-entry-regroup-commands.test.ts",
    );
    const marker = "export const NODE_REGROUP_LITERAL_JSON = String.raw`";
    const start = testSource.indexOf(marker) + marker.length;
    const nodeLiteral = JSON.parse(
      testSource.slice(start, testSource.indexOf("`;", start)),
    ) as unknown;
    expect(literal).toEqual(nodeLiteral);
    expect(literal.semanticAtoms).toHaveLength(140);
    expect(literal.semanticAtoms[21]).toBe("b".repeat(64));
    expect(literal.previewHash).toBe(
      "635a3b18099c8447b03840335eaef3ee3fae7f8aec84991950afab265d8e457a",
    );
    expect(hashGroupedImportCommandAtoms(literal.semanticAtoms)).toBe(
      literal.previewHash,
    );
    expect(
      encodeGroupedImportCommandAtoms(literal.semanticAtoms)
        .subarray(0, 7)
        .toString(),
    ).toBe("A02OP1\n");
    expect(body(names[3])).toContain("cardinality(atoms)>1700");
    expect(36 + 32 * (10 + 3 * 14)).toBe(1700);
    expect(body(names[3])).not.toMatch(
      /observationId|targetId|groupId|contentDigest|sourceValue|currentValue|originFactId/,
    );
  });
  it("verifies the deferred after-section literal against the actual owned Core, not a SQL self-oracle", () => {
    const evidence = DocumentEvidenceSchema.parse(literal.evidence);
    const current = CanonicalResumeDraftSchema.parse(literal.base);
    const request = CanonicalEntryRegroupRequestSchema.parse(literal.request);
    const source = {
      ownerId: request.binding.ownerId,
      organizationId: request.binding.organizationId,
      resumeId: request.binding.resumeId,
      analysisId: request.binding.analysisId,
      sourceId: request.binding.sourceId,
      attemptId: request.binding.attemptId,
      inputSha256: request.binding.inputSha256,
    };
    const targets = deriveEvidenceReviewTargets(evidence, source);
    const input: CanonicalEntryRegroupInput = {
      canonicalRevision: request.base.revision,
      review: {
        analysisId: source.analysisId,
        attemptId: source.attemptId,
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
      ownedContext: source,
      expectedBinding: {
        ...targets.binding,
        resumeId: source.resumeId,
        organizationId: source.organizationId,
        targetModelVersion: targets.modelVersion,
        projectionModelVersion: "canonical-corrections/1.0.1",
        reviewRevision: 0,
        canonicalHeadId: current.versionId,
      },
      canonicalSnapshot: {
        sourceId: source.sourceId,
        headId: current.versionId,
        current,
        ancestors: [],
      },
    };
    const groups = deriveEvidenceEntryAssociations(evidence, source).groups;
    const prepared = prepareCanonicalEntryRegroup(input, {
      schemaVersion: "canonical-entry-regroup-intent/1.0.0",
      operation: "preview_whole_entry_merge",
      baseVersionId: current.versionId,
      baseRevision: request.base.revision,
      selections: request.selections.map((selection) => {
        const group = groups.find((g) => g.id === selection.groupId);
        if (!group) throw Error("ACTUAL_SOURCE_GROUP_REQUIRED");
        return {
          groupId: group.id,
          members: group.members.map((member, index) => ({
            assertionId: member.assertionId,
            factId: selection.factIds[index],
          })),
        };
      }),
    });
    expect(prepared.state).toBe("prepared");
    if (prepared.state !== "prepared")
      throw Error("ACTUAL_CORE_PREPARATION_REQUIRED");
    expect(payload(verifier, "after")).toEqual(prepared.afterSections);
    expect(prepared.facts).toEqual(current.facts);
  });
  it("pins all four deferred helper bodies and the genuine frozen first-import fixture", () => {
    const pins = payload(verifier, "pins") as {
      signature: string;
      sha256: string;
      volatility: string;
    }[];
    expect(pins).toHaveLength(4);
    for (const pin of pins) {
      const name = pin.signature.split(".")[1].split("(")[0];
      expect(pin.sha256).toBe(sha(body(name)));
      expect(pin.volatility).toBe(name === names[3] ? "i" : "v");
    }
    const old = payload(
      read("scripts/verify-grouped-original-admission.sql"),
      "oracle",
    ) as { envelope: unknown; original: unknown; command: unknown };
    expect(old.envelope).toEqual(literal.evidence);
    expect(payload(verifier, "v1")).toEqual({
      original: old.original,
      command: old.command,
    });
    expect(verifier).toContain(
      "public.import_canonical_grouped_original(owner_id,analysis_id,v1->'command',v1->'original'",
    );
    expect(verifier).toContain("'genuine_3_shape_and_approval_proof'");
  });
  it("prepares finite rollback-only native controls with exactly one independent base-SHA substitution", () => {
    expect(verifier).toContain(
      "SOURCE ONLY / UNPARSED / UNAPPLIED / UNEXECUTED",
    );
    expect(verifier.trimEnd()).toMatch(/rollback;$/);
    expect(verifier).not.toMatch(/\bgrant\s+execute\b/i);
    expect(verifier).toContain("expected_atoms[22]:=native_sha");
    expect(verifier).toContain("'{base,contentSha256}',to_jsonb(native_sha)");
    expect(verifier).toContain(
      "private.entry_regroup_atoms(oracle->'normalForm')=expected_atoms",
    );
    for (const label of [
      "native_base_single_sha_substitution",
      "original_base_survives_current_head_movement",
      "two_locations_inside_one_entry",
      "owned_ancestor_preserves_candidate_confirmation",
      "global_prior_attempt_review_prefix",
      "later_global_history_overflow_does_not_rebase_original_prefix0",
      "preparation_has_no_regroup_writes",
    ])
      expect(verifier).toContain(`'${label}'`);
    expect(verifier).toContain(
      "'missing_identity','type_gap','nearest_source_mismatch'",
    );
    expect(verifier).toContain("exception when invalid_parameter_value");
    expect(verifier).not.toContain("exception when others");
    expect(verifier.match(/exception when sqlstate 'PZ001'/g)).toHaveLength(7);
    expect(verifier).toContain("genuine_3_family_rolled_back");
    expect(verifier).toContain("failure_message<>'C02_UNAVAILABLE'");
    expect(verifier).toContain(
      "case when case_name='forged_3' then 'P0C03' else '22023' end",
    );
    expect(verifier).not.toContain("pg_temp.erg_store(variant,1)");
  });
});
