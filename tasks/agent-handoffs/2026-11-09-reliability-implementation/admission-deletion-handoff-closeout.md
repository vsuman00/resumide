# Adopted uploads in the durable deletion plan

CR-R17-S10 transfers an adopted upload's exact Storage obligation before database preparation removes the source. Under the live deletion claim and owner lock, it rechecks the whole captured inventory. Adopted uploads need a current source binding and a matching plan key. Unadopted uploads need a verified request-bound absence receipt.

The handoff stores the exact adopted upload IDs and a hash of the canonical deletion plan. A private transaction marker allows only the sealed preparation's database step to advance. The marker is cleared before the RPC returns. The existing preparation still owns the durable account write barrier, object plan, and source deletion transaction. If any preparation step fails, those changes roll back together. The legacy entry point cannot use the marker on retry.

The worker checks every adopted key against the returned plan and supplies its recorded bucket and object ID to the Storage verifier. It records exact-key absence on the current claim and skips already verified adopted receipts on retry. The sealed account-completion guard continues to hold while admission records remain. Uncertain or unavailable source evidence continues to hold preparation.

The [PostgreSQL 17 fixture](admission-deletion-handoff-native-fixture.py.txt) reproduced the legacy hold for a fully bound adopted source. It then verified the sealed preparation and completion functions with the new handoff. It checked rollback after plan insertion, receipt identity, stale attempts, the durable write barrier after failure, and owner export. The fixture used synthetic supporting relations and accounting adapters. Application tests used synthetic Storage responses. [Verification receipt](admission-deletion-handoff-evidence.json).

All 130 focused tests and all 6,800 integrated tests passed. Formatting, typecheck, lint and both builds passed. Lint reported four existing warnings. The [90-migration inventory](managed-schema-inventory-90.json) pins the new local successor. Exact removal of admission ledger records and managed verification remain open.
