"""Verify/stage one pinned public source asset; offline unless --fetch is explicit."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import tempfile
import time
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

EXPECTED_NAME = "expat-2.10.0.tar.xz"
EXPECTED_URL = "https://github.com/libexpat/libexpat/releases/download/R_2_10_0/" + EXPECTED_NAME
EXPECTED_SIZE = 543404
EXPECTED_SHA256 = "c624ba2998fc65df1163a49641ff3f9ab73138b11641d92c86bee0fb01b1bc7f"
ERROR_CODES = {
    "pin_mismatch", "manifest_unavailable", "url_not_allowed", "redirect_limit",
    "cache_path_unsafe", "cache_missing", "cache_writable", "size_mismatch",
    "hash_mismatch", "transport_failed", "deadline_exceeded", "deadline_conflict",
    "unsupported_runtime", "invalid_arguments", "io_failed", "interrupted", "internal_error",
}


class AssetError(Exception):
    def __init__(self, code: str, attempts: int = 0):
        self.code = code if code in ERROR_CODES else "internal_error"
        self.attempts = attempts
        super().__init__(self.code)


@dataclass(frozen=True)
class Asset:
    name: str
    url: str
    size: int
    sha256: str


def asset_from_pins(pins: dict) -> Asset:
    matches = [item for item in pins.get("inputs", []) if isinstance(item, dict) and item.get("name") == EXPECTED_NAME]
    if (pins.get("upstreamVersion") != "2.10.0" or len(matches) != 1
            or tuple(matches[0].get(key) for key in ("name", "url", "size", "sha256"))
            != (EXPECTED_NAME, EXPECTED_URL, EXPECTED_SIZE, EXPECTED_SHA256)):
        raise AssetError("pin_mismatch")
    return Asset(EXPECTED_NAME, EXPECTED_URL, EXPECTED_SIZE, EXPECTED_SHA256)


def load_asset() -> Asset:
    try:
        path = Path(__file__).parent / "native-expat" / "pins.json"
        if path.stat().st_size > 131072:
            raise AssetError("manifest_unavailable")
        return asset_from_pins(json.loads(path.read_text()))
    except AssetError:
        raise
    except Exception:
        raise AssetError("manifest_unavailable") from None


def validate_url(url: str, *, initial: bool):
    try:
        parsed = urlsplit(url)
        if (parsed.scheme != "https" or parsed.port not in (None, 443)
                or parsed.username is not None or parsed.password is not None or parsed.fragment):
            raise ValueError()
        if initial:
            allowed = url == EXPECTED_URL
        else:
            allowed = url == EXPECTED_URL or (
                parsed.hostname == "release-assets.githubusercontent.com"
                and parsed.path.startswith("/github-production-release-asset/80314213/")
            )
        if not allowed:
            raise ValueError()
    except Exception:
        raise AssetError("url_not_allowed") from None


class _RedirectPolicy(HTTPRedirectHandler):
    def __init__(self):
        super().__init__()
        self.redirects = 0

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl, initial=False)
        self.redirects += 1
        if self.redirects > 3:
            raise AssetError("redirect_limit")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


@contextmanager
def _deadline(seconds: float, attempts: int = 1):
    if not hasattr(signal, "setitimer") or seconds <= 0 or seconds > 45:
        raise AssetError("unsupported_runtime")
    if signal.getitimer(signal.ITIMER_REAL)[0] != 0:
        raise AssetError("deadline_conflict")
    previous = signal.getsignal(signal.SIGALRM)

    def expired(_signal, _frame):
        raise AssetError("deadline_exceeded", attempts)

    signal.signal(signal.SIGALRM, expired)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


def _safe_directory(path: Path) -> Path:
    try:
        metadata = path.lstat()
        if (not stat.S_ISDIR(metadata.st_mode) or path.is_symlink()
                or metadata.st_uid != os.getuid() or metadata.st_mode & 0o022):
            raise AssetError("cache_path_unsafe")
        return path.resolve(strict=True)
    except AssetError:
        raise
    except Exception:
        raise AssetError("cache_path_unsafe") from None


def _verify(path: Path, asset: Asset):
    try:
        # Refuse special files before opening; O_NONBLOCK also closes a FIFO swap race.
        if not stat.S_ISREG(path.lstat().st_mode):
            raise AssetError("cache_path_unsafe")
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as stream:
            metadata = os.fstat(stream.fileno())
            if not stat.S_ISREG(metadata.st_mode):
                raise AssetError("cache_path_unsafe")
            if metadata.st_mode & 0o222:
                raise AssetError("cache_writable")
            if metadata.st_size != asset.size:
                raise AssetError("size_mismatch")
            payload = stream.read(asset.size + 1)
            if len(payload) != asset.size:
                raise AssetError("size_mismatch")
            if hashlib.sha256(payload).hexdigest() != asset.sha256:
                raise AssetError("hash_mismatch")
    except AssetError:
        raise
    except FileNotFoundError:
        raise AssetError("cache_missing") from None
    except Exception:
        raise AssetError("cache_path_unsafe") from None


def stage_asset(asset: Asset, cache_dir: Path, *, fetch=False, opener=None, deadline_seconds=45):
    validate_url(asset.url, initial=True)
    if asset.name != EXPECTED_NAME or not re.fullmatch(r"[a-f0-9]{64}", asset.sha256) or not 0 < asset.size <= EXPECTED_SIZE:
        raise AssetError("pin_mismatch")
    root = _safe_directory(cache_dir)
    directory = root / asset.sha256
    target = directory / asset.name
    if directory.exists() or directory.is_symlink():
        directory = _safe_directory(directory)
        if target.exists() or target.is_symlink():
            with _deadline(deadline_seconds, attempts=0):
                _verify(target, asset)
            return _receipt(asset, "cache", 0)
    if not fetch:
        raise AssetError("cache_missing")
    directory.mkdir(mode=0o700, exist_ok=True)
    _safe_directory(directory)
    partial = None
    try:
        # No ambient proxy authentication, cookies, authorization, or retries.
        transport = opener or build_opener(ProxyHandler({}), _RedirectPolicy())
        request = Request(asset.url, headers={"User-Agent": "Resumide-verified-source/1", "Accept": "application/octet-stream", "Accept-Encoding": "identity"})
        with _deadline(deadline_seconds):
            with transport.open(request, timeout=min(10, deadline_seconds)) as response:
                validate_url(response.geturl(), initial=False)
                length_header = response.headers.get("Content-Length")
                if length_header is not None and int(length_header) != asset.size:
                    raise AssetError("size_mismatch", 1)
                if response.headers.get("Content-Encoding", "identity") not in ("identity", ""):
                    raise AssetError("transport_failed", 1)
                fd, name = tempfile.mkstemp(prefix=".partial-", dir=directory)
                partial = Path(name)
                digest = hashlib.sha256()
                length = 0
                with os.fdopen(fd, "wb") as output:
                    while length < asset.size + 1:
                        chunk = response.read(min(65536, asset.size + 1 - length))
                        if not chunk:
                            break
                        length += len(chunk)
                        if length > asset.size:
                            raise AssetError("size_mismatch", 1)
                        digest.update(chunk)
                        output.write(chunk)
                    if length != asset.size:
                        raise AssetError("size_mismatch", 1)
                    if digest.hexdigest() != asset.sha256:
                        raise AssetError("hash_mismatch", 1)
                    output.flush()
                    os.fsync(output.fileno())
                    os.fchmod(output.fileno(), 0o444)
                try:
                    os.link(partial, target)
                except FileExistsError:
                    _verify(target, asset)
                _verify(target, asset)
        return _receipt(asset, "download", 1)
    except AssetError as error:
        error.attempts = 1
        raise
    except Exception:
        raise AssetError("transport_failed", 1) from None
    finally:
        if partial is not None:
            partial.unlink(missing_ok=True)


def _receipt(asset: Asset, source: str, attempts: int):
    return {"status": "verified", "source": source, "asset": asset.name, "relativePath": asset.sha256 + "/" + asset.name, "bytes": asset.size, "sha256": asset.sha256, "networkAttempts": attempts, "networkAttemptsUnit": "transport_chain"}


class _Arguments(argparse.ArgumentParser):
    def error(self, message):
        raise AssetError("invalid_arguments")


def main():
    parser = _Arguments(prog="prefetch-inputs", description=__doc__)
    parser.add_argument("--cache-dir", required=True)
    parser.add_argument("--fetch", action="store_true")
    started = time.monotonic()
    try:
        args = parser.parse_args()
        result = stage_asset(load_asset(), Path(args.cache_dir), fetch=args.fetch)
        result["durationMs"] = round((time.monotonic() - started) * 1000)
        print(json.dumps(result, separators=(",", ":")))
        return 0
    except AssetError as error:
        print(json.dumps({"status": "failed", "code": error.code, "networkAttempts": error.attempts, "networkAttemptsUnit": "transport_chain"}, separators=(",", ":")))
        return 1
    except KeyboardInterrupt:
        print('{"status":"failed","code":"interrupted","networkAttempts":1,"networkAttemptsUnit":"transport_chain"}')
        return 1
    except Exception:
        print('{"status":"failed","code":"internal_error","networkAttempts":0,"networkAttemptsUnit":"transport_chain"}')
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
