# CR-A02 saved-entry regroup comparison repair

On the 98-operation local schema, a valid saved resume returned an unavailable preview and the first regroup command failed. A diagnostic copy of the writer exposed PostgreSQL error `22P02`. The comparison resolved subtraction before the JSON lookup, so PostgreSQL tried to parse the key name `head` as JSON. Both the workspace reader and the writer used that comparison.

The [forward migration](../../../supabase/migrations/20261121225200_entry_regroup_head_comparison_resolution.sql) completes the lookup before removing private fields for the comparison. It pins both corrected bodies and the ten dependent readiness bodies in one transaction. It preserves existing reader access and writer restrictions.

## Local verification

Disposable PostgreSQL 17.11 replayed all operations in the [99-operation packet](managed-schema-entry-regroup-head-successor-99.json) on dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. The run used the upstream JSON Schema function from the [source parity check](a02-native-source-closeout.md). All 11 structural readiness checks returned true.

The [local verifier](../../../scripts/verify-local-entry-regroup.py) reads the frozen [transaction fixture](../../../scripts/verify-entry-regroup-admission.sql). It adapts the local catalogue pin and synthetic Storage key, fixes operand grouping in two fixture expressions, and clears existing deferred trigger events before installing the fixture's forced-failure constraint. The original assertions remain in force. An added assertion requires a fresh preview while saving and retry remain gated.

```sh
python3 scripts/verify-local-entry-regroup.py \
  --pg-bin <postgresql-17-bin-directory> \
  --jsonschema-library <local-pg-jsonschema-shared-library>
```

The verifier passed both saved regroup operations, unchanged-layout approval, exact historical replay, stale-write refusal, and rollback after an injected write failure. It also exercised correction materialization, ordinary edits and restore, exact source and fact preservation, and historical reads when the current history exceeds its limit. The fixture rolled back with all four checked inventories empty.

All 310 focused tests passed in ten files. The earlier grouped first-import concurrency verifier also passed after sharing its local PostgreSQL startup code. Managed writer admission, authenticated browser verification, and release acceptance remain open.
