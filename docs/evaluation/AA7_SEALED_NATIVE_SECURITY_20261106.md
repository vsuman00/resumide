# AA7 combined native worker security: OPEN

Image: `sha256:382927476a7d5b500351835b57cdf9006a2e229e431b7bfd734c19425be472bc`. Full unsuppressed scan complete. Scanner findings exit code: `1`. Runtime and phase acceptance are separate coordinator/tester work.

| Severity | Historical8f7 | Combined38292747 | Change |
| --- | ---: | ---: | ---: |
| CRITICAL | 0 | 0 | 0 |
| HIGH | 89 | 80 | -9 |
| MEDIUM | 192 | 186 | -6 |
| LOW | 686 | 670 | -16 |
| UNKNOWN | 11 | 11 | 0 |

The candidate has 947 package/CVE matches across 51 source groups, 355 source/CVE pairs, and 354 unique vulnerability identifiers. Exactly31 package/CVE matches disappeared: five each from dirmngr, gnupg, gnupg-l10n, gpg-agent and gpgsm; six from mount. No package/CVE key was added.

## Evidence and limits

The [raw report](AA7_SEALED_NATIVE_SECURITY_20261106_RAW.json) SHA256 is `ebd88e0c10176b00aa792bac78df55fbedc45256ab9a1f30355c0e0a0a45963f`. The [comparison receipt](AA7_SEALED_NATIVE_SECURITY_20261106_COMPARE.json) retains all947 findings, source groups, removed/new matches, remaining critical/high entries, actual command and exit code. Scanner0.76.2 and both actual SQLite databases match the previous private scan exactly; the [bootstrap receipt](AA7_SEALED_NATIVE_SECURITY_20261106_BOOTSTRAP.json) records official tool checksum/binary verification, immutable OCI database pins, actual help, and a successful sandbox network-denial probe. SQLite SHA256 values before and after scanning are:

```text
db      acc7850179a48dbe868f97eb59ea186510800ade8ee815392fa2e7b26875c22d
java-db 7124b5d89aa910c1c79b7cbdd35903ab940762f6ebb27729e558fb197f9ae1db
```

The [identity receipt](AA7_SEALED_NATIVE_SECURITY_20261106_BINDING.json) verifies the full requested OCI index digest, selected Linux arm64 manifest, config digest, every compressed layer digest and uncompressed DiffID, and matching local image metadata. Trivy reported the same config and DiffIDs. The scan used a local archive under macOS sandbox network denial; all severities, unfixed findings and suppressed-finding visibility were enabled. Ignorefile and configuration were empty. Telemetry, version checks and all database/check/VEX updates were disabled. No image, SBOM, application source, credentials or candidate data was uploaded.

Historical8f7 raw SHA256 `4398d1d0df69e01c24969f82c98f6ee50c58d4e009aebf0326015d96010e9363` was rechecked against its earlier complete image identity and same actual database hashes. Its scan was reused with coordinator authorization. It was not rescanned.

The installed Expat source and native build evidence establish the upstream2.10 security cohort and fresh Python/XML linkage. The raw Debian scanner still classifies CVE-2026-113351, CVE-2026-117610 and CVE-2026-118370 as HIGH; CVE-2026-115506 as UNKNOWN; and CVE-2025-66382 as MEDIUM/fix_deferred. All five remain in the raw and comparison reports. Source patch evidence does not erase a scanner finding or establish complete exploitability, applicability, CVE resolution or release acceptance. The sealed Fontconfig change is not claimed to fix CVE-2025-66382.

Source grouping joins every vulnerability's PkgID to its package ID and reconstructs Epoch:Version-Release before accepting the source mapping. An initial analysis incorrectly joined unexpanded Version fields and inflated source counts; its [invalid grouping receipt](AA7_SEALED_NATIVE_SECURITY_20261106_INITIAL_GROUPING.json) is preserved. The raw report and severity counts were unaffected.

## All remaining HIGH source/CVE groups

There are no raw CRITICAL entries. Every remaining HIGH package entry is retained in JSON; this table groups identical source/CVE pairs. FixedVersion is empty for these remaining entries in this exact database snapshot. No reachability or risk waiver is inferred.

| Source | CVE | Package matches | Installed binary versions |
| --- | --- | ---: | --- |
| acl | [CVE-2026-54369](https://security-tracker.debian.org/tracker/CVE-2026-54369) | 1 | `libacl1=2.3.2-2+b1` |
| curl | [CVE-2026-12064](https://security-tracker.debian.org/tracker/CVE-2026-12064) | 1 | `libcurl3t64-gnutls=8.14.1-2+deb13u7` |
| curl | [CVE-2026-8458](https://security-tracker.debian.org/tracker/CVE-2026-8458) | 1 | `libcurl3t64-gnutls=8.14.1-2+deb13u7` |
| expat | [CVE-2026-113351](https://security-tracker.debian.org/tracker/CVE-2026-113351) | 1 | `libexpat1=2.10.0-1~deb13u1+resumide1` |
| expat | [CVE-2026-117610](https://security-tracker.debian.org/tracker/CVE-2026-117610) | 1 | `libexpat1=2.10.0-1~deb13u1+resumide1` |
| expat | [CVE-2026-118370](https://security-tracker.debian.org/tracker/CVE-2026-118370) | 1 | `libexpat1=2.10.0-1~deb13u1+resumide1` |
| gnupg2 | [CVE-2026-24882](https://security-tracker.debian.org/tracker/CVE-2026-24882) | 2 | `gpg=2.4.7-21+deb13u1+b5`; `gpgconf=2.4.7-21+deb13u1+b5` |
| libx11 | [CVE-2026-88806](https://security-tracker.debian.org/tracker/CVE-2026-88806) | 2 | `libx11-6=2:1.8.12-1`; `libx11-data=2:1.8.12-1` |
| libxi | [CVE-2026-109089](https://security-tracker.debian.org/tracker/CVE-2026-109089) | 1 | `libxi6=2:1.8.2-1` |
| libxi | [CVE-2026-109090](https://security-tracker.debian.org/tracker/CVE-2026-109090) | 1 | `libxi6=2:1.8.2-1` |
| libxrender | [CVE-2026-88807](https://security-tracker.debian.org/tracker/CVE-2026-88807) | 1 | `libxrender1=1:0.9.12-1` |
| ncurses | [CVE-2025-69720](https://security-tracker.debian.org/tracker/CVE-2025-69720) | 4 | `libncursesw6=6.5+20250216-2`; `libtinfo6=6.5+20250216-2`; `ncurses-base=6.5+20250216-2`; `ncurses-bin=6.5+20250216-2` |
| perl | [CVE-2026-9538](https://security-tracker.debian.org/tracker/CVE-2026-9538) | 4 | `libperl5.40=5.40.1-6+deb13u1`; `perl-base=5.40.1-6+deb13u1`; `perl-modules-5.40=5.40.1-6+deb13u1`; `perl=5.40.1-6+deb13u1` |
| python3.13 | [CVE-2026-15308](https://security-tracker.debian.org/tracker/CVE-2026-15308) | 4 | `libpython3.13-minimal=3.13.5-2+deb13u5`; `libpython3.13-stdlib=3.13.5-2+deb13u5`; `python3.13-minimal=3.13.5-2+deb13u5`; `python3.13=3.13.5-2+deb13u5` |
| python3.13 | [CVE-2026-19445](https://security-tracker.debian.org/tracker/CVE-2026-19445) | 4 | `libpython3.13-minimal=3.13.5-2+deb13u5`; `libpython3.13-stdlib=3.13.5-2+deb13u5`; `python3.13-minimal=3.13.5-2+deb13u5`; `python3.13=3.13.5-2+deb13u5` |
| python3.13 | [CVE-2026-19553](https://security-tracker.debian.org/tracker/CVE-2026-19553) | 4 | `libpython3.13-minimal=3.13.5-2+deb13u5`; `libpython3.13-stdlib=3.13.5-2+deb13u5`; `python3.13-minimal=3.13.5-2+deb13u5`; `python3.13=3.13.5-2+deb13u5` |
| python3.13 | [CVE-2026-7210](https://security-tracker.debian.org/tracker/CVE-2026-7210) | 4 | `libpython3.13-minimal=3.13.5-2+deb13u5`; `libpython3.13-stdlib=3.13.5-2+deb13u5`; `python3.13-minimal=3.13.5-2+deb13u5`; `python3.13=3.13.5-2+deb13u5` |
| python3.13 | [CVE-2026-82049](https://security-tracker.debian.org/tracker/CVE-2026-82049) | 4 | `libpython3.13-minimal=3.13.5-2+deb13u5`; `libpython3.13-stdlib=3.13.5-2+deb13u5`; `python3.13-minimal=3.13.5-2+deb13u5`; `python3.13=3.13.5-2+deb13u5` |
| sqlite3 | [CVE-2026-119373](https://security-tracker.debian.org/tracker/CVE-2026-119373) | 1 | `libsqlite3-0=3.46.1-7+deb13u2` |
| systemd | [CVE-2026-16742](https://security-tracker.debian.org/tracker/CVE-2026-16742) | 2 | `libsystemd0=257.13-1~deb13u1`; `libudev1=257.13-1~deb13u1` |
| tiff | [CVE-2026-36849](https://security-tracker.debian.org/tracker/CVE-2026-36849) | 1 | `libtiff6=4.7.0-3+deb13u3` |
| tiff | [CVE-2026-52490](https://security-tracker.debian.org/tracker/CVE-2026-52490) | 1 | `libtiff6=4.7.0-3+deb13u3` |
| util-linux | [CVE-2026-76642](https://security-tracker.debian.org/tracker/CVE-2026-76642) | 8 | `bsdutils=1:2.41.5-0+deb13u1`; `libblkid1=2.41.5-0+deb13u1`; `liblastlog2-2=2.41.5-0+deb13u1`; `libmount1=2.41.5-0+deb13u1`; `libsmartcols1=2.41.5-0+deb13u1`; `libuuid1=2.41.5-0+deb13u1`; `login=1:4.16.0-2+really2.41.5-0+deb13u1`; `util-linux=2.41.5-0+deb13u1` |
| util-linux | [CVE-2026-78408](https://security-tracker.debian.org/tracker/CVE-2026-78408) | 8 | `bsdutils=1:2.41.5-0+deb13u1`; `libblkid1=2.41.5-0+deb13u1`; `liblastlog2-2=2.41.5-0+deb13u1`; `libmount1=2.41.5-0+deb13u1`; `libsmartcols1=2.41.5-0+deb13u1`; `libuuid1=2.41.5-0+deb13u1`; `login=1:4.16.0-2+really2.41.5-0+deb13u1`; `util-linux=2.41.5-0+deb13u1` |
| util-linux | [CVE-2026-78409](https://security-tracker.debian.org/tracker/CVE-2026-78409) | 8 | `bsdutils=1:2.41.5-0+deb13u1`; `libblkid1=2.41.5-0+deb13u1`; `liblastlog2-2=2.41.5-0+deb13u1`; `libmount1=2.41.5-0+deb13u1`; `libsmartcols1=2.41.5-0+deb13u1`; `libuuid1=2.41.5-0+deb13u1`; `login=1:4.16.0-2+really2.41.5-0+deb13u1`; `util-linux=2.41.5-0+deb13u1` |
| util-linux | [CVE-2026-78410](https://security-tracker.debian.org/tracker/CVE-2026-78410) | 8 | `bsdutils=1:2.41.5-0+deb13u1`; `libblkid1=2.41.5-0+deb13u1`; `liblastlog2-2=2.41.5-0+deb13u1`; `libmount1=2.41.5-0+deb13u1`; `libsmartcols1=2.41.5-0+deb13u1`; `libuuid1=2.41.5-0+deb13u1`; `login=1:4.16.0-2+really2.41.5-0+deb13u1`; `util-linux=2.41.5-0+deb13u1` |
| xdg-utils | [CVE-2022-4055](https://security-tracker.debian.org/tracker/CVE-2022-4055) | 1 | `xdg-utils=1.2.1-2` |
| zlib | [CVE-2026-76844](https://security-tracker.debian.org/tracker/CVE-2026-76844) | 1 | `zlib1g=1:1.3.dfsg+really1.3.1-1+b1` |

The complete source-group counts, including MEDIUM/LOW/UNKNOWN, are in the comparison receipt. Temporary tool/database/image archives remain in the exact owned0700 directory pending coordinator review and bounded cleanup approval. All previous worker images, failed build attempts and historical raw reports are preserved.
