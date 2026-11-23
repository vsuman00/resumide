import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INITIAL_FEEDBACK_PLAN_PROFILE as profile } from "../../app/lib/server/initial-feedback-plan-profile";

// Source-byte/protocol checks only; no SQL parser, PostgreSQL, or proof of behavior.
const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20261115054612_initial_feedback_plan.sql",
    import.meta.url,
  ),
  "utf8",
);
const hash = (s: string) =>
  createHash("sha256").update(s, "utf8").digest("hex");
const body = (name: string) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const m = new RegExp(
    `create function ${escaped}\\([\\s\\S]*?\\) returns [^\\n]+\\nlanguage plpgsql (?:stable|volatile)(?: security definer)? set search_path='' as (\\$ifp_[0-9]+\\$)([\\s\\S]*?)\\1;`,
    "u",
  ).exec(sql);
  if (!m) throw new Error(`Missing pure source routine: ${name}`);
  return m[2];
};
const renderer = body("private.render_initial_feedback_plan");
const document = body("private.ifp_document");
const expr = body("private.ifp_expr");
const checker = body("private.initial_feedback_plan_ready");
const manifest = JSON.parse(
  /\$ifp_catalog\$([\s\S]*?)\$ifp_catalog\$/u.exec(checker)![1],
) as Array<{ signature: string; sha256: string }>;
const policy = JSON.parse(
  /\$ifp_policy\$([\s\S]*?)\$ifp_policy\$/u.exec(expr)![1],
);

describe("private initial-feedback native source (unparsed/unexecuted)", () => {
  it("pins actual renderer/checker/metadata and every private dependency without a cycle", () => {
    expect(profile.rendererSha256).toBe(hash(renderer));
    expect(profile.checkerSha256).toBe(hash(checker));
    expect(profile.metadataSha256).toBe(
      hash(body("public.read_initial_feedback_plan_readiness")),
    );
    expect(manifest).toHaveLength(29);
    for (const entry of manifest)
      expect(entry.sha256).toBe(hash(body(entry.signature.split("(")[0])));
    expect(
      manifest.some(
        (e) => e.signature === "private.initial_feedback_plan_ready()",
      ),
    ).toBe(false);
  });

  it("uses the actual Node policy identity and exact finite template/operator tables", () => {
    expect(hash(JSON.stringify(policy))).toBe(
      "972b648ccc90b29c0c88fc504ac2746ab1489e17f05cfd2048cb487a2b38cc48",
    );
    expect(profile.policySha256).toBe(hash(JSON.stringify(policy)));
    expect(policy.editorialTemplates).toHaveLength(19);
    expect(policy.measuredTemplates).toHaveLength(5);
    expect(policy.clarificationTemplates).toHaveLength(6);
    expect(policy.operators).toEqual([
      "copy_source",
      "normalize_layout",
      "rewrite_clauses",
      "role_summary",
      "compose_explicit_role_contribution",
      "editorial_fixed",
      "editorial_measured",
      "editorial_object_prefix",
      "clarification_fixed",
      "clarification_question",
    ]);
    expect(expr).toContain("n>=jsonb_array_length(forms)");
    expect(expr).toContain(
      "jsonb_typeof(p_expr->'period') is distinct from 'boolean'",
    );
  });

  it("confers content validation only and grants no data/proof endpoint or private helper", () => {
    expect(sql).toContain(
      "private.render_initial_feedback_plan(p_source text,p_plan jsonb)",
    );
    expect(renderer).toContain(
      "'authority','source_content_only','ownedVersionProof','not_provided'",
    );
    expect(renderer).not.toMatch(
      /bindingSha256|planSha256|ownerId|organizationId|p_supported|p_eligible/u,
    );
    expect(sql).not.toMatch(
      /create table|create or replace|alter table|insert into|update public\.|delete from/iu,
    );
    expect(
      [
        ...sql.matchAll(/grant execute on function ([^;]+) to service_role;/gu),
      ].map((m) => m[1]),
    ).toEqual(["public.read_initial_feedback_plan_readiness()"]);
    expect(checker).toContain("a.grantee<>p.proowner");
    expect(checker).toContain("has_function_privilege('service_role'");
  });

  it("derives code-point slices and legacy UTF16 IDs from the same original source", () => {
    expect(document).toContain("ascii(c)>65535 then 2 else 1");
    expect(document).toContain(
      "source_sha||':'||u16[start_value+1]::text||':'||u16[end_value+1]::text",
    );
    expect(body("private.ifp_span_text")).toContain(
      "substring(p_doc->>'source' from a+1 for z-a)",
    );
    expect(body("private.ifp_span_text")).toContain(
      "private.ifp_sha(t) is distinct from p_ref->>'textSha256'",
    );
    expect(body("private.ifp_quote")).toContain(
      "strpos(substring(p_doc->>'source' from first_pos+1),t)>0",
    );
    expect(body("private.ifp_anchor")).toContain("where value->'ref'=p_ref");
  });

  it("uses explicit Unicode normalization and refuses unknown folding domains", () => {
    expect(body("private.ifp_ws")).toContain("chr(65279)");
    expect(body("private.ifp_ws")).toContain("chr(8232)||chr(8233)");
    expect(body("private.ifp_basic")).toContain("normalize(t,NFC)");
    expect(body("private.ifp_normalize")).toContain(
      "private.ifp_fail('unicode')",
    );
    expect(body("private.ifp_normalize")).toContain("'ﬃ','ffi'");
    expect(body("private.ifp_normalize")).toContain("replace(token,'­','')");
    expect(body("private.ifp_role_display")).toContain(
      "array['Engineer','Developer','Analyst','Architect','Designer','Scientist']",
    );
    expect(body("private.ifp_ascii_lower")).toContain(
      "translate(p_text,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')",
    );
  });

  it("derives full left/right/layout context before admitting factual expressions", () => {
    expect(document).toContain("qualifiers:=true");
    expect(document).toContain("right_qualified:=true");
    expect(document).toContain("layout_metadata[j+1]:=true");
    expect(document).toContain("neutral_refs[j+2]:=true");
    expect(document).toContain(
      "'unqualified',not qualifiers and not right_qualified",
    );
    expect(document).toContain("'adjacentRole'");
    expect(expr).toContain("if not (anchor->>'unqualified')::boolean");
    expect(expr).toContain("original->'ref'<>anchor->'ref'");
  });

  it("requires a whole permutation and the frozen direction/agency/role relationships", () => {
    expect(expr).toContain("jsonb_array_length(p_expr->'clauses')<>n");
    expect(expr).toContain(
      "i=any(used) or (i<>ordinal and not (anchor->>'reorderable')::boolean)",
    );
    expect(expr).toContain("array_to_string(parts,'; ')");
    expect(body("private.ifp_variant")).toContain(
      `(lower_surface collate "C") in ('built','created','developed')`,
    );
    expect(body("private.ifp_variant")).toContain(
      "private.ifp_lower_better(p_clause->>'object')",
    );
    expect(body("private.ifp_lower_better")).toContain(
      "amount<=0 or amount='Infinity'::double precision",
    );
    expect(expr).toContain("clause_value->>'actor'<>'implicit'");
    expect(expr).toContain("jsonb_array_length(contribution->'clauses')<>1");
    expect(expr).toContain("contribution->>'adjacentRole'");
    expect(expr).toContain('collate "C"');
  });

  it("does not promote question or editorial copy into strength", () => {
    expect(expr).toContain(
      `(p_place collate "C")='tip' and kind_value not like 'clarification_%' and (text_value collate "C")~'[?？؟]'`,
    );
    expect(expr).toContain(`if (text_value collate "C")~'[?？؟]' then`);
    expect(expr).toContain(
      "part_kind:='clarification_question';part_state:='clarification_required'",
    );
    expect(renderer).toContain(
      `type_value:=case when (kind_value collate "C")='source_claim' then item->>'requestedType' else 'improve' end`,
    );
    expect(expr).toContain(`(p_place collate "C")='reasoning'`);
    expect(expr).toContain("private.ifp_editorial_forms(anchor)");
  });

  it("retains original-to-output maps and explicitly labels minimum-three padding", () => {
    expect(renderer).toContain("original_index<=last_index");
    expect(renderer).toContain(
      "'originalIndex',original_index,'retainedIndex',retained_index,'compatibilityIndex',retained_index",
    );
    expect(renderer).toContain("while jsonb_array_length(category_tips)<3");
    expect(renderer).toContain("'origin',null,'scope','compatibility_only'");
    expect(renderer).toContain("No additional cited suggestion is available.");
    expect(renderer).toContain(
      "Review the source evidence before adding information.",
    );
    expect(renderer).toContain("'score',0,'tips',category_tips");
    expect(renderer).not.toMatch(/sort|order by.*originalIndex/iu);
  });

  it("enforces aggregate work/assessment/expression limits and rejects empty success", () => {
    expect(
      renderer.match(/doc:=private\.ifp_document\(p_source\)/gu),
    ).toHaveLength(1);
    expect(renderer).toContain("work:=(doc->>'work')::bigint");
    expect(renderer).toContain(
      "work:=work+(title_value->>'work')::bigint+(explanation_value->>'work')::bigint",
    );
    expect(renderer).toContain(
      "work>8000000 or assessment_count>73 or expression_count>41",
    );
    expect(renderer).toContain("if retained_count=0");
    expect(renderer).toContain(
      "octet_length(convert_to(prose::text,'UTF8'))>65536",
    );
    expect(document).toContain("jsonb_array_length(units)>=512");
    expect(body("private.ifp_clauses")).toContain(
      "jsonb_array_length(clauses)>=16",
    );
  });

  it("preserves raw proof values, normalizes each clause, and fixes grammar collation", () => {
    const clauses = body("private.ifp_clauses");
    expect(clauses).toContain("piece:=substring(p_text from cursor_pos");
    expect(clauses).not.toContain("piece:=private.ifp_basic");
    expect(clauses).toContain(
      "object_value:=substring(piece from regexp_instr",
    );
    expect(body("private.ifp_variant")).toContain(
      "literal text:=private.ifp_basic(p_clause->>'text')",
    );
    expect(expr).toContain(
      "parts:=array_append(parts,private.ifp_normalize(private.ifp_variant",
    );
    expect(expr).not.toContain("private.ifp_normalize(array_to_string(parts");
    expect(body("private.ifp_role")).toContain(
      "substring(p_text from regexp_instr",
    );
    expect(body("private.ifp_original")).toContain('collate "C"');
    // Raw response\ttime and Machine\tLearning are not the frozen literal-space grammar.
    expect(body("private.ifp_role")).toContain("normalized text:=p_text");
    expect(body("private.ifp_lower_better")).toContain(
      'regexp_match(p_object collate "C",pattern',
    );
    expect(body("private.ifp_lower_better")).not.toContain(
      "regexp_match(private.ifp_ws(p_object)",
    );
    expect(body("private.ifp_ws_pattern")).toContain("chr(65279)");

    expect(body("private.ifp_keys")).toContain(
      'array_agg(key collate "C" order by key collate "C")',
    );
    expect(body("private.ifp_normalize")).toContain(
      'regexp_replace(word collate "C"',
    );
  });

  it("leaves the prior scoring-input migration and profile byte-exact", () => {
    const prior = readFileSync(
      new URL(
        "../../supabase/migrations/20261115045834_legacy_scoring_input.sql",
        import.meta.url,
      ),
      "utf8",
    );
    // Historical775-byte b18 baseline, from the frozen stored-source-guard artifact.
    // The current f2 successor is checked by its dedicated forward-source suite.
    const priorProfile =
      '// Exact source-body pins; not installed/native or activation proof.\nexport const LEGACY_SCORING_INPUT_PROFILE = Object.freeze({\n  schemaVersion: "legacy-scoring-readiness/1.0.0",\n  profileVersion: "legacy-scoring-profile/1.0.0",\n  checkerSha256:\n    "e891aed3848b39893718d883f7a3ff5efb3ebeda3ee6967d64daa13924075458",\n  readerSha256:\n    "1b9891fc6ece7e948c4623b6455686a2fc42e4896ff3fcc78f0ce0275a44d7c3",\n  finishSha256:\n    "e367a8f688b2661fc8baa374ad44a4be90712016d3ed44214857ed1127e10f18",\n  contextSha256:\n    "c79b6174de5e28fc56a0cb3648d5e1cc4e19ff5139f2869ce54478c9cf6cf618",\n  exportSha256:\n    "e4c17997fdbec81d931e4838b3522c6c7d3c861b0bfa07b6fb3ab5ece160f0a2",\n  metadataSha256:\n    "f18e6abfd698c4dbf4f7f6040fb577b2e49e78e4125bfd9d31e8166d0e678da8",\n} as const);\n';
    expect(hash(prior)).toBe(
      "2cb4e2e684d4f4270085a541911422637b811aba8b02ce668f5dab4833dc8f80",
    );
    expect(hash(priorProfile)).toBe(
      "b18bbcd0242245d3a4b47ddbb1477bc121c7e3c566ef06bd00f0a5b081016b94",
    );
  });
});
