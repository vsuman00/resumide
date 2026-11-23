from pathlib import Path
import re,json,hashlib
w=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats');p=w/'supabase/migrations/20261115081345_initial_feedback_publications.sql';old=(w/'supabase/migrations/20261115072701_initial_feedback_operations.sql').read_text();s=p.read_text().split('-- GENERATED PUBLICATION CLOSURE')[0]
def h(x):return hashlib.sha256(x.encode()).hexdigest()
def funcs(txt):
 out={}
 pattern=r'create(?: or replace)? function ([\w.]+)\(([^;]*?)\)\s*returns ([\w.]+)[\s\S]*?\bas\s+(\$[a-zA-Z0-9_]*\$)([\s\S]*?)\4;'
 for m in re.finditer(pattern,txt,re.I):
  args=m[2];types=[]
  if args.strip():
   for a in args.split(','):
    parts=a.strip().split();types.append(parts[1] if len(parts)>1 else parts[0])
  sig=m[1]+'('+','.join(types)+')';head=m[0].split(m[4])[0]
  out[sig]={'signature':sig,'sha256':h(m[5]),'language':'sql' if re.search(r'language sql\b',head) else 'plpgsql','definer':'security definer' in head,
   'volatility':'s' if re.search(r'\bstable\b',head) else 'i' if re.search(r'\bimmutable\b',head) else 'v','strict':False,'resultType':m[3],
   'acl':'metadata' if 'readiness(' in sig and sig.startswith('public.') else 'optional_service' if sig.startswith('public.') else 'private','body':m[5],'statement':m[0]}
 return out
oldf=funcs(old);newf=funcs(s)
checker=oldf['private.initial_feedback_operation_ready()']['statement'].replace('create function','create or replace function',1)
def tagged(text,tag):return json.loads(text.split('$'+tag+'$')[1])
def replace_tag(text,tag,value):
 parts=text.split('$'+tag+'$');parts[1]=json.dumps(value,separators=(',',':'));return ('$'+tag+'$').join(parts)
manifest=tagged(checker,'ifo_catalog'); by={x['signature']:x for x in manifest}
for sig,x in newf.items():by[sig]={k:v for k,v in x.items() if k not in ('body','statement')}
# Pin the actual unchanged factories and retained-output renderer used by finish.
producer=(w/'supabase/migrations/20260910110000_version_skill_taxonomy.sql').read_text()
root=Path('/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats')
for sig,x in funcs(producer).items():
 if sig.startswith(('public.persist_qualitative_analysis(','public.persist_partial_analysis(')):x['acl']='optional_service';by[sig]={k:v for k,v in x.items() if k not in ('body','statement')}
for sig,x in funcs((root/'supabase/migrations/20261115054612_initial_feedback_plan.sql').read_text()).items():
 if sig=='private.render_initial_feedback_plan(text,jsonb)':by[sig]={k:v for k,v in x.items() if k not in ('body','statement')}
checker=replace_tag(checker,'ifo_catalog',list(by.values()))
columns=tagged(checker,'ifo_columns')
names=['id','operation_id','attempt_id','analysis_id','owner_id','organization_id','resume_id','resume_version_id','run_id','state','reason','binding_sha256','completion','completion_sha256','publication_core','publication_sha256','receipt','render','plan_sha256','render_sha256','support_sha256','capture_sha256','result_content_sha256','writer_content_sha256','run_content_sha256','finish_lease','process_id','request_id','created_at']
uuid=set(names[:9]);jb={'completion','publication_core','receipt','render','finish_lease'};nullable={'attempt_id','run_id','reason','render','plan_sha256','render_sha256','support_sha256','capture_sha256','run_content_sha256'}
columns['initial_feedback_publications']=[[n,'uuid' if n in uuid else 'jsonb' if n in jb else 'timestamp with time zone' if n=='created_at' else 'text',n not in nullable] for n in names]
checker=replace_tag(checker,'ifo_columns',columns)
keys=tagged(checker,'ifo_keys');keys += [{'table':'private.initial_feedback_publications','kind':'p' if n=='id' else 'u','columns':[n]} for n in ['id','operation_id','attempt_id','analysis_id','run_id']];checker=replace_tag(checker,'ifo_keys',keys)
fks=tagged(checker,'ifo_fks')
for f in fks:f['delete']='r'
for col,target,tcol,delete in [('operation_id','private.initial_feedback_operations','operation_id','r'),('attempt_id','private.initial_feedback_attempts','attempt_id','r'),('analysis_id','public.analyses','id','c'),('owner_id','auth.users','id','c'),('organization_id','public.organizations','id','c'),('resume_id','public.resumes','id','c'),('resume_version_id','public.resume_versions','id','c'),('run_id','public.analysis_ai_runs','id','c'),('analysis_id','private.analysis_scoring_inputs','analysis_id','c')]:
 fks.append({'table':'private.initial_feedback_publications','columns':[col],'target':target,'targetColumns':[tcol],'delete':delete})
checker=replace_tag(checker,'ifo_fks',fks).replace("c.confdeltype='r'","c.confdeltype=item->>'delete'")
checker=checker.replace("'private.initial_feedback_attempts'::regclass) and contype='f')<>6", "'private.initial_feedback_attempts'::regclass,'private.initial_feedback_publications'::regclass) and contype='f')<>15")
triggers=tagged(checker,'ifo_triggers')
for t in triggers:t['type']=31
triggers.append({'table':'private.initial_feedback_publications','name':'initial_feedback_publication_immutable','function':'private.ifpub_immutable()','type':19})
checker=replace_tag(checker,'ifo_triggers',triggers).replace("tgtype=31 and tgnargs=0","tgtype=(item->>'type')::integer and tgnargs=0")
checker=checker.replace("if current_setting('server_encoding')", "if to_regprocedure('extensions.jsonb_matches_schema(json,jsonb)') is null then return false;end if;\n  if current_setting('server_encoding')",1)
checker=checker.replace("  return true;\nexception when others then return false;", """  -- Preserve BOTH unchanged legacy score-store guards used by the factories.
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.analysis_ai_runs'::regclass and tgname='document_evidence_no_qualitative_score'
    and not tgisinternal and tgenabled='O' and tgfoid=to_regprocedure('private.block_unreviewed_evidence_scores()') and tgtype=23 and tgnargs=0 and tgqual is null)
    or not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.analysis_results'::regclass and tgname='document_evidence_no_result'
    and not tgisinternal and tgenabled='O' and tgfoid=to_regprocedure('private.block_unreviewed_evidence_scores()') and tgtype=23 and tgnargs=0 and tgqual is null) then return false;end if;
  return true;
exception when others then return false;""")
s+='\n-- GENERATED PUBLICATION CLOSURE: actual prosrc source postimages, not runtime evidence.\n'+checker+'\n'
allf=funcs(s);denied=[sig for sig in allf if sig!='public.read_initial_feedback_publication_readiness()']
for sig in allf:s+='revoke all on function '+sig+' from public,anon,authenticated,service_role;\n'
s+='grant execute on function public.read_initial_feedback_publication_readiness() to service_role;\n'
# Existing foundation metadata grant/body is retained, not reactivated data access.
post={sig:x['sha256'] for sig,x in allf.items()}
s+="do $ifpub_post$\ndeclare item jsonb;\nbegin\n for item in select value from jsonb_array_elements($ifpub_postimages$"+json.dumps([{'signature':sig,'sha256':sha} for sig,sha in post.items()],separators=(',',':'))+"$ifpub_postimages$::jsonb) loop\n  if (select private.ifo_sha(prosrc) from pg_catalog.pg_proc where oid=to_regprocedure(item->>'signature')) is distinct from item->>'sha256' then\n   raise exception 'INITIAL_FEEDBACK_PUBLICATION_POSTIMAGE_DRIFT' using errcode='23514';end if;\n end loop;\n if private.initial_feedback_publication_ready() is not true then raise exception 'INITIAL_FEEDBACK_PUBLICATION_NOT_READY' using errcode='23514';end if;\n"
for sig in [x for x in allf if x.startswith('public.') and 'readiness' not in x]:
 s+=" if has_function_privilege('service_role','"+sig+"','EXECUTE') then raise exception 'INITIAL_FEEDBACK_PUBLICATION_DATA_ACTIVATED' using errcode='23514';end if;\n"
s+="end;\n$ifpub_post$;\n-- DIAGNOSTIC SOURCE ONLY: CHECK/default reconciliation, full shared usage,\n-- account erasure/retention and activation remain mandatory external holds.\ncommit;\n"
p.write_text(s)
def profile(path,name,versions,entries):
 v=dict(versions);v.update({k:allf[sig]['sha256'] if sig in allf else oldf[sig]['sha256'] for k,sig in entries.items()})
 text='// Actual source postimages only. Data calls stay denied; no runtime adoption proof.\nexport const '+name+' = Object.freeze('+json.dumps(v,indent=2)+');\n'
 (w/path).write_text(text);return v
pub=profile('app/lib/server/initial-feedback-publication-profile.ts','INITIAL_FEEDBACK_PUBLICATION_PROFILE',{'schemaVersion':'initial-feedback-publication-readiness/1.0.0','profileVersion':'initial-feedback-publication-profile/1.0.0'},
 {'checkerSha256':'private.initial_feedback_publication_ready()','readerSha256':'public.read_initial_feedback(uuid,uuid)','finishSha256':'public.finish_initial_feedback(uuid,jsonb,uuid,uuid,text,jsonb,text,text)','exportSha256':'public.export_initial_feedback_records(uuid)','metadataSha256':'public.read_initial_feedback_publication_readiness()'})
op=profile('app/lib/server/initial-feedback-operation-profile.ts','INITIAL_FEEDBACK_OPERATION_PROFILE',{'schemaVersion':'initial-feedback-operation-readiness/1.0.0','profileVersion':'initial-feedback-operation-profile/1.0.0'},
 {'checkerSha256':'private.initial_feedback_operation_ready()','prepareSha256':'public.prepare_initial_feedback(uuid,jsonb,jsonb,uuid)','claimSha256':'public.claim_initial_feedback_dispatch(uuid,jsonb,uuid,uuid,text,jsonb)','settleSha256':'public.settle_initial_feedback_attempt(uuid,uuid,text,jsonb,text)','metadataSha256':'public.read_initial_feedback_operation_readiness()'})
packet=Path('/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a13-publications-035socqv')
(packet/'source-postimages.json').write_text(json.dumps({'migrationSha256':h(s),'publicationProfile':pub,'operationProfile':op,'routines':post,'manifest':list(by.values()),'columns':columns['initial_feedback_publications']},indent=2)+'\n')
print(json.dumps({'migrationSha256':h(s),'routines':len(post),'manifest':len(by),'publicationProfile':pub,'operationProfile':op},indent=2))
