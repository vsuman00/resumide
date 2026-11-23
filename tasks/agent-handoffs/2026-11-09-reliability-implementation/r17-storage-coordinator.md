# CR-R17 storage coverage coordinator

Status: IN PROGRESS; source implementation and synthetic validation only.
Base: dirty main a0b239299d75b0bd64b588fe743ebe2975fb28b9.

Continue the owner's full reliability goal after the verified disposition checkpoint. Fix the source counterexample where a limited retention claim leaves unselected versions without work and completion deletes their parent early. Native execution, physical storage and full privacy acceptance stay separate. CR-R16/R19 source prerequisites are integrated but actual adoption remains open; this staged source work does not close their gates.

## Ownership and sequence

Root owns contracts, exact preimages, migration ordering, shared plans/context, transfers and final integration. Backend a13_worker_stage maps the bounded chunk/backfill producer and current source-admission/checker closure. Runtime a13_worker_startup owns the separately allocated strict existing claim wire, mutation receipts and uncertainty handling. accounting_expiry_review independently checks key scope, first-clock stability, partial batches, concurrent/late responses and admission after tombstoning. Separate existing worktrees are required. Discovery is complete. Root froze r17-storage-contract.json and backend/runtime/peer allocation JSONs with exact preimages after synchronizing 901 source/document inputs. Native and Node implementations are now authorized only in those ordered file slices. Installed CLI2.117.0 created the fresh migration20261115143547; Root resolved that exact path before content edits. The separate tombstone supplement authorizes a small existing-root reactivation guard without changing old policy/scoring profiles.

## Acceptance

Bound per-call work and returned rows without inventing a total-version history cap. Every exact owned storage version must remain reachable for later claims. Account for queued, failed and uncovered versions after root tombstoning. Completion cannot delete a root until every current owned version has the correct successful work item. Foreign or mismatched item/key identities never authorize removal. Deleted items are terminal and repeated completion is idempotent; late failures cannot reopen them. Preserve the earliest committed retention clock and all accounting disposition deadlines. Do not invent keys/clocks for historical missing parents. The existing interface is at least once; no exclusive lease guarantee is introduced.

The Node repository must reject malformed/null/oversized/mismatched claims, rather than coerce missing fields or return an empty success. Its existing array wire remains exact item_id/resume_id/storage_key, no new owner field inferred. Completion/failure need literal true receipts. Object-removal failure and uncertain completion are separate; unacknowledged bookkeeping cannot produce a completed count. Existing storage-key generation is authoritative. Actual database admission for new versions after retirement must be inspected before a source design is accepted.

## Verification and boundaries

Use current source and preserved failures. Focused controlled tests, then full types/lint/web/worker on the integrated candidate. Do not repeat unaffected broad tests without a causal reason. Source text/JSON checks do not prove SQL parsing, native concurrency or object erasure. Preserve failed receipts and process identities; archive source preimages with .txt suffixes.

Pinned Node22v22.23.4, sealed empty HOME, OS network/root dotenv/Git writes denied. No SQL parsing/execution/advisors, DB/hosted writes, actual env/keys/PII/PDF/Photos, providers, app services/browser, LaTeX/OCR runtime, Docker, dependency or workspace Git mutation/deployment. Supabase directly; never Docker DB/reset. Existing hosted question is unanswered; do not repeat or infer approval. All services remain free; pricing deferred and deployment HOLD. Default-off/data-denied and immutable history/ownership/consent/CAS remain.

## Reviewed decisions

A failed callback for an already deleted item returns false, not a successful no-op: a true failure receipt means failure was actually recorded. Repeated completion of a deleted item returns true with its original timestamps. Native exact owner/root/key authority remains separate from Node key-frame validation.

Deleted roots with no proved first retention event require repair; updated_at and invented object keys cannot restart a clock. Historical keys already erased by the old bug are not reconstructed by this source repair. There is no current application RPC that reactivates a deleted root; the small independent tombstone guard closes that privileged UPDATE invariant without claiming backup/INSERT restoration protection.

The Node deadline bounds the awaited sweep and downstream work. Storage's existing removal interface has no abort hook; late physical outcome remains uncertain and must not be called cancelled or counted as confirmed. The CLI keeps a fixed safe failure and no success report on uncertainty. Actual process lifetime and storage behavior still need runtime evidence.
