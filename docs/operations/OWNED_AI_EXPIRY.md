# Owned AI accounting expiry

Status: staged source implementation; actual execution and adoption remain unverified. No SQL parsing/execution, hosted change, real sweep or adoption has occurred. [ADR-0020](../decisions/0020-owned-ai-accounting-retention.md) requires removal of personal linkage within 720 hours of first durable deletion preparation, preserving usage and conservative unresolved holds. This candidate does not complete that policy.

The backend folds the validated legacy/A12/A13 shared-usage partition into its original UTC month, separately conserves R03 tokens/cost and unresolved safety measures, and removes the exact selected personal accounting closure in one transaction. Linked raw-run months have separate numeric compatibility markers for arbitrary-since refusal; they do not add another debit. Removing identity cannot clear an existing overspend block or unknown hold. Global totals are never returned as an individual organization's usage.

Only original-month numeric aggregate fields remain in the retained accounting store. No owner/org/operation/attempt/run/actor/request ID, nonce, content/evidence hash, exact event timestamp or per-subject dedup receipt belongs there. Exact relational work rows exist only inside the transaction and must be gone at commit. Missing proof, clock, ownership or paired closure aborts the whole fold. A retried uncertain commit cannot credit the month twice.

## Capability and worker

`read_owned_ai_expiry_readiness` returns the exact seven-key metadata object and actual source pins. The one-shot client compares all five profile strings and requires both readiness and fold capability before one `sweep_owned_ai_expiry({p_limit})` request. The limit is an integer from 1 to 100. A shared deadline is at most five seconds; cancellation and uncertain results cause failure without automatic retry.

The exact sweep reply contains schema version, selected/folded/blocked counts and `deadlineBreached`. Counts must be bounded and selected must equal folded plus blocked. Blocked work or a deadline breach is a failed operator result, even if some folds completed. Only validated counts may be printed; source identities, raw RPC errors and private adoption witnesses must not be logged. No response certifies erasure of an individual account.

The CLI requires explicit `--execute`, optionally `--limit=N`, before creating the real admin client. It is not registered as an active scheduler or run by this source verification. Current destructive RPC/data permissions are denied. Do not execute it against the configured project under this source-only work authorization.

The separate private adoption capability is unseeded. It must pin an actual trusted verifier's signature, owner, catalogue properties, closed ACL and reviewed source digest. There is no placeholder verifier. The future implementation must derive the exact selected scope and real Auth/object/export/foreign/org and independent monotonic restore-floor guarantees before returning its strict transient witness. Echoing a scope or changing a readiness Boolean supplies no proof.

## Adoption still required

Complete the real verifier and external cleanup/restore authority, scheduler and missed-deadline monitoring, exact foreign actor/Auth/org/old-export/object cleanup, and Native rollback/role/lock/race/conservation tests before granting destructive capability. Root/account clocks retain their original minimum; a missed deadline is a failure, not permission to renew it. Full consumer and release acceptance remain separate. Deployment stays HOLD.

## Export-producer and restore foundation

The next staged source repair gives each actual privacy claim a protected database generation plus its existing monotonically incremented attempt. Completion must match the worker, attempt and live lease, and content-bearing export completion also matches the current generation. A stale asynchronous manifest is discarded and rebuilt; it cannot be relabelled under a new claim. First preparation/fold advances the rollbackable generation and clears affected stored inline copies in the same transaction. Protected authority columns cannot be forged through direct service writes; only the current queued cancellation path remains available outside fenced producers.

This generation closes stale export writes; it is not restore authority. The separate [restore-admission foundation](RESTORE_ADMISSION.md) needs actual independent volume/fencing/checkpoint and first-clock/serving integration before adoption. Existing expiry capabilities remain denied and the private real adopter remains absent.
