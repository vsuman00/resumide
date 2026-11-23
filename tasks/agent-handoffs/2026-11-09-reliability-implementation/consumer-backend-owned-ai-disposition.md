# Disposition consumer backend repair

2026-11-15, 19:25 IST. Released the three allocated test files plus this handoff from the backend worktree. Assigned base HEAD is `a0b239299d75b0bd64b588fe743ebe2975fb28b9`; Root's synchronized dirty source remains preserved. The prior fifteen-file clock/closure packet is byte-identical. No product component, migration, profile, assertion, threshold, test timeout or dependency changed.

The two SQL source tests confused historical golden values with the new current profiles. They now retain the exact historical scoring profile and compatibility-profile file bytes for every previous assertion, then separately verify the disposition migration's actual old/new checker bodies, declared postimages and current TypeScript profiles. The old policy and source goldens remain unchanged. These are delimited text/JSON checks, not SQL parsing or Native behavior evidence.

The TTL failure was a test synchronization error. Its RPC double appends to `applied` before returning or rejecting, while the component removes the old preview after receiving ambiguous-error feedback. A deferred apply-result gate reproduced the original null-checkbox failure deterministically: the request had entered the RPC, but its response remained unsettled. That bounded RED passed the other seventeen cases.

The corrected test explicitly checks the pending state, releases the gate, awaits the actual ambiguous feedback, then retains every original storage/TTL/null-checkbox and unchecked-review assertion. The gate is released in `finally` too. Pending-state observation also confirms the existing component resets the checkbox and disables retry while saving. No timing delay or relaxed deadline was added. An intermediate new diagnostic expected a checked box; the actual safety reset disproved it, and the failed receipt remains preserved alongside the corrected explicit false/disabled assertions.

Final affected run: **44 tests across three files passed, zero skips**. Scoped ESLint and Prettier checks passed. The existing React Router hydration-fallback warning remains visible; no suppression was added. No full suite, typecheck or build was repeated.

Receipts, logs, exact preimages, frozen sources and release manifest are in `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-disposition-consumer-backend-c1ry59co`. `groups-and-receipts.json` binds all five process groups; all are absent. Pinned Node22, explicit fake environment, empty HOME, private verification mode and OS network/env/Git-write denials were used. Every command's source manifest stayed stable.

Root owns the next combined gate. No SQL/DB/hosted/provider/service/browser/native-compiler/Docker/dependency/Git mutation or deployment ran. Required local prose inspection and cleaning preserved this handoff's bytes.
