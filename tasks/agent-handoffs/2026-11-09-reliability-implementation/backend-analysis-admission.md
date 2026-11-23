# R07: default-off payload-bound analysis admission

2026-11-10. Local source implementation over Root's 682 synchronized nonsecret inputs at main `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus preserved dirty work. Root approved the concrete protocol and supplied `ANALYSIS_ADMISSION_BINDING_ENABLED=false` in shared configuration. Backend changed only the five files below and this handoff. No SQL was parsed/applied/executed; no provider, storage service, Supabase, Docker, browser, real-document or Git operation ran.

| File | SHA-256 |
| --- | --- |
| `app/lib/server/analysis-ingestion.ts` | `36cceba017515ad62bb7730ebc5263319e74464688c5bc34d2bb98d69891cc89` |
| `app/routes/api.analyze.ts` | `52f57411506d566017edd7d1a072bdd009c90a9990b6f24bf974112c32829178` |
| `supabase/migrations/20261110080809_analysis_admission_binding.sql` | `50df6fadf38bd7aad61296d5f641a3bac4c03374b9594afa34025df6119ff9a3` |
| `tests/integration/api-analyze.test.ts` | `04f773f9b963205009a63a10e56992911631a49ecb5154f9b37e663626a56895` |
| `tests/unit/analysis-ingestion.test.ts` | `b03e6085f264a81e1fabfed985d262e42a9c39dee575fa22a791fb8e612a9416` |

The CLI-created empty migration is now an additive source draft with two private ledgers and three service-only RPCs. No existing table, producer, trigger, grant or legacy function is changed. Existing privileged synthetic analyses with an idempotency UUID remain valid fixtures. New-table/helper access is revoked from public/anon/authenticated/service-role direct access; only the new public RPCs receive service-role EXECUTE. Runtime privileges remain untested.

The operation is unique by organization, owner and idempotency UUID. Its immutable hash binds PDF SHA/bytes, exact title/JD/display-name hashes, request-policy fingerprint and versioned admission/consent policies. The route fingerprints validated upload limits and relevant server processing flags/model/budget policy, without credentials. Request policy is recorded, not a claim that future workers already enforce an immutable execution policy.

`prepare_analysis_admission` checks current owner membership, current `candidate-ai-v1` consent and pending deletion before looking up the operation. Exact committed replay returns the original IDs before storage work; changed payload conflicts. Every concurrent uncommitted caller gets its own durable upload intent and generated path before upload. The client snapshots bytes and bypasses the old storage helper's eager error deletion in this branch.

`finalize_analysis_admission` repeats authorization, validates exact raw title/JD/name hashes and intent IDs, and calls the old `create_queued_analysis` inside the same database function/transaction. The operation UUID supplies its globally unique legacy key. A legacy false result or mismatched IDs raises, rolling back the wrapper rather than adopting an unrelated row. One intent is adopted; a confirmed losing duplicate becomes cleanup-pending. Unknown or malformed finalize receipts never authorize deletion. Contradictory duplicate receipts pointing to this upload's analysis/resume also fail closed.

Root caught a missing source-version replay check in the draft. The corrected replay joins the exact current owned resume version, organization/root, storage key, checksum and bytes using already validated binding metadata, plus owned job/title/JD hashes and active root/name hash. Missing, reassigned or changed source cannot return an unchecked original. This is source review, not an executed SQL fixture.

The client deletes only its confirmed losing duplicate. Delete failure or a lost cleanup acknowledgement still returns the original analysis; the durable pending record remains available for reconciliation. Ambiguous uploads are journaled pending without deletion. An uncertain finalization leaves the durable prepared/adopted record and object intact. The cleanup RPC cannot adopt a pending intent or mark an adopted object cleaned; exact post-work bookkeeping can finish after membership revocation.

Actual failure: the new ambiguous-commit test failed on the unchanged legacy ingestion path because `remove` was called once after a lost database response. After implementation, the finite affected run passed seven ingestion tests and two existing route tests, with one new route assertion failing because production configuration was cached before its test changed the environment. That test-only harness now injects its flag explicitly; the three affected route tests pass. This is composite evidence for ten unique cases, not a new full-suite or SQL-concurrency run. The client-race double proves local response/cleanup ordering, not database locking.

Scoped ESLint/Prettier/whitespace checks pass. Project-options no-emit TypeScript reports zero diagnostics over 386 files/six roots. Tests use Node22, private synthetic verification, disabled dotenv loading, fake credentials and RPC/storage/auth doubles. Existing route assertions remain; PDF parsing is stubbed only in the route-contract test. Root owns combined verification.

Activation remains off. Restrictive ledger FKs, privacy export/deletion/restore, durable reconciliation operations and legacy-writer cutover need explicit admission before use. Technical AI reservations remain at actual provider dispatch; R07 invents no usage, zero spend or preparse reservation. Atomic AI/admission cutover, R08–R10 lease/stale-write fencing, managed concurrency and release acceptance remain open. Rollback is to keep this new branch off while retaining its ledger history; no reset or broad cleanup is provided.
