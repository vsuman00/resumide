# Isolated Supabase schema validation

Status: **AWAITING TARGET AND OWNER APPROVAL.** Source preparation is verified locally; SQL is unparsed and unexecuted. No hosted project has been queried or changed for this packet. Deployment remains HOLD.

## Proposed action

Use a separate, empty managed Supabase project under the owner's exclusive control. The configured/deployed project is excluded. Confirm the actual project reference, organization, status and exclusive use before any SQL. A passing empty-data check is a snapshot, not proof of isolation or permission.

The [machine-readable action](native-schema-action.json) pins all operations. The [inventory](native-schema-migration-inventory.json) contains **80 migrations, 4,881,432 bytes**, in lexical filename order. Its entry-manifest SHA-256 is `d06fee1354e5977cddcbd14771a69f77050b3882480e4d6fb0aa0e301570013c`. The base HEAD is `a0b239299d75b0bd64b588fe743ebe2975fb28b9`; the worktree remains dirty and unpublished. Approval must identify this exact packet and target.

1. Confirm target identity through the Supabase project metadata and the owner's exclusive-use record. Project creation, a development branch, cost or capacity inspection and spend are not currently approved. If provisioning is needed, obtain the actual organization-specific quote and owner approval first.
2. Run [the empty-target preflight](../../../scripts/verify-empty-supabase-target.sql) with `supabase.execute_sql`. It requires PostgreSQL 17, ordinary managed Auth/Storage tables, zero users/objects/buckets, no public/private application relations and no application migration-history rows. It uses a read-only transaction, finite timeouts and refusal of RLS-filtered counts. Results contain aggregate metadata only. Expected file SHA-256: `a98e1326e1ed13a8333b382b7659b8292e1dccee27bba25f343738b452d04cba`.
3. Rehash and apply each exact migration with `supabase.apply_migration`, sequentially and once only. Use the recorded `validation_<local-version>_<hash-prefix>` name. After each operation, read migration history and record the local path/version/hash, actual provider name/version and outcome. The tool has no version argument; matching local and remote timestamps must not be assumed. Do not use history repair or an unreviewed CLI push.
4. Run [the catalogue verifier](../../../scripts/verify-jd-clause-order-catalog.sql) with `supabase.execute_sql`. Expected SHA-256: `5fceed10fa4e97ca6c3839690c42ad6297ccd6a737998f316c5e153e7c77e21e`. It checks all 23 new function bodies and their attributes, owner, search path and permissions, the 44-entry source manifest plus its checker, and trusted readiness metadata. Expected result: schema ready, application/service-role execution of the new JD clause-order writer denied. Output is metadata only.

The exact historical migrations include grants and reference/policy metadata seeds. This packet does not claim that all historical writers are denied. It authorizes no extra grants, blanket revokes, writer activation, application connection or fixture creation. Keep the target unused by servers and workers.

## Stop and recovery

Stop before writes if target identity, exclusive use, source hashes, emptiness, version or approval is missing. Stop subsequent writes on any SQL error, ambiguous response, unexpected operational effect, migration-history mismatch or catalogue failure. Preserve the last verified migration and sanitized error class. Inspect actual history and catalogues read-only before proposing a causal repair; never blindly retry, reset, delete, recreate or repair history. Target disposal requires separate authorization.

The earlier [legacy-worker action](legacy-worker-hosted-action.md) concerns a separate application of the legacy bridge on the existing configured project. The same bridge is migration 45 in this fresh-project inventory. It remains pending and unexecuted. Approval of this isolated packet does not approve that action.

## Evidence and limits

The [integrated review](native-schema-integrated-review.json) reconciles the source gate, its log and all 1,003 bound inputs: **24 passing tests in two files**, no failed or pending cases, scoped test formatting/lint and full type checking. All 985 prior raw source inputs and all 80 migration files are unchanged. Four command groups and the controller are absent. Backend/runtime packets preserve failed attempts under `native-schema-backend-evidence/` and `native-schema-runtime-evidence/`.

Web/worker artifacts and the earlier 434-case application checkpoint are carried evidence, not newly rebuilt or retested here. No SQL parser, database operation, provider, browser, worker, PDF/LaTeX compiler, Docker database, credential read or deployment ran. The two SQL files remain drafts until actual PostgreSQL execution verifies them.

Schema success will be reported only as **SCHEMA_ONLY_SUCCESS**. It cannot prove actual authoring transactions, ownership/RLS denial, replay, races, rollback, storage, browser journeys or consumer acceptance. Those require a subsequent bounded execution packet. The [browser prerequisites](native-schema-browser-frontend.md) and [ten future consumer cases](native-schema-consumer-cases.json) remain NOT_RUN; existing fixtures do not establish the new mounted journey.

## Approval boundary

The [master plan, section 8](../../reliability-remediation-plan.md#8-commands-and-safe-targets) reserves hosted schema changes and provisioning for explicit approval. The current source-only authorization does not cover this new database operation. A project reference and owner approval are required before SQL execution; silence or a selected but unsubmitted option is not approval. No keys should be shared in chat.

Parent statuses remain **2 VERIFIED, 42 PARTIAL, 20 PLANNED** across the same 64 tasks. No parent task or release gate closes from this source packet. Services remain free; pricing and deployment remain deferred.
