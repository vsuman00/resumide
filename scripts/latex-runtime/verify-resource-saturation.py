"""Measure scratch exhaustion and child CPU and OOM denial in one disposable worker."""

from contextlib import ExitStack
import errno
import json
import os
from pathlib import Path
import resource
import signal
import subprocess
import sys
import tempfile


MIB = 1024 * 1024
CGROUP = Path('/sys/fs/cgroup')
SCRATCH = '/scratch'
MEMORY_CHILD = '''
from pathlib import Path
import sys

Path('/proc/self/oom_score_adj').write_text('1000')
allocation = bytearray(int(sys.argv[1]))
'''
CPU_CHILD = '''
import time

while time.process_time() < 11:
    pass
'''


def memory_events():
    return {
        name: int(value)
        for name, value in map(str.split, (CGROUP / 'memory.events.local').read_text().splitlines())
    }


def memory_limit():
    limit = int((CGROUP / 'memory.max').read_text())
    assert limit == 512 * MIB and (CGROUP / 'memory.swap.max').read_text().strip() == '0'
    before = memory_events()
    child = subprocess.run(
        [sys.executable, '-c', MEMORY_CHILD, str(limit + 8 * MIB)],
        check=False, timeout=8,
    )
    after = memory_events()
    assert child.returncode == -signal.SIGKILL
    assert after['max'] > before['max']
    assert after['oom'] > before['oom'] and after['oom_kill'] - before['oom_kill'] == 1
    return {'memoryChildSignal': -child.returncode, 'localOomKills': after['oom_kill'] - before['oom_kill']}


def cpu_limit():
    assert resource.getrlimit(resource.RLIMIT_CPU) == (10, 10)
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    child = subprocess.run(
        [sys.executable, '-c', CPU_CHILD],
        check=False, timeout=15,
    )
    after = resource.getrusage(resource.RUSAGE_CHILDREN)
    cpu = (after.ru_utime - before.ru_utime) + (after.ru_stime - before.ru_stime)
    assert child.returncode == -signal.SIGKILL and 9.5 <= cpu < 11
    return {'cpuChildSignal': -child.returncode, 'cpuChildSeconds': round(cpu, 3)}


def scratch_limit():
    scratch = os.statvfs(SCRATCH)
    total = scratch.f_bavail * scratch.f_frsize
    assert total == 128 * MIB
    file_size, _ = resource.getrlimit(resource.RLIMIT_FSIZE)
    assert file_size == 8 * MIB and total % file_size == 0
    with ExitStack() as files:
        for _ in range(total // file_size):
            file = files.enter_context(tempfile.TemporaryFile(dir=SCRATCH))
            os.posix_fallocate(file.fileno(), 0, file_size)
        assert os.statvfs(SCRATCH).f_bavail == 0
        extra = files.enter_context(tempfile.TemporaryFile(dir=SCRATCH))
        try:
            os.posix_fallocate(extra.fileno(), 0, scratch.f_frsize)
        except OSError as failure:
            assert failure.errno == errno.ENOSPC
        else:
            raise AssertionError('Expected scratch allocation to be refused')
    assert os.statvfs(SCRATCH).f_bavail == scratch.f_bavail
    return {'scratchAllocatedBytes': total, 'extraScratchBlockDenied': True, 'scratchRecovered': True}


if __name__ == '__main__':
    print(json.dumps({**memory_limit(), **cpu_limit(), **scratch_limit()}))
