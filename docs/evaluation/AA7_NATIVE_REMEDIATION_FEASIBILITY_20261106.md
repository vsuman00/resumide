# AA7 native remediation and runtime composition feasibility

Status: read-only follow-up design. No source-package rebuild, dependency/backport patch, new repository or runtime composition change has been implemented. The reviewed architecture-guard build is a separate task.

The fresh9890 scan records978 raw package/CVE matches across51 source groups: zero critical,89 high,192 medium,686 low and11 unknown. Every FixedVersion field is empty. This is not proof that upstream fixes do not exist. It also prevents calling the Trixie migration a complete security fix. The final22cb image has matching installed versions; its separate scan must establish its own findings.

## Maintained native fixes are feasible, with real limits

| Component | Concrete candidate                                                                                                 | Compatibility/provenance work                                                                                                                                                                                                                                                                                      | Required proof before adoption                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Expat     | Rebuild a Trixie-native package with reviewed upstream2.10 security fixes, or import2.10 into its Debian packaging | Existing binary is2.9.0. Upstream2.10 retains SONAME1 and changes libtool revision14:0:13 to14:1:13; that supports feasibility but is not our ABI test. Preserve Debian packaging/patches, symbols and licenses.                                                                                                   | Authenticate source inputs; test all five fresh Expat records, upstream security regressions, allocator/error paths, XML parsing and reverse consumers; verify actual linked library and full converter matrix.    |
| CPython   | Prefer a coherent maintained3.13 security update, or a reviewed complete backport set into Trixie's3.13.5 source   | CVE7210's upstream3.13 patch changes internal hash state, the pyexpat C API and both XML modules. Rebuild interpreter/minimal/stdlib packages together against the repaired Expat headers and runtime. Five distinct HIGH IDs affect four installed Python binaries; a single7210 patch leaves the other findings. | Preserve Debian patches/build flags, run CPython security and XML/SSL/HTML/tarfile regressions, pypdf tests and production-path converter tests. Confirm all four package versions/ABI and shared-library linkage. |
| zlib      | Reviewed native-source backport or a tested maintained upstream stable source update                               | The upstream overflow patch targets a newer gzwrite implementation. Trixie1.3.1 lacks its state->again context, so blind cherry-picking is unsafe. A full1.4 import also needs behavioral review. Keep the libz ABI and native packaging metadata.                                                                 | Adapt with reviewed old-code reasoning, run upstream tests plus nonblocking-write/EAGAIN/EPIPE/gzclearerr regressions, compression round trips, TeX/PDF/font consumers and sanitizer checks where supported.       |

The [Expat2.10 release notes](https://raw.githubusercontent.com/libexpat/libexpat/R_2_10_0/expat/Changes) include CVE113351,115506,117610 and118370 fixes. Using only the two initially discussed patches would miss part of the fresh source-group result. The notes also retain an upstream unresolved-security notice, so upgrading is not a general security guarantee.

The [CPython3.13 patch](https://github.com/python/cpython/commit/fc9b11ff49cbc82e6f917d07a61517a2b5f3145f) changes five files and uses the16-byte Expat salt API when built with Expat2.8 or newer. A loose replacement module is insufficient. [Python3.13.18](https://www.python.org/downloads/release/python-31318/) alone does not repair the separate Expat2.9 library issues. Its suitability for every current Python finding needs an explicit advisory matrix.

The [upstream zlib patch](https://github.com/madler/zlib/commit/df84af25dc1942490e1d1c899a07619152a46148) resets pending stream input after a failed nonblocking write. The scanner's zlib76844 title names an unrelated project; retain the raw record and use the [Debian package tracker](https://security-tracker.debian.org/tracker/CVE-2026-76844) and actual code to establish applicability. A title mismatch neither fixes nor dismisses the package finding.

No source .dsc/orig/debian archive signatures or hashes have been fetched for this follow-up, no patch has been applied, and no ABI/regression test has run. The next build must first authenticate Sources metadata against the already verified fixed-snapshot release, then hash-bind the native source archives and reviewed upstream patches. Build dependencies belong in a separate native Trixie builder; no unstable binary mixing or host compiler installation is proposed. Install coherent versioned .deb outputs through normal dependency checks and retain source/patch/package/license evidence.

## Smaller final runtime requires a reviewed composition change

The largest high-count groups include util-linux36, Python20 and GnuPG7. The current final image installs whole Debian TeX packages, so it includes utilities and dependencies beyond the two confined engines. The approved engine closure is1973 exact files; it is not the full trusted Python/PDF/Poppler dependency graph. Absence from that closure cannot prove whole-worker unreachability.

A useful minimal target has five declared parts: the Landlock launcher/supervisor; xetex and xdvipdfmx plus their exact ELF dependencies; the eight supported style roots/transitives, fonts and format; coherent CPython/pypdf runtime; and the production pdftotext checker with its exact libraries/configuration. Preserve locale/fontconfig/loader inputs, package/source provenance, copyright/license files and a complete component SBOM. Test both A4/Letter profiles and required glyphs rather than shrinking to one successful fixture.

Two approaches are feasible in principle:

1. Keep normal Debian packages and rebuild maintained components. This preserves native package metadata, dependency resolution and security updates. It also retains unrelated utility/source-group findings because distribution packages are coarse. Removing packages must respect Essential/protected checks and actual reverse dependencies. The prior APT safety warning is not permission to force removal.
2. Build a declared minimal runtime artifact from the native sources/components. This could avoid unused administration, GnuPG, Java/PDFBox, Perl, X11 or extra TeX utilities where the complete graph proves they are unnecessary. It requires a new reviewed artifact/SBOM contract, reproducible source builds, static plus dynamic dependency review, supported-package/font compatibility and full isolation/output regression. Copying only observed files into scratch and erasing dpkg metadata would hide inventory and is not an acceptable shortcut.

Neither approach proves all978 findings resolved. Even with a smaller graph, required CPython, libc, TeX engines, fonts/image decoders and PDF libraries remain security-maintained dependencies. Source-level scanner matches can span unused binaries; preserve those raw findings and attach specific package/binary evidence instead of deleting metadata or renaming vulnerable packages to make the scan green.

## Recommended bounded follow-up

Retain22cb as an unpromoted verification candidate and complete its source-bound tests/scan/license inventory. Then review one native Expat repair proof: authenticate source inputs, evaluate the complete fresh Expat advisory set, rebuild normal native packages and prove ABI/regressions in a separate image. This is a feasible implementation experiment, not a claim that three backports close the phase. In parallel, inventory the complete trusted runtime graph before choosing the larger composition redesign.

Before claiming completion, reconcile every affected source group below against fixed source or explicit vendor applicability evidence, re-scan the exact final artifact with full metadata retained and repeat required runtime/product verification. Empty fixed-version metadata is a distribution limitation; the genuine remaining work is authenticated source adaptation, compatibility tests and ownership of maintenance across required components. Formal security/release acceptance remains open.

## Complete fresh source-group scope

Counts are raw package/CVE matches, not unique CVEs or proven attack paths. No group is silently omitted.

| Source         | High | Medium | Low | Unknown |
| -------------- | ---: | -----: | --: | ------: |
| acl            |    1 |      1 |   0 |       0 |
| apt            |    0 |      0 |   2 |       0 |
| attr           |    0 |      1 |   0 |       0 |
| bash           |    0 |      0 |   1 |       0 |
| bzip2          |    0 |      1 |   0 |       0 |
| cairo          |    0 |      0 |   3 |       0 |
| coreutils      |    0 |      0 |   4 |       0 |
| curl           |    2 |      9 |  28 |       0 |
| cyrus-sasl2    |    0 |      2 |   0 |       0 |
| dash           |    0 |      0 |   2 |       0 |
| diffutils      |    0 |      0 |   1 |       0 |
| expat          |    3 |      1 |   0 |       1 |
| freetype       |    0 |      1 |   0 |       0 |
| gcc-14         |    0 |     20 |   0 |       0 |
| glib2.0        |    0 |      1 |   1 |       0 |
| glibc          |    0 |     28 |  16 |       0 |
| gnupg2         |    7 |      7 |  21 |       0 |
| gnutls28       |    0 |      0 |   6 |       0 |
| jbigkit        |    0 |      0 |   1 |       0 |
| krb5           |    0 |      8 |  16 |       0 |
| lcms2          |    0 |      0 |   1 |       0 |
| libgcrypt20    |    0 |      0 |   2 |       0 |
| libpdfbox-java |    0 |      4 |   4 |       0 |
| libpng1.6      |    0 |      0 |   2 |       0 |
| libx11         |    2 |      6 |   0 |       0 |
| libxi          |    2 |      7 |   0 |       0 |
| libxpm         |    0 |      1 |   0 |       0 |
| libxrender     |    1 |      0 |   0 |       0 |
| ncurses        |    4 |      0 |   4 |       0 |
| nghttp2        |    0 |      1 |   0 |       0 |
| nss            |    0 |      0 |   4 |       0 |
| openjpeg2      |    0 |      3 |  11 |       0 |
| openldap       |    0 |      0 |   5 |       0 |
| p11-kit        |    0 |      2 |   0 |       0 |
| pam            |    0 |      4 |   0 |       0 |
| perl           |    4 |      8 |   4 |       0 |
| pixman         |    0 |      0 |   1 |       0 |
| poppler        |    0 |     14 |  18 |       0 |
| python3.13     |   20 |     40 |  16 |       4 |
| shadow         |    0 |      0 |   6 |       0 |
| sqlite3        |    1 |      4 |   3 |       6 |
| systemd        |    2 |      2 |  10 |       0 |
| sysvinit       |    0 |      0 |   1 |       0 |
| tar            |    0 |      3 |   2 |       0 |
| texlive-base   |    0 |      0 |   6 |       0 |
| texlive-bin    |    0 |      0 | 460 |       0 |
| tiff           |    2 |      1 |  11 |       0 |
| util-linux     |   36 |      9 |   9 |       0 |
| xdg-utils      |    1 |      1 |   1 |       0 |
| zlib           |    1 |      2 |   0 |       0 |
| zziplib        |    0 |      0 |   3 |       0 |

Evidence: [full9890 raw scan](AA7_FULL_SECURITY_TRIXIE_RAW_20261106.json), [authenticated candidate proposal](AA7_TRIXIE_CANDIDATE_PROPOSAL_20261106.json), [final22cb metadata](AA7_TRIXIE_FINAL_METADATA_20261106.json), [final license inventory](AA7_TRIXIE_FINAL_LICENSES_20261106.json).
