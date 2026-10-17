# AA1 engineering closeout — 2026-10-11

Status: **Engineering CLOSED and accepted by the workspace owner; locked synthetic field acceptance FAILED; independent release validation DEFERRED; Gate AA1 NOT PASSED.**

The owner requested completion and explicitly directed engineering not to wait
for unavailable reviewers. [ADR-0011](../decisions/0011-aa1-engineering-closeout-and-deferred-validation.md)
records this scope. Synthetic engineering evidence does not establish representative
validity, confidence calibration, vendor equivalence or production readiness.

## Final disposition and handoff

The owner approved the disclosed engineering closeout under
[ADR-0012](../decisions/0012-aa2-engineering-sequencing-approval.md), then directed:
“You have to wrap up this phase firstly and fully wrap up right now Phase AA1.”
This record completes the engineering closeout before further AA2 implementation.
It does not represent a passed accuracy gate. No unavailable reviewer is needed
for this administrative closeout.

| Task  | Engineering disposition                                                                          | Acceptance disposition                                                      |
| ----- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| AA010 | Native evidence persistence implemented and verified                                             | Scoped native conformity accepted after AA0                                 |
| AA011 | Native geometry/reading-order view implemented and verified                                      | Scoped native conformity accepted after AA0                                 |
| AA012 | Selective local OCR, isolation and adverse controls implemented and measured                     | Synthetic engineering verified; representative/provider acceptance deferred |
| AA013 | Immutable reconciliation, grounding and score withholding implemented and verified               | Confidence remains uncalibrated; calibration deferred                       |
| AA014 | Authenticated correction, audit, concurrency, privacy and accessibility implemented and verified | Scoped engineering checks pass                                              |
| AA015 | Frozen benchmark, reports, intervals and fail-closed CI gate implemented and exercised           | Development passes; locked fields fail; representative release blocked      |

- [x] Engineering deliverables and scoped acceptance evidence reconciled with the task checklist.
- [x] Owner approval recorded; independent approval is not inferred.
- [x] Measured failures retained with unchanged labels and metric floors.
- [x] Release obligations assigned explicit exit conditions below.
- [x] Activation, migration, privacy and runtime-cleanup requirements documented.
- [x] AA2 draft work preserved; no further AA2 implementation during this closeout.

Engineering work is closed under the approved scope. Full original Phase AA1
acceptance is incomplete because its measured field gate fails and release
validation remains deferred. AA2 retains its existing engineering authorization
under E-003; that exception does not close Gate AA1.

## Residual acceptance register

These are open AA1 acceptance obligations, not completed engineering checks.
The workspace owner retains accountability for authorizing their follow-up;
no independent reviewer has been assigned or assumed.

| ID     | Obligation and current state                                                      | Required exit evidence                                                                                                                                                                                       |
| ------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AA1-R1 | Locked field accuracy FAILED: 92.31% precision / 75% recall                       | General improvements verified on development data, then a separately frozen untouched evaluation meeting every unchanged segment floor; retain this failed receipt and do not tune against its locked labels |
| AA1-R2 | Representative and independent validation DEFERRED                                | Authorized representative corpus, sample-size justification, independent annotation/adjudication and required layout/language/adverse segment reports                                                        |
| AA1-R3 | Confidence calibration DEFERRED                                                   | Approved calibrated policy with separate calibration/evaluation evidence; confirmations and raw engine scores cannot substitute                                                                              |
| AA1-R4 | Provider comparison, compute-rate cost and complete runtime measurements DEFERRED | Approved comparable-provider protocol, pricing inputs and qualified successful/failed/cold-start resource measurements                                                                                       |
| AA1-R5 | Release and production activation NOT AUTHORIZED                                  | Resolve the preceding acceptance obligations, record Gate AA1 and Gate A4 decisions, install the migration through an authorized deployment and separately approve activation                                |

Review-required/unsupported states, score withholding and the default-off flag
remain the enforced boundaries while this register is open. R1 is a measured
quality failure independent of reviewer availability.

## Implemented behavior

- Selective local OCR retains immutable native pages, normalized OCR word geometry,
  provenance and bounded runtime receipts. Encrypted and oversized-raster controls
  execute against the isolated engine. Failed resource measurements remain unknown.
- `evidence/2.0.0` reconciliation retains all source spans, exact Unicode references,
  critical-field proposals and disagreements. Strict replay validation rejects forged
  sources, fields, confidence or scoring eligibility. All evidence remains uncalibrated.
- The opt-in worker persists immutable evidence attempts and stops in review. Native
  text presence and candidate confirmation do not authorize numeric scores. Synthetic
  OCR adapters require explicit source-bound requests; production supplies no adapter.
- `/analysis/:id/evidence` authenticates the owner, presents original citations and
  separate confirmations/corrections, validates a bounded form and uses database
  compare-and-swap plus idempotency. Review history is append-only and auditable.
- Privacy export includes evidence attempts and correction history; source/account
  deletion cascades. Scorer and model guards withhold new results. Existing result
  pages redirect to evidence review when an attempt exists.
- The extraction-v2 benchmark freezes source/configuration/provider/code receipts
  before execution, isolates labels from adapters, measures exact field/span grounding,
  text/coverage/order and source-family bootstrap intervals. Required-segment failures
  return nonzero. Release mode retains independent validity and calibration requirements.

## Measured results

The earlier OCR structured-field diagnostic produced 60 TP, 3 FP, 12 FN
(95.24% precision, 83.33% recall), receipt `bbf981f79901020c21be6d780c26065281109ea8682d463144ffc780d50b06d5`.
The next run produced 71 TP, 0 FP, 1 FN (100% precision, 98.61% recall), receipt
`422932405ec38332e5c1bd7a779d0aedc17732ebc8c151ad86e17025749c2bb1`.
The missed employer was withheld across a page break. The first engineering
benchmark therefore failed its mixed-segment field-recall floor (23/24; 95.83%,
family interval 87.5–100%). These failures remain evidence, not passing receipts.

A subsequent generic parser change recognizes an organization followed by dated
employment context on the same page; it preserves source references and uncertainty.
The final development run freezes manifest
`3681718896a9b99c9dd49f7e6fc88788839dc10af98fdf961c84d1be04693728`:
12 documents / three development families recover 96/96 exact grounded fields;
all scoped native, clean, challenging and mixed segment floors pass. Zero scores
are emitted. [Development receipt/report](aa015-20261011-development.json).

The separate untouched held-out synthetic run freezes manifest
`c4e04ff9a6242a67d7a0428ff47e6f0080327e4f7d2e15c6aa1475cb3f9f8713`:
six documents / two families yield TP36, FP3, FN12. Each clean/challenging/mixed
segment has 92.31% precision and 75% recall; source-family 95% intervals are
87.5–100% precision and 62.5–87.5% recall. Transcription CER is zero, page coverage
and ordered-line agreement are 100%, but all three field gates fail and exit 1.
No score is emitted. This is an actual **NO-GO**, independent of missing reviewers.
The parser was not tuned after this locked result and labels/floors were unchanged.
[Locked receipt/report](aa015-20261011-locked.json).

Release mode exits 1 before recognition because representative validity,
independent annotation and calibrated policy are unavailable.
[Release-blocked receipt/report](aa015-20261011-release-blocked.json).
The CI local-OCR job enforces the same nonzero locked gate and uploads receipts;
its future pushed-run result is not claimed. Green regression CI is separate
from this failed field-acceptance gate.

The adverse control receipt is
`5c277d4c7615ab9a9d33e3ad6c9c9d7a4db8582b5905604e7064511fa7da0cf4`:
an authenticated encrypted PDF fails safely; a 16MP blank embedded raster is bounded
and remains insufficient/unscored. Actual container ownership, isolation and cleanup
were checked. Cached-image startup observations are not host-cold/SLO measurements.
Successful recognition-complete cgroup peaks exclude post-recognition/final-lifetime
and failed-attempt resource consumption; those are not inferred from child RSS.

## Final verification

- `npm run verify:ci` passes: registry signatures, secret/alert/container checks,
  source formatting/lint, **75 Vitest files / 512 tests**, type generation/check,
  production build, synthetic load/restore, Phase 5 benchmark,
  **46 browser tests**, and zero production dependency vulnerabilities.
  Browser checks include keyboard confirm/edit, exact retry, stale revision,
  foreign-origin and cross-owner rejection, immutable sources, no-store/session
  headers and axe checks. React Router rejects a foreign document action with
  HTTP 400 before the application's HTTP 403 same-origin check.
- Fresh `npm run test:db` applies every migration locally, passes prior Phase 4,
  Phase 7 and native evidence verifiers plus the new provenance/correction verifier;
  database lint reports no schema errors. Strict null/numeric tampering, role
  privileges, retained-score read suppression and source/account cascades pass.
- `npm run test:aa014:concurrency` uses two actual database sessions: exactly
  one writer applies revision 1, the concurrent stale writer conflicts and only
  one correction event exists. Synthetic users are cleaned up.
- Local `EVIDENCE_REVIEW_ENABLED=true npm run test:aa1:worker` passes four cases:
  native/mixed PDFs through direct extraction and the queued worker. Original
  pages/checksums are preserved, each retry retains one attempt, status becomes
  review-required or unsupported, and no legacy extraction, score, AI or writer
  output is published. External egress/redirects are prohibited by the checker;
  its exact uploaded objects and ephemeral user are removed.
- Real OCR acceptance/isolation controls, encrypted/oversized raster diagnostics,
  development and held-out engineering benchmark execution are measured separately
  above and in the prior AA012 diagnostics. The held-out quality failure remains
  nonzero; it is not converted into a regression pass.

Logs: `/tmp/resumide-aa1-verify-ci-final.log`, `/tmp/resumide-aa1-db.log`,
`/tmp/resumide-aa1-concurrency.log`, `/tmp/resumide-aa1-worker-final.log`.
Temporary logs are local execution evidence; versioned aggregate benchmark
receipts above provide the durable source/configuration/measurement record.

## Activation and deferred release work

`EVIDENCE_REVIEW_ENABLED=false` is the default. Install the additive document-evidence migration
before deploying this application revision (including with the flag off), and
before any activation; this work does not apply hosted migrations, enable real-candidate
OCR, collect real data or authorize external-provider spend. Existing legacy analysis
remains separate from the opt-in uncalibrated review workflow.

Independent reviewers, representative corpus, confidence calibration, multilingual/
multicolumn representative evaluation, compute-rate cost and provider comparison
remain DEFERRED. Gate AA1 release and Gate A4 production remain open. No metric
floor was changed and no reviewer or agreement was invented. AA2 implementation
was not part of this closeout. Subsequent owner approval to start AA2 engineering
is recorded in [ADR-0012](../decisions/0012-aa2-engineering-sequencing-approval.md);
it does not turn these failed accuracy receipts into passing results.

The implementation remains uncommitted and unpublished; no hosted migration,
production flag change or real-data collection occurred. The separately authorized
AA020 draft-contract slice already exists and is preserved; it is not an AA1
deliverable. No further AA2 work was performed during this closeout. AA1 engineering
is wrapped; its release/accuracy gate remains open.

The task-started local Supabase stack was stopped after verification with its
backup preserved. OCR containers and exact synthetic users/objects were cleaned
up; unrelated Docker services were not removed.

## Subsequent authorized runtime recovery — 2026-10-11

The owner subsequently authorized hosted migration and queued-analysis recovery
with “do it test yourself.” This supersedes the closeout-time statement that the
migration had not been applied; it does not change benchmark receipts or gate
outcomes. The migration was installed unchanged as hosted version
`20261011151855`; SQL guard tests pass with rolled-back synthetic fixtures.
The no-worker incident and stale quarantine/queue extraction transition were
repaired. The original analysis reached `partial` with saved deterministic results,
queue empty and zero AI runs. The continuous worker remains AI-disabled and
review activation remains off. See the [runtime recovery record](../operations/RUNBOOKS.md#quarantined-development-upload-incident--2026-10-11).
