# JD review: recorded declarations and historical views

The scoped A10 diagnostic and U04 historical-view repairs are **VERIFIED**. Their parent tasks remain **PARTIAL**. Full requirement coverage, canonical/JD proposal-pair admission, native consumer journeys and release acceptance remain open.

## Corrected behavior

A real synthetic certification edit cleared its source citations. Exact owner confirmation then recorded the new value correctly, but diagnostics still asked for source-backed confirmation. The first regression reproduced that sequence through canonical editing, confirmation, JD parsing and the actual diagnostics engine before implementation.

New diagnostics use producer `score-v2/1.0.2`. They acknowledge an exact owner/value declaration without treating it as source evidence. A declared uncited match remains `not_evaluated` with a missing-source explanation. A declared listed skill remains `not_evaluated` with a proficiency/duration review explanation. An undeclared candidate still requests confirmation. Confirmation and citation eligibility stay on the same fact, so separate duplicate facts cannot combine one declaration with another citation.

The cited role/date helper and complete experience-duration calculation remain byte-identical. All authoritative dimensions stay null, evaluated alignment remains withheld, and source/calibration blockers remain. This changes a regenerated diagnostic observation, not numerical admission, stored scores or an adopted scoring policy. New output and fingerprints carry the new producer; readers retain all older producers. The benchmark derives its version from generated output. Historical inputs regenerated now identify that current producer; this does not promise identical output from an older engine. Frozen evaluation labels and original receipts are unchanged.

A separate actual Router SSR regression showed that an explicitly selected historical JD still presented Save using the current head. The page now labels that selected snapshot read-only, omits Save and links to the current version. Current-version and initial-import views retain the existing native POST, expected-head and idempotency fields. Loader, action, feature, authentication, origin, privacy and CAS declarations are unchanged.

## Integrated verification

One combined Node 22.23.4 run passed **66 tests in five files**, zero failures or skips, then full typecheck, lint, web build and worker build:

| File                             | Cases passed |
| -------------------------------- | -----------: |
| Score diagnostics engine         |           30 |
| Score envelope contract          |            8 |
| Scoring validity/blocked release |            2 |
| Scoring route                    |           14 |
| JD route and historical SSR      |           12 |

The checks cover the actual edit/confirm/parse/diagnostics sequence, both duplicate-fact orders, wrong declaration actor/value, unconfirmed facts, unchanged date admission, producer-bound fingerprints and historical envelope readers. The validity CLI intentionally exits nonzero for its blocked release report; its test passes by asserting that unchanged restriction. No representative accuracy or calibrated score is claimed.

The historical SSR baseline had one failed case and two passing controls. All three pass after the UI repair; all six original test declarations, expanding to nine cases, remain byte-identical. The backend preserves all 19 original engine cases, updating only two explicit listed-skill expectations for the new producer and adding their remaining-evidence reasons. It does not rewrite old evaluation labels.

Root independently verified all 706 recorded inputs, the log, both build artifacts and five exited process groups. See the [combined receipt](jd-review-integrated-6abf0e55-f71d-4e7f-9c69-99b15821bedb.json), [independent review](jd-review-independent-review.json), [completion record](jd-review-completion.json) and [source/evidence integration](jd-review-integration.json). Separate source review ACKs cover the frozen scoring and UI changes without claiming a second test execution. Worker details and original failed receipts are preserved in the [A10 handoff](backend-a10-declaration-diagnostics.md) and [U04 handoff](frontend-u04-requirements-history.md).

## Remaining scope

The history fix does not add server-side JD/canonical pair admission for authoring, preserve every selector across authoring navigation, invalidate every proposal on a JD-only change or make open tabs live. Those concrete gaps remain recorded in the [next JD audit](jd-next-source-audit.json). Clarification remains fact/canonical-bound until its JD-change semantics are explicitly agreed.

A09 still needs the reviewed stored relation producer/envelope, semantic replay identity, dual historical reader, owned writer, forward SQL and consumer contract. The existing nonpersistable relation DTO is not write authority. Do not flatten OR/bounds into independent keyword scoring or reinterpret old snapshots under current policies.

This batch used sealed fake configuration and mocked access/storage boundaries. It ran no native browser, database, SQL, provider, Docker, compiler, owner-file, publication or deployment operation. The closed export and U03 campaigns did not rerun. Pricing remains deferred, services remain free, and default-off configuration remains unchanged.
