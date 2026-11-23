from pathlib import Path
import re,json,hashlib
w=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats');packet=Path('/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a13-late-settlement-ylyqwodj');target=w/'supabase/migrations/20261115095258_initial_feedback_late_settlement.sql';assert target.read_bytes()==b''
def h(s):return hashlib.sha256(s.encode()).hexdigest()
def f(text,name):
 m=re.search(r'create(?: or replace)? function '+re.escape(name)+r'\([\s\S]*?\)\s*returns [\s\S]*?\bas\s+(\$[A-Za-z0-9_]+\$)([\s\S]*?)\1;',text);assert m;return m[0],m[2],m[1]
pub=(w/'supabase/migrations/20261115081345_initial_feedback_publications.sql').read_text();usage=(w/'supabase/migrations/20261115082125_owned_ai_usage.sql').read_text()
guard_stmt,oldguard,g_tag=f(pub,'private.ifo_attempt_guard');op_stmt,oldop,o_tag=f(pub,'private.initial_feedback_operation_ready');full_stmt,oldfull,r_tag=f(usage,'private.initial_feedback_ready')
before="""   -- A partial's unknown hold may learn actual usage after publication. It
   -- cannot change its terminal reason, acquire a dispatch, or alter content.
   if not exists(select 1 from private.initial_feedback_publications p where p.id=op.publication_id and p.state='deterministic_only')
    or not(old.state='held_unknown' and old.usage is null and old.error_code is not null and new.state='failed' and new.usage is not null
"""
after="""   -- Candidate content may already have cascaded away. Exact immutable
   -- claimed metadata alone admits this first known fill, never a new dispatch.
   -- Identity-retention expiry is a separate, not-yet-adopted lifecycle.
   if not(old.state='held_unknown' and old.usage is null and old.error_code is not null and new.state='failed' and new.usage is not null
"""
assert oldguard.count(before)==1;newguard=oldguard.replace(before,after);assert oldop.count(h(oldguard))==1;newop=oldop.replace(h(oldguard),h(newguard));assert oldfull.count(h(oldop))==1;newfull=oldfull.replace(h(oldop),h(newop))
entries=[('private.ifo_attempt_guard()',oldguard,newguard,guard_stmt,g_tag),('private.initial_feedback_operation_ready()',oldop,newop,op_stmt,o_tag),('private.initial_feedback_ready()',oldfull,newfull,full_stmt,r_tag)]
pre=[{'signature':sig,'sha256':h(old)} for sig,old,new,stmt,tag in entries];post=[{'signature':sig,'sha256':h(new)} for sig,old,new,stmt,tag in entries]
s="""-- A13 late-known accounting correction. SOURCE ONLY; SQL UNPARSED/UNEXECUTED.
-- This does NOT implement ADR0020 expiry, retirement/counter disposition,
-- erasure, shared-worker adoption or new grants. Frozen9ffc/6bc/63dd stay intact.
begin;
set local statement_timeout='10s';
set local lock_timeout='1s';
set local idle_in_transaction_session_timeout='15s';
set local search_path='';
do $late_pre$
declare item jsonb;
begin
 for item in select value from jsonb_array_elements($late_preimages$"""+json.dumps(pre,separators=(',',':'))+"""$late_preimages$::jsonb) loop
  if (select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature')) is distinct from item->>'sha256' then
   raise exception 'INITIAL_FEEDBACK_LATE_PREIMAGE_DRIFT' using errcode='23514';end if;
 end loop;
 if private.initial_feedback_ready() is not true then raise exception 'INITIAL_FEEDBACK_LATE_PREDECESSOR_UNAVAILABLE' using errcode='23514';end if;
 if has_function_privilege('service_role','public.prepare_initial_feedback(uuid,jsonb,jsonb,uuid)','EXECUTE')
  or has_function_privilege('service_role','public.claim_initial_feedback_dispatch(uuid,jsonb,uuid,uuid,text,jsonb)','EXECUTE')
  or has_function_privilege('service_role','public.settle_initial_feedback_attempt(uuid,uuid,text,jsonb,text)','EXECUTE') then
  raise exception 'INITIAL_FEEDBACK_LATE_DATA_ACTIVATED' using errcode='23514';end if;
end;
$late_pre$;
"""
for sig,old,new,stmt,tag in entries:
 stmt=stmt.replace('create function','create or replace function',1).replace(tag+old+tag,tag+new+tag);s+='\n'+stmt+'\n'
for sig,*_ in entries:s+='revoke all on function '+sig+' from public,anon,authenticated,service_role;\n'
s+="""do $late_post$
declare item jsonb;
begin
 for item in select value from jsonb_array_elements($late_postimages$"""+json.dumps(post,separators=(',',':'))+"""$late_postimages$::jsonb) loop
  if (select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature')) is distinct from item->>'sha256' then
   raise exception 'INITIAL_FEEDBACK_LATE_POSTIMAGE_DRIFT' using errcode='23514';end if;
  if has_function_privilege('service_role',to_regprocedure(item->>'signature'),'EXECUTE') then
   raise exception 'INITIAL_FEEDBACK_LATE_PRIVATE_ACTIVATED' using errcode='23514';end if;
 end loop;
 if private.initial_feedback_ready() is not true then raise exception 'INITIAL_FEEDBACK_LATE_SOURCE_NOT_READY' using errcode='23514';end if;
end;
$late_post$;
-- Existing data grants remain denied; metadata grants and every other body/ABI
-- are unchanged. Actual role/cascade/lock/CHECK/expiry acceptance stays open.
commit;
"""
target.write_text(s)
for filename,old,new in [('initial-feedback-operation-profile.ts',h(oldop),h(newop)),('initial-feedback-profile.ts',h(oldfull),h(newfull))]:
 p=w/'app/lib/server'/filename;t=p.read_text();assert t.count(old)==1;p.write_text(t.replace(old,new))
(packet/'body-delta.json').write_text(json.dumps({'preimages':pre,'postimages':post,'beforeFragment':before,'afterFragment':after,'pubProfileUnchanged':hashlib.sha256((w/'app/lib/server/initial-feedback-publication-profile.ts').read_bytes()).hexdigest(),'migrationSha256':h(s)},indent=2)+'\n')
print(json.dumps({'preimages':pre,'postimages':post,'migrationSha256':h(s)},indent=2))
