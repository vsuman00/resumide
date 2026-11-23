"""MOCK policy-boundary checks only; no PDF byte generation or parser/decoder call."""
import argparse
from contextlib import ExitStack
import importlib.util
import json
import pathlib
import sys
from types import SimpleNamespace
from unittest.mock import patch


def run(inspector_path, source_path=None):
    sys.path.insert(0, str(source_path if source_path is not None else pathlib.Path('/opt/latex')))
    from pypdf import PageObject, apply_configuration
    from pypdf._configuration import get_configuration
    from pypdf import filters
    from pypdf.generic import DictionaryObject as D, NameObject as N, DecodedStreamObject
    spec = importlib.util.spec_from_file_location('mock_policy_inspector', inspector_path)
    inspector = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(inspector)
    attempts = {'originalEncodedData': 0, 'imageDecoder': 0}

    def forbidden_original(_stream):
        attempts['originalEncodedData'] += 1
        raise AssertionError('original encoded-data decoder must not run')

    def forbidden_decoder(*_args, **_kwargs):
        attempts['imageDecoder'] += 1
        raise AssertionError('image decoder must not run')

    class NeutralInput:
        def __len__(self):
            return 0

        def startswith(self, _prefix):
            return True

    def group(with_subtype):
        value = DecodedStreamObject()
        if with_subtype:
            value[N('/Subtype')] = N('/Form')
        return value

    cases = [
        ('parser-success-after-policy-error', D(), True, True),
        ('SMask-None-supported', D({N('/SMask'): N('/None')}), False, False),
        ('SMask-G-missing-Subtype', D({N('/SMask'): D({N('/S'): N('/Alpha'), N('/G'): group(False)})}), False, True),
        ('SMask-G-valid-Form', D({N('/SMask'): D({N('/S'): N('/Alpha'), N('/G'): group(True)})}), False, False),
    ]
    results = []
    with ExitStack() as stack:
        stack.enter_context(patch.object(inspector.EncodedStreamObject, 'get_data', forbidden_original))
        stack.enter_context(patch.object(inspector, 'io', SimpleNamespace(BytesIO=lambda value: value)))
        for codec in [filters.JPXDecode, filters.DCTDecode, filters.JBIG2Decode, filters.CCITTFaxDecode]:
            stack.enter_context(patch.object(codec, 'decode', forbidden_decoder))
        for name, trailer, swallow, must_reject in cases:
            caught = []
            fake_reader = SimpleNamespace(is_encrypted=False, pages=[PageObject.create_blank_page(width=612, height=792)], trailer=trailer, xref={}, xref_objStm={})

            def reader(_stream, strict):
                assert strict is True
                if swallow:
                    encoded = inspector.EncodedStreamObject()
                    encoded[N('/Filter')] = N('/JPXDecode')
                    try:
                        encoded.get_data()
                    except inspector.UnsafePDF:
                        caught.append(True)
                return fake_reader

            original = inspector.EncodedStreamObject.get_data
            rejected = False
            error_class = None
            pages = None
            with patch.object(inspector, 'PdfReader', reader):
                with apply_configuration(jbig2dec_binary='neutral-not-executed', disable_legacy_handling=False):
                    configuration = get_configuration()
                    try:
                        pages = inspector.inspect_pdf(NeutralInput())
                    except Exception as error:
                        rejected = True
                        error_class = type(error).__name__
                    configuration_restored = get_configuration() is configuration
            hook_restored = inspector.EncodedStreamObject.get_data is original
            passed = (rejected == must_reject and (error_class == 'UnsafePDF' if must_reject else pages == 1)
                      and configuration_restored and hook_restored and (not swallow or bool(caught)))
            results.append({'name': name, 'mustReject': must_reject, 'rejected': rejected, 'errorClass': error_class,
                            'pages': pages, 'mockParserCaughtPolicyThenReturnedSuccess': bool(caught),
                            'configurationRestored': configuration_restored, 'getDataHookRestored': hook_restored, 'pass': passed})
    return {'tier': 'MOCK policy-boundary checks; ordinary pypdf dictionaries only', 'cases': len(results),
            'passed': all(row['pass'] for row in results) and not any(attempts.values()), 'checks': results,
            'attempts': attempts, 'pdfBytesGenerated': False, 'realPdfReaderCalled': False, 'nativeDecoderExecuted': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--inspector', type=pathlib.Path, default=pathlib.Path('/opt/latex/inspect_pdf.py'))
    parser.add_argument('--pypdf-source', type=pathlib.Path)
    args = parser.parse_args()
    result = run(args.inspector, args.pypdf_source)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result['passed'] else 1)
