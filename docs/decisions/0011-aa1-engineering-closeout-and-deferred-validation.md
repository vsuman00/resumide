# ADR-0011: Complete AA1 engineering and defer independent release validation

Status: **Engineering scope authorized by the workspace owner, 2026-10-11;
independent validation and production release remain DEFERRED.**

The owner requested full AA1 completion, then clarified that there are no human
reviewers and instructed the assistant not to block on them now. This extends the
local engineering sequencing under ADR-0010: finish selective OCR diagnostics,
immutable reconciliation, owner-controlled correction and the extraction-v2
benchmark without waiting for independent people. It does not record those
people, their agreement, representative validity or confidence calibration as
completed.

## Engineering work

- Preserve originals, native and OCR provenance, conflicting candidates and
  exact Unicode source references. Proposal heuristics remain uncalibrated.
- Persist new evidence as immutable attempts; corrections are separate,
  append-only owner events with optimistic concurrency and idempotency.
- Withhold affected scores for incomplete, unsupported, failed, conflicting or
  uncalibrated evidence. Candidate confirmation cannot override missing pages or
  an absent approved calibration policy.
- Provide an accessible review/correction surface, private export and cascading
  deletion. Corrections do not alter the uploaded PDF or original extraction.
- Run real synthetic local OCR, SQL authorization/concurrency guards, browser
  corrections and the locked/configuration-bound engineering benchmark.
- Implement an explicit release benchmark mode which fails until representative
  and independent-human/calibration evidence exists. A passing engineering
  command cannot close that mode or the AA1 release gate.

## Scope and sequencing

AA012–AA015 may be completed and reported as engineering implementation and
verification under this owner instruction. Their original calibration and
representative acceptance requirements remain separate release obligations.
The user instruction to continue engineering supersedes treating absent human
reviewers as an implementation prerequisite. The original AA0 contracts,
unchanged metric floors, synthetic-only data authorization, no external OCR
spend/provider, bounded local runtime and production Gate A4 remain governing.

The review workflow is opt-in and defaults off. Installing local migrations and
running synthetic integration tests does not deploy hosted migrations or enable
OCR for real candidates. New storage must be installed before enabling the
workflow. Legacy results keep legacy semantics; review-required new evidence
cannot publish a misleading legacy or v2 number.

## Closeout evidence

Record engineering tasks, tests and residual release obligations in
[`tasks/todo.md`](../../tasks/todo.md) and the dated AA1 closeout report. No
representative/domain/vendor claim is promoted. No reviewer or statistical
agreement is invented. Deferred release work resumes when the owner supplies
appropriate corpus/review/calibration evidence and reviews the measured result.

## Final engineering disposition (2026-10-11)

Engineering is CLOSED, with owner acceptance recorded in ADR-0012. The owner
subsequently directed AA1 wrap-up before further AA2 work. The [final report](../evaluation/AA1_ENGINEERING_CLOSEOUT.md)
records AA010–AA015 dispositions and open acceptance obligations AA1-R1–R5.
Locked field accuracy actually fails; Gate AA1 remains NOT PASSED. The existing
AA020 draft contract is preserved separately, with no further AA2 implementation
during this closeout. This completes the approved engineering scope and does not
complete the original representative/calibrated release scope.
