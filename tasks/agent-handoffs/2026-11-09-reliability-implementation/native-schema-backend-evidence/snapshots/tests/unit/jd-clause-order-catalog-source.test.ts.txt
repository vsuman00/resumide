import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { JD_CLAUSE_ORDER_READINESS_PROFILE } from "../../app/lib/server/jd-clause-order-readiness-profile";
// Text/JSON source checks only: no SQL parser, database or Native proof.
const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const migration = read(
    "supabase/migrations/20261116192537_jd_clause_order_decisions.sql",
  ),
  verifier = read("scripts/verify-jd-clause-order-catalog.sql");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
type Descriptor = {
  signature: string;
  argNames?: string[];
  language: string;
  strict: boolean;
  definer: boolean;
  volatility: string;
  result: string;
  sha256: string;
  acl: string;
};
function literal<T>(source: string, tag: string): T {
  const delimiter = `$${tag}$`,
    first = source.indexOf(delimiter),
    last = source.indexOf(delimiter, first + delimiter.length);
  expect(first).toBeGreaterThanOrEqual(0);
  expect(last).toBeGreaterThan(first);
  return JSON.parse(source.slice(first + delimiter.length, last)) as T;
}
function actualNewFunctions(): Descriptor[] {
  const declarations = [
    ...migration.matchAll(
      /^create function ([a-z_0-9]+\.[a-z_0-9]+)\(([^\n]*)\) returns ([^\n]+)\nlanguage ([a-z]+) ([^\n]+) as (\$[A-Za-z_0-9]+\$)/gmu,
    ),
  ];
  return declarations.map((m) => {
    const start = m.index! + m[0].length,
      end = migration.indexOf(m[6], start),
      args = m[2] ? m[2].split(",").map((a) => a.trim().split(/\s+/u)) : [];
    expect(end).toBeGreaterThan(start);
    return {
      signature: `${m[1]}(${args.map((a) => a.slice(1).join(" ")).join(",")})`,
      argNames: args.map((a) => a[0]),
      language: m[4],
      strict: /\bstrict\b/u.test(m[5]),
      definer: m[5].includes("security definer"),
      volatility: m[5].includes("immutable")
        ? "i"
        : m[5].includes("stable")
          ? "s"
          : "v",
      result: m[3],
      sha256: sha(migration.slice(start, end)),
      acl:
        m[1] === "public.read_jd_clause_order_readiness"
          ? "metadata"
          : "private",
    };
  });
}
const actual = actualNewFunctions(),
  newFunctions = literal<Descriptor[]>(verifier, "jd_catalog_new_functions"),
  sourceManifest = literal<Descriptor[]>(verifier, "jd_catalog_manifest");
const statements = verifier
  .replace(/--[^\n]*/gu, "")
  .replace(/'(?:''|[^'])*'/gu, "''");
it("remains explicitly draft, unparsed and unexecuted without implying target authorization", () => {
  expect(verifier).toMatch(/^-- DRAFT \/ UNPARSED \/ UNEXECUTED/u);
  expect(verifier).toContain("This file does not authorize a target");
  expect(verifier).toContain(
    "Source/synthetic checks do not establish SQL syntax or Native acceptance",
  );
});
it("uses one bounded atomic read-only repeatable snapshot and no mutable verifier helpers", () => {
  expect(statements).toMatch(
    /begin transaction isolation level repeatable read read only;/u,
  );
  expect(verifier).toContain("set local statement_timeout='15s';");
  expect(verifier).toContain("set local lock_timeout='1s';");
  expect(verifier).toContain(
    "set local idle_in_transaction_session_timeout='20s';",
  );
  expect(verifier).toContain("set local search_path='';");
  expect(statements.trim()).toMatch(/commit;$/u);
  expect(verifier).toContain(
    "current_setting('transaction_read_only') is distinct from 'on'",
  );
  expect(verifier).toContain(
    "current_setting('transaction_isolation') is distinct from 'repeatable read'",
  );
});
it("contains no schema, fixture, privilege, role or data mutation statement", () => {
  expect(statements).not.toMatch(
    /\b(?:create|alter|drop|truncate|insert|update|delete|grant|revoke|copy|call|execute|reset)\b|\bset\s+(?:local\s+)?role\b/iu,
  );
  expect(verifier).not.toContain("pg_temp.");
  expect(verifier).not.toContain("gen_random_uuid(");
  expect(verifier).not.toContain("set_config(");
});
it("derives all twenty-three exact new signatures, body fingerprints and attributes from the frozen source", () => {
  expect(actual).toHaveLength(23);
  expect(newFunctions).toHaveLength(23);
  expect(newFunctions).toEqual(actual);
  expect(new Set(newFunctions.map((f) => f.signature)).size).toBe(23);
  expect(sha(migration)).toBe(
    "29b472876fa69037e4555c461365cc1f50c8d51b5fd20cdfa4913bdcfacbf6d9",
  );
});
it("preserves the complete forty-four expected-source manifest instead of checking only the metadata booleans", () => {
  expect(sourceManifest).toHaveLength(44);
  expect(sourceManifest).toEqual(
    literal<Descriptor[]>(migration, "jd_clause_manifest"),
  );
  expect(new Set(sourceManifest.map((f) => f.signature)).size).toBe(44);
  expect(verifier).toContain("source_manifest||jsonb_build_array(");
  expect(verifier).toContain(
    "where f.value->>'signature'='private.jd_clause_schema_ready()'",
  );
});
it("binds the trusted current five-field profile to the actual checker, writer and metadata bodies", () => {
  const profile = literal<typeof JD_CLAUSE_ORDER_READINESS_PROFILE>(
    verifier,
    "jd_catalog_profile",
  );
  expect(profile).toEqual(JD_CLAUSE_ORDER_READINESS_PROFILE);
  for (const [field, signature] of [
    ["checkerSha256", "private.jd_clause_schema_ready()"],
    [
      "writerSha256",
      "public.apply_jd_clause_order_action(uuid,uuid,jsonb,text)",
    ],
    ["metadataSha256", "public.read_jd_clause_order_readiness()"],
  ] as const)
    expect(profile[field]).toBe(
      actual.find((f) => f.signature === signature)?.sha256,
    );
});
it("checks full catalogue identity, argument names, empty search path and owner on the actual rows", () => {
  for (const fragment of [
    "oid=to_regprocedure(item->>'signature')",
    "routine.prokind<>'f'",
    "routine.proretset",
    "routine.proowner<>expected_owner",
    "routine.prorettype<>to_regtype(item->>'result')",
    "routine.provolatile<>item->>'volatility'",
    "routine.prosecdef is distinct from (item->>'definer')::boolean",
    "routine.proisstrict is distinct from (item->>'strict')::boolean",
    "lanname=item->>'language'",
    "routine.proconfig is distinct from array['search_path=\"\"']",
    "encode(extensions.digest(convert_to(routine.prosrc,'UTF8'),'sha256'),'hex') is distinct from item->>'sha256'",
    "routine.pronargdefaults<>0",
    "routine.proargdefaults is not null",
    "routine.proargmodes is not null",
    "routine.proallargtypes is not null",
    "routine.provariadic<>0",
    "to_jsonb(coalesce(routine.proargnames,array[]::text[])) is distinct from new_item->'argNames'",
  ])
    expect(verifier).toContain(fragment);
  expect(verifier).toContain(
    "where p.oid=to_regprocedure('private.canonical_correction_write_ready()')",
  );
  expect(verifier).toContain(
    "expected_owner in(select oid from pg_catalog.pg_roles where rolname in('anon','authenticated','service_role'))",
  );
});
it("refuses missing or extra new overloads and binds the checker before calling any Native readiness helper", () => {
  expect(verifier).toContain("left(p.proname,10)='jd_clause_'");
  expect(verifier).toContain("JD_CATALOG_NEW_FUNCTION_SET_DRIFT");
  expect(verifier).toContain("jsonb_array_length(new_functions)<>23");
  expect(verifier).toContain("jsonb_array_length(source_manifest)<>44");
  const fingerprint = verifier.indexOf(
      "encode(extensions.digest(convert_to(routine.prosrc",
    ),
    invoke = verifier.indexOf(
      "if private.jd_clause_schema_ready() is not true",
    );
  expect(fingerprint).toBeGreaterThan(0);
  expect(invoke).toBeGreaterThan(fingerprint);
});
it("keeps all new helpers and writer denied while requiring the sole metadata direct grant", () => {
  expect(
    newFunctions.filter((f) => f.acl === "metadata").map((f) => f.signature),
  ).toEqual(["public.read_jd_clause_order_readiness()"]);
  expect(verifier).toContain(
    "case when new_item is not null then new_item->>'acl'='metadata' else item->>'acl' in('optional_service','metadata') end",
  );
  for (const fragment of [
    "aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner)))",
    "a.grantee<>routine.proowner",
    "a.privilege_type<>'EXECUTE' or a.is_grantable",
    "foreach role_name in array array['anon','authenticated','service_role']",
    "has_function_privilege('service_role',routine.oid,'EXECUTE') is distinct from (service_allowed and service_granted)",
    "='metadata' and not service_granted",
    "'schemaReady',true,'writerExecutable',false)",
  ])
    expect(verifier).toContain(fragment);
});
it("reads only catalogue/ACL/JSON metadata and emits no candidate, Auth or storage row data", () => {
  const rowReads = statements.replace(/\bdistinct\s+from\s+/giu, "comparison ");
  const reads = [...rowReads.matchAll(/\b(?:from|join)\s+([a-z_.]+)/giu)].map(
    (m) => m[1].toLowerCase(),
  );
  expect(reads.length).toBeGreaterThan(0);
  const allowed = new Set([
    "pg_catalog.pg_proc",
    "pg_catalog.pg_roles",
    "pg_catalog.pg_namespace",
    "pg_catalog.pg_language",
    "jsonb_array_elements",
    "aclexplode",
  ]);
  for (const relation of reads)
    expect(allowed.has(relation), relation).toBe(true);
  expect(verifier).toContain(
    "'newFunctionCount',23,'sourceManifestCount',44,'readiness',public.read_jd_clause_order_readiness()",
  );
  expect(verifier).not.toMatch(/\b(?:auth|storage)\./u);
});
