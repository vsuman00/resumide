# Owned AI disposition clock implementation

Status: IN PROGRESS; source-only implementation and synthetic verification.
Base: dirty main `a0b239299d75b0bd64b588fe743ebe2975fb28b9`.

The active owner goal is to complete the reliability plan with proper validation. This next dependent slice implements ADR-0020 first-preparation clocks, exact operation closure, durable barriers and mandatory owner-wide export. Full expiry, actual native behavior, physical erasure and release acceptance remain open. Existing contracts and historical migration/policy semantics remain authoritative.

## Ownership

- Coordinator: Root owns contracts, shared plans/context, migration order, source transfer, integration and final gates.
- Backend: a13_worker_stage, existing backend worktree; first map actual producer/checker/profile dependencies, then implement only an explicitly allocated successor.
- Runtime: a13_worker_startup, existing runtime worktree; propose exact disposition export/readiness and mandatory privacy adapter, then implement frozen wire.
- Reviewer: accounting_expiry_review; read-only adversarial review of durable access, first-claim clocks, exact closure and historical compatibility.

Discovery is complete. Root froze owned-ai-disposition-contract.json and backend/runtime/access allocation JSONs with exact preimages after synchronizing 892 safe source inputs. Implementation is authorized only for those files and ordered sub-slices; the backend CLI migration placeholder must resolve to a fresh exact path before content edits. Agents must not alter shared plans or another agent's files. Separate worktrees and exact transfers preserve dirty user work.

## Acceptance

One database clock starts at first committed durable account preparation or exact operation retirement claim. Expiry is exactly 720 hours later; retries, late settlement and restart cannot extend it. Account preparation captures all owned operations across organizations; source retirement captures only proven affected operations, including unpublished ones. Earlier deadlines win. Unbound historical R03/standalone Build cannot be guessed into a resume. Prepared deletion remains blocked despite failed/cancelled bookkeeping. Refresh affected real source/checker/profile pins without rewriting historical policy receipts.

Export is separately versioned, strict, bounded, owner-wide and mandatory even with flags off. Existing nine collections and old API shapes are preserved. Denial, malformed metadata, schema drift, truncation and unavailable transport fail closed. New data grants and expiry mutators remain denied pending their separate adoption prerequisites.

## Verification and boundaries

Reproduce meaningful regressions, run affected source/fake-RPC/DOM tests, then integrated typecheck, lint and web/worker builds. Preserve failed receipts and bind actual sources. SQL source checks are not parsing or transaction proof. Never substitute a JavaScript clock simulation for native proof.

Pinned Node22v22.23.4; sealed empty HOME without dotenv, OS network and root environment reads denied. No SQL parsing/execution/advisors, database/hosted writes, actual keys/PII/resume/provider calls, services/browser/compiler/Docker, dependency or workspace Git mutation, publication or deployment. Supabase is direct; never Docker database/reset. Deployment HOLD, pricing deferred, services free.

## Confirmed implementation findings

A post-preparation failed request can expose an older completed export through status-only Node checks. The access slice repairs both download probes and the privacy loader using a separate strict durable-access RPC, while preserving pre-preparation failed/cancelled behavior. Other canonical/JD readers follow in a separately allocated slice.

Changing the barrier renews the actual composed checker/profile chain. Stored A13 policy descriptors and hashes require explicit historical compatibility; fresh admission uses current readiness. The new metadata shape is separate from frozen feedback metadata: six profile strings plus three capability Booleans. Access authorization is distinct from export authorization.

Official Supabase changelog/reference were checked for the CLI invocation. CLI v3 has breaking behavior changes; the installed 2.117.0 remains pinned, with no upgrade or new platform dependency.

Access source wiring continues in a separately allocated three-file successor: canonical and JD repositories plus their privacy-access regression test. Stage-one source freezes before this successor; its real-profile validation remains pending. All old ownership/source/membership checks stay in place. Additional consumer fixtures require explicit allocation after an observed failure.
