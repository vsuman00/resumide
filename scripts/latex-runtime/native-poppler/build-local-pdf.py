"""Build the separate local-PDF candidate through the frozen Poppler acceptance path."""

import json
import hashlib
from pathlib import Path
import re
import runpy
import subprocess
import xml.etree.ElementTree as ET

from expat_source import digest
import prepare_build
import verify_native


BUILDER = Path('/recipe/build.py')
BUILDER_SHA256 = '7c67c7cd42e039b90665c8af300218dfc4f8678e0cb9658ad09c632376dfe701'
PREDECESSOR_VERSION = '25.03.0-5+deb13u4+resumide1'
CANDIDATE_VERSION = '25.03.0-5+deb13u4+resumide2'
ORIGINAL_PGP_FIXTURE_SHA256 = '086c4a90f8a5e15c0ac0e327565eee7c0b771c742d37a14a6e4adc28eaa3adf6'
LOCAL_PGP_FIXTURE_SHA256 = '562ca68a5284efc252ddf1fa594e1312f36923c20a4c2b6e33b272c667e73775'
PGP_FIXTURE = Path('/work/source/test/unittestcases/some-text-pgp_signed.pdf')
ORIGINAL_PGP_COPY = Path('/work/local-pdf-original-pgp.pdf')
REMOVED_LINKAGE = re.compile(r'lib(?:curl|gssapi_krb5|krb5(?:support)?|k5crypto)\b')
REMOVED_PACKAGES = re.compile(r'\b(?:libcurl3t64-gnutls|libgssapi-krb5-2|libkrb5-3|libkrb5support0|libk5crypto3)\b')


def add_local_pdf_configuration(source, pins, provenance):
    if pins['packageVersion'] != PREDECESSOR_VERSION:
        raise ValueError('local PDF candidate predecessor version differs')
    rules = source / 'debian/rules'
    changelog = source / 'debian/changelog'
    rules_before = digest(rules)
    marker = next((line for line in rules.read_text().splitlines(keepends=True)
                   if line.lstrip().startswith('-DENABLE_LIBOPENJPEG=none')), None)
    if marker is None:
        raise ValueError('reviewed OpenJPEG configuration missing')
    existing_rules = rules.read_text()
    if existing_rules.count(marker) != 1 or 'ENABLE_LIBCURL' in existing_rules:
        raise ValueError('unexpected curl configuration in authenticated packaging')
    setting = '\t-DENABLE_LIBCURL=OFF\t\\\n'
    existing_changelog = changelog.read_text()
    expected = f'poppler ({PREDECESSOR_VERSION}) '
    if not existing_changelog.startswith(expected):
        raise ValueError('reviewed package revision missing from changelog')
    rules.write_text(existing_rules.replace(marker, marker + setting, 1))
    changelog_before = digest(changelog)
    changelog.write_text(existing_changelog.replace(expected, f'poppler ({CANDIDATE_VERSION}) ', 1))
    pins = dict(pins, packageVersion=CANDIDATE_VERSION)
    provenance = dict(provenance, packageVersion=CANDIDATE_VERSION, localPdfOnly={
        'configure': '-DENABLE_LIBCURL=OFF',
        'builderSha256': BUILDER_SHA256,
        'changedPackaging': {
            'debian/rules': [rules_before, digest(rules)],
            'debian/changelog': [changelog_before, digest(changelog)],
        },
    })
    return source, pins, provenance


def verify_legacy_signature_fixture(source, build, env):
    fixture = source.parent / 'test/unittestcases/some-text-pgp_signed.pdf'
    if fixture != PGP_FIXTURE:
        raise ValueError('unexpected signature fixture location')
    if digest(fixture) != ORIGINAL_PGP_FIXTURE_SHA256:
        raise ValueError('authenticated signature fixture differs')
    junit = Path('/export/local-pdf-legacy-signature.xml')
    case_name = 'check_qt6_signature_basics'
    result = subprocess.run(['ctest', '--test-dir', str(build), '--tests-regex', f'^{case_name}$',
                             '--no-tests=error', '--timeout', '30', '--output-junit', str(junit)],
                            env=env, capture_output=True, timeout=35)
    if not junit.is_file() or junit.stat().st_size > 1048576:
        raise ValueError('missing or oversized legacy signature report')
    cases = list(ET.parse(junit).iter('testcase'))
    if (len(cases) != 1 or cases[0].attrib['name'] != case_name
            or cases[0].find('error') is not None or cases[0].find('skipped') is not None):
        raise ValueError('incomplete legacy signature result')
    case = cases[0]
    report = {'fixtureSha256': ORIGINAL_PGP_FIXTURE_SHA256, 'junitSha256': digest(junit),
              'actualExitCode': result.returncode}
    if result.returncode == 0 and case.attrib.get('status') == 'run' and case.find('failure') is None:
        return dict(report, compatibleFixtureSha256=None)

    # Keep the exact failing public case in the evidence. This does not admit E010 for a new binary.
    baseline = json.loads(Path('/recipe/ctest_v5_baseline.json').read_text())
    output = case.findtext('system-out', default='')
    failures = re.findall(r'^FAIL!\s+:\s+([^\r\n]+)$', output, re.M)
    passes = re.findall(r'^PASS\s+:\s+([^\r\n]+)$', output, re.M)
    totals = re.findall(r'^Totals: (\d+) passed, (\d+) failed, (\d+) skipped, (\d+) blacklisted', output, re.M)
    if (result.returncode != 8 or case.attrib.get('status') != 'fail'
            or len(case.findall('failure')) != 1 or case.find('failure').attrib.get('message') != 'Failed'
            or failures != ['TestSignatureBasics::testPgp(gpg) Compared values are not the same']
            or passes != baseline['passedRows']
            or not re.search(r'Actual\s+\(siginfo0->getSignerName\(\)\)\s*:\s*""', output)
            or not re.search(r'^\s+Loc:\s+\[\./qt6/tests/check_signature_basics\.cpp\(311\)\]\s*$', output, re.M)
            or totals != [('11', '1', '0', '0')]):
        raise ValueError('legacy signature result differs from documented Debian incompatibility')

    # One authenticated public PDF on the build test tree. Its signed ranges and signature bytes
    # remain fixed. PDF whitespace preserves offsets without adding OpenPGP packets.
    original = fixture.read_bytes()
    padding_start = 82992 + 2 * 566
    content_end = 102992
    compatible = original[:padding_start] + b' ' * (content_end - padding_start) + original[content_end:]
    signed_ranges = original[:82991] + original[102993:]
    if compatible[:82991] + compatible[102993:] != signed_ranges:
        raise ValueError('signature fixture signed bytes changed')
    packet = bytes.fromhex(original[82992:padding_start].decode('ascii'))
    if bytes.fromhex(compatible[82992:content_end].decode('ascii')) != packet:
        raise ValueError('signature fixture detached packet changed')
    ORIGINAL_PGP_COPY.write_bytes(original)
    fixture.write_bytes(compatible)
    if digest(fixture) != LOCAL_PGP_FIXTURE_SHA256:
        raise ValueError('compatibility fixture hash differs')
    return dict(report, compatibleFixtureSha256=LOCAL_PGP_FIXTURE_SHA256,
                assertion='testPgp(gpg) empty signer on original PDF',
                signedRangesSha256=hashlib.sha256(signed_ranges).hexdigest(),
                detachedSignatureSha256=hashlib.sha256(packet).hexdigest())


def verify_local_pdf(source, pins, candidate, client, run, env, original_verify):
    builds = list(source.glob('obj-*'))
    if len(builds) != 1:
        raise ValueError('exact Poppler build directory missing')
    build = builds[0]
    cache = (build / 'CMakeCache.txt').read_text()
    config = (build / 'config.h').read_text()
    if ('ENABLE_LIBCURL:BOOL=OFF' not in cache.splitlines()
            or re.search(r'^#\s*define\s+ENABLE_LIBCURL\b', config, re.M)):
        raise ValueError('Poppler HTTP support remains enabled')

    native = original_verify(source, pins, candidate, client, run, env)
    for entry in native['runtimeElfNoOpj']:
        filename = str(candidate / entry['path'])
        dependencies = subprocess.check_output(['readelf', '-d', filename], text=True, timeout=10)
        if REMOVED_LINKAGE.search(dependencies):
            raise ValueError('curl or Kerberos remains in Poppler DT_NEEDED')
    libraries = candidate / 'usr/lib/aarch64-linux-gnu'
    candidate_env = dict(env, LD_LIBRARY_PATH=str(libraries))
    runtime_graphs = {}
    for tool in ('pdftotext', 'pdfinfo', 'pdftoppm', 'pdfsig'):
        graph = run(['ldd', str(candidate / 'usr/bin' / tool)], f'local-pdf-linkage-{tool}',
                    env=candidate_env, timeout=10)
        if ('not found' in graph or REMOVED_LINKAGE.search(graph)
                or str(libraries / 'libpoppler.so.147') not in graph):
            raise ValueError(f'unexpected local PDF dependency graph for {tool}')
        runtime_graphs[tool] = graph
    packages = {}
    for name in pins['packageCohort']:
        matches = list(source.parent.glob(f'{name}_{CANDIDATE_VERSION}_arm64.deb'))
        if len(matches) != 1:
            raise ValueError(f'exact local PDF package missing for {name}')
        dependencies = subprocess.check_output(['dpkg-deb', '-f', str(matches[0]), 'Depends', 'Pre-Depends'],
                                               text=True, timeout=10)
        if REMOVED_PACKAGES.search(dependencies):
            raise ValueError(f'unexpected network dependency in {name}')
        packages[name] = dependencies

    signature_fixture = verify_legacy_signature_fixture(source, build, env)
    local_pdf = {'httpSupport': False, 'runtimeGraphs': runtime_graphs, 'dependencies': packages,
                 'testOnlySignatureFixture': signature_fixture}
    print('POPPLER_LOCAL_PDF_LINKAGE ' + json.dumps(local_pdf, sort_keys=True), flush=True)
    return dict(native, localPdfOnly=local_pdf)


def main():
    if digest(BUILDER) != BUILDER_SHA256:
        raise ValueError('frozen Poppler builder changed')
    original_prepare = prepare_build.prepare
    original_verify = verify_native.verify

    def prepare(inputs, recipe, work):
        return add_local_pdf_configuration(*original_prepare(inputs, recipe, work))

    def verify(source, pins, candidate, client, run, env):
        return verify_local_pdf(source, pins, candidate, client, run, env, original_verify)

    # The isolated candidate adds two checks to the existing fatal producer and CTest gate.
    prepare_build.prepare = prepare
    verify_native.verify = verify
    try:
        runpy.run_path(str(BUILDER), run_name='__main__')
    finally:
        if ORIGINAL_PGP_COPY.is_file():
            PGP_FIXTURE.write_bytes(ORIGINAL_PGP_COPY.read_bytes())
            if digest(PGP_FIXTURE) != ORIGINAL_PGP_FIXTURE_SHA256:
                raise ValueError('original signature fixture was not restored')

    junit = Path('/export/upstream-junit.xml')
    cases = list(ET.parse(junit).iter('testcase'))
    signature = next(case for case in cases if case.attrib['name'] == 'check_qt6_signature_basics')
    passes = re.findall(r'^PASS\s+:\s+([^\r\n]+)$', signature.findtext('system-out', ''), re.M)
    if not {'TestSignatureBasics::testPgp(gpg)', 'TestSignatureBasics::testPgp(nss)'}.issubset(passes):
        raise ValueError('both positive signature backends were not exercised')
    if digest(PGP_FIXTURE) != ORIGINAL_PGP_FIXTURE_SHA256:
        raise ValueError('original signature fixture unavailable after tests')
    result = {'originalFixtureRestored': True, 'upstreamJunitSha256': digest(junit),
              'pgpBackendsPassed': ['gpg', 'nss']}
    Path('/export/local-pdf-signature-acceptance.json').write_text(json.dumps(result) + '\n')


if __name__ == '__main__':
    main()
