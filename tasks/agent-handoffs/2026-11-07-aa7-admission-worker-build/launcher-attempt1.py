import hashlib,json,os,pathlib,re,signal,subprocess,tempfile,time,traceback
root=pathlib.Path('/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats')
attempt=pathlib.Path(tempfile.mkdtemp(prefix='resumide-aa7-admission-worker-build-'));attempt.chmod(0o700)
home=attempt/'home';home.mkdir(mode=0o700);scratch=attempt/'tmp';scratch.mkdir(mode=0o700)
env={'HOME':str(home),'LANG':'C.UTF-8','PATH':'/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin','TMPDIR':str(scratch)}
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(n,v):
 p=attempt/n;p.write_text(json.dumps(v,indent=2)+'\n');p.chmod(0o600)
def sources():
 program="import {sourceHashes} from './scripts/verify-private-aa7.mjs'; process.stdout.write(JSON.stringify(sourceHashes(process.cwd())));"
 return json.loads(subprocess.check_output(['node','--input-type=module','-e',program],cwd=root,env=env,timeout=15))
context=root/'scripts/latex-runtime'; old=json.loads((root/'docs/evaluation/AA7_IMMUTABLE_HOME_BUILD_20261106.manifest.json').read_text())
files={x['path']:{'bytes':(context/x['path']).stat().st_size,'sha256':h(context/x['path'])} for x in old['files']}
assert len(files)==18
assert files['Dockerfile']['sha256']=='29a3e3a286a0cdcdf74cf12bbc1817ce620e7dd3fda533e4698c48ed1d3a9bac'
assert files['inspect_pdf.py']['sha256']=='5a6406231a085a8176a7fceb3a4190dd8f9a2e1feffc2cf075d2cc4731c5d931'
for name,v in files.items():
 if name not in ['inspect_pdf.py','supervisor.py']:assert v['sha256']==next(x['sha256'] for x in old['files'] if x['path']==name)
fixture=(root/'scripts/latex-test-fixtures.ts').read_text();block=fixture.split('export async function latexSourceHashes()')[1].split('return Object.fromEntries')[0]
names=re.findall(r'"([^"]+)"',block);assert len(names)==23
runtime={name:h(root/name) for name in names};before=sources();assert len(before)==561, len(before)
write('manifest.json',{'contextFiles':files,'runtimeSourceHashes':runtime,'sourceHashes':before,'sourceCount':len(before),'runtimeSourceCount':len(runtime)})
for line in (context/'Dockerfile').read_text().splitlines():
 if line.startswith('ADD '):assert '--checksum=sha256:' in line
assert not (context/'.dockerignore').read_text().find('!native-poppler')>=0
free=lambda:os.statvfs(root).f_bavail*os.statvfs(root).f_frsize
floor=5176082432;assert free()>floor
ps=subprocess.check_output(['docker','ps','--format','{{.ID}}'],env=env,timeout=10);assert not ps.strip(),ps
suffix=attempt.name.rsplit('-',1)[-1];tag='resumide-latex:aa7-admission-20261107-'+suffix
iid=attempt/'image.iid';log=attempt/'build.log';argv=['docker','build','--platform','linux/arm64','--pull=false','--progress=plain','--tag',tag,'--iidfile',str(iid),str(context)]
receipt={'status':'running','argv':argv,'tag':tag,'startedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'freeBefore':free(),'environmentNames':list(env),'diskFloorBytes':floor,'deadlineSeconds':600,'logLimitBytes':33554432,'manifestSha256':h(attempt/'manifest.json')}
write('receipt.json',receipt);print(json.dumps({'attempt':str(attempt),'argv':argv}),flush=True)
start=time.monotonic();stop=None
with log.open('wb') as out:
 p=subprocess.Popen(argv,cwd=root,env=env,stdin=subprocess.DEVNULL,stdout=out,stderr=subprocess.STDOUT,start_new_session=True)
 while p.poll() is None:
  if time.monotonic()-start>600:stop='deadline'
  elif log.stat().st_size>33554432:stop='log-bound'
  elif free()<floor:stop='restoration-reserve-floor'
  if stop:
   os.killpg(p.pid,signal.SIGTERM)
   try:p.wait(timeout=5)
   except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
   break
  time.sleep(.25)
 out.flush();os.fsync(out.fileno())
receipt.update(exitCode=p.returncode,stopReason=stop,elapsedSeconds=round(time.monotonic()-start,3),logBytes=log.stat().st_size,logSha256=h(log),freeAfter=free(),endedUTC=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()))
try:
 after=sources();write('source-after.json',after);receipt['sourcesUnchanged']=after==before;receipt['runtimeSourcesUnchanged']=all(h(root/n)==v for n,v in runtime.items());receipt['contextUnchanged']=all(h(context/n)==v['sha256'] for n,v in files.items())
 assert p.returncode==0 and not stop and log.stat().st_size<=33554432 and free()>=floor
 assert receipt['sourcesUnchanged'] and receipt['runtimeSourcesUnchanged'] and receipt['contextUnchanged']
 image=iid.read_text().strip();assert re.fullmatch(r'sha256:[a-f0-9]{64}',image)
 metadata=json.loads(subprocess.check_output(['docker','image','inspect',image],env=env,timeout=15));write('image-metadata.json',metadata)
 m=metadata[0];assert m['Id']==image and m['Architecture']=='arm64' and m['Os']=='linux' and m['Config']['User']=='65532:65532'
 receipt.update(status='PASS',imageId=image,imageMetadataSha256=h(attempt/'image-metadata.json'),architecture=m['Architecture'],user=m['Config']['User'])
except BaseException as e:receipt.update(status='FAILED',error=type(e).__name__+': '+str(e))
finally:write('receipt.json',receipt);print(json.dumps({'attempt':str(attempt),'receipt':receipt}),flush=True)
