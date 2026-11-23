"""One allocated local FreeType source build; never run without coordinator GO."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import stat
import subprocess
import tarfile
import tempfile
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
RECIPE = ROOT / 'scripts/latex-runtime/native-freetype'
if len(sys.argv) != 3 or not all(re.fullmatch(r'[a-f0-9]{64}', value) for value in sys.argv[1:]):
    raise ValueError('required reviewed manifest/context SHA256 arguments')
EXPECTED_REVIEW, EXPECTED_CONTEXT = sys.argv[1:]
ATTEMPT = Path(tempfile.mkdtemp(prefix='resumide-aa7-native-freetype-build-'))
ATTEMPT.chmod(0o700)
for name in ['home', 'tmp', 'exports', 'transport']: (ATTEMPT / name).mkdir(mode=0o700)
ENV = {'HOME': str(ATTEMPT / 'home'), 'LANG': 'C.UTF-8', 'PATH': '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin', 'TMPDIR': str(ATTEMPT / 'tmp')}
ADMISSION = 7000000000
FLOOR = 5176082432
DEADLINE = 2400
process = None
container = None
started = time.monotonic()
receipt = {'status': 'PREFLIGHT', 'attemptDirectory': str(ATTEMPT), 'runtimeAdopted': False,
           'resourceAllocation': 'new FT-specific one-attempt review; not expired E011',
           'admissionBytes': ADMISSION, 'floorBytes': FLOOR, 'hostDeadlineSeconds': DEADLINE,
           'logCapBytes': 33554432, 'peakUseGuarantee': False}


def digest(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()


def free(): return shutil.disk_usage(ATTEMPT).free


def limits():
    value = free()
    receipt['minimumObservedFreeBytes'] = min(value, receipt.get('minimumObservedFreeBytes', value))
    if value < FLOOR or time.monotonic() - started > DEADLINE:
        raise RuntimeError('host deadline/restored-database reserve floor')


def snapshot():
    if digest(RECIPE / 'review-manifest.v4.json') != EXPECTED_REVIEW or digest(RECIPE / 'context-manifest.v4.json') != EXPECTED_CONTEXT:
        raise ValueError('approved manifest identity changed')
    review = json.loads((RECIPE / 'review-manifest.v4.json').read_text())
    context = json.loads((RECIPE / 'context-manifest.v4.json').read_text())
    for root, rows in [(RECIPE, review['files']), (RECIPE.parent, context['files'])]:
        for item in rows:
            path = root / item['path']
            if path.is_symlink() or not path.is_file() or path.stat().st_size != item['bytes'] or digest(path) != item['sha256']:
                raise ValueError('frozen input changed: ' + item['path'])
    return {'review': digest(RECIPE / 'review-manifest.v4.json'), 'context': digest(RECIPE / 'context-manifest.v4.json')}


def command(argv, timeout=15):
    p = subprocess.run(argv, env=ENV, stdin=subprocess.DEVNULL, capture_output=True, timeout=timeout)
    if len(p.stdout) + len(p.stderr) > 2097152 or p.returncode:
        raise RuntimeError('metadata operation failed: ' + str(p.returncode) + ' ' + p.stderr.decode(errors='replace')[:1000])
    return p.stdout


try:
    receipt['sourcesBefore'] = snapshot()
    receipt['freeBefore'] = free()
    if free() < ADMISSION: raise RuntimeError('FT admission below7000000000B')
    limits()
    socket = Path('/var/run/docker.sock').resolve(strict=True)
    if socket != Path('/Users/vaibhavsuman/.docker/run/docker.sock') or not stat.S_ISSOCK(socket.stat().st_mode):
        raise ValueError('unexpected Docker endpoint')
    tool = '/Applications/Docker.app/Contents/Resources/cli-plugins/docker-buildx'
    receipt['buildxVersion'] = command([tool, 'version']).decode().strip()
    builder = command([tool, 'inspect', 'default']).decode()
    if not re.search(r'^Driver:\s+docker$', builder, re.M): raise ValueError('local Docker driver required')
    receipt['unixEndpoint'] = str(socket)
    tag = 'resumide-freetype:aa7-native-' + ATTEMPT.name.rsplit('-', 1)[-1]
    argv = [tool, 'build', '--platform', 'linux/arm64', '--pull=false', '--target', 'artifacts', '--progress=plain', '--tag', tag,
            '--iidfile', str(ATTEMPT / 'image.iid'), '--file', str(RECIPE / 'Dockerfile.v4'), str(RECIPE.parent)]
    receipt.update(status='RUNNING', argv=argv, environmentNames=sorted(ENV))
    (ATTEMPT / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'attempt': str(ATTEMPT), 'argv': argv}), flush=True)
    log = ATTEMPT / 'build.log'
    with log.open('wb') as out:
        log.chmod(0o600)
        process = subprocess.Popen(argv, env=ENV, cwd=ROOT, stdin=subprocess.DEVNULL, stdout=out, stderr=subprocess.STDOUT, start_new_session=True)
        while process.poll() is None:
            limits()
            if log.stat().st_size > 33554432: raise RuntimeError('host log cap')
            time.sleep(.5)
        out.flush(); os.fsync(out.fileno())
    limits()
    receipt.update(buildExit=process.returncode, buildSeconds=round(time.monotonic() - started, 3), logSha256=digest(log), logBytes=log.stat().st_size)
    if process.returncode or log.stat().st_size > 33554432: raise RuntimeError('build failed; no artifact export')
    image = (ATTEMPT / 'image.iid').read_text().strip()
    metadata = json.loads(command(['docker', 'image', 'inspect', image]))
    if len(metadata) != 1 or metadata[0]['Id'] != image or metadata[0]['Architecture'] != 'arm64': raise ValueError('artifact identity differs')
    (ATTEMPT / 'image-inspect.json').write_text(json.dumps(metadata, indent=2) + '\n')
    receipt['artifactImageId'] = image
    name = 'aa7-freetype-artifact-' + ATTEMPT.name.rsplit('-', 1)[-1]
    container = command(['docker', 'create', '--name', name, '--label', 'resumide.aa7.freetype=' + name, '--network', 'none', '--read-only', '--user', '65532:65532', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', image, '/never-execute']).decode().strip()
    ci = json.loads(command(['docker', 'inspect', container]))[0]
    if ci['State']['Status'] != 'created' or ci['State']['Running'] or ci['Mounts'] or ci['Image'] != image: raise ValueError('artifact container not inert')
    copied = []
    total = deb_total = 0
    def copy(name, cap, expected=None):
        global total, deb_total
        if PurePosixPath(name).name != name or name in {'.', '..'}: raise ValueError('unsafe exact artifact name')
        tarpath = ATTEMPT / 'transport' / (name + '.tar')
        err = ATTEMPT / 'transport' / (name + '.stderr')
        with tarpath.open('wb') as out, err.open('wb') as errors:
            child = subprocess.Popen(['docker', 'cp', container + ':/' + name, '-'], env=ENV, stdin=subprocess.DEVNULL, stdout=out, stderr=errors, start_new_session=True)
            try:
                while child.poll() is None:
                    limits()
                    if tarpath.stat().st_size > cap + 1048576 or err.stat().st_size > 8192: raise RuntimeError('artifact transport cap')
                    time.sleep(.05)
            finally:
                if child.poll() is None: os.killpg(child.pid, signal.SIGKILL); child.wait()
        limits()
        if child.returncode or tarpath.stat().st_size > cap + 1048576 or err.stat().st_size > 8192: raise ValueError('exact artifact copy failed')
        with tarfile.open(tarpath, 'r:') as archive:
            members = archive.getmembers()
            if len(members) != 1: raise ValueError('artifact member count')
            item = members[0]
            if item.name != name or not item.isfile() or item.issym() or item.islnk() or item.sparse or item.size > cap: raise ValueError('artifact member type/path/size')
            total += item.size
            if name.endswith('.deb'): deb_total += item.size
            if total > 268435456 or deb_total > 67108864: raise ValueError('final artifact aggregate cap')
            path = ATTEMPT / 'exports' / name
            with path.open('xb') as out:
                path.chmod(0o600)
                source = archive.extractfile(item); remaining = item.size
                while remaining:
                    data = source.read(min(65536, remaining))
                    if not data: raise ValueError('short artifact')
                    out.write(data); remaining -= len(data)
                out.flush(); os.fsync(out.fileno())
        if expected and digest(path) != expected: raise ValueError('artifact hash differs')
        copied.append({'name': name, 'bytes': item.size, 'sha256': digest(path)})
        return path
    outcome = json.loads(copy('build-outcome.json', 1048576).read_bytes())
    source = json.loads(copy('source-and-test-receipt.json', 1048576).read_bytes())
    installed = json.loads(copy('install-verification.json', 1048576).read_bytes())
    if outcome['failure'] is not None or outcome['receipt'] != source or any(p['exitCode'] for p in outcome['phases']): raise ValueError('native outcome not acceptable')
    if not installed['normalNoRemoveApt'] or not installed['originalDebianDynamicAndStaticClientsPass'] or not installed['allOtherPackagesAndFlagsUnchanged']: raise ValueError('fresh proof failed')
    if source['upstreamMeson']['status'] != 'NOT_RUN_EXTERNAL_FONT_UNAVAILABLE': raise ValueError('missing upstream evidence obscured')
    for item in source['cohort'].values(): copy(item['file'], 67108864, item['sha256'])
    names = sorted({p['name'] + '.log' for p in outcome['phases']} | {'source-signature.log', 'original-debian-autopkgtest.log'})
    for name in names:
        if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}\.log', name): raise ValueError('unexpected native log name')
        copy(name, 33554432)
    limits()
    if sum(p.stat().st_size for p in (ATTEMPT / 'exports').iterdir()) != total: raise ValueError('final aggregate differs')
    receipt.update(status='BOUNDED_NATIVE_ARTIFACTS_EXPORTED_NOT_RUNTIME_ADOPTED', exportBytes=total, debBytes=deb_total, exports=copied,
                   missingUpstreamMeson=source['upstreamMeson'], actualCveFontReproduction=source['actualCveFontReproduction'], artifactContainerNeverStarted=True)
except BaseException as error:
    receipt.update(status='FAILED_NO_ARTIFACT_ACCEPTED', error=type(error).__name__ + ': ' + str(error))
finally:
    if process is not None and process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired: os.killpg(process.pid, signal.SIGKILL); process.wait()
        receipt['buildExit'] = process.returncode
    if container:
        removed = subprocess.run(['docker', 'rm', container], env=ENV, capture_output=True, timeout=10)
        absent = subprocess.run(['docker', 'inspect', container], env=ENV, capture_output=True, timeout=10)
        receipt['artifactCleanup'] = {'containerId': container, 'removeExit': removed.returncode, 'inspectExit': absent.returncode,
                                      'exactAbsent': removed.returncode == 0 and absent.returncode == 1 and b'no such object' in absent.stderr.lower()}
        if not receipt['artifactCleanup']['exactAbsent']: receipt['status'] = 'FAILED_NO_ARTIFACT_ACCEPTED'
    if (ATTEMPT / 'build.log').is_file(): receipt.update(logSha256=digest(ATTEMPT / 'build.log'), logBytes=(ATTEMPT / 'build.log').stat().st_size)
    try: receipt['sourcesAfter'] = snapshot(); receipt['sourcesUnchanged'] = receipt['sourcesBefore'] == receipt['sourcesAfter']
    except BaseException as error: receipt.update(status='FAILED_NO_ARTIFACT_ACCEPTED', sourceDrift=repr(error))
    receipt.update(freeAfter=free(), seconds=round(time.monotonic() - started, 3))
    (ATTEMPT / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt, indent=2), flush=True)

sys.exit(0 if receipt.get('status') == 'BOUNDED_NATIVE_ARTIFACTS_EXPORTED_NOT_RUNTIME_ADOPTED'
         and receipt.get('artifactCleanup', {}).get('exactAbsent') is True
         and receipt.get('sourcesUnchanged') is True else 1)
