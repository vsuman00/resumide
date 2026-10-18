"""Synthetic-only container entrypoint. No network, host paths or document logging."""
import csv
import hashlib
import io
import json
import math
import os
import re
import struct
import subprocess
import sys
import tempfile
import time
import signal
import resource

started = time.monotonic()
process_counts = {"rendererCalls": 0, "recognitionCalls": 0}


def container_memory_peak():
    # Snapshot before result serialization, not a claim about the container's final lifetime peak.
    observation = {"kind": "cgroup_v2_memory_peak", "measuredThrough": "recognition_complete",
                   "valueBytes": None, "reason": "cgroup_files_unavailable"}
    try:
        with open("/proc/self/cgroup") as source:
            membership = source.read(128).strip()
        with open("/sys/fs/cgroup/memory.max") as source:
            limit = source.read(128).strip()
        # Only the namespace root with the exact approved per-container allocation.
        # Never fall back to a parent/host cgroup, current usage or individual-child RSS.
        if membership != "0::/" or limit != "1073741824":
            observation["reason"] = "cgroup_scope_unverified"
            return observation
        with open("/sys/fs/cgroup/memory.peak") as source:
            peak = source.read(128).strip()
        if not peak.isascii() or not peak.isdigit() or not 0 < int(peak) <= 9007199254740991:
            observation["reason"] = "cgroup_peak_invalid"
            return observation
        observation.update(valueBytes=int(peak), reason=None)
    except OSError:
        # Unsupported/unreadable counters do not invent a measurement or fail OCR.
        observation["reason"] = "cgroup_files_unavailable"
    return observation


def execute(argv):
    remaining = 10 - (time.monotonic() - started)
    if remaining <= 0:
        raise ValueError("deadline")
    with tempfile.TemporaryFile(dir="/scratch") as output:
        process = subprocess.Popen(argv, stdout=output, stderr=subprocess.DEVNULL, start_new_session=True,
                                   env={"PATH": "/usr/bin:/bin", "LC_ALL": "C.UTF-8", "OMP_THREAD_LIMIT": "2", "TMPDIR": "/scratch"})
        if argv[0] == "pdftoppm":
            process_counts["rendererCalls"] += 1
        elif argv[0] == "tesseract":
            process_counts["recognitionCalls"] += 1
        try:
            while process.poll() is None:
                if time.monotonic() - started >= 10 or os.fstat(output.fileno()).st_size > 4 * 1024 * 1024:
                    raise ValueError("execution_limit")
                time.sleep(0.01)
            if process.returncode != 0 or os.fstat(output.fileno()).st_size > 4 * 1024 * 1024:
                raise ValueError("execution_failure")
            output.seek(0)
            return output.read(4 * 1024 * 1024 + 1)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=1)


def word_iou(first, second):
    width = max(0, min(first["left"] + first["width"], second["left"] + second["width"]) - max(first["left"], second["left"]))
    height = max(0, min(first["top"] + first["height"], second["top"] + second["height"]) - max(first["top"], second["top"]))
    intersection = width * height
    return intersection / (first["width"] * first["height"] + second["width"] * second["height"] - intersection)


def fuse_text_words(first, second):
    # Experimental text-fusion/4: engine certainty is not calibrated accuracy.
    result = list(first)
    groups = {}
    for index, word in enumerate(first):
        groups.setdefault(tuple(word["line"]), [[], []])[0].append(index)
    for index, word in enumerate(second):
        groups.setdefault(tuple(word["line"]), [[], []])[1].append(index)
    for primary, alternate in groups.values():
        # Dense/ambiguous lines retain the baseline and bound alignment work.
        if len(primary) > 128 or len(alternate) > 128:
            continue
        forward = {index: [] for index in primary}
        reverse = {index: [] for index in alternate}
        for left in primary:
            for right in alternate:
                if word_iou(first[left], second[right]) >= 0.8:
                    forward[left].append(right)
                    reverse[right].append(left)
        for left in primary:
            if len(forward[left]) != 1:
                continue
            right = forward[left][0]
            if len(reverse[right]) != 1:
                continue
            original, candidate = first[left]["text"], second[right]["text"]
            # Limit the alternate decoder to punctuation/glyph ambiguity. Plain
            # alphabetic words retain their baseline rather than being rewritten.
            if original.isalpha():
                continue
            if original == candidate or not all(any(char.isalpha() for char in text) for text in [original, candidate]):
                continue
            # An English word model can recast abbreviations as mixed-case words.
            if original.isupper() and any(char.islower() for char in candidate):
                continue
            if any(char.isdigit() or char == "@" or char.isspace() for char in original + candidate) or "://" in original or "://" in candidate:
                continue
            result[left] = second[right]
    return result


def parse_words(tsv, width, height):
    words = []
    for row in csv.DictReader(io.StringIO(tsv), delimiter="\t"):
        if row["level"] != "5" or not row["text"].strip():
            continue
        left, top, box_width, box_height = [int(row[key]) for key in ["left", "top", "width", "height"]]
        confidence = float(row["conf"])
        if not math.isfinite(confidence) or not 0 <= confidence <= 100 or min(left, top) < 0 or min(box_width, box_height) <= 0 or left + box_width > width or top + box_height > height:
            raise ValueError("geometry")
        words.append({"text": row["text"], "line": (row["block_num"], row["par_num"], row["line_num"]),
                      "left": left, "top": top, "width": box_width, "height": box_height, "confidence": confidence})
    return words


def main():
    if len(sys.argv) not in [2, 4, 5, 6] or not re.fullmatch(r"[1-9][0-9]*(,[1-9][0-9]*){0,9}", sys.argv[1]):
        raise ValueError("pages")
    psm, max_dpi = "3", 300
    if len(sys.argv) >= 4:
        if sys.argv[2] not in ["3", "6"] or sys.argv[3] not in ["150", "300"]:
            raise ValueError("config")
        psm, max_dpi = sys.argv[2], int(sys.argv[3])
    threshold_args = []
    model_args = []
    tsv_config = "tsv"
    extras = sys.argv[4:]
    fusion = extras == ["text-fusion"]
    if fusion:
        if psm != "3" or max_dpi != 150:
            raise ValueError("config")
        extras = []
    if extras and extras[-1] == "best":
        model_args = ["--oem", "1", "--tessdata-dir", "/opt/tessdata-best"]
        tsv_config = "/usr/share/tesseract-ocr/5/tessdata/configs/tsv"
        extras = extras[:-1]
    if extras:
        if extras not in [["1"], ["2"]]:
            raise ValueError("config")
        threshold_args = ["-c", "thresholding_method=1" if extras[0] == "1" else "thresholding_method=2"]
    selected = [int(number) for number in sys.argv[1].split(",")]
    if len(set(selected)) != len(selected) or max(selected) > 20:
        raise ValueError("pages")
    pdf = sys.stdin.buffer.read(10 * 1024 * 1024 + 1)
    if len(pdf) > 10 * 1024 * 1024 or not pdf.startswith(b"%PDF-"):
        raise ValueError("input")
    with open("/scratch/input.pdf", "xb") as target:
        target.write(pdf)
    output = []
    total_pixels = 0
    for page_number in selected:
        info = execute(["pdfinfo", "-f", str(page_number), "-l", str(page_number), "-box", "/scratch/input.pdf"]).decode("utf-8")
        if re.search(r"Encrypted:\s+yes", info):
            raise ValueError("encrypted")
        size = re.search(r"(?:Page\s+\d+\s+size|Page size):\s+([0-9.]+)\s+x\s+([0-9.]+)", info)
        rotation_match = re.search(r"(?:Page\s+\d+\s+rot|Page rot):\s+(-?\d+)", info)
        if not size or not rotation_match:
            raise ValueError("dimensions")
        width_points, height_points = map(float, size.groups())
        rotation = int(rotation_match.group(1)) % 360
        if not all(math.isfinite(value) and value > 0 for value in [width_points, height_points]) or rotation not in [0, 90, 180, 270]:
            raise ValueError("dimensions")
        dpi = min(max_dpi, 3160 * 72 / max(width_points, height_points))
        execute(["pdftoppm", "-f", str(page_number), "-l", str(page_number), "-singlefile", "-r", str(dpi), "-png", "/scratch/input.pdf", "/scratch/page"])
        with open("/scratch/page.png", "rb") as raster:
            image = raster.read(40 * 1024 * 1024 + 1)
        if len(image) > 40 * 1024 * 1024 or image[:8] != b"\x89PNG\r\n\x1a\n":
            raise ValueError("image")
        width, height = struct.unpack(">II", image[16:24])
        pixels = width * height
        total_pixels += pixels
        if not width or not height or pixels > 10_000_000 or total_pixels > 100_000_000:
            raise ValueError("pixels")
        tsv = execute(["tesseract", "/scratch/page.png", "stdout", "-l", "eng", "--psm", psm, *model_args, *threshold_args, tsv_config]).decode("utf-8")
        decoded = parse_words(tsv, width, height)
        if fusion:
            alternate_tsv = execute(["tesseract", "/scratch/page.png", "stdout", "-l", "eng", "--psm", "3", "--oem", "1", "--tessdata-dir", "/opt/tessdata-best", "/usr/share/tesseract-ocr/5/tessdata/configs/tsv"]).decode("utf-8")
            decoded = fuse_text_words(decoded, parse_words(alternate_tsv, width, height))
        words = []
        text = ""
        previous_line = None
        for row in decoded:
            line = row["line"]
            if text:
                text += " " if line == previous_line else "\n"
            start = len(text)
            text += row["text"]
            words.append({"text": row["text"], "start": start, "end": len(text), "confidence": row["confidence"],
                          "box": {"x": row["left"] / width, "y": row["top"] / height, "width": row["width"] / width, "height": row["height"] / height}})
            previous_line = line
        output.append({"pageNumber": page_number, "pageId": "page-" + str(page_number), "imageSha256": hashlib.sha256(image).hexdigest(),
                       "widthPixels": width, "heightPixels": height, "rotation": rotation, "text": text, "words": words})
        os.unlink("/scratch/page.png")
    os.unlink("/scratch/input.pdf")
    usage = resource.getrusage(resource.RUSAGE_CHILDREN)
    resource_usage = {"kind": "child_process_rusage", "cpuTimeMs": (usage.ru_utime + usage.ru_stime) * 1000,
                      "maxChildRssBytes": usage.ru_maxrss * 1024, **process_counts,
                      "containerMemoryPeak": container_memory_peak()}
    encoded = json.dumps({"durationMs": round((time.monotonic() - started) * 1000), "pages": output, "resourceUsage": resource_usage}).encode("utf-8")
    if len(encoded) > 4 * 1024 * 1024:
        raise ValueError("output_limit")
    sys.stdout.buffer.write(encoded)


try:
    main()
except Exception:
    # Generic code only; container-owned tmpfs disappears on exact-ID removal.
    sys.exit(1)
