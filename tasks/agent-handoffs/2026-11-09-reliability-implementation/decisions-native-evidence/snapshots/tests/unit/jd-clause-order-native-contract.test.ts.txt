import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import policy from "../../app/lib/jd-clause-order-decision-policy.json";
import characters from "../../app/lib/jd-clause-order-character-profile.json";
import {
  encodeClauseOrderCommandAtoms,
  hashClauseOrderCommandAtoms,
} from "../../app/lib/server/clause-order-command-codec";

// These are source-contract checks, not SQL parsing, execution, or Native
// transaction/privilege acceptance. The independent framing vectors are synthetic.
const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const migration = read(
  "supabase/migrations/20261116192537_jd_clause_order_decisions.sql",
);
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const fixture = JSON.parse(
  read(
    "tasks/agent-handoffs/2026-11-09-reliability-implementation/decisions-golden-vectors.json",
  ),
) as {
  vectors: { atoms: (string | null)[]; framedHex: string; sha256: string }[];
  commandVectors: {
    command: unknown;
    atoms: (string | null)[];
    framedHex: string;
    sha256: string;
  }[];
};
function body(name: string) {
  const declaration = `create function ${name}(`;
  const index = migration.indexOf(declaration);
  expect(index, `missing independent ${name} authority`).toBeGreaterThanOrEqual(
    0,
  );
  const tag = migration.slice(index).match(/\bas (\$[A-Za-z_0-9]+\$)/u)?.[1];
  expect(tag).toBeDefined();
  if (!tag) throw Error("Missing source body delimiter");
  const start = migration.indexOf(tag, index) + tag.length;
  const end = migration.indexOf(tag, start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}
function ordered(text: string, parts: string[]) {
  let index = -1;
  for (const part of parts) {
    const next = text.indexOf(part, index + 1);
    expect(next, `missing or reordered ${part}`).toBeGreaterThan(index);
    index = next;
  }
}

describe("JD clause-order Native source contract (not executed SQL)", () => {
  it("is additive and defaults the independent authority to denied", () => {
    expect(migration).toMatch(/^-- Additive CR-A14 v2 authority/u);
    expect(migration).not.toMatch(
      /create or replace function|alter function|drop function/iu,
    );
    expect(migration).toContain(
      "create function public.apply_jd_clause_order_action(p_user_id uuid,p_analysis_id uuid,p_command jsonb,p_request_id text)",
    );
    expect(migration).toMatch(
      /revoke all on function public\.apply_jd_clause_order_action\(uuid,uuid,jsonb,text\) from public,anon,authenticated,service_role;/u,
    );
    expect(migration).not.toMatch(
      /grant execute on function public\.apply_jd_clause_order_action/iu,
    );
    expect(migration.trimEnd()).toMatch(/commit;$/u);
  });
  it("embeds the exact current policy and pinned scalar data rather than locale classes", () => {
    const policyBody = body("private.jd_clause_policy");
    const embeddedPolicy = JSON.parse(policyBody.split("$jd_policy_data$")[1]);
    expect(embeddedPolicy).toEqual(policy);
    expect(hash(JSON.stringify(policy.body))).toBe(policy.sha256);
    const dataBody = body("private.jd_clause_characters");
    expect(JSON.parse(dataBody.split("$jd_character_data$")[1])).toEqual(
      characters.data,
    );
    expect(hash(JSON.stringify(characters.data))).toBe(characters.dataSha256);
    expect(hash(read("app/lib/jd-clause-order-character-profile.json"))).toBe(
      policy.body.characterProfile.sha256,
    );
    expect(body("private.jd_clause_field")).toContain("letterOrMarkRanges");
    expect(body("private.jd_clause_key")).toContain("letterSkeletonMappings");
    expect(migration).not.toMatch(/normalize\(|\[:alpha:\]|\[:space:\]/u);
  });
  it("pins all new implementation bodies to the exact catalog manifest", () => {
    const manifest = JSON.parse(
      body("private.jd_clause_schema_ready").split("$jd_clause_manifest$")[1],
    ) as { signature: string; sha256: string }[];
    const declarations = [
      ...migration.matchAll(/create function ([a-z_]+\.[a-z_]+)\(/gu),
    ].map((m) => m[1]);
    expect(declarations).toHaveLength(23);
    expect(manifest).toHaveLength(44);
    for (const name of declarations.filter(
      (n) => n !== "private.jd_clause_schema_ready",
    )) {
      const row = manifest.find((m) => m.signature.startsWith(`${name}(`));
      expect(row, name).toBeDefined();
      expect(hash(body(name))).toBe(row?.sha256);
    }
    expect(body("private.jd_clause_skill")).toContain(
      "then coalesce(private.jd_relation_alias(p_value)->>'conceptId'=p_atom->'mapping'->>'conceptId',false)",
    );
  });
  it("retains raw role grammar before whitespace classification and whole-stream ambiguity refusal", () => {
    const role = body("private.jd_clause_role");
    ordered(role, [
      "raw_pattern",
      "private.jd_relation_test(p_raw",
      "private.jd_clause_field",
    ]);
    const scope = body("private.jd_clause_scope");
    expect(scope).toContain(
      "private.jd_clause_role(trimmed,meta,p_data,p_scope)",
    );
    expect(scope).toContain("previous_terminal=''");
    expect(scope).toContain("matching<>1");
    expect(scope).toContain("nonblank>512");
    expect(scope).toContain(
      "private.jd_clause_parse(trimmed,true,p_data,p_scope)",
    );
  });
  it("strictly validates v2 fields, canonical UUID text and original immutable pair bindings", () => {
    const validate = body("private.jd_clause_validate");
    expect(validate).toContain("private.evidence_keys(p_command,array[");
    expect(validate).toContain("p_command->'decisionPolicy'");
    expect(validate).toContain("p_command->'binding'");
    expect(validate).toContain("p_command->'sourceClauses'");
    expect(body("private.jd_clause_uuid")).toContain("'^[a-f0-9-]+$'");
    expect(validate).toContain(
      "select c.value from jsonb_array_elements(p_command->'sourceCitations') c(value)",
    );
    expect(validate).not.toContain(
      "for item in select value from jsonb_array_elements(p_command->'sourceCitations')",
    );
  });
  it("keeps the independently specified 53+8N codec order and exact UTF8 framing", () => {
    const atoms = body("private.jd_clause_atoms");
    ordered(atoms, [
      "p_command->>'schemaVersion'",
      "p_command->>'operation'",
      "p_command->>'idempotencyKey'",
      "p_command->>'acknowledgement'",
      "p_command->>'draftId'",
      "s->>'ownerId'",
      "b->'canonical'->>'versionId'",
      "b->'requirements'->>'versionId'",
      "b->'heads'->>'canonicalHeadId'",
      "b->>'profilesSha256'",
      "p_command->'policies'->>'clauseOrderVersion'",
      "p_command->'decisionPolicy'->>'version'",
      "t->>'factId'",
      "p_command->>'jdClauseId'",
      "f->>'kind'",
      "'1','0','2'",
      "p_command->'sourceClauses'",
      "p_command->>'afterSha256'",
      "p_command->'sourceCitations'",
    ]);
    const fingerprint = body("private.jd_clause_fingerprint");
    expect(fingerprint).toContain("E'A11OP2\\n'");
    expect(fingerprint).toContain("octet_length(convert_to(atom,'UTF8'))");
    expect(fingerprint).toContain("'N;'");
    expect(fingerprint).toContain("cardinality(p_atoms)>256");
    expect(fingerprint).toContain(
      "octet_length(encoded)+octet_length(part)>16384",
    );
    const vectors = [...fixture.vectors, fixture.commandVectors[0]];
    for (const vector of vectors) {
      expect(encodeClauseOrderCommandAtoms(vector.atoms).toString("hex")).toBe(
        vector.framedHex,
      );
      expect(hashClauseOrderCommandAtoms(vector.atoms)).toBe(vector.sha256);
    }
    expect(fixture.commandVectors[0].atoms).toHaveLength(61);
    expect(
      Buffer.from(fixture.commandVectors[0].framedHex, "hex"),
    ).toHaveLength(1947);
    expect(fixture.commandVectors[0].sha256).toBe(
      "1874dac7cdf2dd07ee238002a90b3c78ec723d69e6727452a995a91d9f9e134b",
    );
  });
  it("reconstructs complete selected streams, actual two clauses and exact owned citation bytes", () => {
    const stream = body("private.jd_clause_stream");
    expect(stream).toContain("ocrSource");
    expect(stream).toContain("nativeSource");
    expect(stream).toContain("100000");
    const reconstruct = body("private.jd_clause_reconstruct");
    ordered(reconstruct, [
      "private.jd_clause_stream(p_context)",
      "private.jd_clause_parse(p_fact->>'value',false",
      "private.jd_clause_scope",
      "actual_clauses is distinct from",
      "skillExpression",
      "actual_cites is distinct from",
      "replacement:=",
      "p_command->>'afterSha256'",
    ]);
    expect(reconstruct).toContain("convert_to(p_fact->>'value','UTF8')");
    expect(reconstruct).toContain('prefix collate "C"');
    expect(reconstruct).toContain('suffix collate "C"');
  });
  it("validates a stored receipt completely before returning an exact replay", () => {
    const receipt = body("private.jd_clause_receipt");
    expect(receipt).toContain("'draftId'");
    expect(receipt).toContain("'false'::jsonb");
    expect(receipt).toContain(
      "private.jd_clause_fingerprint(private.jd_clause_atoms(p_command))",
    );
    expect(receipt).toContain(
      "expected_revision:=(p_command->'binding'->'canonical'->>'revision')::integer+2",
    );
    expect(receipt).toContain("if p_result is not null then return false");
    const writer = body("public.apply_jd_clause_order_action");
    ordered(writer, [
      "private.lock_candidate_owners",
      "private.try_candidate_privacy_write",
      "root.status",
      "public.memberships",
      "public.authoring_events",
      "private.jd_clause_receipt",
      "'idempotent',true",
      "public.canonical_resume_heads",
    ]);
  });
  it("requires fresh locked pair and Native source reconstruction before either canonical child", () => {
    const writer = body("public.apply_jd_clause_order_action");
    ordered(writer, [
      "public.canonical_resume_heads",
      "public.job_requirement_versions",
      "native_binding:=",
      "public.read_requirement_relationship_context",
      "private.correction_location",
      "private.jd_clause_reconstruct",
      "private.typed_authoring_child",
      "public.save_canonical_version",
    ]);
    expect(writer).toContain("for update");
    expect(writer).toContain("for share");
    expect(writer).toContain("factIds");
    expect(writer.match(/public\.save_canonical_version\(/gu)).toHaveLength(2);
    expect(writer).toContain("canonical.revision+1");
    expect(writer).toContain("canonical.revision+2");
    expect(writer).toContain("'idempotent' is distinct from 'false'::jsonb");
    ordered(writer, [
      "if p_command->>'operation'='accept'",
      "public.save_canonical_version",
      "insert into public.authoring_events",
      "insert into public.audit_events",
      "return result_value",
      "exception",
    ]);
  });
  it("keeps readiness as actual catalog integrity and a separate effective capability", () => {
    const metadata = body("public.read_jd_clause_order_readiness");
    for (const key of [
      "schemaVersion",
      "profileVersion",
      "checkerSha256",
      "writerSha256",
      "metadataSha256",
      "schemaReady",
      "writerExecutable",
    ])
      expect(metadata).toContain(`'${key}'`);
    expect(metadata).toContain("jd-clause-order-readiness/2.0.0");
    expect(metadata).toContain("jd-clause-order-native/2.0.0");
    expect(metadata).toContain("prosrc");
    expect(metadata).toContain("has_function_privilege('service_role'");
    const checker = body("private.jd_clause_schema_ready");
    expect(checker).toContain("private.typed_authoring_write_ready()");
    expect(checker).toContain("routine.prosrc");
    expect(checker).toContain("routine.proowner");
    expect(checker).toContain("routine.proconfig");
    expect(checker).toContain("aclexplode");
    expect(checker).toContain("return true");
    expect(checker).toContain("exception when others then return false");
  });
});
