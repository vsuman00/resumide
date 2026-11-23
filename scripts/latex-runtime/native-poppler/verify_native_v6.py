"""Native package/codec and exact-source PDF parity checks; never a release gate."""
import hashlib
import os
import pathlib
import re
import subprocess
import xml.etree.ElementTree as ET
from native_geometry import GeometryError, parse_geometry
from expat_source import digest


def reference(data):
    root = ET.fromstring(data)
    pages = []
    words = []
    code = None
    for page in root.iter('{http://www.w3.org/1999/xhtml}page'):
        page_words = []
        width, height = float(page.attrib['width']), float(page.attrib['height'])
        for word in page.iter('{http://www.w3.org/1999/xhtml}word'):
            edges = tuple(word.attrib[name] for name in ('xMin', 'yMin', 'xMax', 'yMax'))
            text = word.text or ''
            page_words.append((edges, text))
            if code is None and (float(edges[0]) < -1 or float(edges[1]) < -1 or float(edges[2]) > width + 1 or float(edges[3]) > height + 1):
                code = 'layout_overflow'
            words.append(text)
        pages.append((page.attrib['width'], page.attrib['height'], page_words))
    text = ' '.join(words)
    if code is None and (not text.strip() or len(text) > 100000):
        code = 'output_invalid'
    return pages, text, code


def frame_values(data):
    # Test-only observation after the production prototype validated the full frame.
    pages = []
    current = None
    for record in data.decode('ascii').splitlines()[1:-1]:
        fields = record.split('\t')
        if fields[0] == 'P':
            current = (fields[1], fields[2], [])
        elif fields[0] == 'W':
            text = bytes.fromhex(fields[5]).decode('utf-8').replace('\r\n', '\n').replace('\r', '\n')
            current[2].append((tuple(fields[1:5]), text))
        else:
            pages.append(current)
            current = None
    return pages


def neutral_jpx(path):
    stream = b'BT /F1 10 Tf 10 50 Td (Neutral) Tj ET\nBI /W 1 /H 1 /BPC 8 /CS /RGB /F /JPXDecode ID\nnot-a-jpx\nEI\n'
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
               b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
               b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
               b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'endstream']
    body = bytearray(b'%PDF-1.4\n')
    offsets = [0]
    for number, value in enumerate(objects, 1):
        offsets.append(len(body)); body.extend(str(number).encode() + b' 0 obj\n' + value + b'\nendobj\n')
    position = len(body)
    body.extend(b'xref\n0 6\n0000000000 65535 f \n')
    for offset in offsets[1:]:
        body.extend(('%010d 00000 n \n' % offset).encode())
    body.extend(b'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + str(position).encode() + b'\n%%EOF\n')
    path.write_bytes(body)


def verify(source, pins, candidate, client, run, environment):
    multiarch = subprocess.check_output(['dpkg-architecture', '-qDEB_HOST_MULTIARCH'], text=True).strip()
    libs = candidate / 'usr/lib' / multiarch
    library = libs / 'libpoppler.so.147'
    baseline = pathlib.Path('/usr/lib') / multiarch / 'libpoppler.so.147'
    symbols = lambda path: {line.split()[-1] for line in subprocess.check_output(['nm', '-D', '--defined-only', str(path)], text=True).splitlines() if line.split()}
    old, new = symbols(baseline), symbols(library)
    dynamic = subprocess.check_output(['readelf', '-d', str(library)], text=True)
    if not old or old - new or '[libpoppler.so.147]' not in dynamic:
        raise ValueError('Poppler export/SONAME regression')
    candidate_env = dict(environment, LD_LIBRARY_PATH=str(libs))
    linkage = run(['ldd', client], 'candidate-old-header-linkage', env=candidate_env)
    if str(library) not in linkage:
        raise ValueError('old-header client did not resolve candidate library')
    fixture = source.parent / 'test/unittestcases/truetype.pdf'
    run([client, str(fixture)], 'candidate-old-header-client', env=candidate_env)
    elf_checks = []
    for path in sorted(candidate.rglob('*')):
        if path.is_symlink() or not path.is_file():
            continue
        with path.open('rb') as stream:
            if stream.read(4) != b'\x7fELF':
                continue
        dynamic = subprocess.check_output(['readelf', '-d', str(path)], text=True)
        imports = subprocess.check_output(['nm', '-D', '--undefined-only', str(path)], text=True)
        if 'libopenjp' in dynamic or re.search(r'\bopj_\w+', imports):
            raise ValueError('OpenJPEG dependency/import remains in runtime cohort')
        elf_checks.append({'path': str(path.relative_to(candidate)), 'sha256': digest(path)})
    if len(elf_checks) < 2:
        raise ValueError('missing runtime ELF evidence')
    executable = candidate / 'usr/bin/pdftotext'
    graph = run(['ldd', str(executable)], 'candidate-extractor-linkage', env=candidate_env)
    if 'libopenjp' in graph or str(library) not in graph:
        raise ValueError('unexpected candidate extractor linkage')
    builds = list(source.glob('obj-*'))
    if len(builds) != 1:
        raise ValueError('native build directory differs')
    build = builds[0]
    cache = (build / 'CMakeCache.txt').read_text()
    config = (build / 'config.h').read_text()
    if 'ENABLE_LIBOPENJPEG:STRING=none' not in cache or re.search(r'^#define (?:HAVE_JPX_DECODER|WITH_OPENJPEG)\b', config, re.M):
        raise ValueError('disabled native JPX configuration not established')
    parity = []
    for index, name in enumerate(pins['nativeParityPdfs']):
        pdf = source.parent / 'test' / name
        values = {}
        for label, binary, env in [('baseline', pathlib.Path('/usr/bin/pdftotext'), environment), ('candidate', executable, candidate_env)]:
            for mode in ['bbox', 'tsv']:
                output = pathlib.Path('/work') / (str(index) + '-' + label + '.' + mode)
                run([str(binary), '-' + mode, str(pdf), str(output)], 'parity-' + str(index) + '-' + label + '-' + mode, env=env)
                if not output.is_file() or output.stat().st_size > 2097152:
                    raise ValueError('native parity transport bound exceeded')
                values[label + '-' + mode] = output.read_bytes()
        if values['baseline-bbox'] != values['candidate-bbox'] or values['baseline-tsv'] != values['candidate-tsv']:
            raise ValueError('standard bbox/TSV output changed')
        metadata_repair = None
        try:
            pages, old_text, old_code = reference(values['baseline-bbox'])
        except ET.ParseError as error:
            raw = values['baseline-bbox']
            if (name != 'unittestcases/pdf20-utf8-test.pdf'
                    or digest(pdf) != '066cac85038db27cb85b923eb2fbdffb4c76e94bf2f4d21cc952af94b40e71fe'
                    or error.position != (3, 23)
                    or raw.count(b'<doc>') != 1 or raw.count(b'</doc>') != 1):
                raise
            begin, end = raw.index(b'<doc>'), raw.index(b'</doc>') + len(b'</doc>')
            header = raw[:begin]
            if (begin >= end or b'\xed\xa1\x80\xed\xb0\x80' not in header
                    or not header.splitlines()[2].startswith(b'<title>')
                    or not header.splitlines()[2].endswith(b'</title>')):
                raise ValueError('pinned unused TITLE compatibility case differs')
            geometry = b'<root xmlns="http://www.w3.org/1999/xhtml">' + raw[begin:end] + b'</root>'
            pages, old_text, old_code = reference(geometry)
            if len(pages) != 1 or sum(len(page[2]) for page in pages) != 19 or old_code is not None:
                raise ValueError('pinned geometry/body compatibility changed')
            metadata_repair = {'scope': 'exact pinned unused TITLE only; build-time reference',
                               'legacyWholeXmlCode': 'output_invalid', 'legacyErrorLine': 3,
                               'legacyErrorColumn': 23, 'strictGeometryBodyCode': old_code,
                               'geometryBodySha256': hashlib.sha256(raw[begin:end]).hexdigest(),
                               'fullStandardBboxTsvByteParityRequired': True,
                               'productionXmlFallback': False}
        frame = pathlib.Path('/work') / (str(index) + '.frame')
        run([str(executable), '-resumide-bbox', str(pdf), str(frame)], 'parity-' + str(index) + '-frame', env=candidate_env)
        if not frame.is_file() or frame.stat().st_size > 2097152:
            raise ValueError('private parity frame missing/oversized')
        data = frame.read_bytes()
        try:
            text = parse_geometry(data, len(pages))
            code = None
        except GeometryError as error:
            text = None
            code = error.code
        if code != old_code or (code is None and text != old_text):
            raise ValueError('consumer text/layout category parity failed')
        negative_empty_document = None
        if code == 'output_invalid':
            # Exact public negative fixture: retain both consumers' nonempty-document floor.
            expected_frame = (b'RESUMIDE_BBOX\t1\nP\t595.220000\t842.000000\nE\n'
                              b'P\t595.220000\t842.000000\nE\nZ\t2\n')
            if (name != 'unittestcases/doublepage.pdf'
                    or digest(pdf) != 'aa53117a8ec181a7edc8cc2d4559930c091660454af1d2e9e6a080f1a07c95bb'
                    or old_code != 'output_invalid' or old_text != ''
                    or pages != [('595.220000', '842.000000', []), ('595.220000', '842.000000', [])]
                    or data != expected_frame or frame_values(data) != pages):
                raise ValueError('pinned empty-document negative parity differs')
            negative_empty_document = {'legacyCode': old_code, 'privateCode': code,
                                       'canonicalClosedFrameByteParity': True,
                                       'nonemptyDocumentFloorPreserved': True}
        elif code not in (None, 'layout_overflow') or frame_values(data) != pages:
            # Only inspect other frames after strict acceptance or a validated layout error.
            raise ValueError('absolute coordinate/text/order parity failed')
        font_outputs = []
        for label, binary, env in [('baseline', '/usr/bin/pdffonts', environment), ('candidate', str(candidate / 'usr/bin/pdffonts'), candidate_env)]:
            font_outputs.append(run([binary, str(pdf)], 'parity-' + str(index) + '-' + label + '-fonts', env=env))
        if font_outputs[0] != font_outputs[1]:
            raise ValueError('font inventory changed')
        parity.append({'fixture': name, 'pdfSha256': digest(pdf), 'pages': len(pages),
                       'words': sum(len(page[2]) for page in pages), 'textSha256': hashlib.sha256(old_text.encode()).hexdigest(),
                       'frameSha256': hashlib.sha256(data).hexdigest(), 'layoutCode': code,
                       'exactCoordinateTextOrder': True, 'standardBboxTsvByteParity': True, 'fontInventoryParity': True, 'unusedMetadataCompatibilityRepair': metadata_repair, 'negativeEmptyDocument': negative_empty_document})
    jpx = pathlib.Path('/work/neutral-inline-jpx.pdf'); neutral_jpx(jpx)
    jpx_frame = pathlib.Path('/work/neutral-inline-jpx.frame')
    diagnostic = run([str(executable), '-resumide-bbox', str(jpx), str(jpx_frame)], 'disabled-jpx-dispatch', env=candidate_env)
    if not jpx_frame.is_file() or jpx_frame.stat().st_size > 2097152:
        raise ValueError('JPX probe frame missing/oversized')
    if "Unknown filter 'JPXDecode'" not in diagnostic or parse_geometry(jpx_frame.read_bytes(), 1) != 'Neutral':
        raise ValueError('none-mode JPX dispatch behavior not observed')
    return {'soname': 'libpoppler.so.147', 'baselineExports': len(old), 'candidateExports': len(new),
            'missingExports': [], 'oldHeaderClientLinkedAndPassed': True, 'runtimeElfNoOpj': elf_checks,
            'samePdfParity': parity, 'disabledJpxDiagnostic': 'Unknown filter; EOF permits unrelated text extraction',
            'wholePdfRejectionClaim': False, 'fullConverterProfilesRuntimeRenderBrowser': 'not-run; mandatory root-integrated worker gates'}
