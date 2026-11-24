"""Disposable request supervisor. Never return compiler logs or source excerpts."""
import base64, hashlib, json, os, pathlib, re, resource, subprocess, sys, selectors, time
# Map log lines to fixed kinds and line numbers only. Matched text is never emitted.
ERROR_KINDS=[(re.compile(rb'Undefined control sequence'),'undefined_command'),
 (re.compile(rb'Missing [{}] inserted|Extra \}|Runaway argument|File ended while scanning|Paragraph ended before'),'missing_brace'),
 (re.compile(rb"LaTeX Error: File `[^']*' not found"),'missing_package'),
 (re.compile(rb'LaTeX Error: \\begin\{[^}]*\} on input line \d+ ended by|LaTeX Error: \\begin\{[^}]*\} ended by'),'environment_mismatch')]
FILE_LINE=re.compile(rb'^(?:\./|/scratch/)?main\.tex:(\d+): (.*)$',re.M)
OVERFULL=re.compile(rb'^Overfull \\[hv]box \(([\d.]+)pt too (?:wide|high)\)(?: in paragraph at lines (\d+)--\d+| detected at line (\d+))?',re.M)
# Small overflows are warnings (BX-D1). Larger ones can hide text off the page, so they fail.
OVERFULL_LIMIT_PT=20.0

def line_number(raw):
 n=int(raw)
 return n if 0<n<=100000 else None

def error_diagnostic(log):
 match=FILE_LINE.search(log)
 message=match.group(2) if match else next((l[2:] for l in log.splitlines() if l.startswith(b'! ')),b'')
 kind=next((k for pattern,k in ERROR_KINDS if pattern.search(message)),'other')
 return {'kind':kind,'line':line_number(match.group(1)) if match else None}

def warnings(log):
 found=[]
 for match in OVERFULL.finditer(log):
  raw=match.group(2) or match.group(3)
  entry={'kind':'overfull_box','line':line_number(raw) if raw else None,'severity':'warning'}
  if float(match.group(1))>OVERFULL_LIMIT_PT:return {'kind':'overfull_box','line':entry['line']}
  if entry not in found and len(found)<20:found.append(entry)
 return found

if '--self-test' in sys.argv:
 log=(b'This is XeTeX\n./main.tex:12: Undefined control sequence.\nl.12 \\foo\n'
  b'Overfull \\hbox (0.78pt too wide) in paragraph at lines 7--8\n'
  b'Overfull \\hbox (0.78pt too wide) in paragraph at lines 7--8\n'
  b'Overfull \\vbox (3.0pt too high) has occurred while \\output is active\n')
 assert error_diagnostic(log)=={'kind':'undefined_command','line':12}
 assert error_diagnostic(b"./main.tex:4: LaTeX Error: File `x.sty' not found.")=={'kind':'missing_package','line':4}
 assert error_diagnostic(b'./main.tex:9: LaTeX Error: \\begin{itemize} on input line 5 ended by \\end{document}.')=={'kind':'environment_mismatch','line':9}
 assert error_diagnostic(b'./main.tex:3: Missing } inserted.')=={'kind':'missing_brace','line':3}
 assert error_diagnostic(b'! Emergency stop.')=={'kind':'other','line':None}
 assert error_diagnostic(b'./main.tex:999999: Undefined control sequence.')=={'kind':'undefined_command','line':None}
 assert warnings(log)==[{'kind':'overfull_box','line':7,'severity':'warning'},{'kind':'overfull_box','line':None,'severity':'warning'}]
 assert warnings(b'Overfull \\hbox (712.5pt too wide) in paragraph at lines 4--4\n')=={'kind':'overfull_box','line':4}
 many=b''.join(b'Overfull \\hbox (1pt too wide) in paragraph at lines %d--%d\n'%(n,n) for n in range(1,40))
 assert len(warnings(many))==20
 print('supervisor diagnostics self-test passed');sys.exit(0)
sys.path.insert(0,'/opt/latex')
from inspect_pdf import inspect_pdf
from native_geometry import GeometryError, parse_geometry
resource.setrlimit(resource.RLIMIT_CORE,(0,0))
resource.setrlimit(resource.RLIMIT_CPU,(10,10))
resource.setrlimit(resource.RLIMIT_FSIZE,(8388608,8388608))
os.umask(0o077)

def output(code,diagnostic=None):
 reply={'error':code}
 if diagnostic is not None:reply['diagnostic']=diagnostic
 print(json.dumps(reply,separators=(',',':')));sys.exit(0)


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
 if result.returncode:output('compile_failed',error_diagnostic(logdata))
 # Overfull boxes are warnings (owner decision BX-D1); the PDF is still inspected below.
 diagnostics=warnings(logdata)
 if isinstance(diagnostics,dict):output('layout_overflow',diagnostics)
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
 print(json.dumps({'pdf':base64.b64encode(pdf).decode('ascii'),'pages':pages,'text':text,'diagnostics':diagnostics},separators=(',',':')))
except subprocess.TimeoutExpired:output('timeout')
except BaseException as error:
 if isinstance(error,SystemExit):raise
 output('output_invalid')
