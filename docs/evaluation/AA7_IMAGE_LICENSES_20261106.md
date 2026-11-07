# Pinned worker image license inventory

Status: private metadata inventory VERIFIED, 2026-11-06. This is a package declaration inventory, not legal or license acceptance. No candidate data was processed.

[The machine inventory](AA7_IMAGE_LICENSES_20261106.json) records the installed Debian packages and hashes of their copyright files, exact declared DEP5 labels where available, common-license hashes, package-lock binding and read-closure binding. The [auditor](../../scripts/audit-latex-licenses.py) uses Python standard library only and has a runnable `--self-test`.

## Exact image and execution binding

- Independently inspected image: `sha256:600c3815bdf12a4e3df6d332c0aea11685fd122f0fc3240b7be3c802fd23bf4f`.
- Platform: `linux/arm64`.
- Auditor SHA-256: `8c8d37555e6d709ef05475d8499c29c1893c98472d625ab427744c22e4a63dfe`.
- Existing package-lock SHA-256: `1ecdad4eff55b0ef9ba0a04cbee3c98200794c3facc5f8c56d9e89dab84b0178`.
- Existing closure-manifest SHA-256: `93efd86d7df5327f53d1f408a1aef84402d43c5a0ea4cc637c849da33aeeb0d0`.
- Run completed with exit 0 in 196 ms; output 105,779 bytes; metadata read 3,666,578 bytes.

The trusted script was supplied on stdin to isolated Python in the exact existing worker image. Docker used `--pull=never`, no network, read-only root, no host mounts or forwarded environment, non-root UID/GID 65532, dropped capabilities, no-new-privileges, no IPC, one CPU, 128 MiB memory with no extra swap, 32 PIDs, 64 descriptors, ten CPU seconds, zero file-write limit and a thirty-second outer timeout. The script bounds individual reads to 4 MiB, total reads to 64 MiB and JSON output to 2 MiB.

This was a trusted metadata audit, not an alternate TeX compilation path. The audit container used a separate unique audit label and was verified absent afterward. No package installation, image build/download/change, database container, hosted database operation, provider request, scanner upload or login occurred.

## Results and limits

- 222 installed packages match the existing package lock. No unmatched lock entries remain.
- All 222 package copyright files were located and hashed.
- 131 packages declare a recognized DEP5 format; their license field labels are recorded exactly, including compound/custom labels. No SPDX identifiers were inferred.
- 91 packages have non-DEP5 copyright metadata. Their file hashes are recorded, but their license declarations remain unresolved for structured parsing. There were no missing copyright files, lock mismatches or read-limit failures.
- 17 common-license files were hashed.

The unresolved non-DEP5 entries are not findings that a license is absent or forbidden; they need explicit review before any license-acceptance claim. Package metadata also does not prove that every bundled TeX/font file has the same license. This does not replace a compiler OS/package CVE scan, reachable-component triage, distribution compliance review or formal security/release approval. The image and runtime policy remain unchanged.
