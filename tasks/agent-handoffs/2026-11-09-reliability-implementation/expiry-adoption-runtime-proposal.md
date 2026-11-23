# Restore admission: proposed next runtime slice

Status: PROPOSED, SOURCE REVIEW ONLY. No implementation allocation, real restore, external authority, Native execution or adoption activation is claimed. The existing expiry client, CLI, profiles and handoffs stay frozen. The private expiry adopter/capability remains absent and destructive access denied.

## What the current source proves

`app/lib/server/backup-restore.ts` checks a v1 manifest's ownership and self-checksums. Its `createdAt` and `manifestChecksum` come from the candidate data. Neither supplies independent restore admission. The third case in `tests/unit/operations-readiness.test.ts` and `scripts/verify-restore.ts` exercise synthetic copies only. Preserve that API and every assertion.

`docs/operations/BACKUP_RESTORE.md` calls for maintenance, an isolated provider restore, object checks, ownership/lease checks and approved promotion. Its A4 live drill remains open. It has no independent monotonic floor or crash protocol. `scripts/server.mjs` starts HTTP serving without such a gate; `app/routes/readyz.ts` checks database reachability, which a rolled-back database can satisfy. Analysis workers perform schema readiness before queue construction; that check does not fence an already-running worker or a direct Native connection.

The new core, `20261115190341_owned_ai_expiry_fold.sql`, derives exact owner/selected work under locks and calls `private.owned_ai_expiry_require_adoption` before accounting updates or removal. It requires the migration-pinned private verifier and a transient exact scope witness. Its public sweep accepts only `p_limit`; it has no trusted external-generation argument. A service caller's Boolean, GUC, DB row or successful sweep response cannot fill this adoption gap.

## Independent authority and exact next ownership

Implement a real durable owner-free floor store and its quarantine controller, with disposable-filesystem and fault-injection tests. Propose exactly these five runtime files:

| File | Bounded change |
| --- | --- |
| New `app/lib/server/restore-floor.ts` | Filesystem-backed, strictly decoded append-only global generation journal with exclusive acquisition, compare-and-swap revision checks, fencing tokens and durable acknowledgements. |
| New `app/lib/server/restore-admission.ts` | Shared bounded pre-fold/restore quarantine and reconciliation controller. Explicit trusted fence and committed-checkpoint adapters are mandatory; no default allow implementation. |
| New `tests/unit/restore-floor.test.ts` | Actual disposable filesystem cases for durability boundaries, stale controllers, concurrency, malformed/torn records, missing authority and immutable generation assignment. |
| New `tests/unit/restore-admission.test.ts` | Fake control-plane/checkpoint cases proving event order, fail-closed recovery and rejection of old snapshots while the independent floor remains advanced. |
| Existing `scripts/verify-restore.ts` | Keep the original synthetic integrity result; add explicitly synthetic independent-floor admission scenarios using an isolated temporary journal. Never call this a managed restore drill or production floor. |

Root would own the paired runbook/contract update. The existing manifest helper and operations-readiness tests need no change in this slice. Production callers listed below are a subsequent explicit allocation, not hidden additions to these five files.

The concrete storage precondition is a coordinator-owned durable host volume outside every DB, application-image and object restore domain. Its access policy permits one trusted controller to advance state and permits admission readers only to read. The production path must be explicitly configured and validated; missing state is unavailable, never an automatic epoch-zero initialization. No project directory, temporary directory or candidate snapshot may become production authority by default. Initialization is a separate one-time controlled bootstrap, not a restore recovery action.

Persist only global protocol version, monotonically increasing generation, monotonically increasing revision/fencing token, and `quarantined` or `ready` phase. No owner, organization, operation, request, artifact selector, subject hash, timestamp or per-subject receipt belongs in the journal. A generation is assigned to one prospective transition and never reassigned to different work. The floor is never lowered, including when a DB transaction rolls back.

Use exclusive journal ownership and revision-checked append with file/directory durability acknowledgements before returning a successful transition. Reject symlinks, unexpected file type/permissions, corrupt or incomplete records, revision gaps and stale tokens. Do not automatically steal a crash-left lock. Recovery needs trusted proof that the old controller and all of its DB/control-plane effects are fenced before a successor takes ownership. A local read-check-write without exclusive acquisition is insufficient.

This implements durable ordering relative to a DB-only rollback. Filesystem code cannot detect replacement of the entire authority volume by a valid older copy. Deployment must prove that the volume is independently protected from restore/rollback and that its exclusive-owner mechanism remains valid across the actual host topology. A multi-host/shared-filesystem deployment without proven locking and durability needs a real linearizable monotonic authority adapter instead; ordinary shared files are not sufficient. Source tests cannot certify either operational property. Until those facts and the external fencing/checkpoint adapters exist, real adoption remains denied.

## Controller API and transition order

Proposed module methods are `readFloor`, `beginQuarantine(expectedRevision)`, `advanceFloor(token)`, and `publishReady(token, committedCheckpointProof)`. The controller exposes `beginFold`, `reconcileQuarantine` and `admitRestoredCandidate`. All operations take a bounded deadline and cancellation signal. Names are proposed TypeScript APIs, not existing RPCs. Cancellation must not undo durable quarantine or advance permission to serve.

`beginQuarantine` durably changes the global phase before any destructive work. A controller must then obtain actual external ingress/writer fencing and drain or revoke old-generation work. Only after that closure is certified may `advanceFloor` durably assign the prospective generation. Both quarantine and floor acknowledgement precede any fold. A stale controller cannot publish `ready`: every transition requires the current revision/token and current fence ownership. Recovery under a successor token never reassigns an old generation to a new fold.

The fold and a protected DB generation/checkpoint must commit in the same transaction. A later backend allocation must define that checkpoint and the actual bridge from independent authority to the pinned private adopter. It must derive trusted live server state; it cannot merely store a caller assertion in a rollbackable row. No DB filesystem/network extension, managed Auth write, superuser operation or provider permission is assumed. The current public sweep wire and source profile stay unchanged until Root freezes any paired bridge contract.

After the fold, `publishReady` requires a trusted acknowledgement binding the actual DB instance, committed generation and still-current ingress/writer fence. That proof must establish the required external closure as well as transaction outcome. It is transient control evidence, with no subject identities retained in the floor. Sweep counts, absence of an error, a candidate's claimed generation and a wall-clock timestamp are insufficient. Durable `ready` acknowledgement must precede issuing new-generation credentials/leases and reopening ingress. Failure at any point leaves quarantine in force.

| Failure boundary | Required result |
| --- | --- |
| Quarantine write, fence acquisition or floor acknowledgement fails or is ambiguous | No fold. Keep ingress closed; reconcile actual durable authority before proceeding. |
| Floor advances, then the DB transaction fails or its outcome is unknown | Never serve the old generation or lower the floor. Keep the prospective generation quarantined. Read actual commit/checkpoint authority under a newly fenced controller; do not blindly retry the destructive call. |
| DB commits but the response or external ready publication is lost | Remain closed. Reconcile that exact committed generation and fence, then publish ready with current CAS authority. Do not infer rollback or re-run the fold from counts. |
| Controller crashes or an old delayed callback resumes | Current token/revision and external fence reject stale publication or further DB work. A successor cannot recover merely by deleting a lock file. |
| Floor is unavailable, malformed, rolled back by the storage operator, or its independence cannot be established | Admission unavailable. No local reconstruction from the candidate database or manifest. |
| A checksum-valid backup predates the floor | Reject/quarantine it, including backups predating the new DB guards. Do not rewrite its generation to make it pass. |
| No provably safe backup remains | Stay closed. Record the availability/RPO limitation; do not recreate erased selectors or retain personal tombstones to replay deletions. |

`admitRestoredCandidate` also needs authentic checkpoint provenance for the actual DB/backup instance. Comparing a freely editable snapshot marker to the floor is insufficient. Candidate markers are observations to validate through the trusted adapter, never the authority. The floor stores no permanent backup hash or artifact identifier. This proposal does not select a provider attestation API that the repository does not currently have.

## Exact later pre/post-fold and serving integration

1. Wrap `scripts/run-owned-ai-expiry.ts` with quarantine/floor-before-fold and committed-proof-before-ready. Its current one-shot bounded no-retry behavior is preserved. Do not activate it by seeding an adopter before the complete bridge exists.
2. Pair the backend checkpoint, pinned private verifier and actual global fence with the existing exact current-transaction work authority. Check the generation/fence at dispatch and protected writes, not only in a Node pre-read. Original minimum expiry, owner-scoped closure and due-time validation stay authoritative; no new retention clock, renewed AI consent, membership or surviving content-parent prerequisite is introduced.
3. Gate `scripts/server.mjs` before `app.listen`, and keep each request behind actual current-generation ingress enforcement. Pair `app/routes/readyz.ts` with the independent authority and trusted DB checkpoint. DB reachability alone must not report ready after rollback.
4. Gate `scripts/run-worker.ts` and `scripts/run-worker-once.ts` before queue construction. Fence each subsequent claim, provider dispatch and protected write against current-generation authority so a running process cannot outlive quarantine. Do the same for privacy, retention and expiry workers before destructive claims/storage/API effects. Startup-only checks are insufficient.
5. The restore operator must quarantine before restoring a clone, withholding application credentials and all Auth/Data API/Storage exposure until admission succeeds. Gate promotion again immediately before opening. Cover existing sessions, signed URLs, direct Native connections, queued jobs and already-running processes through actual provider/control-plane capabilities. A Node middleware check does not close these paths. If the managed platform cannot supply and prove that fence, the adopter must remain denied; do not assume permission to edit managed Auth internals or revoke/kill arbitrary connections.

The first five-file slice supplies executable floor/controller behavior and failure evidence. It does not claim full expiry adoption without these paired producer, external closure and serving integrations. In particular, it must not return an echo witness or a permanent false-returning placeholder for the absent private verifier.

## Proposed finite evidence

Preserve the current positive manifest/ownership fixture. Add real temporary-journal tests plus explicit failure injection before and after every durable write, fence acknowledgement, DB commit acknowledgement and ready publication. Assert no destructive call before durable floor/fence, no automatic retry on unknown commit, stale-token rejection, quarantine after cancellation, and no ingress release from a successful count-only sweep. Include an old checksum-valid snapshot and a missing-guard snapshot; both remain quarantined under an advanced independent fixture floor. Do not simulate SQL conservation or call this Native/provider proof.

After allocation, run only the two new tests and the existing synthetic restore command, scoped format/lint, then Root's combined types/build gate. No test or application command ran for this proposal. No source/current handoff changed.

## Source bindings read for this proposal

Hashes are of the inspected runtime worktree, except the new migration is read from Root. They identify source evidence, not runtime acceptance.

| Source | SHA-256 |
| --- | --- |
| `app/lib/server/backup-restore.ts` | `b6583f47497084b92d3f91bd74b883d05ca516aa300ef6fd5e4a8080ad65ec14` |
| `tests/unit/operations-readiness.test.ts` | `6ed3a965b1b229dafcf1f469a45ffe216ecd2b296c0c4d5dc7e0aa84c794cb6b` |
| `scripts/verify-restore.ts` | `564d54caa931f789d63f47a88de6e039244c5f82dd6e868c39652ad5a27dfff1` |
| `docs/operations/BACKUP_RESTORE.md` | `fb0459c4c79851ee2597f02c54da41e8fb30efac1f359a434c50e1719b15dcf5` |
| `scripts/run-owned-ai-expiry.ts` | `6c076b574cdfe4f0651244c94dbca1149d1e2da743227aa17393442f93a40654` |
| Root `supabase/migrations/20261115190341_owned_ai_expiry_fold.sql` | `01c770432cfd5532b1a0f2d4bdc4d6a9d657c7a1ae5975b8c4b07cad06449a55` |

Boundary: source-only proposal. No Native/parser, DB, hosted, environment, network, provider, service, dependency, Git or deployment operation. Current real destructive capability remains denied.
