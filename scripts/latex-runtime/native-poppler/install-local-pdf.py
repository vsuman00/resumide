"""Install a separately verified local-PDF candidate in a disposable worker build."""

import json
from pathlib import Path
import re
import runpy
import subprocess
import sys
import xml.etree.ElementTree as ET


RECIPE = Path('/build-input/poppler-recipe')
sys.path.insert(0, str(RECIPE))
from ctest_v5 import assess

shared = runpy.run_path(str(RECIPE / 'install-runtime.py'))
command = shared['command']
digest = shared['digest']
inventory = shared['inventory']
read_json = shared['read_json']
require = shared['require']


ARTIFACTS = Path('/build-input/poppler')
COHORT = {'libpoppler147', 'poppler-utils'}
OBSOLETE = {'libcurl3t64-gnutls', 'libgssapi-krb5-2', 'libkrb5-3', 'libkrb5support0', 'libk5crypto3'}
BEFORE = '25.03.0-5+deb13u4+resumide1'
AFTER = '25.03.0-5+deb13u4+resumide2'
NETWORK_LIBRARIES = re.compile(r'lib(?:curl|gssapi_krb5|krb5(?:support)?|k5crypto)\b')
TOOLS = ('pdftotext', 'pdfinfo', 'pdftoppm', 'pdfsig')
CLOSURE_PATH = Path('/opt/latex/closure.json')
LOADER_CACHE = '/etc/ld.so.cache'


def verify_receipts(expected_sha256):
    for name, expected in shared['RECIPE_HASHES'].items():
        require(digest(RECIPE / name, 1048576) == expected, 'frozen verifier or pin file differs')
    source_file = ARTIFACTS / 'source-and-test-receipt.json'
    require(digest(source_file, 1048576) == expected_sha256, 'candidate build receipt digest differs')
    source = read_json(source_file)
    outcome = read_json(ARTIFACTS / 'build-outcome.json')
    binding = read_json(ARTIFACTS / 'candidate-signature-binding.json')
    acceptance = read_json(ARTIFACTS / 'local-pdf-signature-acceptance.json')
    pins = read_json(RECIPE / 'build-pins.json')
    baseline = read_json(RECIPE / 'ctest_v5_baseline.json')
    require(source['packageVersion'] == AFTER and source['sourceVersion'] == pins['sourceVersion']
            and source['testDataManifestSha256'] == pins['testdataManifestSha256']
            and source['archiveValidSigners'] and source['runtimeAdopted'] is False
            and source['noUnstableBinaries'] is True and set(source['cohort']) == COHORT
            and outcome['failure'] is None and outcome['runtimeAdopted'] is False
            and outcome['candidateSignatureBinding'] == binding
            and all(phase['exitCode'] == 0 for phase in outcome['phases']),
            'candidate source or build outcome differs')
    junit = ARTIFACTS / 'upstream-junit.xml'
    junit_hash = digest(junit, 16777216)
    upstream = assess(list(ET.parse(junit).iter('testcase')), pins, binding, baseline, 0)
    upstream['junitSha256'] = junit_hash
    native = source['nativeVerification']
    local = native['localPdfOnly']
    original = local['testOnlySignatureFixture']
    require(upstream == source['upstream'] == outcome['upstream']
            and upstream['allNativeTestsPassed'] is True and upstream['engineeringException'] is None
            and local['httpSupport'] is False and set(local['runtimeGraphs']) == set(TOOLS)
            and native['missingExports'] == [] and native['oldHeaderClientLinkedAndPassed'] is True
            and len(native['samePdfParity']) == len(pins['nativeParityPdfs']) == 7
            and len(native['runtimeElfNoOpj']) == 14
            and acceptance == {'originalFixtureRestored': True, 'upstreamJunitSha256': junit_hash,
                               'pgpBackendsPassed': ['gpg', 'nss']}
            and original['junitSha256'] == digest(ARTIFACTS / 'local-pdf-legacy-signature.xml', 1048576),
            'candidate signature or native receipts differ')
    return source


def installed_packages():
    return {name: fields for name, fields in inventory().items() if fields[-1] == 'installed'}


def marks(kind):
    return set(command(['apt-mark', kind]).splitlines())


def exact_plan(args, changed=(), removed=()):
    plan = command([args[0], '--simulate', *args[1:]])
    upgrades = re.findall(r'^Inst (\S+)', plan, re.M)
    removals = re.findall(r'^(?:Remv|Purg) (\S+)', plan, re.M)
    require(sorted(upgrades) == sorted(changed) and sorted(removals) == sorted(removed),
            'APT proposed changes outside the reviewed package set')


def closure_hashes(closure):
    return {path: digest(Path(path), 67108864) for path in closure['files']}


def tex_linkage(closure):
    result = {}
    for path in ('/usr/bin/xetex', '/usr/bin/xdvipdfmx'):
        graph = command(['ldd', path])
        require('not found' not in graph, 'unresolved TeX program linkage')
        locations = sorted({str(Path(value).resolve(strict=True))
                            for value in re.findall(r'/[^\s()]+', graph)})
        require(locations and set(locations) <= closure['files'].keys(),
                'TeX linkage is outside the existing closure')
        result[path] = locations
    return result


def main(expected_sha256):
    require(re.fullmatch(r'[0-9a-f]{64}', expected_sha256), 'exact local build receipt digest required')
    source = verify_receipts(expected_sha256)
    closure = read_json(CLOSURE_PATH)
    original_hashes = closure['files']
    require(LOADER_CACHE in original_hashes and closure_hashes(closure) == original_hashes,
            'predecessor TeX closure does not match installed inputs')
    original_linkage = tex_linkage(closure)
    before = installed_packages()
    require((COHORT | OBSOLETE) <= before.keys()
            and all(before[name][:2] == [BEFORE, 'arm64'] for name in COHORT)
            and all(not any(flag == 'yes' for flag in before[name][2:4]) for name in OBSOLETE),
            'predecessor package cohort or removal protections differ')
    auto, held = marks('showauto'), marks('showhold')
    require(not (COHORT | OBSOLETE) & held, 'cannot replace or purge a held package')
    packages = []
    for name, row in sorted(source['cohort'].items()):
        path = ARTIFACTS / f'{name}_{AFTER}_arm64.deb'
        actual = command(['dpkg-deb', '-f', str(path), 'Package', 'Version', 'Architecture']).splitlines()
        require(row['file'] == path.name and row['sha256'] == digest(path, 67108864)
                and actual == [f'Package: {name}', f'Version: {AFTER}', 'Architecture: arm64'],
                'candidate package differs from its build receipt')
        packages.append(str(path))

    install = ['apt-get', '--no-remove', '--no-install-recommends', '--assume-yes', 'install', *packages]
    exact_plan(install, changed=COHORT)
    print(command(install, timeout=60), end='')
    remove = ['apt-get', '-o', 'APT::Get::AutomaticRemove=false', '--assume-yes', 'purge', *sorted(OBSOLETE)]
    exact_plan(remove, removed=OBSOLETE)
    print(command(remove, timeout=60), end='')
    desired_auto = auto - OBSOLETE
    lost_auto = desired_auto - marks('showauto')
    if lost_auto:
        command(['apt-mark', 'auto', *sorted(lost_auto)])
    require(marks('showauto') == desired_auto and marks('showhold') == held,
            'unrelated APT marks changed')
    expected = {name: [AFTER, *fields[1:]] if name in COHORT else fields
                for name, fields in before.items() if name not in OBSOLETE}
    require(installed_packages() == expected, 'unrelated package versions or protection flags changed')
    command(['apt-get', 'check'])

    for row in source['nativeVerification']['runtimeElfNoOpj']:
        require(digest(Path('/') / row['path'], 67108864) == row['sha256'], 'candidate installed ELF hash differs')
    for tool in TOOLS:
        graph = command(['ldd', f'/usr/bin/{tool}'])
        require('not found' not in graph and 'libpoppler.so.147' in graph
                and not NETWORK_LIBRARIES.search(graph), 'candidate runtime PDF linkage differs')
    updated_hashes = closure_hashes(closure)
    changed_files = {path for path, old in original_hashes.items() if updated_hashes[path] != old}
    require(changed_files <= {LOADER_CACHE} and tex_linkage(closure) == original_linkage,
            'package change altered the admitted TeX programs or file inputs')
    closure['files'] = updated_hashes
    CLOSURE_PATH.write_text(json.dumps(closure, sort_keys=True))
    CLOSURE_PATH.chmod(0o444)
    lock = Path('/opt/latex/packages.lock')
    lock.write_text(command(['dpkg-query', '-W', '-f=${Package}=${Version}\n']))
    evidence = Path('/opt/latex/native-poppler-local-pdf.json')
    evidence.write_text(json.dumps({'packageVersion': AFTER, 'removedPackages': sorted(OBSOLETE),
                                    'unchangedPackageCount': len(expected) - len(COHORT),
                                    'sourceReceiptSha256': expected_sha256,
                                    'upstream': source['upstream'],
                                    'signatureFixture': source['nativeVerification']['localPdfOnly']['testOnlySignatureFixture'],
                                    'changedClosureFiles': sorted(changed_files),
                                    'texLinkageUnchanged': True,
                                    'runtimeEngineeringCandidate': True}, indent=2) + '\n')
    lock.chmod(0o444)
    evidence.chmod(0o444)


if __name__ == '__main__':
    main(*sys.argv[1:])
