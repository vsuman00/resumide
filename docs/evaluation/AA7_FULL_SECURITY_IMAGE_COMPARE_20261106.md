# AA7 full-security image comparison

Status: comparison completed with findings. The full vulnerability-remediation target remains incomplete. Both scans exited 1 because findings remain.

The confirmed Trixie image removes the three critical matches present in baseline19d2. It has 20 more total matches and 19 more high matches. No finding was suppressed; every raw scan is retained separately.

| Image        | Critical | High | Medium | Low | Unknown | Total | Unique IDs |
| ------------ | -------: | ---: | -----: | --: | ------: | ----: | ---------: |
| Baseline19d2 |        3 |   70 |    206 | 667 |      12 |   958 |        360 |
| Trixie9890   |        0 |   89 |    192 | 686 |      11 |   978 |        354 |

The Trixie result contains 51 affected source groups. All 978 matches have an empty `FixedVersion` in the current Debian13 scanner database: 940 affected, 22 will-not-fix and 16 fix-deferred records. That describes distro fix availability in this database. Supported upstream patches exist for several remaining findings; an empty field does not establish a technical blocker. Python pypdf6.21.4 has zero scanner findings.

Both actual database hashes match before and after both scans and match the prior comparison. Baseline severity counts reproduce the previous958 result exactly. The Trivy0.76.2 executable, public immutable database manifests and database files were independently verified during the new bootstrap. Each scan ran with a cleared environment, explicit all-severity selection, unfixed records included, empty ignore/config paths, suppressed findings shown, all updates/telemetry/version checks off and enforced macOS network denial. Socket preflight returned EPERM.

For each exact requested Docker29 image index, both full-index and selected-arm64 archives were saved locally. Content hashes verify index → arm64 manifest → config → every compressed layer blob and every uncompressed rootfs diff ID. Local inspect rootfs metadata, both archive manifests/configs and Trivy config/DiffIDs match. No container was run, image/SBOM/source uploaded, application credential forwarded, database project changed or provider invoked.

Pair differences include package renames across distributions: 246 new package/CVE pairs and 226 removed pairs. There are 60 new unique IDs and 66 removed unique IDs. These are inventory differences, not exploitability conclusions.

## Source groups

| Source package | Matches | High | Medium | Low | Unknown | Current distro fixed-version matches |
| -------------- | ------: | ---: | -----: | --: | ------: | -----------------------------------: |
| texlive-bin    |     460 |    0 |      0 | 460 |       0 |                                    0 |
| python3.13     |      80 |   20 |     40 |  16 |       4 |                                    0 |
| util-linux     |      54 |   36 |      9 |   9 |       0 |                                    0 |
| glibc          |      44 |    0 |     28 |  16 |       0 |                                    0 |
| curl           |      39 |    2 |      9 |  28 |       0 |                                    0 |
| gnupg2         |      35 |    7 |      7 |  21 |       0 |                                    0 |
| poppler        |      32 |    0 |     14 |  18 |       0 |                                    0 |
| krb5           |      24 |    0 |      8 |  16 |       0 |                                    0 |
| gcc-14         |      20 |    0 |     20 |   0 |       0 |                                    0 |
| perl           |      16 |    4 |      8 |   4 |       0 |                                    0 |
| openjpeg2      |      14 |    0 |      3 |  11 |       0 |                                    0 |
| sqlite3        |      14 |    1 |      4 |   3 |       6 |                                    0 |
| systemd        |      14 |    2 |      2 |  10 |       0 |                                    0 |
| tiff           |      14 |    2 |      1 |  11 |       0 |                                    0 |
| libxi          |       9 |    2 |      7 |   0 |       0 |                                    0 |
| libpdfbox-java |       8 |    0 |      4 |   4 |       0 |                                    0 |
| libx11         |       8 |    2 |      6 |   0 |       0 |                                    0 |
| ncurses        |       8 |    4 |      0 |   4 |       0 |                                    0 |
| gnutls28       |       6 |    0 |      0 |   6 |       0 |                                    0 |
| shadow         |       6 |    0 |      0 |   6 |       0 |                                    0 |
| texlive-base   |       6 |    0 |      0 |   6 |       0 |                                    0 |
| expat          |       5 |    3 |      1 |   0 |       1 |                                    0 |
| openldap       |       5 |    0 |      0 |   5 |       0 |                                    0 |
| tar            |       5 |    0 |      3 |   2 |       0 |                                    0 |
| coreutils      |       4 |    0 |      0 |   4 |       0 |                                    0 |
| nss            |       4 |    0 |      0 |   4 |       0 |                                    0 |
| pam            |       4 |    0 |      4 |   0 |       0 |                                    0 |
| cairo          |       3 |    0 |      0 |   3 |       0 |                                    0 |
| xdg-utils      |       3 |    1 |      1 |   1 |       0 |                                    0 |
| zlib           |       3 |    1 |      2 |   0 |       0 |                                    0 |
| zziplib        |       3 |    0 |      0 |   3 |       0 |                                    0 |
| acl            |       2 |    1 |      1 |   0 |       0 |                                    0 |
| apt            |       2 |    0 |      0 |   2 |       0 |                                    0 |
| cyrus-sasl2    |       2 |    0 |      2 |   0 |       0 |                                    0 |
| dash           |       2 |    0 |      0 |   2 |       0 |                                    0 |
| glib2.0        |       2 |    0 |      1 |   1 |       0 |                                    0 |
| libgcrypt20    |       2 |    0 |      0 |   2 |       0 |                                    0 |
| libpng1.6      |       2 |    0 |      0 |   2 |       0 |                                    0 |
| p11-kit        |       2 |    0 |      2 |   0 |       0 |                                    0 |
| attr           |       1 |    0 |      1 |   0 |       0 |                                    0 |
| bash           |       1 |    0 |      0 |   1 |       0 |                                    0 |
| bzip2          |       1 |    0 |      1 |   0 |       0 |                                    0 |
| diffutils      |       1 |    0 |      0 |   1 |       0 |                                    0 |
| freetype       |       1 |    0 |      1 |   0 |       0 |                                    0 |
| jbigkit        |       1 |    0 |      0 |   1 |       0 |                                    0 |
| lcms2          |       1 |    0 |      0 |   1 |       0 |                                    0 |
| libxpm         |       1 |    0 |      1 |   0 |       0 |                                    0 |
| libxrender     |       1 |    1 |      0 |   0 |       0 |                                    0 |
| nghttp2        |       1 |    0 |      1 |   0 |       0 |                                    0 |
| pixman         |       1 |    0 |      0 |   1 |       0 |                                    0 |
| sysvinit       |       1 |    0 |      0 |   1 |       0 |                                    0 |

## Every remaining critical/high match

There are no critical matches and 89 high matches. The table retains every high package/CVE match, including repeated CVEs on distinct binary packages.

| Package               | Installed version                 | CVE                                                                            | Severity | Status       | FixedVersion |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------------ | -------- | ------------ | ------------ |
| bsdutils              | 1:2.41.5-0+deb13u1                | [CVE-2026-76642](https://security-tracker.debian.org/tracker/CVE-2026-76642)   | HIGH     | affected     | not supplied |
| bsdutils              | 1:2.41.5-0+deb13u1                | [CVE-2026-78408](https://security-tracker.debian.org/tracker/CVE-2026-78408)   | HIGH     | affected     | not supplied |
| bsdutils              | 1:2.41.5-0+deb13u1                | [CVE-2026-78409](https://security-tracker.debian.org/tracker/CVE-2026-78409)   | HIGH     | affected     | not supplied |
| bsdutils              | 1:2.41.5-0+deb13u1                | [CVE-2026-78410](https://security-tracker.debian.org/tracker/CVE-2026-78410)   | HIGH     | affected     | not supplied |
| dirmngr               | 2.4.7-21+deb13u1+b5               | [CVE-2026-24882](https://security-tracker.debian.org/tracker/CVE-2026-24882)   | HIGH     | affected     | not supplied |
| gnupg                 | 2.4.7-21+deb13u1                  | [CVE-2026-24882](https://security-tracker.debian.org/tracker/CVE-2026-24882)   | HIGH     | affected     | not supplied |
| gnupg-l10n            | 2.4.7-21+deb13u1                  | [CVE-2026-24882](https://security-tracker.debian.org/tracker/CVE-2026-24882)   | HIGH     | affected     | not supplied |
| gpg                   | 2.4.7-21+deb13u1+b5               | [CVE-2026-24882](https://security-tracker.debian.org/tracker/CVE-2026-24882)   | HIGH     | affected     | not supplied |
| gpg-agent             | 2.4.7-21+deb13u1+b5               | [CVE-2026-24882](https://security-tracker.debian.org/tracker/CVE-2026-24882)   | HIGH     | affected     | not supplied |
| gpgconf               | 2.4.7-21+deb13u1+b5               | [CVE-2026-24882](https://security-tracker.debian.org/tracker/CVE-2026-24882)   | HIGH     | affected     | not supplied |
| gpgsm                 | 2.4.7-21+deb13u1+b5               | [CVE-2026-24882](https://security-tracker.debian.org/tracker/CVE-2026-24882)   | HIGH     | affected     | not supplied |
| libacl1               | 2.3.2-2+b1                        | [CVE-2026-54369](https://security-tracker.debian.org/tracker/CVE-2026-54369)   | HIGH     | affected     | not supplied |
| libblkid1             | 2.41.5-0+deb13u1                  | [CVE-2026-76642](https://security-tracker.debian.org/tracker/CVE-2026-76642)   | HIGH     | affected     | not supplied |
| libblkid1             | 2.41.5-0+deb13u1                  | [CVE-2026-78408](https://security-tracker.debian.org/tracker/CVE-2026-78408)   | HIGH     | affected     | not supplied |
| libblkid1             | 2.41.5-0+deb13u1                  | [CVE-2026-78409](https://security-tracker.debian.org/tracker/CVE-2026-78409)   | HIGH     | affected     | not supplied |
| libblkid1             | 2.41.5-0+deb13u1                  | [CVE-2026-78410](https://security-tracker.debian.org/tracker/CVE-2026-78410)   | HIGH     | affected     | not supplied |
| libcurl3t64-gnutls    | 8.14.1-2+deb13u7                  | [CVE-2026-12064](https://security-tracker.debian.org/tracker/CVE-2026-12064)   | HIGH     | affected     | not supplied |
| libcurl3t64-gnutls    | 8.14.1-2+deb13u7                  | [CVE-2026-8458](https://security-tracker.debian.org/tracker/CVE-2026-8458)     | HIGH     | affected     | not supplied |
| libexpat1             | 2.9.0-1~deb13u1                   | [CVE-2026-113351](https://security-tracker.debian.org/tracker/CVE-2026-113351) | HIGH     | affected     | not supplied |
| libexpat1             | 2.9.0-1~deb13u1                   | [CVE-2026-117610](https://security-tracker.debian.org/tracker/CVE-2026-117610) | HIGH     | affected     | not supplied |
| libexpat1             | 2.9.0-1~deb13u1                   | [CVE-2026-118370](https://security-tracker.debian.org/tracker/CVE-2026-118370) | HIGH     | affected     | not supplied |
| liblastlog2-2         | 2.41.5-0+deb13u1                  | [CVE-2026-76642](https://security-tracker.debian.org/tracker/CVE-2026-76642)   | HIGH     | affected     | not supplied |
| liblastlog2-2         | 2.41.5-0+deb13u1                  | [CVE-2026-78408](https://security-tracker.debian.org/tracker/CVE-2026-78408)   | HIGH     | affected     | not supplied |
| liblastlog2-2         | 2.41.5-0+deb13u1                  | [CVE-2026-78409](https://security-tracker.debian.org/tracker/CVE-2026-78409)   | HIGH     | affected     | not supplied |
| liblastlog2-2         | 2.41.5-0+deb13u1                  | [CVE-2026-78410](https://security-tracker.debian.org/tracker/CVE-2026-78410)   | HIGH     | affected     | not supplied |
| libmount1             | 2.41.5-0+deb13u1                  | [CVE-2026-76642](https://security-tracker.debian.org/tracker/CVE-2026-76642)   | HIGH     | affected     | not supplied |
| libmount1             | 2.41.5-0+deb13u1                  | [CVE-2026-78408](https://security-tracker.debian.org/tracker/CVE-2026-78408)   | HIGH     | affected     | not supplied |
| libmount1             | 2.41.5-0+deb13u1                  | [CVE-2026-78409](https://security-tracker.debian.org/tracker/CVE-2026-78409)   | HIGH     | affected     | not supplied |
| libmount1             | 2.41.5-0+deb13u1                  | [CVE-2026-78410](https://security-tracker.debian.org/tracker/CVE-2026-78410)   | HIGH     | affected     | not supplied |
| libncursesw6          | 6.5+20250216-2                    | [CVE-2025-69720](https://security-tracker.debian.org/tracker/CVE-2025-69720)   | HIGH     | affected     | not supplied |
| libperl5.40           | 5.40.1-6+deb13u1                  | [CVE-2026-9538](https://security-tracker.debian.org/tracker/CVE-2026-9538)     | HIGH     | fix_deferred | not supplied |
| libpython3.13-minimal | 3.13.5-2+deb13u5                  | [CVE-2026-15308](https://security-tracker.debian.org/tracker/CVE-2026-15308)   | HIGH     | affected     | not supplied |
| libpython3.13-minimal | 3.13.5-2+deb13u5                  | [CVE-2026-19445](https://security-tracker.debian.org/tracker/CVE-2026-19445)   | HIGH     | affected     | not supplied |
| libpython3.13-minimal | 3.13.5-2+deb13u5                  | [CVE-2026-19553](https://security-tracker.debian.org/tracker/CVE-2026-19553)   | HIGH     | affected     | not supplied |
| libpython3.13-minimal | 3.13.5-2+deb13u5                  | [CVE-2026-7210](https://security-tracker.debian.org/tracker/CVE-2026-7210)     | HIGH     | affected     | not supplied |
| libpython3.13-minimal | 3.13.5-2+deb13u5                  | [CVE-2026-82049](https://security-tracker.debian.org/tracker/CVE-2026-82049)   | HIGH     | affected     | not supplied |
| libpython3.13-stdlib  | 3.13.5-2+deb13u5                  | [CVE-2026-15308](https://security-tracker.debian.org/tracker/CVE-2026-15308)   | HIGH     | affected     | not supplied |
| libpython3.13-stdlib  | 3.13.5-2+deb13u5                  | [CVE-2026-19445](https://security-tracker.debian.org/tracker/CVE-2026-19445)   | HIGH     | affected     | not supplied |
| libpython3.13-stdlib  | 3.13.5-2+deb13u5                  | [CVE-2026-19553](https://security-tracker.debian.org/tracker/CVE-2026-19553)   | HIGH     | affected     | not supplied |
| libpython3.13-stdlib  | 3.13.5-2+deb13u5                  | [CVE-2026-7210](https://security-tracker.debian.org/tracker/CVE-2026-7210)     | HIGH     | affected     | not supplied |
| libpython3.13-stdlib  | 3.13.5-2+deb13u5                  | [CVE-2026-82049](https://security-tracker.debian.org/tracker/CVE-2026-82049)   | HIGH     | affected     | not supplied |
| libsmartcols1         | 2.41.5-0+deb13u1                  | [CVE-2026-76642](https://security-tracker.debian.org/tracker/CVE-2026-76642)   | HIGH     | affected     | not supplied |
| libsmartcols1         | 2.41.5-0+deb13u1                  | [CVE-2026-78408](https://security-tracker.debian.org/tracker/CVE-2026-78408)   | HIGH     | affected     | not supplied |
| libsmartcols1         | 2.41.5-0+deb13u1                  | [CVE-2026-78409](https://security-tracker.debian.org/tracker/CVE-2026-78409)   | HIGH     | affected     | not supplied |
| libsmartcols1         | 2.41.5-0+deb13u1                  | [CVE-2026-78410](https://security-tracker.debian.org/tracker/CVE-2026-78410)   | HIGH     | affected     | not supplied |
| libsqlite3-0          | 3.46.1-7+deb13u2                  | [CVE-2026-119373](https://security-tracker.debian.org/tracker/CVE-2026-119373) | HIGH     | affected     | not supplied |
| libsystemd0           | 257.13-1~deb13u1                  | [CVE-2026-16742](https://security-tracker.debian.org/tracker/CVE-2026-16742)   | HIGH     | affected     | not supplied |
| libtiff6              | 4.7.0-3+deb13u3                   | [CVE-2026-36849](https://security-tracker.debian.org/tracker/CVE-2026-36849)   | HIGH     | will_not_fix | not supplied |
| libtiff6              | 4.7.0-3+deb13u3                   | [CVE-2026-52490](https://security-tracker.debian.org/tracker/CVE-2026-52490)   | HIGH     | affected     | not supplied |
| libtinfo6             | 6.5+20250216-2                    | [CVE-2025-69720](https://security-tracker.debian.org/tracker/CVE-2025-69720)   | HIGH     | affected     | not supplied |
| libudev1              | 257.13-1~deb13u1                  | [CVE-2026-16742](https://security-tracker.debian.org/tracker/CVE-2026-16742)   | HIGH     | affected     | not supplied |
| libuuid1              | 2.41.5-0+deb13u1                  | [CVE-2026-76642](https://security-tracker.debian.org/tracker/CVE-2026-76642)   | HIGH     | affected     | not supplied |
| libuuid1              | 2.41.5-0+deb13u1                  | [CVE-2026-78408](https://security-tracker.debian.org/tracker/CVE-2026-78408)   | HIGH     | affected     | not supplied |
| libuuid1              | 2.41.5-0+deb13u1                  | [CVE-2026-78409](https://security-tracker.debian.org/tracker/CVE-2026-78409)   | HIGH     | affected     | not supplied |
| libuuid1              | 2.41.5-0+deb13u1                  | [CVE-2026-78410](https://security-tracker.debian.org/tracker/CVE-2026-78410)   | HIGH     | affected     | not supplied |
| libx11-6              | 2:1.8.12-1                        | [CVE-2026-88806](https://security-tracker.debian.org/tracker/CVE-2026-88806)   | HIGH     | affected     | not supplied |
| libx11-data           | 2:1.8.12-1                        | [CVE-2026-88806](https://security-tracker.debian.org/tracker/CVE-2026-88806)   | HIGH     | affected     | not supplied |
| libxi6                | 2:1.8.2-1                         | [CVE-2026-109089](https://security-tracker.debian.org/tracker/CVE-2026-109089) | HIGH     | affected     | not supplied |
| libxi6                | 2:1.8.2-1                         | [CVE-2026-109090](https://security-tracker.debian.org/tracker/CVE-2026-109090) | HIGH     | affected     | not supplied |
| libxrender1           | 1:0.9.12-1                        | [CVE-2026-88807](https://security-tracker.debian.org/tracker/CVE-2026-88807)   | HIGH     | affected     | not supplied |
| login                 | 1:4.16.0-2+really2.41.5-0+deb13u1 | [CVE-2026-76642](https://security-tracker.debian.org/tracker/CVE-2026-76642)   | HIGH     | affected     | not supplied |
| login                 | 1:4.16.0-2+really2.41.5-0+deb13u1 | [CVE-2026-78408](https://security-tracker.debian.org/tracker/CVE-2026-78408)   | HIGH     | affected     | not supplied |
| login                 | 1:4.16.0-2+really2.41.5-0+deb13u1 | [CVE-2026-78409](https://security-tracker.debian.org/tracker/CVE-2026-78409)   | HIGH     | affected     | not supplied |
| login                 | 1:4.16.0-2+really2.41.5-0+deb13u1 | [CVE-2026-78410](https://security-tracker.debian.org/tracker/CVE-2026-78410)   | HIGH     | affected     | not supplied |
| mount                 | 2.41.5-0+deb13u1                  | [CVE-2026-76642](https://security-tracker.debian.org/tracker/CVE-2026-76642)   | HIGH     | affected     | not supplied |
| mount                 | 2.41.5-0+deb13u1                  | [CVE-2026-78408](https://security-tracker.debian.org/tracker/CVE-2026-78408)   | HIGH     | affected     | not supplied |
| mount                 | 2.41.5-0+deb13u1                  | [CVE-2026-78409](https://security-tracker.debian.org/tracker/CVE-2026-78409)   | HIGH     | affected     | not supplied |
| mount                 | 2.41.5-0+deb13u1                  | [CVE-2026-78410](https://security-tracker.debian.org/tracker/CVE-2026-78410)   | HIGH     | affected     | not supplied |
| ncurses-base          | 6.5+20250216-2                    | [CVE-2025-69720](https://security-tracker.debian.org/tracker/CVE-2025-69720)   | HIGH     | affected     | not supplied |
| ncurses-bin           | 6.5+20250216-2                    | [CVE-2025-69720](https://security-tracker.debian.org/tracker/CVE-2025-69720)   | HIGH     | affected     | not supplied |
| perl                  | 5.40.1-6+deb13u1                  | [CVE-2026-9538](https://security-tracker.debian.org/tracker/CVE-2026-9538)     | HIGH     | fix_deferred | not supplied |
| perl-base             | 5.40.1-6+deb13u1                  | [CVE-2026-9538](https://security-tracker.debian.org/tracker/CVE-2026-9538)     | HIGH     | fix_deferred | not supplied |
| perl-modules-5.40     | 5.40.1-6+deb13u1                  | [CVE-2026-9538](https://security-tracker.debian.org/tracker/CVE-2026-9538)     | HIGH     | fix_deferred | not supplied |
| python3.13            | 3.13.5-2+deb13u5                  | [CVE-2026-15308](https://security-tracker.debian.org/tracker/CVE-2026-15308)   | HIGH     | affected     | not supplied |
| python3.13            | 3.13.5-2+deb13u5                  | [CVE-2026-19445](https://security-tracker.debian.org/tracker/CVE-2026-19445)   | HIGH     | affected     | not supplied |
| python3.13            | 3.13.5-2+deb13u5                  | [CVE-2026-19553](https://security-tracker.debian.org/tracker/CVE-2026-19553)   | HIGH     | affected     | not supplied |
| python3.13            | 3.13.5-2+deb13u5                  | [CVE-2026-7210](https://security-tracker.debian.org/tracker/CVE-2026-7210)     | HIGH     | affected     | not supplied |
| python3.13            | 3.13.5-2+deb13u5                  | [CVE-2026-82049](https://security-tracker.debian.org/tracker/CVE-2026-82049)   | HIGH     | affected     | not supplied |
| python3.13-minimal    | 3.13.5-2+deb13u5                  | [CVE-2026-15308](https://security-tracker.debian.org/tracker/CVE-2026-15308)   | HIGH     | affected     | not supplied |
| python3.13-minimal    | 3.13.5-2+deb13u5                  | [CVE-2026-19445](https://security-tracker.debian.org/tracker/CVE-2026-19445)   | HIGH     | affected     | not supplied |
| python3.13-minimal    | 3.13.5-2+deb13u5                  | [CVE-2026-19553](https://security-tracker.debian.org/tracker/CVE-2026-19553)   | HIGH     | affected     | not supplied |
| python3.13-minimal    | 3.13.5-2+deb13u5                  | [CVE-2026-7210](https://security-tracker.debian.org/tracker/CVE-2026-7210)     | HIGH     | affected     | not supplied |
| python3.13-minimal    | 3.13.5-2+deb13u5                  | [CVE-2026-82049](https://security-tracker.debian.org/tracker/CVE-2026-82049)   | HIGH     | affected     | not supplied |
| util-linux            | 2.41.5-0+deb13u1                  | [CVE-2026-76642](https://security-tracker.debian.org/tracker/CVE-2026-76642)   | HIGH     | affected     | not supplied |
| util-linux            | 2.41.5-0+deb13u1                  | [CVE-2026-78408](https://security-tracker.debian.org/tracker/CVE-2026-78408)   | HIGH     | affected     | not supplied |
| util-linux            | 2.41.5-0+deb13u1                  | [CVE-2026-78409](https://security-tracker.debian.org/tracker/CVE-2026-78409)   | HIGH     | affected     | not supplied |
| util-linux            | 2.41.5-0+deb13u1                  | [CVE-2026-78410](https://security-tracker.debian.org/tracker/CVE-2026-78410)   | HIGH     | affected     | not supplied |
| xdg-utils             | 1.2.1-2                           | [CVE-2022-4055](https://security-tracker.debian.org/tracker/CVE-2022-4055)     | HIGH     | fix_deferred | not supplied |
| zlib1g                | 1:1.3.dfsg+really1.3.1-1+b1       | [CVE-2026-76844](https://security-tracker.debian.org/tracker/CVE-2026-76844)   | HIGH     | affected     | not supplied |

## Evidence and next action

[Complete metadata, bindings, arguments, deltas and all978 normalized matches](AA7_FULL_SECURITY_IMAGE_COMPARE_20261106.json); [baseline raw JSON](AA7_FULL_SECURITY_BASELINE_RAW_20261106.json); [Trixie raw JSON](AA7_FULL_SECURITY_TRIXIE_RAW_20261106.json); [bootstrap and failed Java-download attempt](AA7_FULL_SECURITY_BOOTSTRAP_20261106.json). Earlier958 and old seven-record/new zero-record application audit evidence remain unchanged and separate.

The task-owned private archive/tool/database directory remains retained for review, with no running process. Both Docker images remain. Further source backports or removal need a reviewed implementation and full validation; this report supplies no risk waiver, scanner suppression, reachability exemption or phase/release acceptance.
