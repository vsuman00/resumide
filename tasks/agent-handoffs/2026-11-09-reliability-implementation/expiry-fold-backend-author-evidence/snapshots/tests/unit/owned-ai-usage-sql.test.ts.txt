import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CANONICAL_REWRITE_READINESS_PROFILE as EXPIRY_CURRENT_MANDATORY_BUDGET_ALL_CALLERS_currentRewriteProfile } from "../../app/lib/server/canonical-rewrite-readiness-profile";
// Frozen immediate predecessor imports; every earlier assertion/object remains unchanged.
const MANDATORY_BUDGET_ALL_CALLERS_currentRewriteProfile = Object.freeze({
  schemaVersion: "canonical-rewrite-readiness/1.0.0",
  profileVersion: "canonical-rewrite-readiness-profile/1.0.1",
  checkerSha256:
    "b8f2c321599054fc5a05bdccdd15ebd8b3bd3bbdc8e7cf233c99cc01b205ffed",
  readerSha256:
    "fbe6a2167174a33a8fe9541a781623e595444206d0fe121971b87f1b14089707",
  prepareSha256:
    "3ba48ee775c9ce62aa3df976d2011b6cc202acd16c62dd60abe4e36c9f65aef9",
  claimSha256:
    "08c3eedd3979e2a3287d5ab8dac9da876daa7c18ad5fdd848661c54949f1aa66",
  finishSha256:
    "cb7a256fbacd55d494fb72196308e6c06e8c7faabb40c18a9ea2bba97a3c5828",
  settleSha256:
    "7bf6d0a1fc731d650716c7ce3ccd204d5529f74cc12e69d0c830b1ac4a69ed28",
  usageSha256:
    "e58366ed4afd20b587a6d133fd3ad397c139d327fc060fbc0b040b857069f7ca",
} as const);

// Frozen immediate predecessor profiles; every earlier assertion remains unchanged.
const ALL_CALLERS_currentRewriteProfile = Object.freeze({
  schemaVersion: "canonical-rewrite-readiness/1.0.0",
  profileVersion: "canonical-rewrite-readiness-profile/1.0.1",
  checkerSha256:
    "ef084481faf7a75e5da4dafbabdb8cd9c2aacae542b26c5e90ced4ed25b8ef14",
  readerSha256:
    "fbe6a2167174a33a8fe9541a781623e595444206d0fe121971b87f1b14089707",
  prepareSha256:
    "3ba48ee775c9ce62aa3df976d2011b6cc202acd16c62dd60abe4e36c9f65aef9",
  claimSha256:
    "77a9357fde10413f08d0276bae3c1b747f44e2de10c1ef757d47eb05b21992aa",
  finishSha256:
    "cb7a256fbacd55d494fb72196308e6c06e8c7faabb40c18a9ea2bba97a3c5828",
  settleSha256:
    "7bf6d0a1fc731d650716c7ce3ccd204d5529f74cc12e69d0c830b1ac4a69ed28",
  usageSha256:
    "e58366ed4afd20b587a6d133fd3ad397c139d327fc060fbc0b040b857069f7ca",
} as const);

// Exact frozen compatibility profile bytes; current successor is checked below.
const currentRewriteProfile = Object.freeze({
  schemaVersion: "canonical-rewrite-readiness/1.0.0",
  profileVersion: "canonical-rewrite-readiness-profile/1.0.1",
  checkerSha256:
    "f396a7e3c1d66801ebeae03b371b0ef5ef5eb9d27b7895160d009f4cd091fba7",
  readerSha256:
    "fbe6a2167174a33a8fe9541a781623e595444206d0fe121971b87f1b14089707",
  prepareSha256:
    "3ba48ee775c9ce62aa3df976d2011b6cc202acd16c62dd60abe4e36c9f65aef9",
  claimSha256:
    "d5d3428a1ee680f870b2988e6be4fa2f8344bd4e6785e3d1d065feab65b202f6",
  finishSha256:
    "cb7a256fbacd55d494fb72196308e6c06e8c7faabb40c18a9ea2bba97a3c5828",
  settleSha256:
    "7bf6d0a1fc731d650716c7ce3ccd204d5529f74cc12e69d0c830b1ac4a69ed28",
  usageSha256:
    "e58366ed4afd20b587a6d133fd3ad397c139d327fc060fbc0b040b857069f7ca",
} as const);
const historicalRewriteProfileSource =
  '// Forward compatibility profile; exact source postimages, not installed proof.\n// Canonical run metadata is private; all mutation grants remain denied.\nexport const CANONICAL_REWRITE_READINESS_PROFILE = Object.freeze({\n  schemaVersion: "canonical-rewrite-readiness/1.0.0",\n  profileVersion: "canonical-rewrite-readiness-profile/1.0.1",\n  checkerSha256:\n    "e98f6ec0de0a09ec002a85d97d007cb71a49c261bbcba746d82c688a7281251b",\n  readerSha256:\n    "fbe6a2167174a33a8fe9541a781623e595444206d0fe121971b87f1b14089707",\n  prepareSha256:\n    "3ba48ee775c9ce62aa3df976d2011b6cc202acd16c62dd60abe4e36c9f65aef9",\n  claimSha256:\n    "d5d3428a1ee680f870b2988e6be4fa2f8344bd4e6785e3d1d065feab65b202f6",\n  finishSha256:\n    "cb7a256fbacd55d494fb72196308e6c06e8c7faabb40c18a9ea2bba97a3c5828",\n  settleSha256:\n    "7bf6d0a1fc731d650716c7ce3ccd204d5529f74cc12e69d0c830b1ac4a69ed28",\n  usageSha256:\n    "e58366ed4afd20b587a6d133fd3ad397c139d327fc060fbc0b040b857069f7ca",\n} as const);\n';
// Historical source-profile snapshot; every original assertion remains unchanged.
const profile = Object.freeze({
  schemaVersion: "initial-feedback-readiness/1.0.0",
  profileVersion: "initial-feedback-readiness-profile/1.0.0",
  checkerSha256:
    "7e37b1d085058f95b15bfd5f7e28b8e120875ee2b1eef5ad13aca110ea10ed2f",
  readerSha256:
    "57701a307d3087720642d9b4057eac87b770465e81726c000c5238708bcfc47b",
  prepareSha256:
    "93b7af8445710cd105e2da67eb27f7d9b8d9c52cd7ec924a6ab6f6aa69548f92",
  claimSha256:
    "335cef3a4e4f948b4c3b3c17ea9a3159368cab5df6e5a7a1389bc0f46759766a",
  settleSha256:
    "739919dedaa5080c4bb8f3c556a9f9b1528fb88747edef9764588bd9038d4148",
  finishSha256:
    "966cdb270ca5a4c1ab8fe6a6dd9097b5d46ebb2b2218f8047b794646cca315a8",
  usageSha256:
    "b242c0e264b0dfa5307f742a77e7a3cc0818bc9c18c88b946d9b27ee0a25889f",
  exportSha256:
    "eefd5842be1eb38fe1e0f17ea148f1708eae634c2a8fe42ab94467c9839fe0cd",
  metadataSha256:
    "2bafa1e30a02308604ad0114ab114189aef6e8323379e443ab7a96a64b2196d6",
});
const preExpiryRead = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const sql = read("supabase/migrations/20261115082125_owned_ai_usage.sql");
const hash = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");
const body = (name: string) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const m = new RegExp(
    `create function ${escaped}\\([\\s\\S]*?\\) returns [^\\n]+\\nlanguage[^\\n]+ as (\\$[a-z_]+\\$)([\\s\\S]*?)\\1;`,
    "u",
  ).exec(sql);
  if (!m) throw Error(`Missing source body ${name}`);
  return m[2];
};
const usage = body("public.read_initial_feedback_usage"),
  checker = body("private.initial_feedback_ready"),
  metadata = body("public.read_initial_feedback_readiness");
const manifest = JSON.parse(
  checker.split("$shared_usage_catalog$")[1],
) as Array<{ signature: string; sha256: string }>;
// Text/source identity checks only. No SQL parser, database, role or concurrency proof.
describe("shared owned usage native source (unparsed/unexecuted)", () => {
  it("pins the real local bodies and composed actual publication interfaces without a cycle", () => {
    expect(hash(usage)).toBe(profile.usageSha256);
    expect(hash(checker)).toBe(profile.checkerSha256);
    expect(hash(metadata)).toBe(profile.metadataSha256);
    expect(manifest).toHaveLength(13);
    expect(
      manifest.some((x) => x.signature === "private.initial_feedback_ready()"),
    ).toBe(false);
    for (const name of [
      "private.owned_ai_usage_owner",
      "public.read_initial_feedback_usage",
      "public.read_initial_feedback_readiness",
    ])
      expect(
        manifest.find((x) => x.signature.split("(")[0] === name)?.sha256,
      ).toBe(hash(body(name)));
    for (const [key, signature] of [
      ["readerSha256", "public.read_initial_feedback(uuid,uuid)"],
      [
        "finishSha256",
        "public.finish_initial_feedback(uuid,jsonb,uuid,uuid,text,jsonb,text,text)",
      ],
      ["exportSha256", "public.export_initial_feedback_records(uuid)"],
      [
        "prepareSha256",
        "public.prepare_initial_feedback(uuid,jsonb,jsonb,uuid)",
      ],
      [
        "settleSha256",
        "public.settle_initial_feedback_attempt(uuid,uuid,text,jsonb,text)",
      ],
    ] as const)
      expect(profile[key]).toBe(
        manifest.find((x) => x.signature === signature)?.sha256,
      );
    expect(checker).toContain(
      "private.initial_feedback_publication_ready() is not true or private.canonical_rewrite_ready() is not true",
    );
  });
  it("admits owned current source/privacy/membership and optional job without a numeric score guard", () => {
    const owner = body("private.owned_ai_usage_owner");
    for (const text of [
      "where id=p_analysis_id and owner_id=p_user_id for share skip locked",
      "private.try_candidate_privacy_write(a.owner_id)",
      "role in ('owner','admin','member') for share skip locked",
      "status='active' for share skip locked",
      "if a.job_id is not null then",
    ])
      expect(owner).toContain(text);
    expect(owner).not.toMatch(
      /document_evidence|legacy_scoring_access|p_organization_id/gu,
    );
  });
  it("validates links across all months before the legacy creation-month filter", () => {
    const prefix = usage.slice(
      usage.indexOf("with canonical_scope"),
      usage.indexOf("), legacy as"),
    );
    expect(prefix).not.toMatch(/period_start|period_end/gu);
    expect(prefix).toContain("from private.canonical_rewrite_operations");
    expect(prefix).toContain("from private.initial_feedback_attempts");
    expect(prefix).toContain("from private.initial_feedback_publications");
    expect(sql).not.toContain("canonical_rewrite_attempts");
    expect(usage).toContain("r.created_at>=period_start");
    expect(usage.match(/x.claimed_at>=period_start/gu)).toHaveLength(2);
    expect(usage).not.toContain("get_organization_ai_tokens_used");
  });
  it("excludes exact run IDs only and refuses ambiguous or inconsistent authoritative links", () => {
    for (const text of [
      "join public.analysis_ai_runs r on r.id=x.run_id",
      "t.attempt_id=p.attempt_id and t.operation_id=o.operation_id",
      "p.binding_sha256=o.binding_sha256",
      "(r.owner_id,r.organization_id,r.analysis_id)=(p.owner_id,p.organization_id,p.analysis_id)",
      "r.input_tokens::text=t.usage->>'inputTokens'",
      "r.input_hash=o.binding_sha256",
      "from links group by run_id having count(*)>1",
      "not exists(select 1 from links l where l.run_id=r.id)",
    ])
      expect(usage).toContain(text);
    expect(usage).toContain(
      "if values_valid is not true or links_valid is not true",
    );
    expect(usage).not.toMatch(
      /not exists\(select 1 from links[^)]+analysis_id/gu,
    );
  });
  it("keeps all claimed known/unknown accounting regardless publication outcome", () => {
    const stats = usage.slice(
      usage.indexOf("), canonical as"),
      usage.indexOf(") select legacy.tokens"),
    );
    expect(
      stats.match(/count\(\*\) filter\(where x.usage is null\)/gu),
    ).toHaveLength(2);
    expect(stats.match(/private.ifo_usage_valid\(x.usage\)/gu)).toHaveLength(4);
    expect(stats).not.toMatch(/state|published|saved|rejected|publication/gu);
    expect(usage).toContain("legacy_tokens+canonical_tokens+feedback_tokens");
    expect(usage).toContain("greatest(length(legacy_tokens::text)");
    expect(usage).toContain(
      "date_trunc('month',clock_timestamp() at time zone 'UTC')",
    );
  });
  it("returns exact thirteen usage fields and nineteen real readiness fields", () => {
    const keys = (s: string) =>
      [...s.matchAll(/(?:\(|,)\s*'([A-Za-z][A-Za-z0-9]*)'\s*,/gu)].map(
        (m) => m[1],
      );
    const result = usage.slice(usage.indexOf("return jsonb_build_object"));
    expect(keys(result)).toEqual([
      "schemaVersion",
      "profileVersion",
      "usageSha256",
      "ownerId",
      "organizationId",
      "analysisId",
      "periodStart",
      "periodEnd",
      "legacyUnlinkedTokens",
      "canonicalTokens",
      "initialFeedbackTokens",
      "totalTokens",
      "unknownClaims",
    ]);
    expect(keys(metadata)).toHaveLength(19);
    expect(Object.keys(profile)).toHaveLength(11);
    expect(result).toContain(
      "pg_catalog.pg_proc where oid=to_regprocedure('public.read_initial_feedback_usage(uuid,uuid)')",
    );
    expect(sql.match(/grant execute on function/gu)).toHaveLength(1);
    expect(sql).toContain(
      "grant execute on function public.read_initial_feedback_readiness() to service_role",
    );
    expect(sql).toContain(
      "public.read_initial_feedback_usage(uuid,uuid) from public,anon,authenticated,service_role",
    );
    expect(checker).toContain("CHECK/default");
  });
  it("preserves old counters/source profiles while the actual caller always uses the shared helper", () => {
    for (const [path, sha] of [
      [
        "app/lib/server/canonical-rewrite-usage.ts",
        "a51cfb8cd780f04cb254f43691f53f8110efa6a656ea85a2069e5ceaac2a4c33",
      ],
      [
        "app/lib/server/canonical-rewrite-readiness-profile.ts",
        "d80052f60c25dbb45210c8ddefaa11fde67a1f817ac43e398a6c89523a93a151",
      ],
      [
        "supabase/migrations/20261114192207_canonical_rewrite_compatibility.sql",
        "00833163ac60a1d80909b6b73533525e7dbc7697f62388dcc17d01d74b62c248",
      ],
    ])
      expect(
        hash(
          path === "app/lib/server/canonical-rewrite-readiness-profile.ts"
            ? historicalRewriteProfileSource
            : read(path),
        ),
      ).toBe(sha);
    const service = read("app/lib/server/canonical-rewrite-service.ts");
    expect(service).toContain("await readOwnedAiUsage(");
    expect(service).not.toContain("readCanonicalRewriteUsage");
    expect(service).not.toContain("if (!config.AI_BUDGET_ENABLED)");
    expect(service).not.toContain("Number(tokensUsed");
  });
  it("keeps actual Native verification deferred and refuses empty/time-backdated substitutes", () => {
    const draft = read("scripts/verify-owned-ai-usage.sql");
    for (const text of [
      "UNPARSED/UNEXECUTED",
      "current_user=function_owner",
      "actual CHECK/default/role/catalog reconciliation",
      "exact_preregistered_partition_no_double_count",
      "all_components_and_unknown_present_not_empty_substitute",
      "real_linked_and_cross_month_fixture_requirements",
      "prior_month_settlement_not_current_month_credit",
      "malformed_authoritative_link_refused_whole_reply",
      "read_and_technical_mirror_do_not_debit_budget",
      "set constraints all immediate;\nrollback;",
    ])
      expect(draft.replace(/\n-- /gu, " ")).toContain(text);
    expect(draft).toContain("no backdating/trigger disablement");
    expect(draft).not.toContain("grant execute");
  });
});

const registeredRewriteProfileFileSource =
  '// Forward compatibility profile; exact source postimages, not installed proof.\n// Canonical run metadata is private; all mutation grants remain denied.\nexport const CANONICAL_REWRITE_READINESS_PROFILE = Object.freeze({\n  schemaVersion: "canonical-rewrite-readiness/1.0.0",\n  profileVersion: "canonical-rewrite-readiness-profile/1.0.1",\n  checkerSha256:\n    "f396a7e3c1d66801ebeae03b371b0ef5ef5eb9d27b7895160d009f4cd091fba7",\n  readerSha256:\n    "fbe6a2167174a33a8fe9541a781623e595444206d0fe121971b87f1b14089707",\n  prepareSha256:\n    "3ba48ee775c9ce62aa3df976d2011b6cc202acd16c62dd60abe4e36c9f65aef9",\n  claimSha256:\n    "d5d3428a1ee680f870b2988e6be4fa2f8344bd4e6785e3d1d065feab65b202f6",\n  finishSha256:\n    "cb7a256fbacd55d494fb72196308e6c06e8c7faabb40c18a9ea2bba97a3c5828",\n  settleSha256:\n    "7bf6d0a1fc731d650716c7ce3ccd204d5529f74cc12e69d0c830b1ac4a69ed28",\n  usageSha256:\n    "e58366ed4afd20b587a6d133fd3ad397c139d327fc060fbc0b040b857069f7ca",\n} as const);\n';
const actualCurrentSourceRead = read;
it("adopts the exact disposition-era rewrite checker postimage while preserving the historical profile-file golden", () => {
  // This historical stage retains its exact prior file view; the current whole-file successor is checked below.
  const read = (name: string) =>
    name === "app/lib/server/canonical-rewrite-readiness-profile.ts"
      ? registeredRewriteProfileFileSource
      : actualCurrentSourceRead(name);
  const text = read(
    "supabase/migrations/20261115131621_owned_ai_disposition_clocks.sql",
  );
  const rows = JSON.parse(text.split("$disposition_patches$")[1]) as Array<{
    signature: string;
    before: string;
    after: string;
    old: string;
    new: string;
  }>;
  const p = rows.find(
    (p) => p.signature === "private.canonical_rewrite_ready()",
  )!;
  expect(hash(p.old)).toBe(p.before);
  expect(hash(p.new)).toBe(p.after);
  expect(p.before).toBe(
    "e98f6ec0de0a09ec002a85d97d007cb71a49c261bbcba746d82c688a7281251b",
  );
  expect(p.after).toBe(currentRewriteProfile.checkerSha256);
  expect(historicalRewriteProfileSource.split(p.before)).toHaveLength(2);
  expect(read("app/lib/server/canonical-rewrite-readiness-profile.ts")).toBe(
    historicalRewriteProfileSource.replace(p.before, p.after),
  );
});

it("binds current all-caller profile successors while retaining all prior source goldens", () => {
  const read = (file: string) =>
    file === "app/lib/server/canonical-rewrite-readiness-profile.ts"
      ? '// Forward compatibility profile; exact source postimages, not installed proof.\n// Canonical run metadata is private; all mutation grants remain denied.\nexport const CANONICAL_REWRITE_READINESS_PROFILE = Object.freeze({\n  schemaVersion: "canonical-rewrite-readiness/1.0.0",\n  profileVersion: "canonical-rewrite-readiness-profile/1.0.1",\n  checkerSha256:\n    "ef084481faf7a75e5da4dafbabdb8cd9c2aacae542b26c5e90ced4ed25b8ef14",\n  readerSha256:\n    "fbe6a2167174a33a8fe9541a781623e595444206d0fe121971b87f1b14089707",\n  prepareSha256:\n    "3ba48ee775c9ce62aa3df976d2011b6cc202acd16c62dd60abe4e36c9f65aef9",\n  claimSha256:\n    "77a9357fde10413f08d0276bae3c1b747f44e2de10c1ef757d47eb05b21992aa",\n  finishSha256:\n    "cb7a256fbacd55d494fb72196308e6c06e8c7faabb40c18a9ea2bba97a3c5828",\n  settleSha256:\n    "7bf6d0a1fc731d650716c7ce3ccd204d5529f74cc12e69d0c830b1ac4a69ed28",\n  usageSha256:\n    "e58366ed4afd20b587a6d133fd3ad397c139d327fc060fbc0b040b857069f7ca",\n} as const);\n'
      : readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

  const source = readFileSync(
    new URL(
      "../../supabase/migrations/20261115162257_ai_budget_all_caller_sources.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const rows = JSON.parse(source.split("$callers_patches$")[1]) as Array<{
    before: string;
    after: string;
    old: string;
    new: string;
  }>;
  const sha = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  {
    const p = rows.find(
      (p) => p.before === currentRewriteProfile.checkerSha256,
    )!;
    expect(sha(p.old)).toBe(currentRewriteProfile.checkerSha256);
    expect(p.before).toBe(currentRewriteProfile.checkerSha256);
    expect(sha(p.new)).toBe(ALL_CALLERS_currentRewriteProfile.checkerSha256);
    expect(p.after).toBe(ALL_CALLERS_currentRewriteProfile.checkerSha256);
  }
  {
    const p = rows.find((p) => p.before === currentRewriteProfile.claimSha256)!;
    expect(sha(p.old)).toBe(currentRewriteProfile.claimSha256);
    expect(p.before).toBe(currentRewriteProfile.claimSha256);
    expect(sha(p.new)).toBe(ALL_CALLERS_currentRewriteProfile.claimSha256);
    expect(p.after).toBe(ALL_CALLERS_currentRewriteProfile.claimSha256);
  }
  expect(read("app/lib/server/canonical-rewrite-readiness-profile.ts")).toBe(
    registeredRewriteProfileFileSource
      .replace(
        currentRewriteProfile.checkerSha256,
        ALL_CALLERS_currentRewriteProfile.checkerSha256,
      )
      .replace(
        currentRewriteProfile.claimSha256,
        ALL_CALLERS_currentRewriteProfile.claimSha256,
      ),
  );
});

it("binds mandatory-budget current profiles while retaining all prior source assertions", () => {
  const terminal = JSON.parse(
    read(
      "supabase/migrations/20261115182650_mandatory_ai_budget_dispatch.sql",
    ).split("$budget_required_patches$")[1],
  ) as Array<{
    signature: string;
    old: string;
    new: string;
    before: string;
    after: string;
  }>;
  expect(terminal).toHaveLength(9);
  for (const p of terminal) {
    expect(createHash("sha256").update(p.old).digest("hex")).toBe(p.before);
    expect(createHash("sha256").update(p.new).digest("hex")).toBe(p.after);
  }
  for (const [key, value] of Object.entries(
    ALL_CALLERS_currentRewriteProfile,
  )) {
    const successor = terminal.find((p) => p.before === value);
    expect(
      (
        MANDATORY_BUDGET_ALL_CALLERS_currentRewriteProfile as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
});

// Historical source assertions read the pre-expiry profile view; live successor exports are tied below.
function read(file: string) {
  let value = preExpiryRead(file);
  if (file.startsWith("app/lib/server/") && file.endsWith("-profile.ts")) {
    const expiry = JSON.parse(
      readFileSync(
        new URL(
          "../../supabase/migrations/20261115190341_owned_ai_expiry_fold.sql",
          import.meta.url,
        ),
        "utf8",
      ).split("$expiry_patches$")[1],
    ) as Array<{ before: string; after: string }>;
    for (const p of [...expiry].reverse())
      value = value.replaceAll(p.after, p.before);
  }
  return value;
}

it("binds atomic-expiry successors while retaining all historical Source assertions", () => {
  const rows = JSON.parse(
    readFileSync(
      new URL(
        "../../supabase/migrations/20261115190341_owned_ai_expiry_fold.sql",
        import.meta.url,
      ),
      "utf8",
    ).split("$expiry_patches$")[1],
  ) as Array<{
    signature: string;
    old: string;
    new: string;
    before: string;
    after: string;
  }>;
  expect(rows).toHaveLength(24);
  for (const p of rows) {
    expect(createHash("sha256").update(p.old).digest("hex")).toBe(p.before);
    expect(createHash("sha256").update(p.new).digest("hex")).toBe(p.after);
  }
  for (const [key, value] of Object.entries(
    MANDATORY_BUDGET_ALL_CALLERS_currentRewriteProfile,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        EXPIRY_CURRENT_MANDATORY_BUDGET_ALL_CALLERS_currentRewriteProfile as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
});
