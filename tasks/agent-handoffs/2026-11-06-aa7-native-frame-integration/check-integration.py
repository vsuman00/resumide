"""Neutral integration of trusted supervisor main with fake files/processes/PDF guard."""
import ast
import base64
from contextlib import redirect_stdout
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import types
import unittest

HERE = Path(__file__).resolve().parent
HELPER = types.ModuleType('reviewed_geometry_helper')
exec(compile((HERE / 'native_geometry.py').read_bytes(), '<reviewed-own-geometry-helper>', 'exec'), HELPER.__dict__)
CANDIDATE = ast.parse((HERE / 'supervisor.candidate.py').read_text())
OUTPUT = next(n for n in CANDIDATE.body if isinstance(n, ast.FunctionDef) and n.name == 'output')
MAIN = next(n for n in CANDIDATE.body if isinstance(n, ast.Try))
PDF = b'%PDF-neutral-fixture'
FRAME = b'RESUMIDE_BBOX\t1\nP\t595.276000\t841.890000\nW\t10.000000\t20.000000\t90.000000\t30.000000\t6e65757472616c\nE\nZ\t1\n'
RESULTS = []


def exercise(label, *, frame=FRAME, pages=1, frame_size=None, missing=False, decoder_code=0, decoder_timeout=False, inspector_error=False):
    trace = {'commands': [], 'events': [], 'parseExpectedPages': [], 'frameReads': 0, 'writtenPaths': []}
    class FakePath:
        def __init__(self, path):
            self.path = path
        def read_text(self):
            assert self.path == '/opt/latex/closure.json'
            return '{"files":{}}'
        def write_bytes(self, data):
            assert self.path == '/scratch/main.tex'
            trace['writtenPaths'].append(self.path)
        def exists(self):
            return self.path == '/scratch/main.log'
        def is_file(self):
            return self.path == '/scratch/main.pdf'
        def stat(self):
            if self.path == '/scratch/text.frame' and missing:
                raise FileNotFoundError('neutral missing frame')
            size = {'/scratch/main.log': 0, '/scratch/main.pdf': len(PDF), '/scratch/text.frame': len(frame) if frame_size is None else frame_size}[self.path]
            return types.SimpleNamespace(st_size=size)
        def read_bytes(self):
            if self.path == '/scratch/main.log':
                return b''
            if self.path == '/scratch/main.pdf':
                return PDF
            assert self.path == '/scratch/text.frame', self.path
            trace['frameReads'] += 1
            return frame
    def run(args):
        trace['commands'].append(args)
        if args[0] == '/usr/bin/pdftotext':
            trace['events'].append('extract')
            assert args == ['/usr/bin/pdftotext', '-resumide-bbox', '/scratch/main.pdf', '/scratch/text.frame']
            if decoder_timeout:
                raise subprocess.TimeoutExpired(args, 14)
            return subprocess.CompletedProcess(args, decoder_code, stdout=b'')
        assert args[0] == '/opt/latex/confine'
        return subprocess.CompletedProcess(args, 0, stdout=b'')
    def inspect(data):
        assert data == PDF
        trace['events'].append('inspect')
        if inspector_error:
            raise ValueError('neutral PDF policy failure')
        return pages
    def parse(data, expected_pages):
        trace['parseExpectedPages'].append(expected_pages)
        return HELPER.parse_geometry(data, expected_pages)
    namespace = {'json': json, 'base64': base64, 'hashlib': hashlib, 'sys': types.SimpleNamespace(stdin=types.SimpleNamespace(buffer=io.BytesIO(b'{"source":"neutral"}')), exit=sys.exit), 'pathlib': types.SimpleNamespace(Path=FakePath), 'subprocess': subprocess, 'inspect_pdf': inspect, 'run': run, 'GeometryError': HELPER.GeometryError, 'parse_geometry': parse}
    captured = io.StringIO()
    with redirect_stdout(captured):
        try:
            exec(compile(ast.Module(body=[OUTPUT, MAIN], type_ignores=[]), '<trusted-main-with-neutral-adapters>', 'exec'), namespace)
        except SystemExit as error:
            assert error.code == 0
    output = json.loads(captured.getvalue())
    RESULTS.append({'label': label, 'output': output, 'trace': trace})
    return output, trace


class Integration(unittest.TestCase):
    def test_success_preserves_json_and_inspection_order(self):
        output, trace = exercise('success')
        self.assertEqual(output, {'pdf': base64.b64encode(PDF).decode('ascii'), 'pages': 1, 'text': 'neutral', 'diagnostics': []})
        self.assertEqual(trace['events'], ['inspect', 'extract'])
        self.assertEqual(trace['parseExpectedPages'], [1])

    def test_independent_pdf_page_count(self):
        output, trace = exercise('independent-page-count', pages=2)
        self.assertEqual(output, {'error': 'output_invalid'})
        self.assertEqual(trace['parseExpectedPages'], [2])

    def test_geometry_error_mapping(self):
        output, _ = exercise('layout-category', frame=FRAME.replace(b'10.000000', b'-2.000000', 1))
        self.assertEqual(output, {'error': 'layout_overflow'})

    def test_no_xml_fallback(self):
        output, _ = exercise('xml-not-frame', frame=b'<html><page><word>neutral</word></page></html>')
        self.assertEqual(output, {'error': 'output_invalid'})

    def test_frame_stat_bound_before_read(self):
        output, trace = exercise('oversize-before-read', frame_size=2097153)
        self.assertEqual(output, {'error': 'output_invalid'})
        self.assertEqual(trace['frameReads'], 0)
        self.assertEqual(trace['parseExpectedPages'], [])

    def test_helper_rechecks_growth_after_stat(self):
        output, trace = exercise('growth-after-stat', frame=b'x' * 2097153, frame_size=1)
        self.assertEqual(output, {'error': 'output_invalid'})
        self.assertEqual(trace['frameReads'], 1)

    def test_missing_frame(self):
        output, _ = exercise('missing-frame', missing=True)
        self.assertEqual(output, {'error': 'output_invalid'})

    def test_decoder_nonzero_does_not_parse(self):
        output, trace = exercise('decoder-failure', decoder_code=1)
        self.assertEqual(output, {'error': 'output_invalid'})
        self.assertEqual(trace['parseExpectedPages'], [])
        self.assertEqual(trace['frameReads'], 0)

    def test_timeout_category(self):
        output, _ = exercise('decoder-timeout', decoder_timeout=True)
        self.assertEqual(output, {'error': 'timeout'})

    def test_pdf_guard_failure_blocks_extraction(self):
        output, trace = exercise('pdf-policy-failure', inspector_error=True)
        self.assertEqual(output, {'error': 'output_invalid'})
        self.assertEqual(trace['events'], ['inspect'])
        self.assertEqual(trace['parseExpectedPages'], [])


if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(Integration)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    (HERE / 'integration-checks.json').write_text(json.dumps({'passed': result.wasSuccessful(), 'tests': result.testsRun, 'cases': RESULTS, 'tier': 'neutral trusted supervisor main with fake files/processes/PDF inspector', 'nativeProducerExecuted': False, 'pypdfExecuted': False, 'realLimitsChanged': False}, indent=2) + '\n')
    sys.exit(0 if result.wasSuccessful() else 1)
