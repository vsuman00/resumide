"""Authenticate public source inputs and preserve the Trixie Debian packaging."""
import hashlib
import json
import lzma
import pathlib
import subprocess
import tarfile
import tempfile
from email.parser import Parser


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def checksums(control):
    return {name: (sha, int(size)) for sha, size, name in (
        line.split() for line in control["Checksums-Sha256"].splitlines() if line.strip()
    )}


def extract(archive, destination):
    with tarfile.open(archive) as stream:
        members = stream.getmembers()
        if len(members) > 10000 or sum(m.size for m in members) > 160 * 1024 * 1024:
            raise ValueError("source archive bound exceeded")
        stream.extractall(destination, members=members, filter="data")


def read_files(archive):
    with tarfile.open(archive) as stream:
        return {m.name: stream.extractfile(m).read() for m in stream.getmembers() if m.isfile()}


def prepare(inputs, recipe, work):
    pins = json.loads((recipe / "pins.json").read_text())
    for item in pins["sources"] + pins["inputs"]:
        path = inputs / item["name"]
        if path.stat().st_size != item["size"] or digest(path) != item["sha256"]:
            raise ValueError("input hash/size mismatch: " + item["name"])
    signatures = {}
    for item in pins["sources"]:
        release = recipe / "provenance" / item["release"]
        if digest(release) != item["releaseSha256"]:
            raise ValueError("release hash mismatch")
        verified = subprocess.run([
            "gpgv", "--keyring", "/usr/share/keyrings/debian-archive-keyring.gpg",
            "--status-fd", "1", str(release),
        ], capture_output=True, text=True, timeout=15, check=True)
        signatures[item["suite"]] = [line.split()[2] for line in verified.stdout.splitlines()
                                      if line.startswith("[GNUPG:] VALIDSIG ")]
        rejected = {"BADSIG", "ERRSIG", "EXPSIG", "EXPKEYSIG", "REVKEYSIG", "NO_PUBKEY"}
        if not signatures[item["suite"]] or any(
            len(line.split()) > 1 and line.split()[1] in rejected
            for line in verified.stdout.splitlines()
        ):
            raise ValueError("no valid archive signature")
        expected = [item["sha256"], str(item["size"]), "main/source/Sources.xz"]
        if not any(line.split() == expected for line in release.read_text().splitlines()):
            raise ValueError("source index absent from signed release")
        found = []
        with lzma.open(inputs / item["name"], "rt") as stream:
            paragraph = []
            total = 0
            for line in stream:
                total += len(line)
                if total > 128 * 1024 * 1024:
                    raise ValueError("source index expansion bound exceeded")
                if line.strip():
                    paragraph.append(line)
                    continue
                control = Parser().parsestr("".join(paragraph))
                paragraph = []
                if control["Package"] == "expat" and control["Version"] == item["sourceVersion"]:
                    found.append(control)
        if len(found) != 1 or found[0].get("Extra-Source-Only") == "yes":
            raise ValueError("exact active source version not found")
        for name, (sha, size) in checksums(found[0]).items():
            path = inputs / name
            if path.stat().st_size != size or digest(path) != sha:
                raise ValueError("source archive not authenticated: " + name)

    # Both native packaging revisions differ only in changelog; keep Trixie's files.
    trixie = read_files(inputs / "expat_2.9.0-1~deb13u1.debian.tar.xz")
    sid = read_files(inputs / "expat_2.10.0-1.debian.tar.xz")
    changed = sorted(name for name in set(trixie) | set(sid) if trixie.get(name) != sid.get(name))
    if changed != ["debian/changelog"]:
        raise ValueError("unreviewed Debian packaging differences")

    # Bind the archive-authenticated whole source to the official release's C/tests.
    orig = read_files(inputs / "expat_2.10.0.orig.tar.gz")
    release = read_files(inputs / "expat-2.10.0.tar.xz")
    compared = []
    for name, data in release.items():
        relative = name.removeprefix("expat-2.10.0/")
        if relative.startswith(("lib/", "tests/")) and relative.endswith((".c", ".h")):
            if orig.get("libexpat-R_2_10_0/expat/" + relative) != data:
                raise ValueError("upstream release/source mismatch: " + relative)
            compared.append(relative)
    if len(compared) != 73:
        raise ValueError("unexpected upstream comparison surface")
    work.mkdir()
    extract(inputs / "expat_2.10.0.orig.tar.gz", work)
    source = work / "expat-2.10.0"
    (work / "libexpat-R_2_10_0").rename(source)
    extract(inputs / "expat_2.9.0-1~deb13u1.debian.tar.xz", source)
    changelog = source / "debian/changelog"
    changelog.write_text(
        "expat (" + pins["packageVersion"] + ") UNRELEASED; urgency=high\n\n"
        "  * Local Trixie-native rebuild of authenticated upstream 2.10.0 source.\n"
        "  * Preserve Debian packaging and its two quilt patches.\n"
        "  * Include the complete upstream four-CVE security cohort.\n"
        "  * CVE-2025-66382 remains upstream open; no mitigation is claimed.\n\n"
        " -- Resumide local build <build@localhost>  Fri, 06 Nov 2026 00:00:00 +0000\n\n"
        + changelog.read_text()
    )
    receipt = {
        "sourceVersion": pins["upstreamVersion"], "packageVersion": pins["packageVersion"],
        "archiveSignatures": signatures, "debianPackagingDifferences": changed,
        "upstreamCoreFilesCompared": compared, "noUnstableBinaries": True,
        "sourceInputs": pins["sources"] + pins["inputs"],
        "debianRulesSha256": digest(source / "debian/rules"),
        "debianCopyrightSha256": digest(source / "debian/copyright"),
        "upstreamCopyrightSha256": digest(source / "expat/COPYING"),
        "fixedCohort": pins["fixedCohort"], "unresolved": pins["unresolved"],
    }
    return source, pins, receipt


def self_test():
    control = Parser().parsestr("Checksums-Sha256:\n " + "a" * 64 + " 3 input.tar\n")
    assert checksums(control) == {"input.tar": ("a" * 64, 3)}
    with tempfile.TemporaryDirectory() as name:
        p = pathlib.Path(name) / "input"
        p.write_bytes(b"abc")
        assert digest(p) == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    print("native Expat source helper self-test passed")


if __name__ == "__main__":
    self_test()
