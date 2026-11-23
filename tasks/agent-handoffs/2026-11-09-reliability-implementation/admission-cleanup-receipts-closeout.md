# Request-bound upload cleanup receipts

CR-R17-S07 gives the retirement path a durable receipt for each exact Storage absence check. The previous implementation accepted an old `cleaned` marker without showing that the current deletion request had issued the cleanup.

The worker's batch claim now issues a private receipt for each selected upload. The database accepts the verification only for the selected upload, recorded object ID, live request and issued attempt. It rechecks that the key is unreferenced before saving the timestamp. A newer claim must reissue pending receipts. A verified receipt retains its original timestamp and attempt when replayed, and gives no extra progress credit.

Older cleaned rows with acknowledged Storage writes are eligible for fresh verification. The worker still checks the recorded object identity and exact absence. Legacy or unacknowledged writes, adopted uploads and foreign-owned rows stay outside this path. Owner exports include the receipt status and verification timestamp with the existing deletion inventory.

The native regression reproduced acceptance of an unissued historical result on the prior SQL. The [PostgreSQL 17 fixture](admission-cleanup-receipts-native-fixture.py.txt) then verified issuance, reissue, identity and reference checks, stable replay, role boundaries and owner-scoped export. The integrated local application suite passed 6,792 tests across 323 files, formatting, typecheck, lint and both builds. Lint reported four existing warnings. [Verification receipt](admission-cleanup-receipts-evidence.json).

Account retirement remains held while adopted source and worker quiescence, unknown writes and exact ledger finalization are unresolved. Managed Storage was untested. The [87-migration inventory](managed-schema-inventory-87.json) includes the locally verified receipt migration and preserves all earlier pins.
