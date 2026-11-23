"""Synthetic worker experiment. Receives a registered PDF on stdin."""

import csv
import hashlib
import io
import json
import os
import re
import resource
import statistics
import struct
import subprocess
import sys
import time
import xml.etree.ElementTree as xml
from pathlib import Path

STARTED = time.monotonic()
NS = "{http://www.w3.org/1999/xhtml}"
BOX = re.compile(r"(?:^|;)\s*x_bboxes (\d+) (\d+) (\d+) (\d+)(?:;|$)")
ANCHOR = re.compile(r"[A-Z0-9bdfhklt]")
MAX_PDF = 10 * 1024 * 1024
MAX_REPORT = 4 * 1024 * 1024


def run(argv):
    remaining = 10 - (time.monotonic() - STARTED)
    if remaining <= 0:
        raise TimeoutError("worker deadline")
    subprocess.run(
        argv, check=True, timeout=remaining, stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def read_bounded(path, limit):
    with Path(path).open("rb") as handle:
        data = handle.read(limit + 1)
    if len(data) > limit:
        raise ValueError("output limit")
    return data


def spans(element, name):
    return [item for item in element.iter(NS + "span") if item.get("class") == name]


def read_symbols(word, width, height):
    symbols = []
    for item in spans(word, "ocrx_cinfo"):
        match = BOX.search(item.get("title", ""))
        char = "".join(item.itertext())
        if not match or len(char) != 1:
            return None
        left, top, right, bottom = map(int, match.groups())
        if not (0 <= left < right <= width and 0 <= top < bottom <= height):
            return None
        symbols.append((char, left, top, right, bottom))
    return symbols or None


def refine(symbol, anchors):
    char, left, top, right, bottom = symbol
    if char not in "-—":
        return char
    # Require nearby glyphs of a stable height, vertical overlap and a thin
    # horizontal mark. Ratios are a development hypothesis for printed text.
    mid_y = (top + bottom) / 2
    mid_x = (left + right) / 2
    neighbours = [
        (abs((x1 + x2) / 2 - mid_x), y2 - y1)
        for _, x1, y1, x2, y2 in anchors
        if y1 < mid_y < y2 and abs((x1 + x2) / 2 - mid_x) <= 5 * (y2 - y1)
    ]
    heights = [height for _, height in sorted(neighbours)[:5]]
    if len(heights) < 3 or max(heights) > 1.25 * min(heights):
        return char
    height = statistics.median(heights)
    if height >= 12 and (bottom - top) / height <= 0.30 and 0.58 <= (right - left) / height <= 0.87:
        return "–"
    return char


def refine_word(word, next_word, anchors):
    tokens = []
    for index, symbol in enumerate(word):
        char = symbol[0]
        left = word[index - 1][0] if index > 0 else ""
        inner_right = index + 1 < len(word)
        right = word[index + 1][0] if inner_right else next_word[0][0] if next_word else ""
        # A mark before a number can be a sign or operator. Only consider
        # an uninterrupted digit-mark-digit token for numeric dash recovery.
        if right.isdecimal() and not (left.isdecimal() and inner_right):
            tokens.append(char)
        else:
            tokens.append(refine(symbol, anchors))
    return "".join(tokens)


def render_words(tsv, markup, width, height):
    rows = [
        row for row in csv.DictReader(io.StringIO(tsv), delimiter="\t")
        if row["level"] == "5" and row["text"].strip()
    ]
    root = xml.fromstring(markup)
    refinements = {}
    cursor = 0
    for line in root.iter(NS + "span"):
        if line.get("class") not in ("ocr_line", "ocr_header", "ocr_textfloat", "ocr_caption"):
            continue
        words = spans(line, "ocrx_word")
        symbols = [read_symbols(word, width, height) for word in words]
        # Bind against the TSV words before using any of the coordinates.
        # Once alignment differs, keep the primary text for the whole page.
        line_rows = rows[cursor:cursor + len(words)]
        originals = ["".join(entry[0] for entry in word or []) for word in symbols]
        if not words or originals != [row["text"] for row in line_rows]:
            return rows, {}
        anchors = [symbol for word in symbols for symbol in word or [] if ANCHOR.fullmatch(symbol[0])]
        for offset, word in enumerate(symbols):
            next_word = symbols[offset + 1] if offset + 1 < len(symbols) else None
            refinements[cursor + offset] = refine_word(word or [], next_word, anchors)
        cursor += len(words)
    if cursor != len(rows):
        return rows, {}
    return rows, refinements


def main():
    if len(sys.argv) != 2 or not re.fullmatch(r"[1-9][0-9]?(,[1-9][0-9]?)*", sys.argv[1]):
        raise ValueError("select pages")
    pages = [int(value) for value in sys.argv[1].split(",")]
    if len(pages) not in (1, 2) or len(set(pages)) != len(pages) or max(pages) > 3:
        raise ValueError("page bound")
    pdf = sys.stdin.buffer.read(MAX_PDF + 1)
    if len(pdf) > MAX_PDF or not pdf.startswith(b"%PDF-"):
        raise ValueError("source bound")
    Path("/scratch/source.pdf").write_bytes(pdf)
    output = []
    for page in pages:
        run([
            "pdftoppm", "-f", str(page), "-l", str(page), "-singlefile",
            "-r", "150", "-scale-to", "1650", "-png", "/scratch/source.pdf", "/scratch/page",
        ])
        image = read_bounded("/scratch/page.png", 12 * 1024 * 1024)
        width, height = struct.unpack(">II", image[16:24])
        if not image.startswith(b"\x89PNG\r\n\x1a\n") or not (1 <= width <= 1650 and 1 <= height <= 1650):
            raise ValueError("image bound")
        run([
            "tesseract", "/scratch/page.png", "/scratch/probe", "-l", "eng",
            "--psm", "3", "-c", "hocr_char_boxes=1", "tsv", "hocr",
        ])
        rows, refined = render_words(
            read_bounded("/scratch/probe.tsv", MAX_REPORT).decode(),
            read_bounded("/scratch/probe.hocr", MAX_REPORT), width, height,
        )
        words = []
        text = ""
        previous_line = None
        for index, row in enumerate(rows):
            token = refined.get(index, row["text"])
            line = (row["block_num"], row["par_num"], row["line_num"])
            if text:
                text += " " if line == previous_line else "\n"
            start = len(text)
            text += token
            words.append({
                "text": token, "start": start, "end": len(text),
                "confidence": float(row["conf"]),
                "box": {"x": int(row["left"]) / width, "y": int(row["top"]) / height,
                        "width": int(row["width"]) / width, "height": int(row["height"]) / height},
            })
            previous_line = line
        output.append({
            "pageNumber": page, "pageId": f"page-{page}", "imageSha256": hashlib.sha256(image).hexdigest(),
            "widthPixels": width, "heightPixels": height, "rotation": 0, "text": text, "words": words,
        })
        os.unlink("/scratch/page.png")
        os.unlink("/scratch/probe.tsv")
        os.unlink("/scratch/probe.hocr")
    usage = resource.getrusage(resource.RUSAGE_CHILDREN)
    result = json.dumps({
        "durationMs": round(1000 * (time.monotonic() - STARTED)),
        "pages": output,
        "resourceUsage": {
            "kind": "child_process_rusage", "cpuTimeMs": 1000 * (usage.ru_utime + usage.ru_stime),
            "maxChildRssBytes": usage.ru_maxrss * 1024, "rendererCalls": len(pages), "recognitionCalls": len(pages),
        },
    }).encode()
    if len(result) > MAX_REPORT:
        raise ValueError("report limit")
    sys.stdout.buffer.write(result)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError, xml.ParseError):
        sys.exit(1)
