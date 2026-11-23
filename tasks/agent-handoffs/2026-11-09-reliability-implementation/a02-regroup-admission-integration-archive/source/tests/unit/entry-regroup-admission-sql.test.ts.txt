import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DocumentEvidenceSchema } from "../../app/lib/server/document-evidence";
import { CanonicalResumeDraftSchema } from "../../app/lib/server/canonical-resume-schema";
import { deriveEvidenceReviewTargets } from "../../app/lib/server/evidence-targets";
import { deriveNativePageDiagnostics } from "../../app/lib/server/ocr/pdf-detection";
import { prepareCanonicalEntryRegroup } from "../../app/lib/server/canonical-entry-regroup";
import {
  prepareCanonicalEntryRegroupCommand,
  type CanonicalEntryRegroupCommandContext,
  type CanonicalEntryRegroupRequest,
} from "../../app/lib/server/canonical-entry-regroup-commands";
const read = (path: string) =>
  readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const sql = read(
  "supabase/migrations/20261113180050_entry_regroup_atomic_admission.sql",
);
const previous = read(
  "supabase/migrations/20261113165140_entry_regroup_command_normalization.sql",
);
function literal(source: string, tag: string) {
  const result = source.match(
    new RegExp("\\$" + tag + "\\$([\\s\\S]*?)\\$" + tag + "\\$"),
  );
  if (!result) throw Error("MISSING_SOURCE_LITERAL_" + tag);
  return result[1];
}
function body(name: string) {
  return literal(sql, "erg_" + name);
}
type Patch = {
  signature: string;
  sha256: string;
  newSha256: string;
  patches: { old: string; new: string }[];
};
const patches = JSON.parse(literal(sql, "patch_manifest")) as Patch[];
function apply(old: string, p: Patch) {
  if (sha(old) !== p.sha256) throw Error("PREDECESSOR_DRIFT");
  for (const step of p.patches) {
    if (!step.old || old.split(step.old).length !== 2)
      throw Error("CONTEXT_DRIFT");
    old = old.replace(step.old, step.new);
  }
  if (sha(old) !== p.newSha256) throw Error("POSTIMAGE_DRIFT");
  return old;
}
const id = (n: number) =>
  `90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const oldLiteral = JSON.parse(
  read("tests/unit/canonical-entry-regroup-commands.test.ts").match(
    /export const NODE_REGROUP_LITERAL_JSON = String.raw`([\s\S]*?)`;/u,
  )![1],
);
function fixture(
  base = CanonicalResumeDraftSchema.parse(oldLiteral.base),
  revision = 1,
): CanonicalEntryRegroupCommandContext {
  const evidence = DocumentEvidenceSchema.parse(oldLiteral.evidence);
  const ownedContext = Object.fromEntries(
    [
      "ownerId",
      "organizationId",
      "resumeId",
      "analysisId",
      "sourceId",
      "attemptId",
      "inputSha256",
    ].map((k) => [k, oldLiteral.normalForm.binding[k]]),
  ) as CanonicalEntryRegroupCommandContext["historicalBaseView"]["ownedContext"];
  const targets = deriveEvidenceReviewTargets(evidence, ownedContext);
  return {
    sqlBaseContentSha256: revision === 1 ? "b".repeat(64) : "c".repeat(64),
    historicalBaseView: {
      ownedContext,
      canonicalRevision: revision,
      review: {
        analysisId: evidence.analysisId,
        attemptId: evidence.id,
        attemptNumber: 1,
        evidence,
        corrections: [],
        revision: 0,
        scoringEligible: false,
        nativePageDiagnostics: deriveNativePageDiagnostics(
          evidence.nativeSource,
        ),
        targets,
        historyAttestation: {
          schemaVersion: "evidence-review-history/1.0.0",
          state: "complete_captured_prefix",
          binding: {
            ...targets.binding,
            targetModelVersion: targets.modelVersion,
          },
          highWaterRevision: 0,
          highWaterEventId: null,
          receivedCount: 0,
          pageCount: 0,
        },
      },
      expectedBinding: {
        ...targets.binding,
        resumeId: ownedContext.resumeId,
        organizationId: ownedContext.organizationId,
        targetModelVersion: targets.modelVersion,
        projectionModelVersion: "canonical-corrections/1.0.1",
        reviewRevision: 0,
        canonicalHeadId: base.versionId,
      },
      canonicalSnapshot: {
        sourceId: evidence.sourceId,
        headId: base.versionId,
        current: base,
        ancestors:
          revision === 1
            ? []
            : [CanonicalResumeDraftSchema.parse(oldLiteral.base)],
      },
      selections: [],
    },
  };
}
function prepare(
  context: CanonicalEntryRegroupCommandContext,
  group: number,
  key: string,
  regroupRevision = 0,
  regroupHeadId: string | null = null,
) {
  const request: CanonicalEntryRegroupRequest = structuredClone(
    oldLiteral.request,
  );
  request.base = {
    versionId: context.historicalBaseView.canonicalSnapshot!.current.versionId,
    revision: context.historicalBaseView.canonicalRevision,
    contentSha256: context.sqlBaseContentSha256,
    locale: context.historicalBaseView.canonicalSnapshot!.current.locale,
  };
  request.expected = {
    ...request.expected,
    canonicalHeadId: request.base.versionId,
    regroupRevision,
    regroupHeadId,
  };
  request.selections = [request.selections[group]];
  const prepared = prepareCanonicalEntryRegroupCommand(context, request);
  expect(prepared.state).toBe("prepared");
  if (prepared.state !== "prepared")
    throw Error("ACTUAL_NODE_PREPARATION_REFUSED");
  const core = prepareCanonicalEntryRegroup(context.historicalBaseView, {
    schemaVersion: "canonical-entry-regroup-intent/1.0.0",
    operation: "preview_whole_entry_merge",
    baseVersionId: request.base.versionId,
    baseRevision: request.base.revision,
    selections: [
      {
        groupId: request.selections[0].groupId,
        members: prepared.normalForm.selections[0].members.map((m) => ({
          assertionId: m.assertionId,
          factId: m.factId,
        })),
      },
    ],
  });
  expect(core.state).toBe("prepared");
  if (core.state !== "prepared") throw Error("ACTUAL_CORE_REFUSED");
  return {
    request,
    command: {
      normalForm: prepared.normalForm,
      previewHash: prepared.previewHash,
      idempotencyKey: key,
    },
    sections: core.afterSections,
    changed: core.changed,
  };
}
function oracle() {
  const context = fixture(),
    first = prepare(context, 0, id(10));
  const parent = context.historicalBaseView.canonicalSnapshot!.current,
    created = "2026-11-13T18:00:00.000Z";
  const child = CanonicalResumeDraftSchema.parse({
    ...parent,
    versionId: id(11),
    parentVersionId: parent.versionId,
    createdAt: created,
    producerVersion: "canonical-engine/1.0.4",
    state: "review_required",
    sections: first.sections,
    changes: [
      {
        id: id(12),
        actorId: parent.ownerId,
        action: "edit",
        targetId: parent.resumeId,
        priorValue: null,
        createdAt: created,
      },
    ],
  });
  const second = prepare(fixture(child, 2), 1, id(20), 1, id(13));
  const unchanged = prepare(fixture(child, 2), 0, id(21), 1, id(13));
  return {
    evidence: oldLiteral.evidence,
    base: oldLiteral.base,
    first,
    child,
    second,
    unchanged,
  };
}

describe("saved regroup source contract and actual Node oracles; not SQL execution", () => {
  it("constructs actual first, partial .4 and unchanged-layout approval oracles", () => {
    const actual = oracle();
    expect(actual.first.sections[0].entries).toHaveLength(4);
    expect(actual.second.sections[0].entries).toHaveLength(2);
    expect(actual.unchanged.changed).toBe(false);
    expect(actual.child.facts).toEqual(actual.base.facts);
    expect(actual).toEqual(JSON.parse(ADMISSION_NODE_ORACLE_JSON));
  });
  it("keeps the canonical shape transition guarded by actual predecessor/context/postimage", () => {
    const p = patches.find(
      (p) => p.signature === "private.canonical_shape_valid(jsonb)",
    )!;
    expect(p.sha256).toBe(
      "572ba813d4b46eadc23c7cbb39334f1e093a9f2a746e3fd26bfd324f5354ae92",
    );
    expect(p.newSha256).toBe(
      "f981b00bfc627f23efb1b28008c0940cb93d458d439a7e72332c4e355e3c1837",
    );
    expect(p.patches).toHaveLength(1);
    expect(p.patches[0].new).toContain("canonical-engine/1.0.4");
    expect(sql).toContain("ERG_PREDECESSOR_DRIFT");
    expect(sql).toContain("ERG_CONTEXT_DRIFT");
    expect(sql).toContain("ERG_POSTIMAGE_DRIFT");
  });
  it("preserves old raw validations and eliminates the checked-wrapper proof cycle", () => {
    const raw = body("entry_regroup_base_data"),
      loaded = body("entry_regroup_resolve_loaded");
    expect(raw).toContain("depth=64");
    expect(raw).toContain("total_facts>20000");
    expect(raw).toContain("total_refs>20000");
    expect(raw).toContain("total_text>2000000");
    expect(raw).not.toContain("entry_association_validate_head");
    expect(loaded).not.toContain("entry_regroup_original_base");
    const oldProject = read(
      "supabase/migrations/20261113121645_grouped_import_source_validation.sql",
    ).match(
      /create function private\.grouped_import_project_candidates\([^;]*?as \$\$([\s\S]*?)\$\$;/u,
    )![1];
    expect(body("entry_regroup_project_loaded")).toBe(
      oldProject.replace(
        "idx jsonb:=private.grouped_import_source_index(p_envelope,p_binding);",
        "idx jsonb:=p_index;",
      ),
    );

    for (const name of [
      "entry_regroup_origin_proof",
      "entry_regroup_check_header",
      "entry_regroup_base_data",
      "entry_regroup_resolve_loaded",
      "entry_regroup_normalize_loaded",
    ])
      expect(body(name)).not.toMatch(
        /private\.(?:entry_regroup_original_base|entry_regroup_resolve|entry_regroup_normalize|correction_scope)\(/u,
      );
    expect(body("entry_regroup_origin_proof")).toContain(
      "order by regroup_revision",
    );
    expect(body("entry_regroup_origin_proof")).toContain(
      "origin.revision>=v.revision",
    );
  });
  it("places immutable replay before fresh captures, caps and technical IDs", () => {
    const writer = body("apply_canonical_entry_regroup"),
      prior = writer.indexOf("select * into prior"),
      replay = writer.indexOf(
        "return private.entry_regroup_receipt(prior.id,true)",
      );
    expect(prior).toBeGreaterThan(writer.indexOf("entry_regroup_scope"));
    expect(replay).toBeLessThan(writer.indexOf("entry_regroup_current"));
    expect(replay).toBeLessThan(writer.indexOf("gen_random_uuid"));
    expect(writer.slice(0, replay)).not.toContain("correction_scope");
    expect(writer.slice(0, replay)).not.toContain("canonical_resume_heads");
    expect(writer).toContain(
      "entry_regroup_origin_proof(scope,prior.regroup_revision,c)",
    );
  });
  it("keeps the narrow owner/privacy/source scope independent of current history and head", () => {
    const scope = body("entry_regroup_scope");
    for (const text of [
      "lock_candidate_owners",
      "try_candidate_privacy_write",
      "for update of root",
      "for update",
      "for share",
      "p_original_attempt",
    ])
      expect(scope).toContain(text);
    expect(scope).not.toMatch(
      /public\.(?:canonical_resume_heads|evidence_corrections|candidate_correction_assignments|candidate_entry_regroup_batches)/u,
    );
    expect(scope).not.toContain("entry_regroup_validate_head");
  });
  it("derives factual state and IDs only through the actual child factory", () => {
    const factory = body("entry_regroup_child_body");
    expect(factory).toContain("p_base||");
    expect(factory).toContain("'sections',p_sections");
    expect(factory).not.toContain("'facts'");
    expect(factory).toContain("'priorValue',null");
    expect(factory).toContain("'targetId',p_base->'resumeId'");
  });
  it("binds a protected pending batch and distinct inner key without permitting inner replay", () => {
    const save = body("entry_regroup_save_version");
    for (const text of [
      "REGROUP_REQUIRES_OUTER_REPLAY",
      "entry-regroup-storage/1.0.0",
      "b.command_bytes is distinct from bytes",
      "b.storage_key=b.idempotency_key",
      "b.base_content_sha256",
      "b.result_content_sha256",
    ])
      expect(save).toContain(text);
    expect(body("apply_canonical_entry_regroup")).toContain(
      "public.save_canonical_version",
    );
    const guard = patches.find(
      (p) =>
        p.signature ===
        "public.save_canonical_version(uuid,uuid,jsonb,jsonb,text)",
    )!;
    expect(
      guard.patches.some((p) =>
        p.new.includes(
          "public.canonical_entry_regroup_snapshots where canonical_version_id=head.id",
        ),
      ),
    ).toBe(true);
  });
  it("compares complete carried entry and every referenced fact but preserves confirmation changes", () => {
    const signature = body("entry_regroup_entry_signature");
    expect(signature).toContain("'entry',e");
    expect(signature).toContain("'factIds',facts");
    expect(signature).toContain("jsonb_array_elements(e->'bullets')");
    expect(body("entry_regroup_group_active")).toContain(
      "'type',old_fact->'type','value',old_fact->'value','sources',old_fact->'sources'",
    );
    expect(signature).not.toContain("confirmation");
    expect(signature).not.toContain("title");
  });
  it("dispatches by header presence for .2 adds and copies the exact TARGET composition", () => {
    const snapshot = body("entry_regroup_snapshot_work");
    expect(snapshot).toContain(
      "canonical_entry_regroup_snapshots where canonical_version_id=v.parent_version_id",
    );
    expect(snapshot).toContain(
      "restored:=(p_command->>'targetVersionId')::uuid; links:=private.entry_regroup_links(restored)",
    );
    expect(snapshot).toContain("kind:='inherited'");
    expect(snapshot).toContain("kind:='restore'");
    expect(snapshot).toContain("private.entry_association_write_snapshot");
    expect(body("entry_regroup_check_header")).toContain(
      "actual is distinct from private.entry_regroup_links(target)",
    );
  });
  it("reads actual global prefix pages and emits the existing strict witness/event fields", () => {
    const history = body("entry_regroup_review_prefix");
    expect(history).toContain(
      "revision>received and revision<=p_revision order by revision limit 100",
    );
    expect(history).toContain("pages:=pages+1");
    expect(history).toContain("'actor_id',actor_id");
    expect(history).not.toContain("to_jsonb(page)");
    expect(history).toContain("p_scope-array['organizationId','resumeId']");
    expect(body("read_canonical_entry_regroup_workspace")).toContain(
      "current_view:=jsonb_build_object('status','unavailable')",
    );
  });
  it("correlates every immutable receipt field independently from today's head", () => {
    const receipt = body("entry_regroup_receipt");
    for (const key of [
      "baseVersionId",
      "baseRevision",
      "idempotencyKey",
      "commandSha256",
      "versionId",
      "revision",
      "batchId",
      "regroupRevision",
      "regroupHeadId",
      "idempotent",
    ])
      expect(receipt).toContain("'" + key + "'");
    expect(receipt).not.toContain("canonical_resume_heads");
  });
  it("keeps actual profile70 properties/table guards and externally binds the successor", () => {
    const profile = literal(sql, "erg_readiness_adoption"),
      old = JSON.parse(literal(sql, "erg_old_catalog")),
      next = JSON.parse(literal(sql, "erg_new_catalog"));
    expect(old).toHaveLength(70);
    expect(next).toHaveLength(103);
    for (const row of old) {
      const after = next.find(
        (v: { signature: string }) => v.signature === row.signature,
      );
      expect(after).toEqual({
        ...row,
        sha256:
          patches.find((p) => p.signature === row.signature)?.newSha256 ??
          row.sha256,
      });
    }
    expect(
      next.find(
        (v: { signature: string }) =>
          v.signature ===
          "public.apply_canonical_entry_regroup(uuid,uuid,jsonb,text)",
      ).serviceExecute,
    ).toBe(false);
    expect(
      next.find(
        (v: { signature: string }) =>
          v.signature ===
          "public.read_canonical_entry_regroup_workspace(uuid,uuid,jsonb)",
      ).serviceExecute,
    ).toBe(true);
    expect(profile).toContain(
      "c09803937360d27e8b9cd5d8cbe20177100560c6cea82c60891d43281f4e2f86",
    );
  });
  it("denies writer/private execution and grants only the actual service read RPC", () => {
    expect(sql.match(/grant execute on function/g)).toHaveLength(1);
    expect(sql).toContain(
      "grant execute on function public.read_canonical_entry_regroup_workspace(uuid,uuid,jsonb) to service_role;",
    );
    expect(sql).toContain(
      "revoke all on function public.apply_canonical_entry_regroup(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;",
    );
  });
  it("retains all aggregate ceilings and accounts original immutable identities once", () => {
    const inspect = body("entry_regroup_inspect"),
      work = body("entry_regroup_work");
    for (const n of [2048, 64, 33554432, 200000, 400000, 8000000])
      expect(inspect).toContain(String(n));
    expect(work).toContain("2000000");
    expect(inspect.indexOf("bytes>1048576")).toBeLessThan(
      inspect.indexOf("for f in"),
    );
    expect(inspect).toContain("if c->'seen' ? cache_key then return c");
  });
  it("indexes immutable fact/signature work and propagates the cache across protected phases", () => {
    const signature = body("entry_regroup_entry_signature"),
      active = body("entry_regroup_group_active"),
      writer = body("apply_canonical_entry_regroup");
    expect(signature).toContain("c->'indexes'");
    expect(signature).toContain("c->'signatures' ? key_value");
    expect(signature).not.toContain("where value->>'id'=ref");
    expect(signature).toContain("f:=index_value->ref");
    expect(active).toContain("'cache',c");
    expect(body("entry_regroup_resolve_loaded")).toContain(
      "c->'resolutions' ? cache_key",
    );
    expect(writer).toContain(
      "entry_regroup_merge_work(c,result->'internalAccounting')",
    );
    expect(body("entry_regroup_save_version")).toContain(
      "'internalAccounting',c",
    );
    expect(writer).not.toContain("p_command->'internalAccounting'");
    const loader = body("entry_regroup_load_base"),
      resolver = body("entry_regroup_resolve_loaded");
    expect(loader).toContain("critical_count*layout_cost");
    expect(loader).toContain("loaded-array['envelope']");
    expect(loader).toContain("'_sourceRef',e.id");
    expect(loader).toContain("c->'sourceIndexes'->source_key");
    expect(resolver).toContain("private.entry_regroup_work(c,layout_cost+");
    expect(resolver).toContain(
      "private.entry_regroup_work(c,jsonb_array_length(version.content->'facts'))",
    );
    expect(resolver).toContain("private.entry_regroup_project_loaded");
    const wrapper = patches.find(
      (p) => p.signature === "private.entry_regroup_resolve(jsonb,jsonb,jsonb)",
    )!.patches[0].new;
    expect(wrapper).toContain("loaded->'cache'");
    expect(wrapper).not.toContain("private.entry_regroup_original_base");

    expect(body("entry_regroup_merge_work")).toContain(
      "if not (c->'seen' ? k)",
    );
  });
  it("binds the exact deferred native oracle and labels privileged source evidence honestly", () => {
    const verifier = read("scripts/verify-entry-regroup-admission.sql");
    expect(JSON.parse(literal(verifier, "era_oracle"))).toEqual(
      JSON.parse(ADMISSION_NODE_ORACLE_JSON),
    );
    expect(verifier).toContain("UNPARSED / UNEXECUTED");
    expect(verifier).toContain("privileged metadata fixture");
    expect(verifier.trim()).toMatch(/rollback;$/u);
    for (const name of [
      "actual_first_apply",
      "unchanged_layout_is_saved_approval",
      "actual_partial_base_apply",
      "retained_original_typed_origin",
      "old_receipt_before_current_head",
      "actual_2_add_metadata_presence_and_whole_group_loss",
      "legacy_restore_has_explicit_empty_header",
      "actual_global_prefix_two_chunks",
      "original_prefix_receipt_ignores_later_overflow",
    ])
      expect(verifier).toContain(name);
    expect(verifier).not.toMatch(/create extension|dblink|grant execute/iu);
    const profile = literal(sql, "erg_readiness_adoption");
    const pin = profile.match(/postimage text:='([a-f0-9]{64})'/u)![1];
    expect(verifier).toContain(pin);
  });
  it("retains actual old prepared body hashes and rejects guarded context drift", () => {
    const guards = JSON.parse(literal(sql, "erg_prepared_guards"));
    expect(guards).toHaveLength(4);
    for (const p of patches.filter(
      (p) =>
        p.signature.includes("entry_regroup_original_base") ||
        p.signature.includes("entry_regroup_resolve(") ||
        p.signature.includes("entry_regroup_normalize("),
    )) {
      const name = p.signature.split(".")[1].split("(")[0];
      const old = previous.match(
        new RegExp(
          "create function private\\." +
            name +
            "\\([^;]*?as \\$\\$([\\s\\S]*?)\\$\\$;",
        ),
      )![1];
      expect(apply(old, p)).toBe(p.patches[0].new);
      expect(() => apply(old, { ...p, sha256: "0".repeat(64) })).toThrow(
        "PREDECESSOR_DRIFT",
      );
      expect(() =>
        apply(old, { ...p, patches: [{ old: "missing", new: "changed" }] }),
      ).toThrow("CONTEXT_DRIFT");
      expect(() => apply(old, { ...p, newSha256: "0".repeat(64) })).toThrow(
        "POSTIMAGE_DRIFT",
      );
    }
  });
});

// Immutable actual Node/Core preparation. Native substitution is explicit and never rewrites this oracle.
export const ADMISSION_NODE_ORACLE_JSON = String.raw`{
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
  "first": {
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
        }
      ],
      "unselectedDisposition": "retain_eligible_original_origins"
    },
    "command": {
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
          }
        ]
      },
      "previewHash": "f81d2b731d1ef9ca4318775f9ed20631ba367c06addb47c363f4da82bdfb090e",
      "idempotencyKey": "90000000-0000-4000-8000-000000000010"
    },
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
              "10000000-0000-4000-8000-000000000101",
              "10000000-0000-4000-8000-000000000102",
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
    "changed": true
  },
  "child": {
    "schemaVersion": "canonical-resume/1.0.0",
    "producerVersion": "canonical-engine/1.0.4",
    "analysisId": "10000000-0000-4000-8000-000000000003",
    "inputSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "retentionPolicyId": "synthetic/1.0.0",
    "resumeId": "10000000-0000-4000-8000-000000000005",
    "versionId": "90000000-0000-4000-8000-000000000011",
    "parentVersionId": "10000000-0000-4000-8000-000000000100",
    "ownerId": "10000000-0000-4000-8000-000000000002",
    "organizationId": "10000000-0000-4000-8000-000000000006",
    "locale": "en-IN",
    "createdAt": "2026-11-13T18:00:00.000Z",
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
              "10000000-0000-4000-8000-000000000101",
              "10000000-0000-4000-8000-000000000102",
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
        "id": "90000000-0000-4000-8000-000000000012",
        "actorId": "10000000-0000-4000-8000-000000000002",
        "action": "edit",
        "targetId": "10000000-0000-4000-8000-000000000005",
        "priorValue": null,
        "createdAt": "2026-11-13T18:00:00.000Z"
      }
    ]
  },
  "second": {
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
        "versionId": "90000000-0000-4000-8000-000000000011",
        "revision": 2,
        "contentSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        "locale": "en-IN"
      },
      "expected": {
        "reviewRevision": 0,
        "reviewHeadId": null,
        "assignmentRevision": 0,
        "assignmentHeadId": null,
        "associationRevision": 0,
        "associationHeadId": null,
        "regroupRevision": 1,
        "regroupHeadId": "90000000-0000-4000-8000-000000000013",
        "canonicalHeadId": "90000000-0000-4000-8000-000000000011"
      },
      "selections": [
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
    "command": {
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
          "versionId": "90000000-0000-4000-8000-000000000011",
          "revision": 2,
          "contentSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          "locale": "en-IN"
        },
        "expected": {
          "reviewRevision": 0,
          "reviewHeadId": null,
          "assignmentRevision": 0,
          "assignmentHeadId": null,
          "associationRevision": 0,
          "associationHeadId": null,
          "regroupRevision": 1,
          "regroupHeadId": "90000000-0000-4000-8000-000000000013",
          "canonicalHeadId": "90000000-0000-4000-8000-000000000011"
        },
        "acknowledgementPolicy": "whole_entry_merge_not_fact_confirmation",
        "acknowledgement": true,
        "unselectedDisposition": "retain_eligible_original_origins",
        "selections": [
          {
            "pageId": "page-1",
            "method": "native_text",
            "sectionId": "10000000-0000-4000-8000-000000000107",
            "anchorEntryId": "10000000-0000-4000-8000-000000000111",
            "insertionIndex": 1,
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
      "previewHash": "798f74cd74d416601b323fa8779a7d6d65e55519d721640b6c26547949625c6f",
      "idempotencyKey": "90000000-0000-4000-8000-000000000020"
    },
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
              "10000000-0000-4000-8000-000000000101",
              "10000000-0000-4000-8000-000000000102",
              "10000000-0000-4000-8000-000000000103"
            ],
            "bullets": []
          },
          {
            "id": "10000000-0000-4000-8000-000000000111",
            "factIds": [
              "10000000-0000-4000-8000-000000000104",
              "10000000-0000-4000-8000-000000000105",
              "10000000-0000-4000-8000-000000000106"
            ],
            "bullets": []
          }
        ]
      }
    ],
    "changed": true
  },
  "unchanged": {
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
        "versionId": "90000000-0000-4000-8000-000000000011",
        "revision": 2,
        "contentSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        "locale": "en-IN"
      },
      "expected": {
        "reviewRevision": 0,
        "reviewHeadId": null,
        "assignmentRevision": 0,
        "assignmentHeadId": null,
        "associationRevision": 0,
        "associationHeadId": null,
        "regroupRevision": 1,
        "regroupHeadId": "90000000-0000-4000-8000-000000000013",
        "canonicalHeadId": "90000000-0000-4000-8000-000000000011"
      },
      "selections": [
        {
          "groupId": "entry-association-1036212579a5a6954c04df1e78a8d8efad6fdda28830f8849823bab1975597ac",
          "factIds": [
            "10000000-0000-4000-8000-000000000101",
            "10000000-0000-4000-8000-000000000102",
            "10000000-0000-4000-8000-000000000103"
          ]
        }
      ],
      "unselectedDisposition": "retain_eligible_original_origins"
    },
    "command": {
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
          "versionId": "90000000-0000-4000-8000-000000000011",
          "revision": 2,
          "contentSha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          "locale": "en-IN"
        },
        "expected": {
          "reviewRevision": 0,
          "reviewHeadId": null,
          "assignmentRevision": 0,
          "assignmentHeadId": null,
          "associationRevision": 0,
          "associationHeadId": null,
          "regroupRevision": 1,
          "regroupHeadId": "90000000-0000-4000-8000-000000000013",
          "canonicalHeadId": "90000000-0000-4000-8000-000000000011"
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
              "10000000-0000-4000-8000-000000000108"
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
                  "entryId": "10000000-0000-4000-8000-000000000108",
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
                  "entryId": "10000000-0000-4000-8000-000000000108",
                  "bulletId": null
                }
              }
            ]
          }
        ]
      },
      "previewHash": "0431454021de408e3873f92ba63605ff45b18c1e63a5dbbe2848814a8ccf7204",
      "idempotencyKey": "90000000-0000-4000-8000-000000000021"
    },
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
              "10000000-0000-4000-8000-000000000101",
              "10000000-0000-4000-8000-000000000102",
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
    "changed": false
  }
}`;
