# AA7 full-security actionability: OPEN

The final22cb image has978 retained matches across51 source packages: 89 high,192 medium,686 low and11 unknown. There are354 unique CVE IDs and355 source/CVE pairs because one ID spans two source packages. All51 groups were joined from the actual raw package SrcName fields to current primary Debian tracker metadata.

Of355 source/CVE pairs,145 have a fixed source version outside Trixie, across26 groups. None is marked resolved in Trixie. Nine pairs have an ignored vendor disposition and ten are postponed. These categories overlap repair availability; they are not additive. Nine upstream source/CVE fixes were independently verified from official maintained releases or commits. The other346 upstream fix states were not independently established. This is not a claim that346 fixes do not exist.

The primary JSON fetch used14.5MB gzip transfer,88.1MB decoded, with bounded transfer/decompression and recorded hashes. An initial identity-encoded fetch exceeded the60MB cap; its partial bytes were never parsed or used as evidence. No source archives were downloaded.

| Source         | Matches | High | Outside-Trixie fixed pairs | Vendor ignored | Vendor postponed | Confirmed upstream fixes | Other upstream states unverified |
| -------------- | ------: | ---: | -------------------------: | -------------: | ---------------: | -----------------------: | -------------------------------: |
| texlive-bin    |     460 |    0 |                          1 |              0 |                0 |                        0 |                               92 |
| python3.13     |      80 |   20 |                         14 |              3 |                0 |                        3 |                               17 |
| util-linux     |      54 |   36 |                          5 |              0 |                0 |                        0 |                                6 |
| glibc          |      44 |    0 |                         14 |              0 |                0 |                        0 |                               22 |
| curl           |      39 |    2 |                         39 |              0 |                0 |                        0 |                               39 |
| gnupg2         |      35 |    7 |                          3 |              0 |                0 |                        0 |                                5 |
| poppler        |      32 |    0 |                          7 |              2 |                0 |                        0 |                               16 |
| krb5           |      24 |    0 |                          3 |              0 |                0 |                        0 |                                6 |
| gcc-14         |      20 |    0 |                          2 |              0 |                0 |                        0 |                                5 |
| perl           |      16 |    4 |                          1 |              0 |                2 |                        0 |                                4 |
| openjpeg2      |      14 |    0 |                          0 |              0 |                4 |                        0 |                               14 |
| sqlite3        |      14 |    1 |                         12 |              0 |                0 |                        0 |                               14 |
| systemd        |      14 |    2 |                          2 |              0 |                0 |                        0 |                                7 |
| tiff           |      14 |    2 |                         10 |              1 |                0 |                        0 |                               14 |
| libxi          |       9 |    2 |                          9 |              0 |                0 |                        0 |                                9 |
| libpdfbox-java |       8 |    0 |                          0 |              2 |                0 |                        0 |                                4 |
| libx11         |       8 |    2 |                          4 |              0 |                0 |                        0 |                                4 |
| ncurses        |       8 |    4 |                          2 |              0 |                0 |                        0 |                                2 |
| gnutls28       |       6 |    0 |                          0 |              0 |                0 |                        0 |                                6 |
| shadow         |       6 |    0 |                          0 |              0 |                0 |                        0 |                                3 |
| texlive-base   |       6 |    0 |                          0 |              0 |                0 |                        0 |                                1 |
| expat          |       5 |    3 |                          4 |              0 |                1 |                        4 |                                1 |
| openldap       |       5 |    0 |                          0 |              0 |                0 |                        0 |                                5 |
| tar            |       5 |    0 |                          0 |              0 |                0 |                        0 |                                5 |
| coreutils      |       4 |    0 |                          0 |              0 |                0 |                        0 |                                4 |
| nss            |       4 |    0 |                          0 |              0 |                0 |                        0 |                                4 |
| pam            |       4 |    0 |                          0 |              0 |                0 |                        0 |                                1 |
| cairo          |       3 |    0 |                          0 |              1 |                1 |                        0 |                                3 |
| xdg-utils      |       3 |    1 |                          0 |              0 |                2 |                        0 |                                3 |
| zlib           |       3 |    1 |                          3 |              0 |                0 |                        2 |                                1 |
| zziplib        |       3 |    0 |                          0 |              0 |                0 |                        0 |                                3 |
| acl            |       2 |    1 |                          2 |              0 |                0 |                        0 |                                2 |
| apt            |       2 |    0 |                          0 |              0 |                0 |                        0 |                                1 |
| cyrus-sasl2    |       2 |    0 |                          1 |              0 |                0 |                        0 |                                1 |
| dash           |       2 |    0 |                          0 |              0 |                0 |                        0 |                                2 |
| glib2.0        |       2 |    0 |                          0 |              0 |                0 |                        0 |                                2 |
| libgcrypt20    |       2 |    0 |                          0 |              0 |                0 |                        0 |                                2 |
| libpng1.6      |       2 |    0 |                          0 |              0 |                0 |                        0 |                                2 |
| p11-kit        |       2 |    0 |                          2 |              0 |                0 |                        0 |                                2 |
| attr           |       1 |    0 |                          1 |              0 |                0 |                        0 |                                1 |
| bash           |       1 |    0 |                          0 |              0 |                0 |                        0 |                                1 |
| bzip2          |       1 |    0 |                          0 |              0 |                0 |                        0 |                                1 |
| diffutils      |       1 |    0 |                          0 |              0 |                0 |                        0 |                                1 |
| freetype       |       1 |    0 |                          1 |              0 |                0 |                        0 |                                1 |
| jbigkit        |       1 |    0 |                          0 |              0 |                0 |                        0 |                                1 |
| lcms2          |       1 |    0 |                          0 |              0 |                0 |                        0 |                                1 |
| libxpm         |       1 |    0 |                          1 |              0 |                0 |                        0 |                                1 |
| libxrender     |       1 |    1 |                          1 |              0 |                0 |                        0 |                                1 |
| nghttp2        |       1 |    0 |                          1 |              0 |                0 |                        0 |                                1 |
| pixman         |       1 |    0 |                          0 |              0 |                0 |                        0 |                                1 |
| sysvinit       |       1 |    0 |                          0 |              0 |                0 |                        0 |                                1 |

## Confirmed upstream paths

- [Expat2.10.0](https://raw.githubusercontent.com/libexpat/libexpat/R_2_10_0/expat/Changes) fixes113351,115506,117610 and118370. Both integer-overflow commits are needed for118370. Include upstream regressions; do not assume the release fixes postponed2025-66382.
- [Python3.13 patch](https://github.com/python/cpython/commit/fc9b11ff49cbc82e6f917d07a61517a2b5f3145f) fixes7210 when Expat>=2.8 is used. Rebuild coherent interpreter/modules, including internal hash-secret changes. [Python3.13.18](https://www.python.org/downloads/release/python-31318/) also identifies fixes114583 and115557, but its bundled Expat2.9 still leaves late Expat issues.
- [zlib1.4](https://zlib.net/) and [the gzwrite patch](https://github.com/madler/zlib/commit/df84af25dc1942490e1d1c899a07619152a46148) fix85091 and [76844](https://security-tracker.debian.org/tracker/CVE-2026-76844). Trixie1.3.1 lacks newer state->again context; a source backport needs adaptation and failed-write/EPIPE/gzclearerr tests.

## Concrete remaining work

1. Keep full securityOPEN:978 findings remain and no remediation of those findings is claimed.
2. Review actual final runtime/closure evidence before proposing removal. The supervisor currently parses pdftotext output with ElementTree; deleting Python/Expat would require replacing and verifying that artifact-validation contract. Existing compiler evidence includes zlib. No sandbox or resource limit is treated as a reachability exemption.
3. For the145 vendor-fixed source/CVE pairs, inspect authenticated source diffs and native Trixie rebuild feasibility. Prioritize required runtime high findings. Do not install unstable binaries.
4. Review the proven upstream Expat/Python/zlib cohorts as explicit source-package recipes with checksums, complete patches, real package provenance, ABI checks and upstream regressions. No such build is approved or performed by this report.
5. Investigate the210 pairs lacking an established outside-Trixie fixed version, including individual ignored/postponed notes. Several vendor notes explicitly await an upstream fix or regression resolution; exact records and URLs remain in JSON. These are outstanding research/engineering obligations, not invented universal impossibility.
6. Rebuild only reviewed changes, regenerate closure, pass required parser/compiler/PDF/layout/runtime/browser checks, then rerun the full unsuppressed scan. Preserve residual findings and formal phase requirements; do not close through ignored statuses, package-metadata deletion or version relabeling.

The complete per-CVE vendor records, exact fixed versions outside Trixie, source versions, statuses, upstream proofs and next actions are in [the actionability JSON](AA7_FULL_SECURITY_ACTIONABILITY_20261106.json). Primary source: [Debian Security Tracker data](https://security-tracker.debian.org/tracker/data/json). [Final raw scan](AA7_FULL_SECURITY_FINAL_RAW_20261106.json) and [full final identity/scan evidence](AA7_FULL_SECURITY_FINAL_COMPARE_20261106.json) remain unchanged.

## Specific pending vendor or upstream records

These examples are separate from the210 pairs whose outside-Trixie fix availability was not established. They do not make all355 pairs unfixable.

| Source / CVE                                                                            | Actual installed binary version                                       | Primary vendor status and limitation                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expat / [CVE-2025-66382](https://security-tracker.debian.org/tracker/CVE-2025-66382)    | libexpat1 `2.9.0-1~deb13u1`                                           | Trixie open/postponed: “Minor issue, revisit when fixed upstream”; sid2.10.0-1 remains open. [Upstream1076](https://github.com/libexpat/libexpat/issues/1076) remains open and explicitly describes an unfixed issue affecting all releases. Expat2.10 fixes other CVEs but does not establish resolution here. |
| OpenJPEG / [CVE-2023-39327](https://security-tracker.debian.org/tracker/CVE-2023-39327) | libopenjp2-7 `2.5.3-2.1~deb13u2`                                      | Trixie open/postponed with the await-upstream note; sid2.5.4-1.1 remains open. [Upstream1472](https://github.com/uclouvain/openjpeg/issues/1472) remains open. Vendor calls the2.5.3 commit only a partial mitigation.                                                                                          |
| xdg-utils / [CVE-2022-4055](https://security-tracker.debian.org/tracker/CVE-2022-4055)  | xdg-utils `1.2.1-2`                                                   | Trixie/forky/sid remain open/unfixed; Trixie postponed with the await-upstream note. The linked upstream merge request was not independently verified, so absence of any proposed patch is not established.                                                                                                     |
| Perl / [CVE-2026-9538](https://security-tracker.debian.org/tracker/CVE-2026-9538)       | perl, libperl5.40, perl-base and perl-modules-5.40 `5.40.1-6+deb13u1` | Trixie open/postponed: “Minor issue; wait for regressions upstream sorted out”. Sid/forky5.42.3-1 is fixed and Archive::Tar3.10 has a patch. This is a stable backport/regression issue, not missing upstream code.                                                                                             |

The coordinator reported22cb's runtime macro-fixture failure separately. This report assesses the exact static inventory and available repair evidence; it supplies no functional-pass or full-phase acceptance claim.
