import pathlib,hashlib,json,os,signal,stat,subprocess,time,shutil
ROOT=pathlib.Path('/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats');A=pathlib.Path('/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-aa7-freetype-final-worker-zyk0psw1');CTX=ROOT/'scripts/latex-runtime';MANIFEST=A/'manifest.json';EXPECTED_MANIFEST='6259fb99afcd7300c298a8d79dc0cd4ec78b8480729f3bfdb226d52ac0ccb4cc'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(MANIFEST)==EXPECTED_MANIFEST
m=json.loads(MANIFEST.read_text());env={'HOME':str(A/'home'),'LANG':'C.UTF-8','PATH':'/Users/vaibhavsuman/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin','TMPDIR':str(A/'tmp')}
def snapshot():
 for n,v in m['contextFiles'].items():
  p=CTX/n;assert p.is_file()and not p.is_symlink()and p.stat().st_size==v['bytes']and sha(p)==v['sha256'],n
 for n,v in m['runtimeSources'].items():assert sha(ROOT/n)==v,n
 program="import {sourceHashes} from './scripts/verify-private-aa7.mjs'; process.stdout.write(JSON.stringify(sourceHashes(process.cwd())));"
 sources=json.loads(subprocess.check_output(['node','--input-type=module','-e',program],cwd=ROOT,env=env,timeout=15));assert sources==m['codeSources'],'code snapshot drift'
 return {'context':m['contextCount'],'runtime':m['runtimeCount'],'code':m['codeCount'],'manifestSha256':sha(MANIFEST)}
def save():
 p=A/'receipt.json';p.write_text(json.dumps(receipt,indent=2)+'\n');p.chmod(0o600)
floor=5176082432;logcap=33554432;deadline=2400;process=None
receipt={'status':'PREFLIGHT','runtimeAdopted':False,'diskFloorBytes':floor,'admissionBytes':6800000000,'deadlineSeconds':deadline,'logCapBytes':logcap,'manifestSha256':EXPECTED_MANIFEST,'environmentNames':list(env),'startedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())};start=time.monotonic()
try:
 receipt['sourcesBefore']=snapshot();assert shutil.disk_usage(A).free>=6800000000,'E013 reviewed 6800000000B admission';receipt['freeBefore']=shutil.disk_usage(A).free;receipt['minimumObservedFreeBytes']=receipt['freeBefore']
 socket=pathlib.Path('/var/run/docker.sock').resolve(strict=True);assert socket==pathlib.Path('/Users/vaibhavsuman/.docker/run/docker.sock')and stat.S_ISSOCK(socket.stat().st_mode)
 tool='/Applications/Docker.app/Contents/Resources/cli-plugins/docker-buildx';assert pathlib.Path(tool).is_file()
 version=subprocess.check_output([tool,'version'],env=env,text=True,timeout=10);receipt['buildxVersion']=version.strip()
 inspect=subprocess.check_output([tool,'inspect','default'],env=env,text=True,timeout=15);assert __import__('re').search(r'^Driver:\s+docker$',inspect,__import__('re').M)
 receipt['defaultDriver']='docker';receipt['unixEndpoint']=str(socket);receipt['localLoadNoPush']=True
 tag='resumide-latex:aa7-freetype-final-20261107-'+A.name.rsplit('-',1)[-1];iid=A/'image.iid';log=A/'build.log';argv=[tool,'build','--platform','linux/arm64','--pull=false','--progress=plain','--tag',tag,'--iidfile',str(iid),str(CTX)]
 receipt.update(status='RUNNING',argv=argv,tag=tag);save();print(json.dumps({'attempt':str(A),'argv':argv}),flush=True)
 with log.open('wb')as output:
  log.chmod(0o600);process=subprocess.Popen(argv,cwd=ROOT,env=env,stdin=subprocess.DEVNULL,stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
  while process.poll()is None:
   if time.monotonic()-start>deadline:raise RuntimeError('host deadline')
   if log.stat().st_size>logcap:raise RuntimeError('host log bound')
   free=shutil.disk_usage(A).free;receipt['minimumObservedFreeBytes']=min(receipt['minimumObservedFreeBytes'],free)
   if free<floor:raise RuntimeError('protected database reserve floor')
   time.sleep(.5)
  output.flush();os.fsync(output.fileno())
 receipt.update(exitCode=process.returncode,seconds=round(time.monotonic()-start,3),logSha256=sha(log),logBytes=log.stat().st_size);assert process.returncode==0 and log.stat().st_size<=logcap and shutil.disk_usage(A).free>=floor and time.monotonic()-start<=deadline
 image=iid.read_text().strip();metadata=json.loads(subprocess.check_output(['docker','image','inspect',image],env=env,timeout=15));p=A/'metadata.json';p.write_text(json.dumps(metadata,indent=2)+'\n');assert len(metadata)==1 and metadata[0]['Id']==image and metadata[0]['Architecture']=='arm64'and metadata[0]['Os']=='linux'and metadata[0]['Config']['User']=='65532:65532'
 receipt.update(status='BUILT_NOT_RUNTIME_VERIFIED',imageId=image,metadataSha256=sha(p),user=metadata[0]['Config']['User'],architecture=metadata[0]['Architecture'])
except BaseException as error:receipt.update(status='FAILED',error=type(error).__name__+': '+str(error))
finally:
 if process is not None and process.poll()is None:
  os.killpg(process.pid,signal.SIGTERM)
  try:process.wait(timeout=5)
  except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
  receipt['exitCode']=process.returncode
 if (A/'build.log').is_file():receipt.update(logSha256=sha(A/'build.log'),logBytes=(A/'build.log').stat().st_size)
 try:receipt['sourcesAfter']=snapshot();receipt['sourcesUnchanged']=receipt['sourcesAfter']==receipt['sourcesBefore']
 except BaseException as error:receipt.update(status='FAILED',sourceDrift=repr(error))
 receipt.update(freeAfter=shutil.disk_usage(A).free,endedUTC=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()));receipt['minimumObservedFreeBytes']=min(receipt.get('minimumObservedFreeBytes',receipt['freeAfter']),receipt['freeAfter'])
 if receipt['freeAfter']<floor or time.monotonic()-start>deadline or ((A/'build.log').is_file() and (A/'build.log').stat().st_size>logcap):receipt.update(status='FAILED',terminalBoundFailure=True)
 save();print(json.dumps(receipt,indent=2),flush=True)

raise SystemExit(0 if receipt.get("status")=="BUILT_NOT_RUNTIME_VERIFIED" and receipt.get("sourcesUnchanged") is True else 1)
