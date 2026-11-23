# A12 caller and native contract review

Read-only source review, initially HOLD. No tests, SQL parsing, native execution, provider calls or services ran in this review. The six-file runtime freeze remains unchanged. Backend was already correcting the fresh-prepare path, terminal error settlement and actual SQLSTATE mapping; those are not new findings here.

Initial backend source identities:

- Contract: `4f3d4767e4492471a0ea033cd3c6afc01a8a7df663551f5491a84740eeb5dbf4`.
- Repository: `64842457398c1bd08e2e0fcbf71c195a00c7bdbf5f10bdf88f450f771e34b2b4`.
- Service: `96ec34f137d824bcb26d207c03b72abdab60ab5b3cbc9c594ea3c43f6173685b`.
- Native migration: `eae5fba6833dc77e2f217470e9ae4f22912b686c561d01491eb46ce9ea915138`; profile: `0511e2ac54b8d8ed6b8f20ee9e59a25cb48fd94e458f142e66fbf8db38c3694e`.

Three additional concrete paths were sent to the backend and coordinator:

1. **Known usage can be lost after a budget accounting error.** `canonical-rewrite-repository.ts:317–326` stores outer `known` only when the request resolves. A malformed provider completion can instead throw `QualitativeAiFailure` carrying known usage. `ai-budget-attempt.ts:183–187` extracts those counts, then awaits settlement; a failed settlement replaces that failure with `AiBudgetError`. The repository catch at `433–444` then sees neither known counts nor the original failure and sends null to technical settlement. Capture the safe observed counts before passing the failure to shared-budget accounting. The initial budget fake always succeeds and does not cover this composition.
2. **Definitive budget denial loses its intended mapping.** Repository `443–444` wraps `AiBudgetError`, so the service's explicit EXHAUSTED/BLOCKED-to-429 branch at `354–359` cannot receive reserve denial. In addition, claim `310–311` rejects a reserved, non-dispatching operation before the budget client can classify the accompanying denied envelope. Preserve closed budget errors without permitting provider execution.
3. **Unknown organization usage becomes zero.** Service `326–329` calls `Number(usage.data)`. A successful envelope with null data passes as zero; false, blank strings and negative integer totals also pass the check. This can admit new spend when the monthly total is unavailable or malformed. Require a known nonnegative safe counter in the actual RPC domain.

The saved-replay fake additionally sets `control.privacy=true` but applies that control only to the fresh read. Native prepare admits current owner/privacy before exact prior lookup. That test proves replay before a failing fresh read, not permission to replay after privacy withdrawal; preserve the distinction.

Otherwise the inspected seams align: prepare false plus fresh context, replay null context, winning claim only, decimal/null technical usage, native output projection identity distinct from input draft binding, and no writer activation. Actual native behavior and cross-session/accounting/privacy acceptance remain unverified. Final corrective checkpoint disposition follows below when released.

## Corrective checkpoint and independent service tests

Terminal source ACK on contract `4f3d4767`, repository `2e650806`, service `a1948aed` and transport `de536d70` (full hashes in `final-code-checkpoint.json`). The repository retains known failure usage before shared accounting can replace the failure, preserves closed budget errors, classifies actual SQLSTATE refusals, and records definitive terminal failures after initial known settlement. Ambiguous finish responses retain exact-replay recovery. The service rejects unknown/coerced/negative organization counters and distinguishes definitive budget denial from uncertain accounting. The replay test now describes a failing fresh-head read rather than privacy withdrawal. No additional concrete finding remains in this finite source pass.

Root transferred the previously absent `tests/unit/canonical-rewrite-service.test.ts`. It adds 28 finite cases around the actual form parser and actual handler, using the real owned fixture, A11 proof/workspace/reconstruction and fake native/provider boundaries. It does not mock the handler or repository under test. Cases cover exact two-field forms, escaped duplicate JSON/form fields, missing/extra/file fields, consent, fatal UTF8, both byte limits, stalled-read deadlines, cancellation and reader cleanup; nine malformed-counter cases, two legitimate numeric totals and five closed budget recovery outcomes. Every case has a global fetch trap; no real network was used.

The first attempt collected zero tests because two released A11 modules were absent. That setup failure is preserved separately. Root approved a missing-only static import sync: the 64-source closure had no existing mismatches; only the exact receipt-bound declaration and protocol modules were copied. Released A12 repository/transport/service and the explicitly approved config dependency were copied after checking and archiving predecessor hashes.

Before the service repair, the actual handler produced six genuine counter failures (200/saved versus expected denial) with three rejection controls passing. Four recovery-advice failures and one ambiguous-error control were also preserved. After repair, the full file returned 27 passes and one test setup failure: the cancellation test aborted before the reader was acquired. Its fixture now waits for an actual pending read with zero prefetch, preserving the intended assertion; the affected case passed. Thus evidence is 27 passing controls plus one corrected affected-case pass, not a claimed fresh 28-case full run. Root's combined gate will run all 28.

Scoped ESLint passed. TypeScript initially rejected the test helper's broad `Uint8Array<ArrayBufferLike>` body annotation; narrowing it to its actual `ArrayBuffer` fixture type fixed the error without a cast, suppression or runtime change. The scoped follow-up passed. Original failures and exact dependency pins remain in the runtime private A12 packet. The original six-file runtime release is byte-identical. Native SQL, concurrency, grant activation and live-provider acceptance remain open.
