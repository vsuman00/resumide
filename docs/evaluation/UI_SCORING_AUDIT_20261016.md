# UI, scoring and JD audit - 2026-10-16

Status: **AUDIT COMPLETE; DEFECTS REPRODUCED; IMPLEMENTATION FIXES NOT APPLIED.**

The audit examined the current local workspace, including its existing uncommitted AA2-AA6 work. Three parallel reviews covered scoring, JD matching and UI state. Reproductions used synthetic in-memory data. Findings about this workspace do not establish that the same revision or feature flags are deployed on Vercel.

The governing constraints, architecture, phase plans, current engineering closeouts and applicable designs were reviewed. Numeric policy approval, calibration, representative validation and formal release acceptance remain open. This report does not change those gates or invent replacement scores.

## Highest-priority findings

### 1. JD parser and persisted database contract disagree

Priority: P1. Evidence: failing contract test plus enforced SQL source; no database write attempted.

`app/lib/server/job-requirements.ts:124` emits `jd-parser/1.0.1`. The shape validator in `supabase/migrations/20261012064727_job_requirement_versions.sql:4` permits only `jd-parser/1.0.0`. Both the save RPC and table enforce that shape. There is no subsequent migration updating this validator. New imports therefore cannot persist on a database matching these migrations; the repository maps the validation error to HTTP 422. This blocks downstream requirement review even when parsing succeeds.

Repair: add a forward migration accepting supported producer versions while preserving immutable historical documents. Test actual import and read-back against the local database as well as schema agreement.

### 2. Partial JD coverage receives full keyword credit

Priority: P1. Evidence: executed synthetic scoring reproduction.

`app/lib/server/atsRules.ts:174` gives all 26 keyword points at a coverage ratio of 0.5. Structure, contact and length rules supply the other 74 points. A well-formatted synthetic office-assistant resume, evaluated against `Python Kubernetes required`, produced:

| Resume evidence | Score | Missing requirement |
| --- | ---: | --- |
| Neither skill | 74 | Python, Kubernetes |
| Append only Python | 100 | Kubernetes |
| Append both skills | 100 | None |

`app/lib/score-band.ts:4` labels 74 Strong. `app/lib/server/qualitative-stage.ts:153` uses this deterministic value for both the overall score and ATS score. Model prose does not correct it. The legacy value cannot be interpreted as complete job fit. A replacement numeric policy requires the existing approval and calibration process; this audit does not propose arbitrary new weights.

### 3. Company prose displaces actual requirements

Priority: P1. Evidence: executed synthetic scoring reproduction.

`app/lib/server/matching/matcher.ts:152` keeps the first 20 candidates by source position. Generic extraction scans the entire JD. With the same complete synthetic resume containing Python, `Python required` scored 100. Prepending this company paragraph changed the score to 74 while leaving the requirement unchanged:

```text
About us
Acme builds secure global payment products for customers across finance banking commerce research healthcare logistics education retail analytics insurance marketing travel media energy agriculture manufacturing telecom.
Requirements
Python required.
```

The selected terms became company-description nouns; Python disappeared from the selected set. Requirement scope must precede generic candidate selection, and truncation must be disclosed.

### 4. Explicit lack of experience counts as positive evidence

Priority: P1. Evidence: executed synthetic matcher reproduction.

The alias-occurrence check at `app/lib/server/matching/matcher.ts:156` does not account for negation. Resume text `No Python experience.` against `Python required` returns Python as matched, with no missing or uncertain term. Conversely, a JD stating `No Java experience required. Python required.` allows Java evidence to contribute to the legacy coverage threshold. Positive qualification evidence must exclude explicitly negative claims and non-requirements.

### 5. Clarification answers can move to a different contribution

Priority: P1. Evidence: actual-component DOM reproduction with a synthetic router and no network/database calls.

`app/components/AuthoringWorkspace.tsx:316` uses an uncontrolled selector. Clarification forms at line 336 are keyed only by question kind, so changing the focused fact preserves their input state while updating the hidden target at line 341.

```text
Before navigation: selector=fact-a, target=fact-a, answer="Cut API latency 20%"
After ?focus=fact-b: selector=fact-a, target=fact-b, answer="Cut API latency 20%"
```

The next confirmed save can attach A's answer to B. Key/reset the form by selected contribution and keep the selector synchronized with the route. Verify browser back/forward and unsaved-input transitions.

## Additional matching, parsing and UI defects

| ID | Priority and scope | Reproduction or evidence | Source |
| --- | --- | --- | --- |
| 6 | P1, default-off JD/v2 diagnostics | `Python required; no Java experience required.` makes both skills negated/contextual. Python then becomes `not_applicable` in the alignment state. Negation is scoped to the entire line rather than the relevant clause. | `app/lib/server/job-requirements.ts:331`; `app/lib/server/score-v2-engine.ts:228` |
| 7 | P2, canonical import | Changing only `Experience` to `Professional Experience` or `Employment History` removes the canonical experience section. Text and role facts remain, but content falls into `Imported content`. The evidence parser and importer disagree on supported heading aliases. | `app/lib/server/canonical-content.ts:40` and line 100 |
| 8 | P2, legacy score | An empty first Experience section followed later by populated Professional Experience changes the same synthetic resume from 74 to 56. Date and bullet checks inspect only the first section and report missing evidence with high confidence. | `app/lib/server/atsRules.ts:123` and line 142 |
| 9 | P2, default-off v2 observation | Confirmed, source-cited Bachelor of Fine Arts is proposed as satisfying Bachelor of Computer Science. Matching checks the degree token without the discipline. Authoritative score and evaluation remain withheld. | `app/lib/server/score-v2-engine.ts:275` |
| 10 | P2, default-off v2 observation | A fixture with 36 months of software employment but no Python fact is proposed as satisfying `Must have 3 years Python experience`. General tenure is substituted for skill-specific tenure. | `app/lib/server/score-v2-engine.ts:243` |
| 11 | P2, JD parsing | `Python required; Docker preferred.` gives both skills unknown/conflicting importance rather than their separate clause-level importance. | `app/lib/server/job-requirements.ts:170` |
| 12 | P2, JD parsing | After a Benefits section, `Required Skills and Experience` is not recognized as a requirement heading. A following `SQL required` is silently skipped. | `app/lib/server/job-requirements.ts:272` |
| 13 | P2, default-off v2 observation | A confirmed AWS certification satisfies `AWS certification required`, but adding a terminal period changes the proposed state to `not_evaluated`. Cue removal leaves punctuation in the comparison target. | `app/lib/server/score-v2-engine.ts:285` |
| 14 | P2, upload cancellation | Cancel aborts only the client request, yet the UI states `Your file was not saved.` An accepted server request may already have saved the file. This race is established from the implementation; no production upload/cancel race was executed. | `app/routes/upload.tsx:128` and line 347 |
| 15 | P2, result priorities | The first three improvement tips in fixed category order are labeled Highest-impact fixes. There is no impact ranking; three ATS tips can hide every skills/content suggestion. | `app/routes/resume.tsx:225` and line 448 |
| 16 | P2, result score label | A historical legacy score appears under Readiness despite the separate contract withholding authoritative Application Readiness. A legacy disclaimer exists, but the specific label remains misleading. | `app/routes/resume.tsx:363` |

## Live deployment observations

Read-only HTTP checks of `https://resumide.vercel.app` returned 200 for `/`, `/auth`, `/upload`, `/healthz` and `/readyz`. Health returned `ok` and readiness returned `ready`. Unauthenticated `/account` redirected to sign-in; `/metrics` returned 404 as intended.

Finding 17, P2: the checked responses still omit Content-Security-Policy, X-Frame-Options and X-Content-Type-Options. This confirms a deployed response-header gap; it does not identify the deployment adapter or revision responsible. The local root loader constructs these headers, so enforcement must be checked at the actual Vercel response boundary.

No browser surface/window was available through computer-use tools. The authoring mismatch was reproduced in the actual component DOM; visual layout, mobile interaction, email verification and authenticated production upload-to-score remain unverified. No production candidate records, model APIs or email sends were used.

## Verification and limits

- Full `npm test -- --reporter=dot`: 103 files, 702 tests; 102 files and 701 tests passed. The sole failure is `tests/unit/job-intelligence-benchmark.test.ts:14`, the SQL/server shape mismatch in finding 1.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Parallel focused checks passed: 45 scoring tests, 53 JD tests and 29 UI/route tests. These overlap the full suite and must not be added to its total.
- Additional synthetic reproductions exposed behavior not asserted by the passing tests. Passing existing tests does not establish matching quality or score validity.
- V2's unavailable score dimensions are intentional under `docs/design/SCORING_V2_REVIEW.md`. The diagnostic false positives above must be repaired, but replacing null values with uncalibrated scores would violate the current contract.
- This audit added only this report. Existing implementation changes were preserved. No migrations, deployments, commits or pushes were performed.

## Repair order

First repair persisted JD version compatibility and the clarification target/state mismatch. Then add adversarial regressions for negation, required/preferred clauses, company boilerplate, heading aliases, multiple experience sections and qualification specificity. Fix those extraction and evidence errors before considering scoring-policy changes. Keep ATS compatibility, job alignment and unavailable readiness distinct in the UI. Recheck cancellation wording and deployed headers separately. Numeric activation still requires the documented policy and validation gates.
