# R19 privacy-map repair handoff

Updated 2026-11-09. R19 documentation repair only; full tenant/Auth/privacy/security acceptance remains PARTIAL. Root main at `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus its current dirty source is authoritative. No application code, SQL, grants, hosted data, credential, provider configuration, Docker, service or runtime test changed.

## Exclusive deliverables and preservation

- `docs/security/PRIVACY_DATA_MAP.md`: reconstructed source-contract inventory, not a new legal/user-facing policy or proof of live enforcement.
- `docs/archive/PRIVACY_DATA_MAP_MISPLACED_ACCURACY_PLAN_20261109.md`: exact displaced dirty bytes, without a new header, link repair, cleaning or formatting.
- This separate handoff; C02/R12 reviews remain in their existing review handoff.

Before replacement, root and worktree maps matched at SHA-256 `7ec2d33ae4c5de97c5011f4e5909c9dd94e2e1e0b071b2a0043a2ac5d5ed02c0`, 23,200 bytes. The archive is byte-identical at that hash. HEAD already contained the misplaced Accuracy-v2 plan at `c0f3dfb32836038ae1f5c74877fe24244364c68b5febb45a0c052d22b7a47e44`. Its dirty diff had six additions/six removals around the standalone AA7 description; those unique changes are preserved in the archive, not overwritten by the HEAD version. History at `a549798` contained a real earlier map (`7f7bf79b748d3424c8500420e860b3410f8181ca032c00870320eef3fa1fd9fb`); it guided discovery but was not blindly restored over current contracts. No Git staging/reset/commit or root file mutation occurred.

## Reconstructed source contract

The new map distinguishes Auth/session/account data, uploaded PDFs, raw jobs, analysis/lease/transition records, extracted text/geometry, evidence/corrections, canonical/requirement/authoring history, deterministic/AI results, consent/audit, durable privacy export copies, technical ledgers and transient artifact/Build content. It includes the separately default-off hosted Paddle adapter/admission ledger and whole-PDF disclosure boundary; that is not current automatic OCR integration or provider activation. C02 stores remain proposed.

Retention is described from actual source defaults and sweep selection: 30 days is the configured default for resume-root created_at selection, not an all-store deletion SLA. The map shows root/object claim, active-access revocation, durable object plan, DB cascades, storage removal and retry/completion separately. No deadline is invented for other stores, backups, provider or local/downloaded copies.

Source-visible gaps remain explicit and untested here: earlier completed export manifests/Auth/session/org/audit/request records are not removed by the inspected application deletion function; the initial completed-export download route lacked an explicit pending-deletion predicate (the subsequent scoped guard is recorded below); raw job description and analysis_ai_runs/private ledger collections are not directly selected by the worker export; only the workspace RPC subset shares one SQL snapshot; whole-export completeness and writer/deletion-enqueue serialization still need their reviewed tests/contracts. Generic log redaction is not asserted to sanitize arbitrary text. No exploit or successful erasure was measured by this repair.

The Supabase and clean-user-facing-text skills were applied. Official RLS guidance distinguishes grants/policies/privileged checks. The changelog Markdown request was rejected by the browser content-type handler; the official HTML changelog was read instead. No library/CLI migration or project setting was adopted, no configured credentials/settings were inspected, and no hosted query ran. The source map links the official guidance and actual repository authorities.

## Bound source inputs

These hashes identify inspected root source at the documentation review, not a deployed schema or runtime attestation.

| Source                                                                      | SHA-256                                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/privacy.ts`                                                 | `84a462895e558042aac8eb89e766fa2a942631b8c195105167805097fe8811e2` |
| `app/lib/server/privacy-worker.ts`                                          | `93bf1e8d6efeed4e9a6d4c8b642a1bde85edd81ca2b539db536825dbee88b37d` |
| `app/lib/server/privacy-operations.ts`                                      | `19c8e9df5f4bb9cd4b9033f3dd40cb9b9953f745024532696337252772432860` |
| `app/lib/server/retention.ts`                                               | `0e62ab3fca150b8f982627aa4509900aa1b356bf1e4786117ef39436f08dfc31` |
| `app/lib/server/config.ts`                                                  | `ea89c7992e60de4a68ffd29141428ef5303aaef72ac5397470bb0483141e7570` |
| `app/lib/server/supabase.ts`                                                | `e3638efb155eb57b3a36da016fbb304d8aaaebc00db29cf4fba35c199c4dae63` |
| `app/lib/server/storage.ts`                                                 | `ba0412d6e9b5de76157c06797c2e056d3311fb269fe1e707065becfc48afe4bc` |
| `app/lib/server/observability.ts`                                           | `d717b3fe7fa64493672ccaec16500bd571a0635006611bdd9ef398d10bfed607` |
| `app/lib/server/qualitative-ai.ts`                                          | `f673d71f621f994e88f2e120f1b299f28ebd72f6eaea30a0c877afd6b5df1d10` |
| `app/lib/server/rewrite-ai.ts`                                              | `6ae2e0fdb960be7d6d50b4c9a4b50c875cc1e445dece3109a8ee82a72b063848` |
| `app/lib/server/build-assist.ts`                                            | `fcf452ab04fd247de4374727a3d8e3b0ae551420ce5f5659f6d684e9b65e3b65` |
| `app/lib/server/build-assist-service.ts`                                    | `3c74c80514aa4f8b61ec32089c73440941681d78d49e493094307d0d5d1178ea` |
| `app/lib/server/ocr/paddle.ts`                                              | `e081d09ea84b1e00fc5993d83bc9302c583e626b10b1db7be190bb7af754393b` |
| `app/lib/server/ocr/paddle-config.ts`                                       | `0ea2b21d19ebcd3ddc14919bf34f685483aede979dcd7c1a83ce6e6038c75a55` |
| `app/lib/server/artifact-repository.ts`                                     | `f260234939e537eb5c92a6db3b01bc8d899f619975176bc78a68144c9e0df861` |
| `app/lib/server/artifact-contract.ts`                                       | `3c4e5f4b291a5124d762ba3cf6e4a9ce2979204f9b50d454d2f5d229e41bfb4a` |
| `app/routes/api.privacy-export.ts`                                          | `8f123c7aa9d358e46a639c87c1fde99cc2705940b1cfb1351131248e859e62a2` |
| `supabase/migrations/20260911130000_durable_privacy_deletion_plan.sql`      | `b66a8d16dffa70306083d22e48ba4ebb44ca01ce6341cc8582ce26ea149634df` |
| `supabase/migrations/20260911110000_phase7_security_privacy_operations.sql` | `ef0d3040f696e8c173fc6b8ecf92d0b69443c5b3b026358449b8c0a978e04055` |
| `supabase/migrations/20260909220000_qualitative_ai_stage.sql`               | `5f693f5a162b05d789c9d071d50c4eb9baf7c9df0144187bf4c5e809c6e15ee3` |
| `supabase/migrations/20261012051515_canonical_resume_draft_storage.sql`     | `2eed8e55fffc2ca320736bb39c9b9ba2f63e1816062bcd6bd75a0e1192a1957b` |
| `supabase/migrations/20261011140000_document_evidence_review.sql`           | `33800fe7d65b77bad74889dd21092a51760b8c3ea82dfd60d98196b58d9b234e` |
| `supabase/migrations/20261012160703_candidate_authoring_transactions.sql`   | `bc5a4e132144d68bb267cdad506c3a96db66205d12ed1b480956596986048ee5` |
| `supabase/migrations/20261029130000_paddle_ocr_admission.sql`               | `146f8239fc6fb7af802cb0ef17e5c210044fc50f2df3bb6ac76fa51c7d57ddc6` |

## Verification and remaining work

Only the new map and handoff were formatted. The archive is a protected verbatim copy; its old relative links are intentionally preserved and excluded from current-link/format repair. Exact archive/root-byte equality and the 23,200-byte hash pass. The new map/handoff relative links resolve against integrated root plus these owned files; all 34 inventory table identifiers exist in repository migration declarations. Scoped Markdown formatting and whitespace checks pass. Prose density is low, suspicious Unicode count is zero and deterministic cleaning made no changes. Final map SHA-256: `3f164b32de948b3c40ca4d5894b5e1b7eabd4d80e59cc8bb1a052991d5e57a28`. These are documentation/source checks; no application CI or actual privacy test ran.

Full R19 still needs current grants/RLS/service-role/owner/foreign/session/cache/storage tests, actual export/delete/retention/restore recovery and explicit policy for retained copies. Root owns integration, canonical task status, policy decisions and later exact managed-Supabase allocations. No Docker database/reset, deployment/publication or Git mutation is authorized by these documents.

## Completed-export guard follow-up

After the initial map was integrated, root integrated `app/routes/api.privacy-export.ts` at SHA-256 `8e8ac6982e7f8067c8ffae40224cc8015bdab5e0bdf5d01d1c5886df6897fb9a` and `tests/unit/privacy-export-route.test.ts` at `fa85e908d03dc5e54c85df3026c3276cf9cadeca89b45a9e8acf35b40bce6113`. The original 24-source table above is preserved as the pre-guard snapshot; its earlier route binding is historical, not the current route hash.

Independent source inspection confirms an owner-scoped `kind = deletion`, `status != failed` access check before manifest loading and again immediately before serialization. A matching nonfailed request returns 404; policy errors/malformed results fail closed with 503; permitted downloads keep the fixed attachment name and no-store headers. Backend reports 17 actual-loader cases with filtered database doubles and 34 affected passing cases. The reviewer did not rerun tests. The interleaving fixture adds deletion during manifest loading and verifies that serialization is blocked. This is source/mock route evidence, not an actual hosted tenant or atomic enqueue/response test.

The map changes only its earlier absent-predicate claim. Atomic enqueue/response ordering, physical/DB erasure, old manifest retention, Auth/session/org/audit/request disposition, other export coverage and full R19 remain open. No archive, source, SQL, grants, service, provider, browser or database operation changed in this documentation refresh. The separately released C02/R12 review handoff is untouched.

The refreshed map SHA-256 is `f3cd3e6e972bb62ad3becf6349f484036f35dfd2b99512b2e63e11c859068836`. The earlier `3f164b32…` map hash and original source table remain the initial repair snapshot.
