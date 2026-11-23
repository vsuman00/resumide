import pathlib,json,subprocess,hashlib,tarfile,time,os,signal,re
A=pathlib.Path('/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-aa7-final-combined-worker2-4fk2y3de');image='sha256:6f623e1c0210724e742e24dc4ec6fe2516b4116eb978c9abae22bb71b1db614a';D=A/'image-evidence';D.mkdir(mode=0o700);env={'HOME':str(A/'home'),'LANG':'C.UTF-8','PATH':'/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin','TMPDIR':str(A/'tmp')};sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();cid=None;start=time.monotonic();r={'status':'collecting','imageId':image,'neverStarted':True,'records':[]};total=0
items=[('/opt/latex/native-poppler/installed-package.json',1048576),('/opt/latex/native-poppler/source-and-test-receipt.json',1048576),('/opt/latex/native-poppler/build-outcome.json',1048576),('/opt/latex/native-poppler/install-verification.json',1048576),('/opt/latex/native-poppler/candidate-signature-binding.json',1048576),('/opt/latex/native-expat/installed-package.json',1048576),('/opt/latex/packages.lock',1048576),('/opt/latex/closure.json',4194304)]
try:
 cmd=['docker','create','--name','aa7-final-metadata-4fk2y3de','--label','resumide.aa7.metadata=final-worker-4fk2y3de','--network','none','--read-only','--user','65532:65532','--cap-drop','ALL','--security-opt','no-new-privileges',image,'/never-execute'];cid=subprocess.check_output(cmd,env=env,text=True,timeout=10).strip();m=json.loads(subprocess.check_output(['docker','inspect',cid],env=env,timeout=10))[0];assert m['State']['Status']=='created'and not m['State']['Running']and not m['Mounts']and m['Image']==image
 for path,cap in items:
  assert time.monotonic()-start<60
  name=path.removeprefix('/').replace('/','__');transport=D/(name+'.tar');err=D/(name+'.stderr')
  with transport.open('wb')as out,err.open('wb')as errors:
   p=subprocess.Popen(['docker','cp',cid+':'+path,'-'],env=env,stdout=out,stderr=errors,stdin=subprocess.DEVNULL,start_new_session=True)
   try:
    while p.poll()is None:
     assert time.monotonic()-start<60 and transport.stat().st_size<=cap+1048576 and err.stat().st_size<=8192
     time.sleep(.05)
   finally:
    if p.poll()is None:os.killpg(p.pid,signal.SIGKILL);p.wait()
  assert p.returncode==0 and transport.stat().st_size<=cap+1048576
  with tarfile.open(transport,'r:')as tar:
   members=tar.getmembers();assert len(members)==1;x=members[0];assert x.name==pathlib.PurePosixPath(path).name and x.isfile()and not x.issym()and not x.islnk()and not x.sparse and x.size<=cap
   total+=x.size;assert total<=10485760
   dest=D/name;src=tar.extractfile(x)
   with dest.open('xb')as out:dest.chmod(0o600);out.write(src.read(cap+1));out.flush();os.fsync(out.fileno())
   assert dest.stat().st_size==x.size
  r['records'].append({'imagePath':path,'file':name,'bytes':x.size,'sha256':sha(dest)})
 r.update(status='PASS_DATA_ONLY',totalBytes=total)
except BaseException as e:r.update(status='FAILED',error=type(e).__name__+': '+str(e))
finally:
 if cid:
  rm=subprocess.run(['docker','rm',cid],env=env,capture_output=True,timeout=10);absence=subprocess.run(['docker','inspect',cid],env=env,capture_output=True,timeout=10);r['cleanup']={'containerId':cid,'removeExit':rm.returncode,'inspectExit':absence.returncode,'exactAbsent':rm.returncode==0 and absence.returncode==1 and b'no such object' in absence.stderr.lower()}
  if not r['cleanup']['exactAbsent']:r['status']='FAILED'
 r['seconds']=round(time.monotonic()-start,3);(D/'receipt.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
