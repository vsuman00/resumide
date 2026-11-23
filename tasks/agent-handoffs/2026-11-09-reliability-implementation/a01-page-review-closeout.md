# A01 page review local gate

The page-review implementation is integrated on main `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus preserved dirty work. CR-A01 and CR-A01-S02 remain **PARTIAL** for full acceptance. The local source, unit, DOM/SSR, mocked-storage, type, lint and build checks pass. Actual extraction quality, native browser/worker behavior and release acceptance remain open.

## What changed

One browser-safe scanner now provides bounded text observations for both review paths. It identifies missing or short text, replacement symbols, invalid character sequences, unexpected controls and exact repeated extracted text. It returns metadata only and leaves reliability and accuracy unassessed. It validates actual dense, sequential page metadata within the existing 20-page and 500,000-unit bounds before scanning; missing or unsupported metadata returns an explicit unavailable state.

The owned evidence read model derives native observations only after stored-attempt replay and ownership validation. Its page display distinguishes native text presence, recorded OCR evidence, recorded OCR failures and existing extraction blockers. Technical counts and the eight-unit availability rule are in an optional disclosure. Empty reason lists do not establish completeness or accuracy.

Legacy Parse View now calls count-derived bands text availability. A separate saved-text panel shows the same character and repetition observations while making original page boundaries and native/OCR provenance explicitly unverified. It uses the original supplied metadata, never the component's fabricated fallback pages. Stored warning strings, source text, offsets, parser output, result checksum, numerical fields and historical records remain unchanged.

Independent review found an inherited allocation failure: the durable schema accepts an empty saved-page array with a page count of `2**32`. The scanner correctly returned unavailable, but the component then attempted an invalid array length before showing that notice. The accepted fix permits the original placeholder count only when the shared scanner has validated the count and reported missing page data; other unsupported metadata uses one display-only placeholder. It neither invents diagnostic input nor duplicates the bounds policy.

## Reproduction and review

The backend reproduced two missing native-diagnostic results through the real owned read model using validated synthetic stored evidence and mocked storage. The legacy DOM tests reproduced missing warnings using actual `parseSim` adverse outputs. Evidence-screen SSR tests reproduced missing page and attempt-limit information. The oversized fallback regression was accepted by the real `ParseViewSchema` and reproduced the actual invalid-array-length error before repair.

The reviewer independently checked the shared scanner, native adapter, both displays, input bounds, private guards, source preservation and frozen producer hashes. Required findings were resolved within the assigned files. The canonical test fixture follow-up adds the real diagnostic helper output; no production type was weakened and no assertion or guard was removed. Verification setup failures, including an initially misclassified OCR fixture and temporary type-root/preservation checks, are retained separately in the worker handoffs. They are not counted as application defects or passing proof.

## Integrated verification

The [initial gate](a01-s02-integrated-32eadecd-ee67-45d2-b014-e87a5b07d826.json) passed 182 tests across seven files. Full type checking then found one older canonical-correction fixture missing the newly required read-model field. Lint and builds were not reached in that first attempt. The failed receipt remains intact.

A fixture-only repair preserved all 218 application source hashes. The [follow-up gate](a01-s02-checks-followup-904c5932-73b9-4fd8-b6a1-15b8c11ebf81.json) passed 82 canonical-correction cases, full type checking, lint, web build and worker build. The unchanged 182 cases were retained by exact source comparison. This is 264 distinct cases across two receipts, not a fresh 264-case suite run or a full CI claim.

| Scope                              | Cases passed |
| ---------------------------------- | -----------: |
| Native/shared page diagnostics     |           60 |
| Owned evidence review              |           49 |
| Evidence route and SSR display     |           19 |
| Legacy component interaction       |           19 |
| Extraction router                  |           22 |
| Document extraction                |           11 |
| Legacy parse pages                 |            2 |
| Canonical fixture follow-up        |           82 |
| **Distinct cases across receipts** |      **264** |

The [Root verification](a01-s02-integrated-review.json) rehashed 720 final inputs, both logs, both artifacts and seven absent owned process groups. Only the named test fixture differs from the initial behavioral input set. The five producer/source contracts named in the display extension remain byte-identical. No skip, threshold reduction, suppression, timeout or source drift supplied a passing gate.

Source adoption records: [native backend](a01-s02-backend-integration.json), [availability UI](a01-s02-legacy-ui-integration.json), [evidence UI](a01-s02-evidence-ui-integration.json), [shared scanner](a01-s02-shared-core-integration.json), [saved display](a01-s02-saved-ui-integration.json) and [canonical fixture](a01-s02-domain-fixture-integration.json). Detailed worker reports and original failures are retained under this run folder and `a01-s02-evidence/`.

## Remaining scope and next action

These deterministic warnings are review observations, not calibrated transcription quality or a guarantee that a PDF is safe or complete. Known extraction availability is distinct from reliable evidence and score admission. Full A1 still requires source-bound actual native/scanned/mixed adverse inputs, worker lifecycle and failure-state checks, the unchanged extraction benchmark gates, representative quality evidence and actual consumer acceptance. The OCR image remains unverified under the current socket limitation; no engine retry or new image was attempted. Existing native SQL/storage/restore/browser and broader release requirements remain open.

No database, provider, real environment, owner document, Docker, Git mutation or deployment operation ran. Services remain free; pricing and deployment remain stopped. Full `npm run verify:ci` was not run because its browser/database/restore and broader runtime stages exceed the current source-only allocation.

The [canonical completion record](a01-s02-completion.json) preserves all 64 task IDs and dependencies. Counts remain 2 VERIFIED, 34 PARTIAL and 28 PLANNED. The next source audit is CR-A02-S02: distinguish target-aware entity grouping and import behavior already implemented by A02/A04 from the actual remaining multiplicity/association gap. No new implementation is allocated until that gap and its storage/producer boundary are identified. The full goal remains active and incomplete.
