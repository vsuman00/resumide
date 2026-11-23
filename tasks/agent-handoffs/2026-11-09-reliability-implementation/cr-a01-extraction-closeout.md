# CR-A01 extraction verification

CR-A01-S05 passed local verification on the dirty integration checkout based on `a0b2392`. CR-A01 remains PARTIAL. The [verification receipt](cr-a01-extraction-verification.json) records the source hashes, results and failed attempts.

Text-only PDF extraction now reads pages in order and stops before fetching another page if it crosses the text limit. It preserves empty page positions and disposes of the PDF on success and failure. A disposal failure preserves any existing typed extraction error. The worker forwards cancellation to the parser, and a monotonic deadline rejects late results even when synchronous work delays the timer callback. Oversized inputs, checksum mismatches and timeouts now have terminal extraction codes.

| Check                         | Result                                                                                                                                                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js 22 test suite         | 6,765 passed in 323 files, including 3 isolated process tests. No failures or skipped cases.                                                                                                                                                                                                  |
| Static checks and builds      | Formatting, AA1 source validation, typecheck, lint, web build and worker build passed. Lint reported four existing hook warnings.                                                                                                                                                             |
| Locked OCR benchmark          | All 12 synthetic PDFs passed the engineering thresholds across clean, challenging and mixed segments. The evaluator counted 96 predicted critical fields and 96 expected. The run emitted zero authoritative scores. Release evaluation did not pass.                                         |
| OCR resource and input checks | The earlier adverse run passed using the same image. Only the existing OCR image ran, and no labelled OCR attempts remained.                                                                                                                                                                  |
| Page-count SQL                | PostgreSQL 17 executed the current writer, dispatcher and lease functions on the [synthetic schema fixture](cr-a01-page-count-native-fixture.py.txt). A blank page remained in the measured total. Exact replay, owner and role checks, and rollback on inner refusal or lease expiry passed. |

The SQL fixture used substitutes for the old writer, privacy checks and table constraints. It did not execute the entire migration or the actual managed catalogue checks. The locked OCR fixture tests the parser/image pair at PSM 3 and up to 150 DPI. It supplies no representative accuracy estimate.

The remaining CR-A01 gate requires the current schema and worker in an admitted isolated Supabase project. Exercise a synthetic PDF through upload, a live lease, evidence persistence and recovery, then verify fixture cleanup. The configured project's catalogue contains 33 older migrations and cannot prove that path. Publication and deployment were untouched.

## Verify the stored PDF before parsing

CR-A01-S14 reproduced an integrity gap at the leased worker entry point on dirty `main` based on `a0b2392`. Both legacy extraction modes called the parser when the Storage response bytes differed from the saved source. The regression uses a mocked Storage response and records the actual worker dispatch and mutation calls.

Legacy text and native-layout extraction now use the same byte-limit and SHA-256 check as document review. With a mismatch, the leased worker records a fenced `extracting` to `failed` transition. The parser, evidence writers and extraction writers receive no input. Matching bytes continue through the existing paths. The failure message contains no source bytes or checksum values.

All 107 focused tests passed across seven files, including native extraction from real synthetic PDFs. Typecheck, formatting and web and worker builds passed. Lint reported four existing hook warnings and zero errors. Managed Storage replay, upload malware scanning and parser-host confinement remain open.
