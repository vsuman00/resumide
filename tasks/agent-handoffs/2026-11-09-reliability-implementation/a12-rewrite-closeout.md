# A12 owned rewrite source checkpoint

The owned score page now has a separate writing-draft panel and private `POST /analysis/:id/rewrite` resource. Generation uses current confirmed canonical claims and the selected immutable job requirements. It no longer relies on the legacy extraction-only writer to represent corrected input. Saved results carry the original source, canonical/JD, policy and draft bindings; the UI distinguishes current, historical and unbound legacy drafts. Copying a proposal does not accept a resume edit or change a score.

**CR-A12 remains PARTIAL; its source implementation is VERIFIED_LOCAL.** This checkpoint does not establish working installed PostgreSQL transactions, live AI quality, browser behavior or full consumer acceptance. The feature defaults off, and all four native write RPCs remain denied. The full reliability goal remains active. Pricing and deployment remain on hold.

## Integrated verification

Dirty `main`, base HEAD `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. Root integrated 26 allocated source/test/config/SQL files and four handoffs from three separate worktrees, preserving unrelated work and prior bytes. The [frozen allocation](a12-rewrite-coordinator.json) binds every integrated file.

One fresh [combined run](a12-rewrite-integrated-54da8d96-616a-44d0-846b-7abbb9a530d2.json) passed **351 tests in 19 files**, full typecheck, lint, web build and worker build. All 838 captured inputs stayed unchanged. Root rehashed the log and build artifacts, checked every current binding, and confirmed the controller and five process groups were absent. The [integration review](a12-rewrite-integrated-review.json) records 11 allocated predecessor changes and 804 unchanged common inputs. The previous controller remains on disk; old authoring, semantic, coverage, codec and writing-support modules remain unchanged.

The controller uses pinned Node 22.23.4, sealed synthetic configuration and fake transports/RPCs. No dotenv, real credentials, provider, database, Docker, browser or service was used. Full `verify:ci`, native verifiers and external tests were not run within this allocation. Do not repeat this unchanged application campaign.

## Repairs and boundaries

- A fresh native prepare returns false dispatch permission with a context; only the winning claim can authorize a provider attempt. Exact replay returns the saved receipt or existing state before rates, budgets or provider work. Reserved or uncertain attempts are never automatically reclaimed.
- Known usage is retained before output validation, including when a failing budget settlement replaces the original provider error. Definitive failure receives an idempotent technical terminal outcome. Ambiguous publication remains eligible for exact receipt recovery without demoting a possibly saved result.
- Actual native SQLSTATE errors receive fixed public classifications without leaking their messages. Unknown, coerced or negative monthly counters cannot become a zero allowance. Closed budget refusals and caller cancellation have appropriate recovery behavior.
- Publication source reconstructs the closed plan and declares one transaction for run, immutable draft version/head, compatible projection and receipt. It rechecks ownership, privacy, consent, current inputs and draft CAS. These are reviewed SQL declarations, not executed transaction proof.
- Privacy export covers all three new stores and fails closed on missing or unknown schema. Technical metadata remains subject to the existing retention/erasure activation hold; its restrictive account references do not approve indefinite retention.
- Legacy output now says `legacy_review_required` instead of prematurely claiming grounded support. The UI preserves copying and explicitly labels missing version binding. All ten original legacy tests remain unchanged.

The current plan permits exact copying and the finite equivalent leading-action transform. It does not complete broader useful rewriting. Numeric scores, proficiency and duration credit remain unavailable. The new rewrite-only duration helper preserves the frozen single/each/either interpretation; ambiguous subjects remain unresolved.

## Preserved failures and next work

[Backend](backend-a12-rewrite.md), [frontend](frontend-a12-rewrite.md), [runtime](runtime-a12-rewrite.md) and [independent peer](runtime-a12-rewrite-peer-review.md) handoffs retain genuine failures, fixture/setup mistakes, exact snapshots and author check scopes. Their separate partial runs are not summed into the fresh 351-test result. Root approved only the new legacy test's mistaken no-CAS-query expectation; the corrected assertion checks the actual owner/analysis/timestamp CAS and stale outcome.

The [native text review](a12-rewrite-native-source-review.json) matched 20 tagged routine-body hashes and six profile pins across 21 new routines. SQL and the privileged mutating rollback-only verifier remain unparsed and unexecuted. Catalog/ACL, concurrency, consent/privacy races, replay, deletion/retention/cascades and cleanup need a separately admitted direct-Supabase target. Actual browser/provider, broader usefulness, representative validity and release acceptance remain open.

Next is [CR-A13 factual feedback](a13-feedback-coordinator.json). Its isolated test-only discovery has reproduced 11 factual-support failures with six positive controls; the failing test remains outside the integrated Root suite until the producer is repaired. Initial feedback currently lacks canonical/JD snapshots, so the next design must bind the source that actually exists and preserve the uncalibrated-evidence guard.

## Subsequent source compatibility finding

The A13 source review identified a concrete A12 native dependency after the application gate: the existing `document_evidence_no_qualitative_score` trigger rejects every `analysis_ai_runs` write for an analysis with document evidence. The staged rewrite finish currently inserts into that protected table. Its canonical path is therefore source-incompatible with the preserved guard; native activation must not proceed on this candidate. The 351 fake-RPC application tests do not exercise that trigger.

The [finding record](a12-rewrite-guard-compatibility-finding.json) preserves exact source hashes. A forward compatibility repair is being designed with the original guard intact, separately owned prose-run metadata/publication and complete known-usage accounting. The frozen source candidate and failed/native-unexecuted distinctions remain unchanged. This is an identified source defect, not an observed database execution failure or a reason to relax scoring admission.

That forward source repair and the factual-feedback core now pass a separate 218-test integrated gate. The original 351-case result remains historical; the later result does not establish native execution. [Successor checkpoint](a12-compat-a13-core-closeout.md).
