"""Build native packages and run upstream/ABI checks; preserve fatal diagnostics."""
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
from prepare import digest, prepare

export = pathlib.Path('/export')
export.mkdir()
shutil.copy2('/recipe/build-dependency-transport.json', export / 'build-dependency-transport.json')
source = None
phase = 'source-authentication'
phases = []
check_counts = {}


def run(args, name, cwd=None, env=None, timeout=600):
    global phase
    phase = name
    path = export / (name + '.log')
    with path.open('wb') as log:
        try:
            result = subprocess.run(args, cwd=cwd, env=env, stdout=log,
                                    stderr=subprocess.STDOUT, timeout=timeout)
        except subprocess.TimeoutExpired:
            phases.append({'phase': name, 'timeout': True})
            raise
    phases.append({'phase': name, 'exitCode': result.returncode, 'logSha256': digest(path)})
    if result.returncode:
        raise RuntimeError(name + ' failed: ' + str(result.returncode))
    return path.read_text(errors='replace')


def count_checks(mode):
    path = source / mode / 'tests/runtests.log'
    matches = re.findall(r'(\d+)%: Checks: (\d+), Failed: (\d+)', path.read_text())
    if not matches or any(int(percent) != 100 or int(count) == 0 or int(failed) != 0
                          for percent, count, failed in matches):
        raise ValueError('missing, zero or failed actual upstream checks: ' + mode)
    check_counts[mode] = {'summaryRecords': len(matches),
                          'checks': sum(int(count) for _, count, _ in matches),
                          'failures': 0, 'logSha256': digest(path)}
    print('AA7_UPSTREAM_CHECKS ' + json.dumps({mode: check_counts[mode]}), flush=True)


def main():
    global source
    source, pins, provenance = prepare(pathlib.Path('/inputs'), pathlib.Path('/recipe'), pathlib.Path('/work'))
    environment = dict(os.environ, SOURCE_DATE_EPOCH=str(pins['sourceDateEpoch']), DEB_BUILD_OPTIONS='parallel=2')
    multiarch = subprocess.check_output(['dpkg-architecture', '-qDEB_HOST_MULTIARCH'], text=True).strip()
    baseline = pathlib.Path('/usr/lib') / multiarch
    for mode, flags, library in [('narrow', [], '-lexpat'), ('wide16', ['-DXML_UNICODE'], '-lexpatw')]:
        run(['cc', '-Wall', '-Wextra', '-Werror', *flags, '/recipe/abi-smoke.c', library,
             '-o', '/work/abi-' + mode], 'abi-client-build-' + mode)
        run(['/work/abi-' + mode, 'expat_2.9.0'], 'baseline-abi-' + mode)
    run(['dpkg-buildpackage', '-us', '-uc', '-b', '-j2'], 'native-package-build', source, environment)
    # Native packages are already built from pristine authenticated source here.
    run(['make', '-C', 'build', 'check'], 'upstream-check-narrow', source, environment, 300)
    count_checks('build')
    test_paths = ['tests/common.h', 'tests/basic_tests.c', 'tests/handlers.c', 'tests/structdata.c', 'tests/misc_tests.c']
    before = {name: (source / 'srcw' / name).read_text() for name in test_paths}
    run(['patch', '--batch', '--forward', '--fuzz=0', '-p1', '-i', '/recipe/native-utf16-tests.patch'],
        'apply-test-only-utf16-adapter', source / 'srcw')
    adapter_changes = []
    for name, old in before.items():
        new = (source / 'srcw' / name).read_text()
        # Preserve every original assertion/failure call, test and registration line.
        tokens = r'\b(?:assert|fail|_fail|tcase_add_test\w*|START_TEST)\s*\('
        old_contract = [line.strip() for line in old.splitlines() if re.search(tokens, line)]
        new_contract = [line.strip() for line in new.splitlines() if re.search(tokens, line)]
        if old_contract != new_contract:
            raise ValueError('upstream test assertion/registration drift: ' + name)
        adapter_changes.append({'path': name, 'beforeSha256': hashlib.sha256(old.encode()).hexdigest(),
                                'afterSha256': digest(source / 'srcw' / name)})
    run(['cc', '-Wall', '-Wextra', '-Werror', '-DXML_UNICODE', '-I', str(source / 'srcw/tests'),
         '/recipe/utf16-adapter-check.c', '-o', '/work/utf16-adapter-check'], 'adapter-self-test-build')
    run(['/work/utf16-adapter-check'], 'adapter-self-test')
    run(['make', '-C', 'buildw/tests', 'check'], 'upstream-check-native-wide16', source, environment, 300)
    count_checks('buildw')

    packages = sorted(source.parent.glob('*.deb'))
    runtime = [p for p in packages if p.name.startswith('libexpat1_')]
    if len(runtime) != 1:
        raise ValueError('expected one native runtime Debian package')
    version = subprocess.check_output(['dpkg-deb', '-f', str(runtime[0]), 'Version'], text=True).strip()
    if version != pins['packageVersion']:
        raise ValueError('native package version mismatch')
    run(['dpkg-deb', '-x', str(runtime[0]), '/candidate'], 'extract-native-package')
    candidate = pathlib.Path('/candidate/usr/lib') / multiarch
    abi = []
    for library in ('libexpat.so.1', 'libexpatw.so.1'):
        old, new = baseline / library, candidate / library
        def symbols(path):
            output = subprocess.check_output(['nm', '-D', '--defined-only', str(path)], text=True)
            return {line.split()[-1].split('@')[0] for line in output.splitlines()
                    if line.split() and line.split()[-1].startswith('XML_')}
        old_symbols, new_symbols = symbols(old), symbols(new)
        dynamic = subprocess.check_output(['readelf', '-d', str(new)], text=True)
        if not old_symbols or old_symbols - new_symbols or '[' + library + ']' not in dynamic:
            raise ValueError('native library ABI/SONAME check failed')
        abi.append({'library': library, 'baselineExports': len(old_symbols),
                    'candidateExports': len(new_symbols), 'missingExports': [], 'sha256': digest(new.resolve())})
    consumer_environment = dict(environment, LD_LIBRARY_PATH=str(candidate))
    for mode in ('narrow', 'wide16'):
        run(['/work/abi-' + mode, 'expat_2.10.0'], 'candidate-abi-' + mode, env=consumer_environment)
    python_probe = """import pyexpat,xml.etree.ElementTree as E
assert pyexpat.EXPAT_VERSION == 'expat_2.10.0', pyexpat.EXPAT_VERSION
assert E.fromstring('<fontconfig><dir>neutral &amp; safe</dir></fontconfig>')[0].text == 'neutral & safe'
p=pyexpat.ParserCreate();p.Parse('<!DOCTYPE fontconfig SYSTEM "urn:neutral"><fontconfig/>',True)
print(pyexpat.EXPAT_VERSION, 'Python XML consumers passed')
"""
    run(['python3', '-c', python_probe], 'python-xml-consumer', env=consumer_environment)
    linkage = run(['ldd', '/usr/bin/fc-list'], 'fontconfig-candidate-linkage', env=consumer_environment)
    if str(candidate / 'libexpat.so.1') not in linkage:
        raise ValueError('fontconfig did not resolve candidate Expat')
    run(['fc-list'], 'fontconfig-consumer', env=consumer_environment)
    for path in packages + sorted(source.parent.glob('*.buildinfo')) + sorted(source.parent.glob('*.changes')):
        shutil.copy2(path, export / path.name)
    provenance['builtPackages'] = {p.name: digest(p) for p in export.glob('*.deb')}
    provenance['abiChecks'] = abi
    provenance['upstreamCheckCounts'] = check_counts
    provenance['testOnlyAdapter'] = {'patchSha256': digest(pathlib.Path('/recipe/native-utf16-tests.patch')),
                                    'changedFiles': adapter_changes, 'artifactSourceChanged': False,
                                    'xmlLCharVersionComparison': 'native byte strcmp; identical expected expat_2.10.0'}
    provenance['checks'] = ['upstream narrow and native-wide16 check', '2.9-header binaries against 2.10',
                            'Python pyexpat/ElementTree', 'fontconfig consumer and actual ELF linkage']
    provenance['limits'] = ['Export/link/client checks are not a complete semantic ABI proof.',
                           'CVE-2025-66382 remains open.', 'Full converter regression is separate.']
    (export / 'source-and-test-receipt.json').write_text(json.dumps(provenance, indent=2) + '\n')
    (export / 'build-packages.lock').write_bytes(subprocess.check_output(['dpkg-query', '-W', '-f=${Package}=${Version}\\n']))
    print(json.dumps({'status': 'pass', 'packageVersion': version, 'runtimePackage': runtime[0].name,
                      'runtimeSha256': provenance['builtPackages'][runtime[0].name], 'abi': abi}), flush=True)


failure = None
try:
    main()
except BaseException as error:
    failure = type(error).__name__ + ': ' + str(error)
    raise
finally:
    # Public source/tests only: preserve counts, hashes and bounded tails even on fatal failure.
    if source:
        for mode in ('build', 'buildw'):
            for name in ('runtests.log', 'test-suite.log'):
                path = source / mode / 'tests' / name
                if path.is_file() and path.stat().st_size <= 32 * 1024 * 1024:
                    shutil.copy2(path, export / (mode + '-' + name))
    logs = []
    for path in sorted(export.glob('*.log'))[:32]:
        size = path.stat().st_size
        if size > 32 * 1024 * 1024:
            logs.append({'name': path.name, 'bytes': size, 'diagnostic': 'log_size_bound_exceeded'})
            continue
        with path.open('rb') as stream:
            stream.seek(max(0, size - 8192))
            tail = stream.read(8192).decode(errors='replace')
        item = {'name': path.name, 'bytes': size, 'sha256': digest(path)}
        logs.append(item)
        print('AA7_NATIVE_LOG ' + json.dumps(item), flush=True)
        print(tail, flush=True)
    outcome = {'status': 'failed' if failure else 'pass', 'phase': phase, 'failure': failure,
               'phases': phases, 'upstreamChecks': check_counts, 'logs': logs,
               'diagnosticTailsBoundedBytesPerLog': 8192,
               'failedBuildKitLayerIsNotAnExportedArtifact': bool(failure)}
    (export / 'build-outcome.json').write_text(json.dumps(outcome, indent=2) + '\n')
    print('AA7_NATIVE_OUTCOME ' + json.dumps(outcome), flush=True)
