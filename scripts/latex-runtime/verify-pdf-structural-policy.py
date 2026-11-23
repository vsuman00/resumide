"""Run the installed PDF policy against neutral, synthetic documents."""

from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import sys

sys.path.insert(0, '/opt/latex')
from inspect_pdf import UnsafePDF, inspect_pdf
from pypdf import PdfWriter
from pypdf.errors import PdfReadError
from pypdf.generic import ArrayObject, DictionaryObject, NameObject, NumberObject, TextStringObject


def pdf_case(change=None):
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    writer.root_object.pop('/AcroForm', None)
    if change:
        change(writer, page)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def set_field(obj, field, value):
    obj[NameObject(field)] = value


def set_root(field, value):
    return lambda writer, _page: set_field(writer.root_object, field, value)


def set_page(field, value):
    return lambda _writer, page: set_field(page, field, value)


def rectangle(*numbers):
    return ArrayObject([NumberObject(number) for number in numbers])


def dictionary(**fields):
    return DictionaryObject({NameObject('/' + key): value for key, value in fields.items()})


def internal_destination(writer, page):
    assert page.indirect_reference is not None
    set_field(writer.root_object, '/OpenAction', ArrayObject([page.indirect_reference, NameObject('/Fit')]))


def link(uri):
    annotation = dictionary(
        Type=NameObject('/Annot'), Subtype=NameObject('/Link'), Rect=rectangle(10, 10, 40, 20),
        A=dictionary(S=NameObject('/URI'), URI=TextStringObject(uri)),
    )
    return set_page('/Annots', ArrayObject([annotation]))


def unembedded_font(_writer, page):
    font = dictionary(Type=NameObject('/Font'), Subtype=NameObject('/Type1'), BaseFont=NameObject('/Helvetica'))
    set_field(page, '/Resources', dictionary(Font=dictionary(F1=font)))


def expect_rejection(name, data, failure):
    try:
        inspect_pdf(data)
    except failure as error:
        return {'name': name, 'rejected': type(error).__name__}
    raise AssertionError(f'Unexpected PDF acceptance for {name}')


def verify():
    accepted = [
        ('plain-letter', None),
        ('internal-destination', internal_destination),
        ('https-link', link('https://example.org/reference')),
        ('mailto-link', link('mailto:neutral@example.test')),
    ]
    checks = []
    for name, change in accepted:
        pages = inspect_pdf(pdf_case(change))
        assert pages == 1
        checks.append({'name': name, 'pages': pages})

    rejected = [
        ('encrypted', lambda writer, _page: writer.encrypt('synthetic-test-only')),
        ('unembedded-font', unembedded_font),
        ('rotated', set_page('/Rotate', NumberObject(90))),
        ('scaled-user-space', set_page('/UserUnit', NumberObject(2))),
        ('crop-mismatch', set_page('/CropBox', rectangle(0, 0, 100, 100))),
        ('unsupported-media-size', set_page('/MediaBox', rectangle(0, 0, 400, 400))),
        ('unsupported-uri-scheme', link('urn:example:neutral-document')),
        ('non-link-annotation', set_page('/Annots', ArrayObject([dictionary(
            Type=NameObject('/Annot'), Subtype=NameObject('/Text'), Rect=rectangle(10, 10, 40, 20),
        )]))),
        ('empty-embedded-files-marker', set_root('/EmbeddedFiles', DictionaryObject())),
        ('empty-form-marker', set_root('/AcroForm', DictionaryObject())),
        ('unsupported-action-marker', set_root('/A', dictionary(S=NameObject('/Named')))),
    ]
    for name, change in rejected:
        checks.append(expect_rejection(name, pdf_case(change), UnsafePDF))
    checks.append(expect_rejection('truncated-header-only', b'%PDF-1.7\n', PdfReadError))
    return {
        'checks': checks,
        'inspectorSha256': sha256(Path('/opt/latex/inspect_pdf.py').read_bytes()).hexdigest(),
    }


if __name__ == '__main__':
    print(json.dumps(verify()))
