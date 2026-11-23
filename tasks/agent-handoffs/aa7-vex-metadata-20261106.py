"""Trusted read-only metadata for a scoped AA7 applicability proposal; no exploit."""
import hashlib,json,os,re,stat,subprocess,sys
from pathlib import Path
sys.path.insert(0,'/opt/latex')
import inspect_pdf
import xml.etree.ElementTree
MAX=16*1024*1024
cache={}
total=0

def read(p):
 global total
 resolved=Path(p).resolve(strict=True)
 if resolved in cache:return cache[resolved]
 if resolved.stat().st_size>MAX:raise ValueError('metadata file cap')
 data=resolved.read_bytes();total+=len(data)
 if total>64*1024*1024:raise ValueError('metadata total cap')
 cache[resolved]=data
 return data

def sha(data):return hashlib.sha256(data).hexdigest()
hash_cache={}
hash_total=0
def hash_file(p):
 global hash_total
 path=Path(p).resolve(strict=True)
 if path in hash_cache:return hash_cache[path]
 size=path.stat().st_size
 if size>64*1024*1024:raise ValueError('binary file cap')
 h=hashlib.sha256();count=0
 with path.open('rb') as stream:
  while True:
   chunk=stream.read(65536)
   if not chunk:break
   count+=len(chunk);hash_total+=len(chunk)
   if count>64*1024*1024 or hash_total>256*1024*1024:raise ValueError('binary stream cap')
   h.update(chunk)
 if count!=size:raise ValueError('binary size changed')
 hash_cache[path]=h.hexdigest();return hash_cache[path]
manifest=json.loads(read('/opt/latex/closure.json'))
read_paths=set(read('/opt/latex/read-paths').decode().splitlines())
loaders=read('/opt/latex/loader-paths').decode().splitlines()
status=read('/proc/self/status').decode()
assert os.getuid()==65532 and re.search(r'^CapEff:\s+0+$',status,re.M) and re.search(r'^NoNewPrivs:\s+1$',status,re.M)
paths=['/usr/bin/xetex','/usr/bin/xdvipdfmx','/usr/bin/pdftotext','/usr/bin/python3.13','/usr/bin/mount','/usr/bin/nsenter','/usr/bin/infocmp','/usr/bin/perl','/usr/bin/xdg-email','/usr/bin/xdg-open','/usr/bin/thunderbird','/usr/lib/gnupg/tpm2daemon','/usr/libexec/tpm2daemon','/usr/lib/aarch64-linux-gnu/libmount.so.1']
packages=['util-linux','libmount1:arm64','ncurses-bin','perl','perl-base','perl-modules-5.40','xdg-utils','gpg','gpgconf']
package_lists={}
for name in packages:
 p=Path('/var/lib/dpkg/info')/(name+'.list')
 if not p.exists() and ':'in name:p=Path('/var/lib/dpkg/info')/(name.split(':')[0]+'.list')
 if p.exists():
  b=read(p);package_lists[name]={'path':str(p),'sha256':sha(b),'files':b.decode().splitlines()}
for p in package_lists.get('perl-modules-5.40',{}).get('files',[]):
 if p.endswith('/Archive/Tar.pm'):paths.append(p)
records=[]
for p in paths:
 path=Path(p);exists=path.exists();record={'path':p,'exists':exists,'compilerReadGranted':p in read_paths,'compilerExecGranted':p in ['/usr/bin/xetex','/usr/bin/xdvipdfmx',*loaders]}
 if exists:
  resolved=str(path.resolve());record.update(resolvedPath=resolved,sha256=hash_file(path),bytes=path.stat().st_size,mode=oct(stat.S_IMODE(path.stat().st_mode)),compilerResolvedReadGranted=resolved in read_paths,packageOwners=[n for n,v in package_lists.items()if p in v['files']or resolved in v['files']])
  if p.endswith('/Archive/Tar.pm')or p=='/usr/bin/xdg-email':
   b=read(path)
   markers=['sub _read_tar','thunderbird','read($$data']
   record['sourceMarkers']=[{'line':i,'sha256':sha(line.encode()),'marker':m}for i,line in enumerate(b.decode().splitlines(),1)for m in markers if m in line]
 records.append(record)
ldd=[]
for p in paths[:4]:
 r=subprocess.run(['/usr/bin/ldd',p],capture_output=True,timeout=3)
 assert r.returncode==0 and len(r.stdout)<65536 and len(r.stderr)<65536
 entries=[]
 for line in r.stdout.decode().splitlines():
  found=re.search(r'(?:=>\s+)?(/[^\s]+)',line)
  if found:
   path=found.group(1);entries.append({'path':path,'sha256':hash_file(path)})
 assert entries and b'not found'not in r.stdout
 ldd.append({'program':p,'exitCode':r.returncode,'dependencies':entries})
installed=read('/opt/latex/packages.lock').decode().splitlines()
blocked_names=[p for p in installed if re.search(r'^(?:tpm2daemon|thunderbird|libtss2[^=]*)=',p)]
assert not blocked_names
loaded=sorted({line.split()[-1]for line in read('/proc/self/maps').decode().splitlines()if line.split()and line.split()[-1].startswith('/')})
report={'schemaVersion':'aa7-vex-metadata/1','scope':'Trusted metadata only; no finding disposition or human acceptance','uid':os.getuid(),'effectiveCapabilitiesZero':True,'noNewPrivileges':True,'closureManifestSha256':sha(read('/opt/latex/closure.json')),'readPathsSha256':sha(read('/opt/latex/read-paths')),'loaderPathsSha256':sha(read('/opt/latex/loader-paths')),'loaders':loaders,'sourceFiles':{p:sha(read('/opt/latex/'+p))for p in ['supervisor.py','inspect_pdf.py','landlock.c','confine','texmf.cnf']},'files':records,'ldd':ldd,'metadataPythonLoadedFiles':[{'path':p,'sha256':hash_file(p)}for p in loaded],'metadataPythonImportedModuleNames':sorted(sys.modules),'forbiddenComponentPackages':blocked_names,'packageListHashes':{n:{'path':v['path'],'sha256':v['sha256']}for n,v in package_lists.items()},'packageLockSha256':sha(read('/opt/latex/packages.lock')),'packageCount':len(installed)}
report['hashReadBytes']=hash_total;report['hashReadFiles']=len(hash_cache);report['hashLimits']={'perBinaryBytes':64*1024*1024,'totalBytes':256*1024*1024,'chunkBytes':65536};report['metadataReadBytes']=total
output=json.dumps(report,sort_keys=True).encode();assert len(output)<2*1024*1024
sys.stdout.buffer.write(output+b'\n')
