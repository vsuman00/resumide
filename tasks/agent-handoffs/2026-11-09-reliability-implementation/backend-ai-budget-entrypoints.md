# Shared attempt helper and qualitative budget entry point

2026-11-10. Source implementation and isolated synthetic tests only. Root synchronized 676 nonsecret inputs at main `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus preserved dirty work. Backend owns the five source/test files below and this handoff. Root owns configuration, shared plans, migration ordering and integration. Runtime owns the reserve-next SQL/Build leaf; frontend owns rewrite and the client-method tests. No database, provider, Docker, browser, real-document, credential, Git or deployment operation occurred. Services remain free; this admission is an internal technical budget.

## Released files

| File | SHA-256 |
| --- | --- |
| `app/lib/server/ai-budget.ts` | `497168d5bc6775b1092582e7f0e1775ee82f2eaa629b2968e2e35063eb62681a` |
| `app/lib/server/ai-budget-attempt.ts` | `46621f1a45613f9b2165cbaa8208b310693c87257e707cae2ac15d6eb1f872dd` |
| `app/lib/server/qualitative-stage.ts` | `d3cbf0d6d8702274a0a73fdfd73c7eca26c0986a6932c47cacfab2f2f080c7d5` |
| `tests/unit/qualitative-stage.test.ts` | `ed719f7492fa63ef17e0df41fd09cab341bf83c3dfd50eb4892951eef3f37335` |
| `tests/unit/qualitative-stage-outage.test.ts` | `365c0db017d24424a01683824c119707ae760ee5772ef3f116a4d408e6759652` |

Initial owned inputs were client `735db302…`, qualitative stage `d541c2aa…`, unit `2faf7d55…` and outage `76532ef4…`; the shared helper was absent. Existing assertions are preserved. Root separately implemented the proposed `AI_BUDGET_ENABLED=false` and empty `AI_BUDGET_POLICY_VERSION` defaults, schema validation and analysis-config fields. Real environment values and policy/opening seeds remain unchanged.

## Shared contract and recovery

`AiBudgetNextBinding` omits only the caller-selected ordinal. `reserveNext` sends the other nine request fields to `ai_budget_reserve_next` with the existing owner/organization arguments, validates the returned ordinal 1–3 and existing strict receipt, and never grants dispatch itself. Existing six methods, operation hash and receipt shape remain unchanged. SQL authoritatively chooses an existing attempt's ordinal or the next bounded logical ordinal; client fakes do not prove that transaction.

`runBudgetedAiAttempt` reserves, claims once, executes at most once and settles known usage before returning product output. The callback records safe usage before later validation can fail; known own-data error metadata is also retained. Null cannot erase known counts, and conflicting observations produce an unknown hold rather than an invented value. Accounting failures fail closed. A provider failure is preserved after successful settlement/unknown marking. An uncertain claim is never refunded, and no automatic retry is introduced.

Root found a recovery omission in the first helper freeze `07f92723…`: rejecting every reservation replay prevented the first dispatch after a reserve-before-claim crash. The bounded regression failed with `AI_BUDGET_STATE` before repair. A replay still in `reserved` may now compete through the existing first-claim CAS; prior dispatched/held/settled/released replays do not call the provider. A claim loser never settles, marks or releases the winner. A preclaim abort/callback failure releases only a fresh reservation, never a replay-owned hold. The original failure remains recorded in the tool result; no database execution or SQL concurrency proof is implied.

The first helper also had two TypeScript closure-narrowing diagnostics reported by the frontend. An explicitly typed mutable usage cell fixes them without suppression. The final helper/client were released before the qualitative leaf so both endpoint agents could test the same bytes.

Technical operation IDs use owner, organization, surface and accepted request nonce, excluding payload. Attempt IDs use operation and an attempt nonce. Fixed UTF8 length-prefixed SHA256 frames produce canonical custom UUIDv8 values; no UUIDv5 claim or normalization is made. Server reservations count serialized system/user/schema UTF8 bytes plus 1,024 tokens of conservative framing, with explicit output allowance. This is a documented source policy awaiting model/managed admission, not a measured tokenizer guarantee or new monthly limit. Build's separately allocated 24,232 input/768 output remains 25,000 total.

## Qualitative integration

The default-off branch retains the old token lookup, idempotency key and partial-result behavior. The enabled branch selects the analysis owner, retains evidence withholding, requires current owner/organization consent for the existing `candidate-ai-v1` policy and rejects an empty budget policy before dispatch. It does not fall back to the legacy pool after a ledger failure.

The operation ID is the analysis ID. A deterministic attempt UUID uses that operation and the durable job attempt counter; SQL supplies the logical ordinal. The payload hash binds the prepared system/user/source/schema representation, model, prompt and budget-policy versions. The provider idempotency key is the admitted attempt UUID. The observation wrapper captures known transport usage before grounding, and settlement completes before qualitative persistence. A later persistence failure cannot release or undo its charge.

Retry decisions compare the admitted logical ordinal with the lower of the captured ledger cap and configured qualitative cap. They do not confuse a global job retry count with the logical provider ordinal. Known invalid output settles before the deterministic partial result; unknown failures retain a hold before partial persistence. Numeric scoring and uncalibrated-evidence withholding remain unchanged. These reads do not supply the later atomic deletion/lease/revocation fences; R09/R10 and activation remain open.

## Actual checks and limits

The first enabled-ledger regression ran against unchanged qualitative source `d541c2aa…`: one failed/three passed. It resolved the old partial `false` instead of enforcing the denied shared ledger. A separate reserved-recovery regression produced one failed/one passed before the minimal helper correction. Neither assertion was weakened.

The focused two-file command passed **18/18** after implementation. Only the eight affected outage tests were repeated after the final callback-state typing adjustment; **8/8** passed on the final qualitative source. The ten helper/partial tests and shared helper bytes were unchanged. Commands use Node22, `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic`, `AI_ENABLED=false`, a fake API key and Vitest's disabled dotenv mode. No real transport is constructed by these injected-provider tests.

Scoped ESLint passes. Project-options no-emit TypeScript over the five owned source/test roots and two existing ambient roots reports zero diagnostics across 521 files/seven roots. An owned test layout warning was corrected with Prettier; no behavior/assertion change was needed. Root owns final integrated formatting/types/lint/builds. Frontend separately reports 52/52 against the same helper/client for its client/rewrite packet; those are peer results, not an additional backend run.

RPC fakes prove ordering, bindings, no-provider denial and local orchestration. They do not prove PostgreSQL syntax, privileges, real concurrency, hosted state, first-policy/opening admission, legacy-writer coexistence or privacy retention/deletion. No SQL was applied, no flag or caller was activated in a deployed service, and no R03/R04 release gate is claimed closed by this packet.

## Definitive resource denial follow-up

Root's independent review found a consumer regression in qualitative source `28f1cc62ff512cc5b3f73230a197397c879dbc66584b28d0212d7e8721810d5b`: definitive `AI_BUDGET_EXHAUSTED` and `AI_BUDGET_BLOCKED` escaped as raw budget failures instead of persisting the deterministic partial feedback used by the previous exhausted-budget path. A single two-code parameterized test against that source failed both selected cases. The other eight outage cases were outside that filtered red run, not disabled or changed. The prior outage release was `15f5d1104de0f52d3ecff12d02fe25e7fb81eb431c6ece88d1556b4b33934a5a`; both failed expectations remain unchanged.

The minimal catch normalization maps only those two definitive resource codes to nonretryable `QualitativeAiFailure("AI_BUDGET_EXHAUSTED")`. The existing partial branch then persists unchanged deterministic semantics once, with zero provider calls and no legacy-pool lookup. Unavailable, conflict, state, denied and disabled errors, including missing consent/policy, retain their prior failure behavior. The shared helper/client and the ten helper/partial tests are byte-identical to their earlier releases.

Only the affected outage file was run after correction: **10/10 pass**. This does not claim a new full 20-case run; the earlier ten helper/partial tests remain their unchanged evidence. Scoped lint/format pass, and the two changed roots plus existing ambient roots typecheck with zero diagnostics across 520 files/four roots. No peer suite or external operation was repeated. Worker lease, stale-write and atomic revocation/deletion fencing remain R08–R10 work; this compatibility repair supplies no activation or production guarantee.
