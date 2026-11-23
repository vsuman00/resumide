# AA7 Trixie candidate build and metadata

The third reviewed private build succeeded. Candidate image `sha256:98907d4d7472231fd81e719e71f6cba23db54db215c35d906eeab87b3c39692e` is tagged `resumide-latex:aa7-trixie-20261106`, linux/arm64, user65532:65532. Existing600c/19d2 images and application configuration remain unchanged. This is build and trusted metadata evidence; runtime/PDF regression, a fresh all-severity scan and license review remain pending.

## Inputs and preserved failures

The dated Debian13 base and November6 main/security snapshot were authenticated as documented in the [candidate proposal](AA7_TRIXIE_CANDIDATE_PROPOSAL_20261106.md). The pypdf6.21.4 wheel/requirement hash remains fixed. Compiler/header/pip tools stay in the builder; no Essential override, package removal, unsigned dependency or wider read root was added.

Attempt1 failed at the new font guard because the minimal installation omitted Latin Modern Type1/metrics/encodings. The reviewed repair explicitly selects lmodern2.005-1 and applies same-snapshot no-remove upgrades. Attempt2 failed on three snapshot HTTP504 artifact downloads. The [transport provenance](AA7_TRIXIE_FONT_TRANSPORT_PROVENANCE_20261106.json) binds identical official Debian pool bytes to the signed snapshot hashes/sizes. Attempt3 uses only those three checksum-pinned artifacts, mounted read-only from the builder and staged after upgrades. Native APT supplied and logged the archive filenames, including encoded epochs; ordinary APT installation then succeeded. All earlier logs and [attempt1](AA7_TRIXIE_BUILD_ATTEMPT1_20261106.json)/[attempt2](AA7_TRIXIE_BUILD_ATTEMPT2_20261106.json) failed receipts are retained.

The [successful build receipt](AA7_TRIXIE_BUILD_ATTEMPT3_20261106.json) records78.51seconds, exact source hashes, command, immutable image ID and log hash. No model/provider, database, deployment or environment operation ran.

## Actual metadata

One trusted metadata-only audit ran with networknone, read-only root, non-root UID/GID, dropped capabilities, no-new-privileges, resource bounds, no host mounts and no forwarded environment. It passed in0.396seconds and the exact container was verified absent. [Full metadata receipt](AA7_TRIXIE_CANDIDATE_METADATA_20261106.json).

| Input                          | Actual value                |
| ------------------------------ | --------------------------- |
| APT / libapt-pkg7.0            | 3.0.4                       |
| GLib                           | 2.84.4-3~deb13u5            |
| SQLite                         | 3.46.1-7+deb13u2            |
| Expat                          | 2.9.0-1~deb13u1             |
| Python                         | 3.13.5-2+deb13u5            |
| zlib                           | 1:1.3.dfsg+really1.3.1-1+b1 |
| lmodern                        | 2.005-1                     |
| pypdf                          | 6.21.4                      |
| Installed Debian packages      | 222                         |
| Required styles                | 8 / 8                       |
| Font groups                    | 6 / 6                       |
| Required input hashes verified | 810                         |
| Closure files                  | 1,973                       |

PyPDF2, pip and gcc/cc/make are absent; the candidate PDF inspector imports successfully. Closure SHA256 is `7e0a4dc08ac87709a8514279085d2717dd5a30a48f0fd8d906f4e46a621324ff`. Font counts are Latin Modern OpenType72, Type1 92, metrics596, encodings34, and one Computer Modern metrics/Type1 representative each. Required format, configuration, cache, ELF engines and loader hashes passed.

The proposal records vendor fixes for the older GLib/SQLite criticals and known affected Expat/Python/zlib issues that this stable snapshot does not fix. Installed versions and successful guards do not supply a zero-CVE result. The coordinator must integrate the exact two source files before source-bound full verification; retain all raw scan findings and review any remaining source/backport work separately.
