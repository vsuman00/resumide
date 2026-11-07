"""Inspect proposed environments with fake subprocesses; never run native code."""
import ast
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import types
import unittest

HERE = Path(__file__).resolve().parent
BINDING = json.loads((HERE / 'source-binding.json').read_text())
ROOT = Path(BINDING['root']) / 'scripts/latex-runtime'
BASELINE = os.environ.get('AA7_TEST_BASELINE') == '1'


def source(name, candidate):
    data = (ROOT / name).read_text()
    change = BINDING['changes'][name]
    assert hashlib.sha256(data.encode()).hexdigest() == change['beforeSha256']
    if candidate:
        if name == 'Dockerfile':
            data = data.replace('RUN python3 /opt/latex/build-closure.py &&', 'RUN test ! -e /opt/latex/home && install -d -o 0 -g 0 -m 0555 /opt/latex/home && python3 /opt/latex/build-closure.py &&')
            data = data.replace('ENV HOME=/scratch LANG=C.UTF-8', 'ENV HOME=/opt/latex/home LANG=C.UTF-8')
        else:
            data = data.replace(change['old'], change['new'])
        assert hashlib.sha256(data.encode()).hexdigest() == change['afterSha256']
    return data


def child_environment(text):
    function = next(n for n in ast.parse(text).body if isinstance(n, ast.FunctionDef) and n.name == 'run')
    observed = {}
    class Stream:
        def close(self):
            pass
    class Process:
        stdout = Stream()
        def wait(self, **kwargs):
            return 0
        def poll(self):
            return 0
    def popen(args, **kwargs):
        observed.update(kwargs)
        return Process()
    class Selector:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def register(self, *args):
            pass
        def get_map(self):
            return {}
    namespace = {'subprocess': types.SimpleNamespace(Popen=popen, PIPE=-1, STDOUT=-2, CompletedProcess=subprocess.CompletedProcess), 'selectors': types.SimpleNamespace(DefaultSelector=Selector, EVENT_READ=1), 'time': types.SimpleNamespace(monotonic=lambda: 0.0)}
    exec(compile(ast.Module(body=[function], type_ignores=[]), '<isolated-trusted-run-function>', 'exec'), namespace)
    assert namespace['run'](['/usr/bin/pdftotext', '-bbox', '/scratch/main.pdf', '/scratch/text.xml']).returncode == 0
    return observed


def c_environment(text):
    block = text.split('char *env[]={', 1)[1].split('NULL};', 1)[0]
    return dict(item.split('=', 1) for item in re.findall(r'"([^"\n]+)"', block))


class Environments(unittest.TestCase):
    def test_supervisor_actual_child_environment(self):
        observed = child_environment(source('supervisor.py', not BASELINE))
        self.assertEqual(observed['env']['HOME'], '/opt/latex/home')
        self.assertTrue(observed['close_fds'])
        self.assertEqual(set(observed['env']), {'HOME', 'LANG', 'FONTCONFIG_FILE', 'FONTCONFIG_PATH'})

    def test_native_launcher_environment(self):
        before = c_environment(source('landlock.c', False))
        after = c_environment(source('landlock.c', not BASELINE))
        self.assertEqual(after['HOME'], '/opt/latex/home')
        self.assertEqual({k: v for k, v in before.items() if k != 'HOME'}, {k: v for k, v in after.items() if k != 'HOME'})
        self.assertEqual(after['TEXMFOUTPUT'], '/scratch')
        self.assertFalse(any(k.startswith('XDG_') for k in after))

    def test_supervisor_preserves_non_home_behavior(self):
        before = child_environment(source('supervisor.py', False))
        after = child_environment(source('supervisor.py', True))
        self.assertEqual({k: v for k, v in before['env'].items() if k != 'HOME'}, {k: v for k, v in after['env'].items() if k != 'HOME'})
        self.assertEqual(after['env']['FONTCONFIG_FILE'], '/opt/latex/fontconfig/fonts.conf')

    def test_image_directory_and_working_directory_contract(self):
        after = source('Dockerfile', True)
        self.assertEqual(after.count('install -d -o 0 -g 0 -m 0555 /opt/latex/home'), 1)
        self.assertIn('ENV HOME=/opt/latex/home LANG=C.UTF-8', after)
        self.assertIn('WORKDIR /scratch', after)
        self.assertIn('RUN test ! -e /opt/latex/home && install -d', after)
        self.assertLess(after.index('install -d -o 0 -g 0 -m 0555 /opt/latex/home'), after.index('USER 65532:65532'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
