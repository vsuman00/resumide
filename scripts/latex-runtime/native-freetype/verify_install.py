"""Fresh exact two-package SDK test installation; final runtime adopts only libfreetype6."""
import json
import os
import pathlib
import re
import subprocess
import sys
from expat_source import digest

pins = json.loads(pathlib.Path('/recipe/pins.json').read_text())
receipt = json.loads(pathlib.Path('/proof/source-and-test-receipt.json').read_text())


def inventory():
    return dict(line.split('\t', 1) for line in subprocess.check_output(['dpkg-query', '-W', '-f=${Package}\t${Version} ${Architecture} ${Essential} ${Protected} ${db:Status-Status}\n'], text=True).splitlines())


if sys.argv[1:] == ['install']:
    before = inventory()
    automatic_before = set(subprocess.check_output(['apt-mark', 'showauto'], text=True).splitlines())
    held_before = set(subprocess.check_output(['apt-mark', 'showhold'], text=True).splitlines())
    packages = sorted(pathlib.Path('/packages').glob('*.deb'))
    expected = ['libfreetype-dev', 'libfreetype6']
    if len(packages) != 2 or sum(p.stat().st_size for p in packages) > 67108864:
        raise ValueError('fresh SDK package bound')
    for p in packages:
        name = subprocess.check_output(['dpkg-deb', '-f', str(p), 'Package'], text=True).strip()
        if name not in expected or receipt['cohort'][name]['file'] != p.name or receipt['cohort'][name]['sha256'] != digest(p):
            raise ValueError('fresh SDK package identity differs')
    command = ['apt-get', '--no-remove', '--no-install-recommends', '--assume-yes', 'install', *map(str, packages)]
    plan = subprocess.check_output([command[0], '--simulate', *command[1:]], text=True, timeout=30)
    if sorted(re.findall(r'^Inst ([^ ]+)', plan, re.M)) != expected or re.search(r'^(Remv|Purg) ', plan, re.M):
        raise ValueError('fresh SDK install proposed other changes')
    subprocess.run(command, check=True, timeout=60)
    subprocess.run(['apt-get', 'check'], check=True, timeout=30)
    after = inventory()
    wanted = {name: pins['packageVersion'] + ' ' + value.split(' ', 1)[1] if name in expected else value for name, value in before.items()}
    if after != wanted:
        raise ValueError('noncohort package or protection/status changed')
    automatic_after = set(subprocess.check_output(['apt-mark', 'showauto'], text=True).splitlines())
    noncohort = lambda values: {name for name in values if name.split(':', 1)[0] not in expected}
    if noncohort(automatic_before) != noncohort(automatic_after) or held_before != set(subprocess.check_output(['apt-mark', 'showhold'], text=True).splitlines()):
        raise ValueError('fresh noncohort automatic/held flags changed')
    pathlib.Path('/proof/install.json').write_text(json.dumps({'normalNoRemoveApt': True, 'allOtherPackagesAndFlagsUnchanged': True,
        'noncohortAutomaticAndAllHeldFlagsUnchanged': True, 'cohort': expected, 'finalRuntimeCohort': ['libfreetype6'], 'runtimeAdopted': False, 'plan': plan}, indent=2) + '\n')
elif sys.argv[1:] == ['probe']:
    state = dict(line.split(':', 1) for line in pathlib.Path('/proc/self/status').read_text().splitlines() if ':' in line)
    if os.getuid() != 65532 or state['NoNewPrivs'].strip() != '1' or any(int(state[n].strip(), 16) for n in ('CapEff', 'CapPrm', 'CapBnd', 'CapAmb')):
        raise ValueError('fresh SDK probe confinement differs')
    library = pathlib.Path('/') / receipt['strippedLibraryPath']
    if digest(library) != receipt['strippedLibrarySha256']:
        raise ValueError('fresh installed library hash differs')
    graph = subprocess.check_output(['ldd', '/probe/old-header-fonts'], text=True, timeout=10)
    paths = {pathlib.Path(name).resolve(strict=True) for name in re.findall(r'(?:=> )?(/[^\s()]+)', graph)}
    if library.resolve(strict=True) not in paths or 'not found' in graph:
        raise ValueError('fresh old-header client links unexpected library')
    # Run the original authenticated Debian test unchanged, including its static client.
    env = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/scratch', 'LANG': 'C.UTF-8', 'AUTOPKGTEST_TMP': '/scratch'}
    result = subprocess.run(['/bin/sh', '/probe/original-debian-autopkgtest.sh'], env=env, capture_output=True, text=True, timeout=60)
    output = result.stdout + result.stderr
    if len(output.encode()) > 1048576:
        raise ValueError('fresh original test output bound')
    pathlib.Path('/scratch/original-debian-autopkgtest.log').write_text(output)
    if result.returncode or result.stdout.count('freetype 2.13.3') != 2:
        raise ValueError('original Debian dynamic/static test failed or missing')
    font_results = []
    for i, item in enumerate(receipt['neutralFontMetrics']):
        if digest(pathlib.Path(item['font'])) != item['fontSha256']:
            raise ValueError('fresh fixed font changed')
        text = subprocess.check_output(['/probe/old-header-fonts', item['font']], env=env, text=True, timeout=10)
        import hashlib
        if hashlib.sha256(text.encode()).hexdigest() != item['candidateLogSha256']:
            raise ValueError('fresh font metrics differ')
        font_results.append({'font': item['font'], 'metricsMatch': True})
    result = json.loads(pathlib.Path('/proof/install.json').read_text())
    result.update(originalDebianDynamicAndStaticClientsPass=True, originalDebianTestAssertionsUnchanged=True,
                  upstreamMesonNotRun=receipt['upstreamMeson'], freshInstalledLibrarySha256=digest(library), fonts=font_results)
    pathlib.Path('/scratch/install-verification.json').write_text(json.dumps(result, indent=2) + '\n')
else:
    raise ValueError('expected install or probe')
