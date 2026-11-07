"""Authenticate and prepare exact Poppler source/data; no trust or test fallback."""
import json
import lzma
import pathlib
import shutil
import subprocess
from email.parser import Parser
from expat_source import checksums, digest, extract


def prepare(inputs, recipe, work):
    pins = json.loads((recipe / 'build-pins.json').read_text())
    original = json.loads((recipe / 'pins.json').read_text())
    expected = pins['sourceInputs'] + [dict(pins['sourcesIndex'], size=pins['sourcesIndex']['bytes']),
                                      dict(pins['testdata'], size=pins['testdata']['bytes'])]
    if {p.name for p in inputs.iterdir()} != {item['name'] for item in expected}:
        raise ValueError('unexpected source/data input set')
    for item in expected:
        path = inputs / item['name']
        if not path.is_file() or path.is_symlink() or path.stat().st_size != item['size'] or digest(path) != item['sha256']:
            raise ValueError('pinned input size/hash/type mismatch')
    release = recipe / 'provenance' / pins['signedRelease']['name']
    if digest(release) != pins['signedRelease']['sha256'] or digest(pathlib.Path('/usr/share/keyrings/debian-archive-keyring.gpg')) != pins['keyringSha256']:
        raise ValueError('archive trust input hash mismatch')
    result = subprocess.run(['gpgv', '--keyring', '/usr/share/keyrings/debian-archive-keyring.gpg',
                             '--status-fd', '1', str(release)], capture_output=True, text=True, timeout=15)
    pathlib.Path('/export/source-signature.log').write_text('exitCode=' + str(result.returncode) + '\n' + result.stdout + result.stderr)
    events = [line.split()[1:] for line in result.stdout.splitlines() if line.startswith('[GNUPG:] ')]
    signers = [event[1] for event in events if event[0] == 'VALIDSIG']
    if result.returncode or not signers or any(event[0] in {'BADSIG', 'ERRSIG', 'EXPSIG', 'EXPKEYSIG', 'REVKEYSIG', 'NO_PUBKEY'} for event in events):
        raise ValueError('archive signature verification failed')
    index = pins['sourcesIndex']
    if not any(line.split() == [index['sha256'], str(index['bytes']), 'main/source/Sources.xz'] for line in release.read_text().splitlines()):
        raise ValueError('Sources hash not in signed release')
    found = []
    with lzma.open(inputs / index['name'], 'rt') as stream:
        paragraph = []
        count = 0
        for line in stream:
            count += len(line)
            if count > 128 * 1024 * 1024:
                raise ValueError('Sources expansion bound exceeded')
            if line.strip():
                paragraph.append(line)
            else:
                stanza = Parser().parsestr(''.join(paragraph))
                paragraph = []
                if stanza['Package'] == 'poppler' and stanza['Version'] == pins['sourceVersion']:
                    found.append(stanza)
    if len(found) != 1 or found[0].get('Extra-Source-Only') == 'yes':
        raise ValueError('exact active Poppler source not found')
    for name, (sha, size) in checksums(found[0]).items():
        path = inputs / name
        if path.stat().st_size != size or digest(path) != sha:
            raise ValueError('archive not authenticated by signed Sources')
    dsc_path = inputs / ('poppler_' + pins['sourceVersion'] + '.dsc')
    dsc_text = dsc_path.read_text().split('\n\n', 1)[1].split('-----BEGIN PGP SIGNATURE-----')[0]
    for name, record in checksums(Parser().parsestr(dsc_text)).items():
        if checksums(found[0]).get(name) != record:
            raise ValueError('DSC archive checksums disagree with signed Sources')
    work.mkdir()
    extract(inputs / 'poppler_25.03.0.orig.tar.xz', work)
    source = work / 'poppler-25.03.0'
    extract(inputs / ('poppler_' + pins['sourceVersion'] + '.debian.tar.xz'), source)
    before = {str(p.relative_to(source)): digest(p) for p in (source / 'debian').rglob('*') if p.is_file()}
    if digest(source / 'debian/rules') != original['baselineFiles']['debian/rules']:
        raise ValueError('original Debian rules mismatch')
    for name in ['disable-openjpeg-packaging.diff', 'changelog-proposal.diff', 'series-proposal.diff']:
        subprocess.run(['patch', '--batch', '--forward', '--fuzz=0', '-p1', '-i', str(recipe / name)], cwd=source, check=True, timeout=15)
    patch = recipe / 'patches/resumide-native-geometry-v1.patch'
    if digest(patch) != original['patches'][0]['sha256']:
        raise ValueError('producer patch digest mismatch')
    shutil.copy2(patch, source / 'debian/patches' / patch.name)
    subprocess.run(['dpkg-source', '--before-build', str(source)], check=True, timeout=30)
    for name, sha in original['candidateFiles'].items():
        if digest(source / name) != sha:
            raise ValueError('reviewed candidate source mismatch')
    for name, sha in before.items():
        if name not in {'debian/rules', 'debian/changelog', 'debian/patches/series'} and digest(source / name) != sha:
            raise ValueError('unreviewed original packaging change')
    data_manifest = recipe / 'provenance/testdata-files.json'
    if digest(data_manifest) != pins['testdataManifestSha256']:
        raise ValueError('test-data manifest hash mismatch')
    data = json.loads(data_manifest.read_text())
    extract(inputs / pins['testdata']['name'], work)
    data_root = work / 'poppler-test-data'
    expected_files = {item['path'] for item in data['files']}
    if {str(p.relative_to(data_root)) for p in data_root.rglob('*') if p.is_file()} != expected_files:
        raise ValueError('test-data file set differs')
    for item in data['files']:
        path = data_root / item['path']
        if path.is_symlink() or not path.is_file() or path.stat().st_size != item['bytes'] or digest(path) != item['sha256']:
            raise ValueError('test-data file hash/type/size mismatch')
    data_root.rename(work / 'test')
    return source, pins, {'archiveValidSigners': signers, 'developerDscSignatureIndependentlyVerified': False,
                          'sourceVersion': pins['sourceVersion'], 'packageVersion': pins['packageVersion'],
                          'originalPackagingHashes': before, 'testDataCommit': data['commit'],
                          'testDataRootTree': data['rootTree'], 'testDataFiles': len(data['files']),
                          'testDataManifestSha256': digest(data_manifest), 'noUnstableBinaries': True}
