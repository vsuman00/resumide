"""Remove only two reviewed packages while preserving the PDF worker closure."""

from hashlib import sha256
import json
from pathlib import Path
import re
from shutil import which
import subprocess


REMOVE = {
    'ca-certificates': ('20250419+deb13u1', 'all', 'no', 'no'),
    'openssl': ('3.5.7-1~deb13u3', 'arm64', 'no', 'no'),
}
CRYPTO_LIBRARIES = {'libssl3t64', 'openssl-provider-legacy'}
PROGRAMS = ('/usr/bin/python3', '/usr/bin/xetex', '/usr/bin/xdvipdfmx', '/usr/bin/pdftotext', '/usr/bin/pdfsig')
CLOSURE = Path('/opt/latex/closure.json')


def command(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT, timeout=45)


def package_inventory():
    pattern = '${Package}\t${Version}\t${Architecture}\t${Essential}\t${Protected}\t${db:Status-Status}\n'
    rows = command('dpkg-query', '-W', '-f=' + pattern).splitlines()
    return {
        fields[0]: tuple(fields[1:5])
        for fields in (row.split('\t') for row in rows)
        if fields[-1] == 'installed'
    }


def file_hash(path):
    return sha256(Path(path).read_bytes()).hexdigest()


def linkage(program):
    graph = command('ldd', program)
    if 'not found' in graph:
        raise RuntimeError('An expected executable has an unresolved dependency')
    libraries = {str(Path(path).resolve(strict=True)) for path in re.findall(r'/[^\s()]+', graph)}
    if not libraries:
        raise RuntimeError('Missing expected ELF dependencies')
    return {path: file_hash(path) for path in sorted(libraries | {program})}


def verify_closure(closure):
    if any(file_hash(path) != digest for path, digest in closure['files'].items()):
        raise RuntimeError('A sealed compiler file changed')


def main():
    before = package_inventory()
    if any(before.get(name) != identity for name, identity in REMOVE.items()):
        raise RuntimeError('Unexpected version, architecture or protection flag')
    if not CRYPTO_LIBRARIES <= before.keys():
        raise RuntimeError('Expected crypto libraries are missing')
    held = set(command('apt-mark', 'showhold').splitlines())
    auto = set(command('apt-mark', 'showauto').splitlines())
    if held.intersection(REMOVE):
        raise RuntimeError('The package removal includes a held package')
    closure = json.loads(CLOSURE.read_text())
    verify_closure(closure)
    graphs = {program: linkage(program) for program in PROGRAMS}
    args = ('-o', 'APT::Get::AutomaticRemove=false', '--assume-yes', 'purge', *sorted(REMOVE))
    plan = command('apt-get', '--simulate', *args)
    if (set(re.findall(r'^(?:Remv|Purg) (\S+)', plan, re.M)) != REMOVE.keys()
            or re.search(r'^Inst ', plan, re.M)
            or re.search(r'essential packages will be removed|protected packages will be removed', plan, re.I)):
        raise RuntimeError('APT proposed changes outside the exact removal set')
    command('apt-get', *args)
    command('apt-get', 'check')
    after = package_inventory()
    if (after != {name: identity for name, identity in before.items() if name not in REMOVE}
            or set(command('apt-mark', 'showauto').splitlines()) != auto - REMOVE.keys()
            or set(command('apt-mark', 'showhold').splitlines()) != held):
        raise RuntimeError('Unrelated package versions, status or marks changed')
    verify_closure(closure)
    if graphs != {program: linkage(program) for program in PROGRAMS}:
        raise RuntimeError('A compiler or PDF dependency changed')
    if which('openssl') or Path('/etc/ssl/certs/ca-certificates.crt').exists():
        raise RuntimeError('An expected CLI or generated bundle still exists')
    lock = command('dpkg-query', '-W', '-f=${Package}=${Version}\n')
    Path('/opt/latex/packages.lock').write_text(lock)
    print(json.dumps({
        'removed': sorted(REMOVE),
        'retainedPackages': len(after),
        'sealedFilesVerified': len(closure['files']),
        'unchangedElfGraphs': [Path(program).name for program in PROGRAMS],
        'cryptoPackagesRetained': sorted(CRYPTO_LIBRARIES),
    }))


if __name__ == '__main__':
    main()
