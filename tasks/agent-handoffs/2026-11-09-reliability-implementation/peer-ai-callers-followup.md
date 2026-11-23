# AI caller fixture followup peer review

2026-11-15. **SOURCE ACK for the three allocated fixture successors; no scoped finding remains.** Product files were read only. This handoff is the reviewer's only new workspace write; the prior frozen [peer review](peer-ai-callers.md) is unchanged. No peer tests, compiler, SQL parser/execution, database, provider, services, actual environment or Git operation ran.

The [allocation](ai-callers-runtime-followup-allocation.json) binds the three preimages below to contract SHA `97c5fac13e0b7503de9e89e8fbd5aeb358bd4685f01ad8e64d14eb97af0c0e6e`. Root's [preserved failure summary](ai-callers-bulk-failure-summary.json) records 11 failures in these files, 5,561 passing cases, 274 files and 926 stable inputs. This failed receipt is retained, not replaced by a fresh whole-suite claim.

## Reviewed changes

- `canonical-rewrite-service.test.ts` imports the actual source profile, supplies exact v2 readiness, and routes the intended denial through `ai_budget_reserve_source_next`. It checks the real synthetic owner/org/analysis/version/client-operation/binding tuple and derived technical ID. Original 429/503 status, recovery, no-provider and no-owned-claim assertions remain.
- `initial-feedback-stage.test.ts` supplies current source metadata and verifies the prepared operation/version/attempt/lease source tuple. Events still record the actual RPC name. The positive legacy reserve expectation is genuinely replaced by the source RPC plus generic-reserve absence; no legacy event label is fabricated. SDK-once, both accounting paths, no release, policy refusal and cancellation assertions remain. One added positive worker case explicitly requires one source reserve and zero generic reserves.
- `qualitative-stage-outage.test.ts` adds the actual selected version field and current source metadata, with exact owner/org/analysis/version assertions. Definitive denial still persists the same deterministic partial result. The full expected call sequence now includes readiness and source reserve. Settle-before-product-persistence, retained charge after persistence failure, known-versus-unknown accounting, no release, provider idempotency key, admitted ordinal/cap and consent/policy assertions remain. Generic reserve-next explicitly throws instead of receiving a permissive ledger reply.

All three fixtures import `AI_BUDGET_SOURCE_PROFILE`; they add no private profile-module mock or production fallback. The changes preserve the original behavioral assertions while supplying the newly required source protocol.

## Exact inputs

Preimages were independently read from Root and matched the allocation. Final files are in the runtime worktree and matched the author's frozen hashes before and after review.

| File | Preimage SHA256 | Final SHA256 |
| --- | --- | --- |
| `tests/unit/canonical-rewrite-service.test.ts` | `c80a253d64c70e35c0167505407fb2960eeec4ceb76e19180505fb4cd789c90a` | `7901a34b4b00c91c7a9dcf7e4ffe839b226dd69963566fd90a22d1cbc5c20737` |
| `tests/unit/initial-feedback-stage.test.ts` | `60caebe51a116b812f5ff058f3cedeb315a4c177e4189a908fcd80eeedf5e437` | `771e60121cc9566891babcc3f4d8bc924f14e2c0beb8ceb66714cd2b8c64244c` |
| `tests/unit/qualitative-stage-outage.test.ts` | `365c0db017d24424a01683824c119707ae760ee5772ef3f116a4d408e6759652` | `3f0069fcf472d603a35402262acf66c1ac9e19ac1702ac9e5849685b69c75da2` |

Rehashed the six frozen runtime product files: they retain the exact hashes in the prior peer review. Root Native remains `ef1fa5e4ade5b8cf4b2fe8860d4446839e6e60155e5a55a75215533dda2d541b`. These are fixture-only successors.

The author reports reproducing 11 failures plus 52 passes before the change, then 64 passes across the three files: all 63 original cases plus the added generic-absence case. Author logs/receipts are under `/tmp/resumide-ai-callers-followup-jQRfH3` and `/tmp/resumide-ai-callers-followup-yNhE2r`. Their release packet, `/tmp/resumide-ai-callers-followup-release.json`, SHA `0ceda572587797d98296370af286f4dfee0025764e57f22c39d971dee6e55dfa`, preserves the failed and formatted-input receipts. Root owns reconciliation and integrated checks. The peer did not execute those tests or certify Native behavior.

Root plans to carry the 271 unchanged passing files from the preserved failed receipt, combine fresh affected-file and neutral-process checks, then run statics/builds. That is combined evidence, not a fresh whole-suite run. Budget-off admission, original-month quota preservation, full privacy/expiry, Native acceptance and release remain open as recorded in the prior peer review.
