"""Build an explicit inventoried read closure, never a /usr-wide Landlock rule."""
import glob, hashlib, json, os, pathlib, re, subprocess, sys, tempfile


def require_paths(paths, allowed=None, elf=False):
 paths=sorted(set(str(pathlib.Path(p).resolve()) for p in paths))
 if not paths: raise RuntimeError('Required runtime input group is empty')
 for name in paths:
  p=pathlib.Path(name)
  if not p.is_file() or p.stat().st_size==0: raise RuntimeError('Missing or empty runtime input: '+name)
  if allowed is not None and name not in allowed: raise RuntimeError('Required input is outside read closure: '+name)
  if elf:
   with p.open('rb') as f:
    if f.read(4)!=b'\x7fELF': raise RuntimeError('Required executable/loader is not ELF: '+name)
 return paths


if '--self-test' in sys.argv:
 with tempfile.TemporaryDirectory() as d:
  p=pathlib.Path(d)/'input'; p.write_bytes(b'\x7fELFtest')
  assert require_paths([p],{str(p.resolve())},elf=True)==[str(p.resolve())]
  for paths,allowed,elf in [([],None,False),([p],set(),False),([p.with_name('missing')],None,False)]:
   try: require_paths(paths,allowed,elf)
   except RuntimeError: pass
   else: raise AssertionError('Invalid closure input accepted')
  p.write_bytes(b'')
  try: require_paths([p])
  except RuntimeError: pass
  else: raise AssertionError('Empty input accepted')
  p.write_bytes(b'not ELF')
  try: require_paths([p],elf=True)
  except RuntimeError: pass
  else: raise AssertionError('Non-ELF executable accepted')
 print('closure completeness self-test passed')
 sys.exit(0)

sealed_fontconfig=json.loads(subprocess.check_output([sys.executable,'/opt/latex/build-fontconfig.py'],text=True))
if sealed_fontconfig['config']!='/opt/latex/fontconfig/fonts.conf' or sealed_fontconfig['searchPath']!='/opt/latex/fontconfig':
 raise RuntimeError('Unexpected sealed Fontconfig location')
for path,digest in sealed_fontconfig['files'].items():
 require_paths([path])
 if hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()!=digest: raise RuntimeError('Invalid sealed Fontconfig hash')
root=pathlib.Path('/usr/share/texlive/texmf-dist')
roots=['tex/latex/base','tex/latex/l3kernel','tex/latex/l3backend','tex/latex/l3packages','tex/latex/titlesec','tex/latex/amsmath','tex/latex/amsfonts','tex/latex/enumitem','tex/latex/geometry','tex/latex/hyperref','tex/latex/xcolor','tex/latex/graphics','tex/latex/graphics-def','tex/latex/graphics-cfg','tex/latex/auxhook','tex/latex/refcount','tex/latex/rerunfilecheck','tex/latex/letltxmacro','tex/latex/atveryend','tex/latex/atbegshi','tex/latex/kvoptions','tex/latex/kvsetkeys','tex/latex/kvdefinekeys','tex/latex/gettitlestring','tex/latex/hycolor','tex/latex/url','tex/generic/iftex','tex/generic/infwarerr','tex/generic/ltxcmds','tex/generic/kvdefinekeys','tex/generic/kvsetkeys','tex/generic/pdftexcmds','tex/generic/pdfescape','tex/generic/etexcmds','tex/generic/intcalc','tex/generic/bigintcalc','tex/generic/bitset','tex/generic/uniquecounter','tex/generic/stringenc','tex/generic/gettitlestring','tex/generic/atbegshi','tex/generic/hyph-utf8','tex/generic/unicode-data','fonts/misc/xetex/fontmapping','fonts/tfm/adobe/zapfding','fonts/tfm/urw35vf/zapfding','fonts/type1/urw/zapfding','fonts/tfm/public/cm','fonts/tfm/public/amsfonts','fonts/tfm/public/latex-fonts','fonts/tfm/public/ec','fonts/type1/public/amsfonts','fonts/type1/public/cm-super','fonts/vf/public/ae','fonts/enc/dvips/base','fonts/enc/dvips/cm-super','fonts/map/dvipdfmx','dvipdfmx']
files=set()
for name in roots:
 p=root/name
 if p.exists(): files.update(str(x.resolve()) for x in p.rglob('*') if x.is_file())
for pattern in ['/var/lib/texmf/web2c/xetex/xelatex.fmt','/var/lib/texmf/fonts/map/dvipdfmx/**/*','/var/lib/texmf/fonts/map/dvips/**/*','/var/lib/texmf/fonts/map/pdftex/**/*','/etc/texmf/dvipdfmx/**/*','/usr/share/texmf/fonts/opentype/public/lm/*','/usr/share/texmf/fonts/type1/public/lm/*','/usr/share/texmf/fonts/tfm/public/lm/*','/usr/share/texmf/fonts/enc/dvips/lm/*']:
 files.update(str(pathlib.Path(p).resolve()) for p in glob.glob(pattern,recursive=True) if pathlib.Path(p).is_file())
files.add('/opt/latex/texmf.cnf')
required_transitives=require_paths([root/'tex/latex/etoolbox/etoolbox.sty','/etc/paperspecs'])
files.update(required_transitives)
loaders=set()
for binary in ['/usr/bin/xetex','/usr/bin/xdvipdfmx']:
 require_paths([binary],elf=True)
 files.add(str(pathlib.Path(binary).resolve()))
 dependencies=subprocess.check_output(['ldd',binary],text=True)
 if 'not found' in dependencies: raise RuntimeError('Unresolved engine dependency: '+binary)
 engine_loaders=set()
 for line in dependencies.splitlines():
  for path in re.findall(r'/[^\s()]+',line):
   p=pathlib.Path(path)
   require_paths([p],elf=True)
   files.add(str(p.resolve()))
   if 'ld-linux' in path: engine_loaders.add(str(p.resolve()))
 require_paths(engine_loaders,files,elf=True)
 loaders.update(engine_loaders)
# Only the sealed configuration clone is readable; original user includes are not granted.
files.update(sealed_fontconfig['files'])
for directory in ['/var/cache/fontconfig']:
 files.update(str(p.resolve()) for p in pathlib.Path(directory).rglob('*') if p.is_file())
# The ELF loader cache and locale data are fixed runtime inputs.
for p in ['/etc/ld.so.cache','/usr/lib/locale/C.utf8/LC_CTYPE']:
 if pathlib.Path(p).is_file(): files.add(p)
# Validate the supported surface before writing any closure artifacts or hashes.
required_styles=[str(root/p) for p in ['tex/latex/titlesec/titlesec.sty','tex/latex/base/latexsym.sty','tex/latex/amsfonts/amssymb.sty','tex/latex/amsmath/amsmath.sty','tex/latex/enumitem/enumitem.sty','tex/latex/geometry/geometry.sty','tex/latex/hyperref/hyperref.sty','tex/latex/xcolor/xcolor.sty']]
required_fonts={}
for label,pattern in {
 'latinModernOpenType':'/usr/share/texmf/fonts/opentype/public/lm/*.otf',
 'latinModernType1':'/usr/share/texmf/fonts/type1/public/lm/*.pfb',
 'latinModernMetrics':'/usr/share/texmf/fonts/tfm/public/lm/*.tfm',
 'latinModernEncodings':'/usr/share/texmf/fonts/enc/dvips/lm/*.enc',
 'computerModernMetrics':str(root/'fonts/tfm/public/cm/cmr10.tfm'),
 'computerModernType1':str(root/'fonts/type1/public/amsfonts/cm/cmr10.pfb'),
}.items():
 try: required_fonts[label]=require_paths(glob.glob(pattern),files)
 except RuntimeError as error: raise RuntimeError('Required font group '+label+': '+str(error)) from error
required_styles=require_paths(required_styles,files)
required_runtime=require_paths(['/var/lib/texmf/web2c/xetex/xelatex.fmt','/opt/latex/texmf.cnf','/etc/ld.so.cache',sealed_fontconfig['config']],files)
require_paths(loaders,files,elf=True)
dirs={str(p) for f in files for p in pathlib.Path(f).parents if str(p)!='.'}
pathlib.Path('/opt/latex/read-paths').write_text('\n'.join(sorted(files|dirs))+'\n')
pathlib.Path('/opt/latex/loader-paths').write_text('\n'.join(sorted(loaders))+'\n')
manifest={'policy':'latex-source/1.0.0','snapshot':'20261106T000000Z','fontconfig':sealed_fontconfig,'requiredStyles':required_styles,'requiredTransitiveFiles':required_transitives,'requiredFonts':required_fonts,'requiredRuntime':required_runtime,'files':{p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in sorted(files)},'directories':sorted(dirs),'executables':['/usr/bin/xetex','/usr/bin/xdvipdfmx'],'elfInterpreters':sorted(loaders)}
pathlib.Path('/opt/latex/closure.json').write_text(json.dumps(manifest,sort_keys=True))
