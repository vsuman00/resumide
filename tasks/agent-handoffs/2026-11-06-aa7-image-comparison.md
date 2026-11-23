# AA7 private image comparison handoff

Owner: `aa7_frontend_review`; coordinator `/root`. Updated 2026-11-06. Comparison is pending a confirmed candidate build.

- Bootstrap receipt: [metadata](../../docs/evaluation/AA7_IMAGE_CVE_COMPARE_20261106_BOOTSTRAP.json), [summary](../../docs/evaluation/AA7_IMAGE_CVE_COMPARE_20261106_BOOTSTRAP.md).
- Retained exact directory: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-aa7-trivy-compare-zlk290na`, verified `0700`. No active process. Do not delete or redownload before checking coordinator state.
- Tool: Trivy 0.76.2 Apple Silicon; archive SHA-256 `ae7ea358326960406b703c77b2ac490190797d80b306b5b50c2a27221da0a5b8`; binary hash in receipt.
- Main DB: `ghcr.io/aquasecurity/trivy-db@sha256:fb417a88061be7d8c246c61cd56e73c91040574fb8cb7b74c48f7a2ea5c2f92f`.
- Java DB: `ghcr.io/aquasecurity/trivy-java-db@sha256:a48270d8181f59baed801e34d73e0857558570c51c9a582eaa3999e897c210e4`.
- SQLite hashes match the original scan receipt. Downloads exited 0 in 9.4 and 32.94 seconds. No target scan/archive was created.
- Coordinator reports two blocked candidate builds due to pinned Debian snapshot HTTP 503/504. Preserve those failed receipts; a cached builder stage is not a complete image.

Next: obtain the candidate ID from the coordinator, verify retained tool/DB hashes, save baseline and candidate archives by exact IDs, then scan both with identical settings and this cache. Use a cleared environment, isolated HOME/TMPDIR/cwd, all offline/update-skip/telemetry-disable flags and enforced macOS `sandbox-exec` network denial. Preserve raw findings, database/image/scan hashes and exact exit codes. Do not suppress high/critical or unfixed records. No Docker database, container execution, application model call, host/project dependency installation or artifact upload is permitted. Clean only the exact task-owned directory after complete durable comparison evidence is verified.

## Completed paired comparison

The coordinator confirmed candidate `sha256:19d2a00a2a830173bf1fae07dddfcac7d54be3047e58b276af031d3cbd1018ac` after the third build. Private comparison completed with both exact images, one retained tool/cache/configuration and enforced network denial. The comparison and separate binding-wrapper failure receipts are saved in `docs/evaluation/AA7_IMAGE_CVE_COMPARE_20261106.{json,md}` and `AA7_IMAGE_CVE_COMPARE_BINDING_FAILURE_20261106.json`. Durable raw objects and source file hashes were checked identical before cleanup consideration.

Baseline: 4 critical / 269 high / 1,767 medium / 1,580 low / 12 unknown. Candidate: 3 critical / 70 high / 206 medium / 667 low / 12 unknown. Every finding remains in raw evidence; all 73 candidate critical/high matches are listed in the Markdown report. Zero new package/CVE pairs were observed; removed inventory matches do not prove exploitability. Both actual database hashes remained unchanged before and after both scans and match the historical receipt.

An initial wrapper incorrectly equated Docker store index ID with Trivy config ID and stopped after a completed baseline scan. Its full raw output and failed wrapper status are preserved; exact scanner subprocess exit was not persisted and remains unknown. Corrected full cryptographic mapping verifies requested index blob, selected arm64 manifest, config blob, root filesystem diff IDs and scanner config identity. Fresh paired runs then completed with exit 1 each because findings remain.

Current temporary state: exact 0700 tool/cache/selected-platform and full-index archive directory remains retained pending coordinator review; no scan/download process remains. No further downloads or scans are necessary for this comparison. After coordinator release, remove only this exact task-owned directory and record verified absence in the completed comparison receipt. The bootstrap-only receipt remains historical and must not be relabeled as a scan.

## Final cleanup completed

The coordinator reviewed the comparison, remaining high/critical table, complete identity chain and matching database evidence and approved exact cleanup. Both successful raw scans and the initial failed-wrapper scan were checked identical to durable JSON content and their recorded source hashes before removal. Only `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-aa7-trivy-compare-zlk290na` was removed; directory absence was verified. Both exact Docker image IDs were re-inspected and remain present. All reports, bootstrap history and binding-failure evidence are preserved. No global cache pruning, image removal, further scan or download occurred. Earlier retained-cache instructions above are historical; the comparison is complete with security findings remaining and the temporary cache is now absent.
