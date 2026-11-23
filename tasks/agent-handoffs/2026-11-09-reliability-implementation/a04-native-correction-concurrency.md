# CR-A04 correction commit and concurrency

The service-role test reproduced a commit failure on the 99-operation schema. PostgreSQL raised `42501` while evaluating a deferred ledger trigger at commit. The trigger ran under the caller identity and could not read the sealed correction operation table. The earlier database-owner fixture completed because that identity could read the table.

The [forward migration](../../../supabase/migrations/20261121225300_correction_ledger_commit_identity.sql) makes the existing read-only validator run as its owner. It checks the exact predecessor body, owner, empty search path, permissions and five deferred trigger bindings before changing the routine attribute. The validator body and ledger table permissions stay the same.

## Local results

The [100-operation packet](managed-schema-correction-commit-identity-successor-100.json) replayed on disposable PostgreSQL 17.11 at dirty `main` revision `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. The [concurrency verifier](../../../scripts/verify-local-correction-concurrency.py) used the same native JSON Schema function as the earlier [source parity run](a02-native-source-closeout.md).

```sh
python3 scripts/verify-local-correction-concurrency.py \
  --pg-bin <postgresql-17-bin-directory> \
  --jsonschema-library <local-pg-jsonschema-shared-library>
```

The controller observed the waiter blocked on the holder's advisory lock in all four races. It then let the holder commit. The correction calls used the service role.

| Race                                             | Observed outcome                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Two identical corrections                        | One application created the original version and one corrected child. The waiter received the same receipt marked as an idempotent replay. |
| Different keys captured at the same initial head | The waiting correction returned a conflict. One application and one corrected child remained.                                              |
| A newer correction event committed               | The waiting save returned a conflict and persisted no canonical version or correction application.                                         |
| A deletion request committed                     | The waiting save returned `not_found` and persisted no canonical version or correction application. The deletion remained queued.          |

A separate commit with an invalid assignment raised `23514` and left only the original operation. The verifier also checked that anonymous, authenticated and service roles could neither execute the private validator directly nor access the sealed ledger tables. The [sequential provenance verifier](../../../scripts/verify-local-canonical-corrections.py) passed again on the new packet. All 234 focused tests passed across eight files. The test sessions and disposable clusters were removed.

Managed transaction and concurrency verification, the authenticated CV04 journey, export, and release acceptance remain open.
