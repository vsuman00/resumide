# Local OCR worker

The current application keeps upload OCR disabled. The local verifier exercises synthetic PDFs only. Its preflight checks source and worker records, then hands the derived pages and deadline to the existing synthetic selective runner. The grant and declared `local-test` region in this verifier are fixture metadata. A consumer grant would require verified records from the actual worker and target. [Admission decision](../decisions/0021-consumer-local-ocr.md)

## Verify the synthetic worker

Use an already reviewed local image and pass its immutable `sha256:` ID as `$ocr_image_id`. The verifier observes confinement, recognizes scanned and mixed fixtures, checks the native control, and verifies cancellation, timeout and cleanup. Run the profiles serially.

```sh
npm test -- tests/unit/ocr/local-review-admission.test.ts
npm run test:ocr:local -- "$ocr_image_id"
npm run test:ocr:local -- "$ocr_image_id" --text-fusion
```

The verifier issues no source-bearing requests to a provider. Its output records aggregate results and approved fixture metadata. Treat a positive run as local synthetic runtime evidence. The profile-specific quality and consumer-path acceptance gates remain separate. [Quality protocol](../evaluation/OCR_RELIABILITY_PROTOCOL.md)

The reviewed Debian update built and passed both synthetic profiles on ARM64 and AMD64. Its offline installer checks the exact APT plan and preserves unrelated packages and their APT markings. Run its focused tests with `python3 -B -m unittest discover -s scripts/ocr-runtime -p 'test_install_security_packages.py'`. Treat the successor digests as new local candidates. [Build and test evidence](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-r18-ocr-security-cohort.json)

On November 22, 2026, both profiles admitted the expected scanned pages and skipped OCR for the native fixture. The checks observed isolation and verified cleanup after success, cancellation, timeout and invalid PDF input. The fusion run also cancelled during the second recognition pass. [Synthetic worker receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-r15-synthetic-preflight.json)

## Owned extraction stage

The extraction stage passes worker cancellation through to the document parser and checks the active lease immediately before any supplied synthetic recognition request. The request must match the owned source checksum, native pages and retention policy. Recognition receives the remaining extraction time. The fenced writer receives the same source and lease bindings.

The isolated test ran the extraction stage and evidence assembler with mocked parsing, recognition, storage and database calls. The native middle page stayed intact and the two scanned pages produced review-only evidence. Lease refusal blocked dispatch, and a refused fenced write stopped the stage. Upload OCR remains disabled pending durable admission and the consumer-path test. Actual container cleanup for a leased upload remains open. [Stage receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-a06-synthetic-worker-fence.json)

## Diagnose denial and recover

| Condition                                           | Worker action                                                                                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Disabled, unsupported scope or enough native text   | Do not dispatch. Continue the native path where text is usable.                                                                    |
| Source, worker, region or retention mismatch        | Keep the source in its existing review or failure state. Recheck the server-loaded scope and worker inventory before re-admission. |
| Expired grant, lost lease, cancellation or deletion | Stop active work and reconcile the exact owned attempt. Require a fresh durable admission before retry.                            |
| Timeout, resource limit or invalid OCR output       | Preserve the attempt and failure classification. Keep partial or uncalibrated evidence out of scoring.                             |
| Uncertain cleanup                                   | Hold further admissions for the affected worker until exact-owned reconciliation confirms cleanup.                                 |

Use bounded outcome codes and runtime metadata in diagnostics. Document text, document-derived logs, tokens and scratch contents belong outside operational logs. Verify current source ownership, lease and retention state again before a future consumer writer accepts evidence. [Data map](../security/PRIVACY_DATA_MAP.md)
