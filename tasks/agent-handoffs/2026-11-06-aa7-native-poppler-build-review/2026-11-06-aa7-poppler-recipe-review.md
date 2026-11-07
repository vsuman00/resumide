# Independent native Poppler recipe review

2026-11-06, aa7_validation. Source/recipe review only; no native build, vendored test/source execution, builder import, container, database, provider or root edit occurred. Own neutral checks use standard-library data and selected trusted outcome-validation AST. Existing fc8 evidence is unchanged.

## Recommendation

The frozen recipe is ready for a coordinator-authorized bounded build, with a final aggregate-export acceptance gate made explicit. Actual native test, package/ABI, parity and installation results remain unexecuted. This recommendation grants neither execution authorization nor artifact adoption, vulnerability clearance or release approval.

Two concrete preparation defects were corrected before freeze: original `Build-Depends-Indep` entries `libcairo2-doc` and `libglib2.0-doc` are now explicit without bypassing `dpkg-checkbuilddeps` or normal `-b`; all three private-frame reads now check file existence and the2MiB cap before reading bytes.

One remaining advertised-bound qualification: `run()` polls aggregate export size during subprocesses, and selected packages have a64MiB cap, but the final package/receipt copies follow the last subprocess. Require a final total-export size check against the advertised256MiB limit before treating exported output as accepted. A coordinator-owned post-export rejection gate can supply this without weakening the build. Do not present the existing polling check alone as a hard final-artifact bound.

Coordinator disposition: root explicitly approved one build on this exact frozen recipe with host final-export acceptance at most256MiB and DEBs at most64MiB. That separate gate resolves the copy-phase qualification without source changes. The actual build/result is pending; no runtime adoption is supplied by that authorization.

## Reviewed acceptance behavior

- Normal original `dpkg-buildpackage -us -uc -b -j2`, hardening flags, default `dh_makeshlibs` and Debian test rules remain. Debian's existing ignored `dh_auto_test` status is preserved and explicitly insufficient for acceptance. No `nocheck`, dependency bypass, symbol suppression or force-install option was found.
- Fatal CTest discovery must equal all71 pinned registrations. The independent source inventory confirms56 Qt plus15 image-embedding tests. CTest must exit0; complete JUnit must contain exactly that set, no failure/error/skipped node, and no non-run status. All56 Qt outputs need exactly one totals summary with more than init/cleanup alone and zero failures/skips/blacklists. An exit0 with no actual tests is insufficient.
- Same exact PDF bytes feed installed baseline and candidate bbox/TSV, which must match byte-for-byte. Private frame page dimensions, every absolute coordinate token, word text/order and unchanged layout result must match XML. Seven pinned public PDFs and font-inventory parity are included. This does not replace subsequent six-profile/worker/browser verification.
- `none` must be present in CMake cache with no enabled JPX macro, no OpenJPEG import/dependency in runtime ELF files or actual extractor loader graph, and the neutral inline-JPX probe must observe unknown-filter/EOF behavior while preserving unrelated text. No whole-document rejection or upstream fix is claimed.
- The full baseline dynamic export-name set and SONAME must remain; the old-header client runs against baseline and candidate and verifies actual candidate linkage. This is one bounded consumer proof, not every possible external ABI consumer.
- Exactly `libpoppler147` and `poppler-utils` share the honest local version/architecture. Normal APT simulation/install uses `--no-remove`; only those packages may change. Essential/Protected flags and every other package/version remain equal. A fresh nonroot/NNP/capability-zero probe rechecks installed ELF hashes and actual CLI text/linkage.
- Package copies occur after mandatory tests/native verification. Any exception is re-raised; the default artifacts target depends on successful install/probe as well as build. Failed stages cannot produce that accepted final target. All phases/log metadata remain; only diagnostic tails have an explicit aggregate cap.

## Independent neutral results

PASS, actual exit0:19 synthetic cases exercise the actual outcome-validation AST without importing/executing the builder. They reject zero/missing/extra discovery, missing/duplicate JUnit cases, failure/error/skipped/non-run status and Qt missing/zero/init-cleanup-only/failed/skipped/blacklisted/duplicate summaries. Positive71/56 input passes. AST/file I/O/native subprocess portions are deliberately not executed.

PASS, actual exit0: all41 review-manifest files and20 context files match size/hash; all65 regular public test-data files match their pinned names/sizes/hashes, totaling3,178,886 bytes. Reading the archive did not extract or execute it. The64 fixtures plus full COPYING are bound to commit `0ef006dca68d2206387eca1d36ae06733812e387`. Repository GPL2 metadata is retained; it does not establish per-fixture legal interpretation, representative validity or permission to publish an artifact. Builder tests retain the original registered selection; skipped/missing data cannot count as a pass.

Preserved neutral preparation stops: the initial AST extractor included the JUnit file-size guard and stopped at its shape assertion; its corrected extraction then rejected an old hash while backend source was changing. A separate static source-registration check initially missed indented CMake calls and failed; the corrected whitespace-aware inventory matches71/56. All three exited1 before any native execution. These are check-preparation failures, not native builder failures or waived acceptance results.

## Frozen source and evidence

Backend recipe: `/Users/vaibhavsuman/.codex/worktrees/aa7-20261106-licenses/resume_ats/scripts/latex-runtime/native-poppler`.

| Artifact | SHA256 |
| --- | --- |
| Frozen review manifest | `f6f3a3bbe7a55c6a8e1f4e4c534499e1d9e94a18b768b129be2d8be0ec7ab54d` |
| Explicit20-file context manifest | `58172309995aa90fd254c17f2217ded30f79f089ebdbb4b342d5f1a24cb60853` |
| Dockerfile | `cf7848e70ed993825fa36b5565ace19fda1dfac88421cf77a8f653736d767cf4` |
| Builder | `4c0db0a63b451fb83cf69b3395a4e03bfc12a470ed8fc7b19802d9b170c34ec8` |
| Native verification | `5f8ab8db1ab82a98ef338ce45f4ecaf0e9296a07676150c206a6cf1401cbdfa8` |
| Install verification | `eed986532c80a9283ea82e9a155e45c39260253420c5bf018299729b443e480b` |
| Own neutral gate script | `64696b820b24d596d511aafdd22c9c7e79be929c550998ce45228b1725a80023` |
| Own19-case receipt | `7c85db75d89c4bd4aba9a1d95683d1b410528fb8ce9bd60cfc33daea9c911ac1` |
| Own static/hash/data receipt | `3812dc0941fab158f654e90bd7faea823761e2c40f0b072c8c9fa43a736541d9` |

Own script/receipts use the same dated `2026-11-06-aa7-poppler-` prefix in this handoff folder. Root owns final recipe approval/integration and the host build command. Source hashes must be rebound if the final export gate changes the recipe. No claim is made that these source-only checks satisfy the native or full worker acceptance contract.
