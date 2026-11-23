# Contact parser whitespace repair

Status: VERIFIED_LOCAL for CR-A01-I01 at the source/synthetic/fake-transport tier. Parent CR-A01 and the full reliability goal remain PARTIAL/incomplete. Tested dirty main base HEAD: `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. No feature activation, publication or deployment occurred.

## Cause and repair

The exact synthetic preparation timeout reproduced under the original five second threshold. One synchronous `parseContact` call consumed 7,683.73 ms inside the initial native-evidence builder; later reconciliation, import, confirmation, JD, relationship and owned-score stages were much shorter. This localizes the observed delay before asynchronous transport.

The location parser split raw lines with an unanchored whitespace prefix before required separator characters. A long whitespace run without a separator made that search repeatedly retry. The repair changes exactly one production expression: split on the existing three literal separators, then retain the existing label removal and trimming. Line order, the first 15 raw lines, candidate length checks, raw source text/offsets and all other parser logic remain unchanged. There is no new input cap or normalization.

## Controlled comparison

The staged test and all its assertions were byte-identical before and after. The source maps differ only in the contact splitter. Both probes used the same pinned Node runtime and isolation; their timings are local observations, not a production latency guarantee.

| Same synthetic preparation probe | Before, ms | After, ms |
| --- | ---: | ---: |
| Normal source | 87.50 | 88.39 |
| Long source in bounded whitespace lines | 106.22 | 95.99 |
| Original single long whitespace line | 7,790.73 | 99.16 |

The contact leaf maximum fell from 7,683.73 ms to 0.80 ms; its parent native-builder interval fell from 7,684.95 ms to 1.44 ms. These nested durations overlap and must not be added. The [failed original profile](whitespace-backend-evidence/stage-profile.json) and [passing identical profile](whitespace-backend-evidence/stage-profile-after.json), logs and test snapshots are preserved. Original failures were not relabelled as passes.

## Regression and integrated checks

The final test removes temporary spies/logging and retains all three original preparation variants, their five expectations and the original five second threshold. A separate 90,000-space case stays below the default character ceiling and retains its valid preview. Contact controls cover all three separators, labels/case, Unicode boundary whitespace, repeated/empty fragments, a valid location after a long prefix, interior whitespace semantics and the first 15 raw lines. All original contact tests remain a byte-identical prefix.

The [Root reconciliation](whitespace-integrated-review.json) records one fresh passing affected gate: 235 cases across 15 files, then full TypeScript, lint, web build and worker build. This is not a full application suite. The [preservation proof](whitespace-preservation.json) verifies the exact production substitution and original assertions/thresholds. Root binds 976 final gate inputs, 960 raw source inputs and three allocated files; 957 preceding unallocated raw inputs are unchanged. Six Root command groups are independently absent. Session 16556 closed with exit 0.

Backend author evidence also records 24 scoped cases and three-file lint/format. Both source reviewers inspected the cause, equivalence and limits without running duplicate campaigns. The original timeout and a formatter failure remain in the archived packet. Root's current gate supplies the integrated passing evidence.

## Limits and remaining work

The original source contains 100,001 spaces plus other text, exceeding the default PDF ingress ceiling of 100,000 characters. The retained native/domain schema permits that source; this is an intrinsic parser/native-builder reproduction, not a reproduced exploit through default PDF upload. The separate smaller control exercises the native/domain chain below that ceiling; no actual PDF was uploaded in this slice. Actual deployed behavior, full ingress/resource coverage and general latency claims remain unverified.

CR-A01-I01 is locally resolved. Broader extraction/OCR, representative validity and parent-task acceptance remain open. Next, complete the additive JD clause-order command/codec/receipt/readiness and independent Native reconstruction with atomic candidate accept/reject/undo/exact retries. Preserve existing protocol bytes, replay, IR, ownership/consent/CAS and default-off flags. No Node preview ID supplies save authority. Other reliability tasks, privacy adoption, actual consumer and release gates remain open. Services remain free; deployment stays HOLD.
