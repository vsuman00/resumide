import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LEGACY_SCORING_INPUT_PROFILE as terminalProfile,
  HISTORICAL_LEGACY_SCORING_INPUT_PROFILE as currentProfile,
} from "../../app/lib/server/legacy-scoring-input-profile";

// Explicit historical b18 profile: these nine predecessor assertions continue
// to test frozen2cb. Current forward source is checked separately below.
const profile = Object.freeze({
  schemaVersion: "legacy-scoring-readiness/1.0.0",
  profileVersion: "legacy-scoring-profile/1.0.0",
  checkerSha256:
    "e891aed3848b39893718d883f7a3ff5efb3ebeda3ee6967d64daa13924075458",
  readerSha256:
    "1b9891fc6ece7e948c4623b6455686a2fc42e4896ff3fcc78f0ce0275a44d7c3",
  finishSha256:
    "e367a8f688b2661fc8baa374ad44a4be90712016d3ed44214857ed1127e10f18",
  contextSha256:
    "c79b6174de5e28fc56a0cb3648d5e1cc4e19ff5139f2869ce54478c9cf6cf618",
  exportSha256:
    "e4c17997fdbec81d931e4838b3522c6c7d3c861b0bfa07b6fb3ab5ece160f0a2",
  metadataSha256:
    "f18e6abfd698c4dbf4f7f6040fb577b2e49e78e4125bfd9d31e8166d0e678da8",
} as const);

// Textual protocol checks only. These do not parse or execute PostgreSQL.
const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20261115045834_legacy_scoring_input.sql",
    import.meta.url,
  ),
  "utf8",
);
const source = (name: string, text = sql) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(
    `create(?: or replace)? function\\s+${escaped}\\s*\\([\\s\\S]*?\\)\\s*returns\\s+[\\s\\S]*?\\bas\\s+(\\$[A-Za-z0-9_]*\\$)([\\s\\S]*?)\\1;`,
    "iu",
  ).exec(text);
  if (!match) throw new Error(`Missing declared routine: ${name}`);
  return match[2];
};
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const finish = source("public.finish_legacy_scoring_input");
const reader = source("public.read_legacy_scoring_input");
const checker = source("private.legacy_scoring_ready");
const input = source("private.legacy_scoring_input_data");
const exporter = source("public.export_legacy_scoring_inputs");
const catalog = JSON.parse(
  /\$legacy_catalog\$([\s\S]*?)\$legacy_catalog\$/u.exec(checker)![1],
) as {
  signature: string;
  sha256: string;
}[];

describe("legacy scoring input native source contract (not SQL execution)", () => {
  it("pins six actual bodies and every new helper through a separate closure", () => {
    const fields = {
      checkerSha256: "private.legacy_scoring_ready",
      readerSha256: "public.read_legacy_scoring_input",
      finishSha256: "public.finish_legacy_scoring_input",
      contextSha256: "public.read_legacy_scoring_context",
      exportSha256: "public.export_legacy_scoring_inputs",
      metadataSha256: "public.read_legacy_scoring_readiness",
    } as const;
    for (const [field, name] of Object.entries(fields))
      expect(profile[field as keyof typeof fields]).toBe(hash(source(name)));
    expect(catalog).toHaveLength(21);
    for (const item of catalog.filter((row) =>
      row.signature.includes("legacy_scoring"),
    ))
      expect(item.sha256).toBe(hash(source(item.signature.split("(")[0])));
    expect(
      catalog.some((row) => row.signature === "private.legacy_scoring_ready()"),
    ).toBe(false);
  });

  it("keeps the actual thirteen-argument scorer and R19 lease postimage unchanged", () => {
    const persist = readFileSync(
      new URL(
        "../../supabase/migrations/20260910110000_version_skill_taxonomy.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(hash(source("public.persist_deterministic_analysis", persist))).toBe(
      "8ccb108f8e38b4634cfe6b9e6e8c3e946272637cca6f0872c6e8213d313c631a",
    );
    const stage = readFileSync(
      new URL(
        "../../supabase/migrations/20261110082455_analysis_stage_write_fencing.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const old =
      "if exists(select 1 from public.data_requests d where d.user_id=a.owner_id and d.kind='deletion' and d.status<>'failed') then return false; end if;";
    const next =
      "if not private.try_candidate_privacy_write(a.owner_id) then return false; end if;";
    const body = source("private.lock_analysis_stage_lease", stage);
    expect(body.split(old)).toHaveLength(2);
    expect(hash(body.replace(old, next))).toBe(
      "d5bf2c2c633833a174f5351275b6b09eb4c8bf945bd7c6c889eaa6ef64893883",
    );
    expect(finish).toMatch(
      /persist_deterministic_analysis\(a\.id,p_result->>'inputTextChecksum',p_result->'keywordCoverage',p_result->>'normalizerVersion',[\s\S]*?p_result->>'taxonomyVersion'\)/u,
    );
    expect(sql).not.toMatch(
      /create or replace|drop function|alter table public\./iu,
    );
  });

  it("authenticates source/privacy before exact replay and puts fresh CAS after replay", () => {
    const access = finish.indexOf("a:=private.legacy_scoring_access");
    const prior = finish.indexOf(
      "select * into s from private.analysis_scoring_inputs",
    );
    const replay = finish.indexOf(
      "return private.legacy_scoring_receipt(s,true)",
    );
    const freshness = finish.indexOf("if a.status<>'scoring'");
    expect(access).toBeLessThan(prior);
    expect(prior).toBeLessThan(replay);
    expect(replay).toBeLessThan(freshness);
    expect(finish).toContain(
      "s.input_context->'binding' is distinct from p_binding",
    );
    expect(finish).toContain(
      "'workerId',s.worker_id,'attempt',s.attempt,'leaseFence',s.lease_fence",
    );
    expect(finish).toContain(
      "private.legacy_scoring_result(d) is distinct from p_result",
    );
    expect(finish.slice(prior, replay)).not.toMatch(
      /s\.process_id|s\.request_id|legacy_scoring_input_data/u,
    );
  });

  it("raises on old false and post-expiry so no partial success receipt can escape", () => {
    const persist = finish.indexOf(
      "persisted:=public.persist_deterministic_analysis",
    );
    const failed = finish.indexOf(
      "if persisted is not true then perform private.legacy_scoring_fail",
    );
    const insert = finish.indexOf(
      "insert into private.analysis_scoring_inputs",
    );
    const post = finish.indexOf(
      "if not private.lock_analysis_stage_lease",
      insert,
    );
    const receipt = finish.indexOf(
      "return private.legacy_scoring_receipt(s,false)",
    );
    expect(persist).toBeGreaterThan(0);
    expect(persist).toBeLessThan(failed);
    expect(failed).toBeLessThan(insert);
    expect(insert).toBeLessThan(post);
    expect(post).toBeLessThan(receipt);
    expect(finish).not.toMatch(/exception when|on conflict|return false/iu);
  });

  it("binds exact native scoring inputs without audit IDs or inferred page/JD data", () => {
    expect(input).toContain(
      "encode(sha256(convert_to(e.extracted_text,'UTF8')),'hex')",
    );
    expect(input).toContain("'pageTexts',e.page_texts");
    expect(input).toContain("if p_analysis.job_id is null then");
    expect(input).toContain(
      "id=p_analysis.job_id and owner_id=p_analysis.owner_id and organization_id=p_analysis.organization_id for share",
    );
    const core = input.slice(
      input.indexOf("core_value:="),
      input.indexOf("binding_value:="),
    );
    expect(core).toContain(
      "'source',source_value,'extraction',extraction_value,'job',job_value,'producer',producer_value",
    );
    expect(core).not.toMatch(/request|process|lease|status|readiness|result/iu);
    expect(input).not.toMatch(/substring|left\(|jsonb_array_elements.*limit/iu);
    expect(input).toContain(
      "octet_length(convert_to(answer::text,'UTF8'))>4194304",
    );
  });

  it("requires real static worker authority for skipped and committed branches", () => {
    expect(reader).toContain(
      "and not private.legacy_scoring_static_job(a.id,p_lease)",
    );
    const proof = reader.indexOf(
      "if not private.legacy_scoring_static_job(a.id,p_lease)",
    );
    const skipped = reader.indexOf("'status','skipped'");
    expect(proof).toBeLessThan(skipped);
    expect(reader).toContain("'analysisId',a.id,'reason','not_scoring'");
    expect(reader).toContain(
      "exists(select 1 from public.analysis_deterministic_results where analysis_id=a.id)",
    );
    expect(source("private.legacy_scoring_access")).toContain(
      "public.document_evidence_attempts",
    );
    expect(checker).toContain("document_evidence_no_deterministic_score");
  });

  it("hashes the complete deterministic row with explicit UTC microsecond time", () => {
    const digest = source("private.legacy_scoring_row_sha256");
    expect(digest).toContain(
      "to_jsonb(p_row)||jsonb_build_object('created_at'",
    );
    expect(digest).toContain("p_row.created_at at time zone 'UTC'");
    expect(digest).toContain('YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
    for (const name of [
      "private.guard_legacy_scoring_input",
      "public.read_legacy_scoring_input",
      "public.finish_legacy_scoring_input",
      "public.read_legacy_scoring_context",
    ])
      expect(source(name)).toContain("private.legacy_scoring_row_sha256(d)");
    expect(sql).not.toContain("convert_to(to_jsonb(d)::text");
  });

  it("makes only real old deterministic rows unbound and returns the saved original context", () => {
    const saved = source("public.read_legacy_scoring_context");
    expect(
      saved.indexOf(
        "select * into d from public.analysis_deterministic_results",
      ),
    ).toBeLessThan(saved.indexOf("'status','legacy_unbound'"));
    expect(saved).toContain("'context',s.input_context");
    expect(saved).toContain(
      "actual->'binding' is not distinct from s.input_context->'binding'",
    );
    expect(saved).not.toContain("exception when");
  });

  it("stages all data calls, pins privacy/trigger/FK proof, and exports the complete owner collection", () => {
    expect(
      [
        ...sql.matchAll(/grant execute on function ([^;]+) to service_role;/gu),
      ].map((m) => m[1]),
    ).toEqual(["public.read_legacy_scoring_readiness()"]);
    expect(sql.match(/on delete cascade/gu)).toHaveLength(7);
    expect(sql).toContain("extraction_analysis_id=analysis_id");
    expect(source("private.guard_legacy_scoring_input")).toContain(
      "LEGACY_SCORING_INPUT_IMMUTABLE",
    );
    expect(source("private.guard_legacy_scoring_input")).toContain(
      "private.legacy_scoring_static_job",
    );
    expect(checker).toContain("has_any_column_privilege");
    expect(exporter).toContain("where owner_id=p_user_id limit 4097");
    expect(exporter).toContain("if row_count>4096");
    expect(exporter).toContain("if total_bytes>33554432");
    expect(exporter).toContain(
      "octet_length(convert_to(answer::text,'UTF8'))>33554432",
    );
    expect(exporter).not.toContain("organization_id=");
  });
});

const forward = readFileSync(
  new URL(
    "../../supabase/migrations/20261115064102_stored_scoring_source_access.sql",
    import.meta.url,
  ),
  "utf8",
);
const nextChecker = source("private.legacy_scoring_ready", forward);
const nextCatalog = JSON.parse(
  /\$legacy_catalog\$([\s\S]*?)\$legacy_catalog\$/u.exec(nextChecker)![1],
) as typeof catalog;
const guard = source("private.legacy_scoring_stored_source", forward);

describe("forward stored-original-source admission (text only, not native proof)", () => {
  it("preserves frozen2cb and all nine historical assertions while pinning current actual bodies", () => {
    expect(hash(sql)).toBe(
      "2cb4e2e684d4f4270085a541911422637b811aba8b02ce668f5dab4833dc8f80",
    );
    const fields = {
      checkerSha256: "private.legacy_scoring_ready",
      readerSha256: "public.read_legacy_scoring_input",
      finishSha256: "public.finish_legacy_scoring_input",
      contextSha256: "public.read_legacy_scoring_context",
      exportSha256: "public.export_legacy_scoring_inputs",
      metadataSha256: "public.read_legacy_scoring_readiness",
    } as const;
    for (const [field, name] of Object.entries(fields)) {
      const unchanged = field === "exportSha256" || field === "metadataSha256";
      expect(currentProfile[field as keyof typeof fields]).toBe(
        hash(source(name, unchanged ? sql : forward)),
      );
    }
    expect(currentProfile.schemaVersion).toBe(profile.schemaVersion);
    expect(currentProfile.profileVersion).toBe(profile.profileVersion);
  });

  it("adds one private helper and only one admission call to each existing bound branch", () => {
    const names = [
      "public.read_legacy_scoring_input",
      "public.finish_legacy_scoring_input",
      "public.read_legacy_scoring_context",
    ];
    for (const name of names) {
      const before = source(name);
      const after = source(name, forward);
      const call =
        name === "public.read_legacy_scoring_context"
          ? "  perform private.legacy_scoring_stored_source(s);\n"
          : "    perform private.legacy_scoring_stored_source(s);\n";
      expect(after.split(call)).toHaveLength(2);
      expect(after.replace(call, "")).toBe(before);
      expect(after.indexOf("private.legacy_scoring_access(")).toBeLessThan(
        after.indexOf(call),
      );
    }
    expect(
      [...forward.matchAll(/create(?: or replace)? function ([^(]+)/gu)].map(
        (m) => m[1],
      ),
    ).toEqual([
      "private.legacy_scoring_stored_source",
      ...names,
      "private.legacy_scoring_ready",
    ]);
  });

  it("locks the actual immutable row and original owned version/root without reverse-order waiting", () => {
    expect(guard).toContain(
      "select * into actual from private.analysis_scoring_inputs where analysis_id=p_stored.analysis_id",
    );
    expect(guard).toContain("for key share skip locked");
    expect(guard).toContain("actual is distinct from p_stored");
    expect(guard).toContain(
      "public.resume_versions where id=actual.resume_version_id and resume_id=actual.resume_id",
    );
    expect(guard).toContain(
      "and owner_id=actual.owner_id and organization_id=actual.organization_id for share skip locked",
    );
    expect(guard).toContain(
      "public.resumes where id=actual.resume_id and owner_id=actual.owner_id",
    );
    expect(guard).toContain(
      "and organization_id=actual.organization_id and status='active' for share skip locked",
    );
    expect(guard.match(/legacy_scoring_fail\('not_found'\)/gu)).toHaveLength(3);
    expect(guard.match(/for (?:key share|share) skip locked/gu)).toHaveLength(
      3,
    );
    expect(guard).not.toMatch(
      /public\.analyses|lease|job_id|legacy_unbound|input_data|exception when|return false/iu,
    );
  });

  it("admits original access before every saved return while keeping exact replay before fresh checks", () => {
    const worker = source("public.read_legacy_scoring_input", forward);
    const replay = source("public.finish_legacy_scoring_input", forward);
    const saved = source("public.read_legacy_scoring_context", forward);
    const call = "perform private.legacy_scoring_stored_source(s)";
    expect(worker.indexOf(call)).toBeLessThan(worker.indexOf("'committed'"));
    expect(replay.indexOf(call)).toBeLessThan(
      replay.indexOf("return private.legacy_scoring_receipt(s,true)"),
    );
    expect(replay.indexOf(call)).toBeLessThan(
      replay.indexOf("if a.status<>'scoring'"),
    );
    expect(replay.indexOf(call)).toBeLessThan(
      replay.indexOf("context_value:=private.legacy_scoring_input_data(a)"),
    );
    expect(saved.indexOf(call)).toBeLessThan(
      saved.indexOf("actual:=private.legacy_scoring_input_data(a)"),
    );
    expect(saved.indexOf(call)).toBeGreaterThan(
      saved.indexOf("'status','legacy_unbound'"),
    );
    expect(saved).toContain("'context',s.input_context");
  });

  it("guards exact preimages and extends the actual closure without discarding old dependencies", () => {
    const preimages = JSON.parse(
      /\$stored_preimages\$([\s\S]*?)\$stored_preimages\$/u.exec(forward)![1],
    ) as typeof catalog;
    expect(preimages).toHaveLength(4);
    for (const row of preimages)
      expect(row.sha256).toBe(hash(source(row.signature.split("(")[0])));
    expect(nextCatalog).toHaveLength(22);
    for (const row of catalog) {
      const next = nextCatalog.find((x) => x.signature === row.signature);
      const name = row.signature.split("(")[0];
      expect(next).toBeDefined();
      expect(next!.sha256).toBe(
        name === "public.read_legacy_scoring_input" ||
          name === "public.finish_legacy_scoring_input" ||
          name === "public.read_legacy_scoring_context"
          ? hash(source(name, forward))
          : row.sha256,
      );
    }
    expect(nextCatalog.at(-1)).toEqual({
      signature:
        "private.legacy_scoring_stored_source(private.analysis_scoring_inputs)",
      sha256: hash(guard),
      definer: false,
      volatility: "v",
      resultType: "void",
      acl: "private",
    });
    expect(forward).toContain("STORED_SCORING_PREIMAGE_DRIFT");
    expect(forward).toContain("STORED_SCORING_ALREADY_ACTIVATED");
    expect(forward).toContain("STORED_SCORING_POSTIMAGE_DRIFT");
    expect(forward).toContain("STORED_SCORING_CLOSURE_DRIFT");
    expect(nextChecker.split("begin\n")[1]).toBe(checker.split("begin\n")[1]);
  });

  it("keeps every data call denied and the full account exporter byte-identical", () => {
    expect(forward).not.toContain("grant execute");
    expect(forward).toContain(
      "revoke all on function private.legacy_scoring_stored_source(private.analysis_scoring_inputs) from public,anon,authenticated,service_role",
    );
    expect(forward).not.toContain(
      "create or replace function public.export_legacy_scoring_inputs",
    );
    expect(currentProfile.exportSha256).toBe(profile.exportSha256);
    expect(currentProfile.metadataSha256).toBe(profile.metadataSha256);
    expect(exporter).not.toMatch(
      /status='active'|legacy_scoring_stored_source/iu,
    );
  });

  it("preserves three honest deferred native oracles without a fake-store reproduction claim", () => {
    const verifier = readFileSync(
      new URL(
        "../../scripts/verify-stored-scoring-source-access.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(verifier).toContain("UNPARSED/UNEXECUTED");
    expect(verifier).toContain("current_user=function_owner");
    expect(verifier).toContain("active_original_historical_not_rebound");
    expect(verifier).toContain("active_original_exact_replay_preserved");
    expect(verifier).toContain("real_tombstone_before_cascade");
    for (const label of [
      "tombstoned_saved_context_denied",
      "tombstoned_finish_replay_denied",
      "tombstoned_committed_worker_denied",
      "complete_retained_owned_export_not_filtered",
      "snapshot_and_result_unchanged",
    ])
      expect(verifier).toContain(label);
    expect(verifier).toContain("export_after=export_before");
    expect(verifier).not.toContain("grant execute");
    expect(verifier).toContain("set constraints all immediate;\nrollback;");
  });
});

it("renews the disposition-era terminal scoring checker while preserving every frozen stored-source assertion", () => {
  const text = readFileSync(
    new URL(
      "../../supabase/migrations/20261115131621_owned_ai_disposition_clocks.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const rows = JSON.parse(text.split("$disposition_patches$")[1]) as Array<{
    signature: string;
    before: string;
    after: string;
    old: string;
    new: string;
  }>;
  const p = rows.find((p) => p.signature === "private.legacy_scoring_ready()")!;
  expect(p.old).toBe(nextChecker);
  expect(hash(p.old)).toBe(currentProfile.checkerSha256);
  expect(p.before).toBe(currentProfile.checkerSha256);
  expect(hash(p.new)).toBe(terminalProfile.checkerSha256);
  expect(p.after).toBe(terminalProfile.checkerSha256);
  expect({
    ...currentProfile,
    checkerSha256: terminalProfile.checkerSha256,
  }).toEqual(terminalProfile);
});
