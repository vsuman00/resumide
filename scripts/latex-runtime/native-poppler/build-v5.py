"""Normal native Debian build plus fatal upstream and package evidence gates."""
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
import xml.etree.ElementTree as ET
from expat_source import digest
from prepare_build import prepare
from verify_native import verify
from ctest_v5 import assess as assess_ctest

export = pathlib.Path('/export')
phase = 'isolation'
phases = []
source = None
upstream = None
native_diagnostic = None
signature_binding = None


def run(argv, name, cwd=None, env=None, timeout=1800):
    global phase
    phase = name
    path = export / (name + '.log')
    started = time.monotonic()
    with path.open('wb') as stream:
        process = subprocess.Popen(argv, cwd=cwd, env=env, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            while process.poll() is None:
                if (time.monotonic() - started > timeout or path.stat().st_size > 32 * 1024 * 1024
                        or sum(item.stat().st_size for item in export.rglob('*') if item.is_file()) > 268435456):
                    raise RuntimeError('phase time/log bound exceeded: ' + name)
                time.sleep(0.1)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            phases.append({'name': name, 'exitCode': process.returncode, 'seconds': round(time.monotonic() - started, 3), 'logSha256': digest(path)})
    if process.returncode or path.stat().st_size > 32 * 1024 * 1024:
        raise RuntimeError('phase failed: ' + name)
    return path.read_text(errors='replace')


def bind_signature_candidate(build, environment):
    executable = build / 'qt6/tests/check_qt6_signature_basics'
    expected_core = (build / 'libpoppler.so.147.0.0').resolve(strict=True)
    if (executable.is_symlink() or not executable.is_file() or not expected_core.is_file()
            or not expected_core.is_relative_to(build.resolve())):
        raise ValueError('candidate signature executable/core missing')
    graph = run(['ldd', str(executable)], 'candidate-signature-linkage', env=environment, timeout=15)
    if 'not found' in graph:
        raise ValueError('candidate signature library unresolved')
    needed_text = run(['readelf', '-d', str(executable)], 'candidate-signature-dynamic', env=environment, timeout=15)
    needed = re.findall(r'\(NEEDED\).*Shared library: \[([^\]]+)\]', needed_text)
    if 'libpoppler.so.147' not in needed:
        raise ValueError('candidate signature core DT_NEEDED absent')
    paths = sorted({path for path in re.findall(r'(?:=> )?(/[^\s()]+)', graph)})
    if not paths or len(paths) > 128:
        raise ValueError('signature library metadata count bound')
    bindings = []
    total = 0
    for name in paths:
        path = pathlib.Path(name).resolve(strict=True)
        if not path.is_file() or not (path.is_relative_to(build.resolve()) or str(path).startswith(('/usr/lib/', '/lib/'))):
            raise ValueError('unexpected candidate signature library path')
        total += path.stat().st_size
        if total > 256 * 1024 * 1024:
            raise ValueError('signature library metadata byte bound')
        bindings.append({'loadedPath': name, 'resolvedPath': str(path), 'bytes': path.stat().st_size, 'sha256': digest(path)})
    if not any(row['resolvedPath'] == str(expected_core) for row in bindings):
        raise ValueError('signature test did not load exact candidate core')
    crypto = ['libgpgmepp.so.6', 'libgpgme.so.11', 'libnss3.so', 'libsmime3.so',
              'libnspr4.so', 'libassuan.so.9', 'libgpg-error.so.0']
    if any(not any(pathlib.Path(row['loadedPath']).name == name for row in bindings) for name in crypto):
        raise ValueError('candidate signature crypto binding incomplete')
    result = {'executable': str(executable), 'executableBytes': executable.stat().st_size,
              'executableSha256': digest(executable), 'corePath': str(expected_core),
              'coreSha256': digest(expected_core), 'neededLibraries': needed,
              'loadedLibraries': bindings, 'requiredCryptoSonames': crypto,
              'candidateTestSourceSha256': digest(build.parent / 'qt6/tests/check_signature_basics.cpp'),
              'metadataOnly': True, 'testNotYetRunByThisBindingStep': True}
    encoded = json.dumps(result, indent=2)
    if len(encoded.encode()) > 1048576:
        raise ValueError('candidate signature binding receipt oversized')
    (export / 'candidate-signature-binding.json').write_text(encoded + '\n')
    print('AA7_POPPLER_SIGNATURE_BINDING ' + json.dumps(result), flush=True)
    return result


def main():
    global source, upstream, phase, native_diagnostic, signature_binding
    status = dict(line.split(':', 1) for line in pathlib.Path('/proc/self/status').read_text().splitlines() if ':' in line)
    if os.getuid() != 65532 or os.getgid() != 65532 or status['NoNewPrivs'].strip() != '1' or any(int(status[name].strip(), 16) for name in ('CapEff', 'CapPrm', 'CapBnd', 'CapAmb')):
        raise ValueError('nonroot/capability/NNP source-builder contract failed')
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_CPU, (1800, 1800))
    resource.setrlimit(resource.RLIMIT_FSIZE, (268435456, 268435456))
    phase = 'prepare-authenticated-source'
    source, pins, provenance = prepare(pathlib.Path('/inputs'), pathlib.Path('/recipe'), pathlib.Path('/work/source'))
    environment = dict(os.environ, SOURCE_DATE_EPOCH=str(pins['sourceDateEpoch']), DEB_BUILD_OPTIONS='parallel=2')
    run(['dpkg-checkbuilddeps'], 'original-build-dependencies', source, environment, 30)
    run(['python3', '-B', '/recipe/verify_consumer.py', '--consumer', '/recipe/native_geometry.py', '--sha256', '8399d3432cde87c92f55771f272bad82c42b26856f3b4096fc1f76bc88249da1', '--receipt', '/export/consumer-neutral.json'], 'independent-consumer-neutral', env=environment, timeout=30)
    neutral = json.loads((export / 'consumer-neutral.json').read_text())
    if not neutral['passed'] or neutral['testMethods'] != 6 or len(neutral['cases']) != 107:
        raise ValueError('independent mandatory consumer cases did not pass')
    for name in ['libpoppler147', 'libpoppler-dev', 'libpoppler-private-dev', 'poppler-utils']:
        if subprocess.check_output(['dpkg-query', '-W', '-f=${Version}', name], text=True) != pins['baselineVersion']:
            raise ValueError('old-header/binary baseline package differs')
    flags = shlex.split(subprocess.check_output(['pkg-config', '--cflags', '--libs', 'poppler'], text=True))
    flags = [flag.replace('-I', '-isystem', 1) if flag.startswith('-I') and flag != '-I-' else flag for flag in flags]
    client = '/work/old-header-client'
    run(['c++', '-std=c++20', '-Wall', '-Wextra', '-Werror', '/recipe/abi-smoke.cc', *flags, '-o', client], 'old-header-client-build')
    run([client, str(source.parent / 'test/unittestcases/truetype.pdf')], 'old-header-client-baseline')
    run(['dpkg-buildpackage', '-us', '-uc', '-b', '-j2'], 'original-native-package-flow', source, environment)
    builds = list(source.glob('obj-*'))
    if len(builds) != 1 or not (builds[0] / 'CMakeCache.txt').is_file():
        raise ValueError('exact native CMake build directory not found')
    build = builds[0]
    discovery_text = run(['ctest', '--test-dir', str(build), '--show-only=json-v1'], 'upstream-discovery', env=environment, timeout=30)
    if len(discovery_text.encode()) > 1048576:
        raise ValueError('upstream discovery output bound exceeded')
    discovery = json.loads(discovery_text)
    names = [test['name'] for test in discovery['tests']]
    if sorted(names) != pins['upstreamTests'] or len(names) != 71:
        raise ValueError('original upstream test registration differs or is zero')
    candidate = pathlib.Path('/work/candidate'); candidate.mkdir()
    cohort = {}
    selected = []
    for package in sorted(source.parent.glob('*.deb')):
        field = lambda name: subprocess.check_output(['dpkg-deb', '-f', str(package), name], text=True).strip()
        name = field('Package')
        if name not in pins['packageCohort']:
            continue
        if name in cohort or field('Version') != pins['packageVersion'] or field('Architecture') != subprocess.check_output(['dpkg', '--print-architecture'], text=True).strip():
            raise ValueError('coherent native cohort identity mismatch')
        run(['dpkg-deb', '-x', str(package), str(candidate)], 'extract-' + name, timeout=30)
        cohort[name] = {'file': package.name, 'version': field('Version'), 'sha256': digest(package), 'source': field('Source'), 'depends': field('Depends')}
        selected.append(package)
    if set(cohort) != set(pins['packageCohort']):
        raise ValueError('missing exact installed two-package cohort')
    native_error = None
    native = None
    try:
        native = verify(source, pins, candidate, client, run, environment)
        native_diagnostic = {'status': 'all-original-native-checks-pass', 'result': native}
    except Exception as error:
        native_error = error
        native_diagnostic = {'status': 'native-checks-failed-still-fatal',
                             'error': type(error).__name__ + ': ' + str(error)[:512],
                             'failedPhase': phase, 'candidateNotAccepted': True}
    encoded_native = json.dumps(native_diagnostic, indent=2)
    if len(encoded_native.encode()) > 1048576:
        raise ValueError('native diagnostic receipt oversized')
    (export / 'native-diagnostic.json').write_text(encoded_native + '\n')
    print('AA7_POPPLER_NATIVE_DIAGNOSTIC ' + json.dumps(native_diagnostic), flush=True)
    signature_binding = bind_signature_candidate(build, environment)
    junit = export / 'upstream-junit.xml'
    ctest_error = None
    try:
        run(['ctest', '--test-dir', str(build), '--output-on-failure', '--no-tests=error',
             '--timeout', '30', '-j2', '--test-output-size-passed', '1048576',
             '--test-output-size-failed', '1048576', '--output-junit', str(junit)],
            'fatal-upstream-tests', env=environment, timeout=600)
    except RuntimeError as error:
        if (str(error) != 'phase failed: fatal-upstream-tests' or not phases
                or phases[-1]['name'] != 'fatal-upstream-tests' or phases[-1]['exitCode'] != 8
                or phases[-1]['seconds'] > 600
                or (export / 'fatal-upstream-tests.log').stat().st_size > 32 * 1024 * 1024
                or sum(item.stat().st_size for item in export.rglob('*') if item.is_file()) > 268435456):
            raise
        ctest_error = error
    if not junit.is_file() or junit.is_symlink() or junit.stat().st_size > 16 * 1024 * 1024:
        raise ValueError('upstream JUnit output missing/oversized')
    cases = list(ET.parse(junit).getroot().iter('testcase'))
    baseline_identity = json.loads(pathlib.Path('/recipe/ctest_v5_baseline.json').read_text())
    upstream = assess_ctest(cases, pins, signature_binding, baseline_identity, phases[-1]['exitCode'])
    upstream['junitSha256'] = digest(junit)
    if ctest_error is not None and upstream['engineeringException'] is None:
        raise ctest_error
    if native_error is not None:
        raise native_error
    provenance.update(cohort=cohort, upstream=upstream, nativeVerification=native,
                      fullConverterAcceptance='not-run; root-integrated worker gates mandatory', runtimeAdopted=False)
    if sum(package.stat().st_size for package in selected) > 67108864:
        raise ValueError('runtime cohort artifact byte bound exceeded')
    for package in selected:
        shutil.copy2(package, export / package.name)
    for path in sorted(source.parent.glob('*.buildinfo')) + sorted(source.parent.glob('*.changes')):
        shutil.copy2(path, export / path.name)
    (export / 'source-and-test-receipt.json').write_text(json.dumps(provenance, indent=2) + '\n')
    (export / 'build-packages.lock').write_bytes(subprocess.check_output(['dpkg-query', '-W', '-f=${Package}=${Version}\n']))
    shutil.copy2('/recipe/build-dependency-transport.json', export / 'build-dependency-transport.json')
    print('AA7_POPPLER_ENGINEERING_OUTCOME ' + json.dumps({'cohort': cohort, 'upstream': upstream, 'allTestsPassed': upstream['allNativeTestsPassed']}), flush=True)


failure = None
try:
    main()
except BaseException as error:
    failure = type(error).__name__ + ': ' + str(error)
    raise
finally:
    if ((failure and phase == 'fatal-upstream-tests')
            or (upstream and upstream.get('engineeringException'))):
        try:
            failed_junit = export / 'upstream-junit.xml'
            if (failed_junit.is_symlink() or not failed_junit.is_file()
                    or failed_junit.stat().st_size > 16 * 1024 * 1024):
                raise ValueError('failed JUnit missing/nonregular/oversized')
            matching = [case for case in ET.parse(failed_junit).getroot().iter('testcase')
                        if case.attrib.get('name') == 'check_qt6_signature_basics']
            if len(matching) != 1:
                raise ValueError('exact failed diagnostic testcase missing/duplicated')
            observed = list(ET.parse(failed_junit).getroot().iter('testcase'))
            if len(observed) > 128:
                raise ValueError('failed JUnit diagnostic testcase bound')
            diagnostic = json.dumps({'junitSha256': digest(failed_junit),
                                     'testcaseXml': ET.tostring(matching[0], encoding='unicode'),
                                     'observedCases': [{'name': case.attrib.get('name'),
                                                        'status': case.attrib.get('status'),
                                                        'failure': case.find('failure') is not None,
                                                        'error': case.find('error') is not None,
                                                        'skipped': case.find('skipped') is not None,
                                                        'qtTotals': re.findall(r'Totals:\s+(\d+) passed,\s+(\d+) failed,\s+(\d+) skipped(?:,\s+(\d+) blacklisted)?', case.findtext('system-out', default=''))}
                                                       for case in observed]})
            if len(diagnostic.encode('utf-8')) > 65536:
                raise ValueError('failed testcase diagnostic exceeds64KiB')
            print('AA7_POPPLER_FAILED_JUNIT ' + diagnostic, flush=True)
        except Exception as diagnostic_error:
            print('AA7_POPPLER_FAILED_JUNIT_UNAVAILABLE ' + type(diagnostic_error).__name__ + ': ' + str(diagnostic_error)[:256], flush=True)
    logs = []
    tail_bytes = 0
    for path in sorted(export.glob('*.log')):
        item = {'name': path.name, 'bytes': path.stat().st_size, 'sha256': digest(path)}
        logs.append(item)
        print('AA7_POPPLER_LOG ' + json.dumps(item), flush=True)
        if tail_bytes + min(item['bytes'], 2048) <= 131072:
            with path.open('rb') as stream:
                stream.seek(max(0, item['bytes'] - 2048)); raw_tail = stream.read(2048)
            tail_bytes += len(raw_tail)
            print(raw_tail.decode(errors='replace'), flush=True)
        else:
            item['tailOmittedDueToAggregateBound'] = True
    outcome = {'status': ('failed' if failure else ('private-engineering-with-reviewed-exception' if upstream and upstream.get('engineeringException') else 'native-package-checks-pass')), 'phase': phase,
               'failure': failure, 'phases': phases, 'upstream': upstream, 'nativeDiagnostic': native_diagnostic,
               'candidateSignatureBinding': signature_binding, 'logs': logs,
               'failureNeverExportsAnAcceptedArtifact': True, 'runtimeAdopted': False,
               'allPhaseAndLogMetadataRetained': True, 'diagnosticTailByteCap': 131072, 'diagnosticTailBytes': tail_bytes,
               'fullConverterGate': 'pending root-integrated immutable-worker verification'}
    (export / 'build-outcome.json').write_text(json.dumps(outcome, indent=2) + '\n')
    print('AA7_POPPLER_OUTCOME ' + json.dumps(outcome), flush=True)
