# CR-A01 managed validation action

## Target and SQL

State: awaiting an empty, dedicated Supabase project and owner approval for this exact packet. The latest read-only inventory found the shared Resumide project active with zero development branches. The worker and privacy claimant scan their entire respective queues, so this run requires exclusive use of the test project.

- Ordered digest for the [93-operation successor](managed-schema-worker-successor-93.json) is `310f2c7174f4b6f9ab69bd38fc59b6d84ffeabdee55b2d2cdc5da6ffa034ed76`.
- [Empty-target SQL](../../../scripts/verify-empty-supabase-target.sql) SHA-256 is `a98e1326e1ed13a8333b382b7659b8292e1dccee27bba25f343738b452d04cba`.
- [Worker post-replay SQL](../../../scripts/verify-managed-document-worker-ready.sql) SHA-256 is `e5f3657e4ae2dd23f4ab585044c611278c5a322560186c21f127ea994be43eb4`.

Use the target identity, exclusivity checks and per-operation migration receipts in the [managed schema procedure](native-schema-action.md), with this successor as the operation list. Materialize exact SQL into a new directory with `python3 scripts/materialize-managed-schema-successor.py --worker-lifecycle OUTPUT_DIRECTORY`. The [91-operation manifest](managed-schema-clean-successor-91.json) gives operations 1–91, and the worker successor gives 92–93. After replay, run the read-only worker post-replay SQL. It checks empty queues and Auth/Storage, the private resume bucket, the worker and page-count profiles under the service role, and the permission and catalogue prerequisites used by cleanup. The result describes a point-in-time check.

## Consumer test sequence

1. Start the local app on loopback against the dedicated project. Use `ANALYSIS_ADMISSION_BINDING_ENABLED=true`, `ANALYSIS_FENCING_ENABLED=true`, `EVIDENCE_REVIEW_ENABLED=true` and `NATIVE_EVIDENCE_ENABLED=true`. Disable AI and optional provider features in the app and worker. Keep the dedicated project credentials in the test process environment. Keep temporary owner and upload identifiers in the private fixture ledger before submitting changes.
2. Sign in as a synthetic owner and submit a two-page fixture with one blank page through authenticated multipart `POST /api/analyze`. Use the existing [synthetic PDF generator](../../../tests/fixtures/native-pdf.ts). Verify the response identifies an owned, quarantined analysis and the recorded source points to the exact Storage object and uploaded checksum.
3. Acquire the fixture's first lease with `claim_analysis_job_v2` and a short expiry. Allow it to expire, then invoke the [normal one-cycle worker](../../../scripts/run-worker-once.ts) against the same project. Verify the next attempt used a new fence, the PDF crossed the production extraction path, and the count on the exact resume version includes the blank page. Verify the owner can open the evidence page and the second account receives a private 404 without the fixture evidence. Verify the review handoff clears the queue without a score or AI run.
4. Submit the privacy deletion form as the synthetic owner. Record the HTTP request correlation ID before submission and match it to an audit event and one queued deletion for that owner and organization. Run the [privacy worker cycle](../../../scripts/run-privacy-worker.ts). Verify exact-key Storage absence and the bound request outcome, then verify application, job and admission-ledger residue for the fixture. Verify synthetic Auth cleanup separately. Distinguish the retained owner write barrier from leaked test data and preserve its normal retention policy.

Retain one receipt per operation and stop on unexpected identity, live foreign work, ambiguous mutations, failed readiness or unverified cleanup. This action remains pending on the managed target. The new post-replay SQL passed on the full local PostgreSQL fixture and refused seeded Auth, bucket and retirement-role drift. [Local verification receipt](cr-a01-managed-validation-evidence.json)
