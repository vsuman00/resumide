"""Neutral PDF admission regression; no native image/font decoder is executed."""
from contextlib import ExitStack
import json
import struct
import sys
import zlib
from unittest.mock import patch

sys.path.insert(0, '/opt/latex')

from pypdf import apply_configuration, PageObject
from pypdf._configuration import get_configuration
from pypdf.generic import ContentStream, EncodedStreamObject, StreamObject
from pypdf import filters


def stream(data, entries=b''):
    return b'<< /Length ' + str(len(data)).encode() + b' ' + entries + b' >>\nstream\n' + data + b'\nendstream'


def base():
    # Font bytes are neutral structural data. No renderer/font-format parser runs.
    return {
        1: b'<< /Type /Catalog /Pages 2 0 R >>',
        2: b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        3: b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
        4: stream(b'BT /F1 12 Tf 10 700 Td (ordinary neutral text) Tj ET'),
        5: b'<< /Type /Font /Subtype /Type1 /BaseFont /Courier /FontDescriptor 6 0 R >>',
        6: b'<< /Type /FontDescriptor /FontName /Courier /FontFile 7 0 R >>',
        7: stream(b'neutral embedded-font structural bytes'),
    }


def pdf(objects, *, xref_filter=None, xref_stream=False, compressed_catalog=False, object_filter=b'/JPXDecode'):
    objects = dict(objects)
    if compressed_catalog:
        catalog = objects.pop(1)
        properties = b'/Type /ObjStm /N 1 /First 4'
        if object_filter is not None:
            properties += b' /Filter ' + object_filter
        objects[8] = stream(b'1 0 ' + catalog, properties)
    data = bytearray(b'%PDF-1.7\n')
    offsets = {}
    for number, value in sorted(objects.items()):
        offsets[number] = len(data)
        data.extend(f'{number} 0 obj\n'.encode() + value + b'\nendobj\n')
    start = len(data)
    if xref_stream or xref_filter is not None or compressed_catalog:
        number = max(objects) + 1
        offsets[number] = start
        entries = []
        for index in range(number + 1):
            if index == 0:
                entries.append(struct.pack('>BIH', 0, 0, 65535))
            elif compressed_catalog and index == 1:
                entries.append(struct.pack('>BIH', 2, 8, 0))
            else:
                entries.append(struct.pack('>BIH', 1, offsets[index], 0))
        properties = f'/Type /XRef /Size {number + 1} /Root 1 0 R /W [1 4 2]'.encode()
        if xref_filter is not None:
            properties += b' /Filter ' + xref_filter
        data.extend(f'{number} 0 obj\n'.encode() + stream(b''.join(entries), properties) + b'\nendobj\n')
        data.extend(f'startxref\n{start}\n%%EOF\n'.encode())
    else:
        size = max(objects) + 1
        data.extend(f'xref\n0 {size}\n0000000000 65535 f \n'.encode())
        for number in range(1, size):
            if number in offsets:
                data.extend(f'{offsets[number]:010} 00000 n \n'.encode())
            else:
                data.extend(b'0000000000 00000 f \n')
        data.extend(f'trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n'.encode())
    return bytes(data)


def fixtures():
    result = [('ordinary-text-and-embedded-font', pdf(base()), False),
              ('valid-XRef-stream-control', pdf(base(), xref_stream=True), False),
              ('valid-ObjStm-control', pdf(base(), compressed_catalog=True, object_filter=None), False)]
    obj = base()
    obj[4] = stream(zlib.compress(b'BT /F1 12 Tf (ordinary compressed text) Tj ET'), b'/Filter /FlateDecode')
    obj[7] = stream(zlib.compress(b'ordinary compressed neutral font bytes'), b'/Filter /FlateDecode')
    result.append(('ordinary-Flate-text-and-font', pdf(obj), False))
    result.append(('malformed-reader-restores-context', b'%PDF-1.7\ntruncated neutral metadata\n', True))
    obj = base()
    obj[4] = stream(b'BT /F1 12 Tf (BI /F /JPXDecode ID neutral EI) Tj ET\n% BI /F /DCTDecode\n')
    result.append(('literal-and-comment-BI-are-not-images', pdf(obj), False))
    obj = base()
    obj[3] = obj[3].replace(b'/Contents 4 0 R', b'/Contents [4 0 R 8 0 R]')
    obj[4] = stream(b'BT /F1 12 Tf (literal BI ')
    obj[8] = stream(b'ID words) Tj ET')
    result.append(('ordinary-content-array-with-literal-BI', pdf(obj), False))
    obj = base()
    obj[5] = b'<< /Type /Font /Subtype /Type0 /BaseFont /Neutral /Encoding /Identity-H /DescendantFonts [8 0 R] >>'
    obj[8] = b'<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Neutral /FontDescriptor 6 0 R >>'
    result.append(('ordinary-Type0-CID-embedded-font', pdf(obj), False))
    for label, definition in [
        ('image-xobject', b'/Type /XObject /Subtype /Image'),
        ('escaped-image-name', b'/Type /XObject /Subtype /Im#61ge'),
        ('direct-JPX-filter', b'/Filter /JPXDecode'),
        ('escaped-JPX-filter', b'/Filter /JPX#44ecode'),
        ('array-JPX-filter', b'/Filter [/ASCIIHexDecode /JPXDecode]'),
        ('DCT-alias', b'/Filter /DCT'),
        ('CCITT-alias', b'/Filter /CCF'),
        ('JBIG2-filter', b'/Filter /JBIG2Decode'),
        ('null-filter', b'/Filter null'),
        ('string-filter', b'/Filter (JPXDecode)'),
        ('nested-filter-array', b'/Filter [[/FlateDecode] /JPXDecode]'),
    ]:
        obj = base()
        obj[8] = stream(b'neutral non-image data', definition)
        result.append((label, pdf(obj), True))
    for label, definition, names in [
        ('indirect-image-subtype', b'/Subtype 9 0 R', {9: b'/Image'}),
        ('indirect-JPX-filter', b'/Filter 9 0 R', {9: b'/JPXDecode'}),
        ('indirect-filter-array-name', b'/Filter [9 0 R]', {9: b'/JPXDecode'}),
        ('chained-filter-name', b'/Filter 9 0 R', {9: b'10 0 R', 10: b'/JPXDecode'}),
        ('cyclic-filter-name', b'/Filter 9 0 R', {9: b'10 0 R', 10: b'9 0 R'}),
    ]:
        obj = base()
        obj[8] = stream(b'neutral non-image data', definition)
        obj.update(names)
        result.append((label, pdf(obj), True))
    inline = b'BI /W 1 /H 1 /BPC 8 /F /JPXDecode ID neutral non-image data EI'
    for label, definition in [
        ('inline-page', None),
        ('inline-Form', b'/Type /XObject /Subtype /Form /BBox [0 0 10 10]'),
        ('inline-tiling-pattern', b'/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 10 10] /XStep 10 /YStep 10'),
    ]:
        obj = base()
        obj[4 if definition is None else 8] = stream(inline, definition or b'')
        result.append((label, pdf(obj), True))
    obj = base()
    obj[3] = obj[3].replace(b'/Contents 4 0 R', b'/Contents [4 0 R 8 0 R]')
    obj[4] = stream(b'B')
    obj[8] = stream(inline[1:])
    result.append(('inline-BI-split-between-page-streams', pdf(obj), True))
    for label, members in [('nonstream-content-array', b'[4 0 R 7]'), ('null-content-array-member', b'[4 0 R null]')]:
        obj = base()
        obj[3] = obj[3].replace(b'/Contents 4 0 R', b'/Contents ' + members)
        result.append((label, pdf(obj), True))
    obj = base()
    obj[8] = b'<< /Type /Annot /Subtype /Link /Rect [0 0 10 10] /AP << /N 9 0 R >> >>'
    obj[9] = stream(inline)
    result.append(('unsupported-annotation-appearance', pdf(obj), True))
    for label, marker in [('font-resource-missing-Type', b''), ('font-resource-mismatched-Type', b'/Type /Metadata')]:
        obj = base()
        obj[5] = b'<< ' + marker + b' /Subtype /Type3 /FontDescriptor 6 0 R /CharProcs << /g 8 0 R >> >>'
        obj[8] = stream(inline)
        result.append((label, pdf(obj), True))
    for label, value, names in [
        ('indirect-Type3-font', b'<< /Type 8 0 R /Subtype 9 0 R /FontDescriptor 6 0 R >>', {8: b'/Font', 9: b'/Type3'}),
        ('indirect-nonlink-annotation', b'<< /Type 9 0 R /Subtype 10 0 R >>', {9: b'/Annot', 10: b'/Widget'}),
        ('indirect-Filespec', b'<< /Type 9 0 R >>', {9: b'/Filespec'}),
    ]:
        obj = base()
        obj[5 if 'Type3' in label else 8] = value
        obj.update(names)
        result.append((label, pdf(obj), True))
    for label, font in [('fontfile-null', b'null'), ('fontfile-not-stream', b'<< >>'), ('fontfile-empty', stream(b'')), ('fontfile-decoded-empty', stream(zlib.compress(b''), b'/Filter /FlateDecode'))]:
        obj = base()
        obj[7] = font
        result.append((label, pdf(obj), True))
    obj = base()
    obj[6] = b'<< /Type /FontDescriptor /FontFile 7 0 R /FontFile2 null >>'
    result.append(('invalid-font-alternative-cannot-hide', pdf(obj), True))
    for label, fields in [
        ('Type0-missing-descendant', b''),
        ('Type0-empty-descendants', b'/DescendantFonts []'),
        ('Type0-invalid-descendant', b'/DescendantFonts [null]'),
        ('Type0-multiple-descendants', b'/DescendantFonts [8 0 R 8 0 R]'),
        ('Type0-unembedded-CID', b'/DescendantFonts [8 0 R]'),
    ]:
        obj = base()
        obj[5] = b'<< /Type /Font /Subtype /Type0 ' + fields + b' >>'
        obj[8] = b'<< /Type /Font /Subtype /CIDFontType2 >>'
        result.append((label, pdf(obj), True))
    obj = base()
    obj[7] = stream(zlib.compress(b'f' * 5242881), b'/Filter /FlateDecode')
    result.append(('decoded-font-byte-bound', pdf(obj), True))
    result.append(('early-XRef-raster-filter', pdf(base(), xref_filter=b'/JPXDecode'), True))
    result.append(('early-ObjStm-raster-filter', pdf(base(), compressed_catalog=True), True))
    return result


def run_probe(inspect):
    observations = []
    attempts = {'decoder': 0, 'inlineScanner': 0, 'strictInline': 0, 'imageExtraction': 0}
    guard_types = {}
    namespace = inspect.__globals__
    image_guard = namespace.get('_reject_image_data')
    inline_class = namespace.get('_ImageFreeContentStream')
    def decoder(*_args, **_kwargs):
        attempts['decoder'] += 1
        raise AssertionError('image decoder must not execute')
    def scanner(*_args, **_kwargs):
        attempts['inlineScanner'] += 1
        raise AssertionError('inline image scanner must not execute')
    def extraction(*_args, **_kwargs):
        attempts['imageExtraction'] += 1
        raise AssertionError('image extraction must not execute')
    def traced_guard(obj):
        kind = str(obj.get('/Type'))
        if kind in ('/XRef', '/ObjStm'):
            guard_types[kind] = guard_types.get(kind, 0) + 1
        return image_guard(obj)
    with ExitStack() as stack:
        for implementation in [filters.JPXDecode, filters.DCTDecode, filters.CCITTFaxDecode, filters.JBIG2Decode]:
            stack.enter_context(patch.object(implementation, 'decode', decoder))
        stack.enter_context(patch.object(ContentStream, '_read_inline_image', scanner))
        stack.enter_context(patch.object(StreamObject, 'decode_as_image', extraction))
        stack.enter_context(patch.object(PageObject, '_get_image', extraction))
        stack.enter_context(patch.object(PageObject, '_parse_images_from_content_stream', extraction))
        if image_guard is not None:
            stack.enter_context(patch.dict(namespace, {'_reject_image_data': traced_guard}))
        if inline_class is not None:
            original_inline = inline_class.__dict__['_read_inline_image']
            def traced_inline(*args, **kwargs):
                attempts['strictInline'] += 1
                return original_inline(*args, **kwargs)
            stack.enter_context(patch.object(inline_class, '_read_inline_image', traced_inline))
        for label, data, must_reject in fixtures():
            before = dict(attempts)
            types_before = dict(guard_types)
            original = EncodedStreamObject.get_data
            with apply_configuration(jbig2dec_binary='neutral-not-executed', disable_legacy_handling=False):
                configuration = get_configuration()
                rejected = False
                error_class = None
                cause_class = None
                pages = None
                try:
                    pages = inspect(data)
                except Exception as error:
                    rejected = True
                    error_class = type(error).__name__
                    cause_class = type(error.__cause__).__name__ if error.__cause__ is not None else None
                restored = get_configuration() is configuration
            decoders = attempts['decoder'] - before['decoder']
            scanners = attempts['inlineScanner'] - before['inlineScanner']
            strict_inline = attempts['strictInline'] - before['strictInline']
            extractions = attempts['imageExtraction'] - before['imageExtraction']
            types_observed = {key: value - types_before.get(key, 0) for key, value in guard_types.items() if value > types_before.get(key, 0)}
            branch = True
            if label == 'malformed-reader-restores-context':
                branch = error_class == 'PdfReadError'
            if label.startswith('inline-'):
                branch = strict_inline > 0
            if label == 'early-XRef-raster-filter':
                branch = types_observed.get('/XRef', 0) > 0
            if label == 'early-ObjStm-raster-filter':
                branch = types_observed.get('/ObjStm', 0) > 0
            hook_restored = EncodedStreamObject.get_data is original
            typed_error = True
            if must_reject:
                if label == 'malformed-reader-restores-context':
                    typed_error = error_class == 'PdfReadError'
                elif label == 'early-XRef-raster-filter':
                    typed_error = error_class == 'PdfReadError' and cause_class == 'UnsafePDF'
                else:
                    typed_error = error_class == 'UnsafePDF'
            good = rejected == must_reject and (rejected or pages == 1) and decoders == scanners == extractions == 0 and restored and hook_restored and branch and typed_error
            observations.append({'name': label, 'mustReject': must_reject, 'rejected': rejected, 'pages': pages, 'errorClass': error_class, 'causeClass': cause_class, 'expectedErrorBoundary': typed_error, 'imageDecoderAttempts': decoders, 'inlineScannerAttempts': scanners, 'imageExtractionAttempts': extractions, 'strictInlineEntries': strict_inline, 'earlyGuardStreamTypes': types_observed, 'requiredBranchObserved': branch, 'configurationRestored': restored, 'getDataHookRestored': hook_restored, 'pass': good})
    return {'cases': len(observations), 'passed': all(item['pass'] for item in observations), 'imageDecoderAttempts': attempts['decoder'], 'inlineScannerAttempts': attempts['inlineScanner'], 'imageExtractionAttempts': attempts['imageExtraction'], 'configurationRestored': all(item['configurationRestored'] for item in observations), 'getDataHookRestored': all(item['getDataHookRestored'] for item in observations), 'checks': observations, 'nativeImageOrFontDecoderExecuted': False}


if __name__ == '__main__':
    from inspect_pdf import inspect_pdf
    result = run_probe(inspect_pdf)
    print(json.dumps(result, separators=(',', ':')))
    raise SystemExit(0 if result['passed'] else 1)
