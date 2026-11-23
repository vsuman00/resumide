"""Materialize only the reviewed local OCI probe base; no network or Docker operations."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import asdict, dataclass
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import sys
import tarfile
import tempfile

INDEX_TYPE = "application/vnd.oci.image.index.v1+json"
MANIFEST_TYPE = "application/vnd.oci.image.manifest.v1+json"
CONFIG_TYPE = "application/vnd.oci.image.config.v1+json"
LAYER_TYPE = "application/vnd.oci.image.layer.v1.tar+gzip"
RUNTIME_FIELDS = ("User", "Env", "Entrypoint", "Cmd", "WorkingDir", "Labels", "ExposedPorts", "Volumes", "StopSignal", "Healthcheck")
ERRORS = {"invalid_arguments", "input_unsafe", "archive_mismatch", "receipt_mismatch", "receipt_invalid", "archive_member_unsafe", "archive_members_mismatch", "member_mismatch", "metadata_invalid", "descriptor_unsafe", "config_mismatch", "diff_id_mismatch", "compressed_limit", "uncompressed_limit", "approval_mismatch", "output_unsafe", "materialization_failed", "cleanup_unknown", "deadline_exceeded", "deadline_conflict", "unsupported_runtime", "disk_limit", "input_changed", "output_changed", "operation_failed"}


class LayoutError(Exception):
    def __init__(self, code):
        self.code = code if code in ERRORS else "operation_failed"
        super().__init__(self.code)


@dataclass(frozen=True)
class Layer:
    digest: str
    size: int
    diff_id: str
    uncompressed_size: int


@dataclass(frozen=True)
class Policy:
    original_index: str
    archive_size: int
    archive_sha256: str
    manifest: str
    config: str
    members: tuple[tuple[str, int, str], ...]
    layers: tuple[Layer, ...]
    export_receipt_sha256: str
    derivation_receipt_sha256: str


@dataclass(frozen=True)
class Limits:
    archive_bytes: int = 128 * 1024 * 1024
    compressed_bytes: int = 128 * 1024 * 1024
    uncompressed_bytes: int = 512 * 1024 * 1024
    member_bytes: int = 64 * 1024 * 1024
    metadata_bytes: int = 64 * 1024
    members: int = 64
    deadline_seconds: float = 45
    disk_reserve_bytes: int = 64 * 1024 * 1024


LIMITS = Limits()
_PINNED_LAYERS = (
    Layer('333125b5cee9fb6718bdcb523fc93b4adc71b7c37ada6146a20c193430e549b9', 28123680, '055ab12bd547e17a0630037f06a186cf405e3f61bb03a614562ca8f5ab52a8be', 100239360),
    Layer('88b85d9825a04ced0c3d022f83508d9e949791eb78a25bcd7281f1d4a2c1bf50', 55299536, '53eac9afca450c263b4f983a4f680db2404ed1da786a0a55b8be9582e542d785', 146235392),
    Layer('091058d40cb8ec56c3681bb9c30dcedb45981160e4aeeffc811209ab61631d38', 12805092, '4819c2154ab2f2cf75a5dc50a227d9df7490c507c4eda4b7b7eeb7158fd83319', 15403520),
    Layer('baefa9192ed8a4c1f842b0da92b7c5543e2c07ea3266d4a9d52efa49f036d788', 3698, '6b054f1dc6d86ff54808a8268496d65094b704defb58a96c5144c0a788b1b3c4', 12800),
    Layer('7902d098e5b38a6c2c6080f064cbc1797a2cfd604cd70e8d32f88203d53ed916', 120, '399bce8b8cb4d86d63d4430d40ee255dd4adaf0a78782bcd59bbb449ed4703cc', 2048),
    Layer('3dd075aef49274eaf8acc340bd18649abf9ee4f4f67f669ade4f3ef38c890863', 4072, 'c54976ccbf8c33d86a1dbae76ef0e8928f02f12b67664270f73b52845eda6863', 13824),
    Layer('4f4fb700ef54461cfa02571ae0db9a0dc1e0cdb5577484a6d75e68dc38e8acc1', 32, '5f70bf18a086007016e948b04aed3b82103a36bea41755b6cddfaf10ace3c6ef', 1024),
    Layer('4f4fb700ef54461cfa02571ae0db9a0dc1e0cdb5577484a6d75e68dc38e8acc1', 32, '5f70bf18a086007016e948b04aed3b82103a36bea41755b6cddfaf10ace3c6ef', 1024),
)
_PINNED_MEMBERS = {
    "oci-layout": (30, "18f0797eab35a4597c1e9624aa4f15fd91f6254e5538c1e0d193b2a95dd4acc6"),
    "index.json": (290, "9db64525688bf2790e0c748f2c396491b89ad4093c3e7ece889300001963db04"),
    "manifest.json": (759, "717aa04c19f9b028e30871871548af2b1e7a401c602de4c3a6346ba7582c307d"),
    "blobs/sha256/92d09e80a88e72d1dde96543b80c67a3b29ba1bbf9b18bb04e87c0b2e234a03f": (1808, "92d09e80a88e72d1dde96543b80c67a3b29ba1bbf9b18bb04e87c0b2e234a03f"),
    "blobs/sha256/b6d5c39fd0b861309ea4c6ec09900b10cc4e0d1b24399814b6dd094a39c06dcc": (3922, "b6d5c39fd0b861309ea4c6ec09900b10cc4e0d1b24399814b6dd094a39c06dcc"),
    **{"blobs/sha256/" + layer.digest: (layer.size, layer.digest) for layer in _PINNED_LAYERS},
}
PINNED = Policy(
    "sha256:ab1d5c0fab7533a23584bd533df8459fdf2090fb27fbabe3355bbc7fb750b58c",
    96254464, "137b0b6b0f6aa97485f0abcc7a514aa2935e9d44660071887f633f005639499d",
    "92d09e80a88e72d1dde96543b80c67a3b29ba1bbf9b18bb04e87c0b2e234a03f",
    "b6d5c39fd0b861309ea4c6ec09900b10cc4e0d1b24399814b6dd094a39c06dcc",
    tuple((name, size, digest) for name, (size, digest) in sorted(_PINNED_MEMBERS.items())), _PINNED_LAYERS,
    "b1d18a76310fcdf48d71ce4148b9e7b3fcec490404bf4fa2dd69ac8add879e5b",
    "1f258405e1be4db0392add3e13fd22ab12d66831c0a76d4609bb212fed49e910",
)


# Bound to the November 22 synthetic ARM64 worker export and derivation receipts.
CURRENT = Policy(
    'sha256:6cbc1be0d1580b3c8ecc50dc68d14750995f0d766995779ffd3a09c40b1c9854',
    96254976, '12fe7bfb96e0f40d8e14b3fb82ad9690e8588877da26360adc37ee996dd648e4',
    '8829fd735519259880d845285b55ad24fba0ef2b16cc8c2d69f32a692870488a',
    '80d071b63b18d7fdff4cbb5a0f4b82501590b0df3134206f037bf567f33d62ae',
    (
        ('blobs/sha256/2457111128d027762dee3a027505e7f747a83a824e3a3a2236f5999c9e79d541', 55299737, '2457111128d027762dee3a027505e7f747a83a824e3a3a2236f5999c9e79d541'),
        ('blobs/sha256/333125b5cee9fb6718bdcb523fc93b4adc71b7c37ada6146a20c193430e549b9', 28123680, '333125b5cee9fb6718bdcb523fc93b4adc71b7c37ada6146a20c193430e549b9'),
        ('blobs/sha256/4f4fb700ef54461cfa02571ae0db9a0dc1e0cdb5577484a6d75e68dc38e8acc1', 32, '4f4fb700ef54461cfa02571ae0db9a0dc1e0cdb5577484a6d75e68dc38e8acc1'),
        ('blobs/sha256/4f60dc4d104d717c703af4e2ec89621a4897a644b001e491d3ba99c8374c6612', 4072, '4f60dc4d104d717c703af4e2ec89621a4897a644b001e491d3ba99c8374c6612'),
        ('blobs/sha256/744a6d50187965cc34f62a868b6b090defa1de3229c0e35bf657ad6b24255742', 12805092, '744a6d50187965cc34f62a868b6b090defa1de3229c0e35bf657ad6b24255742'),
        ('blobs/sha256/7fa460e41b9a429856a51e771eb84e7bd31b1b95b642a72d9f5177160984b979', 120, '7fa460e41b9a429856a51e771eb84e7bd31b1b95b642a72d9f5177160984b979'),
        ('blobs/sha256/80d071b63b18d7fdff4cbb5a0f4b82501590b0df3134206f037bf567f33d62ae', 3924, '80d071b63b18d7fdff4cbb5a0f4b82501590b0df3134206f037bf567f33d62ae'),
        ('blobs/sha256/8829fd735519259880d845285b55ad24fba0ef2b16cc8c2d69f32a692870488a', 1808, '8829fd735519259880d845285b55ad24fba0ef2b16cc8c2d69f32a692870488a'),
        ('blobs/sha256/ff18f095fa435ba365d99b9cb7175e2af8d665c262682c9002c80887266f6212', 3697, 'ff18f095fa435ba365d99b9cb7175e2af8d665c262682c9002c80887266f6212'),
        ('index.json', 290, 'f1c1cfe0d6162cc14c56eda8975797e26311f7c600abdf482a16082f000ba5b9'),
        ('manifest.json', 759, '7491cb4c6e4025aa41575b1a77cd12177008e25c3207cf978621de0981d1ef32'),
        ('oci-layout', 30, '18f0797eab35a4597c1e9624aa4f15fd91f6254e5538c1e0d193b2a95dd4acc6'),
    ),
    (
        Layer('333125b5cee9fb6718bdcb523fc93b4adc71b7c37ada6146a20c193430e549b9', 28123680, '055ab12bd547e17a0630037f06a186cf405e3f61bb03a614562ca8f5ab52a8be', 100239360),
        Layer('2457111128d027762dee3a027505e7f747a83a824e3a3a2236f5999c9e79d541', 55299737, '784bfa991096b8915ddecf44997bccdb7d86f551a986a885f08648e2c6e72079', 146235392),
        Layer('744a6d50187965cc34f62a868b6b090defa1de3229c0e35bf657ad6b24255742', 12805092, 'bb406c5d509d64f5d78f262d9b12893a990db29d7fe065f9aa8db5b268827b58', 15403520),
        Layer('ff18f095fa435ba365d99b9cb7175e2af8d665c262682c9002c80887266f6212', 3697, '284948eae30275ca88c7981812c015be7bd97c171a6c77c699fdc3e101a677d9', 12800),
        Layer('7fa460e41b9a429856a51e771eb84e7bd31b1b95b642a72d9f5177160984b979', 120, '4ea6a3507966ab335f1308a90ccc8e020c6e9763336c33aa442b0caae3eceb70', 2048),
        Layer('4f60dc4d104d717c703af4e2ec89621a4897a644b001e491d3ba99c8374c6612', 4072, '9e663846672097f17afb01753d718637daab24617c79cc0246e622e710b50582', 13824),
        Layer('4f4fb700ef54461cfa02571ae0db9a0dc1e0cdb5577484a6d75e68dc38e8acc1', 32, '5f70bf18a086007016e948b04aed3b82103a36bea41755b6cddfaf10ace3c6ef', 1024),
        Layer('4f4fb700ef54461cfa02571ae0db9a0dc1e0cdb5577484a6d75e68dc38e8acc1', 32, '5f70bf18a086007016e948b04aed3b82103a36bea41755b6cddfaf10ace3c6ef', 1024),
    ),
    'f1d5de1b1ccbbd0e22cc7628c6ebda19f06d39b2399ff81a74731f815c368e08',
    'd848fee952ffcc7a9bc40a471b9da7043ad55cebd1358d165ed853fd3af1a2a4',
)


def _require(condition, code):
    if not condition:
        raise LayoutError(code)


def _sha(value):
    return hashlib.sha256(value).hexdigest()


def _json(value):
    def unique(pairs):
        result = {}
        for key, item in pairs:
            _require(key not in result, "metadata_invalid")
            result[key] = item
        return result
    try:
        return json.loads(value, object_pairs_hook=unique)
    except LayoutError:
        raise
    except Exception:
        raise LayoutError("metadata_invalid") from None


def fingerprint(policy=PINNED, limits=LIMITS):
    # The reviewed operation binds this exact helper, closed public inputs and caps.
    value = {"schemaVersion": "local-oci-materializer/v1", "policy": asdict(policy), "limits": asdict(limits), "helperSha256": _sha(Path(__file__).read_bytes())}
    return _sha(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


@contextmanager
def _deadline(seconds):
    _require(hasattr(signal, "setitimer") and 0 < seconds <= 45, "unsupported_runtime")
    _require(signal.getitimer(signal.ITIMER_REAL)[0] == 0, "deadline_conflict")
    previous = signal.getsignal(signal.SIGALRM)
    def expired(_number, _frame):
        raise LayoutError("deadline_exceeded")
    signal.signal(signal.SIGALRM, expired)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


@contextmanager
def _input_file(path, maximum):
    fd = None
    try:
        metadata = Path(path).lstat()
        _require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == os.getuid() and not metadata.st_mode & 0o222, "input_unsafe")
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        metadata = os.fstat(fd)
        _require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == os.getuid() and not metadata.st_mode & 0o222 and metadata.st_size <= maximum, "input_unsafe")
        stream = os.fdopen(fd, "rb")
        fd = None
        with stream:
            yield stream
    except LayoutError:
        raise
    except Exception:
        raise LayoutError("input_unsafe") from None
    finally:
        if fd is not None:
            os.close(fd)


def _stamp(stream):
    info = os.fstat(stream.fileno())
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def _receipt(path, expected, limits):
    with _input_file(path, limits.metadata_bytes) as stream:
        value = stream.read(limits.metadata_bytes + 1)
        _require(len(value) <= limits.metadata_bytes and _sha(value) == expected, "receipt_mismatch")
        return _json(value)


def _validate_receipts(export, derivation, policy):
    _require(export.get("status") == "exported_format_inspected_only" and export.get("imageId") == policy.original_index
        and export.get("archiveBytes") == policy.archive_size and export.get("archiveSha256") == policy.archive_sha256
        and export.get("clientGroupAbsent") is True and export.get("exitCode") == 0
        and export.get("imageMutation") is False and export.get("remoteOperation") is False, "receipt_invalid")
    expected_checks = [{"compressedDigest": "sha256:" + layer.digest, "compressedBytes": layer.size,
        "uncompressedDigest": "sha256:" + layer.diff_id, "uncompressedBytes": layer.uncompressed_size,
        "matchesDaemonRootfs": True} for layer in policy.layers]
    _require(derivation.get("status") == "derived_local_export_semantics_verified"
        and derivation.get("originalImageId") == derivation.get("beforeExportImageId") == policy.original_index
        and derivation.get("afterExportImageIdUnchanged") is True
        and derivation.get("originalDescriptor") == {"mediaType": INDEX_TYPE, "digest": policy.original_index, "size": 856}
        and derivation.get("originalPlatform") == {"os": "linux", "architecture": "arm64"}
        and derivation.get("archiveBytes") == policy.archive_size and derivation.get("archiveSha256") == policy.archive_sha256
        and derivation.get("derivedManifestDigest") == "sha256:" + policy.manifest
        and derivation.get("derivedConfigDigest") == "sha256:" + policy.config
        and derivation.get("blobHashesVerified") == len({name for name, _, _ in policy.members if name.startswith("blobs/")})
        and derivation.get("exactReferencedBlobClosure") is True and derivation.get("rootfsDiffIdsMatchDaemon") is True
        and derivation.get("allRuntimeFieldsMatch") == {name: True for name in RUNTIME_FIELDS}
        and derivation.get("layerChecks") == expected_checks, "receipt_invalid")


def _safe_descriptor(value, digest, size, media_type):
    _require(isinstance(value, dict) and value.get("digest") == "sha256:" + digest and value.get("size") == size
        and value.get("mediaType") == media_type and "urls" not in value and "data" not in value, "descriptor_unsafe")


def _validate_archive(stream, policy, limits):
    _require(os.fstat(stream.fileno()).st_size == policy.archive_size, "archive_mismatch")
    checksum = hashlib.sha256()
    for chunk in iter(lambda: stream.read(65536), b""):
        checksum.update(chunk)
    _require(checksum.hexdigest() == policy.archive_sha256, "archive_mismatch")
    stream.seek(0)
    expected = {name: (size, digest) for name, size, digest in policy.members}
    _require(len(expected) == len(policy.members), "archive_members_mismatch")
    tar = tarfile.open(fileobj=stream, mode="r:")
    try:
        members = {}; seen = set(); compressed = 0
        for item in tar:
            name = item.name.rstrip("/") if item.isdir() else item.name
            _require(len(seen) < limits.members and name not in seen and not item.pax_headers
                and item.name == name and item.type in (tarfile.DIRTYPE, tarfile.REGTYPE, tarfile.AREGTYPE) and not item.sparse, "archive_member_unsafe")
            seen.add(name)
            if item.isdir():
                _require(name in ("blobs", "blobs/sha256") and item.size == 0, "archive_member_unsafe")
                continue
            _require(name in expected and (name in ("oci-layout", "index.json", "manifest.json") or re.fullmatch(r"blobs/sha256/[a-f0-9]{64}", name)), "archive_member_unsafe")
            compressed += item.size
            _require(0 <= item.size <= limits.member_bytes and compressed <= limits.compressed_bytes, "compressed_limit")
            size, expected_hash = expected[name]
            _require(item.size == size, "member_mismatch")
            value = tar.extractfile(item); digest = hashlib.sha256()
            for chunk in iter(lambda: value.read(65536), b""):
                digest.update(chunk)
            _require(digest.hexdigest() == expected_hash, "member_mismatch")
            members[name] = item
        _require(set(members) == set(expected), "archive_members_mismatch")
        def metadata(name):
            _require(members[name].size <= limits.metadata_bytes, "metadata_invalid")
            return _json(tar.extractfile(members[name]).read(limits.metadata_bytes + 1))
        _require(metadata("oci-layout").get("imageLayoutVersion") == "1.0.0", "metadata_invalid")
        index = metadata("index.json")
        _require(index.get("schemaVersion") == 2 and index.get("mediaType") == INDEX_TYPE and isinstance(index.get("manifests"), list) and len(index["manifests"]) == 1, "metadata_invalid")
        selected = index["manifests"][0]
        _safe_descriptor(selected, policy.manifest, expected["blobs/sha256/" + policy.manifest][0], MANIFEST_TYPE)
        _require(selected.get("platform") == {"os": "linux", "architecture": "arm64"}, "descriptor_unsafe")
        manifest = metadata("blobs/sha256/" + policy.manifest)
        _require(manifest.get("schemaVersion") == 2 and manifest.get("mediaType") == MANIFEST_TYPE, "metadata_invalid")
        _safe_descriptor(manifest.get("config"), policy.config, expected["blobs/sha256/" + policy.config][0], CONFIG_TYPE)
        _require(isinstance(manifest.get("layers"), list) and len(manifest["layers"]) == len(policy.layers), "metadata_invalid")
        for desc, layer in zip(manifest["layers"], policy.layers):
            _safe_descriptor(desc, layer.digest, layer.size, LAYER_TYPE)
        config = metadata("blobs/sha256/" + policy.config)
        _require(config.get("os") == "linux" and config.get("architecture") == "arm64"
            and config.get("rootfs") == {"type": "layers", "diff_ids": ["sha256:" + layer.diff_id for layer in policy.layers]}, "config_mismatch")
        closure = {"blobs/sha256/" + digest for digest in (policy.manifest, policy.config, *(layer.digest for layer in policy.layers))}
        _require(closure == {name for name in members if name.startswith("blobs/")}, "archive_members_mismatch")
        docker_manifest = metadata("manifest.json")
        _require(isinstance(docker_manifest, list) and len(docker_manifest) == 1
            and docker_manifest[0].get("Config") == "blobs/sha256/" + policy.config
            and docker_manifest[0].get("Layers") == ["blobs/sha256/" + layer.digest for layer in policy.layers], "metadata_invalid")
        uncompressed = 0
        for layer in policy.layers:
            # Hash opaque decoded layer streams; never unpack the image filesystem.
            digest = hashlib.sha256(); size = 0
            with gzip.GzipFile(fileobj=tar.extractfile(members["blobs/sha256/" + layer.digest])) as decoded:
                while True:
                    chunk = decoded.read(min(65536, limits.uncompressed_bytes - uncompressed + 1))
                    if not chunk:
                        break
                    size += len(chunk); uncompressed += len(chunk)
                    _require(uncompressed <= limits.uncompressed_bytes, "uncompressed_limit")
                    digest.update(chunk)
            _require(size == layer.uncompressed_size and digest.hexdigest() == layer.diff_id, "diff_id_mismatch")
        return tar, members, uncompressed
    except Exception:
        tar.close()
        raise


def _identity(path):
    info = path.lstat()
    return (info.st_dev, info.st_ino)


def _register(path, ledger):
    ledger.append((path, _identity(path)))


def _available(path):
    info = os.statvfs(path)
    return info.f_bavail * info.f_frsize


def _copy_member(tar, member, destination, ledger, expected_hash, limits):
    fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as output:
        _register(destination, ledger)
        checksum = hashlib.sha256(); size = 0
        source = tar.extractfile(member)
        while True:
            chunk = source.read(65536)
            if not chunk:
                break
            _require(_available(destination.parent) >= limits.disk_reserve_bytes, "disk_limit")
            size += len(chunk); checksum.update(chunk); output.write(chunk)
        _require(size == member.size and checksum.hexdigest() == expected_hash, "input_changed")
        output.flush(); os.fsync(output.fileno()); os.fchmod(output.fileno(), 0o444)


def _cleanup(files, directories):
    try:
        for path, identity in reversed(directories):
            _require(_identity(path) == identity and not path.is_symlink(), "cleanup_unknown")
            path.chmod(0o700)
        for path, identity in reversed(files):
            _require(_identity(path) == identity and path.is_file() and not path.is_symlink(), "cleanup_unknown")
            path.unlink()
        for path, identity in reversed(directories):
            _require(_identity(path) == identity and not path.is_symlink(), "cleanup_unknown")
            path.rmdir()
    except Exception:
        raise LayoutError("cleanup_unknown") from None


def _verify_staged(stage, copied, hashes, sizes, ledger, directories, limits):
    identities = dict(ledger)
    directory_identities = dict(directories)
    observed = set(); pending = [stage]
    while pending:
        directory = pending.pop()
        info = directory.lstat()
        _require(_identity(directory) == directory_identities.get(directory) and stat.S_ISDIR(info.st_mode)
            and info.st_uid == os.getuid() and not info.st_mode & 0o022, "output_changed")
        for path in directory.iterdir():
            name = path.relative_to(stage).as_posix()
            metadata = path.lstat()
            if stat.S_ISDIR(metadata.st_mode):
                _require(name in ("blobs", "blobs/sha256") and metadata.st_uid == os.getuid(), "output_changed")
                pending.append(path)
            else:
                _require(name in copied and stat.S_ISREG(metadata.st_mode) and _identity(path) == identities.get(path), "output_changed")
                with _input_file(path, limits.member_bytes) as stream:
                    _require(os.fstat(stream.fileno()).st_size == sizes[name], "output_changed")
                    checksum = hashlib.sha256()
                    for chunk in iter(lambda: stream.read(65536), b""):
                        checksum.update(chunk)
                    _require(checksum.hexdigest() == hashes[name], "output_changed")
                observed.add(name)
    _require(observed == copied, "output_changed")


def _materialize(tar, members, output_dir, policy, receipt, limits, source_stamp):
    parent = Path(output_dir)
    info = parent.lstat()
    _require(stat.S_ISDIR(info.st_mode) and not parent.is_symlink() and info.st_uid == os.getuid()
        and not info.st_mode & 0o077 and not list(parent.iterdir()), "output_unsafe")
    parent = parent.resolve(strict=True)
    copied = {name for name in members if name != "manifest.json"}
    _require(_available(parent) >= sum(members[name].size for name in copied) + limits.disk_reserve_bytes, "disk_limit")
    files = []; directories = []
    root = Path(tempfile.mkdtemp(prefix="oci-probe-", dir=parent))
    try:
        _register(root, directories)
        stage = root / ".layout-partial"; stage.mkdir(mode=0o700); _register(stage, directories)
        for directory in (stage / "blobs", stage / "blobs/sha256"):
            directory.mkdir(mode=0o700); _register(directory, directories)
        hashes = {name: digest for name, _, digest in policy.members}
        for name in sorted(copied):
            _copy_member(tar, members[name], stage / name, files, hashes[name], limits)
        _require(_stamp(tar.fileobj) == source_stamp, "input_changed")
        _verify_staged(stage, copied, hashes, {name: members[name].size for name in copied}, files, directories, limits)
        layout_hash = _sha(json.dumps({name: hashes[name] for name in sorted(copied)}, sort_keys=True, separators=(",", ":")).encode())
        result = {**receipt, "layoutRelativePath": root.name + "/layout", "layoutFiles": len(copied), "layoutSha256": layout_hash}
        note = root / "receipt.json"
        fd = os.open(note, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "wb") as output:
            _register(note, files)
            output.write(json.dumps({**result, "status": "verified_layout_inputs"}, sort_keys=True, indent=2).encode() + b"\n")
            output.flush(); os.fsync(output.fileno()); os.fchmod(output.fileno(), 0o444)
        for directory, _ in reversed(directories[1:]):
            directory.chmod(0o555)
        _require(not (root / "layout").exists(), "output_unsafe")
        # The destination is inside a fresh exclusive private transaction directory.
        os.rename(stage, root / "layout")
        return {**result, "status": "materialized", "materialized": True}
    except Exception as error:
        _cleanup(files, directories)
        if isinstance(error, LayoutError):
            raise
        raise LayoutError("materialization_failed") from None


def prepare_layout(archive, export_receipt, derivation_receipt, *, policy=PINNED, limits=LIMITS, output_dir=None, approved=None):
    operation = fingerprint(policy, limits)
    _require((output_dir is None and approved is None) or (output_dir is not None and approved == operation), "approval_mismatch")
    try:
        with _deadline(limits.deadline_seconds):
            exported = _receipt(export_receipt, policy.export_receipt_sha256, limits)
            derivation = _receipt(derivation_receipt, policy.derivation_receipt_sha256, limits)
            _validate_receipts(exported, derivation, policy)
            with _input_file(archive, limits.archive_bytes) as stream:
                before = _stamp(stream)
                tar, members, uncompressed = _validate_archive(stream, policy, limits)
                try:
                    _require(_stamp(stream) == before, "input_changed")
                    receipt = {"schemaVersion": "local-oci-materializer/v1", "status": "verified_only", "materialized": False,
                        "fingerprint": operation, "archiveSha256": policy.archive_sha256, "archiveBytes": policy.archive_size,
                        "originalIndexDigest": policy.original_index, "derivedManifestDigest": "sha256:" + policy.manifest,
                        "derivedConfigDigest": "sha256:" + policy.config, "exportReceiptSha256": policy.export_receipt_sha256,
                        "derivationReceiptSha256": policy.derivation_receipt_sha256, "blobCount": len({name for name in members if name.startswith("blobs/")}),
                        "layers": len(policy.layers), "uncompressedBytes": uncompressed, "runtimeAccepted": False,
                        "networkOperations": 0, "dockerOperations": 0}
                    if output_dir is not None:
                        return _materialize(tar, members, output_dir, policy, receipt, limits, before)
                    return receipt
                finally:
                    tar.close()
    except LayoutError:
        raise
    except Exception:
        raise LayoutError("operation_failed") from None


class _Arguments(argparse.ArgumentParser):
    def error(self, _message):
        raise LayoutError("invalid_arguments")


def main():
    parser = _Arguments(add_help=False, allow_abbrev=False)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--export-receipt", required=True)
    parser.add_argument("--derivation-receipt", required=True)
    parser.add_argument("--profile", choices=("historical", "current"), default="historical")
    parser.add_argument("--materialize", action="store_true")
    parser.add_argument("--output-dir")
    parser.add_argument("--approved")
    try:
        argv = sys.argv[1:]; seen = set(); index = 0
        while index < len(argv):
            name = argv[index]
            _require(name in ("--archive", "--export-receipt", "--derivation-receipt", "--profile", "--materialize", "--output-dir", "--approved") and name not in seen, "invalid_arguments")
            seen.add(name)
            if name == "--materialize":
                index += 1
            else:
                _require(index + 1 < len(argv) and not argv[index + 1].startswith("--"), "invalid_arguments")
                index += 2
        options = parser.parse_args(argv)
        _require((options.materialize and options.output_dir and options.approved)
            or (not options.materialize and not options.output_dir and not options.approved), "invalid_arguments")
        result = prepare_layout(Path(options.archive), Path(options.export_receipt), Path(options.derivation_receipt),
            policy=CURRENT if options.profile == "current" else PINNED,
            output_dir=Path(options.output_dir) if options.materialize else None, approved=options.approved)
        print(json.dumps(result, sort_keys=True))
        return 0
    except LayoutError as error:
        print(json.dumps({"schemaVersion": "local-oci-materializer/v1", "status": "failed", "code": error.code, "networkOperations": 0, "dockerOperations": 0, "runtimeAccepted": False}))
        return 2 if error.code == "invalid_arguments" else 1
    except Exception:
        print(json.dumps({"schemaVersion": "local-oci-materializer/v1", "status": "failed", "code": "operation_failed", "networkOperations": 0, "dockerOperations": 0, "runtimeAccepted": False}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
