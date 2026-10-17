# AA6 local engineering closeout

Status: **LOCAL AA060–AA065 ENGINEERING COMPLETE AND VERIFIED.** Scope: synthetic, private PDF/DOCX rendering under owner-approved [ADR-0015/E-006](../decisions/0015-aa6-local-engineering-sequencing.md). Formal Gate AA6 is open.

| Task  | Delivered local engineering                                                                                                                          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| AA060 | Strict saved-version/template/format/page contracts, shared canonical presentation plan, bounded artifact states and versioned verification report.  |
| AA061 | Semantic private HTML preview and one single-column tagged PDF template with embedded OFL Noto Sans, selectable text and active links.               |
| AA062 | One semantic DOCX template using the identical ordered plan, embedded font, heading styles and hyperlinks; byte-reproducible packages.               |
| AA063 | Independent PDF.js and OOXML parse-back; exact normalized text, critical fields, order, section anchors and link-label/target binding.               |
| AA064 | A4/US Letter policies, hard output/page/heap/wall/concurrency limits, no silent glyph loss or long-word clipping, page guidance and safe failures.   |
| AA065 | Known-synthetic locale/format/page matrix, adversarial corruption cases, test and CI wiring, preview accessibility, and fail-closed release receipt. |

## Verification evidence

- [Engineering parity receipt](aa6-20261014-engineering.json): 20/20 known-synthetic cases: en-IN/en-US/en-GB × PDF/DOCX × A4/Letter, plus missing critical field, reordered text, broken or misbound links, omitted heading, clipped layout, missing structure and extra text. All positive cases had 100% critical recovery and normalized text parity. This is the local synthetic combination matrix, not a representative release corpus.
- [Release-blocked receipt](aa6-20261014-release-blocked.json): the `--release` command exits 1. Approved viewer matrix, assistive technology, representative domain and locale evidence, named security/accessibility owner acceptance and upstream formal gates remain unavailable.
- Focused unit/security checks: 19 assertions across contract, renderer, repository and route tests. They cover uncertain facts, stale/foreign access, unsafe links, injected form fields, no partial output, deterministic bytes, bounded concurrency, cancellation, failure diagnostics and real PDF/DOCX byte mismatch. Source check and TypeScript/build passed.
- Isolated local Supabase: 23 assertions covering confirmed current versions, two formats × two page sizes, parse-back, foreign-owner denial, stale edit rejection, pending source deletion and fixture cleanup. `/tmp/resumide-aa6-db-final.log`.
- Browser: two AA6 flows cover semantic preview, axe, PDF/DOCX download, stale-version denial, foreign-owner denial and JavaScript-disabled forms. The full browser run covers 53 checks. `/tmp/resumide-aa6-browser.log` and `/tmp/resumide-aa6-verify-ci-closed3.log`.
- Sample PDF and DOCX were rendered visually with PDF.js and macOS Quick Look; the DOCX ZIP passed integrity checking and macOS `textutil` imported its text. Only fictional local fixture files were used, under `/tmp/resumide-aa6-samples`.
- Full verification: `npm run verify:ci` exited 0 with **103 test files / 694 tests**, **53 Chromium checks**, formatting, lint, type generation/TypeScript, web/worker builds, dependency signatures, secret/alert/container checks, load/restore/scoring/JD/writer/render benchmarks, and **zero production dependency vulnerabilities**. `/tmp/resumide-aa6-verify-ci-closed3.log`.

## Boundaries

The renderer consumes only immutable saved canonical content and an allowlisted template. It does not fetch links or fonts. Every download rechecks owner/source/deletion access, the exact current canonical version and parse-back before emitting transient private bytes. No artifact is persisted, and no hosted SQL or production flag was changed. Imported synthetic canonical data can contain duplicate confirmed assertions; the template groups exact duplicate values but does not delete distinct source facts. The candidate should review the semantic preview before sharing.

Automated PDF structure checks and browser axe do not establish PDF/UA or screen-reader conformance. DOCX page count is an estimate until opened in an approved viewer. No representative corpus, approved viewer matrix or assistive-technology review exists in this local phase. The AA1 critical-field gate still fails, and AA2–AA5 formal gates remain open. Numeric scores, hosted deployment, publication and release remain deferred. AA7 requires its own scoped instruction while these gates remain open.

## Owner-provided smoke test and font correction, 2026-10-16

The owner authorized one local personal-resume test. The [aggregate receipt](aa6-20261016-owner-smoke.json) retains diagnostic categories and counts only. No resume text, contact data, input hash or candidate confirmations are retained in the receipt. Temporary content and generated files were deleted. The unchanged user-owned source remains excluded from Git and Docker build contexts.

The one-page native PDF produced 3,778 characters, 55 unconfirmed facts and four sections. The normal export path correctly requires review. Employer information was not resolved; role and date interpretations conflict. Four of five original clickable targets do not reach the canonical link model. These import gaps remain open.

An isolated test used exact source-supported copies in memory to exercise the renderer without candidate confirmation. The original font failed on U+2264. Template/renderer 1.0.1 now embeds Noto Sans Math when needed, preserves mixed text and symbols, and verifies both embedded DOCX fonts after package normalization. All four PDF/DOCX and A4/Letter renderer combinations pass exact canonical parse-back. Both generated PDFs have three pages; DOCX page counts are estimated at three. This demonstrates canonical export recovery, not complete original-file fidelity or release acceptance.

`npm run verify` passed with **103 test files / 696 tests**, formatting, lint, type generation/TypeScript and web/worker builds. The two new synthetic symbol tests failed before the correction and pass afterward. Focused artifact tests pass **21/21**, and the [current synthetic receipt](aa6-20261016-engineering.json) passes **20/20** cases. The [current release receipt](aa6-20261016-release-blocked.json) remains blocked. Logs: `/tmp/resumide-math-verify.log`, `/tmp/resumide-math-font-before.log`, `/tmp/resumide-math-font-after.log` and `/tmp/resumide-math-benchmark.log`. The 53-browser-check result above remains the October 14 receipt; browser tests were not rerun for this font correction.
