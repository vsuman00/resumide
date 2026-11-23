# A10 duration comparison utility

2026-11-14. IMPLEMENTED / FOCUSED SYNTHETIC VERIFICATION. Runtime worktree, base `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus preserved dirty inputs. Exclusive files: `app/lib/server/requirement-duration.ts`, `tests/unit/requirement-duration.test.ts` and this handoff. Root owns integration and the combined gate. This slice changes no schema, storage, repository, source producer, flags, legacy engine or authoring admission.

## API and policy

`evaluateRequirementDuration(raw: unknown)` accepts exactly `subjectId`, up to 256 intervals `{subjectId,start,end}`, and `requirement` in the actual typed-JD duration shape. Every interval must match the selected subject. Full Gregorian dates use four-digit years 0001–9999; malformed, reversed, mixed-subject or over-limit inputs fail with a fixed error. The utility validates bound-kind consistency and integer years 0–100. It is internal arithmetic, not source, ownership or candidate-declaration authentication.

The result carries policy version/hash, selected subject, a three-valued comparison, reason, lower/upper elapsed-day bounds, endpoint-scenario union component counts, comparison basis and each calendar threshold. `scoringEligible` is always false. Missing intervals mean unknown, not observed zero tenure. Unsupported/unstated JD duration remains unknown.

The lower union interprets each `to` endpoint as exclusive; the upper union includes that date. Both unions merge overlaps, duplicates and touching half-open intervals before counting. Dates are calendar claims; this does not infer FTE, continuous practice or proficiency. No decimal years, average year length or floor-month credit is produced.

A continuous merged span uses its own calendar anniversary. February 29 targeting a non-leap year keeps February 28/March 1 alternatives. Disjoint or endpoint-ambiguous continuity uses conservative calendar bands: all 400 Gregorian start years, with January 1 and March 1 anchors, for every bound 0–100. For a fixed year pair, anniversary day differences change only across February's leap boundary; these two anchor classes cover the extrema, including both leap-day conventions. The table is included in the immutable policy hash. Work is bounded by 80,800 fixed table comparisons plus sorting/linear union of at most 256 intervals.

Inclusive/exclusive lower and upper comparisons require the result to hold across all duration/threshold alternatives. Range bounds combine with three-valued AND. `exactly` requires both inclusive boundaries; ordinary ambiguous `to` wording therefore remains unknown at the equality boundary. Below/above that equality can still be rejected decisively. This is a conservative versioned interpretation of cumulative calendar years, not empirical scoring calibration.

## Evidence

The test file was written first. A temporary initial API checkpoint then produced 31 behavioral failures and one pass. The complete implementation passed the same 32 cases in one file (37 ms test time, 206 ms total). Cases cover actual typed-JD builder input, Gregorian centuries/leap days, continuous anniversaries, every operator, both range endpoints, disjoint calendar bands, overlap/duplicate/touching union, endpoint uncertainty, absent evidence, strict input/bounds, determinism and no scoring authority.

One earlier launcher used a removed cached npm path and failed before Vitest; it is preserved and is not a behavioral RED. The corrected command used pinned Node 22.23.4 with installed npm 11.17.0, `npm test -- tests/unit/requirement-duration.test.ts`, sealed PATH and `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic`; dotenv loading stayed off. No HOME variable was repurposed.

Receipts: `/private/tmp/resumide-a10-duration-red.log` (launcher failure), `/private/tmp/resumide-a10-duration-red-v2.log` (31 failed/1 passed), and `/private/tmp/resumide-a10-duration-green.log` (32 passed). Scoped TypeScript passed: two roots, eight source files, zero diagnostics. Scoped ESLint, Prettier and diff whitespace checks passed. Formatting changed layout only after the green run; the unchanged tests were not repeated. Root will verify the integrated candidate.

Initial pre-review source SHA: `2e8f04019d8cdf68457749761a6182146dd45ca18a25462cc545d45aedca5038`. Test SHA: `0a4099209e8f13f65913b6654fea2e298da6b61324b7793d6ae04588e22be87c`.

Root's source review found one output-label defect: the two scenario component counts can be 2 and 1, so they are not minimum/maximum bounds. Final output uses `unionComponents.exclusiveEnd` and `inclusiveEnd`, preserving all calculations and values. Both existing assertions were updated; no new case was added. The existing gap case passed once after the correction (3 ms test time, 173 ms total; `-t` selected one case and left 31 unselected). Scoped types again passed two roots/eight sources/zero diagnostics and lint passed. The first affected invocation still had the old one-line assertion because the edit expected multiline formatting; that failed receipt is preserved at `/private/tmp/resumide-a10-duration-components.log`. Exact assertion correction and green are at `/private/tmp/resumide-a10-duration-components-v2.log`.

Final source SHA: `88dd928f469c6b1e3364352f14fb251efa3234158d00b85ecd02614339282d3e`. Final test SHA: `026a8dfdadc3ec5413fe21e033a13523aa6bffde82a91fc5173fa4a24389242b`. Root will run all 32 on the integrated candidate.

## Remaining integration

Only a future admitted semantic producer may supply related intervals. The helper does not turn header dates or caller claims into skill-use evidence. Typed coverage must preserve these unknown reasons, exact witness bindings and interval provenance. All authoritative ATS/alignment dimensions remain withheld. Reader review and semantic fixture review stay closed; semantic producer, typed coverage/consumer, separately bound authoring, native and release acceptance are not completed by this slice. No database, SQL parsing/execution, provider, native service, browser, Docker, actual configuration/key/owner data, dependency or Git operation ran.
