# Private license inventory tooling

Owner `aa7_review`, isolated detached worktree `aa7-20261106-licenses/resume_ats`, base HEAD `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. Only new source deliverable: `scripts/audit-latex-licenses.py`. No production runtime, image, dependency or lockfile change. The coordinator must review this script and launcher before execution.

The script uses Python standard library only. It reads installed Debian package metadata, the existing package lock and closure manifest, installed copyright files and common-license files. It records hashes, package versions/architecture, exact declared DEP5 license labels and explicit unresolved entries. Labels are not inferred SPDX identifiers or license approval. Package-lock mismatches and non-DEP5/absent metadata are visible. The launcher must independently bind the actual image ID; the script labels its expected image without claiming self-attestation.

Reads are capped at 4 MiB per file and 64 MiB total, with resolved-path caching; JSON output is capped at 2 MiB before stdout. There are no network, subprocess, execution or filesystem-writing operations in the audit. Fixed metadata paths and a validated package name select copyright files. Copyright symlinks outside documentation/common-license directories are withheld. Read failures remain unresolved.

Validation performed without Docker: `python3 scripts/audit-latex-licenses.py --self-test` passed; Python compile check passed. The self-check covers Debian continuation fields, exact compound/custom labels and withholding unstructured prose. Image execution was initially pending review; the approved execution result is recorded below.

## Proposed reviewed execution

Use the exact already-present pinned worker image; never a mutable tag or pull. A trusted host runner should create a unique audit container name, bound its wall time to 30 seconds, capture stdout with the script's 2 MiB limit, and retain only sanitized hashes/inventory. Proposed argv, before the script is supplied on stdin:

```text
docker run -i --rm --pull=never --name <unique-run-owned-audit-name>
  --label resumide.latex.audit=licenses --network=none --ipc=none
  --read-only --cap-drop=ALL --security-opt=no-new-privileges
  --user=65532:65532 --cpus=1 --memory=128m --memory-swap=128m
  --pids-limit=32 --ulimit nofile=64:64 --ulimit cpu=10:10 --ulimit fsize=0:0
  --entrypoint /usr/bin/python3
  sha256:600c3815bdf12a4e3df6d332c0aea11685fd122f0fc3240b7be3c802fd23bf4f
  -I -B -
```

The launcher supplies no host mounts, environment values, ports or credentials. This executes trusted metadata-reading Python in the worker image; it is not an alternative compiler path and receives no candidate source. Keep the audit label distinct from production converter attempts. After any timeout/error, remove only this exact run-owned container and verify its absence. Do not use global pruning. No database container, hosted operation, provider call, login, scan, build or download is required.

## Approved execution result

Coordinator reviewed the script and corrected stdin delivery by adding `-i`. Tester released the container slot before execution. The approved exact-image audit completed with exit 0 in 196 ms, independently bound to Linux/arm64 image `600c…`. All 222 installed package copyright files were hashed; 131 had recognized DEP5 declarations and 91 non-DEP5 metadata entries remain explicitly unresolved. Seventeen common-license files were hashed; package-lock mismatches and unmatched entries were zero. The exact audit container was verified absent. No DB/provider/image build/download or external scanner operation occurred.

The reviewed source was copied unchanged into root `scripts/audit-latex-licenses.py` after its hash matched the executed source. Root self-check passed. Final artifacts: `docs/evaluation/AA7_IMAGE_LICENSES_20261106.json` and `.md`. Source/data formatting and scoped diff checks passed; report prose has zero suspicious Unicode hits and low stylometry density. No legal acceptance or full bundled-file license coverage is claimed.
