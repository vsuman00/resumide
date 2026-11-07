"""Authenticate exact installed-version source and append one vendor security patch."""
import json
import lzma
import pathlib
import shutil
import subprocess
import tarfile
from email.parser import Parser
from expat_source import checksums, digest


def prepare(inputs, recipe, work):
    pins = json.loads((recipe / 'pins.json').read_text())
    expected = pins['sourceInputs'] + [dict(pins['sourceIndex'], name='trixie-security-Sources.xz')]
    if {p.name for p in inputs.iterdir()} != {p['name'] for p in expected}:
        raise ValueError('unexpected source input set')
    for item in expected:
        p = inputs / item['name']
        if p.is_symlink() or not p.is_file() or p.stat().st_size != item['size'] or digest(p) != item['sha256']:
            raise ValueError('source type/size/hash mismatch')
    release = recipe / 'provenance/trixie-security.InRelease'
    if digest(release) != pins['sourceIndex']['releaseSha256']:
        raise ValueError('signed release hash mismatch')
    if digest(pathlib.Path('/usr/share/keyrings/debian-archive-keyring.gpg')) != pins['keyringSha256']:
        raise ValueError('archive keyring changed')
    result = subprocess.run(['gpgv', '--keyring', '/usr/share/keyrings/debian-archive-keyring.gpg', '--status-fd', '1', str(release)], capture_output=True, text=True, timeout=15)
    pathlib.Path('/export/source-signature.log').write_text(result.stdout + result.stderr)
    events = [line.split()[1:] for line in result.stdout.splitlines() if line.startswith('[GNUPG:] ')]
    signers = [event[1] for event in events if event[0] == 'VALIDSIG']
    if result.returncode or not signers or any(event[0] in {'BADSIG', 'ERRSIG', 'EXPSIG', 'EXPKEYSIG', 'REVKEYSIG', 'NO_PUBKEY'} for event in events):
        raise ValueError('archive signature rejected')
    index = pins['sourceIndex']
    if not any(line.split() == [index['sha256'], str(index['size']), index['signedPath']] for line in release.read_text().splitlines()):
        raise ValueError('index absent from signed release')
    found = []
    with lzma.open(inputs / 'trixie-security-Sources.xz', 'rt') as stream:
        block = []
        size = 0
        for line in stream:
            size += len(line)
            if size > 128 * 1024 * 1024:
                raise ValueError('Sources expansion exceeded')
            if line.strip():
                block.append(line)
            else:
                stanza = Parser().parsestr(''.join(block)); block = []
                if stanza['Package'] == 'freetype' and stanza['Version'] == pins['baselineVersion']:
                    found.append(stanza)
    if len(found) != 1 or found[0].get('Extra-Source-Only') == 'yes':
        raise ValueError('exact active source missing')
    records = checksums(found[0])
    if records != {item['name']: (item['sha256'], item['size']) for item in pins['sourceInputs']}:
        raise ValueError('source archive set changed')
    dsc = inputs / ('freetype_' + pins['baselineVersion'] + '.dsc')
    control = Parser().parsestr(dsc.read_text().split('\n\n', 1)[1].split('-----BEGIN PGP SIGNATURE-----')[0])
    if any(records.get(name) != value for name, value in checksums(control).items()):
        raise ValueError('DSC archive checksums differ from signed index')
    for item in pins['sourceInputs']:
        if item['name'].endswith('.tar.xz'):
            with tarfile.open(inputs / item['name']) as archive:
                members = archive.getmembers()
                if len(members) > 10000 or sum(member.size for member in members) > 160 * 1024 * 1024:
                    raise ValueError('source archive expansion bound exceeded')
    # Normal dpkg-source handles all original quilt patches and multi-orig components.
    source = work / 'source'
    subprocess.run(['dpkg-source', '-x', str(dsc), str(source)], check=True, timeout=60)
    before = {str(p.relative_to(source)): digest(p) for p in (source / 'debian').rglob('*') if p.is_file()}
    if before != pins['originalDebianFiles'] or digest(source / 'src/cid/cidload.c') != pins['baselineCidSourceSha256']:
        raise ValueError('original packaging/CID source changed')
    shutil.copy2(source / 'src/cid/cidload.c', work / 'baseline-cidload.c')
    patch = recipe / 'patches' / pins['patch']['name']
    if digest(patch) != pins['patch']['sha256']:
        raise ValueError('vendor patch identity changed')
    shutil.copy2(patch, source / 'debian/patches' / patch.name)
    series = source / 'debian/patches/series'
    series.write_text(series.read_text() + patch.name + '\n')
    changelog = source / 'debian/changelog'
    changelog.write_text('freetype (' + pins['packageVersion'] + ') UNRELEASED; urgency=high\n\n  * Local Trixie-native backport of CVE-2026-95512 upstream overlap limit.\n  * Preserve original Debian packaging, features and five existing patches.\n  * Actual malicious-font reproduction is unavailable; no exploit-proof claim.\n\n -- Resumide local build <build@localhost>  Sat, 07 Nov 2026 00:00:00 +0000\n\n' + changelog.read_text())
    subprocess.run(['dpkg-source', '--before-build', str(source)], check=True, timeout=30)
    if digest(source / 'src/cid/cidload.c') != pins['patchedCidSourceSha256']:
        raise ValueError('patched CID source differs')
    allowed = {'debian/changelog', 'debian/patches/series'}
    for name, sha in before.items():
        if name not in allowed and digest(source / name) != sha:
            raise ValueError('unreviewed Debian packaging change')
    return source, pins, {'archiveValidSigners': signers, 'developerDscSignatureVerified': False,
                          'originalPackagingHashes': before, 'baselineCidSha256': pins['baselineCidSourceSha256'],
                          'patchedCidSha256': pins['patchedCidSourceSha256'], 'vendorPatchSha256': digest(patch),
                          'sourceVersion': pins['baselineVersion'], 'packageVersion': pins['packageVersion'],
                          'noUnstableBinaries': True, 'actualCveFontReproduction': 'not-run; unavailable and no new font fixture authorized'}
