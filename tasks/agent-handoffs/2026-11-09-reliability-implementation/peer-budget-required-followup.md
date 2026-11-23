# Mandatory budget: A12 fixture followup review

Status: SOURCE ACK; no scoped finding. This read-only review covers the two files in `budget-required-runtime-followup-allocation.json`, under contract SHA256 `a41b99990fd04267017e823f21043b1965ba378057b83741a973b6cb7c7198d9`. Only this handoff was written. The original product Source ACK remains unchanged.

| Fixture | Allocated preimage SHA256 | Frozen successor SHA256 |
| --- | --- | --- |
| `tests/unit/canonical-rewrite-route.test.ts` | `780913a1828b5695aa82591ac831dc3bc9f7f70a1c0e00c484204c215d974e34` | `7ae0e74e0d63e386e1cf92e7e43ee80adcc907af416f4ac9bf4d2bd1400c71c8` |
| `tests/unit/canonical-rewrite-workspace.test.ts` | `208d19001f6f93942de9c11899394becbc1db034c4fee6dd4562ef4d8a4352fd` | `b5b67031e145ec9e02e900ff9c4dece25c6c7423bbbc62abb026b7400762d4b8` |

The positive route fixture now selects a synthetic technical policy explicitly. Both fixtures import the actual current `AI_BUDGET_SOURCE_PROFILE`, derive the real A12 scoped technical operation ID, check source reservation against the synthetic owner/source tuple and return binding-hashed receipts. The existing typed claim returns the nested technical dispatch receipt. Generic `ai_budget_reserve_next` and `ai_budget_claim_dispatch` throw rather than silently succeeding. The workspace fake handles owner-free readiness separately, validates owner/org/source for technical calls and retains its typed owner/analysis/privacy checks. No profile module mock or product bypass was introduced.

All 137 complete predecessor assertion expressions remain byte-present: 60 route and 77 workspace. Declaration/source-quote distinctions, stale or moved drafts, conflicting operation identities, pending states, known prior spend, unknown prior claims and method/ownership/consent controls remain. Added assertions require actual source reservation, forbid generic reservation/claim and order technical settlement before typed settlement.

The route's existing exact replay assertion permits only `prepare_canonical_rewrite` after the first response, despite changed known/unknown usage. It therefore excludes another reservation, claim or settlement, alongside its execute-once assertion. Workspace generation still uses actual initialization tokens, separately authorizes generation, replays the saved result once and preserves the initialized slot and canonical content. Its other AI-off initialization tests remain unchanged.

The author reports 40 tests across these two files and scoped format/lint passing. These are author checks, not peer execution. Root's earlier full unit/component receipt had 5,699 passes and seven failures in these two files; this handoff does not convert that failed receipt into a fresh full-suite pass. Root owns reconciliation and remaining integrated stages.

Both successor hashes were checked at review start and end. All five product modules and seven profile dependencies independently remain at the original frozen Source ACK pins in `peer-budget-required.md` (SHA256 `ceeca5513e8f944ded9b17ab7299092f1b8a079122cfb1af8e328440b02a2bf2`). No product changes, peer tests, SQL parsing/execution, Native/DB/provider calls, services, network, environment inspection or Git operations occurred. Native acceptance and the full 720-hour identity-erasure/fold lifecycle remain open.
