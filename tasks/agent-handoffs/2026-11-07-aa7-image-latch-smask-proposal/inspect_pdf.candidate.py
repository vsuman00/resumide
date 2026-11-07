"""Fail-closed structural policy for hostile PDF output; no accessibility claim."""
import io, re, urllib.parse
from pypdf import PdfReader, apply_configuration
from pypdf._configuration import get_configuration
from pypdf.generic import DictionaryObject, ArrayObject, IndirectObject, NumberObject, FloatObject, NullObject, NameObject, StreamObject, EncodedStreamObject, DecodedStreamObject, ContentStream
class UnsafePDF(Exception): pass

# Pinned pypdf6.21.4 hooks: re-review on parser updates. This supervisor handles
# one request in one disposable process; these scoped class hooks are not thread-safe.
_RASTER_FILTERS={'/JPXDecode','/JPX','/DCTDecode','/DCT','/JBIG2Decode','/JBIG2','/CCITTFaxDecode','/CCF'}

def _resolved(value):
 seen=set()
 for _ in range(81):
  if not isinstance(value,IndirectObject):return value
  key=(id(value.pdf),value.idnum,value.generation)
  if key in seen:raise UnsafePDF()
  seen.add(key);value=value.get_object()
 raise UnsafePDF()

def _name(obj,key):
 if key not in obj:return None
 value=_resolved(obj.get(key))
 if not isinstance(value,NameObject):raise UnsafePDF()
 return value

def _reject_image_data(obj):
 if _name(obj,'/Subtype')=='/Image':raise UnsafePDF()
 if '/Filter' not in obj:return
 filters=_resolved(obj.get('/Filter'))
 if isinstance(filters,NameObject):filters=[filters]
 elif not isinstance(filters,ArrayObject):raise UnsafePDF()
 for value in filters:
  value=_resolved(value)
  if not isinstance(value,NameObject) or value in _RASTER_FILTERS:raise UnsafePDF()

def _embedded_font(obj):
 desc=_resolved(obj.get('/FontDescriptor'))
 if not isinstance(desc,DictionaryObject):raise UnsafePDF()
 embedded=[key for key in ['/FontFile','/FontFile2','/FontFile3'] if key in desc]
 if not embedded:raise UnsafePDF()
 for key in embedded:
  font=_resolved(desc.get(key))
  if not isinstance(font,StreamObject):raise UnsafePDF()
  _reject_image_data(font);fontdata=font.get_data()
  if not 0<len(fontdata)<=5242880:raise UnsafePDF()

class _ImageFreeContentStream(ContentStream):
 def _read_inline_image(self,stream,parsing_budget):
  # The real content tokenizer identified BI; reject before its image scanner.
  raise UnsafePDF()

def _graphics_content(value,reader):
 value=_resolved(value)
 if value is None or isinstance(value,NullObject):return
 if isinstance(value,ArrayObject):
  streams=[_resolved(item) for item in value]
  if not all(isinstance(item,StreamObject) for item in streams):raise UnsafePDF()
  content=_ImageFreeContentStream(value,reader)
  content.operations
  # Consumers may concatenate without the LF that pypdf inserts between streams.
  raw=bytearray();limit=get_configuration().array_based_stream_maximum_output_length
  for stream in streams:
   data=stream.get_data()
   if len(raw)+len(data)>limit:raise UnsafePDF()
   raw.extend(data)
  if raw!=content.get_data():
   joined=DecodedStreamObject();joined.set_data(bytes(raw))
   _ImageFreeContentStream(joined,reader).operations
 elif isinstance(value,StreamObject):_ImageFreeContentStream(value,reader).operations
 else:raise UnsafePDF()

def inspect_pdf(data):
 original=EncodedStreamObject.get_data
 policy_rejected=False
 def image_free_data(stream):
  nonlocal policy_rejected
  try:_reject_image_data(stream)
  except Exception:
   policy_rejected=True
   raise
  return original(stream)
 # Reader construction can decode XRef/ObjStm before the dictionary walk.
 EncodedStreamObject.get_data=image_free_data
 try:
  with apply_configuration(jbig2dec_binary=None,disable_legacy_handling=True):
   result=_inspect_pdf(data)
   # The pinned reader can swallow an earlier stream-policy exception.
   if policy_rejected:raise UnsafePDF()
   return result
 finally:EncodedStreamObject.get_data=original

def _inspect_pdf(data):
 if len(data)>5242880 or not data.startswith(b'%PDF-'): raise UnsafePDF()
 reader=PdfReader(io.BytesIO(data),strict=True)
 if reader.is_encrypted or not 1<=len(reader.pages)<=10: raise UnsafePDF()
 forbidden={'/AA','/JavaScript','/JS','/Launch','/EmbeddedFiles','/EF','/XFA','/AcroForm','/RichMedia','/RichMediaContent','/RichMediaSettings','/Sound','/Movie','/3D','/Collection','/SubmitForm','/ImportData','/GoToR','/GoToE'}
 seen=set(); count=0; graphics=[]
 def visit(obj,depth=0):
  nonlocal count
  count+=1
  if count>100000 or depth>80: raise UnsafePDF()
  if isinstance(obj,IndirectObject):
   key=(obj.idnum,obj.generation)
   if key in seen:return
   seen.add(key);obj=_resolved(obj)
  if isinstance(obj,DictionaryObject):
   kind=_name(obj,'/Type');subtype=_name(obj,'/Subtype')
   _reject_image_data(obj)
   if '/AP' in obj or forbidden.intersection(obj.keys()):raise UnsafePDF()
   if kind=='/XObject' and subtype!='/Form':raise UnsafePDF()
   pattern=_resolved(obj.get('/PatternType'))
   if subtype=='/Form' or pattern==1:
    if not isinstance(obj,StreamObject):raise UnsafePDF()
    graphics.append(obj)
   if '/XObject' in obj:
    resources=_resolved(obj.get('/XObject'))
    if not isinstance(resources,DictionaryObject):raise UnsafePDF()
    for item in resources.values():
     item=_resolved(item)
     if not isinstance(item,StreamObject) or _name(item,'/Subtype')!='/Form':raise UnsafePDF()
   if '/SMask' in obj:
    mask=_resolved(obj.get('/SMask'))
    if isinstance(mask,NameObject):
     if mask!='/None':raise UnsafePDF()
    else:
     if not isinstance(mask,DictionaryObject):raise UnsafePDF()
     group=_resolved(mask.get('/G'))
     if not isinstance(group,StreamObject) or _name(group,'/Subtype')!='/Form':raise UnsafePDF()
   if '/Font' in obj:
    resources=_resolved(obj.get('/Font'))
    if not isinstance(resources,DictionaryObject):raise UnsafePDF()
    for item in resources.values():
     item=_resolved(item)
     if not isinstance(item,DictionaryObject) or _name(item,'/Type')!='/Font':raise UnsafePDF()
   if '/OpenAction' in obj:
    dest=_resolved(obj['/OpenAction'])
    if not isinstance(dest,ArrayObject) or not 2<=len(dest)<=6:raise UnsafePDF()
    first=_resolved(dest[0])
    if not isinstance(first,DictionaryObject) or _name(first,'/Type')!='/Page':raise UnsafePDF()
    if dest[1] not in ['/Fit','/FitH','/FitV','/FitR','/FitB','/FitBH','/FitBV','/XYZ']:raise UnsafePDF()
    if any(not isinstance(arg,(NumberObject,FloatObject,NullObject)) for arg in dest[2:]):raise UnsafePDF()
   if kind=='/Filespec':raise UnsafePDF()
   if '/S' in obj:
    if obj['/S'] not in ['/URI','/GoTo','/Transparency','/Luminosity','/Alpha']:raise UnsafePDF()
    if obj['/S'] in ['/URI','/GoTo'] and '/Next' in obj:raise UnsafePDF()
   if '/URI' in obj:
    uri=str(obj['/URI']); decoded=urllib.parse.unquote(uri)
    parsed=urllib.parse.urlsplit(uri)
    if re.search(r'[\x00-\x20\x7f-\x9f\\<>]',decoded) or parsed.scheme.lower() not in ['http','https','mailto'] or parsed.username or parsed.password:raise UnsafePDF()
    if parsed.scheme.lower() in ['http','https'] and not parsed.hostname:raise UnsafePDF()
   if kind=='/Action' or '/A' in obj:
    action=obj.get('/A',obj)
    action=_resolved(action)
    if not isinstance(action,DictionaryObject) or action.get('/S') not in ['/URI','/GoTo']:raise UnsafePDF()
   if kind=='/Annot' and subtype!='/Link':raise UnsafePDF()
   if kind=='/Font':
    if subtype=='/Type3':raise UnsafePDF()
    if subtype=='/Type0':
     descendants=_resolved(obj.get('/DescendantFonts'))
     if not isinstance(descendants,ArrayObject) or len(descendants)!=1:raise UnsafePDF()
     child=_resolved(descendants[0])
     if not isinstance(child,DictionaryObject) or _name(child,'/Type')!='/Font' or _name(child,'/Subtype') not in ['/CIDFontType0','/CIDFontType2']:raise UnsafePDF()
     _embedded_font(child)
    else:_embedded_font(obj)
   for val in obj.values():visit(val,depth+1)
  elif isinstance(obj,ArrayObject):
   for val in obj:visit(val,depth+1)
 visit(reader.trailer)
 # Visit unreferenced objects too; readers must not expose dormant active objects.
 for generation, objects in reader.xref.items():
  if generation==65535:continue
  for number in objects:
   if number:visit(IndirectObject(number,generation,reader))
 for number in reader.xref_objStm:visit(IndirectObject(number,0,reader))
 for page in reader.pages:
  if page.get('/Rotate',0)%360:raise UnsafePDF()
  box=page.mediabox
  if float(page.get('/UserUnit',1))!=1:raise UnsafePDF()
  if any(abs(float(a)-float(b))>1 for a,b in zip(page.cropbox,box)):raise UnsafePDF()
  if abs(float(box.left))>1 or abs(float(box.bottom))>1:raise UnsafePDF()
  w,h=float(box.width),float(box.height)
  if not any(abs(w-x)<2 and abs(h-y)<2 for x,y in [(595.276,841.89),(612,792)]):raise UnsafePDF()
 for stream in graphics:_graphics_content(stream,reader)
 for page in reader.pages:_graphics_content(page.get('/Contents'),reader)
 return len(reader.pages)
