# Durable account access implementation

2026-11-15. **SOURCE IMPLEMENTED; 87 focused tests and scoped lint passed.** Supplied base HEAD: `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, with synchronized dirty source in the separate frontend worktree. Only the five [access allocation](owned-ai-disposition-access-allocation.json) files, then the three [reader allocation](owned-ai-disposition-access-readers-allocation.json) files and this handoff changed. Root owns shared documents, Native code, profiles and integration. No Git mutation, database, SQL parser, provider, Auth operation, service or deployment ran.

## Ordered changes

1. Preserved a meaningful regression first: after durable preparation, failed/cancelled deletion requests still allowed old inline export downloads. The original route returned 200 instead of 404 in both cases; 21 existing tests passed. The five-file leaf adds strict `readCandidatePrivacyAccess`, uses it at both download probes, exposes loader `deletionPrepared` separately from request status, and distinguishes prepared deletion in the UI. Failed/cancelled requests before preparation remain nonblocking. Unknown authority never becomes unprepared.
2. A direct cancellation POST now verifies the owned target kind. Deletion cancellation requires available durable authority and an unprepared account; a prepared retry returns fixed 409 without calling the cancellation method. Export cancellation keeps its existing path. The UI hides only unsafe deletion cancellation. The backend's authoritative trigger remains required for direct REST and check/mutation races.
3. Froze the five-file source before the separately allocated reader leaf. Both actual canonical and job-requirement readers now call the same access helper. Existing ownership, source/root status, membership, version and private-client checks remain. Synthetic authority replies derive from the requested owner's deletion/disposition fixtures; they are not unconditional clear replies. No request-only fallback was added.
4. Root identified a timer-only deadline gap. A second meaningful regression advanced fake wall time beyond 5,000 ms without advancing timers, independently during metadata and access replies. Both returned clear; 52 other tests passed. The small approved amendment checks finite, nondecreasing wall time against the shared deadline at await boundaries, before the second RPC and before returning. Cancellation and the shared abort controller remain. Both failed receipts and the earlier frozen source are preserved.

The helper consumes the runtime-owned strict nine-field metadata schema and backend-owned actual six-string profile. It checks its own `accessExecutable` and source pin; export permission never substitutes for access permission. The strict four-field access reply must match the requested owner. Missing/denied/malformed/error/late replies return unavailable. Data/access grants remain denied by default.

## Evidence packet

Packet: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-disposition-access-work-6u44n22t`.

It contains allocations/contract, original preimages, stage-one and stage-two frozen copies, final eight-file postimages, exact controllers, logs, Vitest JSON and source-bound receipts. `final-source-freeze.json` binds the eight owned postimages; `release.json` lists evidence hashes and dependency limits. Controllers used pinned Node `v22.23.4`, an empty HOME, synthetic keys, dotenv disabled, OS network/env/Git denials and at most four test workers.

- First regression: `red-receipt.json`, two expected failures/21 passes; 807 snapshotted inputs, no drift.
- Deadline regression: `deadline-checks/red-receipt.json`, two expected failures/52 passes; 809 inputs, no drift.
- Final affected run: `combined-checks/green-receipt.json`, 87 tests/three files, zero failures/skips; 809 inputs, no drift. Command: pinned Node running `vitest run tests/unit/privacy-export-route.test.ts tests/unit/privacy-route.test.ts tests/unit/privacy-deletion-access.test.ts --maxWorkers=4`, with default/JSON reporters.
- Scoped eight-file ESLint passed without drift. Earlier scoped formatting/lint receipts remain. Every recorded workload group completed with cleanup confirmed; no check remains live.
- First `tsc --noEmit` found four nullable timestamp errors only in the read-only runtime adapter. Its owner supplied a type-only successor. The repeat compiler exited zero, but Root transferred a profile successor during that run: the receipt is correctly **INCOMPLETE due to dependency drift**. The eight owned files stayed stable. This is not stable full-candidate type acceptance. Root will check the combined current profiles; the 87 behavior tests were not repeated solely for metadata constant changes.

Current dependencies at handoff: export adapter `f1acee9bd962b00d4bbe78712149a7c429fb7a2514e8f0a667ec2c86bbdb8c3c`; disposition profile `28117a23e26b0b630e3e0e05dd51ac82936e8e5f2d462ca5528c0c92a18426b4`. The passing behavior run used the earlier actual profile `d5632c2ab22b9a19970ffbc13e3f5cac3b9530ea985f8cc64a9393efc6e6978d`.

Native clock/trigger/catalog/privacy acceptance, full purge, Auth/org disposition, physical artifacts and restore remain separate. This source leaf supplies none of those approvals. Prose cleanup preserved bytes; canonical links and owned-file whitespace were checked.
