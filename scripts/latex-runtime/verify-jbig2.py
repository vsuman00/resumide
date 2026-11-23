"""Synthetic inspector regression; vendor subprocess is a recording canary, never executed."""
import hashlib,io,json,sys
sys.path.insert(0,'/opt/latex')
from pypdf import PdfWriter,apply_configuration,get_configuration
import pypdf.filters as filters

PREFIX=b'%PDF-1.5\n'
MALFORMED_JBIG2=(PREFIX+b'1 0 obj\n<< /Type /XRef /Size 2 /Index [0 1] /W [1 1 1] /Root 2 0 R /Length 1 /Filter /JBIG2Decode >>\nstream\nX\nendstream\nendobj\nstartxref\n'+str(len(PREFIX)).encode()+b'\n%%EOF\n')

def run_probe(inspect_function):
 writer=PdfWriter();writer.add_blank_page(width=612,height=792);stream=io.BytesIO();writer.write(stream);neutral=stream.getvalue()
 canary='/controlled-optional-decoder-never-executed';prior=get_configuration();original_run=filters.subprocess.run;original_temporary=filters.TemporaryDirectory;original_legacy=filters.JBIG2DEC_BINARY
 results=[]
 try:
  for mode in ['explicit-configuration','legacy-configuration']:
   counters={'subprocessAttempts':0,'temporaryDirectories':0}
   def never_execute(argv,*args,**kwargs):
    counters['subprocessAttempts']+=1
    assert isinstance(argv,list) and argv[0]==canary
    raise RuntimeError('controlled decoder canary; no binary executed')
   def tracked_temporary(*args,**kwargs):
    counters['temporaryDirectories']+=1
    return original_temporary(dir='/scratch')
   filters.subprocess.run=never_execute;filters.TemporaryDirectory=tracked_temporary
   filters.JBIG2DEC_BINARY=canary if mode=='legacy-configuration' else original_legacy
   with apply_configuration(jbig2dec_binary=canary if mode=='explicit-configuration' else None,disable_legacy_handling=False):
    incoming=get_configuration();rejected=False;error_class=None
    try:inspect_function(MALFORMED_JBIG2)
    except Exception as error:rejected=True;error_class=type(error).__name__
    restored_inside=get_configuration()is incoming
   result={'case':mode,'rejected':rejected,'errorClass':error_class,**counters,'incomingConfigurationRestored':restored_inside}
   results.append(result)
   assert rejected
   assert counters['subprocessAttempts']==0
   assert counters['temporaryDirectories']==0
   assert restored_inside
  filters.subprocess.run=original_run;filters.TemporaryDirectory=original_temporary;filters.JBIG2DEC_BINARY=original_legacy
  incoming=get_configuration();normal_pages=inspect_function(neutral);normal_restored=get_configuration()is incoming
  assert normal_pages==1 and normal_restored
 finally:
  filters.subprocess.run=original_run;filters.TemporaryDirectory=original_temporary;filters.JBIG2DEC_BINARY=original_legacy
 assert get_configuration()is prior
 return {'expectBlocked':True,'malformedBytes':len(MALFORMED_JBIG2),'malformedSha256':hashlib.sha256(MALFORMED_JBIG2).hexdigest(),'cases':results,'neutralPages':normal_pages,'neutralConfigurationRestored':normal_restored,'outerConfigurationRestored':True,'externalBinaryExecuted':False}

if __name__=='__main__':
 from inspect_pdf import inspect_pdf
 print(json.dumps(run_probe(inspect_pdf),sort_keys=True))
