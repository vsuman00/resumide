# Broad regression: rewrite and scoring fixtures

Released two test repairs and this handoff. No production source changed. The original broad failure remains preserved in `owned-ai-privacy-broad-integrated-f26fa377-4e74-46c0-bcdc-57b56177a62b.json/.log`; Root owns the next integrated check.

## Diagnosis and reviewed transition

The canonical rewrite route now calls `readOwnedAiUsage` and `read_initial_feedback_usage`, using the strict thirteen-field shared usage reply and `INITIAL_FEEDBACK_PROFILE`. Its fixture still answered the old `read_canonical_rewrite_usage` RPC with the twelve-field canonical-only reply. Consequently the real handler correctly failed before dispatch, and the quota controls never reached their intended refusal. The fixture now supplies all three disjoint components, the actual current profile, and the exact new RPC. All eleven cases retain their status, recovery, dispatch, replay, argument, and ordering assertions. Only the exact counter RPC name changed in those assertions.

The two A09 typed cases required the temporary typed-JD pause and zero RPCs. A10 explicitly superseded that pause after the coupled owned reader, semantic producer, coverage, repository, route, and consumer passed their integrated gate. See [typed consumer closeout](a10-typed-consumer-closeout.md), session 71469, and the earlier [reviewed conditional transition](a10-typed-pause-regression-transition-review.json). Actual current/historical positive paths remain covered by `typed-score-repository.test.ts`.

Root approved replacing only these two cases with the strict missing-relationship-reader boundary. Their fake now returns explicit RPC error `42883`. They require the exact `RequirementRelationshipContextError`, reason `unavailable`, status 503, and fixed message `Relationship context is unavailable.` They also require exactly one relationship read with the selected canonical/JD IDs and exact owner/analysis, zero legacy engine calls, unchanged JD bytes, and the owned reader's original version selection. The error inherits `CanonicalError`, so the repository preserves it before the generic typed fallback. The other seventeen cases are unchanged. Old cases, message, and zero-RPC assertions remain in immutable baseline snapshots.

## Evidence

Packet: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-broad-backend-regressions-vqb5vwe2`.

- `finite.json/.log`: 24 passed and six failed. Four remaining fixture assertions still named the old counter after the response was corrected. The two typed cases initially expected the generic fallback message instead of the inherited reader error. These failures and their exact source snapshots remain preserved. Group 7704 closed.
- `affected.json/.log`: those six cases passed; twenty-four were unselected. Together the receipts cover all thirty cases, not a fresh thirty-case pass. Group 8383 closed.
- Final scoped types passed: three roots, 94 sources, zero diagnostics. Final lint and formatting passed. Groups 8382, 8384, and 8381 closed. The earlier static passes remain preserved too.

All commands used sealed Node 22.23.4, no dotenv, a 60-second deadline, and an 8 MiB log cap. Each receipt records 888 stable source inputs, exact arguments, log hashes, and confirmed process cleanup. No SQL parsing/execution, database, provider, service, browser, external compiler, Git, or deployment operation ran.

`preservation-proof.json` confirms all 120 rewrite assertion calls are unchanged after the exact RPC-name substitution. Replacing only the approved two-case block, its message declaration, and the new error-class import reconstructs the original score test SHA `d5605d0cbe47b61b67f23ce2326e93bdb9e88b9235c2257b2336d41619752b5a` byte for byte. The private baseline also preserves rewrite SHA `5a0d5d90f8019fd0b5a3c736c6b53f56cf4b89827b9815e741fa9227366d086a`.

Exact release hashes, snapshots, failed broad evidence hashes, receipts, and the author-source manifest are in `release-packet.json`. This repair supplies fixture/contract regression evidence, not Native, representative, feature, or release acceptance.
