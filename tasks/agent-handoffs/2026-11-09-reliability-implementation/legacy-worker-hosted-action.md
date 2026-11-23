# Proposed Supabase compatibility repair

Status: source reviewed and local application gate passed; **owner approval pending for hosted changes**. Web and worker deployments remain stopped. The target is the existing configured Supabase project matched in the [native preflight](r11-native-schema-preflight.json).

The cancellation route now rejects database errors and unknown responses with a retryable 503. Previously these could become a false 404 or success. The actual reproduction had eight failures and five passing controls; the fixed route passes all 13. The integrated Node 22 gate also passed full typecheck, lint, web build and worker build, with 689 stable source inputs. [Receipt](legacy-compatibility-integrated.json).

The proposed database operation applies only [migration 20261110101800](../../../supabase/migrations/20261110101800_legacy_worker_compatibility_bridge.sql), SHA-256 `a54196112e51a5109ccc143ac20887568bec2e7021dd98328312ba615d69d418`:

1. Repair `transition_analysis` to the current required state graph.
2. Repair legacy `release_analysis_job` so terminal, expired, unknown or token-protected leases cannot be retried by that caller.
3. Add or upgrade owner-scoped `cancel_analysis`, retaining its four established response states and refusing live or uncertain leases.
4. Remove the exact historical global AI-input unique index only if its full known shape matches. It is absent in the preflight. A new explicit rewrite retains a unique run UUID while its content hash may match an earlier request.

The migration checks known function bodies, signatures and permissions before changes. Unknown definitions abort. The transaction has local 10-second statement, 1-second lock and 15-second idle limits. Newer persistence/taxonomy routines, existing results and other pending migrations are outside this operation. It does not scan or modify candidate rows, claim work, call providers, start workers or activate flags.

After one application through the Supabase migration tool, run the [read-only catalog verifier](../../../scripts/verify-legacy-worker-compatibility.sql), SHA-256 `31666d5704c0d2b3fb3f7b0cd477dd066d2371b9aa5b7d8c87770bfef00aa136`, and confirm migration history. Require exact final bodies, restricted permissions, run UUID identity and compatible indexes. Stop on errors or drift. If the application outcome is ambiguous, inspect metadata/history before considering any retry; no automatic migration retry is approved by this packet.

This SQL has not been parsed, applied or executed. Applying it and checking catalogs will not establish actual cancellation/release behavior, races, global queue safety or full R11 acceptance. Those remain separate required checks.

Approval is needed because [the master plan, section 8](../../reliability-remediation-plan.md#8-commands-and-safe-targets) reserves managed DDL decisions at their actual boundary: “No such operation is authorized by reading this plan.” The [machine packet](legacy-worker-hosted-action.json) freezes the scope and stop conditions. This document itself grants no authorization.
