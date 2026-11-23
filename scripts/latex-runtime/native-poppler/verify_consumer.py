"""Independent neutral contract cases; no PDF/native process or service is used."""

import argparse
import hashlib
import importlib.util
import json
import pathlib
import sys
import unittest
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape


HEADER = b"RESUMIDE_BBOX\t1\n"
WIDTH, HEIGHT = "595.276000", "841.890000"
EDGES = ("10.000000", "20.000000", "90.000000", "30.000000")
NAMESPACE = "{http://www.w3.org/1999/xhtml}"
CONSUMER = None
CASE_RESULTS = []


def word(text="neutral", edges=EDGES):
    return (edges, text)


def page(*words, width=WIDTH, height=HEIGHT):
    return (width, height, words)


def frame(pages):
    records = [HEADER]
    for width, height, words in pages:
        records.append(f"P\t{width}\t{height}\n".encode("ascii"))
        for edges, text in words:
            records.append(("W\t" + "\t".join(edges) + "\t" + text.encode("utf-8").hex() + "\n").encode("ascii"))
        records.append(b"E\n")
    records.append(f"Z\t{len(pages)}\n".encode("ascii"))
    return b"".join(records)


def reference_xml(pages):
    # The native XML producer escapes metacharacters but leaves literal CR/LF.
    parts = ['<html xmlns="http://www.w3.org/1999/xhtml"><body><doc>']
    for width, height, words in pages:
        parts.append(f'<page width="{width}" height="{height}">')
        for edges, text in words:
            attributes = " ".join(f'{name}="{value}"' for name, value in zip(("xMin", "yMin", "xMax", "yMax"), edges))
            parts.append(f"<word {attributes}>{escape(text)}</word>")
        parts.append("</page>")
    parts.append("</doc></body></html>")
    return "".join(parts).encode("utf-8")


def xml_result(pages):
    # Independent oracle: the current supervisor's XML traversal and comparisons.
    try:
        tree = ET.fromstring(reference_xml(pages))
    except (ET.ParseError, UnicodeError):
        return ("output_invalid", None)
    texts = []
    for element in tree.iter(NAMESPACE + "page"):
        width, height = float(element.attrib["width"]), float(element.attrib["height"])
        for item in element.iter(NAMESPACE + "word"):
            if (float(item.attrib["xMin"]) < -1 or float(item.attrib["yMin"]) < -1
                    or float(item.attrib["xMax"]) > width + 1 or float(item.attrib["yMax"]) > height + 1):
                return ("layout_overflow", None)
            texts.append(item.text or "")
    text = " ".join(texts)
    return ("ok", text) if text.strip() and len(text) <= 100000 else ("output_invalid", None)


def candidate_result(data, expected_pages=1):
    # Filled against the reviewed public prototype API, not its parsing logic.
    try:
        return ("ok", CONSUMER.parse_geometry(data, expected_pages))
    except CONSUMER.GeometryError as error:
        if str(error) != error.code:
            raise AssertionError("prototype error message is not its fixed category")
        return (error.code, None)


def sized_valid_frame(size):
    # Protocol-boundary fixture only: large finite xMin and reversed edges remain
    # permitted by the unchanged predicate. This is not a native PDF/profile.
    valid = frame([page(word("x"))])
    marker = b"W\t10.000000"

    def empty_record(digits):
        return ("W\t" + "1" * digits + ".000000\t20.000000\t90.000000\t30.000000\t\n").encode("ascii")

    minimum, maximum = len(empty_record(1)), len(empty_record(300))
    count, remainder = divmod(size - len(valid), maximum)
    lengths = [maximum] * count
    if remainder >= minimum:
        lengths.append(remainder)
    elif remainder:
        lengths.pop()
        total = maximum + remainder
        first = min(maximum, total - minimum)
        lengths.extend((first, total - first))
    records = b"".join(empty_record(length - minimum + 1) for length in lengths)
    data = valid.replace(marker, records + marker, 1)
    assert len(data) == size
    return data, " " * len(lengths) + "x"


class GeometryAcceptance(unittest.TestCase):
    def check(self, label, data, expected, expected_pages=1):
        actual = candidate_result(data, expected_pages)
        CASE_RESULTS.append({"label": label, "inputBytes": len(data), "passed": actual == expected, "expectedCategory": expected[0], "actualCategory": actual[0]})
        self.assertEqual(actual, expected, label)

    def parity(self, label, pages):
        self.check(label, frame(pages), xml_result(pages), len(pages))

    def test_text_and_empty_parity(self):
        cases = {
            "word-order": [page(word("third"), word("first"), word("second"))],
            "metacharacters-no-second-unescape": [page(word("&amp; <tag> \"quoted\" 'literal'"))],
            "unicode-no-normalization": [page(word("é e\u0301 Ω ∑ 😀 \ufffd \ufdd0"))],
            "tabs-newlines-and-record-like-text": [page(word("A\tB\nZ\t9\r\nC\rD"))],
            "xml-boundary-characters": [page(word("x\t\n\r \x7f\u0085\u009f\ud7ff\ue000\ufffd\U00010000\U0010ffff"))],
            "empty-words-preserved": [page(word(""), word("middle"), word(""), word(""))],
            "empty-pages-preserved": [page(), page(word("left")), page(), page(word("right")), page()],
            "eol-normalization-per-word": [page(word("a\r"), word("\nb"), word("c\r\nd\re"))],
            "all-empty-document": [page(), page(word(""))],
            "whitespace-document": [page(word("\t\r\n "))],
        }
        for label, pages in cases.items():
            with self.subTest(label=label):
                self.parity(label, pages)

    def test_numeric_and_layout_parity(self):
        cases = {
            "signed-zero": ("-0.000000", "0.000000", "90.000000", "30.000000"),
            "exact-negative-boundary": ("-1.000000", "-1.000000", "596.276000", "842.890000"),
            "xmin-outside": ("-1.000001", "0.000000", "90.000000", "30.000000"),
            "ymin-outside": ("0.000000", "-1.000001", "90.000000", "30.000000"),
            "xmax-outside": ("0.000000", "0.000000", "596.276001", "30.000000"),
            "ymax-outside": ("0.000000", "0.000000", "90.000000", "842.890001"),
            "no-new-reversed-edge-rule": ("90.000000", "30.000000", "10.000000", "20.000000"),
            "absolute-rounding-counterexample": ("100.123456", "20.000000", "200.123457", "30.000000"),
            "absolute-edge-is-not-width": ("100.123456", "20.000000", "596.276000", "30.000000"),
        }
        for label, edges in cases.items():
            with self.subTest(label=label):
                self.parity(label, [page(word(edges=edges))])
        self.parity("rounding-counterexample-at-boundary", [page(word(edges=("100.123456", "20.000000", "200.123457", "30.000000")), width="199.123456")])

    def test_framing_invalid(self):
        valid = frame([page(word())])
        line = b"W\t10.000000\t20.000000\t90.000000\t30.000000\t6e65757472616c\n"
        cases = {
            "empty": b"", "header-missing": valid[len(HEADER):],
            "version": valid.replace(HEADER, b"RESUMIDE_BBOX\t2\n"),
            "header-extra-field": valid.replace(HEADER, b"RESUMIDE_BBOX\t1\tx\n"),
            "header-duplicate": HEADER + valid,
            "header-bom": b"\xef\xbb\xbf" + valid,
            "crlf-framing": valid.replace(b"\n", b"\r\n"),
            "cr-only-framing": valid.replace(b"\n", b"\r"),
            "final-lf-missing": valid[:-1], "trailing-lf": valid + b"\n",
            "trailing-record": valid + b"E\n", "trailing-bytes": valid + b"x",
            "unknown-record": valid.replace(b"E\n", b"Q\n"),
            "word-before-page": HEADER + line + b"Z\t1\n",
            "nested-page": valid.replace(line, f"P\t{WIDTH}\t{HEIGHT}\n".encode() + line),
            "end-without-page": HEADER + b"E\nZ\t1\n",
            "open-page-at-final": valid.replace(b"E\n", b""),
            "final-missing": valid[:-4], "final-before-end": valid.replace(b"E\nZ\t1\n", b"Z\t1\nE\n"),
            "duplicate-final": valid + b"Z\t1\n",
            "zero-pages": HEADER + b"Z\t0\n",
            "count-mismatch": valid.replace(b"Z\t1\n", b"Z\t2\n"),
            "count-leading-zero": valid.replace(b"Z\t1\n", b"Z\t01\n"),
            "count-plus": valid.replace(b"Z\t1\n", b"Z\t+1\n"),
            "count-float": valid.replace(b"Z\t1\n", b"Z\t1.0\n"),
            "page-field-missing": valid.replace(f"P\t{WIDTH}\t{HEIGHT}\n".encode(), b"P\t595.276000\n"),
            "word-field-missing": valid.replace(line, b"W\t10.000000\t20.000000\t90.000000\t30.000000\n"),
            "word-field-extra": valid.replace(line, line[:-1] + b"\tx\n"),
            "end-field-extra": valid.replace(b"E\n", b"E\tx\n"),
            "non-ascii-framing": valid.replace(b"P\t", b"P\xc2\xa0"),
        }
        for label, data in cases.items():
            with self.subTest(label=label):
                self.check(label, data, ("output_invalid", None))

    def test_numeric_tokens_invalid(self):
        valid = frame([page(word())])
        for index, token in enumerate(("nan", "inf", "-inf", "1e1", "+10.000000", "10", "10.00000", "10.0000000", " 10.000000", "10.000000 ", "10,000000", "01.000000", "١0.000000", "9" * 310 + ".000000")):
            with self.subTest(index=index):
                self.check(f"coordinate-token-{index}", valid.replace(b"10.000000", token.encode("utf-8"), 1), ("output_invalid", None))
        for field in (WIDTH, HEIGHT):
            for index, token in enumerate(("nan", "1e2", "+595.276000", "595.27600")):
                with self.subTest(page_field=field, token=index):
                    self.check(f"page-dimension-{field}-{index}", valid.replace(field.encode(), token.encode(), 1), ("output_invalid", None))

    def test_text_bytes_invalid(self):
        valid = frame([page(word("x"))])
        for label, token in {
            "odd-hex": b"7", "bad-hex": b"gg", "upper-hex": b"4A", "hex-space": b"78 79",
            "invalid-utf8": b"ff", "overlong-utf8": b"c080", "surrogate-utf8": b"eda080",
            "beyond-unicode": b"f4908080", "nul-rejected-not-truncated": b"780079",
            "control-01": b"01", "control-vtab": b"0b", "control-formfeed": b"0c", "control-1f": b"1f",
            "noncharacter-fffe": b"efbfbe", "noncharacter-ffff": b"efbfbf",
        }.items():
            with self.subTest(label=label):
                self.check(label, valid.replace(b"\t78\n", b"\t" + token + b"\n"), ("output_invalid", None))

    def test_limits_and_precedence(self):
        self.parity("text-exact-100000", [page(word("é" * 100000))])
        self.parity("text-over-100000", [page(word("x" * 100001))])
        self.parity("join-separator-counts", [page(word("x" * 99999), word("y"))])
        self.parity("normalized-length-counts", [page(word("x" * 99999 + "\r\n"))])
        self.parity("ten-pages", [page(word()) for _ in range(10)])
        self.check("eleven-pages", frame([page(word()) for _ in range(11)]), ("output_invalid", None), 11)
        for count in (0, 2, True, "1", 1.0):
            with self.subTest(expected_pages_type=type(count).__name__, count=count):
                self.check(f"inspected-count-{type(count).__name__}-{count}", frame([page(word())]), ("output_invalid", None), count)
        self.check("transport-over-2MiB", b"x" * (2097152 + 1), ("output_invalid", None))
        at_limit, at_limit_text = sized_valid_frame(2097152)
        self.check("valid-frame-exact-2MiB", at_limit, ("ok", at_limit_text))
        over_limit, _ = sized_valid_frame(2097153)
        self.check("valid-frame-one-byte-over-2MiB", over_limit, ("output_invalid", None))
        overflowing = page(word("x", ("-1.000001", *EDGES[1:])))
        self.parity("layout-before-empty-text", [page(word("", ("-1.000001", *EDGES[1:])))])
        self.parity("layout-before-final-text-cap", [overflowing, page(word("x" * 100001))])
        bad_after_layout = frame([overflowing]).replace(b"E\n", b"Q\n")
        self.check("malformed-before-layout", bad_after_layout, ("output_invalid", None))
        bad_text_after_layout = frame([overflowing, page(word("\x01"))])
        self.check("invalid-word-text-before-layout", bad_text_after_layout, ("output_invalid", None), 2)
        later_nonfinite = page(word("x", ("-1.000001", "20.000000", "90.000000", "9" * 310 + ".000000")))
        self.check("layout-short-circuits-later-float", frame([later_nonfinite]), ("layout_overflow", None))
        later_page_nonfinite = page(word(), width="9" * 310 + ".000000")
        self.check("earlier-layout-before-later-page-float", frame([overflowing, later_page_nonfinite]), ("layout_overflow", None), 2)


def main():
    global CONSUMER
    parser = argparse.ArgumentParser()
    parser.add_argument("--consumer", type=pathlib.Path, required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--receipt", type=pathlib.Path, required=True)
    args = parser.parse_args()
    before = hashlib.sha256(args.consumer.read_bytes()).hexdigest()
    if before != args.sha256:
        raise SystemExit("consumer source hash mismatch")
    spec = importlib.util.spec_from_file_location("reviewed_geometry_prototype", args.consumer)
    CONSUMER = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(CONSUMER)
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(GeometryAcceptance)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    after = hashlib.sha256(args.consumer.read_bytes()).hexdigest()
    receipt = {
        "tier": "neutral-source-prototype-only", "consumerSHA256": before, "consumerStable": before == after,
        "testSHA256": hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
        "testMethods": result.testsRun, "cases": CASE_RESULTS, "passed": result.wasSuccessful() and before == after,
        "nativeExecution": False, "containers": False, "services": False, "database": False, "provider": False,
    }
    args.receipt.write_text(json.dumps(receipt, indent=2) + "\n")
    return 0 if receipt["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
