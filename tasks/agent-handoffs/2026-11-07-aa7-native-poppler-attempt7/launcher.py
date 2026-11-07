import pathlib,tempfile,os,json,hashlib,shutil,subprocess,time,signal,traceback,tarfile,re
W=pathlib.Path('/Users/vaibhavsuman/.codex/worktrees/aa7-20261106-licenses/resume_ats');R=W/'scripts/latex-runtime/native-poppler';A=pathlib.Path('/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-aa7-native-poppler-build7-5jsuwxzf');assert A.is_dir()and not A.is_symlink()and (A/'tmp').is_dir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=R/'build-review-manifest.v6.json';context=R/'build-context-manifest.v6.json';m=json.loads(manifest.read_text());receipt={'status':'PREFLIGHT','attemptDirectory':str(A),'priorFullBuildAttempts':6,'priorCompilerReached':True,'exception':'E-009 expires at this attempt terminal','runtimeAdopted':False,'approvedReviewManifestSha256':'03ce12f861b5e3f3a710bb3bda6624e2244cfe97ec2a1380fb3da9e600e32c8d','approvedContextManifestSha256':'de1b506a1d43d1a3d8d5accd4fd326463d9de9a2f2289506a20f4ef80dfeba2b','startedUnix':time.time()}
def sources():
 assert sha(manifest)==receipt['approvedReviewManifestSha256'];assert sha(context)==receipt['approvedContextManifestSha256']
 for e in m['files']:
  p=R/e['path'];assert p.is_file()and not p.is_symlink()and p.stat().st_size==e['bytes']and sha(p)==e['sha256'],e['path']
 for e in json.loads(context.read_text())['explicitFiles']:
  p=W/'scripts/latex-runtime'/e['path'];assert p.is_file()and not p.is_symlink()and p.stat().st_size==e['bytes']and sha(p)==e['sha256'],e['path']
 return {'reviewManifest':sha(manifest),'contextManifest':sha(context),'reviewFiles':len(m['files']),'contextFiles':24}
process=None
container=None
try:
 receipt['sourcesBefore']=sources();free=shutil.disk_usage(A).free;receipt['freeDiskBefore']=free;assert free>=9*1024**3,'pre-build disk admission below9GiB'
 docker=shutil.which('docker');assert docker
 env={'HOME':os.environ['HOME'],'LANG':'C.UTF-8','PATH':'/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin','TMPDIR':str(A/'tmp')}
 tag='resumide-latex-native-poppler:aa7-20261107-build7-'+A.name.rsplit('-',1)[-1]
 command=[docker,'build','--pull=false','--platform','linux/arm64','--target','artifacts','--progress','plain','--iidfile',str(A/'image.iid'),'--tag',tag,'--file',str(R/'Dockerfile.plan-lock-v6'),str(W/'scripts/latex-runtime')]
 receipt.update(status='RUNNING',command=command,environmentNames=sorted(env),hostDeadlineSeconds=2400,logByteCap=33554432,freeDiskFloor=5176082432,mainRestoreReserveBytes=1686421504,scannerForbiddenUntilMainRestored=True,finalExportAcceptance='pending; no artifact accepted until separate exact final export <=256MiB and aggregate DEBs <=64MiB gate',failedBuildMayExportPackages=False)
 (A/'build-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'attemptDirectory':str(A),'command':command,'receipt':str(A/'build-receipt.json')},indent=2),flush=True)
 start=time.monotonic();log=A/'build.log'
 with log.open('wb')as output:
  os.chmod(log,0o600);process=subprocess.Popen(command,cwd=W/'scripts/latex-runtime',env=env,stdin=subprocess.DEVNULL,stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
  while process.poll()is None:
   if time.monotonic()-start>2400:raise RuntimeError('host build deadline exceeded')
   if log.stat().st_size>33554432:raise RuntimeError('host build log bound exceeded')
   if shutil.disk_usage(A).free<5176082432:raise RuntimeError('disk floor reached; no deletion or prune')
   time.sleep(.5)
 receipt.update(exitCode=process.returncode,signal=-process.returncode if process.returncode<0 else None,seconds=round(time.monotonic()-start,3),logSha256=sha(log),logBytes=log.stat().st_size)
 if process.returncode==0:
  iid=(A/'image.iid').read_text().strip();assert iid.startswith('sha256:')and len(iid)==71
  result=subprocess.run([docker,'image','inspect',iid],env=env,capture_output=True,text=True,timeout=15,check=True);assert len(result.stdout)<2*1024*1024;metadata=json.loads(result.stdout);assert len(metadata)==1 and metadata[0]['Id']==iid and metadata[0]['Architecture']=='arm64';(A/'image-inspect.json').write_text(result.stdout);receipt.update(status='BUILT_PENDING_FINAL_EXPORT_ACCEPTANCE',imageID=iid,imageInspectSha256=sha(A/'image-inspect.json'))

  def operation(argv,name):
   result=subprocess.run(argv,env=env,stdin=subprocess.DEVNULL,capture_output=True,timeout=min(15,max(1,2400-(time.monotonic()-start))))
   assert len(result.stdout)+len(result.stderr)<=2097152
   (A/(name+'.stdout')).write_bytes(result.stdout);(A/(name+'.stderr')).write_bytes(result.stderr)
   receipt.setdefault('dataOperations',[]).append({'name':name,'command':argv,'exitCode':result.returncode})
   assert result.returncode==0,(name,result.stderr.decode(errors='replace')[:500])
   return result.stdout
  name='aa7-poppler-artifacts-'+A.name.rsplit('-',1)[-1]
  container=operation([docker,'create','--name',name,'--label','resumide.aa7.poppler-artifacts='+name,'--network','none','--read-only','--user','65532:65532','--cap-drop','ALL','--security-opt','no-new-privileges',iid,'/never-execute'],'artifact-container-create').decode().strip()
  ci=json.loads(operation([docker,'inspect',container],'artifact-container-inspect'))[0]
  assert ci['State']['Status']=='created'and not ci['State']['Running']and not ci['Mounts']and ci['Image']==metadata[0]['Id']
  (A/'exports').mkdir(mode=0o700);(A/'export-transport').mkdir(mode=0o700)
  records=[];total=0;deb_total=0
  def exact(name,cap,expected=None):
   global total,deb_total
   assert pathlib.PurePosixPath(name).name==name and '/'not in name and name not in {'.','..'}
   tarpath=A/'export-transport'/(name+'.tar');err=A/'export-transport'/(name+'.stderr')
   with tarpath.open('wb')as output,err.open('wb')as errors:
    cp=subprocess.Popen([docker,'cp',container+':/'+name,'-'],env=env,stdin=subprocess.DEVNULL,stdout=output,stderr=errors,start_new_session=True)
    try:
     while cp.poll()is None:
      if time.monotonic()-start>2400 or tarpath.stat().st_size>cap+1048576 or err.stat().st_size>65536 or shutil.disk_usage(A).free<5176082432:raise ValueError('final export bound')
      time.sleep(.05)
    finally:
     if cp.poll()is None:os.killpg(cp.pid,signal.SIGKILL);cp.wait()
   assert cp.returncode==0,(name,err.read_text()[:500]);assert tarpath.stat().st_size<=cap+1048576
   with tarfile.open(tarpath,'r:')as archive:
    members=archive.getmembers();assert len(members)==1
    item=members[0];assert pathlib.PurePosixPath(item.name)==pathlib.PurePosixPath(name)and item.isfile()and not item.issym()and not item.islnk()and not item.sparse and 0<=item.size<=cap
    total+=item.size;assert total<=268435456
    if name.endswith('.deb'):deb_total+=item.size;assert deb_total<=67108864
    stream=archive.extractfile(item);path=A/'exports'/name;h=hashlib.sha256();remaining=item.size
    with path.open('xb')as target:
     path.chmod(0o600)
     while remaining:
      chunk=stream.read(min(1048576,remaining));assert chunk;target.write(chunk);h.update(chunk);remaining-=len(chunk)
     target.flush();os.fsync(target.fileno())
   assert sha(path)==h.hexdigest()
   if expected:assert sha(path)==expected
   records.append({'name':name,'bytes':item.size,'sha256':sha(path)})
   return path
  outcome=json.loads(exact('build-outcome.json',1048576).read_text())
  source=json.loads(exact('source-and-test-receipt.json',1048576).read_text())
  assert outcome['failure']is None and outcome['status']in {'native-package-checks-pass','private-engineering-with-reviewed-exception'}
  assert source['upstream']==outcome['upstream'] and outcome['nativeDiagnostic']['status']=='all-original-native-checks-pass'
  assert source['nativeVerification']==outcome['nativeDiagnostic']['result']
  allowed_failure=source['upstream'].get('engineeringException')
  for phase in outcome['phases']:
   assert phase['exitCode']==(8 if phase['name']=='fatal-upstream-tests'and allowed_failure else 0)
  if allowed_failure:
   assert allowed_failure['id']=='E010'and source['upstream']['passedExecutables']==70 and source['upstream']['failedExecutables']==1 and source['upstream']['allNativeTestsPassed']is False
  else:assert source['upstream']['passedExecutables']==71 and source['upstream']['allNativeTestsPassed']is True
  assert set(source['cohort'])=={'libpoppler147','poppler-utils'}
  for package,item in source['cohort'].items():
   assert item['version']=='25.03.0-5+deb13u4+resumide1'
   assert item['file']==package+'_25.03.0-5+deb13u4+resumide1_arm64.deb'
   exact(item['file'],67108864,item['sha256'])
  for item in outcome['logs']:
   assert re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,119}\.log',item['name'])
   exact(item['name'],33554432,item['sha256'])
  for name,cap in [('upstream-junit.xml',16777216),('consumer-neutral.json',1048576),('candidate-signature-binding.json',1048576),('native-diagnostic.json',1048576),('build-packages.lock',1048576),('build-dependency-transport.json',1048576),('installation-dependency-transport.json',1048576),('install-verification.json',1048576),('poppler_25.03.0-5+deb13u4+resumide1_arm64.buildinfo',1048576),('poppler_25.03.0-5+deb13u4+resumide1_arm64.changes',1048576)]:exact(name,cap)
  install=json.loads((A/'exports/install-verification.json').read_text());assert install['normalNoRemoveApt']and install['allOtherPackagesUnchanged']and install['freshNonrootProbe']['actualInstalledCli']and install['freshNonrootProbe']['noOpenJpegLink']
  assert sum(p.stat().st_size for p in (A/'exports').iterdir())==total<=268435456
  assert sum(p.stat().st_size for p in (A/'exports').glob('*.deb'))==deb_total<=67108864
  assert shutil.disk_usage(A).free>=5176082432
  receipt.update(status='BUILT_AND_BOUNDED_SOURCE_ARTIFACTS_EXPORTED_NOT_RUNTIME_ADOPTED',exportRecords=records,exportBytes=total,debBytes=deb_total,sourceOutcome=outcome['status'],upstreamActual=source['upstream'],finalExportAcceptance='PASS <=256MiB export and <=64MiB aggregateDEBs; all exact hashes checked',artifactContainerNeverStarted=True)
 else:receipt['status']='BUILD_FAILED_NO_ARTIFACT_ACCEPTED'
except BaseException as error:
 receipt.update(status='FAILED_NO_ARTIFACT_ACCEPTED',error=type(error).__name__+': '+str(error),traceback=traceback.format_exc(limit=5))
finally:
 if process is not None and process.poll()is None:
  os.killpg(process.pid,signal.SIGTERM)
  try:process.wait(timeout=10)
  except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
  receipt['exitCode']=process.returncode;receipt['signal']=-process.returncode if process.returncode<0 else None
 if container:
  removed=subprocess.run([docker,'rm',container],env=env,capture_output=True,timeout=10)
  absent=subprocess.run([docker,'inspect',container],env=env,capture_output=True,timeout=10)
  receipt['artifactCleanup']={'containerID':container,'removeExit':removed.returncode,'inspectExit':absent.returncode,'stderr':absent.stderr.decode(),'exactContainerAbsent':removed.returncode==0 and absent.returncode==1 and ('no such object: '+container)in absent.stderr.decode().lower()}
  if not receipt['artifactCleanup']['exactContainerAbsent']:receipt['status']='FAILED_NO_ARTIFACT_ACCEPTED'
 if (A/'build.log').exists():receipt.update(logSha256=sha(A/'build.log'),logBytes=(A/'build.log').stat().st_size)
 try:receipt['sourcesAfter']=sources();receipt['sourceHashesUnchanged']=receipt['sourcesBefore']==receipt['sourcesAfter']
 except BaseException as error:receipt['sourceHashVerificationFailure']=repr(error);receipt['status']='FAILED_NO_ARTIFACT_ACCEPTED'
 receipt['freeDiskAfter']=shutil.disk_usage(A).free;receipt['finishedUnix']=time.time();(A/'build-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2),flush=True)
