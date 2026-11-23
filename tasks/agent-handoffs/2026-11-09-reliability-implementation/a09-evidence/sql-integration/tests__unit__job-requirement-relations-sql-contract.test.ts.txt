import { describe, expect, it } from "vitest";
import {
  readJobRequirementRelationsSource,
  verifyJobRequirementRelationsSource,
} from "../../scripts/verify-job-requirement-relations-source";
import {
  JobRequirementRelationsSchema,
  jobRelationSemanticSha256,
} from "../../app/lib/server/job-requirement-admission";

const source = readJobRequirementRelationsSource();

describe("A09 SQL source contract (no SQL parsing or execution)", () => {
  it("validates the independent operator fixture with the frozen TypeScript admission", () => {
    const literal = source.operator.match(/\$body\$(.*?)\$body\$/su)?.[1];
    expect(literal).toBeDefined();
    const fixture = JobRequirementRelationsSchema.parse(JSON.parse(literal!));
    expect(fixture.relations.clauses[0].skillExpression.kind).toBe("any_of");
    expect(fixture.relations.clauses[1].duration.kind).toBe("at_least");
    expect(jobRelationSemanticSha256(fixture)).toBe(
      "bbf3f1a67bb415881726624bdad8941b5b6a4fb9a2476fc60ea6b25851317c1e",
    );
  });
  it("binds the frozen structure/profile and the complete guarded transaction", () => {
    const result = verifyJobRequirementRelationsSource(source);
    expect(result.evidenceTier).toBe("pure_source_contract_only");
    expect(result.nativeSql).toBe("UNPARSED_UNAPPLIED_UNEXECUTED");
    expect(result.checks).toContain("local-call-completeness");
    expect(result.checks).toContain("exact-prior-before-fresh-cas");
    expect(result.checks).toContain("operator-mutating-rollback-only");
  });

  const mutations = [
    [
      "alias concept forged",
      "concept:='local-software:javascript'",
      "concept:='local-software:java'",
    ],
    [
      "alias literal flattened",
      "literal_value in ('postgresql','postgres')",
      "literal_value in ('postgresql','sql')",
    ],
    [
      "supplement data changed",
      '"dataSha256":"784c211586a61233de56dcb1bd821a958e519f466370efa50f0b4ab4929f8937"',
      '"dataSha256":"forged"',
    ],
    [
      "schema drift",
      '"scoringEligible":{"type":"boolean","const":false}',
      '"scoringEligible":{"type":"boolean","const":true}',
    ],
    ["Unicode profile drift", '"unicode":"17.0"', '"unicode":"16.0"'],
    [
      "admission codec drift",
      '"semanticCodecVersion":"jd-relation-command/1.0.0"',
      '"semanticCodecVersion":"jd-relation-command/2.0.0"',
    ],
    [
      "legacy validator replacement",
      "create function private.job_requirement_stored_shape_valid(",
      "create or replace function private.job_requirement_shape_valid(",
    ],
    [
      "malformed declaration regression",
      'text_value text collate "C";',
      'text collate "C"_value text collate "C";',
    ],
    [
      "missing Unicode helper",
      "create function private.jd_relation_ln_ranges(",
      "create function private.missing_ln_ranges(",
    ],
    ["permissive discriminator", "else false end\n$$;", "else true end\n$$;"],
    [
      "legacy branch removed",
      "when 'requirements/1.0.0' then private.job_requirement_shape_valid(p_body)",
      "when 'requirements/1.0.0' then true",
    ],
    [
      "v2 validation bypassed",
      "when 'requirements/2.0.0' then private.job_requirement_relations_valid(p_body)",
      "when 'requirements/2.0.0' then true",
    ],
    [
      "check validation removed",
      "validate constraint job_requirement_versions_stored_content_check",
      "validate constraint other_check",
    ],
    [
      "downgrade trigger removed",
      "before insert on public.job_requirement_versions",
      "after insert on public.job_requirement_versions",
    ],
    [
      "parent downgrade discriminator changed",
      "parent.content->>'schemaVersion'='requirements/2.0.0'",
      "parent.content->>'schemaVersion'='requirements/1.0.0'",
    ],
    [
      "semantic reconstruction skipped",
      "expected:=private.jd_relation_expected_body(p_body);",
      "expected:=p_body;",
    ],
    [
      "source hash skipped",
      "convert_to(p_body->>'sourceText','UTF8')",
      "convert_to('','UTF8')",
    ],
    [
      "owner mutex removed",
      "perform private.lock_candidate_owners(array[p_user_id]);",
      "perform 1;",
    ],
    [
      "privacy barrier removed",
      "if not private.try_candidate_privacy_write(p_user_id) then",
      "if false then",
    ],
    [
      "active resume gate removed",
      "r.status='active' for share of v,r",
      "true for share of v,r",
    ],
    [
      "membership gate removed",
      "from public.memberships where user_id=p_user_id and organization_id=a.organization_id",
      "from public.memberships where true",
    ],
    [
      "command namespace removed",
      "'operation','save_job_requirement_relations'",
      "'operation','save_job_requirements'",
    ],
    [
      "expected parent binding removed",
      "p_body->'parentVersionId' is distinct from coalesce(to_jsonb(p_expected_version),'null'::jsonb)",
      "false",
    ],
    [
      "receipt equality removed",
      "prior.command is distinct from command",
      "false",
    ],
    [
      "replay now falls through",
      "'versionId',prior.id,'revision',prior.revision,'idempotent',true",
      "'versionId',prior.id,'revision',prior.revision,'idempotent',false",
    ],
    [
      "fresh CAS removed",
      "head.id is distinct from p_expected_version",
      "false",
    ],
    [
      "source equality removed",
      'p_body->>\'sourceText\' collate "C" is distinct from job.description collate "C"',
      "false",
    ],
    [
      "item insert removed",
      "insert into public.job_requirements(version_id",
      "insert into public.other_items(version_id",
    ],
    [
      "audit insert removed",
      "insert into public.audit_events(organization_id",
      "insert into public.other_events(organization_id",
    ],
    [
      "authenticated execution granted",
      "to service_role;",
      "to authenticated;",
    ],
    [
      "dangling reference rejection removed",
      "Dangling JD semantic reference",
      "Accepted JD semantic reference",
    ],
    [
      "raw span proof removed",
      "substring(p_source from start_value+1 for end_value-start_value)",
      "''",
    ],
    [
      "duplicate observation rejection removed",
      "Duplicate JD observation identity",
      "Accepted JD observation identity",
    ],
    [
      "importance unknown weakened",
      "conflicting_importance_review",
      "importance_accepted",
    ],
    [
      "OR/AND unknown weakened",
      "mixed_connectors_review",
      "connectors_accepted",
    ],
    [
      "duration unknown weakened",
      "mixed_comparator_review",
      "comparator_accepted",
    ],
    [
      "exclusive bound flattened",
      "jsonb_build_object('inclusive',false)",
      "jsonb_build_object('inclusive',true)",
    ],
    ["token budget raised", "token_count>1000", "token_count>1001"],
    [
      "native locale lowercase substituted",
      "private.jd_relation_lower(p_value)",
      "lower(p_value)",
    ],
  ] as const;
  it.each(mutations)("rejects %s", (_label, before, after) => {
    expect(source.migration).toContain(before);
    const migration = source.migration.replace(before, after);
    expect(() =>
      verifyJobRequirementRelationsSource({ ...source, migration }),
    ).toThrow(/A09_SOURCE_CONTRACT/u);
  });

  it("rejects receipt lookup moved after the fresh-head CAS", () => {
    const begin = source.migration.indexOf(
      "  select * into prior from public.job_requirement_versions",
    );
    const end = source.migration.indexOf(
      "  select * into head from public.job_requirement_versions",
      begin,
    );
    const receipt = source.migration.slice(begin, end);
    expect(receipt).toContain("'idempotent',true");
    const removed =
      source.migration.slice(0, begin) + source.migration.slice(end);
    const insert = removed.indexOf(
      "  -- Normalize only JSON integer representation",
    );
    const migration =
      removed.slice(0, insert) + receipt + removed.slice(insert);
    expect(() =>
      verifyJobRequirementRelationsSource({ ...source, migration }),
    ).toThrow("A09_SOURCE_CONTRACT:exact-prior-before-fresh-cas");
  });

  it.each([
    ["rollback replaced with commit", "\nrollback;", "\ncommit;"],
    [
      "native admission removed",
      "isolated-managed-a09-relations/1",
      "unrestricted",
    ],
    [
      "foreign-owner assertion removed",
      "foreign_owner_denied",
      "omitted_owner_check",
    ],
    ["cleanup assertion removed", "exact_fixture_cleanup", "omitted_cleanup"],
  ])("rejects operator mutation: %s", (_label, before, after) => {
    expect(source.operator).toContain(before);
    expect(() =>
      verifyJobRequirementRelationsSource({
        ...source,
        operator: source.operator.replace(before, after),
      }),
    ).toThrow("A09_SOURCE_CONTRACT:operator-mutating-rollback-only");
  });
});
