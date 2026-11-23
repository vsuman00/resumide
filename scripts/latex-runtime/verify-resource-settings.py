"""Measure the effective limits of a disposable worker with a neutral probe."""

from contextlib import ExitStack
import errno
import json
import os
from pathlib import Path
import resource
import socket
import tempfile


def refused(expected_errno, action):
    try:
        action()
    except OSError as error:
        assert error.errno == expected_errno
        return True
    raise AssertionError('Kernel did not enforce the expected limit')


def open_file_limit():
    soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
    assert (soft, hard) == (64, 64)
    with ExitStack() as opened:
        count = 0
        for _ in range(soft + 1):
            try:
                opened.enter_context(open('/dev/null', 'rb'))
            except OSError as error:
                assert error.errno == errno.EMFILE
                return count
            count += 1
    raise AssertionError('Expected a descriptor limit')


def pid_limit(max_pids):
    assert max_pids == 64
    children = []
    try:
        for _ in range(max_pids):
            try:
                pid = os.fork()
            except OSError as error:
                assert error.errno == errno.EAGAIN
                assert int((CGROUP / 'pids.current').read_text()) == max_pids
                return len(children)
            if pid == 0:
                os._exit(0)
            children.append(pid)
        raise AssertionError('Expected a cgroup process limit')
    finally:
        for child in children:
            os.waitpid(child, 0)


CGROUP = Path('/sys/fs/cgroup')
assert Path('/proc/self/cgroup').read_text().strip() == '0::/'
cpu_quota, cpu_period = map(int, (CGROUP / 'cpu.max').read_text().split())
max_pids = int((CGROUP / 'pids.max').read_text())
memory_max = int((CGROUP / 'memory.max').read_text())
swap_max = int((CGROUP / 'memory.swap.max').read_text())
scratch = os.statvfs('/scratch')
fsize = resource.getrlimit(resource.RLIMIT_FSIZE)
assert fsize == (8388608, 8388608)
with tempfile.TemporaryFile(dir='/scratch') as file:
    os.ftruncate(file.fileno(), fsize[0])
    file_denied = refused(errno.EFBIG, lambda: os.ftruncate(file.fileno(), fsize[0] + 1))
    assert os.fstat(file.fileno()).st_size == fsize[0]

# UDP connect selects a route without sending a packet.
with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as client:
    network_denied = refused(errno.ENETUNREACH, lambda: client.connect(('198.51.100.1', 443)))

status = dict(line.split(':', 1) for line in Path('/proc/self/status').read_text().splitlines())
interfaces = {
    item.name: int((item / 'flags').read_text(), 16)
    for item in Path('/sys/class/net').iterdir()
    if (item / 'flags').is_file()
}
ipv4_routes = Path('/proc/net/route').read_text().splitlines()[1:]
ipv6_routes = Path('/proc/net/ipv6_route').read_text().splitlines()
print(json.dumps({
    'cpuQuotaMicros': cpu_quota,
    'cpuPeriodMicros': cpu_period,
    'cpuTimeLimitSeconds': resource.getrlimit(resource.RLIMIT_CPU),
    'memoryMaxBytes': memory_max,
    'swapMaxBytes': swap_max,
    'pidsMax': max_pids,
    'childProcessesBeforeDenial': pid_limit(max_pids),
    'descriptorLimit': resource.getrlimit(resource.RLIMIT_NOFILE),
    'openDescriptorsBeforeDenial': open_file_limit(),
    'fileSizeLimitBytes': fsize[0],
    'fileSizePlusOneDenied': file_denied,
    'scratchCapacityBytes': scratch.f_blocks * scratch.f_frsize,
    'scratchNoExec': bool(scratch.f_flag & os.ST_NOEXEC),
    'scratchNoDevice': bool(scratch.f_flag & os.ST_NODEV),
    'scratchNoSetUid': bool(scratch.f_flag & os.ST_NOSUID),
    'rootReadOnly': bool(os.statvfs('/').f_flag & os.ST_RDONLY),
    'interfaces': sorted(interfaces),
    'interfacesUp': sorted(name for name, flags in interfaces.items() if flags & 1),
    'nonLoopbackIpv4RouteCount': sum(row.split()[0] != 'lo' for row in ipv4_routes),
    'nonLoopbackIpv6RouteCount': sum(row.split()[-1] != 'lo' for row in ipv6_routes),
    'routeDeniedWithoutSending': network_denied,
    'uid': os.getuid(),
    'gid': os.getgid(),
    'effectiveCapabilities': int(status['CapEff'], 16),
    'noNewPrivileges': int(status['NoNewPrivs']),
    'seccompMode': int(status['Seccomp']),
}))
