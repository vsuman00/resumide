# Final worker license metadata

The fresh audit of immutable worker `6f623e1c…db614a` completed with exit 0 and no signal. All 216 installed packages have readable copyright files and matching package-lock versions. The full [inventory](AA7_ATOMIC_NATIVE_LICENSES_20261107.json) retains all declarations and 57 non-DEP5 interpretation questions. Those files are present; non-DEP5 format does not establish license incompatibility or supply legal approval.

The cohort matches the earlier 3829 license inventory and normalized fc8 package inventory except for these two versions:

| Package       | Previous version  | Current version             |
| ------------- | ----------------- | --------------------------- |
| libpoppler147 | 25.03.0-5+deb13u4 | 25.03.0-5+deb13u4+resumide1 |
| poppler-utils | 25.03.0-5+deb13u4 | 25.03.0-5+deb13u4+resumide1 |

No package was added or removed. Every package copyright hash and declared-license record is unchanged. The pypdf 6.21.4 metadata, explicit BSD-3-Clause declaration and license-file hashes also match the prior inventory. Full Debian versions are compared using Trivy package IDs, because its separate Version field omits release components.

Fifteen [raw native and Python metadata files](AA7_ATOMIC_NATIVE_LICENSES_20261107_NATIVE.json) are retained with hashes and exact saved bytes. They bind Expat source 2.10.0, its local package and upstream copyright hash, and Poppler source 25.03.0-5+deb13u4 with its local package, original packaging and copyright hashes. Poppler's recorded outcome remains 70/71 CTests with 56 complete Qt summaries under E-010; this audit does not change that result.

The [receipt](AA7_ATOMIC_NATIVE_LICENSES_20261107_RECEIPT.json) records the inspected arm64 image, unchanged audit-script hash, fixed metadata reads and actual exit. The worker used no network, host mounts, forwarded credentials or file writes, with UID 65532, dropped capabilities, read-only root, 128 MiB memory, one CPU and the existing resource/output bounds. Raw stdout and stderr remain beside the report. The exact container was removed and its absence verified. All 578 code and 48 runtime input hashes stayed unchanged.

This completes license metadata collection. License interpretation, vulnerability disposition, the separate FreeType follow-up and security/release acceptance remain outside this audit.
