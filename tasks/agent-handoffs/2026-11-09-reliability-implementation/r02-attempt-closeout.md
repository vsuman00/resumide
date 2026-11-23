# R02 cancellation and usage repair

Completed 2026-11-10, Asia/Kolkata. Main at `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus preserved dirty files. This closes the scoped transport repair; the full reliability plan remains active.

Qualitative feedback and explicit rewrites now link caller cancellation and wrapper deadlines to the actual SDK fetch signal. A pre-aborted caller dispatches nothing. The shared helper removes its timer/listener and rejects late output. The rewrite HTTP endpoint forwards its actual request signal. This proves client-side signaling, not provider billing cancellation or worker lease fencing.

Both transports preserve observed nonnegative safe-integer usage before validating raw completion content. Refusal, malformed JSON, invalid schema, truncation and filtering retain known counters in safe typed failures. Missing or invalid usage remains null; genuine zero remains zero. Current high-level success still requires known usage because existing SQL callers require numeric counters. Unknown usage therefore returns `AI_OUTPUT_INVALID` with no accepted output. Durable shared attempt recording and conservative reservations still require R03.

The request now explicitly sets `store:false`. Model, prompt, response schema, output-token limits, source binding and idempotency headers are unchanged. Zero SDK retries, redirect rejection and disabled SDK logs remain. Sanitized errors retain only bounded numeric HTTP status when available. Actual SDK timeout constructor identity is checked; its generic error name would otherwise misclassify it. No raw provider message/body/cause is copied into failure metadata.

## Evidence

Frontend first reproduced four cancellation failures with 22 original tests passing, then froze 58 wrapper/service cases with 24 failures and 34 passes against the old sources. After the repair all 58 pass. Runtime independently reproduced four installed-SDK failures plus the actual timeout-constructor classification failure; its final 25 cases pass. Existing assertions remain intact; the old SDK-body expectations only gain `store:false`.

Root reviewed and integrated the exact released sources/tests after full hash and unchanged-baseline checks. The [combined check](r02-attempt-integrated.json) passed 145 tests across 11 affected files, full typecheck, lint, web build and worker build. All 657 inputs stayed unchanged during that run. The [independent observation](r02-attempt-integrated-observation.json) confirms both final artifact hashes and all five process groups absent. This was an affected test run, not a new full-suite result. Original failed receipts and batch08 evidence remain preserved.

The live verifier now binds the new transitive helper before future allocation. Its fixture, caps and allocation/execution policy are unchanged. No new allocation or live request ran. All HTTP responses in this repair's tests are local doubles. No database, Docker, browser, owner-document, deployment or Git mutation occurred.

## Remaining and next action

Implement the shared R03 technical-budget ledger and settle known/unknown attempts before claiming durable accounting. R09 later connects lease loss to the optional abort contract. The unserved legacy `analyzeResume` export retains its old SDK path and is outside this consumer repair packet. R02 remains partial at parent level. Useful live writing, canonical correction, OCR, managed compatibility and the complete G01–G03 acceptance gates remain open. No credential retest or unchanged test campaign is needed.

[Backend implementation](backend-provider-attempt.md), [wrapper/service tests](frontend-provider-attempt-tests.md), [independent SDK review](runtime-provider-attempt-review.md).
