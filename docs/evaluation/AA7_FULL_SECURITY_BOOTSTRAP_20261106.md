# AA7 full-security scanner bootstrap

Status: bootstrap verified; image comparison pending coordinator confirmation. No image archives or scans have been created for this run.

The coordinator authorized a private comparison of baseline `19d2` and the upcoming Trixie worker using one freshly downloaded scanner/database set. Only public release/database artifacts were downloaded. No image, SBOM, source, candidate data or application credential was uploaded. No Docker container, database or provider request was made.

Trivy 0.76.2 remains the current official release. The Apple Silicon archive checksum matches both the GitHub release asset digest and published checksum file. The binary SHA-256 is `7a15c426f963473a485a4f315e21f8e2c881269d500bf0de35da13a4421fa108`. Current database manifest tags resolve to the same immutable digests as the previous comparison; fresh extracted databases independently match its actual hashes.

| Database      | SQLite SHA-256                                                     |         Bytes |
| ------------- | ------------------------------------------------------------------ | ------------: |
| Vulnerability | `acc7850179a48dbe868f97eb59ea186510800ade8ee815392fa2e7b26875c22d` | 1,686,421,504 |
| Java          | `7124b5d89aa910c1c79b7cbdd35903ab940762f6ebb27729e558fb197f9ae1db` | 1,572,696,064 |

Main database download exited 0. The first Java download exceeded the 180-second host timeout and was killed; its exact scanner exit is unknown and first-attempt stderr was not persisted. The same immutable Java artifact succeeded on the second bounded attempt in 97.57 seconds. That failed attempt remains recorded. Enforced macOS `sandbox-exec` network denial passed a socket-connect preflight with EPERM.

Retained task-owned directory: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-aa7-full-security-dy2bu9ez`, mode `0700`, approximately 4.25 GB including bootstrap temporary files. No process remains. Keep this cache for the confirmed candidate. Do not requery versions or download again while its hashes remain valid. The coordinator owns approval of the final image ID.

Next: verify the exact image index/platform/config/layer chain for both archives; scan sequentially with identical arguments, the same actual DBs, a cleared environment and enforced network denial. Preserve every severity, unfixed and unknown record, full raw JSON, exit status, exact hashes, new findings and remaining findings. The older 958-finding comparison and the old seven-record/new zero-record application audits remain separate, unchanged evidence. No zero-vulnerability or phase-completion conclusion follows from this bootstrap.

Sources: [official release](https://github.com/aquasecurity/trivy/releases/tag/v0.76.2), [published checksums](https://github.com/aquasecurity/trivy/releases/download/v0.76.2/trivy_0.76.2_checksums.txt). Exact OCI manifests, immutable repositories, bootstrap commands, source hashes and preflight receipt are in [the JSON receipt](AA7_FULL_SECURITY_BOOTSTRAP_20261106.json).
