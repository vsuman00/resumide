# AA8 corpus storage drill

Independent technical review of the integrated annotation module is complete with no blocking finding. Reviewed ROOT source `d3f7246c22f8bbbffc127646689468de752d9b0ab20b43a6e7e10c4dd0509c2c` and tests `09ee9c5a1291bc91608da34cb268a8df4b03c725044955e5f7b47afd5829c684`. Actor identity, agreement math, undefined agreement, original submission and adjudication bindings, trusted exact-evidence authorization, and the solo-development evidence boundary were checked. No extra annotation test run was needed.

The separate drill module uses injected storage and audit ports. It does not create a filesystem database, schema, account or Supabase connection.

Initial port/unit baseline (superseded by the race correction below):

- `app/lib/server/evaluation-corpus-drill.ts`: `74135c02b14fade2477716c7cc5818192a0f951246b784a2a1ade3eba75e9cd8`.
- `tests/unit/evaluation-corpus-drill.test.ts`: `d80039e3cc4f31baed3bfb6e2354b205a1dc82e830d07b43ba65beac7bd26e18`.

`EvaluationCorpusDrill(scope, ports)` reuses the frozen corpus metadata assessor and lifecycle transition helper. Its trusted scope contains opaque run, organization and owner IDs; keys are generated beneath that exact organization/run. It admits at most eight objects of 256 KiB each, checks supplied and downloaded bytes against the declared SHA256, refuses preexisting keys, and disables upsert. This is a bounded lab session, not a general corpus persistence service.

Intake, read, revoke, remove and cleanup return fixed result codes. Wrong actors, missing groups, revoked or expired permission are denied before storage reads. Allowed reads require an audit intent and a persisted terminal audit before returning bytes. Revocation remains effective if audit persistence fails.

Attempted keys are retained before upload to reconcile partial writes. Removal checks expected owned bytes and verifies absence through a subsequent positively identified not-found response. A successful remove response alone is insufficient. Unknown/auth/transient errors remain unresolved; changed objects are preserved. Pending uploads cannot produce a verified cleanup receipt. Privacy cleanup can proceed during an audit outage, while failed audit receipts remain available for retry. Local receipts contain hashes and fixed metadata; the exact key inventory is private cleanup data.

Verification: Node 22 with `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic` ran the focused Vitest file: 15 tests passed, exit 0, 153 ms. Targeted ESLint, Prettier and whitespace checks exited 0. All storage/audit operations in these tests were in-memory controls. They are not live storage or physical deletion evidence.

The coordinator authorized preparation of a separate direct-Supabase synthetic drill with existing private storage and `audit_events`, existing guarded account/ledger helpers and exact cleanup. Execution still requires coordinator allocation after the packet is reviewed. No hosted operation, provider call, migration, Docker operation, real data or AA7 rerun occurred in this slice.

## Read/revocation correction

The coordinator found a concrete in-flight access race. The original `74135c02` implementation checked rights before awaited audit/download operations but could still return bytes after revocation. The focused deferred-download test reproduced this with exit 1. Its retained log is `2026-11-07-aa8-corpus-drill-read-race-red.log`, SHA256 `652e21724319f798beff3c6facf01de69ef7f17deae7f80840ddd5f17eddffd0`.

The minimal correction rechecks current entry identity and eligibility after the terminal audit finishes, immediately before returning bytes. The same focused test then passed, exit 0 (140 ms), log SHA256 `8b868b88136eca6a5fd375f1a199d1c59fd196340eeb6f74c6cd3888fc246954`. A separate deferred-download check verifies bytes are withheld after actual injected deletion; it passed, exit 0 (142 ms), log SHA256 `9dcb3a66d997d0967cef763a5c57b0e04f14c89b32a1a5da807d0e8edf36c23d`. These filtered runs did not rerun the prior 15 green cases; no test declaration was disabled.

Corrected frozen source: `08701658b80cfc7db9e0282cdab7f4bc33431ca48a3c05c72e6904fd12c75aeb`. Corrected 17-case unit file: `61a92a0cf9d3b80b35c897fb5225c70ec40dc4d8d7e4695bc6ff598f722dd075`. Targeted lint and formatting passed. All observations remain injected controls.

The owner subsequently stopped deployment; the coordinator also placed managed Supabase execution on hold. `scripts/verify-evaluation-storage.ts` is preparation only and has not run. It requires the private mode, explicit live flag, managed-target guard and a fresh private ledger. Its result reserves independent exact storage-metadata verification because a storage not-found response can conceal access failure. The earlier Node 22 launcher disappeared before formatting this new script; the coordinator is restoring the exact runtime. No independent installation or hosted operation was attempted.
