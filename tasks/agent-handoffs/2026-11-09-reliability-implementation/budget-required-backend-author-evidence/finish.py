from pathlib import Path
import json,hashlib
r=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats');t=Path(__file__).parent;p=json.loads((t/'patches.json').read_text());old=json.loads((t/'terminal-preimages.json').read_text());h=lambda s:hashlib.sha256(s.encode()).hexdigest()
f=r/'tests/unit/mandatory-ai-budget-sql.test.ts';s=f.read_text().replace('import { readFileSync }','import { createHash } from "node:crypto";\nimport { readFileSync }')
profiles={}
for path in json.loads((t/'allocation.json').read_text())['files']:
 if path.startswith('app/'):
  text=(r/path).read_text();import re
  constants=re.findall(r'export const (\w+) = Object.freeze',text)
  s+='\nimport { '+', '.join(constants)+' } from "../../'+path[:-3]+'";\n'
  for c in constants:profiles[c]=path
s+='''
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const changed = new Map(patches.map(p => [p.signature.split("(")[0], p]));
const guards = [
  "  if p_budget is null or p_budget='null'::jsonb then perform private.correction_fail('unavailable');end if;\\n",
  "  if (op.binding->'policy'->>'budgetPolicyVersion') is null or p_budget is null or p_budget='null'::jsonb then perform private.ifo_fail('unavailable');end if;\\n",
];
describe("exact forward mandatory-budget closure, Source evidence only", () => {
 it("changes exactly two claim bodies and seven checker bodies with guarded pre/postimages", () => {
  expect(patches).toHaveLength(9);
  expect(new Set(patches.map(p => p.signature)).size).toBe(9);
  for (const p of patches) { expect(hash(p.old)).toBe(p.before); expect(hash(p.new)).toBe(p.after); }
  expect(candidate).toContain("p.prosrc is distinct from item->>'old'");
  expect(candidate).toContain("statements:=array_append(statements,replace(source,p.prosrc,item->>'new'))");
  expect(candidate).toContain("MANDATORY_AI_BUDGET_POSTIMAGE_DRIFT");
 });
 it.each([
  ["public.claim_canonical_rewrite_dispatch", 0],
  ["public.claim_initial_feedback_dispatch", 1],
 ] as const)("preserves every predecessor byte except its mandatory guard: %s", (name, index) => {
  const p=changed.get(name)!;
  expect(p.new.split(guards[index])).toHaveLength(2);
  expect(p.new.replace(guards[index], "")).toBe(p.old);
  expect(p.old).toBe(prior.find(x=>x.signature===p.signature)!.new);
  const replay=p.new.indexOf(name.includes("canonical") ? "if op.state<>'reserved'" : "if op.state<>'open'");
  expect(replay).toBeLessThan(p.new.indexOf(guards[index]));
  expect(p.new.indexOf(guards[index])).toBeLessThan(p.new.indexOf("budget:=private.ai_budget_transition"));
 });
 it("renews checker digests only, preserving all other bytes/ACL/catalogue checks", () => {
  for (const p of patches.slice(2)) {
   let restored=p.new;
   for (const dep of [...patches].reverse()) restored=restored.replaceAll(dep.after,dep.before);
   expect(restored).toBe(p.old);
  }
 });
 it("leaves table seals, permissions, prices and policy schemas unchanged", () => {
  expect(candidate).not.toMatch(/(?:create|alter|drop)\\s+(?:table|trigger|policy)|(?:grant|revoke)\\s/iu);
  expect(patches.every(p=>!/(?:settle|finish|publish|outcome|policy_valid|transition|prepare)/u.test(p.signature))).toBe(true);
  expect(body("public.claim_initial_feedback_dispatch")).toContain("op.binding->'policy'->>'budgetPolicyVersion'");
  expect(body("public.claim_canonical_rewrite_dispatch")).not.toContain("budgetPolicyVersion");
 });
'''
# pin each module value against actual composed preimages or postimages, including unchanged exports.
terminal=old|{x['signature'].split('(')[0]:x['new'] for x in p}
values=sorted(set(h(v) for v in terminal.values()))
s+=' it("binds every current profile digest to actual composed terminal function bodies", () => {\n const actual = new Set('+json.dumps(values)+');\n'
for c in profiles:s+=' for(const [key,value] of Object.entries('+c+')) if(key.endsWith("Sha256")) expect(actual.has(value)).toBe(true);\n'
# precise claim/checker direct ties
for c,n,key in [('CANONICAL_REWRITE_READINESS_PROFILE','public.claim_canonical_rewrite_dispatch','claimSha256'),('INITIAL_FEEDBACK_OPERATION_PROFILE','public.claim_initial_feedback_dispatch','claimSha256'),('INITIAL_FEEDBACK_PROFILE','public.claim_initial_feedback_dispatch','claimSha256')]:
 s+=f' expect({c}.{key}).toBe(hash(body("{n}")));\n'
s+=' });\n});\n';f.write_text(s)
# Deferred verifier: explicit scope, no synthetic candidate fixtures or Native behavior claim.
v='''-- PRIVILEGED, MUTATING, ROLLBACK-ONLY DRAFT. UNEXECUTED.
-- Requires the complete disposable migrated database. Never run against hosted/user data.
-- This verifies exact installed pins and checker drift, not provider execution or null-claim fixture behavior.
-- Actual replay/null-budget/late-accounting Native transaction fixtures remain separate acceptance.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $mandatory_budget_verify$
declare item jsonb;p pg_catalog.pg_proc%rowtype;ddl text;
 manifest jsonb:=$mandatory_budget_expected$EXPECTED$mandatory_budget_expected$::jsonb;
begin
 for item in select value from jsonb_array_elements(manifest) loop
  select * into strict p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
  if private.ifo_sha(p.prosrc) is distinct from item->>'after' then raise exception 'MANDATORY_BUDGET_PIN_MISMATCH';end if;
 end loop;
 if private.canonical_rewrite_ready() is not true or private.canonical_rewrite_workspace_ready() is not true
  or private.initial_feedback_operation_ready() is not true or private.initial_feedback_ready() is not true
  or private.owned_legacy_ai_usage_ready() is not true or private.ai_budget_source_ready() is not true
  or private.owned_ai_disposition_ready() is not true then raise exception 'MANDATORY_BUDGET_NOT_READY';end if;
 -- Nested exception rolls back the deliberate function-only mutation before final pin recheck.
 begin
  select * into strict p from pg_catalog.pg_proc where oid=to_regprocedure('public.claim_canonical_rewrite_dispatch(uuid,uuid,uuid,text,jsonb)');
  ddl:=replace(pg_get_functiondef(p.oid),p.prosrc,p.prosrc||E'\\n-- synthetic checker drift\\n');execute ddl;
  if private.canonical_rewrite_ready() is not false then raise exception 'MANDATORY_BUDGET_DRIFT_ACCEPTED';end if;
  raise exception 'MANDATORY_BUDGET_ROLLBACK_FIXTURE' using errcode='P0B01';
 exception when sqlstate 'P0B01' then null;
 end;
 for item in select value from jsonb_array_elements(manifest) loop
  if (select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature')) is distinct from item->>'after'
   then raise exception 'MANDATORY_BUDGET_FIXTURE_NOT_RESTORED';end if;
 end loop;
end;
$mandatory_budget_verify$;
rollback;
'''.replace('EXPECTED',json.dumps([{k:x[k] for k in ['signature','after']} for x in p],separators=(',',':')))
(r/'scripts/verify-mandatory-ai-budget.sql').write_text(v)
