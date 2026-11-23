# AA7 engineering closeout

AA070–AA075 local engineering is complete and verified on November 7, 2026. No currently reproduced functional failure remains in the tested scope. The owner subsequently closed and accepted Gate AA7 through [ADR-0017](../decisions/0017-aa7-owner-acceptance-and-aa8-start.md), with disclosed residual risks. Whole-project launch and production activation remain deferred; this is not an all-vulnerabilities-fixed claim.

The owner requested an end to repeated validation and speculative remediation. Completed checks stay closed unless a concrete failure or changed implementation justifies reopening them. This closeout separates the standalone Build feature from later deployment and release decisions.

## Delivered and verified

| Task | Result |
| --- | --- |
| AA070 | Approved local threat model, controls and operational contract |
| AA071 | Bounded, source-preserving single-file admission and immutable binding |
| AA072 | Actual isolated compilation, resource controls, cancellation and cleanup |
| AA073 | All six declared profile/paper combinations pass |
| AA074 | Two-pane editor, current-buffer preview/download, diagnostics and controlled AI flows pass |
| AA075 | Synthetic output, PDF safety, frame, render, rollback and recovery checks pass |

Exact unpromoted worker: `sha256:4b83ffec76083b02a79df7addf5ff1f8e09b6d90135d73915b890b38b7753b16`. Its source snapshot binds 588 code inputs, 61 runtime hashes, 53 context files and 24 pinned remote ADDs. No application environment, deployment or production flag was promoted.

The FreeType repair applies the exact vendor allocation-limit patch to the installed source version. The initial harness failed because normal Debian cleanup unapplied patches before a late source check; the corrected capture order passed without changing packaging or assertions. The component preserves 220 exports and known-font metrics. Its optional external-font regression and actual malicious-font CVE reproduction remain NOT_RUN. See the [actual native evidence](../../tasks/agent-handoffs/2026-11-07-aa7-freetype-build-allocation/attempt2-pass/evidence-manifest.json) and [Debian advisory](https://security-tracker.debian.org/tracker/CVE-2026-95512).

Final verification passes all 28 runtime groups, the original 20 PDF cases, 49 admission cases, four explicitly mocked boundaries, 107 frame checks, six profiles, rollback and rendering. Current XeTeX maps the exact patched library. Render PNGs are byte-identical to the already-reviewed output; that visual disposition was carried forward without repeating the green visual test.

The [final private CI receipt](AA7_FREETYPE_FINAL_PRIVATE_CI_20261107.json) records all nine commands exiting zero, 1,242 unit tests across 149 files, all 71 browser cases and zero advisories in both npm audits. Root reconciled source hashes, command logs and 21 retained artifacts in the [final review](AA7_FREETYPE_FINAL_ROOT_REVIEW_20261107.json). Synthetic fixtures, rate keys, private ledgers/files, processes, port 3110 and converter containers are cleaned. Supabase was used directly; no Docker database, reset or migration occurred.

## Deferred release work

The single [final image scan](AA7_FINAL_FREETYPE_SECURITY_20261107_FINDINGS.json) retains 947 raw matches: zero critical, 80 high, 186 medium, 670 low and 11 unknown. It adds no CVE identifiers versus the earlier snapshot. These are package advisories, not a count of reproduced converter failures; their raw findings remain and the owner accepts the disclosed residual risks for the AA7 phase decision. Further release treatment stays tracked. No finding was suppressed. The [bounded status handoff](../../tasks/agent-handoffs/2026-11-07-aa7-final-security-status/README.md) preserves source fixes, scoped caller evidence and explicit uncertainties.

The historical Poppler vendor result remains 70/71 with 56 complete Qt summaries under E-010, tested with the earlier FreeType dependency. It is not a vendor-suite rerun under the final FreeType library. Current package, closure, crypto and runtime bindings are recorded separately. Document/assistive-technology certification, license interpretation, representative validity and explicit production security/release acceptance remain separate launch work. No real-data or live-provider test was performed in this final run.

The final scan's exact temporary directory was removed after durable evidence checks; scanner databases, gzip backup, images and failed receipts remain preserved. [Cleanup receipt](../../tasks/agent-handoffs/2026-11-07-aa7-freetype-final-scan/cleanup-terminal.json).


## Owner acceptance

The explicit November 7 instruction closes Gate AA7 and starts AA8. Previous open-gate language in dated evidence describes the state before that instruction; raw scans and failed tests are unchanged. No AA7 revalidation is requested.
