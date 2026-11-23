# CR-U18: corrected and confirmed source links in exports

CR-U18 is **PARTIAL**. The scoped link-replacement repair and real synthetic PDF/DOCX output checks are **VERIFIED**. Native browser, managed storage/concurrency and full consumer acceptance remain open.

## Problem and result

A candidate could edit and confirm an email, then receive a 422 when opening the export preview. The current render plan correctly contained the new email, but the original PDF still contained the old mailto annotation. The preservation guard required that old target in the new plan and rejected the intended correction. A regression reproduced this through the existing owned preview with a real neutral PDF and the actual annotation guard before implementation.

The guard now permits that replacement only through the same owned immutable history. The current plan must exactly match the canonical document and its version/content, and the original source bytes must match its stored hash. The current email or link must have exact owner/value confirmation, cleared source citations and a matching fact ID, text and safe target in the plan. The replacement remains candidate-authored; it does not acquire a fabricated citation or calibrated truth label.

Every historical hop must preserve the owner, organization, resume, analysis, source, extraction-attempt context, retention policy and typed fact identity, with exact parent and adjacent revision links. Search stops at the nearest cited origin. A farther, convenient URL cannot override a nearer different cited value. The guard reads at most 64 ancestors, 2 MiB of lineage and 20,000 facts. Existing represented links do not trigger a history search.

Every unsafe or unexplained missing annotation still blocks export. Missing/gapped/foreign history, wrong confirmation or plan binding, unconfirmed facts and absent replacement targets also fail. Parent reads retain the existing ownership/source/privacy checks. Rendering retains its current-head check before work and owned head/content checks before returning bytes. No schema, renderer, route, dependency, score threshold or flag default changed.

## Verification

The integrated Node 22.23.4 check passed **45 tests in four files**, with zero failures or skips, followed by full typecheck, lint, web build and worker build:

| File                      | Cases passed |
| ------------------------- | -----------: |
| Source-link preservation  |           30 |
| Owned artifact repository |            8 |
| Render-plan contract      |            3 |
| Export/download routes    |            4 |

Two repository cases use the real source-PDF guard and real local renderer workers after the synthetic canonical edit/confirmation chain. Independent PDF text/annotation parsing and DOCX text/relationship parsing verify the corrected email and target, absence of the old target, exact current version/content, artifact hash and actual nonempty bytes. Only owned storage/version reads are mocked in those cases. The HTTP route unit cases use mocked artifact responses; they are not live downloads.

The [combined receipt](u18-integrated-2894205a-2f95-45b1-94b1-71eeb8067db9.json) records all five successful stages. Root independently rehashed all 704 inputs, the log and both build artifacts, and confirmed all five owned process groups were absent. See the [independent review](u18-independent-review.json) and [completion record](u18-integrated-completion.json). A separate source reviewer ACKed the frozen validator and repository without claiming a second test execution. All six original test declarations remain byte-identical.

## Preserved failures and limits

The [integration/evidence manifest](u18-integration.json) preserves the first real 422 regression and all backend receipts. The first affected run passed 34/35 cases: a newly added unsafe-email fixture incorrectly assumed mailto query parameters were forbidden by the existing policy. Changing that new vector to a forbidden control character preserved its denial assertion and left the policy unchanged. The corrected 35-case rerun completed before the coordinator's narrower-rerun instruction arrived. A scoped type narrowing error was repaired through the existing never-returning failure path without a cast or suppression. Later checks selected only the two real-format cases and the nearest-cited-origin safety case before this final integration gate. Detailed chronology is in the [backend handoff](backend-u18-source-links.md).

This batch used sealed fake configuration without dotenv or live credentials. It ran no database, provider, Docker, LaTeX compiler, owner-file, publication or deployment operation. Generic unchanged renderer/corruption suites, the closed U03 gates and the earlier 282-case campaign were not repeated or labelled newly passed.

Native keyboard/no-JavaScript correction-to-download journeys, managed ownership/RLS, concurrent edits, deletion, restore and cleanup still need their approved target. Actual viewer/screen-reader and representative/employer-ATS acceptance are separate. PDF parse-back and structural checks do not establish PDF/UA or employer compatibility. All new SQL remains unparsed, unapplied and unexecuted. Default-off policy and live configuration are unchanged by this batch. Pricing remains deferred and services remain free.

## Confirmation before check or download

CR-A04-S06 reproduced an unconfirmed correction that returned an actionable 422 in preview but raised an untyped error from the export check and download path. Those actions treated it as an unavailable service. The shared render-plan gate now maps expected review requirements to the same private 422. The routes give the candidate the number of facts to confirm and return no attachment. Unexpected errors retain the existing generic service response. A stale saved version still returns 409 before any source download or render.

On dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, all 245 tests in nine affected files passed. The failure regression used the real route handlers and repository plan check with simulated authentication and saved-version reads. Real PDF and DOCX render workers ran with synthetic source bytes and simulated Storage and version reads. Independent extraction found the confirmed replacement exactly once and found no old text or link target. Full type checking, lint and both builds passed. Lint reported four warnings in the JD clause-order review files.

No Supabase target was used in this run. Authenticated browser correction and download, managed Storage and the original CV04 consumer case remain open.

## Structured resume to export

CR-A04-S07 reproduced two gaps. The structured resume had no direct export link, even after confirmation. The preview ignored a requested version and attempted to load the new head's PDF. The workspace now offers export for the current confirmed version when the existing export flag is enabled. The link works with scoring disabled and survives a sign-in redirect. The preview checks the expected version before downloading the source. A changed head returns 409, and malformed or repeated version parameters return 422.

All 169 focused tests passed on dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. The original run used Node 26.5.0 because the Node 22 path pointed one directory too deep. All 169 passed again under the verified Node 22.23.4 binary. Component checks covered confirmed, unconfirmed and historical versions and the disabled export flag. Route and repository checks covered the pinned preview, refusals and sign-in return. Three adjacent storage tests initially spied on Node's global storage prototype. They passed with experimental Web Storage disabled, then passed under standard settings after the spies were attached to the browser simulation's session storage prototype. Their original assertions were retained.

Type checking, artifact source checks, lint and web and worker builds passed. Lint reported four JD clause-order warnings. The existing Playwright artifact case now follows the version-specific link by keyboard before checking PDF and DOCX. Discovery found both cases. Browser execution and the complete CV04 consumer case still need the approved Supabase target.
