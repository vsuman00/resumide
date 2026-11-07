# AA7 decoder-guard worker: offline security scan

Status: COMPLETED_WITH_FINDINGS. This report supplies image-bound scanner evidence; it does not grant security acceptance or release approval.

The single scan of `sha256:fc8c0ace5e3bc53b3db1e23e0df11caed38161bb716b5c388d96169abe0e8203` completed in 3.128 seconds with finding exit code 1. It reported 947 package/CVE matches: 0 critical, 80 high, 186 medium, 670 low and 11 unknown. The inventory contains 216 OS packages and pypdf 6.21.4. There are 354 unique vulnerability IDs, 355 source/CVE pairs and 51 affected source groups. All severities and the requested suppressed-record output remain in the raw report. No ignore, local VEX or findings filter was applied.

Compared with the retained 3829 scan using the same actual database bytes, there are zero added and zero removed package/CVE keys. The decoder configuration guard changes execution behavior; this scan does not report a dependency finding reduction.

The [binding receipt](AA7_DECODER_GUARD_SECURITY_20261106_BINDING.json) verifies the requested OCI index, arm64 platform manifest, config, every compressed layer hash and corresponding uncompressed diffID. The scanner config digest and diffIDs match that chain. Both existing exports were rehashed and reused. Scanner 0.76.2 and both vulnerability database hashes match before and after. The Seatbelt policy `(version 1)(allow default)(deny network*)` remained unchanged; the corrected bounded loopback probe recorded EPERM before scanning. The scanner received only explicit HOME, LANG, PATH and TMPDIR environment entries. No cache bootstrap, network upload or new export occurred during the corrected attempt.

Every vulnerable record joins its exact `PkgID` to the corresponding package record. Debian full versions are reconstructed from Epoch, Version and Release; source versions retain the analogous source fields. The unvulnerable pypdf record has no ID and remains in the inventory. These assertions cover all 947 findings.

Two failed receipts are retained unchanged. The [first preflight receipt](AA7_DECODER_GUARD_SECURITY_20261106_RECEIPT.json) stopped before scanning because its socket-allocation assertion was unsuitable for a network-connect denial check. The [attempt 2 receipt](AA7_DECODER_GUARD_SECURITY_20261106_ATTEMPT2_RECEIPT.json) records the actual completed scan, then a failed postprocessing assertion that compared a complete Debian version with the separate Version field. The [analysis receipt](AA7_DECODER_GUARD_SECURITY_20261106_ANALYSIS_RECEIPT.json) records the corrected data-only adapter. No scan was repeated and RAW was not changed.

Evidence:

- [Unmodified RAW](AA7_DECODER_GUARD_SECURITY_20261106_RAW.json), SHA256 `f1ec61fa83c0fcfe9bd099942985120571f5cbd76e1ada9bce0ec5c052f6b219`.
- [Complete comparison and all findings](AA7_DECODER_GUARD_SECURITY_20261106_COMPARE.json), SHA256 `65fd0baf42ccce0fe18d56d145dc25928f9b21c3bfe0365fb264a4956f2cec23`.
- [Preflight and approved command](AA7_DECODER_GUARD_SECURITY_20261106_PREFLIGHT.json).
- [Failed-preflight follow-up](AA7_DECODER_GUARD_SECURITY_20261106_FAILED_PREFLIGHT_FOLLOWUP.json).

The scan and exports are terminal. This task owns no active Docker or scanner process. Historical images, caches, both archives and failed receipts remain preserved for coordinator review. Raw findings and the AA7 security gate remain open.
