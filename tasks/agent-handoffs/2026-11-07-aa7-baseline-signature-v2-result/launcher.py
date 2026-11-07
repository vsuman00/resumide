import pathlib,tempfile,os,json,hashlib,shutil,subprocess,time,signal,tarfile,traceback
W=pathlib.Path('/Users/vaibhavsuman/.codex/worktrees/aa7-20261106-licenses/resume_ats');C=W/'scripts/latex-runtime';D=C/'native-poppler/baseline-signature'
A=pathlib.Path(tempfile.mkdtemp(prefix='resumide-aa7-baseline-signature-v2-'));A.chmod(0o700);(A/'tmp').mkdir(mode=0o700)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=D/'manifest.v2.json';expected='aa17b701b16977f1efd41d1b9064da4893171e82e1b1c158f8ce88f32b1b801a';m=json.loads(manifest.read_text())
started=time.monotonic();process=None;container=None
receipt={'status':'PREFLIGHT','directory':str(A),'manifestSha256':expected,'runtimeAdopted':False,'purpose':'baseline assertion diagnostic only','hostFloorBytes':5176082432,'hostDeadlineSeconds':300,'outerLogCapBytes':16777216,'scannerForbiddenUntilMainRestored':True,'startedUnix':time.time()}
env={'HOME':os.environ['HOME'],'LANG':'C.UTF-8','PATH':'/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin','TMPDIR':str(A/'tmp')}
def check_sources():
 assert sha(manifest)==expected
 for e in m['files']:
  p=C/e['path'];assert p.is_file()and not p.is_symlink()and p.stat().st_size==e['bytes']and sha(p)==e['sha256'],e['path']
 return {'manifest':sha(manifest),'files':len(m['files']),'bytes':sum(e['bytes']for e in m['files'])}
def bounded(command,name,limit=2*1024*1024):
 r=subprocess.run(command,env=env,stdin=subprocess.DEVNULL,capture_output=True,timeout=min(15,max(1,300-(time.monotonic()-started))))
 assert len(r.stdout)+len(r.stderr)<=limit
 (A/(name+'.stdout')).write_bytes(r.stdout);(A/(name+'.stderr')).write_bytes(r.stderr)
 receipt.setdefault('operations',[]).append({'name':name,'command':command,'exitCode':r.returncode,'stdoutSha256':hashlib.sha256(r.stdout).hexdigest(),'stderrSha256':hashlib.sha256(r.stderr).hexdigest()})
 assert r.returncode==0,(name,r.stderr.decode(errors='replace')[:1000])
 return r.stdout
try:
 receipt['sourcesBefore']=check_sources();receipt['freeBefore']=shutil.disk_usage(A).free;assert receipt['freeBefore']>=5176082432
 docker=shutil.which('docker');assert docker
 tag='resumide-poppler-baseline:aa7-20261107-'+A.name.rsplit('-',1)[-1]
 command=[docker,'build','--pull=false','--platform','linux/arm64','--target','reports','--progress','plain','--iidfile',str(A/'image.iid'),'--tag',tag,'--file',str(D/'Dockerfile.v2'),str(C)]
 receipt.update(status='RUNNING',command=command,environmentNames=sorted(env));(A/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'directory':str(A),'command':command}),flush=True)
 log=A/'build.log'
 with log.open('wb')as stream:
  log.chmod(0o600);process=subprocess.Popen(command,cwd=C,env=env,stdin=subprocess.DEVNULL,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
  while process.poll()is None:
   if time.monotonic()-started>300:raise TimeoutError('host diagnostic deadline')
   if log.stat().st_size>16777216:raise ValueError('outer diagnostic output cap')
   if shutil.disk_usage(A).free<5176082432:raise ValueError('restoration reserve disk floor')
   time.sleep(.25)
 receipt.update(buildExitCode=process.returncode,buildSignal=-process.returncode if process.returncode<0 else None)
 assert log.stat().st_size<=16777216
 if process.returncode:
  receipt['status']='BUILD_FAILED_DIAGNOSTIC_NOT_REACHED'
 else:
  iid=(A/'image.iid').read_text().strip();assert iid.startswith('sha256:')and len(iid)==71
  info=json.loads(bounded([docker,'image','inspect',iid],'image-inspect'));assert len(info)==1 and info[0]['Id']==iid and info[0]['Architecture']=='arm64'
  receipt['reportsImageID']=iid
  name='aa7-baseline-report-'+A.name.rsplit('-',1)[-1]
  container=bounded([docker,'create','--name',name,'--label','resumide.aa7.baseline-report='+name,'--network','none','--read-only','--user','65532:65532','--cap-drop','ALL','--security-opt','no-new-privileges',iid,'/never-execute'],'container-create').decode().strip()
  ci=json.loads(bounded([docker,'inspect',container],'container-inspect'))[0];assert not ci['State']['Running']and ci['State']['Status']=='created'and ci['Image']==info[0]['Id'] and not ci['Mounts']
  out=A/'reports';out.mkdir(mode=0o700)
  records=[];total=0
  def copy_exact(name,cap):
   global total
   assert pathlib.PurePosixPath(name).name==name and '/'not in name and name not in {'.','..'}
   tarpath=A/(name+'.tar');err=A/(name+'.cp.stderr')
   with tarpath.open('wb')as output,err.open('wb')as errors:
    copy=subprocess.Popen([docker,'cp',container+':/'+name,'-'],env=env,stdin=subprocess.DEVNULL,stdout=output,stderr=errors,start_new_session=True)
    try:
     while copy.poll()is None:
      if time.monotonic()-started>300 or tarpath.stat().st_size>cap+1048576 or err.stat().st_size>65536 or shutil.disk_usage(A).free<5176082432:raise ValueError('exact named export bound')
      time.sleep(.05)
    finally:
     if copy.poll()is None:os.killpg(copy.pid,signal.SIGKILL);copy.wait()
   assert copy.returncode==0,(name,err.read_text()[:500])
   assert tarpath.stat().st_size<=cap+1048576
   with tarfile.open(tarpath,'r:')as archive:
    members=archive.getmembers();assert len(members)==1
    member=members[0];assert pathlib.PurePosixPath(member.name)==pathlib.PurePosixPath(name)and member.isfile()and not member.issym()and not member.islnk()and not member.sparse and 0<=member.size<=cap
    total+=member.size;assert total<=16777216
    data=archive.extractfile(member).read(cap+1);assert len(data)==member.size
   path=out/name;path.write_bytes(data);path.chmod(0o600)
   with path.open('rb')as stream:os.fsync(stream.fileno())
   records.append({'name':name,'bytes':len(data),'sha256':sha(path),'tarSha256':sha(tarpath)})
   return data
  outcome=json.loads(copy_exact('diagnostic-outcome.json',1048576))
  logs=[]
  for phase in outcome['phases']:
   name=phase['name']+'.log';assert pathlib.PurePosixPath(name).name==name and name.endswith('.log')and name not in logs;logs.append(name)
  for name in logs:copy_exact(name,8388608)
  copy_exact('sdk-install.json',1048576)
  if any(p['name']=='full-baseline-signature-class' for p in outcome['phases']):copy_exact('baseline-signature.xml',8388608)
  receipt.update(exportedReports=records,exportBytes=total,outcome=outcome,status='REPORTS_EXPORTED_BASELINE_RESULT_ONLY')
except BaseException as error:
 receipt.update(status='DIAGNOSTIC_STOPPED_NO_RETRY',error=type(error).__name__+': '+str(error),traceback=traceback.format_exc(limit=4))
finally:
 if process is not None and process.poll()is None:
  os.killpg(process.pid,signal.SIGTERM)
  try:process.wait(timeout=5)
  except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
  receipt.update(buildExitCode=process.returncode,buildSignal=-process.returncode if process.returncode<0 else None)
 if container:
  r=subprocess.run([docker,'rm',container],env=env,capture_output=True,timeout=10);receipt['containerRemovalExit']=r.returncode
  check=subprocess.run([docker,'inspect',container],env=env,capture_output=True,timeout=10);receipt['exactContainerAbsent']=check.returncode!=0 and ('no such object: '+container) in check.stderr.decode().lower()
 try:receipt['sourcesAfter']=check_sources();receipt['sourcesUnchanged']=receipt['sourcesBefore']==receipt['sourcesAfter']
 except BaseException as error:receipt['sourceVerificationError']=str(error);receipt['status']='DIAGNOSTIC_STOPPED_NO_RETRY'
 if (A/'build.log').exists():receipt.update(logSha256=sha(A/'build.log'),logBytes=(A/'build.log').stat().st_size)
 receipt.update(seconds=round(time.monotonic()-started,3),freeAfter=shutil.disk_usage(A).free,finishedUnix=time.time());(A/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2),flush=True)
