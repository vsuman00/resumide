"""Normal native Debian build plus bounded source/ABI/fixed-font evidence."""
import json
import os
import pathlib
import re
import resource
import shlex
import shutil
import signal
import subprocess
import time
from expat_source import digest
from prepare import prepare
from budget_adapter import generate

export = pathlib.Path('/export')
phases = []
phase = 'isolation'
source = None
receipt = None
started = time.monotonic()


def run(argv, name, cwd=None, env=None, timeout=1200):
    global phase
    phase = name
    log = export / (name + '.log')
    with log.open('wb') as output:
        p = subprocess.Popen(argv, cwd=cwd, env=env, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        begin = time.monotonic()
        try:
            while p.poll() is None:
                if (time.monotonic() - begin > timeout or time.monotonic() - started > 1800
                        or log.stat().st_size > 33554432
                        or sum(f.stat().st_size for f in export.iterdir() if f.is_file()) > 268435456):
                    raise RuntimeError('native phase resource bound')
                time.sleep(.1)
        finally:
            if p.poll() is None:
                os.killpg(p.pid, signal.SIGKILL); p.wait()
            output.flush()
            phases.append({'name': name, 'exitCode': p.returncode, 'seconds': round(time.monotonic() - begin, 3), 'logSha256': digest(log)})
    if (time.monotonic() - begin > timeout or time.monotonic() - started > 1800
            or sum(f.stat().st_size for f in export.iterdir() if f.is_file()) > 268435456):
        raise RuntimeError('terminal native phase/global/export bound')
    if p.returncode or log.stat().st_size > 33554432:
        raise RuntimeError('native phase failed: ' + name)
    return log.read_text(errors='replace')


try:
    status = dict(line.split(':', 1) for line in pathlib.Path('/proc/self/status').read_text().splitlines() if ':' in line)
    if (os.getuid() != 65532 or status['NoNewPrivs'].strip() != '1'
            or any(int(status[n].strip(), 16) for n in ('CapEff', 'CapPrm', 'CapBnd', 'CapAmb'))
            or os.environ.get('HOME') != '/work' or os.environ.get('LANG') != 'C.UTF-8'):
        raise ValueError('native build isolation differs')
    resource.setrlimit(resource.RLIMIT_FSIZE, (33554432, 33554432))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    source, pins, receipt = prepare(pathlib.Path('/inputs'), pathlib.Path('/recipe'), pathlib.Path('/work'))
    env = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/work', 'LANG': 'C.UTF-8',
           'SOURCE_DATE_EPOCH': str(pins['sourceDateEpoch']), 'DEB_BUILD_OPTIONS': 'parallel=2'}
    if run(['dpkg-query', '-W', '-f=${Version}', 'libfreetype-dev'], 'baseline-header-version', env=env).strip() != pins['baselineVersion']:
        raise ValueError('old header package differs')
    cflags = shlex.split(subprocess.check_output(['pkg-config', '--cflags', '--libs', 'freetype2'], env=env, text=True))
    client = pathlib.Path('/work/old-header-fonts')
    run(['gcc', '-Wall', '-Wextra', '-Werror', '/recipe/abi-fonts.c', '-o', str(client), *cflags], 'compile-old-header-client', env=env)
    baseline_metrics = {}
    for i, font in enumerate(pins['neutralFonts']):
        if digest(pathlib.Path(font)) != pins['neutralFontSha256'][font]:
            raise ValueError('neutral fixed font identity differs')
        baseline_metrics[font] = run([str(client), font], 'baseline-font-' + str(i), env=env)
    run(['dpkg-checkbuilddeps'], 'normal-original-build-dependencies', cwd=source, env=env)
    run(['dpkg-buildpackage', '--no-sign', '-b', '-j2'], 'normal-original-debian-build', cwd=source, env=env)
    archive_names = {}
    for name in ('libfreetype6', 'libfreetype-dev'):
        files = list(source.parent.glob(name + '_' + pins['packageVersion'] + '_arm64.deb'))
        if len(files) != 1:
            raise ValueError('exact native package missing')
        package = files[0]
        if package.stat().st_size > 67108864:
            raise ValueError('package bound exceeded')
        archive_names[name] = {'file': package.name, 'sha256': digest(package), 'version': pins['packageVersion']}
    candidate = pathlib.Path('/work/candidate'); candidate.mkdir()
    for name, item in archive_names.items():
        run(['dpkg-deb', '-x', str(source.parent / item['file']), str(candidate)], 'extract-' + name, env=env)
    arch = subprocess.check_output(['dpkg-architecture', '-qDEB_HOST_MULTIARCH'], env=env, text=True).strip()
    libdir = candidate / 'usr/lib' / arch
    library = (libdir / 'libfreetype.so.6').resolve(strict=True)
    baseline = pathlib.Path('/usr/lib') / arch / 'libfreetype.so.6'
    symbols = lambda f: {row.split()[-1] for row in subprocess.check_output(['nm', '-D', '--defined-only', str(f)], env=env, text=True).splitlines() if row.split()}
    old, new = symbols(baseline), symbols(library)
    if not old or old != new or '[libfreetype.so.6]' not in subprocess.check_output(['readelf', '-d', str(library)], env=env, text=True):
        raise ValueError('native SONAME/export regression')
    candidate_env = dict(env, LD_LIBRARY_PATH=str(libdir))
    graph = run(['ldd', str(client)], 'old-header-candidate-linkage', env=candidate_env)
    targets = {str(pathlib.Path(x).resolve(strict=True)) for x in re.findall(r'(?:=> )?(/[^\s()]+)', graph)}
    if str(library) not in targets or 'not found' in graph:
        raise ValueError('old header did not bind native candidate')
    metrics = []
    for i, font in enumerate(pins['neutralFonts']):
        text = run([str(client), font], 'candidate-font-' + str(i), env=candidate_env)
        if text != baseline_metrics[font]:
            raise ValueError('fixed font/glyph metrics changed')
        metrics.append({'font': font, 'fontSha256': pins['neutralFontSha256'][font], 'byteIdenticalMetrics': True,
                        'baselineLogSha256': digest(export / ('baseline-font-' + str(i) + '.log')),
                        'candidateLogSha256': digest(export / ('candidate-font-' + str(i) + '.log'))})
    adapter = pathlib.Path('/work/budget-adapter.c')
    budget = generate(pathlib.Path('/work/baseline-cidload.c'), source / 'src/cid/cidload.c', adapter, pins)
    run(['gcc', '-Wall', '-Wextra', '-Werror', *shlex.split(subprocess.check_output(['pkg-config', '--cflags', 'freetype2'], env=env, text=True)), str(adapter), '-o', '/work/budget-adapter'], 'compile-literal-budget-adapter', env=env)
    if run(['/work/budget-adapter'], 'literal-budget-neutral-cases', env=env).strip() != 'neutral-vendor-budget-cases=5 original-controls=5 patched-controls=5':
        raise ValueError('budget test count missing')
    receipt.update(status='native-private-source-abi-font-checks-pass', cohort=archive_names, soname='libfreetype.so.6',
                   originalExports=len(old), candidateExports=len(new), missingExports=[], neutralFontMetrics=metrics,
                   strippedLibrarySha256=digest(library), strippedLibraryPath=str(library.relative_to(candidate)),
                   literalBudgetAdapter=budget, upstreamMeson={'status': 'NOT_RUN_EXTERNAL_FONT_UNAVAILABLE', 'registeredTests': 1,
                    'originalDisabledByDefault': True, 'fixture': 'As.I.Lay.Dying.ttf', 'fixtureFetchedOrSubstituted': False},
                   originalDebianBuild={'passed': True, 'rulesUnchanged': True, 'dhAutoTestPositiveUpstreamCountClaim': False},
                   fullConverterProfilesRuntimePending=True, runtimeAdopted=False)
    (export / 'source-and-test-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    for item in archive_names.values(): shutil.copy2(source.parent / item['file'], export / item['file'])
    shutil.copy2(client, export / client.name)
    shutil.copy2(source / 'debian/tests/libfreetype-dev', export / 'original-debian-autopkgtest.sh')
    if (time.monotonic() - started > 1800
            or sum(f.stat().st_size for f in export.iterdir() if f.is_file()) > 268435456
            or sum(f.stat().st_size for f in export.glob('*.deb')) > 67108864):
        raise RuntimeError('final native export/package/time bound')
    outcome = {'status': 'native-private-source-abi-font-checks-pass', 'failure': None, 'receipt': receipt}
except BaseException as error:
    outcome = {'status': 'FAILED', 'failure': type(error).__name__ + ': ' + str(error), 'phase': phase}
    raise
finally:
    outcome['phases'] = phases
    outcome['runtimeAdopted'] = False
    (export / 'build-outcome.json').write_text(json.dumps(outcome, indent=2) + '\n')
    if (time.monotonic() - started > 1800
            or sum(f.stat().st_size for f in export.iterdir() if f.is_file()) > 268435456):
        outcome['status'] = 'FAILED'
        outcome['terminalBoundFailure'] = 'final outcome/global/export bound'
        (export / 'build-outcome.json').write_text(json.dumps(outcome, indent=2) + '\n')
        raise RuntimeError('terminal native receipt bound')
    print('AA7_FREETYPE_OUTCOME ' + json.dumps(outcome), flush=True)
    for log in sorted(export.glob('*.log')):
        print('AA7_FREETYPE_LOG ' + json.dumps({'name': log.name, 'bytes': log.stat().st_size,
              'sha256': digest(log), 'tail': log.read_text(errors='replace')[-4000:]}), flush=True)
