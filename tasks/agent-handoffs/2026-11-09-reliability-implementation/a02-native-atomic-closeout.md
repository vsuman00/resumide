# CR-A02 grouped import transaction repair

A valid grouped import returned `unavailable` on the 93-operation local schema. A temporary diagnostic copy of the writer exposed PostgreSQL error `42702` in `private.entry_association_group_active`. The table alias `m` collided with a PL/pgSQL row variable when the writer built the active association snapshot. The original function and application-facing response were left intact during diagnosis.

The [forward migration](../../../supabase/migrations/20261121225100_entry_association_member_alias_resolution.sql) qualifies the aggregate with a distinct alias. It refreshes ten dependent readiness bodies in the same transaction. The initial alias-only patch passed the writer assertions and made the disposition profile unavailable. The final patch preserves the full chain by checking the exact predecessor and successor body hashes, routine attributes and role access.

## Local verification

On dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, disposable PostgreSQL 17.11 replayed the [98-operation schema packet](managed-schema-entry-association-alias-successor-98.json). The packet uses the same upstream JSON Schema function as the [source grouping run](a02-native-source-closeout.md). Materialize the exact ordered inputs with the following command.

```sh
python3 scripts/materialize-managed-schema-successor.py --entry-association-alias-repair <new-directory>
```

The [historical transaction verifier](../../../scripts/verify-grouped-original-admission.sql) has SHA-256 `d3b3e9f2b62939f7420db7aa8bac86a07deeaf36b69845b34d3dc347d79c5201`. Its original 51-operation readiness pin returned false on that prefix of the materialized successor, so that attempt stopped before fixture writes. The final local run adapted only the admission scope, the exact installed readiness fingerprint and the synthetic Storage path. It independently checked a private Unix socket and the fresh data directory, used the existing Storage key constructor, and kept every transaction assertion. The application roles continued to lack execution permission for the writer.

The verifier observed one approval and version, two origin groups and six source members. It checked rollback after a deliberate write conflict, rejection of an unsafe original and stale or foreign scope, exact replay through subsequent changes, and refusal through ordinary save. Confirmation and renaming kept the valid links. An edit retired the affected group, and restore reinstated the target links without reapproving history.

All 11 structural readiness checks returned true before and after the repair. Reapplying the migration refused the changed preimage. The transaction rolled back, the five checked fixture inventories were empty, and the disposable cluster stopped. All 270 focused tests passed across nine SQL-contract and repository files.

## Concurrent replay and deletion

The [local concurrency verifier](../../../scripts/verify-local-grouped-import-concurrency.py) replays the exact 98-operation packet into a fresh PostgreSQL 17 cluster with a private Unix socket and no TCP listener. It binds the frozen synthetic command to fresh fixture identities and uses the upstream JSON Schema function. The verifier confirmed that application roles still lacked permission to execute the grouped writer.

```sh
python3 scripts/verify-local-grouped-import-concurrency.py \
  --pg-bin <postgresql-17-bin-directory> \
  --jsonschema-library <local-pg-jsonschema-shared-library>
```

Two independent PostgreSQL sessions exercised each race at read committed. A controller connection verified the waiter was blocked on the holder's advisory lock before releasing the holder.

| Race                                    | Observed outcome                                                                                                                                                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two identical commands                  | The first session saved the import. The waiting session received the same version and batch as an idempotent replay. One version, one head, one approval, two groups, six members, six facts, two active links and one import audit event remained. |
| Deletion queued while the import waited | The waiting import returned `not_found` after the deletion committed. The deletion request remained queued. The import created no version, head, approval, members, facts, links or audit event.                                                    |

The concurrency run passed on PostgreSQL 17.11 at dirty `main` revision `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, with the same local native library as the source parity check. Both client sessions exited and the verifier removed its temporary cluster. Managed replay and concurrency, authenticated browser acceptance and release approval remain open.
