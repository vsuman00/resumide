import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  JOB_RELATION_ADMISSION_PROFILE,
  JOB_RELATION_ADMISSION_PROFILE_SHA256,
  JOB_RELATION_JSON_SCHEMA,
  JobRequirementRelationsSchema,
  jobRelationSemanticSha256,
} from "../app/lib/server/job-requirement-admission";
import {
  JOB_RELATION_UNICODE_PROFILE,
  JOB_RELATION_UNICODE_SHA256,
  assertJobRelationUnicodeRuntime,
} from "../app/lib/server/job-relation-unicode";

export const relationMigration =
  "supabase/migrations/20261111010000_job_requirement_relations.sql";
export const relationOperator = "scripts/verify-job-requirement-relations.sql";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const lnSupplementSha256 =
  "f838fbb3dd98b07553d908a788ea17af7a2683d31ca80400cc314474c2ff4889";
let lnRanges: number[][] | undefined;
function pinnedLnRanges() {
  assertJobRelationUnicodeRuntime();
  if (lnRanges) return lnRanges;
  const result: number[][] = [];
  for (let point = 1; point <= 0x10ffff; point++) {
    if (point >= 0xd800 && point <= 0xdfff) continue;
    if (!/^[\p{L}\p{N}]$/u.test(String.fromCodePoint(point))) continue;
    const last = result.at(-1);
    if (last && last[1] + 1 === point) last[1] = point;
    else result.push([point, point]);
  }
  lnRanges = result;
  return result;
}
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw Error("A09_SOURCE_NON_JSON");
  return encoded;
};

// Text and JSON checks only. This deliberately does not parse or execute SQL.
export function verifyJobRequirementRelationsSource(input: {
  migration: string;
  operator: string;
}) {
  const checks: string[] = [];
  const check = (label: string, valid: boolean) => {
    if (!valid) throw Error(`A09_SOURCE_CONTRACT:${label}`);
    checks.push(label);
  };
  const { migration, operator } = input;
  const fixtureLiteral = operator.match(/\$body\$(.*?)\$body\$/su)?.[1];
  check("fixed-operator-fixture", fixtureLiteral !== undefined);
  const fixture = JobRequirementRelationsSchema.parse(
    JSON.parse(fixtureLiteral!),
  );
  const operatorFixtureSemanticSha256 = jobRelationSemanticSha256(fixture);
  check(
    "operator-fixture-and-ln-hash-binding",
    operator.includes(operatorFixtureSemanticSha256) &&
      operator.includes(lnSupplementSha256),
  );
  const body = (name: string) => {
    const start = migration.indexOf(`create function ${name}(`);
    check(`function:${name}`, start >= 0);
    const next = migration.indexOf("\ncreate function ", start + 1);
    return migration.slice(start, next < 0 ? migration.length : next);
  };
  const includes = (source: string, parts: readonly string[]) =>
    parts.every((part) => source.includes(part));
  const ordered = (source: string, parts: readonly string[]) => {
    let cursor = 0;
    return parts.every((part) => {
      const at = source.indexOf(part, cursor);
      cursor = at + part.length;
      return at >= 0;
    });
  };
  for (const [tag, expected] of [
    ["unicode", JOB_RELATION_UNICODE_PROFILE],
    ["schema", JOB_RELATION_JSON_SCHEMA],
    ["profile", JOB_RELATION_ADMISSION_PROFILE],
  ] as const) {
    const literal = migration.match(
      new RegExp(`\\$${tag}\\$(.*?)\\$${tag}\\$`, "su"),
    )?.[1];
    check(`embedded:${tag}`, literal !== undefined);
    check(
      `embedded-exact:${tag}`,
      canonical(JSON.parse(literal!)) === canonical(expected),
    );
  }
  const lnLiteral = migration.match(/\$ln\$(.*?)\$ln\$/su)?.[1];
  check(
    "supplement-fingerprint",
    lnLiteral !== undefined && sha(lnLiteral) === lnSupplementSha256,
  );
  const lnProfile = JSON.parse(lnLiteral!);
  check(
    "supplement-pinned-scalar-oracle",
    lnProfile.baseProfileSha256 === JOB_RELATION_UNICODE_SHA256 &&
      canonical(lnProfile.runtime) ===
        canonical(JOB_RELATION_UNICODE_PROFILE.runtime) &&
      canonical(lnProfile.ranges) === canonical(pinnedLnRanges()) &&
      lnProfile.dataSha256 === sha(JSON.stringify(lnProfile.ranges)),
  );
  check(
    "profile-digests",
    includes(migration, [
      JOB_RELATION_UNICODE_SHA256,
      JOB_RELATION_ADMISSION_PROFILE_SHA256,
      JOB_RELATION_ADMISSION_PROFILE.jsonSchemaSha256,
    ]),
  );
  check(
    "forward-transaction",
    /^-- A09 source candidate\. UNPARSED \/ UNAPPLIED \/ UNEXECUTED\./u.test(
      migration,
    ) &&
      /^begin;$/mu.test(migration) &&
      /\ncommit;\s*$/u.test(migration),
  );
  check(
    "legacy-and-critical-bodies-preserved",
    !/create\s+(?:or\s+replace\s+)?function\s+(?:public\.(?!save_job_requirement_relations\b)|private\.(?:job_requirement_shape_valid|lock_candidate_owners|try_candidate_privacy_write|correction_|canonical_))/iu.test(
      migration,
    ) &&
      !/\b(?:update|delete\s+from|truncate|drop\s+(?:function|policy|trigger|table)|alter\s+(?:function|policy))\s+public\./iu.test(
        migration,
      ),
  );
  check("declaration-regression", !/"C"_/u.test(migration));
  // A missing leaf was present in the interrupted draft. Check every local call
  // has an actual definition, rather than accepting a name in the revoke list.
  const definitions = new Set(
    [...migration.matchAll(/^create function (private\.[a-z_]+)\(/gmu)].map(
      (match) => match[1],
    ),
  );
  const calls = new Set(
    [...migration.matchAll(/\b(private\.jd_relation_[a-z_]+)\(/gu)].map(
      (match) => match[1],
    ),
  );
  check(
    "local-call-completeness",
    [...calls].every((name) => definitions.has(name)),
  );
  const revocations = migration.slice(
    migration.indexOf("\nrevoke all on function\n"),
  );
  check(
    "all-private-functions-revoked",
    [...definitions].every((name) => revocations.includes(`${name}(`)),
  );
  const dual = body("private.job_requirement_stored_shape_valid");
  check(
    "strict-dual-discriminator",
    includes(dual, [
      "case p_body->>'schemaVersion'",
      "when 'requirements/1.0.0' then private.job_requirement_shape_valid(p_body)",
      "when 'requirements/2.0.0' then private.job_requirement_relations_valid(p_body)",
      "else false end",
    ]),
  );
  check(
    "check-swap-order",
    ordered(migration, [
      "add constraint job_requirement_versions_stored_content_check",
      "check(octet_length(content::text)<=1048576 and private.job_requirement_stored_shape_valid(content)) not valid",
      "validate constraint job_requirement_versions_stored_content_check",
      "drop constraint job_requirement_versions_content_check",
    ]),
  );
  const guard = body("private.reject_legacy_job_requirement_downgrade");
  check(
    "independent-no-downgrade",
    includes(guard, [
      "new.content->>'schemaVersion'='requirements/1.0.0'",
      "parent.id=new.parent_version_id",
      "parent.content->>'schemaVersion'='requirements/2.0.0'",
      "raise exception",
      "before insert on public.job_requirement_versions",
      "for each row execute function private.reject_legacy_job_requirement_downgrade()",
    ]),
  );
  const valid = body("private.job_requirement_relations_valid");
  check(
    "complete-validation-before-replay",
    ordered(valid, [
      "getdatabaseencoding()<>'UTF8'",
      "octet_length(p_body::text)>1048576",
      "extensions.jsonb_matches_schema(private.jd_relation_lengthless_schema(schema_value)::json,p_body)",
      "private.jd_relation_lengths_valid(p_body,schema_value)",
      "convert_to(p_body->>'sourceText','UTF8')",
      "expected:=private.jd_relation_expected_body(p_body)",
      "private.jd_relation_project(p_body)",
      "private.jd_relation_project(expected)",
    ]),
  );
  const rpc = body("public.save_job_requirement_relations");
  check(
    "six-argument-service-rpc",
    includes(rpc, [
      "p_user_id uuid,p_analysis_id uuid,p_body jsonb,",
      "p_expected_version uuid,p_idempotency_key uuid,p_request_id text) returns jsonb",
      "language plpgsql security definer set search_path=''",
    ]),
  );
  check(
    "owner-privacy-lock-order",
    ordered(rpc, [
      "private.job_requirement_relations_valid(p_body)",
      "private.lock_candidate_owners(array[p_user_id])",
      "private.try_candidate_privacy_write(p_user_id)",
      "from public.analyses where id=p_analysis_id and owner_id=p_user_id for update",
      "from public.memberships where user_id=p_user_id and organization_id=a.organization_id",
      "v.owner_id=p_user_id and v.organization_id=a.organization_id",
      "r.owner_id=p_user_id and r.organization_id=a.organization_id and r.status='active' for share of v,r",
      "from public.jobs where id=a.job_id and owner_id=p_user_id and organization_id=a.organization_id for share",
      "JD relation scope mismatch",
    ]),
  );
  check(
    "typed-command-namespace",
    includes(rpc, [
      "p_body->'parentVersionId' is distinct from coalesce(to_jsonb(p_expected_version),'null'::jsonb)",
      "'operation','save_job_requirement_relations'",
      "'producerVersion','jd-relations/1.0.0'",
      "'semanticCodecVersion','jd-relation-command/1.0.0'",
      `'admissionProfileSha256','${JOB_RELATION_ADMISSION_PROFILE_SHA256}'`,
      "'semanticSha256',semantic_value,'expectedVersionId',p_expected_version",
    ]),
  );
  check(
    "exact-prior-before-fresh-cas",
    ordered(rpc, [
      "from public.job_requirement_versions where analysis_id=a.id and idempotency_key=p_idempotency_key",
      "prior.owner_id<>p_user_id or prior.organization_id<>a.organization_id or prior.job_id<>job.id or prior.command is distinct from command",
      "'versionId',prior.id,'revision',prior.revision,'idempotent',true",
      "from public.job_requirement_versions where analysis_id=a.id order by revision desc limit 1",
      "head.id is distinct from p_expected_version",
      'p_body->>\'sourceText\' collate "C" is distinct from job.description collate "C"',
      "convert_to(job.description,'UTF8')",
      "insert into public.job_requirement_versions",
      "insert into public.job_requirements",
      "insert into public.audit_events",
      "'idempotent',false",
    ]) && !/\bupdate\s+public\./iu.test(rpc),
  );
  check(
    "service-only-and-private-revocations",
    includes(migration, [
      "from public,anon,authenticated,service_role;",
      "revoke all on function public.save_job_requirement_relations(uuid,uuid,jsonb,uuid,uuid,text) from public,anon,authenticated,service_role;",
      "grant execute on function public.save_job_requirement_relations(uuid,uuid,jsonb,uuid,uuid,text) to service_role;",
    ]) &&
      !/grant\s+(?:all|execute).*to\s+(?:public|anon|authenticated)\b/iu.test(
        migration,
      ),
  );
  const project = body("private.jd_relation_project");
  const clean = body("private.jd_relation_clean");
  check(
    "ordinal-semantic-projection",
    includes(project, [
      "(value->>'type') collate \"C\",(value->>'value') collate \"C\"",
      "Duplicate JD observation identity",
      "Duplicate JD relation identity",
      "p_body-array['id','createdAt','parentVersionId']",
      "jsonb_agg(value-'id')",
    ]) &&
      includes(clean, [
        "reference=any(prior_refs)",
        "Dangling JD semantic reference",
        "'/requirements/'",
        "Duplicate JD credit reference",
        "where key<>'spanId'",
        "substring(p_source from start_value+1 for end_value-start_value)",
        "p_value->>'spanId' is distinct from 'jd-'",
      ]),
  );
  check(
    "bounded-raw-interpretation",
    includes(migration, [
      "before_cased and not after_cased",
      "defaultLowerMappings",
      "regexAsciiFoldMappings",
      "whitespaceRanges",
      "p_boundary='alias' and point in (36,95,46)",
      "p_boundary='alias' and point=46",
      "conflicting_importance_review",
      "mixed_connectors_review",
      "scope_connector_conflict_review",
      "parenthesized_expression_review",
      "unsupported_segment_review",
      "negated_duration_review",
      "multiple_durations_review",
      "mixed_comparator_review",
      "inverted_range_review",
      "comparator_unstated_review",
      "duration_prefix_review",
      "jsonb_build_object('inclusive',false)",
      "'literal_clause_only','evaluated',false",
      "token_count>1000",
      "node_count>1024",
      "depth_value>8",
      "jsonb_array_length(observed)>=32",
      "'numericCredit',null",
    ]) &&
      !/\b(?:lower|normalize)\s*\(|\[:(?:alpha|alnum|space):\]/iu.test(
        migration,
      ),
  );
  check(
    "canonical-semantic-codec",
    includes(body("private.jd_relation_canonical_json"), [
      "number_value<>trunc(number_value)",
      "abs(number_value)>9007199254740991",
      "number_value::bigint::text",
      'order by value collate "C"',
      "p_depth>32",
    ]),
  );
  check(
    "registered-alias-policy",
    includes(body("private.jd_relation_alias"), [
      "literal_value in ('javascript','js')",
      "concept:='local-software:javascript'; canonical_value:='JavaScript'",
      "literal_value='javascript' then 'exact' else 'alias'",
      "literal_value in ('postgresql','postgres')",
      "concept:='local-software:postgresql'; canonical_value:='PostgreSQL'",
      "literal_value='postgresql' then 'exact' else 'alias'",
      "'jd-local-aliases/1.0.0:'||concept",
    ]),
  );
  check(
    "every-exclusive-bound-and-token-budget",
    includes(body("private.jd_relation_duration"), [
      "comparator in ('more than','over') then kind:='more_than'; lower_bound:=lower_bound||jsonb_build_object('inclusive',false)",
      "comparator in ('less than','under') then kind:='less_than'; upper_bound:=lower_bound||jsonb_build_object('inclusive',false)",
    ]) &&
      body("private.jd_relation_expected_body").match(/token_count>1000/gu)
        ?.length === 2 &&
      body("private.jd_relation_project").includes("token_count>1000"),
  );
  check(
    "operator-mutating-rollback-only",
    includes(operator, [
      "MUTATING / ROLLBACK-ONLY / UNPARSED / UNEXECUTED",
      "begin isolation level read committed;",
      "set local statement_timeout='20s';",
      "set local lock_timeout='2s';",
      "resumide.a09_test_admission",
      "isolated-managed-a09-relations/1",
      "insert into auth.users",
      "has_function_privilege",
      "foreign_owner_denied",
      "changed_semantics_conflict",
      "historical_replay_preserves_head",
      "stale_parent_conflicts",
      "legacy_child_of_typed_denied",
      "privacy_replay_denied",
      "atomic_version_items_audit",
      "exact_fixture_cleanup",
    ]) &&
      /\nrollback;\s*$/u.test(operator) &&
      !/^commit;/mu.test(operator),
  );
  return {
    evidenceTier: "pure_source_contract_only" as const,
    nativeSql: "UNPARSED_UNAPPLIED_UNEXECUTED" as const,
    migrationSha256: sha(migration),
    operatorSha256: sha(operator),
    operatorFixtureSemanticSha256,
    lnSupplementSha256,
    lnSupplementDataSha256: lnProfile.dataSha256 as string,
    checks,
  };
}

export function readJobRequirementRelationsSource(root = process.cwd()) {
  return {
    migration: readFileSync(resolve(root, relationMigration), "utf8"),
    operator: readFileSync(resolve(root, relationOperator), "utf8"),
  };
}

if (process.argv.includes("--run-source-check")) {
  assertJobRelationUnicodeRuntime();
  process.stdout.write(
    `${JSON.stringify(verifyJobRequirementRelationsSource(readJobRequirementRelationsSource()))}\n`,
  );
}
