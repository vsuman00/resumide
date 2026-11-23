import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DocumentEvidenceSchema } from "../../app/lib/server/document-evidence";
import { CanonicalResumeDraftSchema } from "../../app/lib/server/canonical-resume-schema";
import { deriveEvidenceEntryAssociations } from "../../app/lib/server/evidence-entry-associations";
import {
  prepareGroupedOriginalCommand,
  normalizeGroupedOriginalCommand,
} from "../../app/lib/server/grouped-import-commands";
import {
  encodeGroupedImportCommandAtoms,
  hashGroupedImportCommandAtoms,
} from "../../app/lib/server/grouped-import-command-codec";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const migration = read(
  "supabase/migrations/20261113131538_grouped_original_admission.sql",
);
const foundation = read(
  "supabase/migrations/20261113130533_grouped_original_atomic_import.sql",
);
const verifier = read("scripts/verify-grouped-original-admission.sql");
const c02 = read(
  "supabase/migrations/20261110113245_canonical_correction_materialization.sql",
);
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Delimited source literals and JSON data only: no SQL grammar parser/runtime.
function body(source: string, name: string) {
  const match = source.match(
    new RegExp(
      `create(?: or replace)? function ${escape(name)}\\([^;]*?\\bas\\s+(\\$[a-z0-9_]*\\$)([\\s\\S]*?)\\1;`,
      "i",
    ),
  );
  if (!match) throw Error("MISSING_SOURCE_BODY");
  return match[2];
}
function block(source: string, tag: string): unknown {
  const match = source.match(
    new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$::jsonb;`),
  );
  if (!match) throw Error("MISSING_SOURCE_JSON");
  return JSON.parse(match[1]);
}
const patchSchema = z.object({
  signature: z.string(),
  sha256: z.string(),
  newSha256: z.string(),
  patches: z.array(z.object({ old: z.string(), new: z.string() })),
});
const patches = z.array(patchSchema).parse(block(migration, "patch_manifest"));
const catalogue = z
  .array(
    z.strictObject({
      signature: z.string(),
      sha256: z.string(),
      definer: z.boolean(),
      volatility: z.enum(["i", "s", "v"]),
      resultType: z.string(),
      strict: z.boolean(),
      language: z.enum(["sql", "plpgsql"]),
      serviceExecute: z.boolean(),
    }),
  )
  .parse(block(migration, "catalog_manifest"));
const columns = z
  .array(
    z.strictObject({
      table: z.string(),
      name: z.string(),
      type: z.string(),
      notNull: z.boolean(),
    }),
  )
  .parse(block(migration, "column_manifest"));
const foreignKeys = z
  .array(
    z.object({
      table: z.string(),
      columns: z.array(z.string()),
      foreignTable: z.string(),
      foreignColumns: z.array(z.string()),
      deferred: z.boolean(),
    }),
  )
  .parse(block(migration, "foreign_key_manifest"));
const triggers = z
  .array(
    z.object({
      table: z.string(),
      name: z.string(),
      function: z.string(),
      type: z.number(),
      argsHex: z.string(),
      argumentCount: z.number(),
    }),
  )
  .parse(block(migration, "trigger_manifest"));
const oracle = z
  .object({
    envelope: DocumentEvidenceSchema,
    original: CanonicalResumeDraftSchema,
    scope: z.record(z.string(), z.unknown()),
    command: z.object({
      normalForm: z.unknown(),
      previewHash: z.string(),
      idempotencyKey: z.uuid(),
    }),
    atoms: z.array(z.string().nullable()),
    hex: z.string(),
  })
  .parse(block(verifier, "oracle"));
const historical = [
  ...c02.matchAll(
    /\('([^']+)','([a-f0-9]{64})',(true|false),'([ivs])','([^']+)'::regtype\)/g,
  ),
].map((m) => ({
  signature: m[1],
  sha256: m[2],
  definer: m[3] === "true",
  volatility: m[4],
  resultType: m[5],
}));

function apply(source: string, changes: { old: string; new: string }[]) {
  for (const change of changes) {
    expect(source.split(change.old)).toHaveLength(2);
    source = source.replace(change.old, change.new);
  }
  return source;
}
const currentSave = (() => {
  let source = body(
    read(
      "supabase/migrations/20261012160703_candidate_authoring_transactions.sql",
    ),
    "public.save_canonical_version",
  );
  source = apply(source, [
    {
      old: "exists(select 1 from public.data_requests where user_id=p_user_id and kind='deletion' and status not in ('failed'))",
      new: "not private.try_candidate_privacy_write(p_user_id)",
    },
  ]);
  const producer = z
    .array(
      z.object({
        signature: z.string(),
        patches: z.array(z.object({ old: z.string(), new: z.string() })),
      }),
    )
    .parse(block(c02.slice(c02.indexOf("do $producer_patch$")), "manifest"));
  return apply(
    source,
    producer.find((row) =>
      row.signature.startsWith("public.save_canonical_version("),
    )!.patches,
  );
})();
const postimages = new Map(
  patches.map((patch) => {
    const name = patch.signature.split("(")[0];
    const before =
      name === "public.save_canonical_version" ? currentSave : body(c02, name);
    return [patch.signature, { before, after: apply(before, patch.patches) }];
  }),
);

describe("atomic admission immutable source/profile", () => {
  it("binds actual frozen foundation and historical37 without changing old source", () => {
    expect(hash(foundation)).toBe(
      "756121cbcf403e92da699b42ead62af15759a057486f588bb84525f579fa084d",
    );
    expect(historical).toHaveLength(37);
    expect(patches).toHaveLength(5);
    expect(catalogue).toHaveLength(68);
    expect(new Set(catalogue.map((r) => r.signature)).size).toBe(68);
    let unchanged = 0;
    for (const old of historical) {
      const current = catalogue.find((row) => row.signature === old.signature)!;
      const patch = patches.find((row) => row.signature === old.signature);
      expect(current.sha256).toBe(patch?.newSha256 ?? old.sha256);
      expect(current).toMatchObject({
        definer: old.definer,
        volatility: old.volatility,
        resultType: old.resultType,
      });
      if (!patch) unchanged++;
    }
    expect(unchanged).toBe(32);
  });
  it.each(patches)(
    "guards and reproduces the exact predecessor/successor for $signature",
    (patch) => {
      const images = postimages.get(patch.signature)!;
      expect(hash(images.before)).toBe(patch.sha256);
      expect(hash(images.after)).toBe(patch.newSha256);
      expect(
        catalogue.find((r) => r.signature === patch.signature)?.sha256,
      ).toBe(patch.newSha256);
    },
  );
  it("keeps correction_scope returned keys exact while adding private proof validation", () => {
    const images = postimages.get("private.correction_scope(uuid,uuid)")!;
    const marker = "  return jsonb_build_object('ownerId',p_user_id";
    expect(images.after.slice(images.after.indexOf(marker))).toBe(
      images.before.slice(images.before.indexOf(marker)),
    );
    expect(images.after).toContain(
      "private.entry_association_validate_head(h.id)",
    );
  });
  it("closes fresh/prior/retag/restore bypasses and couples C02+association snapshots", () => {
    const save = postimages.get(
      "public.save_canonical_version(uuid,uuid,jsonb,jsonb,text)",
    )!.after;
    expect(save.indexOf("GROUPED_IMPORT_REQUIRES_ADMISSION")).toBeLessThan(
      save.indexOf("select * into prior"),
    );
    expect(save).toContain(
      "prior.command->>'operation'='grouped_original_import'",
    );
    expect(save).toContain(
      "op='import' and prior.content->>'producerVersion'='canonical-engine/1.0.3'",
    );
    expect(save).toContain("GROUPED_PRODUCER_RETAG");
    expect(save).toContain(
      "p_body->'producerVersion' is distinct from target.content->'producerVersion'",
    );
    expect(save).toContain(
      "private.entry_association_validate_head(target.id)",
    );
    expect(
      postimages.get(
        "public.import_canonical_original(uuid,uuid,jsonb,jsonb,jsonb,text)",
      )!.after,
    ).toContain(
      "prior.content->>'producerVersion' not in ('canonical-engine/1.0.0','canonical-engine/1.0.1')",
    );
    expect(
      postimages.get("private.write_correction_snapshot(uuid,jsonb)")!.after,
    ).toContain(
      "private.entry_association_write_snapshot(p_version_id,p_command)",
    );
  });
  it("fingerprints every actual new dependency body and keeps the writer revoked", () => {
    const files = [
      foundation,
      migration,
      read(
        "supabase/migrations/20261113113504_grouped_import_structural_codec.sql",
      ),
      read(
        "supabase/migrations/20261113121645_grouped_import_source_validation.sql",
      ),
    ];
    const fresh = catalogue.filter(
      (r) =>
        r.signature.startsWith("private.grouped_import_") ||
        r.signature.startsWith("private.grouped_original_") ||
        r.signature.startsWith("private.entry_association_") ||
        r.signature.startsWith("public.import_canonical_grouped_original("),
    );
    expect(fresh).toHaveLength(25);
    for (const row of fresh) {
      const name = row.signature.split("(")[0];
      const source = files.find((s) => s.includes(`create function ${name}(`))!;
      expect(hash(body(source, name))).toBe(row.sha256);
      expect(row.serviceExecute).toBe(false);
    }
    expect(
      catalogue.find(
        (r) => r.signature === "public.export_resume_workspace_records(uuid)",
      )?.sha256,
    ).toBe(hash(body(foundation, "public.export_resume_workspace_records")));
    expect(
      catalogue.some(
        (r) => r.signature === "private.canonical_correction_write_ready()",
      ),
    ).toBe(false);
    const readyHash = hash(
      body(migration, "private.canonical_correction_write_ready"),
    );
    expect(readyHash).toBe(
      "07d338cc1cbd2c79df76dcbc21bd814b3612c43a0e748531f574974b55c25958",
    );
    expect(verifier).toContain(`is distinct from '${readyHash}'`);
    expect(migration).not.toContain("target.signature like 'public.%'");
    expect(migration).toContain("(target->>'serviceExecute')::boolean");
    expect(migration).not.toMatch(/grant execute/i);
  });
  it("matches all65 actual foundation column types/nullability, including ordered integers", () => {
    expect(columns).toHaveLength(65);
    for (const column of columns) {
      const chunk = foundation.match(
        new RegExp(
          `create table ${escape(column.table)} \\(([\\s\\S]*?)\\n\\);`,
        ),
      )?.[1];
      const declaration = chunk?.match(
        new RegExp(`\\b${column.name} ([a-z]+)([^,\\n]*)`),
      );
      expect(declaration).toBeTruthy();
      expect(declaration![1]).toBe(column.type);
      expect(/not null|primary key/.test(declaration![2])).toBe(column.notNull);
    }
    for (const name of ["group_order", "source_order", "entry_order"])
      expect(columns.find((column) => column.name === name)?.type).toBe(
        "integer",
      );
  });
  it("pins exact scoped FK order/deferral and immutable+privacy trigger metadata", () => {
    expect(foreignKeys).toHaveLength(21);
    for (const fk of foreignKeys) {
      expect(fk.columns).toHaveLength(fk.foreignColumns.length);
      const tuple = `foreign key(${fk.columns.join(",")})`;
      if (fk.columns.length > 1) expect(foundation).toContain(tuple);
      expect(foundation).toContain(
        `references ${fk.foreignTable}(${fk.foreignColumns.join(",")}) on delete cascade${fk.deferred ? " deferrable initially deferred" : ""}`,
      );
    }
    expect(triggers).toHaveLength(10);
    for (const trigger of triggers) {
      expect(foundation).toContain(trigger.name);
      expect(trigger).toMatchObject(
        trigger.name === "zz_candidate_privacy_write"
          ? { type: 23, argumentCount: 1, argsHex: "6f776e65725f696400" }
          : { type: 19, argumentCount: 0, argsHex: "" },
      );
    }
    expect(migration).toContain(
      "has_any_column_privilege(role_name,relation_oid,'SELECT')",
    );
    expect(migration).toContain("c.confdeltype='c'");
  });
  it("orders authority/replay/CAS/placement/IDs/writes inside one rollback block", () => {
    const rpc = body(migration, "public.import_canonical_grouped_original");
    const ordered = [
      "scope:=private.grouped_original_scope",
      "private.canonical_correction_write_ready()",
      "private.grouped_original_normalize",
      "select * into prior",
      "return private.grouped_original_receipt(prior.id,true)",
      "expected:=normal->'expected'",
      "private.correction_original_import_allowed",
      "private.grouped_import_place_original",
      "batch_id:=gen_random_uuid()",
      "insert into public.candidate_entry_association_batches",
      "insert into public.canonical_resume_versions",
      "private.write_correction_snapshot",
      "insert into public.audit_events",
      "exception",
    ];
    const indexes = ordered.map((text) => rpc.indexOf(text));
    expect(indexes.every((index) => index >= 0)).toBe(true);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    expect(rpc).toContain("'operation','grouped_original_import'");
    expect(rpc).toContain("'idempotencyKey',storage_key");
    expect(rpc).toContain("source_order,entry_order,assertion_id");
    expect(rpc).not.toContain("public.save_canonical_version(");
    expect(rpc.slice(rpc.indexOf("exception"))).not.toMatch(
      /insert into|update public|delete from/i,
    );
  });
});

describe("actual JS source/byte reference, never SQL execution", () => {
  it("rederives the immutable two-job normal form and A02 byte golden", () => {
    const binding = z
      .record(z.string(), z.unknown())
      .parse(
        z.record(z.string(), z.unknown()).parse(oracle.command.normalForm)
          .binding,
      );
    const owned = {
      ownerId: oracle.envelope.ownerId,
      analysisId: oracle.envelope.analysisId,
      sourceId: oracle.envelope.sourceId,
      inputSha256: oracle.envelope.inputSha256,
      attemptId: oracle.envelope.id,
      organizationId: z.string().parse(binding.organizationId),
      resumeId: z.string().parse(binding.resumeId),
    };
    const review = deriveEvidenceEntryAssociations(oracle.envelope, owned);
    const normal = z
      .record(z.string(), z.unknown())
      .parse(oracle.command.normalForm);
    const result = prepareGroupedOriginalCommand(oracle.envelope, owned, {
      schemaVersion: normal.schemaVersion,
      operation: normal.operation,
      binding: normal.binding,
      expected: normal.expected,
      selectedGroupIds: review.groups.map((g) => g.id),
      unselectedDisposition: "retain_original",
    });
    expect(result.state).toBe("prepared");
    if (result.state !== "prepared") throw Error("EXPECTED_REFERENCE");
    expect(result.normalForm).toEqual(oracle.command.normalForm);
    expect(result.semanticAtoms).toEqual(oracle.atoms);
    expect(result.semanticAtoms).toHaveLength(102);
    expect(
      encodeGroupedImportCommandAtoms(result.semanticAtoms).toString("hex"),
    ).toBe(oracle.hex);
    expect(hashGroupedImportCommandAtoms(result.semanticAtoms)).toBe(
      "c0f67f0c0992f443854c74a5d1ab49e20a063a46ec7973e2347558b1aec679fd",
    );
    const commit = normalizeGroupedOriginalCommand(oracle.envelope, owned, {
      schemaVersion: normal.schemaVersion,
      operation: normal.operation,
      binding: normal.binding,
      expected: normal.expected,
      selectedGroupIds: review.groups.map((g) => g.id),
      unselectedDisposition: "retain_original",
      acknowledgement: true,
      previewHash: result.previewHash,
      idempotencyKey: oracle.command.idempotencyKey,
    });
    expect(commit).toMatchObject({
      state: "prepared",
      semanticAtoms: oracle.atoms,
      persistable: false,
      scoringEligible: false,
    });
    const bytes = Buffer.from(oracle.hex, "hex").toString("utf8");
    expect(bytes).not.toContain("Synthetic");
    expect(bytes).not.toMatch(/entry-association-|observation-|target-/);
  });
  it("uses canonical integer atoms and independent result-content proof domains", () => {
    const atoms = body(migration, "private.grouped_original_atoms");
    expect(atoms).toContain("::numeric::bigint::text");
    expect(atoms).not.toContain("p_normal::text");
    expect(migration).toContain("convert_to(document::text,'UTF8')");
    expect(verifier).toContain("'integral_number_atoms'");
    expect(oracle.original.producerVersion).toBe("canonical-engine/1.0.1");
  });
  it("prepares finite native rollback/refusal/current-authority controls without auto-running them", () => {
    for (const name of [
      "post_batch_failure_rolls_approval_back",
      "pending_correction_no_approval",
      "atomic_original_applied",
      "both_snapshot_families",
      "exact_replay_after_head_review_association_movement",
      "replay_does_not_move_head",
      "changed_original_capture_conflicts",
      "changed_locale_conflicts",
      "missing_acknowledgement_denied",
      "privacy_precedes_prior_replay",
      "latest_source_precedes_prior_replay",
      "ordinary_producer_retag_denied",
      "plain_save_prior_grouped_denied",
      "legacy_wrapper_prior_grouped_denied",
      "plain_save_fresh_grouped_denied",
      "confirm_retains_links",
      "rename_retains_links",
      "edit_drops_whole_group",
      "rollback_copies_target_links",
      "history_not_reapproved",
    ])
      expect(verifier).toContain(`'${name}'`);
    expect(verifier).toContain("begin isolation level read committed;");
    expect(verifier).toContain(
      "get stacked diagnostics failure_message=MESSAGE_TEXT",
    );
    expect(verifier).toContain(
      "rejected:=failure_message='GROUPED_PRODUCER_RETAG'",
    );
    expect(verifier).toContain("set local statement_timeout='20s';");
    expect(verifier).toContain("rollback;\n-- DEFERRED TWO-SESSION PROTOCOL");
    expect(verifier).not.toMatch(/grant execute|disable trigger|db reset/i);
    expect(verifier).toContain(
      "delete from public.analysis_jobs j where j.analysis_id=fixture_scope.analysis_id",
    );
  });
});
