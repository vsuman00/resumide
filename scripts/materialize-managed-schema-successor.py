"""Materialize the verified clean-schema successor without connecting to a database."""

import argparse
import hashlib
import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
HANDOFF = ROOT / "tasks/agent-handoffs/2026-11-09-reliability-implementation"
DIGEST = re.compile(rb"(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])")
FORWARD_STEPS = (
    ("--worker-lifecycle", "managed-schema-worker-successor-93.json", "Include both worker lifecycle repairs"),
    ("--managed-ci", "managed-schema-ci-successor-94.json", "Include the compatibility worker fix for CI"),
    ("--budget-export-repair", "managed-schema-budget-export-successor-95.json", "Include the staged budget export alias repair"),
    ("--disposition-repair", "managed-schema-disposition-successor-96.json", "Include the typed accounting disposition repair"),
    ("--expiry-projection-repair", "managed-schema-expiry-projection-successor-97.json", "Include the expiry projection repair"),
    ("--entry-association-alias-repair", "managed-schema-entry-association-alias-successor-98.json", "Include the grouped import member alias repair"),
    ("--entry-regroup-head-repair", "managed-schema-entry-regroup-head-successor-99.json", "Include the saved-entry regroup head comparison repair"),
    ("--correction-commit-repair", "managed-schema-correction-commit-identity-successor-100.json", "Include the correction commit validator identity repair"),
)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def apply_edits(source, edits):
    sections = []
    end = 0
    for edit in edits:
        start = edit["offset"]
        before = edit["before"].encode()
        after = edit["after"].encode()
        if not end <= start <= len(source) or source[start : start + len(before)] != before:
            raise ValueError("Successor edit does not match its source")
        sections.extend((source[end:start], after))
        end = start + len(before)
    sections.append(source[end:])
    return b"".join(sections)


def append_forward_operations(candidates, previous_hash, manifest_name):
    manifest = json.loads((HANDOFF / manifest_name).read_text())
    if manifest["previousOrderedPathsAndHashesSha256"] != previous_hash:
        raise ValueError("Forward successor references a different inventory")

    previous_name = candidates[-1][0]
    for entry in manifest["forwardOperations"]:
        path = entry["path"]
        filename = Path(path).name
        if path != f"supabase/migrations/{filename}" or filename <= previous_name:
            raise ValueError("Invalid worker successor path or order")
        source = (ROOT / path).read_bytes()
        source_hash = digest(source)
        operation = f"validation_{filename.split('_', 1)[0]}_{source_hash[:8]}"
        if (
            entry["order"] != len(candidates) + 1
            or entry["sha256"] != source_hash
            or entry["bytes"] != len(source)
            or entry["providerOperationName"] != operation
        ):
            raise ValueError(f"Worker successor hash, size or name mismatch for {path}")
        candidates.append((filename, source, f"{source_hash}  {path}\n"))
        previous_name = filename

    packet_hash = digest("".join(row[2] for row in candidates).encode())
    if (
        len(candidates) != manifest["operationCount"]
        or packet_hash != manifest["orderedPathsAndHashesSha256"]
        or sum(len(row[1]) for row in candidates) != manifest["totalBytes"]
    ):
        raise ValueError("The worker successor sequence does not match its inventory")
    return packet_hash


def materialize(output, forward_count=0):
    manifest = json.loads((HANDOFF / "managed-schema-clean-successor-91.json").read_text())
    frozen = json.loads((HANDOFF / "managed-schema-inventory-91.json").read_text())
    if manifest["schemaVersion"] != "managed-clean-successor/1" or (
        frozen["orderedPathsAndHashesSha256"] != manifest["frozenInventorySha256"]
    ):
        raise ValueError("The successor references a different inventory")

    replacements = {old.encode(): new.encode() for old, new in manifest["digestReplacements"].items()}
    if not all(DIGEST.fullmatch(old) and DIGEST.fullmatch(new) for old, new in replacements.items()):
        raise ValueError("Invalid digest replacement in the successor")
    last_path = manifest["operations"][-1]["path"]
    files = sorted(
        file
        for file in (ROOT / "supabase/migrations").glob("*.sql")
        if file.relative_to(ROOT).as_posix() <= last_path
    )
    sources = []
    candidates = []
    for order, (file, entry) in enumerate(zip(files, manifest["operations"], strict=True), 1):
        path = file.relative_to(ROOT).as_posix()
        original = file.read_bytes()
        if (
            order != entry["order"]
            or path != entry["path"]
            or digest(original) != entry["frozenSha256"]
        ):
            raise ValueError(f"Frozen input mismatch for {path}")
        candidate = DIGEST.sub(lambda match: replacements.get(match[0], match[0]), original)
        candidate = apply_edits(candidate, entry.get("edits", []))
        candidate_hash = digest(candidate)
        operation = f"validation_{file.stem.split('_', 1)[0]}_{candidate_hash[:8]}"
        if (
            candidate_hash != entry["sha256"]
            or len(candidate) != entry["bytes"]
            or operation != entry["providerOperationName"]
        ):
            raise ValueError(f"Successor hash or size mismatch for {path}")
        sources.append(f'{entry["frozenSha256"]}  {path}\n')
        candidates.append((file.name, candidate, f'{entry["sha256"]}  {path}\n'))

    actual_frozen_hash = digest("".join(sources).encode())
    actual_successor_hash = digest("".join(row[2] for row in candidates).encode())
    if (
        len(candidates) != frozen["totalMigrations"]
        or len(candidates) != manifest["operationCount"]
        or actual_frozen_hash != manifest["frozenInventorySha256"]
        or actual_successor_hash != manifest["orderedPathsAndHashesSha256"]
        or sum(len(row[1]) for row in candidates) != manifest["totalBytes"]
    ):
        raise ValueError("The materialized operation sequence does not match the inventory")

    for _, forward_manifest, _ in FORWARD_STEPS[:forward_count]:
        actual_successor_hash = append_forward_operations(
            candidates, actual_successor_hash, forward_manifest
        )

    output.mkdir(mode=0o700, exist_ok=False)
    for name, candidate, _ in candidates:
        (output / name).write_bytes(candidate)
    return len(candidates), actual_successor_hash


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output_directory", type=Path, help="New directory for the verified SQL files")
    scope = parser.add_mutually_exclusive_group()
    for count, (flag, _, description) in enumerate(FORWARD_STEPS, 1):
        scope.add_argument(flag, action="store_const", dest="forward_count", const=count, help=description)
    parser.set_defaults(forward_count=0)
    args = parser.parse_args()
    try:
        count, packet_hash = materialize(args.output_directory, args.forward_count)
    except (OSError, ValueError) as error:
        parser.exit(1, f"Schema successor materialization failed: {error}\n")
    print(f"Materialized {count} SQL files. Ordered path and hash digest {packet_hash}.")


if __name__ == "__main__":
    main()
