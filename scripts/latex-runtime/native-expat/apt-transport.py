"""Preseed native APT's exact signed package plan from official HTTPS pool bytes."""
import concurrent.futures
import hashlib
import io
import json
import os
import pathlib
import re
import shlex
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request

MAX_FILE = 32 * 1024 * 1024
MAX_TOTAL = 256 * 1024 * 1024
PREFIXES = {
    "http://snapshot.debian.org/archive/debian/20261106T000000Z/":
        ("https://deb.debian.org/debian/", "pool/main/"),
    "http://snapshot.debian.org/archive/debian-security/20261106T000000Z/":
        ("https://deb.debian.org/debian-security/", "pool/updates/main/"),
}


def parse(line):
    fields = shlex.split(line)
    if len(fields) != 4:
        raise ValueError("unexpected native APT URI record")
    uri, filename, size_text, checksum = fields
    decoded = urllib.parse.unquote(filename)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.+%:~_-]*\.deb", filename) or "/" in decoded or "\\" in decoded:
        raise ValueError("unsafe native APT archive filename")
    if not size_text.isdecimal() or not 0 < int(size_text) <= MAX_FILE:
        raise ValueError("APT size bound exceeded")
    if not re.fullmatch(r"SHA256:[0-9a-f]{64}", checksum):
        raise ValueError("native APT must supply SHA256")
    for prefix, (cdn, pool) in PREFIXES.items():
        if uri.startswith(prefix):
            relative = uri[len(prefix):]
            path = urllib.parse.unquote(relative)
            parsed = urllib.parse.urlsplit(uri)
            if (not path.startswith(pool) or not path.endswith(".deb")
                    or ".." in path.split("/") or "\\" in path
                    or parsed.query or parsed.fragment or any(ord(c) < 33 for c in path)):
                raise ValueError("unexpected signed snapshot pool path")
            return {"snapshotUri": uri, "url": cdn + relative, "filename": filename,
                    "size": int(size_text), "sha256": checksum.removeprefix("SHA256:")}
    raise ValueError("unexpected snapshot host/date")


def copy_verified(stream, output, item, deadline):
    digest = hashlib.sha256()
    size = 0
    while True:
        if time.monotonic() > deadline:
            raise TimeoutError("archive transfer deadline exceeded")
        block = stream.read(min(65536, item["size"] - size + 1))
        if not block:
            break
        size += len(block)
        if size > item["size"]:
            raise ValueError("archive exceeds signed size")
        digest.update(block)
        output.write(block)
    if size != item["size"] or digest.hexdigest() != item["sha256"]:
        raise ValueError("archive signed hash/size mismatch")


class OfficialRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, url):
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != "https" or parsed.netloc != "deb.debian.org" or parsed.query or parsed.fragment:
            raise ValueError("unexpected CDN redirect")
        return super().redirect_request(request, file, code, message, headers, url)


def fetch(item, cache, deadline):
    if time.monotonic() > deadline:
        raise TimeoutError("package plan transfer deadline exceeded")
    path = cache / item["filename"]
    if path.is_symlink():
        raise ValueError("APT archive target is a symlink")
    temporary = None
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), OfficialRedirect())
        with opener.open(item["url"], timeout=15) as response:
            with tempfile.NamedTemporaryFile(dir=cache, prefix=".resumide-", delete=False) as output:
                temporary = pathlib.Path(output.name)
                copy_verified(response, output, item, min(deadline, time.monotonic() + 45))
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
        return dict(item, verified=True)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def main(targets):
    if not targets or any(not re.fullmatch(r"[a-z0-9][a-z0-9+.-]*(?:=[A-Za-z0-9.+:~_-]+)?", target) for target in targets):
        raise ValueError("unexpected package target")
    command = ["apt-get", "-qq", "-o", "Acquire::ForceHash=SHA256", "--print-uris",
               "--download-only", "--assume-yes", "--no-install-recommends", "install", *targets]
    result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=30)
    if len(result.stdout.encode()) > 1024 * 1024:
        raise ValueError("native APT plan output bound exceeded")
    plan = [parse(line) for line in result.stdout.splitlines() if line.strip()]
    if not 0 < len(plan) <= 256 or len({p["filename"] for p in plan}) != len(plan):
        raise ValueError("empty, duplicate or excessive native APT plan")
    if sum(p["size"] for p in plan) > MAX_TOTAL:
        raise ValueError("native APT total byte bound exceeded")
    cache = pathlib.Path("/var/cache/apt/archives")
    cache.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + 300
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        verified = list(pool.map(lambda item: fetch(item, cache, deadline), plan))
    receipt = {"schemaVersion": "resumide-native-apt-transport/1", "command": command,
               "signedMetadataSelectionUnchanged": True, "normalAptRevalidationRequired": True,
               "bytes": sum(p["size"] for p in plan), "packages": verified}
    pathlib.Path("/recipe/build-dependency-transport.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({"verifiedAptArchives": len(verified), "bytes": receipt["bytes"]}))


def self_test():
    uri = "http://snapshot.debian.org/archive/debian/20261106T000000Z/pool/main/e/expat/a.deb"
    line = "'" + uri + "' a_1%3a1.0_arm64.deb 3 SHA256:" + hashlib.sha256(b"abc").hexdigest()
    item = parse(line)
    assert item["url"] == "https://deb.debian.org/debian/pool/main/e/expat/a.deb"
    for bad in (line.replace("snapshot.debian.org", "invalid.example"),
                line.replace("20261106", "20261107"), line.replace("pool/main", "etc"),
                line.replace("/a.deb", "/../a.deb"), line.replace(" a_1", " ../a_1"),
                line.replace("SHA256:", "MD5Sum:"), line.replace(" 3 SHA", " -1 SHA"),
                line.replace(" 3 SHA", " 999999999 SHA")):
        try:
            parse(bad)
        except ValueError:
            pass
        else:
            raise AssertionError("unsafe plan accepted")
    copy_verified(io.BytesIO(b"abc"), io.BytesIO(), item, time.monotonic() + 1)
    for bad in (b"abd", b"abcd", b"ab"):
        try:
            copy_verified(io.BytesIO(bad), io.BytesIO(), item, time.monotonic() + 1)
        except ValueError:
            pass
        else:
            raise AssertionError("corrupt archive accepted")
    print("native APT transport rejection tests passed")


if __name__ == "__main__":
    self_test() if sys.argv[1:] == ["--self-test"] else main(sys.argv[1:])
