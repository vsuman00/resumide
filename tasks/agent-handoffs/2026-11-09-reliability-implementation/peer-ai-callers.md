# AI caller adoption peer review

2026-11-15. **SOURCE ACK for technical-budget caller adoption. No unresolved finding remains within this allocation.** Supplied base HEAD: `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, with synchronized dirty source. Product files were read only; this handoff is the reviewer's only workspace write. No tests, compiler, SQL parser/execution, database, provider, service, actual environment or Git operation ran.

The governing [contract](ai-callers-contract.json), version 1.0.1, has SHA `97c5fac13e0b7503de9e89e8fbd5aeb358bd4685f01ad8e64d14eb97af0c0e6e`. It supersedes `5c2e2f64ef3675748966f89d0e485593e4787a4c4155ab258226b2fe79d6b049` only to align A13 worker-ID grammar with the existing Native validator. The [independent codec vectors](ai-callers-codec-vectors.json) have SHA `b1d478091ac6a2b969ac6aa82caa17ab5a390b105197f0a1c211791ff03ca1fc`. They establish byte framing, not SQL behavior.

## Identity and authority

The legacy rewrite v1 input and its six-atom OP2 codec remain unchanged. New v2 inputs are strict variants; metadata and owner export advance to v2 with the same nine metadata fields, independent reserve/export capabilities, ten source-row fields and complete-or-refuse bounds of 4,096 rows and 32 MiB.

- **Legacy qualitative:** budget operation ID remains the actual server analysis UUID. Node now selects its version ID; Native proves the exact owner/org/analysis/version/active root and qualitative-review state. A retained unregistered R03 row refuses fresh adoption. Current authenticated analysis policies are SELECT-only and app ingestion mints UUIDs; no ordinary authenticated recreation exploit was established. Privileged restore remains a separate gate.
- **Canonical rewrite:** the technical ID derives from owner/org/kind/analysis/version/client operation UUID. The public typed operation ID, policy and receipt remain unchanged. Native proves the actual scoped private operation, source ID, binding/model/prompt and reserved state. A retained old raw technical ID blocks new-ID admission in every state. The technical attempt remains the deterministic new budget ID plus `canonical-rewrite/1`.
- **Initial feedback:** the technical operation and attempt IDs remain the actual server-minted private IDs. Source reservation verifies the open operation, current reserved attempt, ordinal, source, binding, frozen budget/model/prompt/output bound and actual active lease. Lease/attempt proof is transient and excluded from immutable source identity/export. The owned claim retains consent, lease, policy, once-winner and nonreplayed-budget checks; `budget_attempt_id` is set only after winning the technical claim.
- **Build:** OP2 binds owner/org/`build_account`/exact nonce; any retained Build OP1 blocks silent new-ID dispatch. All three parent fields are literal NULL. Admission reads the actual Auth user and owned org/membership under durable owner admission. Build is captured only by account preparation, never by one root's retirement. No resume or request lifecycle is invented.

The source RPC uses a private ordinal helper after variant-specific proof. Public generic reserve, reserve-next and claim refuse registered A12/A13 kinds. Their classification helper acquires the **exclusive**, nonblocking owner lock, checks the durable barrier and kind in fresh commands, then retains that exclusion through the technical transition. A shared owner lock alone would permit concurrent registration between classification and transition; the final body avoids that interleaving. Private technical helpers remain service-denied. No GUC or caller boolean supplies authority.

Both actual typed claim successors call `private.ai_budget_transition` while their typed rows are still reserved, then mark the typed winner. Their existing row locks and checks remain. The attempt guard therefore sees the required preclaim state; A13 uses its actual attempt UUID, not an additional attempt codec. Late settlement, unknown holds, reconciliation, release rules, original periods and budget arithmetic retain their existing transition bodies. No live-source requirement is added to late accounting.

## Lifecycle and catalogue closure

Registered source capture remains ahead of historical inference and includes reservations before parent deletion. A12's new budget mapping uses the actual registry; explicit historical typed links remain. Build has a separate account-only branch before root handling, and its nullable disposition tuple uses `IS NOT DISTINCT FROM`. First account/root clock minima are preserved; registration time supplies no deadline.

Owner export retains all kinds across organizations and flags, with strict parent/null rules and recomputed identities. The mandatory twelfth collection keeps the existing ledger owner/org/full-binding join. Exported A13 identity needs no fabricated lease. Multiple read RPCs remain non-atomic and inconsistent closure fails publication.

Two concrete catalogue findings were resolved:

1. A successor seal could learn a preexisting missing source primary key. Final migration takes ACCESS EXCLUSIVE locks on the affected old source/seal/budget/typed tables, verifies the exact old readiness body and requires old readiness TRUE **before the first ALTER**. The locks remain through successor bootstrap.
2. The draft getter omitted both old and new closed triggers, leaving the old trigger outside the successor fingerprint. Final getter omits only the new v2 trigger during bootstrap; the existing v1 closed trigger is fingerprinted. The new trigger is checked explicitly. The old seal row is never updated or resealed.

The migration uses 20 guarded body replacements and seven new private helpers. It adds no data grant; source/owned data RPCs stay denied and flags default off. Existing generic service grants are unchanged. Stored historical policies/receipts are not rewritten.

## Exact frozen product inputs

The first seven paths below are in the backend worktree; the last six are in the runtime worktree. Each final hash was unchanged between its review start and end. The runtime's six dependency profiles contain the same bytes as backend.

| Path | SHA256 |
| --- | --- |
| `supabase/migrations/20261115162257_ai_budget_all_caller_sources.sql` | `ef1fa5e4ade5b8cf4b2fe8860d4446839e6e60155e5a55a75215533dda2d541b` |
| `app/lib/server/ai-budget-source-profile.ts` | `5093aba19fe49b81b174f6e85ef8f2d93f5e09e32cbc3f3417f9d712a5f90073` |
| `app/lib/server/owned-ai-disposition-profile.ts` | `8864ae29dea9ee3d7dbaa8f0e7b556b96d1ab7cdf7009602ca4000c93c5802e5` |
| `app/lib/server/canonical-rewrite-readiness-profile.ts` | `f6f9e1b12f02c9b24890ea6c90f1634a30ed4cbf7d3ede637c4722ea7f9fc54a` |
| `app/lib/server/canonical-rewrite-workspace-profile.ts` | `c5f6655a1d668b45af2f9142c13b6c9fe912e7947ce91e81da3f53bd65c3c23c` |
| `app/lib/server/initial-feedback-operation-profile.ts` | `4b2d8c7e1e3639b175f75bb6be62659cf1370a85860cd830e0b6d522b2546469` |
| `app/lib/server/initial-feedback-profile.ts` | `217dc684d7c0f2f136542b6d97b5b384c21dcc4cc1669120f046fd9004c2474d` |
| `app/lib/server/ai-budget-source.ts` | `4c101b7962f3038ca7532259389679d1fbb4e4d7cd486b2d951596ab929bfb4d` |
| `app/lib/server/ai-budget-source-export.ts` | `1884de7e112c5716b11f09a682757827fa14e2aa97027eadc495eac6466db09f` |
| `app/lib/server/qualitative-stage.ts` | `3925a29948bec447a37d4a62634c5ee4fe506b11b66124def5cb39e25cf4872f` |
| `app/lib/server/build-assist-service.ts` | `e043637924ad8dc77e0ca62daa89a7ef7c0c69fe7cd989d9285b8c575298b194` |
| `app/lib/server/canonical-rewrite-repository.ts` | `166c21a7c316b10710e7c2135f70b0071be520aea59a3422aa25b60ca612871c` |
| `app/lib/server/initial-feedback-service.ts` | `62b5bc35fd966bf0dc10f93179991e958f1d8014511137b0207b5cc0293d0b54` |

Independent textual composition through historical substring, `changes` and full-body JSON manifests matched all 48 source-checker pins and all 20 current pre/post pairs. All 37 digest values across the six profile files resolve to terminal function bodies. This is source-text hashing, not SQL parsing, catalog observation or Native acceptance. Initial extraction attempts lacked older manifest formats; the corrected composition has no mismatch and required no product change.

Read runtime caller/adapter/export code and relevant synthetic assertions; checked that profile-module mocks were removed from the nine allocated tests. Peer ran no tests. Author results and preserved failed receipts belong to their packets; Root owns the integrated gate. Fake RPCs and textual source checks cannot prove locks, roles, transactions or races.

## Required later

Budget-off provider branches, quota preservation and full privacy/expiry remain open. For quota, deleting a retiring root cascades its unlinked current-month `analysis_ai_runs` away, reducing usage seen from another live root. Preserve that disjoint contribution in its original UTC month before content deletion. Do not preserve all run rows: A12/A13 linked compatibility rows are already counted privately. Global link classification must remain independent of month, including an October claim with a November compatibility row. Unknown claims/holds remain unknown; R03 technical spend is not an extra shared-quota component.

Account-only Build replay after identity purge still depends on original-account unusability, Auth/session and restore closure. Source selectors, nonces and hashes remain personal metadata; no full purge or anonymity is established. Full 720-hour expiry, foreign actors, Auth/org disposal, old artifacts, scheduling and an independent restore floor remain outstanding. Native application, role/transaction/race/storage acceptance, representative evidence, owner acceptance and release remain separate. This ACK does not close the full reliability goal.
