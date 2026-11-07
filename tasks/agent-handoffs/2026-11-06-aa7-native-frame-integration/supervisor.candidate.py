"""Disposable request supervisor. Never return compiler logs or source excerpts."""
import base64, hashlib, json, os, pathlib, resource, subprocess, sys, selectors, time
sys.path.insert(0,'/opt/latex')
from inspect_pdf import inspect_pdf
from native_geometry import GeometryError, parse_geometry
resource.setrlimit(resource.RLIMIT_CORE,(0,0))
resource.setrlimit(resource.RLIMIT_CPU,(10,10))
resource.setrlimit(resource.RLIMIT_FSIZE,(8388608,8388608))
os.umask(0o077)

def output(code):
 print(json.dumps({'error':code},separators=(',',':')));sys.exit(0)

def run(args):
 # Keep diagnostics transient in the trusted supervisor, never in Docker logs.
 with open('/dev/null','rb') as null:
  proc=subprocess.Popen(args,stdin=null,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,close_fds=True,
   env={'HOME':'/opt/latex/home','LANG':'C.UTF-8','FONTCONFIG_FILE':'/opt/latex/fontconfig/fonts.conf','FONTCONFIG_PATH':'/opt/latex/fontconfig'})
  output=bytearray(); deadline=time.monotonic()+14
  with selectors.DefaultSelector() as selector:
   selector.register(proc.stdout,selectors.EVENT_READ)
   try:
    while selector.get_map():
     if time.monotonic()>deadline:raise subprocess.TimeoutExpired(args,14)
     for key,_ in selector.select(0.1):
      chunk=os.read(key.fd,65536)
      if not chunk:selector.unregister(key.fileobj)
      else:
       output.extend(chunk)
       if len(output)>1048576:raise RuntimeError('bounded diagnostic output')
    code=proc.wait(timeout=max(0.01,deadline-time.monotonic()))
    return subprocess.CompletedProcess(args,code,stdout=bytes(output))
   finally:
    if proc.poll() is None:proc.kill();proc.wait()
    proc.stdout.close()
try:
 raw=sys.stdin.buffer.read(300000)
 if len(raw)>=300000:output('source_invalid')
 request=json.loads(raw)
 if set(request)!={'source'} or not isinstance(request['source'],str):output('source_invalid')
 source=request['source'].encode('utf-8',errors='strict')
 if not 0<len(source)<=49152:output('source_invalid')
 # Verify the sealed read closure before executing hostile input.
 manifest=json.loads(pathlib.Path('/opt/latex/closure.json').read_text())
 for path,digest in manifest['files'].items():
  if hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()!=digest:output('runtime_unavailable')
 pathlib.Path('/scratch/main.tex').write_bytes(source)
 result=run(['/opt/latex/confine','/usr/bin/xetex','-progname=xelatex','-fmt=xelatex','-no-pdf','-no-shell-escape','-interaction=nonstopmode','-halt-on-error','-file-line-error','-output-directory=/scratch','main.tex'])
 if result.returncode==78:output('runtime_unavailable')
 log=pathlib.Path('/scratch/main.log')
 if not log.exists() or log.stat().st_size>1048576:output('compile_failed')
 logdata=result.stdout+log.read_bytes()
 if b'Missing character:' in logdata:output('missing_glyph')
 if b'Overfull \\hbox' in logdata or b'Overfull \\vbox' in logdata:output('layout_overflow')
 if result.returncode:output('compile_failed')
 result=run(['/opt/latex/confine','/usr/bin/xdvipdfmx','-q','-o','/scratch/main.pdf','/scratch/main.xdv'])
 if result.returncode==78:output('runtime_unavailable')
 if result.returncode:output('compile_failed')
 path=pathlib.Path('/scratch/main.pdf')
 if not path.is_file() or path.stat().st_size>5242880:output('output_invalid')
 pdf=path.read_bytes();pages=inspect_pdf(pdf)
 if run(['/usr/bin/pdftotext','-resumide-bbox','/scratch/main.pdf','/scratch/text.frame']).returncode:output('output_invalid')
 textpath=pathlib.Path('/scratch/text.frame')
 if textpath.stat().st_size>2097152:output('output_invalid')
 try:text=parse_geometry(textpath.read_bytes(),pages)
 except GeometryError as error:output(error.code)
 print(json.dumps({'pdf':base64.b64encode(pdf).decode('ascii'),'pages':pages,'text':text,'diagnostics':[]},separators=(',',':')))
except subprocess.TimeoutExpired:output('timeout')
except BaseException as error:
 if isinstance(error,SystemExit):raise
 output('output_invalid')
