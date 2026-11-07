"""Private RESUMIDE_BBOX v1 boundary; no XML or alternate-parser fallback."""
import math
import re

_NUMBER = re.compile(r'-?(?:0|[1-9][0-9]*)\.[0-9]{6}\Z', re.ASCII)
_HEX = re.compile(r'[0-9a-f]*\Z', re.ASCII)
_COUNT = re.compile(r'[1-9][0-9]*\Z', re.ASCII)


class GeometryError(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def _invalid():
    raise GeometryError('output_invalid') from None


def _word(value):
    if len(value) % 2 or not _HEX.fullmatch(value):
        _invalid()
    try:
        text = bytes.fromhex(value).decode('utf-8', errors='strict')
    except (ValueError, UnicodeError):
        _invalid()
    if any(not (character in '\t\n\r' or 0x20 <= ord(character) <= 0xD7FF
                or 0xE000 <= ord(character) <= 0xFFFD
                or 0x10000 <= ord(character) <= 0x10FFFF) for character in text):
        _invalid()
    return text.replace('\r\n', '\n').replace('\r', '\n')


def _number(value):
    number = float(value)
    if not math.isfinite(number):
        _invalid()
    return number


def parse_geometry(data, expected_pages):
    """Return the existing single-space word text, or a fixed GeometryError code."""
    if type(data) is not bytes or len(data) > 2097152 or type(expected_pages) is not int or not 1 <= expected_pages <= 10:
        _invalid()
    try:
        frame = data.decode('ascii', errors='strict')
    except UnicodeError:
        _invalid()
    if not frame.endswith('\n'):
        _invalid()
    records = frame[:-1].split('\n')
    if len(records) < 4 or records[0] != 'RESUMIDE_BBOX\t1':
        _invalid()
    final = records[-1].split('\t')
    if len(final) != 2 or final[0] != 'Z' or not _COUNT.fullmatch(final[1]):
        _invalid()
    pages = []
    current = None
    # Complete structural/text validation precedes every layout or final-text check.
    for record in records[1:-1]:
        fields = record.split('\t')
        if fields[0] == 'P' and len(fields) == 3 and current is None:
            if not all(_NUMBER.fullmatch(value) for value in fields[1:]) or len(pages) >= 10:
                _invalid()
            current = (fields[1], fields[2], [])
        elif fields[0] == 'W' and len(fields) == 6 and current is not None:
            if not all(_NUMBER.fullmatch(value) for value in fields[1:5]):
                _invalid()
            current[2].append((fields[1:5], _word(fields[5])))
        elif fields == ['E'] and current is not None:
            pages.append(current)
            current = None
        else:
            _invalid()
    if current is not None or len(pages) != expected_pages or final[1] != str(expected_pages):
        _invalid()
    words = []
    for width_token, height_token, page_words in pages:
        width, height = _number(width_token), _number(height_token)
        for edges, text in page_words:
            if _number(edges[0]) < -1 or _number(edges[1]) < -1 or _number(edges[2]) > width + 1 or _number(edges[3]) > height + 1:
                raise GeometryError('layout_overflow')
            words.append(text)
    text = ' '.join(words)
    if not text.strip() or len(text) > 100000:
        _invalid()
    return text
