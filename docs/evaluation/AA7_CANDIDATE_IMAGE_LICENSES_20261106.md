# Candidate worker image license inventory

Status: private metadata inventory VERIFIED, 2026-11-06. This is a declaration inventory, not legal acceptance. The old image/license/CVE receipts remain unchanged. No candidate resume or job description was processed.

[The candidate machine inventory](AA7_CANDIDATE_IMAGE_LICENSES_20261106.json) binds independently inspected Linux/arm64 image `sha256:19d2a00a2a830173bf1fae07dddfcac7d54be3047e58b276af031d3cbd1018ac` to executed auditor SHA-256 `f430e65886653274f2c6d4a26019d1da074a31bd023256ce3cd823c4f825e0fe`. The current [auditor](../../scripts/audit-latex-licenses.py) requires an explicit immutable `--image-id`; the launcher independently inspected that identity before execution.

## Actual results

- 190 installed Debian packages; all 190 copyright files located and hashed.
- 125 packages have recognized DEP5 declarations. Exact labels are retained; no SPDX inference or approval is made.
- 65 packages remain unresolved because their copyright metadata is not DEP5. No copyright file is missing, no package-lock mismatch or unmatched lock entry exists, and no read limit was hit.
- All 17 common-license files were hashed, with no read exceptions.
- Vendored `pypdf` 6.21.4 metadata and its license file were located and hashed. It declares `BSD-3-Clause` through its own `License-Expression` field; the auditor records that declaration without independently certifying it. No vendored-parser metadata exception remains.

The requirements lock has SHA-256 `6c3793776e6b3c3d9a955e11b1eb2de1f192aa0990305fef4bb065f70b402261` and declares wheel SHA-256 `33e4fb41ca352810eb4e9838aa0d82d6888a5f8bf682f43e99cce5faa666255c`. The builder verified that hash during installation. This audit checks the installed metadata and lock declaration; it does not claim to recompute the original wheel hash from installed files.

The installed parser METADATA hash is `383b3d4cd588005f67afc74b113cbe19ea008691cdf18db3795601116a3d8139`. Its retained license file `/opt/latex/pypdf-6.21.4.dist-info/licenses/LICENSE` has SHA-256 `a97ac230e5f33ef10a5367a850eb01f91f1a0b064e34742c7794d2294557f524`. The package-lock and compiler read-closure hashes are retained in the machine inventory.

## Execution and cleanup

The tester explicitly released the worker-container slot before this audit. A unique audit-labelled container ran only trusted metadata-reading Python under `-I -B`, with the exact candidate ID and stdin script. Controls were network none, no host mounts or forwarded environment, read-only root, non-root UID/GID 65532, dropped capabilities, no-new-privileges, no IPC, one CPU, 128 MiB memory without additional swap, 32 PIDs, 64 descriptors, ten CPU seconds, zero file-write limit and a thirty-second outer timeout.

The run returned exit 0 in 235 ms. Output was 92,898 bytes, below the 2 MiB cap. The exact audit container was verified absent afterward. There was no image build/change, application flag/environment change, hosted database operation, Docker database, provider request, vulnerability scan or upload in this audit.

## Limits

The 65 non-DEP5 entries need explicit interpretation before any license-acceptance claim. Their presence is not proof of a missing or forbidden license. Package copyright metadata does not establish per-file provenance for every bundled TeX/font resource. This metadata result does not clear image CVEs, supply a formal security decision or approve production/distribution. Candidate runtime and vulnerability results are separate receipts; none were rerun by this audit.
