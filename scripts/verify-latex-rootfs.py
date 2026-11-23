"""Verify the opt-in LaTeX image's flattened filesystem and runtime configuration."""

import argparse
import gzip
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import tarfile


MAX_IMAGE_BYTES = 2 * 1024 ** 3
REMOVED_LIBRARY = re.compile(r'^lib(?:curl-gnutls|gssapi_krb5|k5crypto|krb5(?:support)?)\.so(?:\.|$)')
TAR_HEADER_FIELDS = {'atime', 'ctime', 'mtime', 'path', 'linkpath', 'size', 'uid', 'gid', 'uname', 'gname'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(stream):
    result = hashlib.sha256()
    size = 0
    while data := stream.read(1048576):
        size += len(data)
        require(size <= MAX_IMAGE_BYTES, 'image stream exceeds bound')
        result.update(data)
    return result.hexdigest()


def archive_sha(path):
    with path.open('rb') as stream:
        return sha(stream)


def canonical_path(name):
    path = PurePosixPath(name)
    require(not path.is_absolute() and '..' not in path.parts, 'invalid archive path')
    return str(path)


def named_removed_library(path):
    return bool(REMOVED_LIBRARY.match(PurePosixPath(path).name))


def rootfs_files(path):
    entries = {}
    times = {}
    with tarfile.open(path, mode='r|') as archive:
        for item in archive:
            name = canonical_path(item.name)
            require(name not in entries, f'duplicate rootfs path: {name}')
            require(len(entries) < 100000, 'rootfs entry bound exceeded')
            fields = {key: value for key, value in item.pax_headers.items() if key not in TAR_HEADER_FIELDS}
            entries[name] = [item.type.decode('ascii'), item.mode, item.uid, item.gid, item.size,
                             item.linkname, item.devmajor, item.devminor, fields,
                             sha(archive.extractfile(item)) if item.isfile() else None]
            times[name] = item.mtime
    return entries, times


def blob(archive, descriptor):
    digest = descriptor['digest']
    require(re.fullmatch(r'sha256:[a-f0-9]{64}', digest), 'invalid OCI descriptor digest')
    entry = archive.getmember('blobs/' + digest.replace(':', '/', 1))
    require(entry.isfile() and entry.size == descriptor['size'] and entry.size <= MAX_IMAGE_BYTES,
            'OCI blob type or size differs')
    require('sha256:' + sha(archive.extractfile(entry)) == digest, 'OCI blob digest differs')
    return entry


def image_layers(path, expected_manifest, forbidden_hashes=None):
    with tarfile.open(path, mode='r:') as archive:
        index = json.load(archive.extractfile('index.json'))
        matches = [ref for ref in index['manifests'] if ref.get('platform') == {'architecture': 'arm64', 'os': 'linux'}]
        require(len(matches) == 1 and matches[0]['digest'] == expected_manifest,
                'expected Linux ARM64 platform manifest missing')
        manifest = json.load(archive.extractfile(blob(archive, matches[0])))
        config = json.load(archive.extractfile(blob(archive, manifest['config'])))
        require(config['os'] == 'linux' and config['architecture'] == 'arm64', 'OCI config platform differs')
        diffs = config['rootfs']['diff_ids']
        require(len(manifest['layers']) == len(diffs) and len(diffs) <= 32, 'invalid layer count')
        layers = []
        retired = {}
        whiteouts = 0
        for entry, diff in zip(manifest['layers'], diffs, strict=True):
            item = blob(archive, entry)
            require(entry['mediaType'].endswith('+gzip'), 'unexpected OCI layer encoding')
            with gzip.GzipFile(fileobj=archive.extractfile(item)) as data:
                require('sha256:' + sha(data) == diff, 'uncompressed OCI layer digest differs')
            names = set()
            regular_files = 0
            with tarfile.open(fileobj=archive.extractfile(item), mode='r|gz') as layer:
                for member in layer:
                    name = canonical_path(member.name)
                    require(name not in names and len(names) < 100000, 'duplicate or too many OCI layer paths')
                    names.add(name)
                    whiteouts += PurePosixPath(name).name.startswith('.wh.')
                    retired_name = named_removed_library(name)
                    regular_files += member.isfile()
                    digest = None
                    if member.isfile() and (retired_name or forbidden_hashes is not None):
                        digest = sha(layer.extractfile(member))
                        require(forbidden_hashes is None or digest not in forbidden_hashes,
                                'retired library bytes remain in raw layer')
                    if retired_name:
                        retired[name] = digest
            if not names:
                with gzip.GzipFile(fileobj=archive.extractfile(item)) as data:
                    padding = data.read(10241)
                require(len(padding) <= 10240 and not any(padding), 'empty layer contains payload bytes')
            layers.append({'digest': entry['digest'], 'diffId': diff, 'bytes': item.size,
                           'entries': len(names), 'regularFiles': regular_files})
    return {'manifestDigest': expected_manifest, 'configDigest': manifest['config']['digest'],
            'runtimeConfig': config['config'], 'history': config['history'], 'layers': layers,
            'removedLibraryEntries': retired, 'whiteoutCount': whiteouts, 'archiveSha256': archive_sha(path)}


def verify(args):
    before = image_layers(args.predecessor_image, args.predecessor_manifest)
    removed_hashes = {digest for digest in before['removedLibraryEntries'].values() if digest}
    require(removed_hashes, 'predecessor retired library payloads missing')
    after = image_layers(args.candidate_image, args.candidate_manifest, removed_hashes)
    require(before['runtimeConfig'] == after['runtimeConfig'], 'runtime process configuration changed')
    require(before['removedLibraryEntries'] and not after['removedLibraryEntries'], 'retired OCI libraries remain')
    before_payloads = {row['digest'] for row in before['layers'] if row['entries']}
    after_payloads = {row['digest'] for row in after['layers'] if row['entries']}
    require(after['whiteoutCount'] == 0 and not before_payloads & after_payloads,
            'candidate carries predecessor payload layers or whiteouts')
    require(sum(layer['entries'] > 0 for layer in after['layers']) == 1, 'expected one filesystem data layer')
    history = [row['created_by'].split(' ', 1)[0] for row in after['history']]
    require(history == ['COPY', 'ENV', 'USER', 'WORKDIR', 'ENTRYPOINT'], 'unexpected image build history')

    old_entries, old_times = rootfs_files(args.predecessor_rootfs)
    new_entries, new_times = rootfs_files(args.candidate_rootfs)
    require(old_entries == new_entries, 'effective filesystem content or metadata changed')
    remaining_hashes = {fields[-1] for fields in new_entries.values() if fields[-1]}
    require(not removed_hashes & remaining_hashes, 'retired library bytes remain in effective files')
    require(new_entries['scratch'][2:4] == [65532, 65532], 'scratch ownership differs')
    fingerprint = hashlib.sha256(json.dumps(new_entries, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return {'predecessor': before, 'candidate': after, 'effectiveRootfsEqual': True,
            'effectiveRootfsSha256': fingerprint, 'effectiveRootfsEntries': len(new_entries),
            'retiredLibraryPayloadsAbsent': len(removed_hashes),
            'mtimeChangedPaths': sorted(name for name in old_times if old_times[name] != new_times[name]),
            'effectiveExportSha256': {'predecessor': archive_sha(args.predecessor_rootfs),
                                     'candidate': archive_sha(args.candidate_rootfs)}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for variant in ('predecessor', 'candidate'):
        parser.add_argument(f'--{variant}-image', required=True, type=Path)
        parser.add_argument(f'--{variant}-manifest', required=True)
        parser.add_argument(f'--{variant}-rootfs', required=True, type=Path)
    print(json.dumps(verify(parser.parse_args()), indent=2))
