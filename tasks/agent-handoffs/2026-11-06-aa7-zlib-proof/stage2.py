from pathlib import Path
import hashlib,json,os,resource,stat,subprocess,time,uuid
root=Path(__file__).parent
mp=root/'manifest.json'
assert hashlib.sha256(mp.read_bytes()).hexdigest()=='a697714eb9ddefd78c93286c56fcd2de948f709128db530793a9a0bed4e1531c'
m=json.loads(mp.read_text());image=m['image'];assert image=='sha256:382927476a7d5b500351835b57cdf9006a2e229e431b7bfd734c19425be472bc'
prior=Path('/Users/vaibhavsuman/.codex/worktrees/aa7-20261030-sandbox/resume_ats/docs/evaluation/AA7_EXACT_COMPONENT_METADATA_ATTEMPT2_20261106.json');assert hashlib.sha256(prior.read_bytes()).hexdigest()==m['priorMetadataSha256']
p=json.loads(prior.read_text())['metadata'];known={d['path']:d['sha256'] for x in p['ldd'] for d in x['dependencies']};known.update({x['program']:next(q['sha256'] for q in p['files'] if q['path']==x['program']) for x in p['ldd']})
assert len(known)==78 and {x['originalPath']:x['expectedSha256'] for x in m['knownAliases']}==known
assert len(m['files'])<=192 and len({x['path'] for x in m['files']})==len(m['files']) and sum(x['bytes'] for x in m['files'])<=256*1024*1024
canonical={x['resolvedPath']:x['expectedSha256'] for x in m['knownAliases']};assert len(canonical)==78
for x in m['files']:
 assert (x['path'].startswith('/usr/bin/') or x['path'].startswith('/usr/lib/')) and 64<=x['bytes']<=64*1024*1024
 if x['source']=='known-program-or-ldd':assert canonical[x['path']]==x['sha256']
 else:assert x['source']=='direct-regular-python-module' and Path(x['path']).parent==Path('/usr/lib/python3.13/lib-dynload') and x['path'].endswith('.so') and x['bytes']<=8*1024*1024
assert sum(x['source']=='direct-regular-python-module' for x in m['files'])==47
copydir=root/'copied-elfs';outdir=root/'objdump';copydir.mkdir(mode=0o700);outdir.mkdir(mode=0o700)
env={k:os.environ[k] for k in ('PATH','HOME','LANG','TMPDIR') if k in os.environ};name='resumide-aa7-zlib-symbol-copy-'+uuid.uuid4().hex[:12];created=False;copied=[]
record={'status':'failed','image':image,'manifestSha256':hashlib.sha256(mp.read_bytes()).hexdigest(),'launcherSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'environmentNames':sorted(env),'neverStarted':True,'files':[],'rootEdited':False,'noApplicabilityDisposition':True}
tool=Path('/usr/bin/objdump');assert hashlib.sha256(tool.read_bytes()).hexdigest()=='ed6f5284033aa2aae6a58427c25ba3ab119947b40365627b24e5d51a4b70a1cd';record['hostToolSha256']=hashlib.sha256(tool.read_bytes()).hexdigest()
start=time.monotonic()
def remaining():
 seconds=120-(time.monotonic()-start)
 if seconds<=0:raise TimeoutError('whole audit120second bound')
 return min(10,seconds)
def hash_file(path):
 h=hashlib.sha256()
 with path.open('rb') as stream:
  for chunk in iter(lambda:stream.read(65536),b''):h.update(chunk)
 return h.hexdigest()
def output_limit():resource.setrlimit(resource.RLIMIT_FSIZE,(2*1024*1024,2*1024*1024))
try:
 argv=['docker','create','--pull=never','--name',name,'--label','resumide.latex.audit=zlib-host-symbols','--network=none','--ipc=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user=65532:65532','--cpus=1','--memory=128m','--memory-swap=128m','--pids-limit=32','--entrypoint','/usr/bin/true',image]
 record['createArgv']=argv;r=subprocess.run(argv,env=env,capture_output=True,text=True,timeout=remaining());record['createExitCode']=r.returncode;assert r.returncode==0,r.stderr[:1024];created=True;record['containerID']=r.stdout.strip()
 state=json.loads(subprocess.check_output(['docker','inspect',name],env=env,timeout=remaining()))[0];hc=state['HostConfig'];assert state['Image']==image and state['State']['Status']=='created' and not state['State']['Running'];assert state['Config']['User']=='65532:65532' and hc['ReadonlyRootfs'] and hc['NetworkMode']=='none' and 'ALL' in hc['CapDrop'] and 'no-new-privileges' in hc['SecurityOpt'] and not state['Mounts'] and not hc.get('Binds');record['creationIsolationVerified']=True
 for i,item in enumerate(m['files']):
  dest=copydir/f'{i:03}.elf';copied.append(dest)
  r=subprocess.run(['docker','cp',name+':'+item['path'],str(dest)],env=env,capture_output=True,timeout=remaining());assert r.returncode==0,r.stderr[:1024]
  info=dest.lstat();assert stat.S_ISREG(info.st_mode) and not dest.is_symlink() and info.st_size==item['bytes'];assert hash_file(dest)==item['sha256'];dest.chmod(0o400)
  output=outdir/f'{i:03}.txt';argv=[str(tool),'--no-debuginfod','--file-headers','--dynamic-syms',str(dest)]
  with output.open('wb') as stream:r=subprocess.run(argv,env=env,stdout=stream,stderr=subprocess.STDOUT,timeout=remaining(),preexec_fn=output_limit)
  data=output.read_bytes();assert r.returncode==0 and len(data)<=2*1024*1024;assert hash_file(dest)==item['sha256'] and dest.stat().st_size==item['bytes'];text=data.decode(errors='replace');assert 'file format elf64-littleaarch64' in text and 'DYNAMIC SYMBOL TABLE' in text
  imports=[];memory=[];loaders=[]
  for line in text.splitlines():
   if '*UND*' not in line:continue
   symbol=line.split()[-1].split('@')[0]
   if symbol.startswith('gz'):imports.append(symbol)
   elif symbol in ('dlopen','dlsym','dlvsym'):loaders.append(symbol)
   elif symbol.startswith(('inflate','deflate','compress','uncompress')):memory.append(symbol)
  record['files'].append({**item,'copySha256BeforeAfterMatched':True,'objdumpExitCode':r.returncode,'objdumpBytes':len(data),'objdumpSha256':hashlib.sha256(data).hexdigest(),'outputPath':str(output),'undefinedGzipImports':sorted(set(imports)),'undefinedMemoryCompressionImports':sorted(set(memory)),'undefinedDynamicLoaderImports':sorted(set(loaders))})
 for dest,item in zip(copied,m['files']):assert hash_file(dest)==item['sha256']
 state=json.loads(subprocess.check_output(['docker','inspect',name],env=env,timeout=remaining()))[0];assert state['State']['Status']=='created' and not state['State']['Running'];record['neverStartedVerifiedAfterCopies']=True;record['status']='symbol-audit-pass-no-applicability-disposition'
except Exception as error:record['error']=type(error).__name__+': '+str(error)
finally:
 record['seconds']=round(time.monotonic()-start,3)
 if created:
  r=subprocess.run(['docker','rm',name],env=env,capture_output=True,timeout=10);record['removeExitCode']=r.returncode;record['containerAbsent']=subprocess.run(['docker','inspect',name],env=env,capture_output=True,timeout=10).returncode!=0
 for dest in copied:
  if dest.exists() or dest.is_symlink():dest.unlink()
 record['allCopiedElfsAbsent']=not list(copydir.iterdir());copydir.rmdir();(root/'symbol-audit.json').write_text(json.dumps(record,indent=2,sort_keys=True)+'\n')
 print('RECEIPT',root/'symbol-audit.json');print(json.dumps({k:v for k,v in record.items() if k not in ('files','createArgv')},indent=2));print('FILECOUNT',len(record['files']));print('GZIP_IMPORTERS',json.dumps([{'path':x['path'],'imports':x['undefinedGzipImports']} for x in record['files'] if x['undefinedGzipImports']]));print('LOADER_IMPORTERS',json.dumps([{'path':x['path'],'imports':x['undefinedDynamicLoaderImports']} for x in record['files'] if x['undefinedDynamicLoaderImports']]))
