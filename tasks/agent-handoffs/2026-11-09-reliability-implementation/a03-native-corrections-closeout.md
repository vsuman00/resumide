# Native correction provenance and materialization

The correction transaction saved the chosen value once as an unconfirmed fact with no retained citation to the old value. The original saved version and source citations stayed intact. The child snapshot linked the corrected fact through its application and assignment to the exact owner, actor, correction event, revision and extraction attempt.

The [local verifier](../../../scripts/verify-local-canonical-corrections.py) adds those stored provenance assertions to the frozen [correction fixture](../../../scripts/verify-canonical-correction-materialization.sql). It also creates a real replacement evidence attempt and verifies that the old original-import command returns a conflict without changing the current head or producing a new version. The frozen fixture remains unchanged. The wrapper adapts the private local admission, two synthetic Storage keys and the operand grouping in the fixture's command builder.

```sh
python3 scripts/verify-local-canonical-corrections.py \
  --pg-bin <postgresql-17-bin-directory> \
  --jsonschema-library <local-pg-jsonschema-shared-library>
```

The rest of the fixture proved that assignment alone creates no canonical version, a fact shared across two entries cannot be changed through an arbitrary target, and explicitly adding an absent field creates an unconfirmed fact. Confirmation preserved its application link. A manual edit cleared the affected link, explicit reassignment enabled reapply, and restore copied the selected snapshot. Identical replay preserved the current head. A foreign account was refused. The service role could read the ledger and could not directly mutate the correction operation table.

The [99-operation packet](managed-schema-entry-regroup-head-successor-99.json) ran on disposable PostgreSQL 17.11 at dirty `main` revision `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. The local Auth and Storage scaffold used the upstream JSON Schema function. The transaction rolled back and the four checked fixture inventories were empty. All 260 focused tests passed across seven projection, repository, schema and evidence files.

CR-A03-S02 and CR-C02-S03 retain their managed acceptance requirements. The local verifier was rerun after the service-role commit repair. Managed SQL and concurrency, authenticated consumer and export verification, and release approval remain open. [Commit and concurrency verification](a04-native-correction-concurrency.md)
