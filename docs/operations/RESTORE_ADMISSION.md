# Independent restore admission

Status: staged source foundation. No production authority volume, platform fence, real checkpoint verifier, managed restore or deletion adoption is activated. The existing checksum/ownership helper remains an integrity check, not permission to serve restored data. Target RPO 24 hours / RTO 4 hours remain acceptance requirements; a privacy-safe refusal is not a passing recovery drill.

The independent journal stores only schema version, global generation, CAS revision, fence and phase. Values are bounded canonical decimal strings and `quarantined|ready`. No subject/org/operation/request ID, selector, hash, timestamp or per-subject receipt belongs in it. A generation is a global instance/cutover boundary; it is never reused as a different work identity.

`RestoreFloorStore` uses an explicitly supplied canonical absolute directory, strict ownership/permissions/file checks, asynchronous no-follow/nonblocking filesystem access, exclusive acquisition, exact CAS/history and file/directory durability acknowledgments. Missing/corrupt state is unavailable. Controlled bootstrap is separate and starts quarantined; no application, project, temporary-directory or restored-snapshot production default is selected. Tests use isolated temporary directories through the same interfaces.

The filesystem implementation cannot prove that its volume is independently protected from restoring a valid older copy, nor certify locking/durability on an actual deployment topology. Those are operational preconditions. Caller deadlines do not forcibly cancel issued kernel I/O. Uncertain writes/locks remain unavailable; crash-left physical-lock recovery requires actual fencing/quiescence and controlled recovery. No automatic lock stealing, journal rollback, epoch reconstruction or retry is permitted. Checkpoint-outcome reconciliation alone does not prove recovery of a damaged/uncertain journal.

## Controller order

1. Durably quarantine before destructive work.
2. Obtain actual ingress/writer closure and current external fence from the required trusted adapter.
3. Advance and acknowledge the independent floor.
4. Perform one protected transition and validate the actual committed checkpoint/instance/current fence. Sweep counts or an echo are insufficient.
5. Durably publish ready, then reopen through actual current-fence enforcement. Any uncertainty remains a failed admission; delayed controllers cannot reopen using an old token.

Committed outcomes reconcile that exact generation without repeating the destructive action. Proven noncommit permits a freshly fenced higher generation. Unknown outcome permits neither retry nor ready. A checksum-valid old or missing-guard backup cannot be relabelled to pass. Candidate timestamps/epochs/checksums are observations, not independent authority. No safe backup is an availability/RPO failure, not permission to resurrect deleted state.

## Required adoption

First durable account preparation and first root retention/tombstone capture need the same independent protocol as final fold, or another real authority that forbids a pre-clock restore. Otherwise a restore can erase the original deadline before any fold advances the floor. Preserve the original minimum clock; never restart it after external failure.

Pair the actual private adopter/finish/checkpoint and export producer fence. Gate startup, readiness, every request/claim/dispatch/protected write and already-running workers. Provider-level Auth/Data API/Storage, signed URLs and direct Native access require actual fencing; Node middleware alone does not close them. No provider API, managed Auth write or volume capability is inferred from these interfaces. Missing proof keeps real adoption denied.

`scripts/verify-restore.ts` keeps the original synthetic integrity fixture and adds real temporary-journal scenarios with explicitly synthetic trusted-adapter evidence. It is not a managed PostgreSQL/object restore or a live maximum-retention guarantee. The [backup runbook](BACKUP_RESTORE.md), [expiry operations](OWNED_AI_EXPIRY.md) and [adoption contracts](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/adoption-foundation-coordinator.md) retain the wider requirements. Deployment stays HOLD.
