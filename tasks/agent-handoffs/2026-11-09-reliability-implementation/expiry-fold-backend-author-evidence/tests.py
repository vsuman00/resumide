from pathlib import Path
import json,re
r=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats');t=Path(__file__).parent
f=r/'tests/unit/owned-ai-expiry-sql.test.ts';s=f.read_text();s='import {createHash} from "node:crypto";\n'+s
s+='''
import { OWNED_AI_EXPIRY_PROFILE } from "../../app/lib/server/owned-ai-expiry-profile";
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
type Patch={signature:string;old:string;new:string;before:string;after:string};
const patches=JSON.parse(candidate.split("$expiry_patches$")[1]) as Patch[];
function body(name:string){
 const patched=patches.find(p=>p.signature.split("(")[0]===name);if(patched)return patched.new;
 const start=candidate.indexOf(`create function ${name}(`);
 const m=/\\bas\\s+(\\$[A-Za-z0-9_]+\\$)([\\s\\S]*?)\\1;/u.exec(candidate.slice(start));
 if(start<0||!m)throw Error("ACTUAL_SOURCE_BODY");return m[2];
}
const core=body("private.expire_owned_ai_disposition");
describe("actual expiry source invariants, not SQL execution",()=>{
 it("pins all24 exact old/new replacements and every finite helper/checker digest",()=>{
  expect(patches).toHaveLength(24);
  for(const p of patches){expect(hash(p.old)).toBe(p.before);expect(hash(p.new)).toBe(p.after);}
  for(const [name,tag,count] of [["private.owned_ai_expiry_safety_ready","expiry_safety_functions",19],["private.owned_ai_expiry_ready","expiry_functions",24]] as const){
   const entries=JSON.parse(body(name).split(`$${tag}$`)[1]) as Array<{signature:string;sha256:string}>;
   expect(entries).toHaveLength(count);
   for(const row of entries)expect(hash(body(row.signature.split("(")[0])))).toBe(row.sha256);
  }
  expect(OWNED_AI_EXPIRY_PROFILE.checkerSha256).toBe(hash(body("private.owned_ai_expiry_ready")));
  expect(OWNED_AI_EXPIRY_PROFILE.sweepSha256).toBe(hash(body("public.sweep_owned_ai_expiry")));
  expect(OWNED_AI_EXPIRY_PROFILE.metadataSha256).toBe(hash(body("public.read_owned_ai_expiry_readiness")));
 });
 it("preserves each old guard byte except exact relational DELETE authorization",()=>{
  const line=" if tg_op='DELETE' and private.owned_ai_expiry_delete_allowed(tg_table_name,to_jsonb(old)) then return old;end if;\\n";
  for(const p of patches.slice(0,7))expect(p.new.replace(line,"")).toBe(p.old);
  expect(body("private.owned_ai_expiry_delete_allowed")).toContain("private.owned_ai_expiry_selected");
  expect(body("private.owned_ai_expiry_selected")).toContain("w.transaction_id=txid_current()");
 });
 it("keeps personal authority transient, refuses noncurrent txids and requires no surviving own work",()=>{
  expect(body("private.owned_ai_expiry_work_guard")).toContain("new.transaction_id<>txid_current()");
  expect(body("private.owned_ai_expiry_work_closed")).toContain("where transaction_id=new.transaction_id");
  expect(candidate).toContain("deferrable initially deferred");
  expect(core.indexOf("delete from private.owned_ai_expiry_work")).toBeGreaterThan(core.indexOf("delete from private.ai_budget_operations"));
  expect(body("private.owned_ai_expiry_safety_ready")).toContain("transaction_id<>txid_current()");
 });
 it("requires the exact real pinned adoption verifier before totals or erasure, without seeding a verifier",()=>{
  const auth=body("private.owned_ai_expiry_require_adoption");
  expect(auth).toContain("execute 'select private.verify_owned_ai_expiry_adoption($1,$2)'");
  expect(auth).toContain("'minimumExpiresAt',private.ifo_stamp(minimum_at)");
  expect(auth).toContain("order by kind,identity::text");
  expect(core.indexOf("perform private.owned_ai_expiry_require_adoption")).toBeLessThan(core.indexOf("insert into private.owned_ai_expiry_months"));
  expect(candidate).not.toContain("create function private.verify_owned_ai_expiry_adoption");
  expect(candidate).not.toMatch(/insert into private\\.owned_ai_expiry_adoption_capability/iu);
  expect(body("private.owned_ai_expiry_adoption_ready")).toContain("private.ifo_sha(p.prosrc)<>c.body_sha256");
  expect(body("private.owned_ai_expiry_adoption_ready")).toContain("a.grantee<>p.proowner");
  expect(core).not.toContain("public.consents");expect(core).not.toContain("public.memberships");expect(core).not.toContain("ai_budget_source_current");
 });
 it("separates structural readiness from unavailable adoption and destructive EXECUTE",()=>{
  expect(body("private.owned_ai_expiry_ready")).not.toContain("private.owned_ai_expiry_adoption_ready()");
  expect(body("public.read_owned_ai_expiry_readiness")).toContain("'foldExecutable',ready and private.owned_ai_expiry_adoption_ready() and has_function_privilege");
  const grants=candidate.split("\\n").filter(line=>line.startsWith("grant "));
  expect(grants).toEqual(["grant execute on function public.read_owned_ai_expiry_readiness() to service_role;"]);
 });
 it("keeps only month and numeric safety measures in retained accounting",()=>{
  const table=candidate.split("create table private.owned_ai_expiry_months(")[1].split("\\n);")[0];
  expect(table).not.toMatch(/owner|organization|operation|attempt|run_id|actor|request|sha256|timestamp|nonce/iu);
  expect(table).toContain("month date primary key");expect(table).toContain("unresolved_pool_deficits numeric");expect(table).toContain("legacy_erased_runs numeric");
  expect(core).toContain("return jsonb_build_object('status','folded')");
  expect(core).toContain("return jsonb_build_object('status','not_pending')");
 });
 it("preserves independent typed-claim, R03-period and compatibility-run months without double debit",()=>{
  expect(core).toContain("t.input_tokens::numeric+t.output_tokens::numeric tokens");
  expect(core).toContain("date_trunc('month',x.claimed_at at time zone 'UTC')::date");
  expect(core).toContain("select a.period month");
  expect(core).toContain("t.classification='legacy_unlinked'");
  expect(core).toContain("select t.original_month month,count(*)::numeric runs");
  expect(core).toContain("where private.owned_ai_expiry_selected('legacy',t.owner_id,t.analysis_id,null,t.run_id) group by t.original_month");
  expect(body("private.owned_ai_expiry_since_blocked")).toContain("m.legacy_erased_runs>0");
  expect(body("private.owned_ai_expiry_global_blocked")).not.toContain("legacy_erased_runs");
 });
 it("refuses missing clocks, live/retained conflicts and incomplete reverse typed pairs before sums",()=>{
  expect(core).toContain("OWNED_AI_EXPIRY_CLOCK_REPAIR");
  expect(core).toContain("private.owned_legacy_ai_usage_row_valid(retired_run) is not true");
  expect(core).toContain("perform private.assert_owned_legacy_ai_usage(organization)");
  expect(core).toContain("s.kind='canonical_rewrite' and not private.owned_ai_expiry_selected('a12'");
  expect(core).toContain("t.classification='a13_linked' and not exists");
  expect(core).toContain("OWNED_AI_EXPIRY_INCOMPLETE_ACCOUNT");
  expect(core).not.toMatch(/limit (?:1000|4096)/iu);
 });
 it("conserves unknown technical exposure and independent pool-fence transitions across month rollover",()=>{
  const rebuild=body("private.owned_ai_expiry_rebuild_pools");
  expect(core).toContain("a.state in ('reserved','dispatched','held_unknown')");
  expect(rebuild).toContain("and not (opening.opening_spent_tokens+remaining.spent+remaining.reserved_tokens>pool.token_limit");
  expect(rebuild).toContain("unresolved_pool_deficits=owned_ai_expiry_months.unresolved_pool_deficits+1");
  expect(rebuild.indexOf("insert into private.owned_ai_expiry_months")).toBeLessThan(rebuild.indexOf("update private.ai_budget_pools"));
  expect(body("private.owned_ai_expiry_global_blocked")).toContain("m.unresolved_pool_deficits>0");
  expect(rebuild).toContain("OWNED_AI_EXPIRY_POOL_PROVENANCE");
 });
 it("uses a real post-lock fresh safety read while preserving the old total-validation statement",()=>{
  const since=candidate.slice(candidate.indexOf("create function private.owned_ai_expiry_since_blocked("));
  expect(since).toContain("language plpgsql volatile");
  expect(body("private.owned_ai_expiry_since_blocked").indexOf("private.owned_ai_expiry_read_lock()")).toBeLessThan(body("private.owned_ai_expiry_since_blocked").indexOf("return exists(select"));
  expect(body("private.read_preserved_organization_ai_tokens")).toContain("private.owned_ai_expiry_since_blocked(p_since)");
  expect(body("private.ai_budget_blocked")).toContain("private.owned_ai_expiry_global_blocked");
  expect(core).toContain("pg_try_advisory_xact_lock(('x'||substr(private.ifo_sha('resumide:owned-ai-expiry-global:v1')");
  expect(body("private.owned_ai_expiry_read_lock")).toContain("pg_try_advisory_xact_lock_shared");
 });
 it("fences both A13 fresh finish and replay on the common path",()=>{
  const finish=body("public.finish_initial_feedback");
  expect(finish.indexOf("perform private.owned_ai_expiry_late_lock")).toBeLessThan(finish.indexOf("if op.state='published'"));
  expect(finish.indexOf("perform private.owned_ai_expiry_late_lock")).toBeLessThan(finish.indexOf("perform private.ifpub_validate_completion"));
  expect(body("private.ai_budget_transition")).toContain("operation_exists and p_action not in ('reserve','claim_dispatch')");
  expect(body("private.owned_ai_expiry_late_lock")).toContain("pg_try_advisory_xact_lock_shared");
 });
 it("refuses this owner's actor linkage on foreign spend without deleting that foreign operation",()=>{
  expect(core).toContain("e.operator_id=p_owner_id and o.user_id<>p_owner_id");
  expect(core).not.toContain("e.operator_id<>p_owner_id");
  expect(core).toContain("delete from private.ai_budget_operations o where private.owned_ai_expiry_selected('r03',o.user_id,null,o.id,null)");
 });
 it("keeps successful overdue work and deadline crossings visible in count-only sweep results",()=>{
  const sweep=body("public.sweep_owned_ai_expiry");
  expect(sweep).toContain("breached:=breached or selected_deadline<clock_timestamp()");
  expect(sweep).toContain("breached:=breached or exists(select 1 from private.owned_ai_deletion_dispositions where expires_at<clock_timestamp())");
  expect(sweep).toContain("selected:=selected+1");expect(sweep).toContain("blocked:=blocked+1");
  const output=sweep.slice(sweep.lastIndexOf("return jsonb_build_object"));
  expect(output).not.toMatch(/ownerId|operationId|attemptId|requestId|sha256/iu);
 });
});
'''
# Seven/nine predecessor modules reconstruct byte-exactly by inverse body-pin substitution.
a=json.loads((t/'allocation-final.json').read_text());pre={f:x for f,x in a['preimages'].items() if f.startswith('app/') and x}
s+='\nit("preserves every allocated predecessor profile byte except actual renewed pins",()=>{\nconst profiles='+json.dumps(pre,indent=2)+';\nfor(const [file,pin] of Object.entries(profiles)){let source=read(file);for(const p of [...patches].reverse())source=source.replaceAll(p.after,p.before);expect(hash(source)).toBe(pin);}\n});\n'
f.write_text(s)
