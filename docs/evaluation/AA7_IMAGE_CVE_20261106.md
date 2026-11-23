# AA7 private compiler image vulnerability scan

Status: SCAN COMPLETED; FINDINGS PRESENT. This is private local image evidence dated 2026-11-06, not production/security acceptance. The coordinator approved a temporary scanner and public database bootstrap without host/project dependency installation.

## Result

Trivy 0.76.2 scanned the exact pinned `linux/arm64` worker image `sha256:600c3815bdf12a4e3df6d332c0aea11685fd122f0fc3240b7be3c802fd23bf4f`. The scan completed in 4.07 seconds and returned exit code 1 because findings were present. It identified Debian 12.15, 222 OS packages and zero language-specific files. The report retains every finding and package, including unfixed findings; no severity or vulnerability exclusions were used.

There are 3,632 package-vulnerability matches across 2,462 distinct vulnerability IDs: 4 critical, 269 high, 1,767 medium, 1,580 low and 12 unknown. Counts are matches, not unique exploitable defects. Two high/critical matches have a fixed version reported; the four critical matches below do not. The scanner warned that some severities came from vendors other than the OS vendor.

| Vulnerability  | Package        | Installed version | Scanner status | Fixed version |
| -------------- | -------------- | ----------------- | -------------- | ------------- |
| CVE-2026-58016 | libglib2.0-0   | 2.74.6-2+deb12u9  | fix_deferred   | Not reported  |
| CVE-2025-7458  | libsqlite3-0   | 3.40.1-2+deb12u2  | affected       | Not reported  |
| CVE-2026-99083 | linux-libc-dev | 6.1.190-1         | affected       | Not reported  |
| CVE-2023-45853 | zlib1g         | 1:1.2.13.dfsg-1   | will_not_fix   | Not reported  |

The critical entries' primary references are [CVE-2026-58016](https://avd.aquasec.com/nvd/cve-2026-58016), [CVE-2025-7458](https://avd.aquasec.com/nvd/cve-2025-7458), [CVE-2026-99083](https://avd.aquasec.com/nvd/cve-2026-99083) and [CVE-2023-45853](https://avd.aquasec.com/nvd/cve-2023-45853). References are preserved from the scanner; their individual reachability has not been established here. In particular, a `linux-libc-dev` package finding is not evidence about the running Docker VM kernel. `python3-pypdf2` has ten high matches requiring targeted parser-path triage.

[The complete JSON receipt](AA7_IMAGE_CVE_20261106.json) preserves raw scanner results, database timestamps/digests, tool/archive hashes, execution settings and all packages. Its license metadata covers 171 of 222 packages and does not replace the required complete copyright/license inventory.

## Private execution and integrity

The official GitHub API reported 0.76.2 as latest, published 2026-11-05; this corrected an initially stale search result showing 0.76.1. The coordinator explicitly approved 0.76.2. Its Apple Silicon release archive was 49,840,394 bytes and matched the API's SHA-256 `ae7ea358326960406b703c77b2ac490190797d80b306b5b50c2a27221da0a5b8`. It was unpacked only into a task-owned temporary directory. [Official release](https://github.com/aquasecurity/trivy/releases/tag/v0.76.2), [installation guidance](https://trivy.dev/docs/latest/getting-started/installation/).

Only the public vulnerability and Java indexes were fetched during bootstrap. Download-only operations completed in 7.91 and 47.22 seconds. The actual scan used a local Docker-saved archive, a cleared environment, isolated HOME/TMPDIR/current directory and a macOS sandbox denying all network operations. A loopback connection preflight raised PermissionError under the same policy. Telemetry and version checks were disabled; database, Java, checks and VEX updates were skipped; offline dependency identification was selected. No image, SBOM, private document or project source was uploaded. [Database controls](https://trivy.dev/docs/latest/configuration/db/), [network requirements](https://trivy.dev/docs/latest/advanced/air-gap/), [telemetry opt-out](https://trivy.dev/docs/latest/advanced/telemetry/).

The reviewed scan options were `--input`, `--scanners vuln`, `--pkg-types os,library`, `--offline-scan`, `--disable-telemetry`, `--skip-version-check`, `--skip-db-update`, `--skip-java-db-update`, `--skip-check-update`, `--skip-vex-repo-update`, `--list-all-pkgs`, an empty config/ignorefile, JSON output, a ten-minute timeout, two parallel analyzers and a 2GB image-size cap. All severity levels were retained. [CLI reference](https://trivy.dev/docs/latest/references/configuration/cli/trivy_image/).

No container was created, no image was changed, and no application/provider/database operation ran. `docker image save` is a local read, not image publication. The exact task-owned temporary tool/archive/databases and logs were removed after durable raw findings and their hashes were verified identical and the backend reviewer released the archive. Directory absence was checked; no host-installed dependency or container was created. This scan does not demonstrate absence of vulnerabilities, prove exploitability/reachability or close release gates. Targeted package triage and remediation remain necessary.
