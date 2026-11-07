"""Installed FreeType provenance plus zero-input XeTeX startup mapping; no fonts/PDFs."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import signal
import subprocess
import sys
import time

BASE = Path('/opt/latex/native-freetype')
ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/opt/latex/home', 'LANG': 'C.UTF-8'}
CHILD_ENV = {'HOME': '/opt/latex/home', 'LANG': 'C.UTF-8',
             'FONTCONFIG_FILE': '/opt/latex/fontconfig/fonts.conf',
             'FONTCONFIG_PATH': '/opt/latex/fontconfig'}


def require(value, label):
    if not value:
        raise ValueError(label)


def digest(path, maximum=1048576):
    require(path.is_file() and not path.is_symlink() and path.stat().st_size <= maximum,
            'regular-file-size-bound')
    value, total = hashlib.sha256(), 0
    with path.open('rb') as stream:
        while data := stream.read(65536):
            total += len(data)
            require(total <= maximum, 'file-grew-over-bound')
            value.update(data)
    return value.hexdigest()


def record(name):
    path = BASE / name
    digest(path)
    return json.loads(path.read_bytes())


def command(argv):
    result = subprocess.run(argv, env=ENV, stdin=subprocess.DEVNULL,
                            capture_output=True, timeout=5, check=False)
    require(result.returncode == 0 and len(result.stdout) + len(result.stderr) <= 65536,
            'metadata-command-failed-or-oversized')
    return (result.stdout + result.stderr).decode('utf-8', errors='strict')


def xetex_mapping(library, expected_hash):
    # An open empty stdin holds initialization at its prompt; no input bytes sent.
    process = subprocess.Popen(['/usr/bin/xetex', '--ini', '--no-shell-escape',
                                '--interaction=nonstopmode'], stdin=subprocess.PIPE,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               cwd='/scratch', env=CHILD_ENV, start_new_session=True)
    mapped = False
    group_absent = False
    try:
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            require(process.poll() is None, 'xetex-exited-before-mapping')
            try:
                executable = Path('/proc', str(process.pid), 'exe').resolve(strict=True)
                with Path('/proc', str(process.pid), 'maps').open('rb') as stream:
                    data = stream.read(1048577)
                require(len(data) <= 1048576, 'xetex-maps-size-bound')
                paths = [line.split(maxsplit=5)[5] for line in data.decode('utf-8').splitlines()
                         if len(line.split(maxsplit=5)) == 6 and line.split(maxsplit=5)[5].startswith('/')]
                mapped = executable == Path('/usr/bin/xetex').resolve(strict=True) and any(
                    Path(name).resolve(strict=True) == library for name in paths)
            except FileNotFoundError:
                mapped = False
            if mapped:
                break
            time.sleep(.02)
        require(mapped and digest(library, 67108864) == expected_hash,
                'actual-xetex-mapped-library-not-bound')
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=1)
        if process.stdin:
            process.stdin.close()
        try:
            os.killpg(process.pid, 0)
        except ProcessLookupError:
            group_absent = True
        require(group_absent, 'owned-xetex-process-group-remains')
    return {'actualExecutable': '/usr/bin/xetex', 'mappedLibrary': str(library),
            'mappedLibrarySha256': expected_hash, 'inputBytesSent': 0,
            'fontOrPdfInputProvided': False, 'ownedProcessStopped': True,
            'ownedProcessGroupAbsent': group_absent}


def main():
    raw = sys.stdin.buffer.read(32769)
    require(len(raw) <= 32768, 'probe-input-size-bound')
    request = json.loads(raw)
    require(set(request) == {'pinsSha256', 'installerSha256', 'patchSha256', 'budgetReference'},
            'probe-binding-input-shape')
    require(all(isinstance(request[k], str) and re.fullmatch('[a-f0-9]{64}', request[k])
                for k in ['pinsSha256', 'installerSha256', 'patchSha256']), 'probe-binding-hash-shape')
    pins = record('pins.json')
    source = record('source-and-test-receipt.json')
    outcome = record('build-outcome.json')
    fresh = record('install-verification.json')
    installed = record('installed-package.json')
    require(digest(BASE / 'pins.json') == request['pinsSha256'] == installed['pinsSha256']
            and installed['installerSha256'] == request['installerSha256'], 'installed-helper-binding-differs')
    require(set(installed['metadataSha256']) == {'source-and-test-receipt.json', 'build-outcome.json',
                                               'install-verification.json'}
            and all(digest(BASE / name) == value for name, value in installed['metadataSha256'].items()),
            'native-metadata-hash-differs')
    require(source['status'] == outcome['status'] == 'native-private-source-abi-font-checks-pass'
            and outcome['failure'] is None and outcome['receipt'] == source
            and source['sourceVersion'] == pins['baselineVersion']
            and source['packageVersion'] == pins['packageVersion']
            and source['archiveValidSigners'] and source['noUnstableBinaries'] is True
            and source['developerDscSignatureVerified'] is False
            and source['originalPackagingHashes'] == pins['originalDebianFiles'], 'source-proof-not-coherent')
    phases = outcome['phases']
    names = {phase['name'] for phase in phases}
    required = {'baseline-header-version', 'compile-old-header-client', 'baseline-font-0', 'baseline-font-1',
                'normal-original-build-dependencies', 'normal-original-debian-build', 'extract-libfreetype6',
                'extract-libfreetype-dev', 'old-header-candidate-linkage', 'candidate-font-0', 'candidate-font-1',
                'compile-literal-budget-adapter', 'literal-budget-neutral-cases'}
    require(required <= names and len(names) == len(phases)
            and all(phase['exitCode'] == 0 for phase in phases), 'missing-or-failed-native-phase')
    require(source['vendorPatchSha256'] == pins['patch']['sha256'] == request['patchSha256']
            and source['baselineCidSha256'] == pins['baselineCidSourceSha256'] == installed['baselineCidSha256']
            and source['patchedCidSha256'] == pins['patchedCidSourceSha256'] == installed['patchedCidSha256'],
            'exact-source-fix-binding-differs')
    require(source['postBuildCidSha256'] in {pins['baselineCidSourceSha256'], pins['patchedCidSourceSha256']},
            'post-build-quilt-state-unrecognized')
    require(source['soname'] == 'libfreetype.so.6' and source['missingExports'] == []
            and source['originalExports'] == source['candidateExports'] > 0, 'native-abi-proof-differs')
    budget = source['literalBudgetAdapter']
    require(budget == installed['literalBudgetAdapter'] == request['budgetReference']
            and budget['expectedNeutralCases'] == 5 and budget['noFontOrPdfInput'] is True
            and budget['wholeCveReproduction'] is False, 'literal-budget-evidence-differs')
    missing_test = {'status': 'NOT_RUN_EXTERNAL_FONT_UNAVAILABLE', 'registeredTests': 1,
                    'originalDisabledByDefault': True, 'fixture': 'As.I.Lay.Dying.ttf',
                    'fixtureFetchedOrSubstituted': False}
    require(source['upstreamMeson'] == fresh['upstreamMesonNotRun'] == installed['upstreamMeson'] == missing_test
            and source['actualCveFontReproduction'] == installed['actualCveFontReproduction']
            == 'not-run; unavailable and no new font fixture authorized'
            and source['originalDebianBuild'] == {'passed': True, 'rulesUnchanged': True,
                                                 'dhAutoTestPositiveUpstreamCountClaim': False},
            'missing-test-status-obscured')
    require(fresh['originalDebianDynamicAndStaticClientsPass'] is True
            and fresh['originalDebianTestAssertionsUnchanged'] is True
            and fresh['normalNoRemoveApt'] is True and fresh['allOtherPackagesAndFlagsUnchanged'] is True
            and fresh['noncohortAutomaticAndAllHeldFlagsUnchanged'] is True
            and fresh['cohort'] == ['libfreetype-dev', 'libfreetype6']
            and fresh['finalRuntimeCohort'] == ['libfreetype6'], 'fresh-original-sdk-proof-differs')
    require(installed['normalNoRemoveOfflineApt'] is True
            and installed['allOtherPackagesAndFlagsUnchanged'] is True
            and installed['noncohortAutomaticAndAllHeldFlagsUnchanged'] is True
            and set(installed['cohort']) == {'libfreetype6'}
            and installed['cohort']['libfreetype6'] == source['cohort']['libfreetype6'],
            'runtime-cohort-proof-differs')
    fonts = source['neutralFontMetrics']
    require(len(fonts) == 2 and [font['font'] for font in fonts] == pins['neutralFonts']
            and all(font['fontSha256'] == pins['neutralFontSha256'][font['font']]
                    and digest(Path(font['font']).resolve(strict=True)) == font['fontSha256']
                    and font['byteIdenticalMetrics'] is True
                    and font['baselineLogSha256'] == font['candidateLogSha256'] for font in fonts)
            and fresh['fonts'] == [{'font': font['font'], 'metricsMatch': True} for font in fonts],
            'known-font-proof-differs')
    package = command(['dpkg-query', '-W', '-f=${Version}\t${Architecture}\t${db:Status-Status}',
                       'libfreetype6']).split('\t')
    require(package == [pins['packageVersion'], 'arm64', 'installed'], 'installed-native-version-differs')
    relative = PurePosixPath(source['strippedLibraryPath'])
    require(not relative.is_absolute() and '..' not in relative.parts
            and str(relative).startswith('usr/lib/'), 'unsafe-library-proof-path')
    library = Path('/') / relative
    expected_hash = source['strippedLibrarySha256']
    require(digest(library, 67108864) == expected_hash == fresh['freshInstalledLibrarySha256']
            == installed['runtimeLibrarySha256'], 'installed-native-library-hash-differs')
    graph = command(['ldd', '/usr/bin/xetex'])
    require('not found' not in graph and any(Path(path).resolve(strict=True) == library for path in
            re.findall(r'(?:=> )?(/[^\s()]+)', graph)), 'xetex-current-linkage-differs')
    mapping = xetex_mapping(library, expected_hash)
    require(source['runtimeAdopted'] is False and outcome['runtimeAdopted'] is False
            and installed['runtimeAdopted'] is False, 'source-receipt-promotion-obscured')
    return {'passed': True, 'sourceVersion': pins['baselineVersion'], 'packageVersion': pins['packageVersion'],
            'runtimeCohort': ['libfreetype6'], 'pinsSha256': request['pinsSha256'],
            'installerSha256': request['installerSha256'], 'patchSha256': request['patchSha256'],
            'metadataSha256': {name: digest(BASE / name) for name in ['pins.json', 'source-and-test-receipt.json',
                'build-outcome.json', 'install-verification.json', 'installed-package.json']},
            'runtimeLibrarySha256': expected_hash, 'xetexMapping': mapping,
            'nativeAbiExports': source['originalExports'], 'knownFontCases': len(fonts),
            'literalBudgetComparativeControls': 5, 'oldHeaderDynamicProof': True,
            'postBuildCidSha256': source['postBuildCidSha256'],
            'originalFreshSdkDynamicAndStaticProof': True, 'upstreamMeson': missing_test,
            'actualCveFontReproduction': source['actualCveFontReproduction'],
            'fullUpstreamSuitePassedClaim': False, 'newFontOrPdfInputProvided': False}


if __name__ == '__main__':
    print(json.dumps(main(), separators=(',', ':')))
