# AA7 full-security scanner handoff

Owner: `aa7_frontend_review`; coordinator `/root`. Updated 2026-11-06.

Bootstrap is complete. Final Trixie image confirmation is pending. No archive or scan has run. The root coordinator owns shared plans, source, services and candidate approval.

- Receipt: [JSON](../../docs/evaluation/AA7_FULL_SECURITY_BOOTSTRAP_20261106.json), [summary](../../docs/evaluation/AA7_FULL_SECURITY_BOOTSTRAP_20261106.md).
- Retained exact task-owned directory: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-aa7-full-security-dy2bu9ez`, verified `0700`; no process remains.
- Trivy 0.76.2 binary and both actual SQLite hashes match the previous comparison; metadata and fresh downloads were verified today. One bounded Java bootstrap timeout is retained; the same-artifact retry passed.
- Enforced network-denial preflight passed EPERM. Read the stored CLI help before any new flags. Use a cleared environment and this cache, all update/telemetry/version checks off, full all-severity output, empty config/ignorefile and no ignore-unfixed option.
- Wait for root's exact final candidate ID before image save or scanning. Docker image save is permitted; containers are owned by the tester. Verify full requested OCI index, selected arm64 manifest, config and layer/rootfs mapping; never compare Docker index ID directly to Trivy's config ID.
- Keep baseline `sha256:19d2a00a2a830173bf1fae07dddfcac7d54be3047e58b276af031d3cbd1018ac`, earlier reports and current app-zero-audit evidence intact. New results must use FULL_SECURITY names.

Next: obtain confirmed candidate ID; verify retained hashes and disk space; save and bind both images; run identical offline scans sequentially; save full raw results, deltas, every remaining severity, primary-vendor actionability and command provenance. Cleanup only this exact directory after durable evidence and coordinator release. No public upload, provider or database project action is authorized.

## Completed full comparison

Root confirmed Trixie `sha256:98907d4d7472231fd81e719e71f6cba23db54db215c35d906eeab87b3c39692e` and authorized paired image saves/scans. Comparison completed with both exact images and identical offline scanner/database settings. Every index, arm64 manifest, config, compressed layer blob and uncompressed rootfs diff ID was verified. Trivy config and DiffIDs match. No container was run.

Baseline19d2 reproduced958 matches: 3 critical, 70 high, 206 medium, 667 low, 12 unknown. Trixie9890 has978 matches: 0 critical, 89 high, 192 medium, 686 low, 11 unknown; 354 unique IDs across51 source groups. All978 have no distro FixedVersion in the current scanner DB; upstream fixes can still exist. Full remediation remains incomplete. Raw reports and all89 high matches are preserved in `AA7_FULL_SECURITY_IMAGE_COMPARE_20261106.{json,md}` and separate `AA7_FULL_SECURITY_BASELINE_RAW_20261106.json` / `AA7_FULL_SECURITY_TRIXIE_RAW_20261106.json`. Baseline/prior application evidence hashes remain unchanged.

All scans ended, no process remains. Exact task-owned directory remains retained, approximately5.27GB including tool, DBs, bootstrap temps and both archives per image. Wait for coordinator review and cleanup authorization; do not delete images, rerun scans or fetch updates. The earlier pending instructions above are historical; both completed scan exit codes are1 because findings remain.

## Final22cb scan and actionability

Root confirmed guard-only22cb and approved a new scan while reusing the unchanged, hash-verified baseline19d2 raw result. The new full chain independently verifies every index/config/layer content hash and Trivy identity. Same actual DB hashes were checked before and after; network denial was enforced. Final22cb again has978 matches:0critical/89high/192medium/686low/11unknown. Its actual package inventory and all normalized findings equal9890. Separate final raw/provenance evidence is in `AA7_FULL_SECURITY_FINAL_RAW_20261106.json` and `AA7_FULL_SECURITY_FINAL_COMPARE_20261106.{json,md}`.

Root subsequently reported22cb runtime macro-fixture `compile_failed`; backend is diagnosing transitive TeX closure. This scanner did not execute that runtime test. Static findings remain valid, but the image is not a functional pass. Keep caches/archives/images/reports for the reviewed repair image. Do not requery/download/cleanup or run containers. A further scan needs root's confirmed new immutable image ID and separate output names.

The51-source matrix is complete in `AA7_FULL_SECURITY_ACTIONABILITY_20261106.{json,md}`. It preserves978matches/354IDs/355source-CVE pairs. Primary metadata covers every pair:145 have fixed source versions outsideTrixie across26groups;9ignored and10postponed vendor dispositions overlap fix availability;9upstream fixes are independently verified,346other upstream states remain unverified.210pairs lack an established outsideTrixie fixed version. No claim says fixes are impossible or sandbox reachability makes findings inapplicable. The JSON has every exact vendor fixed version, release/status, upstream proof and next action. No source backport/build was performed. Full security remainsOPEN.

## Repaired4ea4 scan

Root confirmed immutable4ea4 after the etoolbox.sty closure repair and authorized a new full scan. Complete index/manifest/config/compressed-layer/uncompressed-diffID identity proof and enforced offline scan succeeded, exit1 with978 findings:0critical/89high/192medium/686low/11unknown. Same DB hashes before/after; baseline raw hash reverified and reused. Fresh raw joins prove the installed inventory and all normalized findings equal22cb, so the51-source matrix still applies. All old candidates/failed receipts/raws remain separate. New evidence uses `AA7_FULL_SECURITY_REPAIRED_{RAW,COMPARE}_20261106` files. Functional validation is pending the tester; this scanner ran no container. Cache/archives remain retained, no process. Wait for coordinator review or next confirmed image; no updates/downloads/cleanup. Security staysOPEN.

## Paperfix 8f7c scan

Root confirmed immutable 8f7c after the exact etoolbox/paperspecs closure repair and authorized a fresh full scan. Full index/manifest/config/compressed-layer/uncompressed-diffID binding and enforced offline scan completed, exit 1 with 978 findings: 0 critical / 89 high / 192 medium / 686 low / 11 unknown. Same actual DB hashes before/after; baseline raw hash reverified and reused. Fresh raw joins prove inventory and all normalized findings equal failed 4ea4, so the 51-source matrix still applies. New evidence uses `AA7_FULL_SECURITY_PAPERFIX_{RAW,COMPARE}_20261106` files. All historical/failed candidates and reports remain separate. Functional tests/source binding are pending the tester/coordinator; scanner ran no container. Retain the verified cache/archives until root release. Full security remains OPEN.

## Exact scanner cleanup completed

Root independently reviewed final paperfix image/raw/DB bindings and approved exact cleanup. All five temporary raw scans were hash-checked against durable copies, actual tool/DB hashes reverified, all temporary file hashes/manifests saved, primary vendor records verified preserved, and no active owned process or directory/descendant symlink found. Only `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-aa7-full-security-dy2bu9ez` was removed. Its expected macOS canonical path under `/private/var` is also absent. Six worker image IDs were inspected before/after and remain. All raw/failed/historical reports remain; no prune, image removal, unrelated temporary cleanup, model, app or database change occurred.

Removed temporary logical bytes: 6,819,001,480. Observed filesystem free-space increase: 6,912,540,672 bytes; concurrent activity affects exact accounting. Durable receipt: `AA7_FULL_SECURITY_CLEANUP_20261106.{json,md}`. Earlier retained-cache instructions in this handoff are historical and must not be resumed. No scanner process remains. No further scanner work is required without a new bounded assignment/bootstrap. Full security stays OPEN with 978 findings.
