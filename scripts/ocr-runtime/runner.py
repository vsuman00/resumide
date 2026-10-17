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


def main():
    if len(sys.argv) not in [2, 4] or not re.fullmatch(r"[1-9][0-9]*(,[1-9][0-9]*){0,9}", sys.argv[1]):
        raise ValueError("pages")
    psm, max_dpi = "3", 300
    if len(sys.argv) == 4:
        if sys.argv[2] not in ["3", "6"] or sys.argv[3] not in ["150", "300"]:
            raise ValueError("config")
        psm, max_dpi = sys.argv[2], int(sys.argv[3])
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
        tsv = execute(["tesseract", "/scratch/page.png", "stdout", "-l", "eng", "--psm", psm, "tsv"]).decode("utf-8")
        words = []
        text = ""
        previous_line = None
        for row in csv.DictReader(io.StringIO(tsv), delimiter="\t"):
            if row["level"] != "5" or not row["text"].strip():
                continue
            line = (row["block_num"], row["par_num"], row["line_num"])
            if text:
                text += " " if line == previous_line else "\n"
            start = len(text)
            text += row["text"]
            left, top, box_width, box_height = [int(row[key]) for key in ["left", "top", "width", "height"]]
            confidence = float(row["conf"])
            if not math.isfinite(confidence) or not 0 <= confidence <= 100 or min(left, top) < 0 or min(box_width, box_height) <= 0 or left + box_width > width or top + box_height > height:
                raise ValueError("geometry")
            words.append({"text": row["text"], "start": start, "end": len(text), "confidence": confidence,
                          "box": {"x": left / width, "y": top / height, "width": box_width / width, "height": box_height / height}})
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
