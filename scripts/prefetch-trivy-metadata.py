#!/usr/bin/env python3
"""Fixed public metadata staging only. Never authenticates or executes Trivy."""
import contextlib
import hashlib
import json
import math
import os
from pathlib import Path
import stat
import sys
import threading
import time
from urllib.parse import urljoin, urlsplit

URL = "https://github.com/aquasecurity/trivy/releases/download/v0.76.2/trivy_0.76.2_macOS-ARM64.tar.gz.sigstore.json"
EXPECTED_SHA256 = "82014df63f12ffe65bf49c6fd844d7fe39efa7e7abdc12bfe1f5a69682a56747"
CACHE = Path("/private/tmp/resumide-r18-bundle-metadata-20261109")
MAX_BYTES = 65536
TOTAL_SECONDS = 30
OP_SECONDS = 10
REDIRECT_HOSTS = frozenset(("release-assets.githubusercontent.com", "objects.githubusercontent.com"))
TRUST = "UNTRUSTED_FOR_EXECUTION"


class PrefetchError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def _fail(code):
    raise PrefetchError(code)


def _strict_json(raw):
    if len(raw) > MAX_BYTES:
        _fail("BYTE_LIMIT")
    try:
        text = raw.decode("utf-8", "strict")
    except UnicodeError:
        _fail("JSON_UTF8")
    depth = nodes = 0
    quoted = escaped = primitive = False
    # A bounded lexical preflight, not a replacement JSON parser. In particular,
    # reject deep nesting before the standard parser can recursively allocate it.
    for char in text:
        if quoted:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                quoted = False
            continue
        if char.isspace() or char in ",:":
            primitive = False
        elif char == '"':
            quoted = True
            primitive = False
            nodes += 1
        elif char in "[{":
            depth += 1
            nodes += 1
            primitive = False
            if depth > 32:
                _fail("JSON_LIMIT")
        elif char in "]}":
            depth -= 1
            primitive = False
        elif not primitive:
            primitive = True
            nodes += 1
        if nodes > 4096:
            _fail("JSON_LIMIT")

    def unicode_size(value, limit):
        try:
            size = len(value.encode("utf-8", "strict"))
        except UnicodeError:
            _fail("JSON_UNICODE")
        if size > limit:
            _fail("JSON_LIMIT")

    def pairs(items):
        if len(items) > 128:
            _fail("JSON_LIMIT")
        result = {}
        for key, value in items:
            unicode_size(key, 128)
            if key in result:
                _fail("JSON_DUPLICATE")
            result[key] = value
        return result

    def integer(value):
        if len(value) > 32:
            _fail("JSON_NUMBER")
        parsed = int(value)
        if abs(parsed) > 9007199254740991:
            _fail("JSON_NUMBER")
        return parsed

    def floating(value):
        if len(value) > 32:
            _fail("JSON_NUMBER")
        parsed = float(value)
        if not math.isfinite(parsed):
            _fail("JSON_NUMBER")
        return parsed

    try:
        result = json.loads(text, object_pairs_hook=pairs, parse_int=integer,
                            parse_float=floating,
                            parse_constant=lambda _value: _fail("JSON_NUMBER"))
    except PrefetchError:
        raise
    except (ValueError, RecursionError, OverflowError):
        _fail("JSON_INVALID")

    def bounded(value):
        if isinstance(value, str):
            unicode_size(value, 16384)
        elif isinstance(value, list):
            if len(value) > 128:
                _fail("JSON_LIMIT")
            for item in value:
                bounded(item)
        elif isinstance(value, dict):
            for item in value.values():
                bounded(item)
    bounded(result)
    return result


def _summary(bundle):
    if not isinstance(bundle, dict):
        _fail("METADATA_SHAPE")
    media = bundle.get("mediaType")
    allowed = {"application/vnd.dev.sigstore.bundle+json;version=0.1",
               "application/vnd.dev.sigstore.bundle+json;version=0.2",
               "application/vnd.dev.sigstore.bundle+json;version=0.3",
               "application/vnd.dev.sigstore.bundle.v0.3+json"}
    if not isinstance(media, str) or media not in allowed:
        _fail("METADATA_SHAPE")
    message = bundle.get("messageSignature")
    dsse = bundle.get("dsseEnvelope")
    if (isinstance(message, dict)) == (isinstance(dsse, dict)):
        _fail("METADATA_SHAPE")
    verification = bundle.get("verificationMaterial")
    if not isinstance(verification, dict):
        _fail("METADATA_SHAPE")
    if message is not None:
        digest = message.get("messageDigest")
        if not isinstance(digest, dict) or digest.get("algorithm") != "SHA2_256":
            _fail("METADATA_ALGORITHM")
        if not isinstance(digest.get("digest"), str) or not digest["digest"]:
            _fail("METADATA_SHAPE")
        if not isinstance(message.get("signature"), str) or not message["signature"]:
            _fail("METADATA_SHAPE")
        kind, algorithm = "messageSignature", "SHA2_256"
    else:
        signatures = dsse.get("signatures")
        if not isinstance(signatures, list) or not signatures:
            _fail("METADATA_SHAPE")
        if not any(isinstance(item, dict) and isinstance(item.get("sig"), str)
                   and item["sig"] for item in signatures):
            _fail("METADATA_SHAPE")
        kind, algorithm = "dsseEnvelope", "not_stated"
    certificate = verification.get("certificate")
    chain = verification.get("x509CertificateChain")
    certificates = chain.get("certificates", []) if isinstance(chain, dict) else []
    tlogs = verification.get("tlogEntries", [])
    timestamp_data = verification.get("timestampVerificationData")
    timestamps = timestamp_data.get("rfc3161Timestamps", []) if isinstance(timestamp_data, dict) else []
    if not all(isinstance(items, list) for items in (certificates, tlogs, timestamps)):
        _fail("METADATA_SHAPE")
    return {"mediaType": media, "contentKind": kind, "digestAlgorithm": algorithm,
            "certificatePresent": isinstance(certificate, dict) or bool(certificates),
            "publicKeyHintPresent": isinstance(verification.get("publicKey"), dict),
            "certificateCount": len(certificates), "tlogEntryCount": len(tlogs),
            "rfc3161TimestampCount": len(timestamps), "signaturePresent": True}


class _Deadline:
    def __init__(self, clock, total, operation, watched):
        self.clock = clock
        self.end = clock() + total
        self.operation_seconds = operation
        self.operation_end = None
        self.condition = threading.Condition()
        self.done = False
        self.expired = None
        if watched:
            threading.Thread(target=self._watch, daemon=True).start()

    def _code(self):
        now = self.clock()
        if now >= self.end:
            return "DEADLINE_EXCEEDED"
        if self.operation_end is not None and now >= self.operation_end:
            return "OPERATION_TIMEOUT"
        return None

    def check(self):
        code = self.expired or self._code()
        if code:
            _fail(code)

    def _watch(self):
        with self.condition:
            while not self.done:
                code = self._code()
                if code:
                    self.expired = code
                    break
                target = min(self.end, self.operation_end or self.end)
                self.condition.wait(max(0.001, target - self.clock()))
            else:
                return
        # Never perform potentially blocking receipt/stdout I/O in the killer.
        # Exit 124 invalidates all pending/staged receipts. The caller classifies
        # absent terminal output as HARD_TIMEOUT_UNKNOWN, never metadata success.
        os._exit(124)

    @contextlib.contextmanager
    def operation(self):
        self.check()
        with self.condition:
            self.operation_end = min(self.end, self.clock() + self.operation_seconds)
            timeout = max(0.001, self.operation_end - self.clock())
            self.condition.notify_all()
        try:
            yield timeout
            self.check()
        finally:
            with self.condition:
                self.operation_end = None
                self.condition.notify_all()

    def finish(self):
        with self.condition:
            self.check()
            self.done = True
            self.condition.notify_all()

    def stop(self):
        with self.condition:
            self.done = True
            self.condition.notify_all()


def _regular(fd, mode):
    current = os.fstat(fd)
    if not stat.S_ISREG(current.st_mode) or current.st_uid != os.geteuid() or current.st_nlink != 1 or stat.S_IMODE(current.st_mode) != mode:
        _fail("CACHE_INVALID")
    return current


class _Cache:
    def __init__(self, path):
        self.path = Path(path)
        self.fd = self.parent_fd = None
        self.receipt_lock = threading.Lock()
        self.receipt_identity = None
        if not self.path.is_absolute() or ".." in self.path.parts or len(self.path.parts) > 32:
            _fail("CACHE_INVALID")
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
        parent = os.open("/", flags)
        try:
            for part in self.path.parent.parts[1:]:
                next_fd = os.open(part, flags, dir_fd=parent)
                os.close(parent)
                parent = next_fd
            self.parent_fd = parent
            parent = None
            try:
                os.mkdir(self.path.name, 0o700, dir_fd=self.parent_fd)
            except FileExistsError:
                _fail("CACHE_EXISTS")
            self.fd = os.open(self.path.name, flags, dir_fd=self.parent_fd)
            self.identity = os.fstat(self.fd)
            self.check()
        finally:
            if parent is not None:
                os.close(parent)

    def check(self):
        current = os.stat(self.path.name, dir_fd=self.parent_fd, follow_symlinks=False)
        if (not stat.S_ISDIR(current.st_mode) or current.st_uid != os.geteuid() or
            stat.S_IMODE(current.st_mode) != 0o700 or
            (current.st_dev, current.st_ino) != (self.identity.st_dev, self.identity.st_ino)):
            _fail("CACHE_INVALID")
        if self.receipt_identity is not None:
            r = os.stat("receipt.json", dir_fd=self.fd, follow_symlinks=False)
            if not stat.S_ISREG(r.st_mode) or r.st_nlink != 1 or r.st_uid != os.geteuid() or stat.S_IMODE(r.st_mode) != 0o600 or (r.st_dev,r.st_ino) != self.receipt_identity:
                _fail("CACHE_INVALID")

    def _new(self, name):
        try:
            fd = os.open(name, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=self.fd)
        except FileExistsError:
            _fail("CACHE_OUTPUT_EXISTS")
        _regular(fd, 0o600)
        return fd

    def record(self, value, nonblocking=False):
        if not self.receipt_lock.acquire(blocking=not nonblocking):
            return False
        fd = None
        temporary = "receipt.next.json"
        try:
            self.check()
            initial = self.receipt_identity is None
            fd = self._new(temporary)
            data = json.dumps(value, ensure_ascii=True, allow_nan=False, separators=(",", ":")).encode() + b"\n"
            offset = 0
            while offset < len(data):
                offset += os.write(fd, data[offset:])
            os.fsync(fd)
            current = _regular(fd, 0o600)
            if initial:
                try:
                    os.link(temporary, "receipt.json", src_dir_fd=self.fd,
                            dst_dir_fd=self.fd, follow_symlinks=False)
                except FileExistsError:
                    _fail("CACHE_OUTPUT_EXISTS")
                os.unlink(temporary, dir_fd=self.fd)
                _regular(fd, 0o600)
            else:
                self.check()
                os.replace(temporary, "receipt.json", src_dir_fd=self.fd, dst_dir_fd=self.fd)
            self.receipt_identity = (current.st_dev, current.st_ino)
            os.fsync(self.fd)
            return True
        finally:
            if fd is not None:
                os.close(fd)
            self.receipt_lock.release()

    def publish(self, data, digest):
        self.check()
        fd = self._new("bundle.partial")
        identity = os.fstat(fd)
        try:
            offset = 0
            while offset < len(data):
                offset += os.write(fd, data[offset:])
            os.fsync(fd)
            os.lseek(fd, 0, os.SEEK_SET)
            readback = b""
            while True:
                part = os.read(fd, min(16384, MAX_BYTES + 1 - len(readback)))
                if not part:
                    break
                readback += part
                if len(readback) > MAX_BYTES:
                    _fail("BYTE_LIMIT")
            _regular(fd, 0o600)
            if len(readback) != len(data) or hashlib.sha256(readback).hexdigest() != digest:
                _fail("CACHE_INVALID")
            self.check()
            os.fchmod(fd, 0o444)
            os.fsync(fd)
            try:
                os.link("bundle.partial", "bundle.sigstore.json", src_dir_fd=self.fd, dst_dir_fd=self.fd, follow_symlinks=False)
            except FileExistsError:
                _fail("CACHE_OUTPUT_EXISTS")
            linked = os.stat("bundle.sigstore.json", dir_fd=self.fd, follow_symlinks=False)
            if (linked.st_dev,linked.st_ino) != (identity.st_dev,identity.st_ino):
                _fail("CACHE_INVALID")
            os.unlink("bundle.partial", dir_fd=self.fd)
            _regular(fd, 0o444)
            os.fsync(self.fd)
        finally:
            try:
                partial = os.stat("bundle.partial", dir_fd=self.fd, follow_symlinks=False)
                if (partial.st_dev,partial.st_ino) == (identity.st_dev,identity.st_ino):
                    os.unlink("bundle.partial", dir_fd=self.fd)
            except FileNotFoundError:
                partial = None
            os.close(fd)

    def close(self):
        for fd in (self.fd, self.parent_fd):
            if fd is not None:
                os.close(fd)


class _LineLimitedFile:
    def __init__(self, stream):
        self.stream = stream
        self.bytes = 0
    def readline(self, size=-1):
        line = self.stream.readline(min(size, 8193) if size >= 0 else 8193)
        self.bytes += len(line)
        if len(line) > 8192 or self.bytes > 32768:
            _fail("HEADER_LIMIT")
        return line
    def __getattr__(self, name):
        return getattr(self.stream, name)


class _Transport:
    def request(self, url, timeout):
        # Direct stdlib HTTPS, without proxy, cookie, netrc or auth handlers.
        import http.client
        import ssl
        parsed = urlsplit(url)
        class LimitedResponse(http.client.HTTPResponse):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self.fp = _LineLimitedFile(self.fp)
        connection = http.client.HTTPSConnection(parsed.hostname, port=443, timeout=timeout, context=ssl.create_default_context())
        connection.response_class = LimitedResponse
        try:
            connection.request("GET", parsed.path + ("?" + parsed.query if parsed.query else ""), headers={"Accept":"application/json", "Accept-Encoding":"identity", "Connection":"close", "User-Agent":"resumide-public-metadata/1.0"})
            response = connection.getresponse()
        except BaseException as error:
            connection.close()
            if isinstance(error, http.client.HTTPException):
                raise PrefetchError("NETWORK_PROTOCOL") from None
            raise
        class Reply:
            status = response.status
            headers = response.getheaders()
            def read(self, n):
                return response.read(n)
            def close(self):
                response.close()
                connection.close()
        return Reply()


def _redirect(current, location):
    if not isinstance(location, str) or not location or len(location) > 8192 or any(ord(c) < 32 or ord(c) == 127 for c in location):
        _fail("REDIRECT_POLICY")
    try:
        target = urljoin(current, location)
        parsed = urlsplit(target)
        if parsed.scheme != "https" or parsed.hostname not in REDIRECT_HOSTS or parsed.port not in (None,443) or parsed.username is not None or parsed.password is not None or parsed.fragment:
            _fail("REDIRECT_POLICY")
    except (ValueError, UnicodeError):
        _fail("REDIRECT_POLICY")
    return target


def _headers(response):
    selected = {}
    for key, value in response.headers:
        key = key.lower()
        if key in ("location", "content-length", "content-encoding", "transfer-encoding"):
            if key in selected or not isinstance(value, str):
                _fail("HEADER_INVALID")
            selected[key] = value
    if selected.get("content-encoding", "identity").lower() != "identity":
        _fail("HEADER_INVALID")
    transfer = selected.get("transfer-encoding")
    if transfer is not None and (transfer.lower() != "chunked" or "content-length" in selected):
        _fail("HEADER_INVALID")
    if "content-length" in selected:
        length = selected["content-length"]
        if not length.isascii() or not length.isdecimal() or len(length) > 10:
            _fail("HEADER_INVALID")
        if int(length) > MAX_BYTES:
            _fail("BYTE_LIMIT")
    return selected


def _fetch(transport, deadline, state):
    current = URL
    while True:
        response = None
        try:
            with deadline.operation() as timeout:
                state["httpExchanges"] += 1
                state["networkAttempts"] = "one transport chain"
                response = transport.request(current, timeout)
            headers = _headers(response)
            if response.status in (301,302,303,307,308):
                if state["redirectCount"] >= 3:
                    _fail("REDIRECT_LIMIT")
                current = _redirect(current, headers.get("location"))
                state["redirectCount"] += 1
                continue
            if response.status != 200:
                _fail("HTTP_STATUS")
            data = bytearray()
            while True:
                with deadline.operation():
                    chunk = response.read(min(16384, MAX_BYTES + 1 - len(data)))
                if not isinstance(chunk, bytes):
                    _fail("NETWORK_BODY")
                if not chunk:
                    break
                data.extend(chunk)
                state["bytes"] = len(data)
                if len(data) > MAX_BYTES:
                    _fail("BYTE_LIMIT")
            if "content-length" in headers and len(data) != int(headers["content-length"]):
                _fail("NETWORK_BODY")
            return bytes(data)
        finally:
            if response is not None:
                with deadline.operation():
                    response.close()


def _base():
    return {"schemaVersion":"r18-public-metadata/1.0.0", "status":"IN_PROGRESS", "trustState":TRUST,
            "url":URL, "expectedSha256":EXPECTED_SHA256, "actualSha256":None,
            "bytes":0, "httpExchanges":0, "redirectCount":0, "networkAttempts":"none",
            "signatureVerified":False, "scannerExecuted":False, "tufFetched":False,
            "requiresNormalExitZero":True}


def _emit(value):
    os.write(1, json.dumps(value, ensure_ascii=True, allow_nan=False, separators=(",", ":")).encode() + b"\n")


def _fetch_and_stage(transport, cache_dir, expected_sha256, *, _clock=time.monotonic, _watchdog=True, _total_limit=TOTAL_SECONDS, _operation_limit=OP_SECONDS):
    # Internal injection points exist only for offline tests. The production CLI
    # always passes the fixed constants, real transport/clock and hard watchdog.
    state = _base()
    state["expectedSha256"] = expected_sha256
    started = _clock()
    cache = deadline = None
    phase = "cache"
    try:
        deadline = _Deadline(_clock, _total_limit, _operation_limit, _watchdog)
        with deadline.operation():
            cache = _Cache(cache_dir)
            cache.record(state)
        phase = "network"
        data = _fetch(transport, deadline, state)
        phase = "validation"
        digest = hashlib.sha256(data).hexdigest()
        state["actualSha256"] = digest
        if digest != expected_sha256:
            _fail("HASH_MISMATCH")
        state["metadata"] = _summary(_strict_json(data))
        phase = "cache"
        with deadline.operation():
            cache.publish(data, expected_sha256)
        state["status"] = "METADATA_STAGED_UNTRUSTED"
        state["elapsedMs"] = max(0,round((_clock()-started)*1000))
        with deadline.operation():
            cache.record(state)
        deadline.finish()
        return state
    except Exception as error:
        code = error.code if isinstance(error, PrefetchError) else "CACHE_IO" if isinstance(error, OSError) and phase == "cache" else "OPERATION_TIMEOUT" if isinstance(error, TimeoutError) else "NETWORK_ERROR" if isinstance(error, OSError) and phase == "network" else "SOURCE_ERROR"
        state.update(status="FAILED", errorCode=code, elapsedMs=max(0,round((_clock()-started)*1000)))
        if cache is not None:
            try:
                state["receiptUpdated"] = cache.record(state)
            except Exception:
                state["receiptUpdated"] = False
        return state
    finally:
        if deadline is not None:
            deadline.stop()
        if cache is not None:
            cache.close()


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if args == ["--help"]:
        _emit({"status":"USAGE", "command":"--fetch-bundle-metadata", "trustState":TRUST})
        return 0
    if args != ["--fetch-bundle-metadata"]:
        _emit({"status":"FAILED", "errorCode":"BAD_ARGUMENTS", "trustState":TRUST})
        return 2
    if not sys.flags.isolated or not sys.flags.no_site:
        _emit({"status":"FAILED", "errorCode":"RUNTIME_ISOLATION_REQUIRED", "trustState":TRUST})
        return 2
    home = os.environ.get("HOME")
    os.environ.clear()
    os.environ["PATH"] = "/opt/homebrew/bin:/usr/bin:/bin"
    if home is not None:
        os.environ["HOME"] = home
    result = _fetch_and_stage(_Transport(), CACHE, EXPECTED_SHA256)
    _emit(result)
    return 0 if result["status"] == "METADATA_STAGED_UNTRUSTED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
