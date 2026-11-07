# AA7 private worker image comparison

Status: COMPARISON COMPLETED; SECURITY FINDINGS REMAIN. Both exact local images were scanned with Trivy 0.76.2 under macOS-enforced network denial and the same immutable database content. This does not constitute release acceptance.

## Result

| Image                 | Packages          | Critical | High | Medium | Low   | Unknown | Package-CVE matches | Distinct CVE IDs |
| --------------------- | ----------------- | -------- | ---- | ------ | ----- | ------- | ------------------- | ---------------- |
| Baseline `600c3815…`  | 222 OS            | 4        | 269  | 1,767  | 1,580 | 12      | 3,632               | 2,462            |
| Candidate `19d2a00a…` | 190 OS + 1 Python | 3        | 70   | 206    | 667   | 12      | 958                 | 360              |

The complete IDs are in [the comparison JSON](AA7_IMAGE_CVE_COMPARE_20261106.json). Baseline and candidate scans took 3.8 and 2.88 seconds and both returned exit 1 because findings remain. Every severity and unfixed record is retained, with no ignore file or vulnerability exclusions. There are zero new package-name/CVE-ID pairs, 2,674 removed pairs and 958 persistent pairs. Package removal and version changes do not prove exploitability or absence of vulnerabilities.

The candidate inventory identifies `pypdf` 6.21.4 at `opt/latex/pypdf-6.21.4.dist-info/METADATA`, with zero findings reported for that library group. The old `python3-pypdf2`, `gcc`, `gcc-12`, `libc6-dev` and `linux-libc-dev` packages are absent from the candidate inventory. This removes the old parser/build-package matches from this scan; the retained runtime libraries still require triage. Only two remaining high matches have a fixed version reported: `apt` and `libapt-pkg6.0`, CVE-2026-109518, installed 2.6.1 versus fixed 2.6.2.

## Complete remaining critical and high matches

All 73 candidate critical/high matches are listed below. Their severity/status/fixed-version values are scanner data, not a reachability judgment.

| Severity | Package               | Vulnerability                                                  | Installed version  | Fixed version | Scanner status |
| -------- | --------------------- | -------------------------------------------------------------- | ------------------ | ------------- | -------------- |
| CRITICAL | libglib2.0-0          | [CVE-2026-58016](https://avd.aquasec.com/nvd/cve-2026-58016)   | 2.74.6-2+deb12u9   | Not reported  | fix_deferred   |
| CRITICAL | libsqlite3-0          | [CVE-2025-7458](https://avd.aquasec.com/nvd/cve-2025-7458)     | 3.40.1-2+deb12u2   | Not reported  | affected       |
| CRITICAL | zlib1g                | [CVE-2023-45853](https://avd.aquasec.com/nvd/cve-2023-45853)   | 1:1.2.13.dfsg-1    | Not reported  | will_not_fix   |
| HIGH     | apt                   | [CVE-2026-109518](https://avd.aquasec.com/nvd/cve-2026-109518) | 2.6.1              | 2.6.2         | fixed          |
| HIGH     | bsdutils              | [CVE-2026-53613](https://avd.aquasec.com/nvd/cve-2026-53613)   | 1:2.38.1-5+deb12u3 | Not reported  | affected       |
| HIGH     | bsdutils              | [CVE-2026-53615](https://avd.aquasec.com/nvd/cve-2026-53615)   | 1:2.38.1-5+deb12u3 | Not reported  | affected       |
| HIGH     | bsdutils              | [CVE-2026-78410](https://avd.aquasec.com/nvd/cve-2026-78410)   | 1:2.38.1-5+deb12u3 | Not reported  | affected       |
| HIGH     | gzip                  | [CVE-2026-41992](https://avd.aquasec.com/nvd/cve-2026-41992)   | 1.12-1             | Not reported  | fix_deferred   |
| HIGH     | libacl1               | [CVE-2026-54369](https://avd.aquasec.com/nvd/cve-2026-54369)   | 2.3.1-3            | Not reported  | fix_deferred   |
| HIGH     | libapt-pkg6.0         | [CVE-2026-109518](https://avd.aquasec.com/nvd/cve-2026-109518) | 2.6.1              | 2.6.2         | fixed          |
| HIGH     | libblkid1             | [CVE-2026-53613](https://avd.aquasec.com/nvd/cve-2026-53613)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | libblkid1             | [CVE-2026-53615](https://avd.aquasec.com/nvd/cve-2026-53615)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | libblkid1             | [CVE-2026-78410](https://avd.aquasec.com/nvd/cve-2026-78410)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | libexpat1             | [CVE-2026-113351](https://avd.aquasec.com/nvd/cve-2026-113351) | 2.5.0-1+deb12u5    | Not reported  | fix_deferred   |
| HIGH     | libexpat1             | [CVE-2026-117610](https://avd.aquasec.com/nvd/cve-2026-117610) | 2.5.0-1+deb12u5    | Not reported  | affected       |
| HIGH     | libexpat1             | [CVE-2026-118370](https://avd.aquasec.com/nvd/cve-2026-118370) | 2.5.0-1+deb12u5    | Not reported  | affected       |
| HIGH     | libglib2.0-0          | [CVE-2026-58010](https://avd.aquasec.com/nvd/cve-2026-58010)   | 2.74.6-2+deb12u9   | Not reported  | fix_deferred   |
| HIGH     | libglib2.0-0          | [CVE-2026-58011](https://avd.aquasec.com/nvd/cve-2026-58011)   | 2.74.6-2+deb12u9   | Not reported  | fix_deferred   |
| HIGH     | libglib2.0-0          | [CVE-2026-58012](https://avd.aquasec.com/nvd/cve-2026-58012)   | 2.74.6-2+deb12u9   | Not reported  | fix_deferred   |
| HIGH     | libglib2.0-0          | [CVE-2026-58013](https://avd.aquasec.com/nvd/cve-2026-58013)   | 2.74.6-2+deb12u9   | Not reported  | fix_deferred   |
| HIGH     | libglib2.0-0          | [CVE-2026-58014](https://avd.aquasec.com/nvd/cve-2026-58014)   | 2.74.6-2+deb12u9   | Not reported  | fix_deferred   |
| HIGH     | libglib2.0-0          | [CVE-2026-58015](https://avd.aquasec.com/nvd/cve-2026-58015)   | 2.74.6-2+deb12u9   | Not reported  | fix_deferred   |
| HIGH     | libharfbuzz0b         | [CVE-2023-25193](https://avd.aquasec.com/nvd/cve-2023-25193)   | 6.0.0+dfsg-3       | Not reported  | affected       |
| HIGH     | libmount1             | [CVE-2026-53613](https://avd.aquasec.com/nvd/cve-2026-53613)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | libmount1             | [CVE-2026-53615](https://avd.aquasec.com/nvd/cve-2026-53615)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | libmount1             | [CVE-2026-78410](https://avd.aquasec.com/nvd/cve-2026-78410)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | libncursesw6          | [CVE-2025-69720](https://avd.aquasec.com/nvd/cve-2025-69720)   | 6.4-4              | Not reported  | affected       |
| HIGH     | libperl5.36           | [CVE-2026-9538](https://avd.aquasec.com/nvd/cve-2026-9538)     | 5.36.0-7+deb12u4   | Not reported  | fix_deferred   |
| HIGH     | libpython3.11-minimal | [CVE-2026-11940](https://avd.aquasec.com/nvd/cve-2026-11940)   | 3.11.2-6+deb12u9   | Not reported  | fix_deferred   |
| HIGH     | libpython3.11-minimal | [CVE-2026-7210](https://avd.aquasec.com/nvd/cve-2026-7210)     | 3.11.2-6+deb12u9   | Not reported  | affected       |
| HIGH     | libpython3.11-stdlib  | [CVE-2026-11940](https://avd.aquasec.com/nvd/cve-2026-11940)   | 3.11.2-6+deb12u9   | Not reported  | fix_deferred   |
| HIGH     | libpython3.11-stdlib  | [CVE-2026-7210](https://avd.aquasec.com/nvd/cve-2026-7210)     | 3.11.2-6+deb12u9   | Not reported  | affected       |
| HIGH     | libsmartcols1         | [CVE-2026-53613](https://avd.aquasec.com/nvd/cve-2026-53613)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | libsmartcols1         | [CVE-2026-53615](https://avd.aquasec.com/nvd/cve-2026-53615)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | libsmartcols1         | [CVE-2026-78410](https://avd.aquasec.com/nvd/cve-2026-78410)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | libsqlite3-0          | [CVE-2026-11822](https://avd.aquasec.com/nvd/cve-2026-11822)   | 3.40.1-2+deb12u2   | Not reported  | fix_deferred   |
| HIGH     | libsqlite3-0          | [CVE-2026-11824](https://avd.aquasec.com/nvd/cve-2026-11824)   | 3.40.1-2+deb12u2   | Not reported  | fix_deferred   |
| HIGH     | libsqlite3-0          | [CVE-2026-119373](https://avd.aquasec.com/nvd/cve-2026-119373) | 3.40.1-2+deb12u2   | Not reported  | affected       |
| HIGH     | libsystemd0           | [CVE-2026-16742](https://avd.aquasec.com/nvd/cve-2026-16742)   | 252.39-1~deb12u2   | Not reported  | fix_deferred   |
| HIGH     | libtiff6              | [CVE-2023-52355](https://avd.aquasec.com/nvd/cve-2023-52355)   | 4.5.0-6+deb12u4    | Not reported  | will_not_fix   |
| HIGH     | libtiff6              | [CVE-2026-12912](https://avd.aquasec.com/nvd/cve-2026-12912)   | 4.5.0-6+deb12u4    | Not reported  | affected       |
| HIGH     | libtiff6              | [CVE-2026-36849](https://avd.aquasec.com/nvd/cve-2026-36849)   | 4.5.0-6+deb12u4    | Not reported  | fix_deferred   |
| HIGH     | libtiff6              | [CVE-2026-52490](https://avd.aquasec.com/nvd/cve-2026-52490)   | 4.5.0-6+deb12u4    | Not reported  | affected       |
| HIGH     | libtinfo6             | [CVE-2025-69720](https://avd.aquasec.com/nvd/cve-2025-69720)   | 6.4-4              | Not reported  | affected       |
| HIGH     | libudev1              | [CVE-2026-16742](https://avd.aquasec.com/nvd/cve-2026-16742)   | 252.39-1~deb12u2   | Not reported  | fix_deferred   |
| HIGH     | libuuid1              | [CVE-2026-53613](https://avd.aquasec.com/nvd/cve-2026-53613)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | libuuid1              | [CVE-2026-53615](https://avd.aquasec.com/nvd/cve-2026-53615)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | libuuid1              | [CVE-2026-78410](https://avd.aquasec.com/nvd/cve-2026-78410)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | libx11-6              | [CVE-2026-88806](https://avd.aquasec.com/nvd/cve-2026-88806)   | 2:1.8.4-2+deb12u2  | Not reported  | fix_deferred   |
| HIGH     | libx11-data           | [CVE-2026-88806](https://avd.aquasec.com/nvd/cve-2026-88806)   | 2:1.8.4-2+deb12u2  | Not reported  | fix_deferred   |
| HIGH     | libxi6                | [CVE-2026-109089](https://avd.aquasec.com/nvd/cve-2026-109089) | 2:1.8-1+b1         | Not reported  | affected       |
| HIGH     | libxi6                | [CVE-2026-109090](https://avd.aquasec.com/nvd/cve-2026-109090) | 2:1.8-1+b1         | Not reported  | affected       |
| HIGH     | libxrender1           | [CVE-2026-88807](https://avd.aquasec.com/nvd/cve-2026-88807)   | 1:0.9.10-1.1       | Not reported  | fix_deferred   |
| HIGH     | mount                 | [CVE-2026-53613](https://avd.aquasec.com/nvd/cve-2026-53613)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | mount                 | [CVE-2026-53615](https://avd.aquasec.com/nvd/cve-2026-53615)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | mount                 | [CVE-2026-78410](https://avd.aquasec.com/nvd/cve-2026-78410)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | ncurses-base          | [CVE-2025-69720](https://avd.aquasec.com/nvd/cve-2025-69720)   | 6.4-4              | Not reported  | affected       |
| HIGH     | ncurses-bin           | [CVE-2025-69720](https://avd.aquasec.com/nvd/cve-2025-69720)   | 6.4-4              | Not reported  | affected       |
| HIGH     | perl                  | [CVE-2026-9538](https://avd.aquasec.com/nvd/cve-2026-9538)     | 5.36.0-7+deb12u4   | Not reported  | fix_deferred   |
| HIGH     | perl-base             | [CVE-2026-9538](https://avd.aquasec.com/nvd/cve-2026-9538)     | 5.36.0-7+deb12u4   | Not reported  | fix_deferred   |
| HIGH     | perl-modules-5.36     | [CVE-2026-9538](https://avd.aquasec.com/nvd/cve-2026-9538)     | 5.36.0-7+deb12u4   | Not reported  | fix_deferred   |
| HIGH     | python3.11            | [CVE-2026-11940](https://avd.aquasec.com/nvd/cve-2026-11940)   | 3.11.2-6+deb12u9   | Not reported  | fix_deferred   |
| HIGH     | python3.11            | [CVE-2026-7210](https://avd.aquasec.com/nvd/cve-2026-7210)     | 3.11.2-6+deb12u9   | Not reported  | affected       |
| HIGH     | python3.11-minimal    | [CVE-2026-11940](https://avd.aquasec.com/nvd/cve-2026-11940)   | 3.11.2-6+deb12u9   | Not reported  | fix_deferred   |
| HIGH     | python3.11-minimal    | [CVE-2026-7210](https://avd.aquasec.com/nvd/cve-2026-7210)     | 3.11.2-6+deb12u9   | Not reported  | affected       |
| HIGH     | util-linux            | [CVE-2026-53613](https://avd.aquasec.com/nvd/cve-2026-53613)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | util-linux            | [CVE-2026-53615](https://avd.aquasec.com/nvd/cve-2026-53615)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | util-linux            | [CVE-2026-78410](https://avd.aquasec.com/nvd/cve-2026-78410)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | util-linux-extra      | [CVE-2026-53613](https://avd.aquasec.com/nvd/cve-2026-53613)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | util-linux-extra      | [CVE-2026-53615](https://avd.aquasec.com/nvd/cve-2026-53615)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | util-linux-extra      | [CVE-2026-78410](https://avd.aquasec.com/nvd/cve-2026-78410)   | 2.38.1-5+deb12u3   | Not reported  | affected       |
| HIGH     | xdg-utils             | [CVE-2022-4055](https://avd.aquasec.com/nvd/cve-2022-4055)     | 1.1.3-4.1          | Not reported  | fix_deferred   |
| HIGH     | zlib1g                | [CVE-2026-76844](https://avd.aquasec.com/nvd/cve-2026-76844)   | 1:1.2.13.dfsg-1    | Not reported  | affected       |

## Integrity and private execution

The same cached Trivy binary and vulnerability/Java SQLite hashes were verified before and after both scans. They match the original baseline receipt: main `acc7850179a48dbe868f97eb59ea186510800ade8ee815392fa2e7b26875c22d` and Java `7124b5d89aa910c1c79b7cbdd35903ab940762f6ebb27729e558fb197f9ae1db`. Bootstrap used immutable OCI repository digests already recorded; no new download occurred during comparison.

Identical scan arguments were used apart from input/output file paths. Both used archive input, a cleared environment, isolated HOME/TMPDIR/current directory, telemetry/version checks disabled, offline dependency identification and all database/check/VEX updates skipped. A loopback preflight confirmed PermissionError under the same deny-network sandbox. No image/SBOM, source, document or project credential was sent to a service. No container or database operation ran.

Docker 29 reports these saved images at three identity levels: store index, selected arm64 manifest and image config. The requested index blobs were recovered from separate full-index local archives and their SHA-256 verified; each index references the hashed arm64 manifest, which references the hashed config. Config root filesystem diff IDs match both local platform inspection and Trivy's reported image data. The comparison JSON records every digest and both archive hashes; no prefix or unknown-ID acceptance is used.

An initial wrapper stopped after incorrectly comparing the requested Docker index ID with Trivy's config digest. [Its separate failure receipt](AA7_IMAGE_CVE_COMPARE_BINDING_FAILURE_20261106.json) retains the failed wrapper status and complete raw baseline findings. Its exact scanner subprocess exit was not persisted, so it is unknown. The corrected full identity chain was then checked and both scans rerun. Initial and final baseline finding records match exactly. The historical baseline records differ from the new baseline only in opaque Fingerprint fields tied to changed archive paths; packages, counts and all other finding fields match.

The full raw old/new JSON, initial failed attempt, logs, exact commands, timestamps, tool/database/image/archive/source hashes and all remaining findings are retained in the JSON receipts. After coordinator review, both successful raw scans and the initial failed-wrapper raw scan were verified identical to durable JSON objects and their source hashes. Only the exact task-owned temporary tool/cache/archive/log directory was removed, and its absence was checked. Both local image IDs were re-inspected and remain present; all reports and failure evidence remain saved. No global cache pruning or image deletion occurred. Existing baseline reports remain unchanged. Functional worker tests and reduced counts do not close the remaining security, license, accessibility or release requirements.
