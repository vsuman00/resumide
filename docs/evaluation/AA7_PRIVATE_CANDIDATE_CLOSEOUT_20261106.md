# AA7 private hardened candidate closeout

Status: PRIVATE AA070-AA075 ENGINEERING COMPLETE; FUNCTIONAL VALIDATION PASSED; FORMAL SECURITY/RELEASE ACCEPTANCE OPEN. Current uncommitted candidate on base `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. All testing stayed private. No deployment, publication, live model call, real candidate document, database reset/migration or Docker database. Database fixtures used the configured managed Supabase directly; Docker was worker-only.

## Change and provenance

Immutable candidate `sha256:19d2a00a2a830173bf1fae07dddfcac7d54be3047e58b276af031d3cbd1018ac` replaces PyPDF2 with maintained, exact wheel-hash-pinned pypdf6.21.4 and removes compiler/header/pip tools from the final stage. The same base digest, snapshot, TeX capabilities and runtime protections remain. The old600c image and configured image are unchanged. [Build and inventory](AA7_HARDENING_CANDIDATE_METADATA_20261106.json).

Two upstream download failures and one local cache-staging failure remain recorded. The final successful build uses one exact official Debian artifact whose size/SHA256 matches the signature-verified fixed-snapshot index; no version/date fallback. [Authentication proof](AA7_PINNED_XETEX_ARTIFACT_PROVENANCE_20261106.json); [successful build](AA7_HARDENING_BUILD_ATTEMPT4_20261106.json).

## Verified candidate evidence

| Check                                                              | Result                                                                                   | Evidence                                                       |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Actual worker isolation/resources/cancellation/concurrency/cleanup | 20/20groups                                                                              | [Runtime](AA7_HARDENING_CANDIDATE_RUNTIME_20261106.json)       |
| Actual parser structural policy                                    | 20/20cases, all19old expectations plus depth rejection                                   | [Runtime](AA7_HARDENING_CANDIDATE_RUNTIME_20261106.json)       |
| Known profile/paper output                                         | 6/6 synthetic cases                                                                      | [Benchmark](AA7_HARDENING_CANDIDATE_BENCHMARK_20261106.json)   |
| Quarantine and fresh-process recovery                              | Passed; flag-off stage is explicitly unit HTTP evidence                                  | [Rollback](AA7_HARDENING_CANDIDATE_ROLLBACK_20261106.json)     |
| Combined application checks                                        | 1,203tests/145files, format/lint/types/web+worker builds pass                            | [Validation](AA7_HARDENING_CANDIDATE_VALIDATION_20261106.json) |
| Full dedicated browser suites                                      | 7converter+6controlled-AI cases pass                                                     | [Browser](AA7_HARDENING_CANDIDATE_BROWSER_20261106.json)       |
| Exact-image license metadata                                       | 190copyright hashes,125DEP5,65nonDEP5unresolved; parser metadata/license hashes verified | [Licenses](AA7_CANDIDATE_IMAGE_LICENSES_20261106.json)         |

Counts overlap and must not be summed. The small synthetic benchmark does not establish representative latency. General parser cases are not named CVE exploit reproductions. Browser testing includes real PDF compile/download, keyboard/mobile/current-buffer/stale guards, toolbar geometry, popup Axe, consent, facts, review/Apply/Undo and provider timeout/refusal with a controlled stub. The artifact path changed after full verification; focused source checks and the full browser run cover that literal-only change.

## Cleanup

The candidate browser batch's12temporary owners/auth sessions and related rows were independently verified absent. All24recorded rate keys were absent after13owned-row deletions; shared global keys were untouched. Private fixture files were deleted after verification; port3110 and owned worker containers were absent. Earlier batches have their separate receipts. Temporary scanner/tool/archive/databases were deleted only after durable raw-output/hash verification; both worker images remain available.

## Security findings and limits

Paired enforced-offline scans used the identical verified vulnerability databases and full cryptographic index/platform/config/layer binding. Raw package matches fell from3,632 to958, with zero new package/CVE pairs. Critical matches fell4to3; high269to70. All findings, unfixed records and the initial identity-wrapper failure are preserved. [Complete comparison and remaining findings](AA7_IMAGE_CVE_COMPARE_20261106.md).

The candidate parser group has zero reported matches in this database; this is not a vulnerability-free guarantee. GLib/SQLite/zlib critical package records and70high records remain for vendor/runtime triage, including prior qualifications. License metadata does not prove legal or per-file font/TeX clearance. PDF tagging/assistive-technology acceptance, representative validity and formal security/release decisions remain open. Functional green does not waive those gates. Next work is evidence-based residual actionability, not a public test or silent configuration promotion.

## Residual actionability

The [bounded actionability report](AA7_CANDIDATE_RESIDUAL_ACTIONABILITY_20261106.md) authenticates both configured snapshot components: APT/libapt2.6.2 is absent, so an ordinary upgrade within these pins cannot obtain that reported fix. A new source/date/backport or separately reviewed runtime-composition decision is required. The critical-library closure audit is narrowly qualified and does not prove runtime-wide unreachability. No remaining finding was suppressed or accepted.

## Completion audit

The coordinator reviewed separate senior developer and tester audits against AA070-AA075. Current source-bound evidence covers the approved local threat model, bounded source admission, worker isolation, examples, editor/preview/download and synthetic output/security/benchmark checks. All requested private implementation and internal functional validation work is complete. Runbook commands and historical activation wording were corrected to avoid mixing the old parser image with the new verifier. Documentation-only corrections require no repeat application or runtime run.

The remaining formal Gate AA7 decision is deliberately open. Unresolved scanner findings, license interpretation and PDF/assistive-technology acceptance are preserved as release limitations; no public testers, representative corpus, deployment or risk waiver were introduced. Optional APT removal preflight produced a native safety warning and stopped without a purge, force flag or image change. Further runtime composition changes are a separate reviewed task. This closes the owner's private engineering objective, not a production release or claim of zero vulnerabilities.
