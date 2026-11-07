from pathlib import Path
import hashlib,json,os,stat,subprocess,shutil,tempfile,time,traceback
W=Path('/Users/vaibhavsuman/.codex/worktrees/aa7-20261106-licenses/resume_ats');P=W/'tasks/agent-handoffs/2026-11-06-aa7-owned-export-cleanup-proposal/proposal.json';assert hashlib.sha256(P.read_bytes()).hexdigest()=='33da7aaf8911d71937810ad5222cdcd8198e31b9d929c9a6ac025c05aea3f54f';proposal=json.loads(P.read_text());files=proposal['exactSixFiles'];assert len(files)==6;A=Path(tempfile.mkdtemp(prefix='resumide-aa7-owned-export-unlink-'));A.chmod(0o700);started=time.monotonic();receipt={'status':'STARTED_APPROVED_EXACT_SIX','directory':str(A),'proposal':str(P),'proposalSha256':hashlib.sha256(P.read_bytes()).hexdigest(),'freeBytesBefore':shutil.disk_usage(A).free,'completed':[],'noImageDeletionOrPrune':True,'noCompressionOrNativeBuild':True,'mainRestoreReserveBytes':1686421504,'minimumSubsequentFloorWithRestore':4907646976,'preferredFloorWith256MiBExtra':5176082432,'scannerForbiddenUntilMainRestored':True}
def sha(p):
 with p.open('rb')as f:return hashlib.file_digest(f,'sha256').hexdigest()
def syncdir(path):
 fd=os.open(path,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)
def save():
 p=A/'receipt.partial';fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
 with os.fdopen(fd,'w')as f:f.write(json.dumps(receipt,indent=2)+'\n');f.flush();os.fsync(f.fileno())
 os.replace(p,A/'receipt.json');syncdir(A)
def same(s,r):return stat.S_ISREG(s.st_mode)and(s.st_dev,s.st_ino,s.st_size,s.st_uid,s.st_gid,oct(stat.S_IMODE(s.st_mode)),s.st_nlink,s.st_mtime_ns)==(r['device'],r['inode'],r['bytes'],r['uid'],r['gid'],r['mode'],1,r['mtimeNs'])
def guard():
 if time.monotonic()-started>180:raise RuntimeError('cleanup deadline exceeded')
 if shutil.disk_usage(A).free<3221225472:raise RuntimeError('cleanup floor reached')
def imageproof(item):
 value=json.loads(subprocess.check_output(['/usr/local/bin/docker','image','inspect',item['imageID']],text=True,timeout=15));assert len(value)==1;x=value[0];previous=json.loads(Path(item['inspectPath']).read_text())[0];assert x['Id']==previous['Id']==item['imageID']and x['Architecture']==previous['Architecture']and x['RootFS']['Layers']==previous['RootFS']['Layers']and x['Config']==previous['Config'];return {'imageID':x['Id'],'architecture':x['Architecture'],'diffIds':x['RootFS']['Layers'],'configUnchanged':True}
def retained():
 root=Path('/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-aa7-sealed-security-0zi88hb7');paths=[(root/'trivy','7a15c426f963473a485a4f315e21f8e2c881269d500bf0de35da13a4421fa108'),(root/'cache/java-db/trivy-java.db','7124b5d89aa910c1c79b7cbdd35903ab940762f6ebb27729e558fb197f9ae1db'),(root/'cache/db/metadata.json','539dd6dba09ae9e2fd0b08259d49df352e7105ca7ac55be94407c1cd829f5303'),(root/'cache/java-db/metadata.json','cfab655cdd8b21fc015643e5a66de0eb22961d9a79ca01ca8836316c8de476d7')]
 paths.append((Path(files[-1]['verifiedGzip']['path']),files[-1]['verifiedGzip']['sha256']))
 for item in proposal['retainedDockerImages']:
  paths += [(Path(item['bindingReceipt']),item['bindingReceiptSha256']),(Path(item['rawReport']['path']),item['rawReport']['sha256'])]
 paths += [(Path(item['path']),item['sha256'])for item in proposal['retainedSmallOciJson']]
 answer=[]
 for path,expected in paths:
  guard();actual=sha(path);assert actual==expected;answer.append({'path':str(path),'sha256':actual,'bytes':path.stat().st_size})
 return answer
try:
 guard();receipt['imagesBefore']=[imageproof(item)for item in proposal['retainedDockerImages']];receipt['retainedBefore']=retained()
 for r in files:
  p=Path(r['path']);assert not p.is_symlink()and same(p.lstat(),r)and sha(p)==r['sha256']
 holders=subprocess.run(['/usr/sbin/lsof','-Fpc','--',*[r['path']for r in files]],capture_output=True,text=True,timeout=15);assert holders.returncode==1 and not holders.stdout and not holders.stderr
 save();print(json.dumps({'directory':str(A),'phase':'exact-six-preflight-passed','files':len(files)}),flush=True)
 for r in files:
  guard();p=Path(r['path']);assert not p.is_symlink()and same(p.lstat(),r)
  fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
  with os.fdopen(fd,'rb')as stream:
   assert same(os.fstat(stream.fileno()),r);actual=hashlib.file_digest(stream,'sha256').hexdigest();assert actual==r['sha256']and same(os.fstat(stream.fileno()),r)and same(p.lstat(),r);os.unlink(p)
  syncdir(p.parent);assert not p.exists()and not p.is_symlink();receipt['completed'].append({'path':str(p),'bytes':r['bytes'],'sha256':actual,'absenceVerified':True,'parentFsynced':True});save()
 receipt['retainedAfter']=retained();receipt['imagesAfter']=[imageproof(item)for item in proposal['retainedDockerImages']];assert receipt['retainedBefore']==receipt['retainedAfter']and receipt['imagesBefore']==receipt['imagesAfter'];receipt.update(status='EXACT_SIX_UNLINKS_COMPLETE',freeBytesAfter=shutil.disk_usage(A).free,mainOriginalAbsent=True,javaOriginalPreserved=True,imagesAndRawReportsUnchanged=True)
 receipt['actualFreeBytesIncrease']=receipt['freeBytesAfter']-receipt['freeBytesBefore'];receipt['admission9GiBPassed']=receipt['freeBytesAfter']>=9663676416;receipt['nativeBuildLaunched']=False
except BaseException as error:receipt.update(status='CLEANUP_STOPPED_NO_RETRY',error=type(error).__name__+': '+str(error),traceback=traceback.format_exc(limit=5),freeBytesAfter=shutil.disk_usage(A).free);raise
finally:receipt['seconds']=round(time.monotonic()-started,3);save();print(json.dumps(receipt,indent=2),flush=True)
