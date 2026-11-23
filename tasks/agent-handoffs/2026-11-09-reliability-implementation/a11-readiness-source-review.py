from pathlib import Path
import hashlib,json,re
root=Path('/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats')
wt=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-runtime/resume_ats')
b=root/'tasks/agent-handoffs/2026-11-09-reliability-implementation'
def sha(s):return hashlib.sha256(s.encode()).hexdigest()
def source(n):return (root/'supabase/migrations'/n).read_text()
def tag(s,t):
 a=s.split('$'+t+'$');assert len(a)==3,(t,len(a));return a[1]
def body(s,n):
 m=re.search(r'create(?: or replace)? function '+re.escape(n)+r'\([^\n]*\).*?\bas (\$[A-Za-z0-9_]*\$)(.*?)\1',s,re.S|re.I)
 assert m,n
 return m[2]
def change(s,a,z):
 assert s.count(a)==1,(a[:50],s.count(a))
 return s.replace(a,z)
legacy=body(source('20261012160703_candidate_authoring_transactions.sql'),'public.apply_authoring_action')
assert sha(legacy)=='07a6dbe31d28b3689456beb3c7b4a9fc7394018e37824fdd79e2417c8c7772a6'
for n in ['20261110085512_privacy_write_barrier.sql','20261110113245_canonical_correction_materialization.sql']:
 s=source(n)
 if n.endswith('materialization.sql'):s=s[s.index('do $producer_patch$'):]
 item=next(t for t in json.loads(tag(s,'manifest')) if t['signature'].startswith('public.apply_authoring_action('))
 assert sha(legacy)==item['sha256']
 for p in item['patches']:
  assert p.get('count',1)==1
  legacy=change(legacy,p['old'],p['new'])
assert sha(legacy)=='b25b9b1fd9459834afd59c0b48fe5f65e2143e3640818ded15fa227c2b8170c2'
canonical=tag(source('20261113131538_grouped_original_admission.sql'),'a02_ready')
for n,old,new in [('20261113142537_grouped_original_workspace_read.sql','a02_old_manifest','a02_new_manifest'),('20261113155247_entry_regroup_ledger_foundation.sql',None,None),('20261113180050_entry_regroup_atomic_admission.sql','erg_old_catalog','erg_new_catalog'),('20261114104337_requirement_relationship_context.sql','rr_old_catalog','rr_new_catalog')]:
 s=source(n)
 if old:canonical=change(canonical,tag(s,old),tag(s,new))
 else:
  for p in json.loads(tag(s,'regroup_profile_patches')):canonical=change(canonical,p['old'],p['new'])
assert sha(canonical)=='f88516e99f6ee34120dc66217eea3191486ff0083d9053615e14cd925cdec999'
typed=source('20261114143053_typed_authoring_transactions.sql')
writer=body(typed,'public.apply_typed_authoring_action')
migration=(wt/'supabase/migrations/20261114170229_typed_authoring_readiness.sql').read_text()
patches=json.loads(tag(migration,'typed_patches')); assert len(patches)==3
sources=[legacy,canonical,writer]; successors=[]
for s,item in zip(sources,patches):
 assert sha(s)==item['sha256']
 for p in item['patches']:s=change(s,p['old'],p['new'])
 assert sha(s)==item['newSha256']
 successors.append(s)
newlegacy,newcanonical,newwriter=successors
assert newcanonical==change(canonical,sha(legacy),sha(newlegacy))
oldcatalog=json.loads(tag(canonical,'catalog_manifest'));newcatalog=json.loads(tag(newcanonical,'catalog_manifest'))
assert len(oldcatalog)==len(newcatalog)==138
changed=[i for i,(a,z) in enumerate(zip(oldcatalog,newcatalog)) if a!=z]
assert len(changed)==1
k=changed[0];assert newcatalog[k]==dict(oldcatalog[k],sha256=sha(newlegacy))
reader=body(migration,'public.read_typed_authoring_readiness');checker=body(migration,'private.typed_authoring_write_ready')
profiletext=(wt/'app/lib/server/typed-authoring-readiness-profile.ts').read_text()
pins=dict(re.findall(r'(canonicalReadinessSha256|typedReadinessSha256|writerSha256|readerSha256):\s*"([a-f0-9]{64})"',profiletext))
assert pins==dict(zip(['canonicalReadinessSha256','typedReadinessSha256','writerSha256','readerSha256'],map(sha,[newcanonical,checker,newwriter,reader])))
catalog=json.loads(tag(checker,'typed_catalog'));assert len(catalog)==10
for item in catalog:
 name=item['signature'].split('(')[0]
 actual=newwriter if name=='public.apply_typed_authoring_action' else reader if name=='public.read_typed_authoring_readiness' else body(typed,name)
 assert sha(actual)==item['sha256']
assert newlegacy.index("return prior.result||jsonb_build_object('idempotent',true)")<newlegacy.index("-- Fresh legacy proposals")<newlegacy.index('select v.* into head')
assert newlegacy.index('private.lock_candidate_owners')<newlegacy.index('prior.command')
assert "current_job.owner_id=p_user_id and current_job.organization_id=a.organization_id for share" in newlegacy
assert "current_requirements.content->>'schemaVersion' is distinct from 'requirements/1.0.0'" in newlegacy
assert newwriter.index("return prior.result||jsonb_build_object('idempotent',true)")<newwriter.index('if private.typed_authoring_write_ready()')<newwriter.index('select * into current_head')
assert 'grant execute on function public.apply_typed_authoring_action' not in migration.lower()
assert "'writerExecutable',coalesce(has_function_privilege('service_role',writer_oid,'EXECUTE'),false)" in reader
r={'status':'PASS_TEXTUAL_SOURCE_REVIEW_ONLY','reviewer':'root','sqlParsing':'NOT_RUN','sqlExecution':'NOT_RUN','databaseOperations':0,'baseManifestCount':138,'baseManifestChangedEntries':1,'typedManifestCount':10,'predecessorHashes':list(map(sha,sources)),'successorHashes':list(map(sha,successors)),'profilePins':pins,'migrationSha256':sha(migration),'profileFileSha256':sha(profiletext),'checked':['Reconstructed frozen historical prosrc through exact unique textual patches','Three guarded predecessor/postimage chains; unchanged base138 except one legacy SHA','Four actual source body pins and10 finite typed manifest bodies','Owned prior replay precedes fresh legacy denial and new readiness; manual branch preserved','Actual current job owner/org proof in fresh legacy decision branch','Service metadata separates effective writer EXECUTE; no writer grant introduced'],'limits':['Text extraction is not a SQL parser or native execution','Catalog, ACL, migration and transaction behavior require separately admitted direct Supabase validation']}
(b/'a11-readiness-native-source-review.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps(r,indent=2))
