# Native Poppler V4 source review

Reviewed the frozen V4 proposal on November 7, 2026. Result: source review passes, with no concrete defect found in the requested change. No builder, vendor source, compiler, Docker operation or test was executed. This review does not authorize an exception or claim candidate acceptance.

All 64 review-manifest entries match their sizes and SHA256 values (3,346,157 bytes). All 22 context entries match (3,125,165 bytes), and the literal file allowlist is exact. All 41 V1, 51 V2 and 59 V3 historical manifest entries remain unchanged. Python AST parsing inspected code as data only.

## Fatal acceptance remains intact

The complete block from JUnit setup through the upstream receipt is byte-for-byte identical to V3. It still requires exactly 71 discovered names, successful CTest exit, the exact executed-name set, and no failed, errored, skipped or non-run testcase. It still requires 56 Qt executable summaries, each with more than initialization/cleanup passes, no failures, no skips and no blacklisting. The original consumer 107 and old-header baseline checks remain unchanged.

The exact unchanged verify_native.py now runs after candidate package extraction and before CTest. Its export/SONAME, old-header client, no-OpenJPEG, bbox/TSV/frame/geometry/font and disabled-JPX checks are unchanged. A caught native validation error is recorded as failed-still-fatal; after CTest and its original acceptance block, line 182 rethrows that error before any selected-package copy at line 188. Uncaught interruptions also fail the build. No test failure can reach package copying.

Dockerfile changes only which driver is copied to the original entrypoint. The ignore-file changes select the V4 Dockerfile, ignore file and driver. All original dependency/source pins, isolation, compilation and test settings remain intact. The source-building RUN still fails on the driver's nonzero exit. Installation and artifact targets depend on that completed stage. A late copy/I/O failure could leave partial private files in its failed layer; it cannot produce a successful artifact target or be treated as an accepted export.

## Diagnostic binding and bounds

Before CTest, the new binding checks the signature executable, exact build-tree core library and mandatory core DT_NEEDED. It rejects unresolved libraries and paths outside the resolved build directory or system library directories. It hashes every observed loaded library and requires all seven named GPGME/NSS dependency sonames. It records executable, core and original test-source hashes. This is adequate evidence for identifying which candidate signature test/core/crypto graph was about to run; it does not itself establish a passing test.

Binding limits remain explicit: at most 128 loaded paths, 256MiB aggregate library bytes and 1MiB JSON. The failed-JUnit branch runs only after an existing fatal-upstream-tests failure. It accepts one exact check_qt6_signature_basics record, at most 128 observed cases, 16MiB XML input and 64KiB emitted JSON. It emits the full exact-case XML plus observed test status/Qt totals and JUnit hash. Missing, malformed or oversized diagnostics print UNAVAILABLE while preserving the original raised failure. The bounded branch never marks a failed or incomplete run successful.

The retained run helper still enforces process time/output bounds. The native verification uses a separate candidate environment and writes only diagnostic/neutral files; it does not overwrite the signature source, executable, keys, assertions or global test settings. Its earlier position is an intentional ordering change, not a validation waiver.

Execution remains pending coordinator allocation and the applicable E-009 decision. Actual candidate bindings, native checks and all 71/56 outcomes must still be observed. The candidate's original Qt failure has not been captured by this review, and the reproduced published-baseline signer failure must remain separate.
