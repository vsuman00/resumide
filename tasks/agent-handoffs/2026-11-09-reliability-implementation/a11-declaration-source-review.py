from pathlib import Path
import re,json,hashlib
root=Path('/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats');wt=Path('/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-runtime/resume_ats');base=root/'tasks/agent-handoffs/2026-11-09-reliability-implementation'
sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
def body(s,n):
 m=re.search(r'create(?: or replace)? function '+re.escape(n)+r'\([^\n]*\).*?\bas (\$[A-Za-z0-9_]*\$)(.*?)\1',s,re.S|re.I);assert m,n;return m[2]
def tag(s,n):
 a=s.split('$'+n+'$');assert len(a)==3,(n,len(a));return a[1]
def apply(s,item):
 assert sha(s)==item['sha256']
 for p in item['patches']:
  assert s.count(p['old'])==1,(p['old'][:40],s.count(p['old']))
  s=s.replace(p['old'],p['new'])
 assert sha(s)==item['newSha256'];return s
old=(root/'supabase/migrations/20261114143053_typed_authoring_transactions.sql').read_text();ready=(root/'supabase/migrations/20261114170229_typed_authoring_readiness.sql').read_text();new=(wt/'supabase/migrations/20261114174039_typed_authoring_declaration.sql').read_text()
patches=json.loads(tag(new,'ta_declaration_patches'));assert len(patches)==3
writer=body(old,'public.apply_typed_authoring_action');p=next(p for p in json.loads(tag(ready,'typed_patches')) if p['signature'].startswith('public.apply_typed_authoring_action('));writer=apply(writer,p)
checker=body(ready,'private.typed_authoring_write_ready');reader=body(ready,'public.read_typed_authoring_readiness')
pre=[writer,checker,reader];post=[apply(s,p) for s,p in zip(pre,patches)]
writer2,checker2,reader2=post
oldmanifest=json.loads(tag(checker,'typed_catalog'));manifest=json.loads(tag(checker2,'typed_catalog'));assert len(oldmanifest)==10 and len(manifest)==13
oldmap={a['signature']:a for a in oldmanifest};newmap={a['signature']:a for a in manifest}
assert set(oldmap)<=set(newmap)
assert len([n for n in oldmap if oldmap[n]!=newmap[n]])==2
assert 'private.canonical_correction_write_ready()' not in {p['signature'] for p in patches}
for a in manifest:
 name=a['signature'].split('(')[0]
 value=writer2 if name=='public.apply_typed_authoring_action' else reader2 if name=='public.read_typed_authoring_readiness' else body(new,name) if name in ['private.typed_authoring_validate_v1_1','private.typed_authoring_atoms_v1_1','private.typed_authoring_declaration_support'] else body(old,name)
 assert sha(value)==a['sha256'],name
oldvalidate=body(old,'private.typed_authoring_validate');newvalidate=body(new,'private.typed_authoring_validate_v1_1')
policies=json.loads(tag(newvalidate,'policies'));actual=json.loads(Path('/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a11-declaration-backend-uxxp9bys/policy-actual.json').read_text());assert policies==actual['policies']
oldpolicies=tag(oldvalidate,'policies');expected=oldvalidate.replace(oldpolicies,tag(newvalidate,'policies')).replace('typed-authoring-command/1.0.0','typed-authoring-command/1.1.0').replace("jsonb_array_length(p_command->'sourceCitations')>20","jsonb_array_length(p_command->'sourceCitations')<>0");assert expected==newvalidate
assert body(new,'private.typed_authoring_atoms_v1_1')==body(old,'private.typed_authoring_atoms').replace('private.typed_authoring_validate(p_command)','private.typed_authoring_validate_v1_1(p_command)')
# Original source-proof, helper and framing bodies remain in the original file.
assert writer2.index('private.typed_authoring_validate_v1_1(p_command)')<writer2.index('command_sha:=')<writer2.index('select * into prior')
assert writer2.index("return prior.result||jsonb_build_object('idempotent',true)")<writer2.index('if private.typed_authoring_write_ready()')<writer2.index('select * into current_head')<writer2.index('private.typed_authoring_declaration_support(context,fact')
citepatch=patches[0]['patches'][2];assert citepatch['old'] in citepatch['new'];assert "fact->'sources' is distinct from '[]'::jsonb" in citepatch['new'];assert "p_command->'sourceCitations' is distinct from '[]'::jsonb" in citepatch['new']
decl=body(new,'private.typed_authoring_declaration_support');assert "p_fact->'sources' is distinct from '[]'::jsonb" in decl;assert "p_fact->'confirmation'->>'actorId' is distinct from p_context->'source'->>'ownerId'" in decl;assert 'current_fact.value is not distinct from p_fact' in decl
profile=(wt/'app/lib/server/typed-authoring-readiness-profile.ts').read_text();pins=dict(re.findall(r'(canonicalReadinessSha256|typedReadinessSha256|writerSha256|readerSha256):\s*"([a-f0-9]{64})"',profile));assert pins=={'canonicalReadinessSha256':'0c8ab4602856e82dd316d083529383a64ef1e3118a3c27641a86de5430b79428','typedReadinessSha256':sha(checker2),'writerSha256':sha(writer2),'readerSha256':sha(reader2)}
assert 'typed-authoring-readiness-profile/1.1.0' in profile and 'typed-authoring-readiness-profile/1.1.0' in reader2
assert 'grant execute on function public.apply_typed_authoring_action' not in new.lower()
r={'status':'PASS_TEXTUAL_NATIVE_SOURCE_REVIEW_ONLY','sqlParsing':'NOT_RUN','sqlExecution':'NOT_RUN','databaseOperations':0,'migrationSha256':sha(new),'profileFileSha256':sha(profile),'profilePins':pins,'oldTypedRoutines':10,'newTypedRoutines':13,'oldChangedCatalogBodies':['writer','metadata_reader'],'newHelpers':['validate_v1_1','atoms_v1_1','declaration_support'],'canonicalBase138AndLegacyGuard':'UNCHANGED','authoringPolicySha256':actual['sha256'],'checked':['Exact guarded3predecessor/postimage chains','13exactmanifestbodypins; frozenoldsourceproof/validator/atoms unchanged','Newvalidator differs only in exactschema/policies and zerocitations; atom order identical','Versioned validation/hashing beforeprior; exactownedprior beforefreshreadiness/CAS/declarationproof','Oldcitationbranch unchanged within1.0;1.1 requiresactualandwirecitations[]','Declaration actualowner/confirmation/currentfact/uniquelocation and finiteJDrelevance proof','Metadata profile1.1 and fouractualpins; writer stilldenied'],'limits':['Native syntax/catalog/ACL/transaction/concurrency/rollback/cleanup remain unverified','Full backend declaration grammar parity and consumer integration pending']}
(base/'a11-declaration-native-source-review.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:v for k,v in r.items() if k not in ['checked','limits','profilePins']},indent=2))
