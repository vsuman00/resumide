# C02 foundation: independent SQL source review

2026-11-09. **HOLD: two concrete source corrections required. SQL NOT EXECUTED.** Only this handoff was written. Backend's five frozen files and relevant earlier migrations were read without edits. No SQL/parser execution, DB connection, environment-secret read, network, Docker, provider, installation or publication occurred. Root owns repair allocation and any later isolated managed-target admission.

## Frozen packet

| File                                                                  | SHA-256                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `supabase/migrations/20261109164851_correction_ledger_foundation.sql` | `386951c8f21e9f2f142dec934b2e524a0f1c01f3f1c122e3bc34c8fd954ea0d6` |
| `app/lib/server/correction-command-codec.ts`                          | `bf357d04b7d5c46dec2b62f84604729a45d09f27dc4a3d3ccb10ead42b418010` |
| `tests/unit/correction-command-codec.test.ts`                         | `fd01917632c6bc466ba5e65ded15151a4d6de49e1299344b961d1a6b9163d367` |
| `scripts/verify-correction-ledger-foundation.sql`                     | `e5eddcac178cd4ba98437c3b7aa8bbeb6dc1374f600dbc16182584de8a39178c` |
| `backend-correction-foundation.md`                                    | `a8e170dcfbe7dc7491bf30401220ee85b75d411623b2d91c9f6ec69de31f61fe` |

All five match the coordinator's frozen packet. This review covers actual parent SQL types/constraints, composite references, deferred checks, cascade behavior, owner-key ordering and helper privilege/search-path declarations. Root separately owns codec parity/grant/cutover review. The author's 22 codec unit passes and lexical SQL checks remain their stated source/pure-test tier; they do not demonstrate PostgreSQL execution.

## F1: NULL and wrong-kind membership bypasses mapped-location checks

**High integrity hold.** Migration lines 464–465, 470–471, 475–476 and 478–479 use `IF NOT (jsonb_value ? fact_id)` for contact, section, entry and bullet fact membership. Missing keys produce SQL NULL. PL/pgSQL does not enter an IF branch whose condition is NULL, so these missing memberships are accepted. A JSON object with the fact UUID as a key can also satisfy `?` while not being the required fact-ID array.

Concrete source counterexample: use the draft operator graph but remove `{sections,0,entries,0,factIds}` from `body` before its canonical-version inserts. Keep the entry ID, physical role fact, correction, assignment and every ownership FK unchanged. The entry lookup succeeds; `entry->'factIds'` is NULL, so line 476 does not raise. Other operation/application checks do not restore that missing membership. The earlier physical parent table permits this body: `20261012051515_canonical_resume_draft_storage.sql` lines 14–17 require only an object and byte limit. Strong shape validation belongs to the later repository/RPC, rather than a universal parent-table CHECK; this operator draft intentionally bypasses that producer.

Minimal repair: require exact array type and positively true membership at all four existing branches, for example an array-type test plus `(ids ? fact_id) IS NOT TRUE`. Do not replace the current checks with only COALESCE: wrong-kind objects still need rejection. Add narrow missing/JSON-null/wrong-kind operator negatives without adopting a new whole-document schema here. The five new tables are currently deny-all/default-off, so this is a foundation integrity defect, not evidence of a presently exposed application endpoint.

## F2: operator fixture cannot reach the foundation graph

**Validation blocker.** `verify-correction-ledger-foundation.sql` line 128 inserts `analyses(id,resume_version_id,organization_id,owner_id)` without `idempotency_key`. The actual base declaration in `20260909073321_candidate_resume_analysis.sql` line 75 is `idempotency_key uuid not null unique`, with no default. Relevant subsequent migrations do not add a default. On a target matching this migration chain, the draft therefore raises NOT NULL violation 23502 before inserting evidence or testing the new ledger.

Minimal repair: include `idempotency_key` and a fresh synthetic UUID in that fixture insert. Preserve the existing database constraint; do not alter production defaults to accommodate a verification fixture. The failed source candidate remains historical. This is a static counterexample, not an executed SQL failure receipt.

## Reviewed boundaries; no additional hold

Parent IDs, fact/location UUID types and correction/canonical integer revisions match the existing SQL. Nullable optional composite references have companion pair/kind checks; nonoptional source/event tuples are NOT NULL. New composite keys include existing primary-key identities and bind owner/org/root/source/attempt/event scope. Ordered UUID arrays have deferred row-count/scope/chain checks instead of fictitious element FKs. Insert checks re-read current rows and skip transaction-local cascade erasure; no delete/update authority or full APPLY semantics is inferred.

All new helper declarations are SECURITY INVOKER with empty search_path, qualified private/extension dependencies and execution revocations. New table RLS/revocations are deliberate deny-all preparation. Actual signed bigint lock resources are SQL-derived, sorted and deduplicated; the try-lock's retained partial transaction locks are explicitly documented. Future callers must freeze the complete owner set before row locks and end the transaction after failed try-lock. Existing writers do not yet participate, and this review does not ask this foundation leaf to implement global APPLY, cutover or race protocols.

Root/source/event/canonical deletion cascades and immutable-update declarations are consistent with the intended erasure path in source. Their actual trigger scheduling, role/catalog permissions, rollback and cascade execution still need the separately admitted managed target. No Docker DB or shared production project is authorized by this review.

Terminal disposition: **HOLD for F1 and F2 only.** Route minimal changes through Root/backend, keep the five-file packet frozen until that allocation, and review the correction delta before the later real SQL validation packet. No broader test or schema redesign is requested.
