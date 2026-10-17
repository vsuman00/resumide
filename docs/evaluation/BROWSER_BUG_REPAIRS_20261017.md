# Browser audit repairs - 17 October 2026

Status: IMPLEMENTED locally; verification receipts below. Formal accuracy and release gates remain open.

This repair pass follows [the browser audit](BROWSER_FEATURE_AUDIT_20261016.md) and [the source/scoring audit](UI_SCORING_AUDIT_20261016.md). Existing work was preserved. No credentials, private resume text or full job description are included here. No commit, push, hosted migration or deployment was performed.

## Repair coverage

| Finding | Result | Changed behavior |
| --- | --- | --- |
| B01 requirement selection and uncertainty | IMPLEMENTED; synthetic regressions pass | Technical requirements take priority over generic terms; company sections are excluded; negated mentions cannot count as positive evidence. Uncertain occurrences are separate from found counts and cannot earn legacy keyword credit. The meter says Legacy baseline, and the repair list no longer claims an unmeasured impact ranking. |
| B02 JD save fails | VERIFIED locally | Forward SQL validator accepts historical parser versions and the corrected `jd-parser/1.0.2`; save/read-back and immutable-history checks pass. |
| B03 experience imported as skills | VERIFIED in regression and owner-PDF smoke | Canonical import uses shared heading aliases. Delimited employment headers propose separately cited role, employer and dates. Achievement lines are not guessed as employers. Every imported fact remains unconfirmed. |
| B04 authoring draft changes target | IMPLEMENTED with component and browser regressions | Selection and clarification forms follow the selected contribution. Controlled draft/confirmation fields reset on focus changes and cached-page restoration. Failed submitted answers remain attached to their original target. |
| B05 export loses links and duplicates contact data | PARTIAL; silent loss now blocked | Exact shared contact slices avoid duplicate email/phone content. Before preview or download, the original immutable PDF is checked for annotation targets missing from the canonical plan. Missing targets block verification with an explanation and an original-PDF link. Complete annotation import and source-template pagination remain unfinished. |
| B06 privacy attachment opens empty route | IMPLEMENTED with native-download browser regression | Attachment link uses document navigation rather than SPA navigation. |
| B07 original PDF link expires | IMPLEMENTED with route regressions | A stable same-origin source route checks current ownership, active source, membership and deletion state on every open. It serves private PDF bytes with no-store headers and rechecks access after reading; no expiring storage URL remains in the result page. |
| B08 unavailable feedback counted as repairs | IMPLEMENTED with regressions | Partial results show one availability notice. Unavailable categories and uncited compatibility padding are excluded from counts and repairs; no unsupported retry promise is shown. Historical envelopes remain readable. |
| B09 invented result illustration statistics | IMPLEMENTED with component regression | The result illustration contains Source and Evidence labels, without fabricated scores, strength counts or repair counts. |
| B10 mobile Privacy and Sign out missing | IMPLEMENTED with mobile regression | Private mobile navigation exposes Privacy and a current-session Sign out action. |
| B11 terminal progress looks active | IMPLEMENTED with component regressions | Partial results show saved output and unavailable feedback; cancelled/rejected/failed states use terminal copy. Evidence review is distinct from pending scoring. |
| B12 development hook crash | MITIGATED; original cause not established | Lazy-route dependencies are explicitly prebundled alongside React deduplication to avoid replacing the dependency graph on first upload navigation. A cold-development browser reproduction remains required before calling the original crash resolved. |
| B13 privacy hydration failures | VERIFIED in timezone/reload browser regression | Privacy, Account, history and progress timestamps use an explicit locale and UTC. Account reproduced React 418 with a different browser timezone before this repair. The privacy loader no longer serializes the export manifest. Private caching and auth-cookie handling are explicit. The original privacy console incident is not attributed to a proven single cause. |
| B14 blocked export recovery | IMPLEMENTED with regressions | Recovery leads directly to structured fact review and the original PDF. The validation message includes the exact unconfirmed fact count. |

Additional source-audit repairs cover clause-local negation/importance, multiple experience durations per line, required-skills headings after benefits, all experience sections in legacy date/bullet checks, degree-subject specificity, unsupported skill-specific tenure, certification punctuation and honest upload-stop wording. See [JD/matching repair notes](JD_MATCHING_REPAIR_20261017.md).

The response-header gap is also repaired in the application: root framework middleware applies the existing security policy across deployment adapters, rather than relying on the standalone Express server or discarded loader headers. A direct Vite response returned CSP, X-Frame-Options and X-Content-Type-Options, and middleware tests preserve private headers and cookies. Production Vercel enforcement requires a later deployment check. React Router documents the response-header boundary in its [HTTP headers guide](https://reactrouter.com/how-to/headers).

## Source and version integrity

New behavior records `ats-rules-v3`, `jd-parser/1.0.2`, `canonical-engine/1.0.1`, `score-v2/1.0.1` and template/renderer `1.0.2`. Historical producers remain accepted and saved records are not reprocessed.

Two forward migrations widen only the relevant private shape validators:

- `20261017000000_job_requirement_parser_compatibility.sql`
- `20261017010000_canonical_producer_compatibility.sql`

They were applied only to the isolated audit database on port 57321. Apply them with the reviewed deployment procedure before deploying these producer versions. Preserve the widened validators if rolling back the application; narrowing them would invalidate stored newer documents. Existing migration history must not be edited or reset.

The owner's PDF was tested in memory for import and source-link completeness without creating confirmations or retaining extracted text. Experience is recovered, imported skills change from 19 to 6, employer candidates from 0 to 1, with two role and three date candidates. These counts do not establish complete field accuracy. The PDF correctly triggers the source-link completeness blocker; a faithful replacement export is not claimed.

## Verification receipts

Verification is local and uses an isolated Supabase stack. Runtime test credentials stay in an ignored temporary environment file. External AI calls are disabled. Synthetic fixture setup is not represented as a normal candidate upload or background-worker journey.

- Full unit/integration/component suite: 110 files, 737 tests passed before the final sequential CI run.
- JD runtime verification: 39 assertions, including save/read-back, concurrent winner, provenance and ownership checks.
- Canonical runtime verification: 68 assertions, one concurrent winner, zero AI calls.
- Artifact runtime verification: 23 checks across PDF/DOCX and A4/Letter, using actual synthetic PDF bytes with matching storage metadata and cleanup.
- Seven rebuilt-browser journeys passed for JD history, authoring, canonical history/restore, withheld-score diagnostics and checked exports, including JavaScript-disabled paths.
- All 30 focused browser checks passed after the repairs, including privacy reload across timezones, an ordinary attachment download, mobile Privacy/sign-out, contribution switching/back navigation, honest upload-stop behavior and configured security-header mode.
- Typecheck, lint, formatting and production compilation passed separately. Phase 5 synthetic parser/matcher thresholds passed without deterministic variance.

Final sequential `npm run verify:ci`: PASSED with the isolated local environment and test-appropriate NODE_ENV. The final run passed 110 test files / 737 tests and all 56 browser tests, plus formatting, lint, typecheck, production build, signatures, secret/container/alert checks, synthetic load/restore/benchmark checks and dependency audit (zero vulnerabilities). Browser coverage includes accessibility, no-JavaScript authoring/export, privacy, mobile navigation, hydration, scoring guards and source/version isolation. These remain engineering receipts, not formal release acceptance.

An earlier CI attempt overlapped a browser run and rebuilt its static assets, causing missing-asset failures. A later attempt incorrectly inherited production NODE_ENV into component tests, where React act is unavailable. Both verification setup errors were corrected; they are not reported as product fixes or passing runs.

The isolated test services were stopped after verification, their temporary environment file removed and database volumes retained. The original development and production credential files were not changed.

## Git publication authorization

After this verification, the owner instructed "do it commit". Publication includes the repairs and their required, previously uncommitted evidence/workspace modules, migrations, tests and documentation. Local editor settings and separate deployment work remain outside the commit. This authorization does not apply hosted migrations or validate a production release.

## Remaining limits

The legacy binary keyword rule and hand-authored weights remain a heuristic. Their calibration was not changed. New matching regressions do not establish that a numeric score measures hiring fit. Authoritative v2 ATS Compatibility, Required Alignment and Preferred Alignment remain null, and Application Readiness remains unavailable under the documented gates.

Complete source hyperlink import and source-template layout preservation require further canonical/evidence work. The source-link blocker prevents silent loss but means the owner's current resume must use its original PDF. Approved-viewer pagination, assistive-technology acceptance, representative accuracy, domain validation, live-provider feedback and production deployment remain unverified. B12 remains an investigation item after the dependency-loading mitigation.
