"""Normal exact-cohort APT installation; fresh nonprivileged decoder probe."""
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
from native_geometry import parse_geometry

recipe = pathlib.Path('/recipe')
pins = json.loads((recipe / 'build-pins.json').read_text())
receipt = json.loads(pathlib.Path('/proof/source-and-test-receipt.json').read_text())


def inventory():
    data = subprocess.check_output(['dpkg-query', '-W', '-f=${Package}\t${Version}\n'], text=True)
    return dict(line.split('\t') for line in data.splitlines())


if sys.argv[1:] == ['install']:
    before = inventory()
    flags_before = subprocess.check_output(['dpkg-query', '-W', '-f=${Package} ${Essential} ${Protected}\n', *pins['packageCohort']], text=True)
    if any(before[name] != pins['baselineVersion'] for name in pins['packageCohort']):
        raise ValueError('install-test baseline differs')
    files = sorted(pathlib.Path('/packages').glob('*.deb'))
    if len(files) != 2:
        raise ValueError('install-test package set differs')
    for package in files:
        name = subprocess.check_output(['dpkg-deb', '-f', str(package), 'Package'], text=True).strip()
        item = receipt['cohort'][name]
        if package.name != item['file'] or hashlib.sha256(package.read_bytes()).hexdigest() != item['sha256']:
            raise ValueError('install-test package identity differs')
    command = ['apt-get', '--no-remove', '--no-install-recommends', '--assume-yes', 'install', *map(str, files)]
    plan = subprocess.run([command[0], '--simulate', *command[1:]], capture_output=True, text=True, check=True, timeout=30)
    installs = re.findall(r'^Inst ([^ ]+)', plan.stdout, re.M)
    if sorted(installs) != sorted(pins['packageCohort']) or re.search(r'^(Remv|Purg) ', plan.stdout, re.M):
        raise ValueError('APT proposed changes outside exact two-package cohort')
    subprocess.run(command, check=True, timeout=60)
    subprocess.run(['apt-get', 'check'], check=True, timeout=30)
    after = inventory()
    if subprocess.check_output(['dpkg-query', '-W', '-f=${Package} ${Essential} ${Protected}\n', *pins['packageCohort']], text=True) != flags_before:
        raise ValueError('Essential/Protected flags changed')
    if set(after) != set(before) or any(after[name] != (pins['packageVersion'] if name in pins['packageCohort'] else version) for name, version in before.items()):
        raise ValueError('installed package set/version changed outside reviewed cohort')
    pathlib.Path('/proof/install-verification.json').write_text(json.dumps({'normalNoRemoveApt': True,
        'before': {name: before[name] for name in pins['packageCohort']},
        'after': {name: after[name] for name in pins['packageCohort']}, 'allOtherPackagesUnchanged': True,
        'plan': plan.stdout, 'runtimeAdopted': False}, indent=2) + '\n')
elif sys.argv[1:] == ['probe']:
    status = dict(line.split(':', 1) for line in pathlib.Path('/proc/self/status').read_text().splitlines() if ':' in line)
    if os.getuid() != 65532 or status['NoNewPrivs'].strip() != '1' or any(int(status[name].strip(), 16) for name in ('CapEff', 'CapPrm', 'CapBnd', 'CapAmb')):
        raise ValueError('fresh installed-consumer isolation differs')
    link = subprocess.check_output(['ldd', '/usr/bin/pdftotext'], text=True, timeout=5)
    if 'libopenjp' in link:
        raise ValueError('fresh installed extractor still resolves OpenJPEG')
    actual_hashes = {}
    for item in receipt['nativeVerification']['runtimeElfNoOpj']:
        path = pathlib.Path('/') / item['path']
        if hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
            raise ValueError('fresh installed runtime ELF hash differs')
        actual_hashes[item['path']] = item['sha256']
    proof = next(item for item in receipt['nativeVerification']['samePdfParity'] if item['fixture'] == 'unittestcases/truetype.pdf')
    pdf = pathlib.Path('/probe/truetype.pdf')
    if hashlib.sha256(pdf.read_bytes()).hexdigest() != proof['pdfSha256']:
        raise ValueError('fresh installed-consumer neutral PDF differs')
    output = pathlib.Path('/scratch/fresh.frame')
    subprocess.run(['/usr/bin/pdftotext', '-resumide-bbox', str(pdf), str(output)], check=True, timeout=10)
    if not output.is_file() or output.stat().st_size > 2097152:
        raise ValueError('fresh installed-consumer frame missing/oversized')
    text = parse_geometry(output.read_bytes(), proof['pages'])
    if hashlib.sha256(text.encode()).hexdigest() != proof['textSha256']:
        raise ValueError('fresh installed-consumer text differs')
    result = json.loads(pathlib.Path('/proof/install-verification.json').read_text())
    result['freshNonrootProbe'] = {'actualInstalledCli': True, 'textHashMatchesNativeParity': True, 'noOpenJpegLink': True, 'runtimeElfHashes': actual_hashes}
    pathlib.Path('/scratch/install-verification.json').write_text(json.dumps(result, indent=2) + '\n')
else:
    raise ValueError('expected one fixed verification mode')
