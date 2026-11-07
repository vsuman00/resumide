"""Read package license declarations inside the pinned worker image; no legal approval."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from email.parser import Parser

MAX_FILE_BYTES = 4 * 1024 * 1024
MAX_TOTAL_BYTES = 64 * 1024 * 1024
MAX_OUTPUT_BYTES = 2 * 1024 * 1024


def fields(paragraph):
    """Read Debian control fields, retaining continuation text only within its field."""
    result = {}
    current = None
    for line in paragraph.splitlines():
        if line[:1] in (" ", "\t") and current:
            result[current] += "\n" + line[1:]
        elif ":" in line:
            current, value = line.split(":", 1)
            result[current] = value.strip()
        else:
            current = None
    return result


def license_declarations(text):
    paragraphs = re.split(r"\n[ \t]*\n", text)
    header = fields(paragraphs[0]) if paragraphs else {}
    format_url = header.get("Format", "").strip()
    # Only report declared DEP5 field values; do not infer SPDX IDs from prose.
    dep5 = bool(re.fullmatch(
        r"https?://www\.debian\.org/doc/packaging-manuals/copyright-format/1\.0/?",
        format_url,
    ))
    labels = sorted({
        fields(p)["License"].split("\n", 1)[0].strip()
        for p in paragraphs
        if dep5 and fields(p).get("License", "").split("\n", 1)[0].strip()
    })
    return {"format": format_url or None, "dep5": dep5, "declaredLicenseLabels": labels}


class Reader:
    def __init__(self):
        self.total = 0
        self.cache = {}

    def read(self, path):
        path = Path(path)
        resolved = path.resolve(strict=True)
        if resolved in self.cache:
            return self.cache[resolved]
        size = resolved.stat().st_size
        if size > MAX_FILE_BYTES or self.total + size > MAX_TOTAL_BYTES:
            raise ValueError("read_limit")
        with resolved.open("rb") as stream:
            data = stream.read(MAX_FILE_BYTES + 1)
        if len(data) > MAX_FILE_BYTES or self.total + len(data) > MAX_TOTAL_BYTES:
            raise ValueError("read_limit")
        self.total += len(data)
        self.cache[resolved] = data
        return data


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def immutable_image(value):
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", value):
        raise argparse.ArgumentTypeError("Pass an inspected immutable image ID")
    return value


def python_inventory(reader):
    requirement_path = Path("/opt/latex/requirements.lock")
    if not requirement_path.exists():
        return {"requirementsLockSha256": None, "packages": [], "unresolved": ["requirements_lock_absent"]}
    data = reader.read(requirement_path)
    declaration = re.fullmatch(r"pypdf==([^\s]+) --hash=sha256:([a-f0-9]{64})\n?", data.decode("ascii"))
    if not declaration:
        raise ValueError("unexpected_requirement_lock")
    version, wheel_hash = declaration.groups()
    records = []
    unresolved = []
    metadata_dirs = sorted(Path("/opt/latex").glob("pypdf-*.dist-info"))
    if len(metadata_dirs) != 1:
        unresolved.append("pypdf_metadata_count")
    for directory in metadata_dirs[:2]:
        metadata_bytes = reader.read(directory / "METADATA")
        metadata = Parser().parsestr(metadata_bytes.decode("utf-8"))
        record = {
            "name": metadata.get("Name"), "version": metadata.get("Version"),
            "declaredLicenseExpression": metadata.get("License-Expression"),
            "declaredLicense": metadata.get("License"),
            "metadataPath": str(directory / "METADATA"),
            "metadataSha256": sha256(metadata_bytes), "licenseFiles": [],
        }
        if str(record["name"] or "").lower() != "pypdf" or record["version"] != version:
            unresolved.append("pypdf_metadata_lock_mismatch")
        license_paths = sorted(p for p in directory.rglob("*") if p.is_file() and
            ("licenses" in p.relative_to(directory).parts or p.name.upper().startswith(("LICENSE", "COPYING"))))
        if not license_paths:
            unresolved.append("pypdf_license_file_absent")
        if len(license_paths) > 64:
            raise ValueError("license_file_count")
        for path in license_paths:
            if not path.resolve(strict=True).is_relative_to(directory):
                raise ValueError("vendored_license_path")
            record["licenseFiles"].append({"path": str(path), "sha256": sha256(reader.read(path))})
        records.append(record)
    return {
        "requirementsLockSha256": sha256(data), "declaredWheelSha256": wheel_hash,
        "wheelHashEvidence": "Build installer verifies the locked wheel; this audit reads the declaration, not the original wheel bytes.",
        "packages": records, "unresolved": unresolved,
    }


def audit(expected_image):
    reader = Reader()
    status = reader.read("/var/lib/dpkg/status")
    lock = reader.read("/opt/latex/packages.lock")
    closure = reader.read("/opt/latex/closure.json")
    locked = dict(line.split("=", 1) for line in lock.decode("utf-8").splitlines() if line)
    installed = [fields(p) for p in re.split(r"\n[ \t]*\n", status.decode("utf-8"))]
    installed = [p for p in installed if p.get("Status") == "install ok installed"]
    if not installed or len(installed) > 2048:
        raise ValueError("package_count")
    packages = []
    unresolved = []
    seen = set()
    for package in sorted(installed, key=lambda p: (p["Package"], p.get("Architecture", ""))):
        name, version = package["Package"], package["Version"]
        if not re.fullmatch(r"[a-z0-9][a-z0-9+.-]*", name):
            raise ValueError("package_name")
        seen.add(name)
        entry = {"package": name, "version": version, "architecture": package.get("Architecture")}
        issues = []
        if locked.get(name) != version:
            issues.append("package_lock_mismatch")
        copyright_path = Path("/usr/share/doc") / name / "copyright"
        entry["copyrightPath"] = str(copyright_path)
        try:
            resolved = copyright_path.resolve(strict=True)
            if not any(resolved.is_relative_to(root) for root in (
                Path("/usr/share/doc"), Path("/usr/share/common-licenses"),
            )):
                raise ValueError("copyright_path_outside_metadata")
            data = reader.read(resolved)
            entry.update({"resolvedCopyrightPath": str(resolved), "copyrightSha256": sha256(data)})
            entry.update(license_declarations(data.decode("utf-8")))
            if not entry["dep5"]:
                issues.append("not_dep5")
            elif not entry["declaredLicenseLabels"]:
                issues.append("no_declared_license_label")
        except (OSError, ValueError, UnicodeError) as error:
            issues.append("metadata_unavailable:" + type(error).__name__)
        entry["unresolved"] = issues
        if issues:
            unresolved.append({"package": name, "reasons": issues})
        packages.append(entry)
    common = []
    for path in sorted(Path("/usr/share/common-licenses").iterdir()):
        if not path.is_file():
            continue
        try:
            data = reader.read(path)
            common.append({"path": str(path), "sha256": sha256(data)})
        except (OSError, ValueError) as error:
            common.append({"path": str(path), "unresolved": type(error).__name__})
    return {
        "schemaVersion": "latex-license-inventory/1",
        "expectedImageId": expected_image,
        "imageBinding": "Launcher must independently inspect the exact image ID.",
        "scope": "Installed Debian and vendored pypdf declarations; no SPDX inference or license approval.",
        "statusSha256": sha256(status), "packagesLockSha256": sha256(lock),
        "closureManifestSha256": sha256(closure), "packages": packages,
        "commonLicenses": common, "unresolved": unresolved,
        "pythonInventory": python_inventory(reader),
        "lockEntriesWithoutInstalledPackage": sorted(set(locked) - seen),
        "bytesRead": reader.total,
    }


def self_test():
    sample = """Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/

Files: *
License: GPL-2+ and custom-local
 legal text is not a license identifier

License: custom-local
 local license text
"""
    assert fields("Package: one\nStatus: install ok installed\n continuation")["Status"].endswith("\ncontinuation")
    assert license_declarations(sample)["declaredLicenseLabels"] == ["GPL-2+ and custom-local", "custom-local"]
    assert license_declarations("License: GPL-2+\n prose") == {
        "format": None, "dep5": False, "declaredLicenseLabels": [],
    }
    print("license declaration self-check passed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--image-id", type=immutable_image)
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        if not args.image_id:
            parser.error("--image-id is required for an audit")
        output = json.dumps(audit(args.image_id), sort_keys=True, ensure_ascii=True, separators=(",", ":"))
        if len(output.encode("utf-8")) > MAX_OUTPUT_BYTES:
            raise ValueError("output_limit")
        print(output)
