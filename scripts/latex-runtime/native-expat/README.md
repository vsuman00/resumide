# Native Expat 2.10 candidate

This private source-builder recipe produces Trixie-native Debian packages from actual Expat2.10.0 source. It preserves the authenticated Trixie2.9 Debian rules, copyright and two quilt patches. The archive-authenticated2.10 maintainer packaging differs only in changelog. No unstable binary or SID APT repository is used. Shared worker Dockerfile/closure and application configuration are unchanged.

## Inputs and authentication

`pins.json` fixes the dated Trixie base, November6 main/security package snapshot, local package version2.10.0-1~deb13u1+resumide1, upstream release/commit and every source input digest/size. Source-only SID metadata authenticates the complete2.10 orig archive; Trixie-security metadata authenticates the original Debian packaging. Both signed InRelease files are verified with the Debian archive keyring before their Sources indexes and source files are accepted. `.dsc`, orig and Debian tar hashes come from those signed indexes. All source downloads use exact official by-hash/pool bytes; the initial snapshot index timeout and unavailable-gpgv audit are preserved in provenance.

The upstream2.10 release tar matches its official release API SHA256. Its73 core/test C/header files match the signed Debian orig source. Official GitHub metadata binds annotated tagc5dc9f930efb4a7584c7be96e60d469ab5f1b767 to commita70841d9ffa64ddde29ab824ed6305035ebe4c47 and reports a valid signature. That platform report is distinct from local verification of the detached upstream release signature. Debian archive signatures supply the independently verified source authority.

## Build and tests

The builder installs only Trixie snapshot build dependencies. Native compilation/tests run in a BuildKit `--network=none` step. It builds normal Debian packages with the original rules, then executes the full narrow top-level `make check` and the native UTF-16 `make -C buildw/tests check`, including benchmark recursion. The preserved Debian rules build the wide library only; the unshipped wide XMLWF CLI assumes a Windows wchar_t ABI and is outside that package. No registered library test, input or assertion was removed. The complete upstream source cohort fixes CVE-2026-113351, CVE-2026-115506, CVE-2026-117610 and CVE-2026-118370. See the exact [regression mapping](evidence/security-regression-map.json); the last fix has no dedicated new upstream regression.

A client compiled against installed2.9 headers/library is first run against the baseline, then against staged2.10. It checks XML/DOCTYPE/entity callbacks. Additional checks preserve both library SONAMEs and every baseline XML export, run Python pyexpat/ElementTree against the candidate library and exercise fontconfig. Export/link checks are not a complete semantic ABI proof; exact-worker converter tests follow separately.

Package artifacts retain normal Debian metadata/license files. Build/test logs, package/source hashes, buildinfo/changes and build-package inventory are exported. Native packages are locally built artifacts; no Debian official upload or signature is claimed.

Reviewed build command (use a new receipt/IID for each approved attempt):

```sh
docker build --platform linux/arm64 --pull=false --progress=plain \
  --target build --file scripts/latex-runtime/native-expat/Dockerfile \
  --tag resumide-latex-expat:native-2.10.0-20261106 \
  --iidfile /tmp/resumide-native-expat-reviewed-attempt.iid \
  scripts/latex-runtime/native-expat
```

Use a distinct log/receipt and preserve the current worker images. Extract `/export` from the stopped builder image with exact-container cleanup; no host input mount, secrets, project environment or production activation. The recipe also has an artifact-only target for a reviewed filesystem export. Do not install the candidate into the worker before reviewing its actual package/ABI/security results.

## Open issue and optional feature flags

CVE-2025-66382 remains explicitly open. The [upstream issue1076](https://github.com/libexpat/libexpat/issues/1076) does not disclose the affected code or a public reproducer; the [Debian tracker](https://security-tracker.debian.org/tracker/CVE-2025-66382) still marks2.10 vulnerable. Input limits do not establish a fix.

Upstream2.10 supports CMake EXPAT_DTD/EXPAT_GE switches. The preserved Autotools recipe defines both features on. Disabling both can remove conditional public APIs, including the amplification-protection API group; this needs ABI/Python/fontconfig/configuration tests and vendor evidence tying the undisclosed vulnerability to compiled-out code. No such applicability proof exists in the public sources consulted. This candidate preserves defaults and does not claim feature removal mitigates that CVE. See [official CMake options](https://github.com/libexpat/libexpat/blob/R_2_10_0/expat/CMakeLists.txt) and [conditional public API](https://github.com/libexpat/libexpat/blob/R_2_10_0/expat/lib/expat.h).

## Verified native candidate

Build 6 passed in 55.20 seconds on linux/arm64. Builder index: `sha256:a7927d608b9a137e9635b814e81d23d09963bb9b5eecede0decfd39657fb2530`. Each actual upstream suite passed 5,328 checks with zero failures. The native UTF-16 test adapter runs only after pristine packages are built; it changes test literals/diagnostic formatting and the byte `XML_LChar` version comparison, preserving original inputs, assertions and registrations. It changes no installed library source or flags.

Runtime package: `libexpat1_2.10.0-1~deb13u1+resumide1_arm64.deb`, SHA256 `0c53ef566bfed58944391fb9ac7201c5cc9c0674f4e4c0501fe6863c22671224`. Both library SONAMEs and all 83 baseline XML exports per library are preserved. Narrow and native-wide clients compiled with 2.9 headers passed against 2.9 and 2.10, including real non-ASCII/surrogate code units and reset callbacks. Python reported `expat_2.10.0`; ElementTree and DOCTYPE checks passed. Fontconfig resolved the candidate library through ELF linkage and `fc-list` passed.

[Source/test receipt](evidence/source-and-test-receipt.json), [build outcome](evidence/build-outcome.json) and [build receipt](evidence/build-receipt.json) bind the evidence. Five failed attempts remain recorded: snapshot transport, expanded-source guard, unsupported wide harness, byte-version comparison, and the unshipped wide CLI build. The final target matches the packaged ABI and keeps the full narrow CLI check.

The packages and complete build logs remain in the private local build receipt directory. A stopped hardened container exported the results; it was never started and exact removal was verified. No worker adoption, converter regression, CVE rescan or release approval is supplied by this source-builder result. CVE-2025-66382 remains open.
