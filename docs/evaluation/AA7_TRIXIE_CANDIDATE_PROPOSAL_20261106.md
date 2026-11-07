# AA7 Trixie worker candidate proposal

Status: prepared in an isolated worktree; not built or accepted. Existing19d2 image and application configuration remain unchanged.

The owner authorized private dependency/base remediation. The proposed dated Debian13 base is digest-pinned; both fixed-snapshot repository releases were authenticated with the installed Debian archive keyring. Package metadata covers all958 baseline matches across53 source groups, including medium/low/unknown findings. Availability is not proof that an installed package fixes a vulnerability.

## Authenticated inputs

- Snapshot: `20261106T000000Z`, `trixie main` and `trixie-security main`.
- Base: `debian:trixie-20261104-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2`.
- Main signed Packages SHA256: `be16b37b2f740f066ea93d35d56f04f94d63693e5a3eb421b052bf86fae75bcd`; 9614192 bytes.
- Security signed Packages SHA256: `d8c68d608f887ed0e3c00dfd19ab78877477a0fbe247ae0c4f005d07104ca2da`; 298816 bytes.
- Main snapshot index fetches returned504. Official Debian CDN by-hash returned identical bytes matching the signed snapshot hash/size. This metadata transport does not change the proposed Dockerfile repository.
- Full signed release text, signature fingerprints, fetch receipts, per-package metadata and source hashes are in the [JSON proposal](AA7_TRIXIE_CANDIDATE_PROPOSAL_20261106.json).

## Direct runtime package availability

| Package                   | Main                        | Security          |
| ------------------------- | --------------------------- | ----------------- |
| libglib2.0-0t64           | 2.84.4-3~deb13u5            | absent            |
| libsqlite3-0              | 3.46.1-7+deb13u2            | absent            |
| zlib1g                    | 1:1.3.dfsg+really1.3.1-1+b1 | absent            |
| libexpat1                 | 2.8.3-1~deb13u1             | 2.9.0-1~deb13u1   |
| python3.13                | 3.13.5-2+deb13u5            | absent            |
| apt                       | 3.0.3                       | 3.0.4             |
| libapt-pkg7.0             | 3.0.3                       | 3.0.4             |
| texlive-xetex             | 2024.20250309-1             | absent            |
| texlive-latex-extra       | 2024.20250309-2             | absent            |
| texlive-fonts-recommended | 2024.20250309-1             | absent            |
| poppler-utils             | 25.03.0-5+deb13u4           | 25.03.0-5+deb13u3 |

## Known residuals and bounded next action

Trixie GLib2.84.4-3~deb13u5 and SQLite3.46.1-7+deb13u2 include the vendor fixes for [CVE-2026-58016](https://security-tracker.debian.org/tracker/CVE-2026-58016) and [CVE-2025-7458](https://security-tracker.debian.org/tracker/CVE-2025-7458). [CVE-2023-45853](https://security-tracker.debian.org/tracker/CVE-2023-45853) is fixed in Trixie zlib; Debian also qualifies the prior Bookworm binaries because the affected contrib/minizip code was not built. All baseline raw findings remain recorded.

Stable migration alone cannot satisfy a zero-vulnerability claim. The current vendor tracker still marks Trixie Expat2.9.0 affected by [CVE-2026-117610](https://security-tracker.debian.org/tracker/CVE-2026-117610) and [CVE-2026-118370](https://security-tracker.debian.org/tracker/CVE-2026-118370), Python3.13.5 affected by [CVE-2026-7210](https://security-tracker.debian.org/tracker/CVE-2026-7210), and zlib1.3.1 affected by [CVE-2026-76844](https://security-tracker.debian.org/tracker/CVE-2026-76844). Upstream/newer-distribution fixes require a separate reviewed backport/source-build or further distribution candidate with compatible native libraries; do not mix sid packages into stable without that review.

Review the two-file Dockerfile/closure diff, then build one distinct candidate, inspect actual versions/closure, run a fresh image scan and the full existing regression matrix. Only then classify each remaining finding against the current vendor evidence. Preserve failed receipts. No suppression, Essential override, unsigned package, broad filesystem grant or production activation is proposed.

## Every baseline source group

| Old source     | Matches | Candidate source hint | Available binary versions                                               |
| -------------- | ------: | --------------------- | ----------------------------------------------------------------------- |
| acl            |       2 | acl                   | 2.3.2-2+b1                                                              |
| apt            |       4 | apt                   | 3.0.3, 3.0.4                                                            |
| attr           |       1 | attr                  | 1:2.5.2-3                                                               |
| bash           |       1 | bash                  | 5.2.37-2, 5.2.37-2+b10                                                  |
| bzip2          |       1 | bzip2                 | 1.0.8-6                                                                 |
| cairo          |       5 | cairo                 | 1.18.4-1, 1.18.4-1+b1                                                   |
| coreutils      |       5 | coreutils             | 9.7-3                                                                   |
| dash           |       2 | dash                  | 0.5.12-12                                                               |
| diffutils      |       1 | diffutils             | 1:3.10-4                                                                |
| expat          |       7 | expat                 | 2.8.3-1~~deb13u1, 2.9.0-1~~deb13u1                                      |
| freetype       |       1 | freetype              | 2.13.3+dfsg-1+deb13u1                                                   |
| gcc-12         |      18 | gcc-14                | 14.2.0-19                                                               |
| glib2.0        |      11 | glib2.0               | 2.84.4-3~deb13u5                                                        |
| glibc          |      48 | glibc                 | 2.41-12+deb13u4                                                         |
| gnupg2         |       5 | gnupg2                | 2.4.7-21+deb13u1, 2.4.7-21+deb13u1+b5                                   |
| gnutls28       |       6 | gnutls28              | 3.8.9-3+deb13u4                                                         |
| gzip           |       2 | gzip                  | 1.13-1+deb13u1                                                          |
| harfbuzz       |       2 | harfbuzz              | 10.2.0-1+deb13u1                                                        |
| jbigkit        |       1 | jbigkit               | 2.1-6.1+b2                                                              |
| krb5           |      24 | krb5                  | 1.21.3-5+deb13u1                                                        |
| lcms2          |       1 | lcms2                 | 2.16-2+deb13u2                                                          |
| libgcrypt20    |       2 | libgcrypt20           | 1.11.0-7+deb13u1                                                        |
| libpdfbox-java |       8 | libpdfbox-java        | 1:1.8.16-5                                                              |
| libpng1.6      |       4 | libpng1.6             | 1.6.48-1+deb13u5, 1.6.48-1+deb13u6                                      |
| libtasn1-6     |       1 | libtasn1-6            | 4.20.0-2+deb13u1                                                        |
| libtirpc       |       4 | libtirpc              | 1.3.6+ds-1                                                              |
| libx11         |       8 | libx11                | 2:1.8.12-1                                                              |
| libxi          |       9 | libxi                 | 2:1.8.2-1                                                               |
| libxpm         |       2 | libxpm                | 1:3.5.17-1+deb13u1                                                      |
| libxrender     |       1 | libxrender            | 1:0.9.12-1                                                              |
| ncurses        |      12 | ncurses               | 6.5+20250216-2                                                          |
| nss            |       7 | nss                   | 2:3.110-1+deb13u4, 2:3.110-1+deb13u5                                    |
| openjpeg2      |      14 | openjpeg2             | 2.5.3-2.1~deb13u2                                                       |
| openssl        |       2 | openssl               | 3.5.7-1~~deb13u2, 3.5.7-1~~deb13u3                                      |
| p11-kit        |       2 | p11-kit               | 0.25.5-3                                                                |
| pam            |       8 | pam                   | 1.7.0-5                                                                 |
| perl           |      20 | perl                  | 5.40.1-6+deb13u1                                                        |
| pixman         |       1 | pixman                | 0.44.0-3                                                                |
| poppler        |      32 | poppler               | 25.03.0-5+deb13u3, 25.03.0-5+deb13u4                                    |
| python3.11     |      60 | python3.13            | 3.13.5-2+deb13u5                                                        |
| shadow         |       6 | shadow                | 1:4.17.4-2                                                              |
| sqlite3        |      19 | sqlite3               | 3.46.1-7+deb13u2                                                        |
| systemd        |      14 | systemd               | 257.13-1~deb13u1                                                        |
| sysvinit       |       1 | sysvinit              | 3.14-4                                                                  |
| tar            |       5 | tar                   | 1.35+dfsg-3.1                                                           |
| texlive-base   |       6 | texlive-base          | 2024.20250309-1                                                         |
| texlive-bin    |     460 | texlive-bin           | 2024.20240313.70630+ds-6                                                |
| tiff           |      24 | tiff                  | 4.7.0-3+deb13u3                                                         |
| tzdata         |       1 | tzdata                | 2026c-0+deb13u1                                                         |
| util-linux     |      64 | util-linux            | 1:2.41.5-0+deb13u1, 1:4.16.0-2+really2.41.5-0+deb13u1, 2.41.5-0+deb13u1 |
| xdg-utils      |       3 | xdg-utils             | 1.2.1-2                                                                 |
| zlib           |       4 | zlib                  | 1:1.3.dfsg+really1.3.1-1+b1                                             |
| zziplib        |       6 | zziplib               | 0.13.78+dfsg.1-0.1                                                      |

The JSON maps each affected old binary to exact available candidates and package hashes. Source/name hints do not claim selected dependencies; packages removed or renamed by the new dependency graph require actual image inventory.

## Candidate checks

`python3 scripts/latex-runtime/build-closure.py --self-test` passed. The build now requires all eight supported styles, six existing font groups, the XeLaTeX format, loader cache/configuration, ELF engines and resolved per-engine loaders before writing closure artifacts. It records the required files and keeps the existing read roots. A complete candidate build/runtime test is still pending.
