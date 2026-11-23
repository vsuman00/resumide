from pathlib import Path
import json,re,hashlib
r=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats');t=Path(__file__).parent
s='''import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {describe,expect,it} from "vitest";
const read=(f:string)=>readFileSync(new URL(`../../${f}`,import.meta.url),"utf8");
const source=read("supabase/migrations/20261116075250_privacy_export_generation.sql");
type Patch={signature:string;old:string;new:string;before:string;after:string};
const patches=JSON.parse(source.split("$privacy_generation_patches$")[1]) as Patch[];
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
function direct(text:string,name:string){const start=text.indexOf(`create function ${name}(`);const match=/\\bas\\s+(\\$[A-Za-z0-9_]*\\$)([\\s\\S]*?)\\1;/u.exec(text.slice(start));if(start<0||!match)throw Error("ACTUAL_BODY");return match[2];}
function body(signature:string){const patch=patches.find(p=>p.signature===signature);if(patch)return patch.new;const name=signature.split("(")[0];
 if(name==="private.serialize_deletion_request")return (JSON.parse(read("supabase/migrations/20261115131621_owned_ai_disposition_clocks.sql").split("$disposition_patches$")[1]) as Patch[]).find(p=>p.signature===signature)!.new;
 if(name==="private.set_updated_at")return direct(read("supabase/migrations/20260909073321_candidate_resume_analysis.sql"),name);
 if(name==="private.initialize_privacy_request_steps")return direct(read("supabase/migrations/20260911110000_phase7_security_privacy_operations.sql"),name);
 return direct(source,name);
}
const prepare=body("public.prepare_deletion_request(uuid,text,integer)");
const complete=body("public.complete_privacy_request(uuid,text,integer,jsonb)");
const fail=body("public.fail_privacy_request(uuid,text,integer,text,integer)");
describe("real privacy-generation source, SQL unparsed/unexecuted",()=>{
 it("checks twelve exact predecessor/postimages and all18 actual new/inherited authority pins",()=>{expect(patches).toHaveLength(12);for(const p of patches){expect(sha(p.old)).toBe(p.before);expect(sha(p.new)).toBe(p.after);}const rows=JSON.parse(body("private.privacy_generation_ready()").split("$generation_functions$")[1]) as Array<{signature:string;sha256:string}>;expect(rows).toHaveLength(18);for(const row of rows)expect(sha(body(row.signature))).toBe(row.sha256);});
 it("refuses each legacy overload rather than inferring a current attempt",()=>{expect(body("public.prepare_deletion_request(uuid,text)")).toContain("PRIVACY_CLAIM_FENCE_REQUIRED");expect(body("public.complete_privacy_request(uuid,text,jsonb)")).toBe("\\nbegin return false;end;\\n");expect(body("public.fail_privacy_request(uuid,text,text,integer)")).toBe("\\nbegin return false;end;\\n");});
 it("validates actual request/worker/attempt/live lease and never guesses an old epoch",()=>{const claim=body("private.privacy_generation_claim(uuid,text,integer)");expect(claim).toContain("attempt_count=p_attempt and lease_expires_at>clock_timestamp() and privacy_generation is not null");expect(claim).toContain("lease_owner=p_worker");expect(prepare).toContain("and attempt_count=p_attempt and lease_expires_at>clock_timestamp() and privacy_generation is not null");expect(source).toContain("add column privacy_generation bigint check(privacy_generation>=0)");expect(source).not.toMatch(/privacy_generation bigint[^;]*default/iu);});
 it("stamps only actual claims under fresh post-lock generation and retains monotonic attempt",()=>{const claim=body("public.claim_privacy_request(text,integer)");expect(claim.indexOf("generation_now:=private.privacy_generation_current()")).toBeLessThan(claim.indexOf("select * into request_row"));expect(claim).toContain("privacy_generation=generation_now");expect(claim).toContain("attempt_count = attempt_count + 1");expect(claim).toContain("'attempt', request_row.attempt_count + 1");const current=body("private.privacy_generation_current()");expect(current.indexOf("pg_try_advisory_xact_lock_shared")).toBeLessThan(current.indexOf("select generation into value"));});
 it("binds content completion to current generation while safe failure cannot restamp/reuse old content",()=>{expect(complete).toContain("claimed.privacy_generation<>generation_now");expect(complete).toContain("p_manifest is distinct from jsonb_build_object('deleted',true)");expect(fail).not.toContain("set privacy_generation");expect(fail).not.toContain("result_manifest=");expect(fail).toContain("private.privacy_generation_claim(p_request_id,p_worker_id,p_attempt)");});
 it("advances once at real first preparation and preserves the old plan/clock/capture bytes",()=>{expect(prepare).toContain("get diagnostics inserted_clock=row_count");expect(prepare).toContain("if inserted_clock=1 then perform private.privacy_generation_advance(request_row.user_id)");const old=patches.find(p=>p.signature==="public.prepare_deletion_request(uuid,text)")!.old;for(const line of old.split("\\n").filter(l=>l.includes("capture_owned_")||l.includes("first_at+interval '720 hours'")))expect(prepare).toContain(line);expect(prepare.indexOf("private.privacy_generation_advance")).toBeLessThan(prepare.indexOf("delete from public.analyses"));});
 it("advances/clears old copies before fold erasure under the same exclusive global gate",()=>{const advance=body("private.privacy_generation_advance(uuid)");expect(advance.indexOf("pg_try_advisory_xact_lock(")).toBeLessThan(advance.indexOf("update private.privacy_export_generation"));expect(advance).toContain("for update nowait");expect(advance).toContain("update public.data_requests set result_manifest=null where user_id=p_owner and kind='export'");const fold=body("private.expire_owned_ai_disposition(uuid)");expect(fold.indexOf("perform private.owned_ai_expiry_require_adoption")).toBeLessThan(fold.indexOf("perform private.privacy_generation_advance"));expect(fold.indexOf("perform private.privacy_generation_advance")).toBeLessThan(fold.indexOf("delete from private.ai_budget_operations"));});
 it("preflights actual old authority schema under DDL lock before learning the new seal",()=>{expect(source.indexOf("lock table public.data_requests in access exclusive mode")).toBeLessThan(source.indexOf("alter table public.data_requests add column"));expect(source).toContain("PRIVACY_GENERATION_COLUMN_PREIMAGE");expect(source).toContain("PRIVACY_GENERATION_CHECK_PREIMAGE");expect(source).toContain("PRIVACY_GENERATION_FOREIGN_KEY_PREIMAGE");expect(source).toContain("PRIVACY_GENERATION_TRIGGER_PREIMAGE");expect(source).toContain("<>14");expect(source).toContain("<>6");});
 it("closes broad AND column writes and positively checks necessary service privileges",()=>{expect(source).toContain("revoke insert,update,delete,truncate,references,trigger on public.data_requests from public,anon,authenticated,service_role");expect(source).toContain("revoke insert(%1$I),update(%1$I),references(%1$I)");const ready=body("private.privacy_generation_ready()");for(const col of ["id","organization_id","user_id","kind","status"])expect(ready).toContain(`has_column_privilege('service_role','public.data_requests','${col}','INSERT')`);expect(ready).toContain("has_table_privilege('service_role','public.data_requests','SELECT')");});
 it("permits direct queued cancellation only and keeps the existing prepared-cancel barrier untouched",()=>{const guard=body("private.privacy_generation_status_guard()");expect(guard).toContain("rolname=current_user");expect(guard).toContain("if caller=trusted_owner then return new");expect(guard).toContain("old.status='queued' and new.status='cancelled'");expect(guard).toContain("new.privacy_generation is null and new.result_manifest is null");expect(source.slice(source.indexOf("create function private.privacy_generation_status_guard()"),source.indexOf("$generation_status_guard$;"))).not.toContain("security definer");expect(patches.some(p=>p.signature==="private.serialize_deletion_request()")).toBe(false);});
 it("has an owner-free monotonic counter and never grants expiry/adoption data access",()=>{const table=source.split("create table private.privacy_export_generation(")[1].split(";")[0];expect(table).not.toMatch(/owner|request|organization|sha256|timestamp/iu);expect(body("private.privacy_generation_counter_guard()")).toContain("new.generation is distinct from old.generation+1");expect(source).not.toMatch(/grant execute on function public\\.sweep_owned_ai_expiry/iu);expect(source).not.toContain("insert into private.owned_ai_expiry_adoption_capability");});
});
'''
a=json.loads((t/'allocation.json').read_text());profiles={f:sha for f,sha in a['preimages'].items() if f.endswith('-profile.ts')}
s+='\nit("preserves all five predecessor profiles except exact actual successor pins",()=>{const profiles='+json.dumps(profiles)+';for(const [file,pin]of Object.entries(profiles)){let actual=read(file);for(const p of [...patches].reverse())actual=actual.replaceAll(p.after,p.before);expect(sha(actual)).toBe(pin);}});\n'
(r/'tests/unit/privacy-export-generation-sql.test.ts').write_text(s)
created=json.loads((t/'created-bodies.json').read_text());ps=json.loads((t/'patches.json').read_text());rows=[{'signature':sig,'sha256':hashlib.sha256(b.encode()).hexdigest()} for sig,b in created.items()]+[{'signature':p['signature'],'sha256':p['after']} for p in ps]
v='''-- PRIVILEGED MUTATING ROLLBACK-ONLY DRAFT; UNPARSED/UNEXECUTED.
-- Authorized disposable migrated database only. No real privacy/Auth/storage/provider operation.
-- Fenced-positive lease/ABA/generation two-session fixtures remain Native acceptance.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $generation_verify$
declare item jsonb;missing uuid:=gen_random_uuid();claimed public.data_requests%rowtype;
 manifest jsonb:=$generation_expected$EXPECTED$generation_expected$::jsonb;
begin
 for item in select value from jsonb_array_elements(manifest) loop
  if (select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature')) is distinct from item->>'sha256'
   then raise exception 'PRIVACY_GENERATION_VERIFY_PIN';end if;
 end loop;
 if private.privacy_generation_ready() is not true then raise exception 'PRIVACY_GENERATION_VERIFY_READY';end if;
 claimed:=private.privacy_generation_claim(missing,'synthetic-worker',1);
 if claimed.id is not null or public.complete_privacy_request(missing,'synthetic-worker',jsonb_build_object('stale',true)) is distinct from false
  or public.fail_privacy_request(missing,'synthetic-worker','UNKNOWN',3) is distinct from false
  then raise exception 'PRIVACY_GENERATION_VERIFY_LEGACY';end if;
 begin
  execute 'revoke insert(kind) on public.data_requests from service_role';
  if private.privacy_generation_ready() is not false then raise exception 'PRIVACY_GENERATION_VERIFY_MISSING_INSERT_ACCEPTED';end if;
  raise exception 'PRIVACY_GENERATION_VERIFY_ROLLBACK' using errcode='P0P02';
 exception when sqlstate 'P0P02' then null;
 end;
 if private.privacy_generation_ready() is not true then raise exception 'PRIVACY_GENERATION_VERIFY_NOT_RESTORED';end if;
 begin
  update private.privacy_export_generation set generation=generation-1;
  raise exception 'PRIVACY_GENERATION_VERIFY_RESET_ACCEPTED';
 exception when check_violation then null;
 end;
 if has_function_privilege('service_role','public.sweep_owned_ai_expiry(integer)','EXECUTE')
  then raise exception 'PRIVACY_GENERATION_VERIFY_DESTRUCTIVE_GRANT';end if;
end;
$generation_verify$;
rollback;
'''.replace('EXPECTED',json.dumps(rows,separators=(',',':')));(r/'scripts/verify-privacy-export-generation.sql').write_text(v)
