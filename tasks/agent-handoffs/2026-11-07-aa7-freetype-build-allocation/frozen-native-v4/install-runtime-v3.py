"""Build-time libfreetype6-only installation; all final worker checks remain mandatory."""
import json
import pathlib
import re
import subprocess
import hashlib

ARTIFACTS = pathlib.Path('/build-input/freetype')
RECIPE = pathlib.Path('/build-input/freetype-recipe')
METADATA = pathlib.Path('/opt/latex/native-freetype')
ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8', 'HOME': '/root', 'DEBIAN_FRONTEND': 'noninteractive'}


def require(value, message):
    if not value: raise ValueError(message)


def digest(path, limit=1048576):
    require(path.is_file() and not path.is_symlink() and path.stat().st_size <= limit, 'nonregular/oversized input')
    with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(name):
    path = ARTIFACTS / name
    digest(path)
    return json.loads(path.read_bytes())


def command(args):
    p = subprocess.run(args, env=ENV, capture_output=True, text=True, check=True, timeout=60)
    require(len(p.stdout.encode()) + len(p.stderr.encode()) <= 1048576, 'installation command output bound')
    return p.stdout


def inventory():
    rows = command(['dpkg-query', '-W', '-f=${Package}\t${Version}\t${Architecture}\t${Essential}\t${Protected}\t${db:Status-Status}\n'])
    result = {}
    for row in rows.splitlines():
        fields = row.split('\t')
        require(len(fields) == 6 and fields[0] not in result, 'ambiguous package inventory')
        result[fields[0]] = fields[1:]
    return result


def main():
    pins_path = RECIPE / 'pins.json'
    require(digest(pins_path) == '48e6f0ddb0dbf88acbba24714208005632fcf9a6e4d9a64ac99fa631aeb3c271', 'reviewed pin identity changed')
    pins = json.loads(pins_path.read_bytes())
    source = read('source-and-test-receipt.json')
    outcome = read('build-outcome.json')
    installed = read('install-verification.json')
    require(source['status'] == outcome['status'] == 'native-private-source-abi-font-checks-pass'
            and outcome['failure'] is None and outcome['receipt'] == source
            and all(p['exitCode'] == 0 for p in outcome['phases'])
            and source['sourceVersion'] == pins['baselineVersion']
            and source['packageVersion'] == pins['packageVersion']
            and source['archiveValidSigners'] and source['noUnstableBinaries'] is True,
            'source/native build proof differs')
    require(source['vendorPatchSha256'] == pins['patch']['sha256']
            and source['baselineCidSha256'] == pins['baselineCidSourceSha256']
            and source['patchedCidSha256'] == pins['patchedCidSourceSha256']
            and source['missingExports'] == [] and source['soname'] == 'libfreetype.so.6'
            and source['originalExports'] == source['candidateExports'] > 0,
            'exact source patch/ABI proof differs')
    require(source['literalBudgetAdapter']['expectedNeutralCases'] == 5
            and source['literalBudgetAdapter']['wholeCveReproduction'] is False
            and source['upstreamMeson']['status'] == 'NOT_RUN_EXTERNAL_FONT_UNAVAILABLE'
            and installed['normalNoRemoveApt'] is True
            and installed['allOtherPackagesAndFlagsUnchanged'] is True
            and installed['noncohortAutomaticAndAllHeldFlagsUnchanged'] is True
            and installed['originalDebianDynamicAndStaticClientsPass'] is True
            and installed['originalDebianTestAssertionsUnchanged'] is True,
            'native/fresh evidence obscures missing upstream reproduction')
    require([f['font'] for f in source['neutralFontMetrics']] == pins['neutralFonts']
            and all(f['fontSha256'] == pins['neutralFontSha256'][f['font']]
                    and f['byteIdenticalMetrics'] is True for f in source['neutralFontMetrics'])
            and installed['freshInstalledLibrarySha256'] == source['strippedLibrarySha256'],
            'fixed-font/fresh installed-library proof differs')
    item = source['cohort']['libfreetype6']
    require(pathlib.PurePosixPath(item['file']).name == item['file'], 'unsafe package name')
    package = ARTIFACTS / item['file']
    require(digest(package, 67108864) == item['sha256'], 'runtime package digest differs')
    for field, expected in [('Package', 'libfreetype6'), ('Version', pins['packageVersion']), ('Architecture', 'arm64')]:
        require(command(['dpkg-deb', '-f', str(package), field]).strip() == expected, 'runtime package control identity differs')
    before = inventory()
    require(before['libfreetype6'][0] == pins['baselineVersion'] and before['libfreetype6'][1] == 'arm64', 'runtime baseline differs')
    auto_before = set(command(['apt-mark', 'showauto']).splitlines())
    held_before = set(command(['apt-mark', 'showhold']).splitlines())
    apt = ['apt-get', '--no-remove', '--no-install-recommends', '--assume-yes', 'install', str(package)]
    plan = command([apt[0], '--simulate', *apt[1:]])
    require(re.findall(r'^Inst ([^ ]+)', plan, re.M) == ['libfreetype6'] and not re.search(r'^(Remv|Purg) ', plan, re.M), 'APT proposed noncohort changes')
    subprocess.run(apt, env=ENV, check=True, timeout=60)
    command(['apt-get', 'check'])
    after = inventory()
    expected = {name: [pins['packageVersion'], *values[1:]] if name == 'libfreetype6' else values for name, values in before.items()}
    require(after == expected, 'noncohort package/flags/status changed')
    noncohort = lambda names: {name for name in names if name.split(':', 1)[0] != 'libfreetype6'}
    require(noncohort(auto_before) == noncohort(set(command(['apt-mark', 'showauto']).splitlines()))
            and held_before == set(command(['apt-mark', 'showhold']).splitlines()), 'automatic/held flags changed')
    relative = pathlib.PurePosixPath(source['strippedLibraryPath'])
    require(not relative.is_absolute() and '..' not in relative.parts and str(relative).startswith('usr/lib/'), 'unsafe library proof path')
    library = pathlib.Path('/') / str(relative)
    require(digest(library, 67108864) == source['strippedLibrarySha256'], 'installed runtime library hash differs')
    graph = command(['ldd', '/usr/bin/xetex'])
    paths = {pathlib.Path(p).resolve(strict=True) for p in re.findall(r'(?:=> )?(/[^\s()]+)', graph)}
    require(library.resolve(strict=True) in paths and 'not found' not in graph, 'XeTeX does not resolve verified library')
    METADATA.mkdir(parents=True, exist_ok=False)
    hashes = {}
    for name in ['source-and-test-receipt.json', 'build-outcome.json', 'install-verification.json']:
        data = (ARTIFACTS / name).read_bytes(); (METADATA / name).write_bytes(data); hashes[name] = hashlib.sha256(data).hexdigest()
    (METADATA / 'pins.json').write_bytes(pins_path.read_bytes())
    result = {'cohort': {'libfreetype6': item}, 'metadataSha256': hashes,
              'normalNoRemoveOfflineApt': True, 'allOtherPackagesAndFlagsUnchanged': True,
              'noncohortAutomaticAndAllHeldFlagsUnchanged': True, 'runtimeLibrarySha256': digest(library, 67108864),
              'installerSha256': digest(pathlib.Path(__file__)), 'pinsSha256': digest(pins_path),
              'literalBudgetAdapter': source['literalBudgetAdapter'],
              'baselineCidSha256': source['baselineCidSha256'], 'patchedCidSha256': source['patchedCidSha256'],
              'xetexLinkage': graph, 'actualCveFontReproduction': source['actualCveFontReproduction'],
              'upstreamMeson': source['upstreamMeson'], 'runtimeAdopted': False, 'finalWorkerVerification': 'pending'}
    (METADATA / 'installed-package.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'nativeFreeTypeInstalled': True, 'runtimeCohort': ['libfreetype6'], 'fullUpstreamSuitePassedClaim': False}))


if __name__ == '__main__': main()
