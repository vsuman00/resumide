# AA7 image comparison bootstrap

Status: BOOTSTRAP VERIFIED; COMPARISON PENDING. No comparison scans or image archives were created. The coordinator reported two candidate build attempts blocked by pinned Debian snapshot HTTP 503/504; no final candidate image ID is available. Those attempts are recorded separately by the coordinator.

The task-owned temporary directory is retained at `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-aa7-trivy-compare-zlk290na` with verified mode `0700`. It holds checksum-verified temporary Trivy 0.76.2, its release archive, isolated home/cache/tmp directories, bootstrap logs and database metadata. No active download or scan process remains.

Both databases were fetched by immutable OCI manifest digest. Their extracted SQLite files match the earlier full-image scan exactly:

| Database      | SHA-256                                                            | Bytes         |
| ------------- | ------------------------------------------------------------------ | ------------- |
| Vulnerability | `acc7850179a48dbe868f97eb59ea186510800ade8ee815392fa2e7b26875c22d` | 1,686,421,504 |
| Java index    | `7124b5d89aa910c1c79b7cbdd35903ab940762f6ebb27729e558fb197f9ae1db` | 1,572,696,064 |

[The metadata receipt](AA7_IMAGE_CVE_COMPARE_20261106_BOOTSTRAP.json) records repositories/digests, timestamps, tool/archive hashes, disk use and resume instructions. The baseline remains `sha256:600c3815bdf12a4e3df6d332c0aea11685fd122f0fc3240b7be3c802fd23bf4f`; its [existing findings](AA7_IMAGE_CVE_20261106.md) remain unchanged.

Resume after the coordinator supplies a confirmed candidate ID. Verify retained hashes, save both image archives by exact ID, and scan both sequentially using this same cache and configuration with network denial enforced. Retain every finding, including high/critical and unfixed records. Upload no artifacts. Remove only this exact temporary directory after durable comparison results and their hashes are saved and verified.

Bootstrap used public metadata downloads with telemetry/version checks disabled, cleared environment and task-isolated configuration. No database project, container, provider or production operation occurred. It supplies no vulnerability comparison or release approval.
