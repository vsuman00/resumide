# R11: selected worker schema readiness

2026-11-10. Source implementation over Root's 703 synchronized nonsecret inputs at main `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus preserved dirty work. Backend owns only the helper, two CLI files and this handoff. Frontend owns readiness/startup tests; runtime owns the read-only metadata RPC migration. No worker process, queue, provider, database, Docker, browser, real-document, credential or Git operation was run by backend.

| File | SHA-256 |
| --- | --- |
| `app/lib/server/worker-readiness.ts` | `4fe2084a2c67423ac2cf02dd2ccb99a6bf6defdabea163d6d8d080086b8b7ef1` |
| `scripts/run-worker.ts` | `b92cb12751e274f5b03745a50f1b99391f4f662f0a3f73150a3f4d0a3a57ce4b` |
| `scripts/run-worker-once.ts` | `59353a1d3f8b09138014994e016a805a1d44af3b403e483cb888711452f2009b` |

The helper retains its single-client call and the two legacy zero-row evidence/correction table checks. Optional configuration selects fencing and AI-budget capabilities. AI budget is selected only when both AI and its budget flag are enabled; its model and policy version must be configured and valid before dispatch. The CLI derives these options from existing server configuration, including `READINESS_TIMEOUT_MS`; no environment/default/flag change was made.

Selected capabilities call only `worker_schema_readiness(p_fencing,p_ai_budget,p_model,p_policy_version)`, with null budget identifiers when that capability is off. The response must have exact `worker-schema-readiness/1.0.0`, the selected booleans, ready iff failures is empty, and unique closed failure labels. Missing/denied RPCs, wrong echoes and malformed receipts fail before queue construction. Failure labels are bounded metadata; raw SQL errors, IDs, model/policy strings and credentials are not emitted in diagnostics. This is not an action RPC, reservation or provider probe.

One deadline covers both legacy reads and the selected RPC. The same internal signal is passed to every actual PostgREST builder's `abortSignal` method. Pre-aborted callers dispatch nothing; the deadline/caller abort rejects before propagating cancellation to the transport. Activity is checked after awaits, so an ignoring query's late success cannot authorize startup. Timers/listeners are removed on all outcomes. The default helper deadline matches the existing 2,000 ms setting; production CLI values come from the current bounded configuration.

Both real CLI modules await readiness and check shutdown before constructing `AnalysisJobQueue`. Startup failures retain a bounded no-jobs-claimed diagnostic. Once runtime begins, failures use a runtime diagnostic instead of falsely claiming startup failed before any work. Known startup cancellation exits cleanly; signal handlers are removed after completion. Existing worker shutdown timeouts are forwarded without launching any worker during this verification.

Frontend captured an actual missing-capability regression before changes: one failed/two original passes against old helper `629a6f2d…`. The old function accepted enabled capabilities despite a missing metadata RPC. Receipt: `/private/tmp/resumide-r11-readiness-tests-ndcmo0yn/baseline-red.log` with binding. No source swapping or artificial failure was used.

Frontend reports **19/19** against the exact released sources: 16 readiness cases, including the original two assertions, and three tests importing the actual CLI modules with mocked dependencies. They cover strict metadata, cancellation/deadline/ignored late response, failure before queue/claim and controlled startup ordering/signal forwarding. Its focused green binding is retained separately. Backend did not repeat that suite. Scoped ESLint/Prettier/whitespace and project-options no-emit types pass; types report zero diagnostics over 554 files/five roots. Root owns combined verification.

The SQL remains source-only and unexecuted. Catalog readiness does not establish actual admission/opening balance, provider reachability, queue isolation, schema migration correctness or concurrent operation. No recovery/claim/reserve/cleanup is used to prove readiness, and no default-off capability or release gate is activated by this packet.
