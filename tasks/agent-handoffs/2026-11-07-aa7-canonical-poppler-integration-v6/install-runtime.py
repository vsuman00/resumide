"""Build-time exact native Poppler installation; not an application entrypoint."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

ARTIFACTS = Path('/build-input/poppler')
RECIPE = Path('/build-input/poppler-recipe')
METADATA = Path('/opt/latex/native-poppler')
ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8', 'HOME': '/root',
       'DEBIAN_FRONTEND': 'noninteractive'}
RECIPE_HASHES = {
    'build-pins.json': '2bb3f7c717b2aaad314d2680700529a6da985d35542ac93ea934d65fbad9e923',
    'ctest_v5.py': '8c76f1cfa6c820a021d2219b6d5d0b66be466f49013955625de7dc39e8797f67',
    'ctest_v5_baseline.json': '625407fe6970d4952aeac54e2ffad947f356428b91fe2e4775456205bcaf5e34',
}


def require(value, message):
    if not value:
        raise ValueError(message)


def digest(path, maximum):
    require(not path.is_symlink() and path.is_file() and path.stat().st_size <= maximum,
            'nonregular or oversized installation input')
    result = hashlib.sha256()
    total = 0
    with path.open('rb') as stream:
        while data := stream.read(65536):
            total += len(data)
            require(total <= maximum, 'installation input grew beyond bound')
            result.update(data)
    return result.hexdigest()


def read_json(path):
    digest(path, 1048576)
    return json.loads(path.read_bytes())


def command(arguments, timeout=30):
    result = subprocess.run(arguments, env=ENV, capture_output=True, text=True,
                            check=True, timeout=timeout)
    require(len(result.stdout.encode()) + len(result.stderr.encode()) <= 1048576,
            'installation command output exceeded bound')
    return result.stdout


def inventory():
    rows = command(['dpkg-query', '-W', '-f=${Package}\t${Version}\t${Architecture}\t${Essential}\t${Protected}\t${db:Status-Status}\n'])
    packages = {}
    for row in rows.splitlines():
        fields = row.split('\t')
        require(len(fields) == 6 and fields[0] not in packages, 'ambiguous package inventory')
        packages[fields[0]] = fields[1:]
    return packages


def main():
    require(os.getuid() == 0 and command(['dpkg', '--print-architecture']).strip() == 'arm64',
            'installation requires the reviewed arm64 build stage')
    for name, expected in RECIPE_HASHES.items():
        require(digest(RECIPE / name, 1048576) == expected, 'reviewed V5 helper/pin hash changed')
    # Fixed read-only recipe mount; this imports only the already-reviewed predicate.
    sys.path.insert(0, str(RECIPE))
    from ctest_v5 import assess

    pins = read_json(RECIPE / 'build-pins.json')
    baseline = read_json(RECIPE / 'ctest_v5_baseline.json')
    names = ('source-and-test-receipt.json', 'build-outcome.json',
             'install-verification.json', 'candidate-signature-binding.json')
    records = {name: read_json(ARTIFACTS / name) for name in names}
    source = records['source-and-test-receipt.json']
    outcome = records['build-outcome.json']
    installed = records['install-verification.json']
    binding = records['candidate-signature-binding.json']
    require(source['sourceVersion'] == pins['sourceVersion']
            and source['packageVersion'] == pins['packageVersion']
            and source['testDataManifestSha256'] == pins['testdataManifestSha256']
            and source['archiveValidSigners'] and source['noUnstableBinaries'] is True,
            'source authentication/provenance receipt differs')
    require(outcome['failure'] is None and outcome['runtimeAdopted'] is False,
            'failed or previously promoted build receipt')
    phases = outcome['phases']
    tests = [phase for phase in phases if phase['name'] == 'fatal-upstream-tests']
    require(len(tests) == 1 and all(phase['exitCode'] == 0 for phase in phases
                                  if phase['name'] != 'fatal-upstream-tests'),
            'non-test native phase failed or test phase missing')
    junit = ARTIFACTS / 'upstream-junit.xml'
    junit_hash = digest(junit, 16777216)
    upstream = assess(list(ET.fromstring(junit.read_bytes()).iter('testcase')),
                      pins, binding, baseline, tests[0]['exitCode'])
    upstream['junitSha256'] = junit_hash
    require(upstream == source['upstream'] == outcome['upstream']
            and outcome['candidateSignatureBinding'] == binding,
            'honest upstream/binding receipts disagree')
    expected_status = ('private-engineering-with-reviewed-exception'
                       if upstream['engineeringException'] else 'native-package-checks-pass')
    require(outcome['status'] == expected_status, 'native outcome status obscures actual failure')
    native = source['nativeVerification']
    require(outcome['nativeDiagnostic'] == {'status': 'all-original-native-checks-pass', 'result': native}
            and native['missingExports'] == [] and native['oldHeaderClientLinkedAndPassed'] is True
            and native['wholePdfRejectionClaim'] is False
            and native['soname'] == 'libpoppler.so.147'
            and native['baselineExports'] > 0
            and native['candidateExports'] >= native['baselineExports']
            and native['disabledJpxDiagnostic'] == 'Unknown filter; EOF permits unrelated text extraction',
            'native compatibility/codec verification failed')
    require([row['fixture'] for row in native['samePdfParity']] == pins['nativeParityPdfs']
            and all(row['exactCoordinateTextOrder'] is True
                    and row['standardBboxTsvByteParity'] is True
                    and row['fontInventoryParity'] is True for row in native['samePdfParity']),
            'incomplete native geometry/font parity')
    cohort = pins['packageCohort']
    require(sorted(cohort) == ['libpoppler147', 'poppler-utils']
            and set(source['cohort']) == set(cohort), 'native cohort differs')
    require(installed['normalNoRemoveApt'] is True and installed['allOtherPackagesUnchanged'] is True
            and installed['runtimeAdopted'] is False
            and installed['before'] == {name: pins['baselineVersion'] for name in cohort}
            and installed['after'] == {name: pins['packageVersion'] for name in cohort},
            'fresh exact-cohort installation proof differs')
    fresh = installed['freshNonrootProbe']
    require(all(fresh[key] is True for key in ('actualInstalledCli', 'textHashMatchesNativeParity', 'noOpenJpegLink')),
            'fresh installed-consumer proof missing')
    elf_rows = native['runtimeElfNoOpj']
    require(2 <= len(elf_rows) <= 128 and len({row['path'] for row in elf_rows}) == len(elf_rows)
            and fresh['runtimeElfHashes'] == {row['path']: row['sha256'] for row in elf_rows},
            'fresh installed ELF proof differs')
    packages = sorted(ARTIFACTS.glob('*.deb'))
    require(len(packages) == 2 and sum(path.stat().st_size for path in packages) <= 67108864,
            'runtime package count/aggregate bound')
    checked = {}
    for package in packages:
        field = lambda name: command(['dpkg-deb', '-f', str(package), name]).strip()
        name = field('Package')
        require(name in cohort and name not in checked, 'unexpected native package')
        item = source['cohort'][name]
        package_hash = digest(package, 67108864)
        require(package.name == item['file'] and package_hash == item['sha256']
                and field('Version') == item['version'] == pins['packageVersion']
                and field('Architecture') == 'arm64' and field('Source') == item['source'],
                'native package identity mismatch')
        checked[name] = {'file': package.name, 'sha256': package_hash, 'version': pins['packageVersion']}
    before = inventory()
    require(all(before[name][0] == pins['baselineVersion'] and before[name][1] == 'arm64'
                and before[name][-1] == 'installed'
                for name in cohort), 'runtime baseline package cohort differs')
    automatic_before = set(command(['apt-mark', 'showauto']).splitlines())
    held_before = set(command(['apt-mark', 'showhold']).splitlines())
    apt = ['apt-get', '--no-remove', '--no-install-recommends', '--assume-yes', 'install', *map(str, packages)]
    plan = command([apt[0], '--simulate', *apt[1:]])
    require(sorted(re.findall(r'^Inst ([^ ]+)', plan, re.M)) == sorted(cohort)
            and not re.search(r'^(Remv|Purg) ', plan, re.M), 'APT proposed non-cohort changes')
    # The RUN has network=none. Do not use APT's broken local-file --no-download path.
    subprocess.run(apt, env=ENV, check=True, timeout=60)
    command(['apt-get', 'check'])
    after = inventory()
    expected = {name: [pins['packageVersion'], *values[1:]] if name in cohort else values
                for name, values in before.items()}
    require(after == expected, 'runtime package set/version/architecture/protection/status changed')
    automatic_after = set(command(['apt-mark', 'showauto']).splitlines())
    cohort_auto = lambda values: {name for name in values if name.split(':', 1)[0] in cohort}
    require(automatic_before - cohort_auto(automatic_before) == automatic_after - cohort_auto(automatic_after)
            and set(command(['apt-mark', 'showhold']).splitlines()) == held_before,
            'non-cohort automatic/held flags changed')
    installed_hashes = {}
    elf_bytes = 0
    for row in elf_rows:
        relative = PurePosixPath(row['path'])
        require(not relative.is_absolute() and '..' not in relative.parts and relative.parts[0] == 'usr',
                'unsafe installed ELF proof path')
        path = Path('/') / str(relative)
        elf_bytes += path.stat().st_size
        require(elf_bytes <= 268435456, 'installed ELF aggregate bound')
        require(digest(path, 67108864) == row['sha256'], 'installed stripped native ELF hash differs')
        installed_hashes[str(relative)] = row['sha256']
    graph = command(['ldd', '/usr/bin/pdftotext'], timeout=10)
    require('not found' not in graph and 'libopenjp' not in graph, 'installed extractor linkage differs')
    paths = {str(Path(name).resolve(strict=True)) for name in re.findall(r'(?:=> )?(/[^\s()]+)', graph)}
    require(any(Path(name).name.startswith('libpoppler.so.147')
                and str(Path(name).relative_to('/')) in installed_hashes for name in paths),
            'installed extractor does not bind the verified stripped core')
    METADATA.mkdir(parents=True, exist_ok=False)
    metadata_hashes = {}
    for name in names:
        data = (ARTIFACTS / name).read_bytes()
        (METADATA / name).write_bytes(data)
        metadata_hashes[name] = hashlib.sha256(data).hexdigest()
    data = (RECIPE / 'build-pins.json').read_bytes()
    (METADATA / 'pins.json').write_bytes(data)
    metadata_hashes['pins.json'] = hashlib.sha256(data).hexdigest()
    result = {'cohort': checked, 'metadataSha256': metadata_hashes,
              'scope': 'Poppler installation before separately verified native Expat update',
              'junitSha256': junit_hash, 'upstream': upstream,
              'normalNoRemoveOfflineApt': True, 'allOtherPackagesAndProtectionFlagsUnchanged': True,
              'nonCohortAutomaticAndHeldFlagsUnchanged': True,
              'cohortAutomaticBefore': sorted(cohort_auto(automatic_before)),
              'cohortAutomaticAfter': sorted(cohort_auto(automatic_after)),
              'runtimeElfHashes': installed_hashes, 'installedPdftotextGraph': graph,
              'installedElfProofSource': 'nativeVerification.runtimeElfNoOpj stripped package cohort',
              'runtimeInstallVerifierSha256': digest(Path(__file__), 1048576),
              'reviewedV5ManifestSha256': '85eaeb41220256bcaa66c29cb776213e4e71dcf3078a197d00dc9b71ce640396',
              'runtimeAdopted': False, 'finalWorkerVerification': 'pending'}
    (METADATA / 'installed-package.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'nativePopplerInstalled': True, 'upstreamAllPassed': upstream['allNativeTestsPassed'],
                      'actualCtestExitCode': upstream['actualCtestExitCode'], 'runtimeAdopted': False}))


if __name__ == '__main__':
    main()
