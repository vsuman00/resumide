# AI source registration peer review

2026-11-15. **SOURCE ACK for the bounded legacy rewrite leaf; activation, Native acceptance and full expiry remain open.** Supplied base HEAD: `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, with synchronized dirty source. Product files were read only. This handoff is the reviewer's only workspace write. No tests, compiler, SQL parser/execution, database, provider, service, environment or Git operation ran.

The frozen [contract](ai-source-registration-contract.json) SHA is `89a05512f91c70dd5fadf37bc1210c3e4f0e7206576ee6a04ee5e3728904a59c`; [wire](ai-source-registration-wire.json) SHA `051dbddc2f1e657bd2b8c21ed2a322d35304e5a69e1bc2b96ad9b5f49adb8f38`; [consumer supplement](ai-source-registration-consumer-supplement.json) SHA `ebcdbed519e78d2c18e28d0039f2a05c99fa771717dc5dd8366b32ba27a93bec`. The [independent codec vectors](ai-source-registration-codec-vectors.json), SHA `e13ae405d898c56fb43ed806a6d18e719a9fd1c5596d949f196edba46061065e`, are byte-framing evidence, not Native execution.

## Reviewed behavior

- Native `private.ai_budget_source_operation_id` and Node `createSourceBoundAiBudgetOperationId` use the same `AIBUDGET-OP2\n` header, six ordered atoms, UTF8 byte lengths, SHA256 prefix and UUID byte masks. Nonce bytes remain exact. OP1 implementation and existing accounting bindings are unchanged. The rewrite caller supplies analysis/version from its owned database row and preserves `http-post/1`.
- `public.ai_budget_reserve_source_next(uuid,uuid,jsonb,jsonb)` validates the exact source object and recomputes OP2. Any retained matching OP1 blocks OP2, without a state filter, including settled and unknown work. The check repeats after source locks. It neither guesses an old root nor retries through OP1/generic reservation.
- Source registration and first reservation share a subtransaction. An old reserve denial or malformed success raises `P0S01`, rolling back the new registration before returning a fixed denial. Operation INSERT, attempt INSERT and reserved-to-dispatched UPDATE triggers require the registered full binding and current source. Durable owner admission precedes exact active-root SHARE locking, followed by exact analysis/version and ownership/membership checks. Existing generic RPCs cannot insert unregistered work or dispatch an unregistered reserved attempt.
- A committed reserve followed by root retirement loses fresh claim admission. An already dispatched attempt retains the original R03 settlement, unknown hold, reconciliation, release restrictions and original period. The generic transition bodies and policy bytes are unchanged; source admission is not added to late accounting.
- Registered OP2 selectors take precedence over historical inference in `private.capture_owned_ai_operation_dispositions`. Root selection is exact, includes reserved operations, and runs before parent deletion. Capture preserves an existing disposition or the original first retention-item/account minimum. `registered_at` never starts or extends the deadline. Missing historical parent/clock evidence remains unresolved.
- Native source export reads the entire owner set across organizations, independent of current membership and flags. It validates ledger binding and retained source/disposition proof, refusing more than 4,096 rows or 32 MiB. Node checks strict owner/schema/rows, recomputes OP2 and rejects duplicate selectors. The privacy worker unconditionally obtains the twelfth collection, `aiBudgetSourceRegistrations`, preserves all eleven old collections, and requires matching ledger operation/owner/org/full binding. Multiple RPCs are not an atomic snapshot; inconsistent closure refuses publication.
- Readiness has the frozen nine fields and separate reserve/export capabilities. Node clones validated scope/profile inputs and uses one maximum five-second elapsed-clock/abort deadline for metadata and its dependent source RPC. No REST or generic reservation fallback exists. The Native checker seals four relation schemas, including its seal's own schema, checks the sole closed seal trigger, and verifies function metadata/ACLs. New data RPCs remain denied; only metadata receives service EXECUTE.

## Exact source evidence

Backend paths are in the backend worktree; runtime paths are in the runtime worktree. Final product hashes were identical before and after review.

| Path | SHA256 |
| --- | --- |
| `supabase/migrations/20261115154855_ai_budget_source_registration.sql` | `984d4e7a7f2cd9526bb95e22beb166cb3813f0bd85c4c4db99b5082cc5ba981c` |
| `app/lib/server/ai-budget-source-profile.ts` | `4e58ed683ad52e954e82af1448a05728ba9bc23d93291668697c51444852c213` |
| `app/lib/server/owned-ai-disposition-profile.ts` | `2bf28431b1ab7da5659b5f861ca2f844754b8734c5209c8e093f6583386c121b` |
| `app/lib/server/ai-budget-source.ts` | `aff9acc366d7cdd204b001f6b9634e9eef54fddfa437fd27cc92261129c34376` |
| `app/lib/server/ai-budget-source-export.ts` | `4a70d107151a72d01820ebea6e6faacea95ca2a39bf17a583e92f2b49dbbf8f9` |
| `app/lib/server/privacy-worker.ts` | `997014ae6f08e7ca75dccc236b08c7c6f05acf58b439b3b9aeebe3b19aa7a3d4` |
| `app/lib/server/rewrite-service.ts` | `4086f82ef3e8e3767430845182d57452465ad4d2badf247b5882f5630e6b75eb` |

Independent textual digest composition covered direct function bodies and historical JSON substring/whole-body replacements: all 36 checker pins match terminal source, all three forward-patch pre/post digests match, and all four source profile pins match actual bodies. The disposition profile matches its changed checker/export bodies. This is source-text hashing, not SQL parsing or catalog acceptance. An initial extraction omitted digit-bearing function names and R19 substring patches; correcting the extraction resolved those diagnostic mismatches without changing product source.

Read the new codec/client/export tests and affected rewrite/privacy consumer assertions without executing them. They cover explicit synthetic authority, strict receipt decoding, source distinctions, denial, cancellation, replay, bounded export and registration-to-ledger closure. Fake RPCs cannot prove Native locks or source retirement. Author test results belong to their own packets and Root's integrated gate.

## Findings and remaining gates

One concrete runtime draft finding was resolved: four Promise results were unpacked from three calls, leaving registrations undefined. Final `privacy-worker.ts` contains the unconditional fourth `readAiBudgetSourceExport` call. Misleading fake-test retirement wording was corrected to describe Node delegation. Root's separate checker finding about `try_candidate_privacy_write` being SECURITY DEFINER is corrected in the final 36-pin closure. No unresolved finding remains within this allocation.

This intentionally staged leaf denies unadopted qualitative, A12/A13 and Build admissions. Their adoption is required before activation; Build remains `account_only`, with no invented resume root or request lifecycle. Historical unbound OP1 rows receive no guessed source backfill. Source registrations, nonces, selectors and hashes remain personal metadata; no purge or permanent anonymous tombstone is implemented here.

The **30-day quota-before-content-deletion gap remains open**: usage sums surviving unlinked legacy `analysis_ai_runs`, so deleting content can remove original-month quota contributions. Preserve those totals and unknown exposure before content erasure in the next required leaf. Full expiry, foreign actors, Auth/org disposal, old exports, scheduling and independent restore-floor closure remain outstanding. Actual Native parsing/application, roles, transactions, two-session retirement/admission races and storage/restore acceptance require separate authorization. This review supplies no sunset, physical erasure, compliance or release proof.
