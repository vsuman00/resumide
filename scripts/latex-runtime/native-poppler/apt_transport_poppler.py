"""One reviewed Poppler build plan; shared transport and runtime limits unchanged."""
import concurrent.futures
import hashlib
import importlib.util
import json
import os
import pathlib
import signal
import subprocess
import tempfile
import time
import urllib.parse

LOCK_FILE_SHA256 = '44bddc307273b684a4830b10bd5ff2d94dada706d3972dbb5b0f12597217af01'
LOCK_OBJECT_SHA256 = '93f1bd5aaaeefacb5f6539f6386834093010b1cef472848a6f038ded862f1044'
HELPER_SHA256 = '8b831a59cd8f2f89925b755973c1ef764daa2722207bfd24742114c67d31ded8'
_FIELDS = {'snapshotUri', 'url', 'filename', 'size', 'sha256'}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def validate_plan(plan, targets, lock):
    """Validate parsed native APT records, returning them only for the exact lock."""
    if hashlib.sha256(canonical(lock)).hexdigest() != LOCK_OBJECT_SHA256:
        raise ValueError('reviewed lock object changed')
    if targets != lock['targets'] or type(plan) is not list or len(plan) != lock['files']:
        raise ValueError('native plan targets/count changed')
    normalized = []
    for record in plan:
        if type(record) is not dict or set(record) != _FIELDS:
            raise ValueError('native plan record fields changed')
        if type(record['size']) is not int or not 0 < record['size'] <= 33554432:
            raise ValueError('native plan individual byte bound exceeded')
        if any(type(record[name]) is not str for name in _FIELDS - {'size'}):
            raise ValueError('native plan record types changed')
        filename = urllib.parse.unquote(record['filename'])
        if not filename.endswith('.deb'):
            raise ValueError('native plan filename changed')
        parts = filename[:-4].rsplit('_', 2)
        if len(parts) != 3:
            raise ValueError('native plan package/version/architecture missing')
        package, version, architecture = parts
        normalized.append(dict(record, package=package, version=version, architecture=architecture))
    if len({record['filename'] for record in normalized}) != len(normalized):
        raise ValueError('duplicate native plan filename')
    if sum(record['size'] for record in normalized) != lock['aggregateBytes']:
        raise ValueError('native plan aggregate bytes changed')
    if sorted(normalized, key=lambda record: record['filename']) != lock['records']:
        raise ValueError('native plan membership/version/URL/hash/size changed')
    return plan


def capture(command):
    with tempfile.TemporaryFile() as stdout, tempfile.TemporaryFile() as stderr:
        process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr, start_new_session=True)
        deadline = time.monotonic() + 30
        try:
            while process.poll() is None:
                if time.monotonic() > deadline or os.fstat(stdout.fileno()).st_size > 1048576 or os.fstat(stderr.fileno()).st_size > 131072:
                    raise ValueError('native plan output/time bound exceeded')
                time.sleep(0.05)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
        if process.returncode or os.fstat(stdout.fileno()).st_size > 1048576 or os.fstat(stderr.fileno()).st_size > 131072:
            raise ValueError('native plan command failed or output exceeded bound')
        stdout.seek(0)
        return stdout.read()


def main():
    recipe = pathlib.Path('/recipe')
    lock_path = recipe / 'dependency-plan.lock.json'
    if hashlib.sha256(lock_path.read_bytes()).hexdigest() != LOCK_FILE_SHA256:
        raise ValueError('reviewed lock file changed')
    lock = json.loads(lock_path.read_text())
    pins = json.loads((recipe / 'build-pins.json').read_text())
    if hashlib.sha256((recipe / 'apt-transport.py').read_bytes()).hexdigest() != HELPER_SHA256:
        raise ValueError('shared transport helper changed')
    if pathlib.Path('/etc/apt/sources.list').read_text() != lock['sourcesList']:
        raise ValueError('signed snapshot sources changed')
    keyring = pathlib.Path('/usr/share/keyrings/debian-archive-keyring.gpg')
    if hashlib.sha256(keyring.read_bytes()).hexdigest() != lock['keyringSha256']:
        raise ValueError('archive keyring changed')
    releases = [{'filename': path.name, 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
                for path in sorted(pathlib.Path('/var/lib/apt/lists').glob('*InRelease'))]
    if releases != lock['signedMetadata']:
        raise ValueError('authenticated fixed snapshot release bytes changed')
    spec = importlib.util.spec_from_file_location('reviewed_shared_transport', recipe / 'apt-transport.py')
    transport = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(transport)
    if transport.MAX_FILE != 33554432 or transport.MAX_TOTAL != 268435456:
        raise ValueError('shared transport bounds changed')
    if pins['buildDependencies'] != lock['targets']:
        raise ValueError('native build targets changed')
    command = ['apt-get', '-qq', '-o', 'Acquire::ForceHash=SHA256', '--print-uris', '--download-only',
               '--assume-yes', '--no-install-recommends', 'install', *pins['buildDependencies']]
    raw = capture(command)
    plan = [transport.parse(line) for line in raw.decode().splitlines() if line.strip()]
    validate_plan(plan, pins['buildDependencies'], lock)
    cache = pathlib.Path('/var/cache/apt/archives')
    cache.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + 300
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        verified = list(pool.map(lambda item: transport.fetch(item, cache, deadline), plan))
    result = {'schemaVersion': 'resumide-native-apt-transport/1', 'command': command,
              'signedMetadataSelectionUnchanged': True, 'normalAptRevalidationRequired': True,
              'bytes': sum(item['size'] for item in verified), 'packages': verified,
              'buildOnlyExactPlanException': 'Proposed E-009; one reviewed retry; runtime floors unchanged',
              'exactPlanLockSha256': LOCK_FILE_SHA256, 'rawNativePlanSha256': hashlib.sha256(raw).hexdigest(),
              'sharedHelperSha256': HELPER_SHA256, 'sharedHelperLimitsUnchanged': True,
              'actualBuildTransportEnvelope': {'files': 511, 'aggregateBytes': 285565892,
                                                'perFileBytes': 33554432, 'workers': 4, 'transferDeadlineSeconds': 300}}
    (recipe / 'build-dependency-transport.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'verifiedAptArchives': len(verified), 'bytes': result['bytes'], 'exactPlanLockSha256': LOCK_FILE_SHA256}), flush=True)


if __name__ == '__main__':
    main()
