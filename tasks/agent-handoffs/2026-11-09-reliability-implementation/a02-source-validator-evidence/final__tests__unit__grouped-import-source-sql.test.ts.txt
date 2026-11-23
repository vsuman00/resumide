import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DocumentEvidenceSchema } from "../../app/lib/server/document-evidence";
import { deriveEvidenceEntryAssociations } from "../../app/lib/server/evidence-entry-associations";
import { prepareGroupedOriginalCommand } from "../../app/lib/server/grouped-import-commands";
import { importCanonicalEvidence } from "../../app/lib/server/canonical-content";
import {
  CanonicalResumeDraftSchema,
  type CanonicalResumeDraft,
} from "../../app/lib/server/canonical-resume-schema";
import {
  importCanonicalGroupedEvidence,
  GroupedOriginalImportIntentSchema,
} from "../../app/lib/server/canonical-grouped-import";
import { z } from "zod";

const verifier = readFileSync(
  new URL("../../scripts/verify-grouped-import-source.sql", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261113121645_grouped_import_source_validation.sql",
    import.meta.url,
  ),
  "utf8",
);
// Parse only the embedded JSON oracle data, never SQL syntax or statements.
const data = verifier.match(
  /\$fixtures\$\n([\s\S]*?)\n\$fixtures\$::jsonb;/,
)?.[1];
if (!data) throw Error("MISSING_ORACLE_DATA");
const sourceCitation = z.strictObject({
  attemptId: z.uuid(),
  spanId: z.string(),
  pageId: z.string(),
  method: z.enum(["native_text", "local_ocr"]),
  start: z.number().int(),
  end: z.number().int(),
  pageStart: z.number().int(),
  pageEnd: z.number().int(),
});
const sourceSelection = z.strictObject({
  pageId: z.string(),
  method: z.enum(["native_text", "local_ocr"]),
  members: z
    .array(
      z.strictObject({
        assertionId: z.string(),
        field: z.enum(["employer", "role", "dates"]),
        citations: z.array(sourceCitation).length(1),
      }),
    )
    .min(2)
    .max(3),
});
const fixtures = z
  .array(
    z.object({
      id: z.string(),
      envelope: DocumentEvidenceSchema,
      binding: z
        .object({
          ownerId: z.string(),
          organizationId: z.string(),
          resumeId: z.string(),
          analysisId: z.string(),
          sourceId: z.string(),
          attemptId: z.string(),
          inputSha256: z.string(),
          effectiveLocale: z.string(),
        })
        .passthrough(),
      projected: z.array(sourceSelection),
      selections: z.array(sourceSelection).max(32),
      original: CanonicalResumeDraftSchema.nullable(),
      placement: z
        .object({
          document: CanonicalResumeDraftSchema,
          mappings: z.array(
            z.strictObject({
              selection: sourceSelection,
              sectionId: z.uuid(),
              entryId: z.uuid(),
              members: z
                .array(
                  z.strictObject({
                    assertionId: z.string(),
                    field: z.enum(["employer", "role", "dates"]),
                    factId: z.uuid(),
                    originalEntryId: z.uuid(),
                    citations: z.array(sourceCitation).length(1),
                  }),
                )
                .min(2)
                .max(3),
            }),
          ),
        })
        .passthrough()
        .nullable(),
      prototypeState: z.string().nullable(),
    }),
  )
  .parse(JSON.parse(data));
const expected = {
  reviewRevision: 0,
  reviewHeadId: null,
  assignmentRevision: 0,
  assignmentHeadId: null,
  associationRevision: 0,
  associationHeadId: null,
  canonicalHeadId: null,
};

function semantic(document: CanonicalResumeDraft) {
  const ids = new Map<string, string>([[document.versionId, "version"]]);
  document.facts.forEach((fact, i) => ids.set(fact.id, `fact-${i}`));
  document.sections.forEach((section, s) => {
    ids.set(section.id, `section-${s}`);
    section.entries.forEach((entry, e) => {
      ids.set(entry.id, `entry-${s}-${e}`);
      entry.bullets.forEach((bullet, b) =>
        ids.set(bullet.id, `bullet-${s}-${e}-${b}`),
      );
    });
  });
  document.changes.forEach((change, i) => ids.set(change.id, `change-${i}`));
  function visit(value: unknown, key = ""): unknown {
    if (key === "createdAt") return "technical-time";
    if (typeof value === "string") return ids.get(value) ?? value;
    if (Array.isArray(value)) return value.map((item) => visit(item));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, visit(v, k)]),
      );
    return value;
  }
  return visit(document);
}

describe("stored neutral JS reference data, without SQL execution", () => {
  it("pins the immutable 61-case reference packet, without an auto-update path", () => {
    expect(fixtures).toHaveLength(61);
    const hash = createHash("sha256").update(data).digest("hex");
    expect(hash).toBe(
      "16d93ec3e32bda4bf9b1f31d19a834c2e353dd17178ee377f09b4bcbcc9cf80a",
    );
    expect(verifier).toContain(`-- JS_ORACLE_SHA256: ${hash}`);
  });
  it.each(fixtures)(
    "replays actual source and structural normalization for $id",
    (fixture) => {
      const review = deriveEvidenceEntryAssociations(
        fixture.envelope,
        fixture.binding,
      );
      expect(review.state).toBe("review_required");
      const structural: unknown[] = [];
      for (let i = 0; i < review.groups.length; i += 32) {
        const result = prepareGroupedOriginalCommand(
          fixture.envelope,
          fixture.binding,
          {
            schemaVersion: "grouped-original-command/1.0.0",
            operation: "approve_and_import_grouped_original",
            binding: fixture.binding,
            expected,
            selectedGroupIds: review.groups
              .slice(i, i + 32)
              .map((group) => group.id),
            unselectedDisposition: "retain_original",
          },
        );
        expect(result.state).toBe("prepared");
        if (result.state !== "prepared")
          throw Error("EXPECTED_REFERENCE_PREPARATION");
        structural.push(...result.normalForm.selections);
      }
      expect(structural).toEqual(fixture.projected);
    },
  );

  it.each(fixtures.filter((f) => f.original && f.placement))(
    "matches the real constructors and retains original data for $id",
    (fixture) => {
      const original = fixture.original!;
      const placement = fixture.placement!;
      const owned = {
        ...fixture.binding,
        locale: fixture.binding.effectiveLocale,
      };
      const fresh = importCanonicalEvidence(fixture.envelope, owned);
      expect(semantic(original)).toEqual(semantic(fresh));
      const review = deriveEvidenceEntryAssociations(fixture.envelope, owned);
      const intent = GroupedOriginalImportIntentSchema.parse({
        schemaVersion: "grouped-original-selection/1.0.0",
        binding: {
          ...review.binding!,
          organizationId: owned.organizationId,
          resumeId: owned.resumeId,
          associationModelVersion: review.modelVersion,
          producerVersion: "canonical-engine/1.0.3",
          canonicalHeadId: null,
        },
        acknowledgement: "relationship_only_not_fact_confirmation",
        unselectedDisposition: "retain_original",
        selections: review.groups
          .slice(0, fixture.selections.length)
          .map((group) => ({ groupId: group.id, members: group.members })),
      });
      const result = importCanonicalGroupedEvidence(
        fixture.envelope,
        owned,
        intent,
      );
      expect(result.state).toBe("prepared");
      if (result.state !== "prepared")
        throw Error("EXPECTED_REFERENCE_PLACEMENT");
      expect(semantic(placement.document)).toEqual(semantic(result.document));
      const {
        sections: oldSections,
        producerVersion: oldProducer,
        ...oldData
      } = original;
      const {
        sections: newSections,
        producerVersion: newProducer,
        ...newData
      } = placement.document;
      expect(newData).toEqual(oldData);
      expect(oldProducer).toBe("canonical-engine/1.0.1");
      expect(newProducer).toBe("canonical-engine/1.0.3");
      const selectedFacts = new Set(
        newSections.flatMap((s) =>
          s.entries
            .filter((e) => e.factIds.length > 1)
            .flatMap((e) => e.factIds),
        ),
      );
      for (const section of oldSections)
        for (const entry of section.entries)
          if (!entry.factIds.some((id) => selectedFacts.has(id)))
            expect(
              newSections.find((s) => s.id === section.id)?.entries,
            ).toContainEqual(entry);
      expect(placement).toMatchObject({
        authority: "derived_preparation_only",
        persistable: false,
        scoringEligible: false,
        requiresDurableAdmission: true,
      });
      expect(placement.mappings.map((m) => m.selection)).toEqual(
        fixture.selections,
      );
      for (const mapping of placement.mappings) {
        const section = original.sections.find(
          (s) => s.id === mapping.sectionId,
        )!;
        const ordered = mapping.members.map((m) =>
          section.entries.findIndex((e) => e.id === m.originalEntryId),
        );
        expect(ordered).toEqual([...ordered].sort((a, b) => a - b));
        expect(mapping.members[0].field).toBe("employer");
        expect(mapping.entryId).toBe(mapping.members[0].originalEntryId);
        const emitted = newSections
          .find((s) => s.id === mapping.sectionId)
          ?.entries.find((e) => e.id === mapping.entryId);
        expect(emitted?.factIds).toEqual(mapping.members.map((m) => m.factId));
        for (const member of mapping.members) {
          expect(member.citations).toEqual(
            mapping.selection.members.find(
              (m) => m.assertionId === member.assertionId,
            )?.citations,
          );
          const assertion = fixture.envelope.assertions.find(
            (a) => a.id === member.assertionId,
          )!;
          expect(
            original.facts.find((f) => f.id === member.factId),
          ).toMatchObject({
            type: assertion.field,
            value: assertion.value,
            state: "unconfirmed",
            confirmation: null,
            sources: assertion.evidence.map((r) => ({
              ...r,
              attemptId: fixture.envelope.id,
            })),
          });
        }
      }
    },
  );

  it("retains the full 33-group projection and the valid 32x3 selection with 100 original entries", () => {
    const all = fixtures.find((f) => f.id === "source_33_groups")!;
    expect(all.projected).toHaveLength(33);
    expect(all.selections).toHaveLength(32);
    const bounded = fixtures.find(
      (f) => f.id === "selected_32_three_members_100_entries",
    )!;
    expect(bounded.selections).toHaveLength(32);
    expect(bounded.selections.every((g) => g.members.length === 3)).toBe(true);
    expect(bounded.original?.sections[0].entries).toHaveLength(100);
    expect(bounded.placement?.document.sections[0].entries).toHaveLength(36);
  });
  it("keeps actual bucket order across valid sparse native and OCR evidence", () => {
    const mixed = fixtures.find((f) => f.id === "mixed_method_bucket_order")!;
    expect(mixed.projected.map((g) => [g.pageId, g.method])).toEqual([
      ["page-2", "native_text"],
      ["page-1", "local_ocr"],
    ]);
    const sparse = fixtures.find((f) => f.id === "valid_sparse_native_ocr")!;
    expect(sparse.envelope.nativeSource.pages[0].text).toBe("Role:X");
    expect(sparse.projected.map((g) => g.method)).toEqual(["local_ocr"]);
    const native = sparse.original!.facts.filter((f) =>
      f.sources.some((r) => r.spanId.startsWith("native-")),
    );
    expect(native.length).toBeGreaterThan(0);
    for (const fact of native)
      expect(sparse.placement?.document.facts).toContainEqual(fact);
  });
  it("keeps the mixed/protected barriers and Unicode/date-before-role reference outcomes explicit", () => {
    for (const id of [
      "protected_contact_barrier",
      "mixed_education_barrier",
      "unknown_empty_barrier",
      "same_span_education",
      "same_span_certification",
      "page_boundary_no_cross",
    ])
      expect(fixtures.find((f) => f.id === id)?.projected).toEqual([]);
    expect(
      fixtures
        .find((f) => f.id === "dates_before_role")
        ?.projected[0].members.map((m) => m.field),
    ).toEqual(["employer", "dates", "role"]);
    expect(
      fixtures.find((f) => f.id === "old_empty_long_s_separator")?.projected,
    ).toHaveLength(1);
    const unicode = fixtures.find((f) => f.id === "unicode_offsets")!;
    const citation = unicode.projected[0].members[0].citations[0];
    const span = unicode.envelope.spans.find((s) => s.id === citation.spanId)!;
    expect(
      Array.from(span.text).slice(citation.start, citation.end).join(""),
    ).toBe("Synthetic Café 😀 Labs");
    expect(citation.pageStart).toBe(span.start + citation.start);
    expect(citation.pageEnd).toBe(span.start + citation.end);
  });
});

describe("private SQL source contract, unparsed and unexecuted", () => {
  it("contains only revoked immutable invoker helpers and no stored authority", () => {
    const names = [
      ...migration.matchAll(
        /create function private\.(grouped_import_[a-z0-9_]+)\(/g,
      ),
    ].map((m) => m[1]);
    expect(names).toHaveLength(13);
    expect(new Set(names).size).toBe(names.length);
    expect(
      migration.match(
        /immutable(?: strict)? security invoker set search_path = ''/g,
      ),
    ).toHaveLength(13);
    for (const name of names)
      expect(
        migration.slice(migration.lastIndexOf("revoke all on function")),
      ).toContain(`private.${name}(`);
    expect(migration).not.toMatch(
      /create or replace|create table|create function public\.|grant execute|from public\.|gen_random_uuid|clock_timestamp|validate_correction_child|\b(insert into|update public|delete from)\b/i,
    );
    expect(migration.startsWith("begin;\n")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(verifier).toContain("set local statement_timeout='15s'");
    expect(verifier).toContain("set local lock_timeout='2s'");
    expect(verifier.trimEnd().endsWith("rollback;")).toBe(true);
  });
  it("keeps independent source order, structural whitespace and local output validation explicit", () => {
    expect(migration).toContain("order by min(ordinality)");
    expect(migration).toContain(
      "order by (value->>'start')::numeric::integer,ordinality",
    );
    expect(migration).toContain("date[sſ]");
    expect(migration).toContain("chr(65279)");
    expect(migration).toContain(
      "if canonical_selection is distinct from p_selections",
    );
    expect(migration).toContain("input_producer_copy:=jsonb_set(document");
    expect(migration).toContain(
      "private.canonical_shape_valid(input_producer_copy)",
    );
    expect(migration).toContain("substring(span->>'text'");
  });
  it("declares the finite native refusal matrix and metadata-only failure receipts", () => {
    const cases = [...verifier.matchAll(/when '([a-z0-9_]+)' then/g)].map(
      (m) => m[1],
    );
    expect(cases).toHaveLength(54);
    expect(new Set(cases).size).toBe(cases.length);
    for (const id of [
      "source_ref_type",
      "source_span_empty_bounds",
      "source_refs_21",
      "selection_order",
      "selection_member_order",
      "base_missing_assertion",
      "base_duplicate_critical",
      "base_unmatched_critical",
      "base_complete_citations",
      "base_event_time",
      "base_duplicate_id",
      "base_contact_type",
      "base_fact_utf16",
      "base_title_utf16",
      "base_entries_101",
      "placement_missing",
      "placement_mixed",
      "placement_cross_section",
      "placement_anchor_order",
      "placement_multiple",
      "placement_section",
      "placement_bullet",
    ])
      expect(cases).toContain(id);
    expect(verifier).toContain(
      "exception when sqlstate '22023' then rejected:=true",
    );
    expect(verifier).toContain(
      "raise exception 'A02_SOURCE_REFUSAL_%',case_id",
    );
    expect(verifier).not.toMatch(
      /create (?:function|table|schema)|grant execute|\b(?:insert into|update public|delete from)\b/i,
    );
  });
});
