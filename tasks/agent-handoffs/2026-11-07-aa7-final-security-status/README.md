# AA7 final engineering status handoff

2026-11-07. Backend review for the coordinator. Existing evidence only; no new vendor research, builds, scans, database actions or production source changes.

No current functional defect is established by this review. The coordinator reports that image `4b83ffec76083b02a79df7addf5ff1f8e09b6d90135d73915b890b38b7753b16` passes all 28 runtime groups and six profiles. Rollback, render and the fresh scan have separate owners and receipts; this report does not infer their completion.

[status.json](status.json) retains all 28 HIGH CVE rows and 80 package matches from the historical fc8 matrix. Its 947 raw matches are historical, not a scan of this final image. Every finding remains recorded. The current binding covers 588 code inputs, 61 runtime inputs, 216 packages and 1,974 closure files. Only the FreeType package and its library changed against the preceding accepted worker; seven crypto libraries and five Poppler metadata files remain unchanged.

| Item | Current evidence | Limit |
| --- | --- | --- |
| FreeType CVE-2026-95512 | Authenticated source backport; normal build, ABI, fixed-font metrics and final library hash pass. | Actual malicious-font reproduction and optional external-font test were not run. |
| Three Expat HIGH findings | The authenticated native 2.10 source fixes remain bound. | Raw package findings remain. Expat CVE-2025-66382 is not claimed fixed. |
| Python CVE-2026-7210 | The established candidate bbox XML path was removed. Current supervisor parses the private native frame; pypdf XMP is lazy and not requested. | Python was not patched. This is a caller-route conclusion, not whole-component clearance. |
| OpenJPEG CVE-2023-39327, LOW | Native Poppler disables OpenJPEG; the compiler closure contains no openjp path. Early image admission guards add separate protection. | None-JPX dispatch produces EOF/error, not guaranteed whole-PDF rejection. The installed package finding remains. |
| SQLite CVE-2026-119373 | Reviewed pypdf bodies issue no SQL. Poppler's explicit NSS DB path is signature-specific; the vulnerable FTS5 query is not established here. | NSS/softoken internal SQL initialization remains outside the finite reviewed evidence. No failing app behavior was reproduced. |
| Expat CVE-2025-66382 | Candidate XML extraction was removed; Fontconfig uses sealed configuration and immutable HOME. | Non-public trigger conditions remain unknown. No component-fix or unconditional non-applicability claim is made. |
| Other HIGH rows | Prior scoped API/privilege/entrypoint prerequisites and their invalidators remain in the JSON. | They are engineering evidence, not accepted suppressions or whole-package safety declarations. |

The concrete FreeType ordering defect is fixed: V3 generated its adapter after normal Debian cleanup had unapplied patches. V4 snapshots the authenticated patched source first and passes the later checks. The failed V3 receipt remains.

The original Poppler vendor result remains 70/71 under named E-010, with the unchanged PGP signer-name assertion failing. The 56 Qt summaries remain recorded; later assertions 312–315 in that method were not executed. This is a known vendor-test disposition, not a new converter failure. Those vendor tests ran under the original FreeType and were not relabelled as rerun under the final library.

No further code change or audit is proposed by this handoff. Preserve the fresh final-image scan and remaining unknowns separately from functional engineering closure. Zero vulnerabilities, formal security/legal/accessibility acceptance and release approval are not established here.
