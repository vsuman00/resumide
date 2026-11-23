from pathlib import Path
import re,json,hashlib
root=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats');tmp=Path(__file__).parent
sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
def read(n):return (root/'supabase/migrations'/n).read_text()
def body(s,n):
 m=re.search(r'create(?: or replace)? function '+re.escape(n)+r'\([^;]*?\bas\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1;',s)
 assert m,n
 return m[2]
def literal(s,n):
 m=re.search(r'\$'+re.escape(n)+r'\$([\s\S]*?)\$'+re.escape(n)+r'\$',s);assert m,n
 return m[1]
def replace(s,a,b,count=1):assert s.count(a)==count,(a[:100],s.count(a));return s.replace(a,b)
old={}
for n,f in {
'private.candidate_write_blocked':'20261110085512_privacy_write_barrier.sql',
'private.serialize_deletion_request':'20261110085512_privacy_write_barrier.sql',
'public.prepare_deletion_request':'20261115100607_owned_ai_retirement.sql',
'public.claim_expired_resume_objects':'20260911130000_durable_privacy_deletion_plan.sql',
'private.legacy_scoring_ready':'20261115064102_stored_scoring_source_access.sql',
'private.initial_feedback_operation_ready':'20261115095258_initial_feedback_late_settlement.sql',
'private.owned_ai_retirement_ready':'20261115100607_owned_ai_retirement.sql',
'private.initial_feedback_ready':'20261115100607_owned_ai_retirement.sql',
'private.ifo_policy_valid':'20261115072701_initial_feedback_operations.sql',
'private.ifo_selected_policy':'20261115072701_initial_feedback_operations.sql',
'private.canonical_rewrite_workspace_ready':'20261115042554_canonical_rewrite_workspace.sql',
}.items():old[n]=body(read(f),n)
# Delimited source text + JSON patch data only; no SQL grammar parsing/runtime.
b=body(read('20261113131538_grouped_original_admission.sql'),'private.canonical_correction_write_ready')
s=read('20261113142537_grouped_original_workspace_read.sql');b=replace(b,literal(s,'a02_old_manifest'),literal(s,'a02_new_manifest'))
s=read('20261113155247_entry_regroup_ledger_foundation.sql')
for p in json.loads(literal(s,'regroup_profile_patches')):b=replace(b,p['old'],p['new'])
s=read('20261113180050_entry_regroup_atomic_admission.sql');b=replace(b,literal(s,'erg_old_catalog'),literal(s,'erg_new_catalog'))
s=read('20261114104337_requirement_relationship_context.sql');b=replace(b,literal(s,'rr_old_catalog'),literal(s,'rr_new_catalog'))
s=read('20261114170229_typed_authoring_readiness.sql')
for item in json.loads(literal(s,'typed_patches')):
 if item['signature']=='private.canonical_correction_write_ready()':
  assert sha(b)==item['sha256']
  for p in item['patches']:b=replace(b,p['old'],p['new'])
  assert sha(b)==item['newSha256']
assert sha(b)=='0c8ab4602856e82dd316d083529383a64ef1e3118a3c27641a86de5430b79428';old['private.canonical_correction_write_ready']=b
b=body(s,'private.typed_authoring_write_ready');s=read('20261114174039_typed_authoring_declaration.sql')
for item in json.loads(literal(s,'ta_declaration_patches')):
 if item['signature']=='private.typed_authoring_write_ready()':
  assert sha(b)==item['sha256']
  for p in item['patches']:b=replace(b,p['old'],p['new'])
  assert sha(b)==item['newSha256']
assert sha(b)=='fdb7b1a51ac23303ca5c55a741e2818ca669e7795394ca4d012f1e150266ca08';old['private.typed_authoring_write_ready']=b
b=body(read('20261114181344_canonical_rewrite_operations.sql'),'private.canonical_rewrite_ready')
for item in json.loads(literal(read('20261114192207_canonical_rewrite_compatibility.sql'),'patches')):
 if item['signature']=='private.canonical_rewrite_ready()':
  assert sha(b)==item['before']
  for p in item['changes']:b=replace(b,p['old'],p['new'],p['count'])
  assert sha(b)==item['after']
assert sha(b)=='e98f6ec0de0a09ec002a85d97d007cb71a49c261bbcba746d82c688a7281251b';old['private.canonical_rewrite_ready']=b
new={}
new['private.candidate_write_blocked']=replace(old['private.candidate_write_blocked'],'select p_owner_id is null or exists','select p_owner_id is null or exists(select 1 from private.owned_ai_deletion_dispositions p where p.owner_id=p_owner_id) or exists')
new['private.serialize_deletion_request']=replace(old['private.serialize_deletion_request'],"      raise exception 'PRIVACY_OWNER_BUSY' using errcode='55P03'; end if;", "      raise exception 'PRIVACY_OWNER_BUSY' using errcode='55P03'; end if;\n    -- Separate command after owner acquisition observes a committed preparation.\n    if tg_op='UPDATE' and new.status='cancelled' and exists(select 1 from private.owned_ai_deletion_dispositions p where p.owner_id=new.user_id) then\n      raise exception 'PRIVACY_DELETION_PREPARED' using errcode='42501';end if;")
b=old['public.prepare_deletion_request'];b=replace(b,'  storage_objects jsonb;','  storage_objects jsonb;\n  first_at timestamptz;')
b=replace(b,"  select plan.storage_objects into storage_objects", "  if not private.try_lock_candidate_owners(array[request_row.user_id]) then raise exception 'PRIVACY_OWNER_BUSY' using errcode='55P03';end if;\n  select plan.storage_objects,plan.created_at into storage_objects,first_at")
b=replace(b,"    insert into private.privacy_deletion_plans (request_id, storage_objects)\n    values (request_row.id, storage_objects);", "    if not exists(select 1 from private.owned_ai_deletion_dispositions where owner_id=request_row.user_id)\n      and exists(select 1 from public.data_requests d join public.privacy_request_steps s on s.request_id=d.id\n        where d.user_id=request_row.user_id and d.kind='deletion' and s.step_key='database' and s.status='completed')\n      then raise exception 'OWNED_AI_DISPOSITION_HISTORICAL_REPAIR' using errcode='23514';end if;\n    first_at:=clock_timestamp();\n    insert into private.privacy_deletion_plans (request_id, storage_objects,created_at)\n    values (request_row.id, storage_objects,first_at);")
b=replace(b,'  perform private.retire_initial_feedback_publications(request_row.user_id,null,request_row.id,null);', "  insert into private.owned_ai_deletion_dispositions(owner_id,first_request_id,prepared_at,expires_at,phase)\n    values(request_row.user_id,request_row.id,first_at,first_at+interval '720 hours','prepared') on conflict(owner_id) do nothing;\n  perform private.capture_owned_ai_operation_dispositions(request_row.user_id,null,request_row.id,null);\n  perform private.retire_initial_feedback_publications(request_row.user_id,null,request_row.id,null);")
new['public.prepare_deletion_request']=b
b="""
declare candidate record;claimed private.retention_items%rowtype;
begin
 if p_limit is null or p_limit<1 or p_limit>1000 or p_before is null or not isfinite(p_before) then
  raise exception 'invalid retention batch size' using errcode='22023';end if;
 for candidate in
  select rv.resume_id,rv.owner_id,rv.storage_key from public.resume_versions rv join public.resumes r on r.id=rv.resume_id
  where ((r.status='active' and r.created_at<p_before) or (r.status='deleted' and exists(
    select 1 from private.retention_items t where t.resume_id=r.id and t.status='failed')))
   and not exists(select 1 from private.retention_items t where t.storage_key=rv.storage_key and t.status='deleted')
  order by r.created_at,rv.id limit p_limit for update of rv,r skip locked loop
  -- Source rows may already be locked: owner acquisition must never wait.
  if not private.try_lock_candidate_owners(array[candidate.owner_id]) then raise exception 'PRIVACY_OWNER_BUSY' using errcode='55P03';end if;
  insert into private.retention_items as t(resume_id,owner_id,storage_key,status,attempt_count,created_at)
   values(candidate.resume_id,candidate.owner_id,candidate.storage_key,'queued',1,clock_timestamp())
   on conflict on constraint retention_items_storage_key_key do update
    set status='queued',attempt_count=t.attempt_count+1,last_error_code=null returning * into claimed;
  -- Separate commands observe the inserted item. First version claim captures ALL root versions/operations.
  perform private.capture_owned_ai_operation_dispositions(candidate.owner_id,candidate.resume_id,null,claimed.id);
  update public.resumes r set status='deleted',updated_at=timezone('utc',now()) where r.id=candidate.resume_id;
  item_id:=claimed.id;resume_id:=claimed.resume_id;storage_key:=claimed.storage_key;return next;
 end loop;
end;
"""
new['public.claim_expired_resume_objects']=b
# Renew runtime readiness separately from exact historical policy descriptors.
new['private.legacy_scoring_ready']=replace(old['private.legacy_scoring_ready'],sha(old['private.candidate_write_blocked']),sha(new['private.candidate_write_blocked']))
b=old['private.canonical_correction_write_ready']
for n in ['private.candidate_write_blocked','private.serialize_deletion_request']:
 if sha(old[n]) in b:b=replace(b,sha(old[n]),sha(new[n]))
new['private.canonical_correction_write_ready']=b
new['private.typed_authoring_write_ready']=replace(old['private.typed_authoring_write_ready'],sha(old['private.canonical_correction_write_ready']),sha(new['private.canonical_correction_write_ready']))
new['private.canonical_rewrite_ready']=replace(old['private.canonical_rewrite_ready'],sha(old['private.typed_authoring_write_ready']),sha(new['private.typed_authoring_write_ready']))
new['private.canonical_rewrite_workspace_ready']=replace(old['private.canonical_rewrite_workspace_ready'],sha(old['private.canonical_rewrite_ready']),sha(new['private.canonical_rewrite_ready']))
b=old['private.ifo_policy_valid'];old_profile=json.loads((tmp/'historical-profile.json').read_text());current_profile={**old_profile,'checkerSha256':sha(new['private.legacy_scoring_ready'])}
a="or p_policy->'scoringInputProfile' is distinct from $scoring$";start=b.index(a);end=b.index('$scoring$::jsonb',start)+len('$scoring$::jsonb');historical=b[start+len(a):end-len('$scoring$::jsonb')]
b=b[:start]+"or (p_policy->'scoringInputProfile' is distinct from $scoring$"+historical+"$scoring$::jsonb\n      and p_policy->'scoringInputProfile' is distinct from $current_scoring$"+json.dumps(current_profile,separators=(',',':'))+"$current_scoring$::jsonb)"+b[end:]
new['private.ifo_policy_valid']=b
b=old['private.ifo_selected_policy'];needle='  return pol;';assert needle in b
b=replace(b,needle,"  if pol->'scoringInputProfile' is distinct from $current_scoring$"+json.dumps(current_profile,separators=(',',':'))+"$current_scoring$::jsonb then perform private.ifo_fail('unavailable');end if;\n"+needle)
new['private.ifo_selected_policy']=b
b=old['private.initial_feedback_operation_ready']
for n in ['private.legacy_scoring_ready','private.ifo_policy_valid','private.ifo_selected_policy']:
 b=replace(b,sha(old[n]),sha(new[n]))
new['private.initial_feedback_operation_ready']=b
new['private.owned_ai_retirement_ready']=replace(old['private.owned_ai_retirement_ready'],sha(old['public.prepare_deletion_request']),sha(new['public.prepare_deletion_request']))
b=old['private.initial_feedback_ready']
for n in ['private.initial_feedback_operation_ready','private.canonical_rewrite_ready','private.owned_ai_retirement_ready']:b=replace(b,sha(old[n]),sha(new[n]))
new['private.initial_feedback_ready']=b
(tmp/'old-bodies.json').write_text(json.dumps(old,indent=2)+'\n');(tmp/'new-bodies.json').write_text(json.dumps(new,indent=2)+'\n');(tmp/'current-scoring-profile.json').write_text(json.dumps(current_profile,indent=2)+'\n')
# Prechecked, fixed migration-time textual transformations retain routine properties/ACLs.
sig={'private.candidate_write_blocked':'uuid','private.serialize_deletion_request':'','public.prepare_deletion_request':'uuid,text','public.claim_expired_resume_objects':'timestamp with time zone,integer','private.ifo_policy_valid':'jsonb','private.ifo_selected_policy':'uuid,jsonb'}
patches=[]
for n in new:
 signature=n+'('+sig.get(n,'')+')'
 patches.append({'signature':signature,'before':sha(old[n]),'after':sha(new[n]),'old':old[n],'new':new[n],'setof':n=='public.claim_expired_resume_objects'})
patch_sql="""
-- Guard every terminal preimage and exact postimage before changing any body.
do $disposition_forward$
declare item jsonb;p pg_catalog.pg_proc%rowtype;source text;statements text[]:=array[]::text[];ddl text;
 manifest jsonb:=$disposition_patches$PATCHES$disposition_patches$::jsonb;
begin
 for item in select value from jsonb_array_elements(manifest) loop
  select * into p from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature');
  if not found or p.prokind<>'f' or p.proretset is distinct from (item->>'setof')::boolean or p.proisstrict or p.proconfig is distinct from array['search_path=""']
    or private.ifo_sha(p.prosrc)<>item->>'before' or p.prosrc is distinct from item->>'old'
    or private.ifo_sha(item->>'new')<>item->>'after' then raise exception 'OWNED_AI_DISPOSITION_PREIMAGE_DRIFT' using errcode='23514';end if;
  source:=pg_get_functiondef(p.oid);
  if (length(source)-length(replace(source,p.prosrc,'')))/length(p.prosrc)<>1 then raise exception 'OWNED_AI_DISPOSITION_DEFINITION_DRIFT' using errcode='23514';end if;
  statements:=array_append(statements,replace(source,p.prosrc,item->>'new'));
 end loop;
 foreach ddl in array statements loop execute ddl;end loop;
 for item in select value from jsonb_array_elements(manifest) loop
  if (select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature')) is distinct from item->>'after'
   then raise exception 'OWNED_AI_DISPOSITION_POSTIMAGE_DRIFT' using errcode='23514';end if;
 end loop;
end;
$disposition_forward$;
""".replace('PATCHES',json.dumps(patches,separators=(',',':')))
(tmp/'forward-patches.sql').write_text(patch_sql)
print('composed terminal bodies',len(patches))
