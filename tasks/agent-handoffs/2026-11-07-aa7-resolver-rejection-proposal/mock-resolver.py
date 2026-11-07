"""One MOCK indirect-resolution boundary; no PDF bytes or real reader."""
import ast
import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent
SOURCE = pathlib.Path('/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-aa7-pypdf-complete-source-fkq1dd4d')
sys.path.insert(0, str(SOURCE))
from pypdf.generic import IndirectObject


class UnsafePDF(Exception):
    pass


def load_resolver(path):
    tree = ast.parse(path.read_text())
    function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == '_resolved')
    module = ast.Module(body=[function], type_ignores=[])
    namespace = {'IndirectObject': IndirectObject, 'UnsafePDF': UnsafePDF}
    exec(compile(module, str(path), 'exec'), namespace)
    return namespace['_resolved']


def check(path, expected):
    cause = AttributeError('neutral mocked cache property rejection')
    calls = []

    class MockPdf:
        def get_object(self, reference):
            calls.append(reference)
            raise cause

    reference = IndirectObject(1, 0, MockPdf())
    error = None
    try:
        load_resolver(path)(reference)
    except Exception as caught:
        error = caught
    assert len(calls) == 1 and calls[0] is reference
    if expected == 'AttributeError':
        assert error is cause
    else:
        assert isinstance(error, UnsafePDF) and error.__cause__ is cause
    return {'source': path.name, 'sourceSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'realIndirectObject': True, 'fakePdfGetObjectCalls': len(calls),
            'observedErrorClass': type(error).__name__,
            'causeClass': type(error.__cause__).__name__ if error.__cause__ else None,
            'originalCauseIdentityPreserved': error is cause or error.__cause__ is cause,
            'expectedObserved': True}


result = {'tier': 'One ordinary MOCK reference-resolution unit, RED/GREEN',
          'baseline': check(ROOT / 'inspect_pdf.baseline.py', 'AttributeError'),
          'candidate': check(ROOT / 'inspect_pdf.candidate.py', 'UnsafePDF'),
          'pdfBytesGenerated': False, 'realReaderCalled': False, 'decoderCalled': False,
          'saved49HelperExecuted': False, 'mock4Rerun': False}
print(json.dumps(result, indent=2))
