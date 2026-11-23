# CR-A01 managed fixture cleanup audit

The [read-only audit](../../../scripts/verify-managed-document-worker-cleanup.sql) checks the private upload, retirement and deletion records for the exact fixture. It also checks Auth, the application records and the Storage catalogue. The deletion write barrier must retain its original request and 30-day expiry. The one admission rate token is a separate technical record. The audit reports only the result, with no fixture identifiers.

## Run after the managed journey

Use the same approved target and private ledger as the [managed runner](cr-a01-managed-runner.md). Wait for its success receipt and both `auth_cleanup_verified` events. If it stopped earlier, follow the [reconciliation procedure](cr-a01-managed-validation-action.md) for the recorded fixture.

In a private psql input, set the following variables from the ledger. Use `psql -X -qAt -v ON_ERROR_STOP=1` with the target's private credentials, then include the audit SQL with `\i`. Keep the input and credentials out of logs, command arguments and task evidence.

| Variable              | Private ledger field                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `fixture_owner_id`    | `auth_creation_requested.ownerId` where the label is `owner`                                                   |
| `fixture_outsider_id` | `auth_creation_requested.ownerId` where the label is `outsider`                                                |
| `fixture_analysis_id` | `upload_accepted.analysisId` for that owner                                                                    |
| `fixture_request_id`  | `deletion_requested.requestId` for that owner, matched to `application_and_storage_cleanup_verified.requestId` |
| `fixture_storage_key` | `upload_accepted.storageKey` for that owner                                                                    |

The expected result has `schemaVersion: document-worker-post-cleanup/1` and `status: verified`. The audit uses a read-only snapshot with row-security filtering disabled so missing access fails the check.

## Verification

On dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, all 93 operations replayed in a disposable socket-only PostgreSQL 17.11 instance. The fixture used a local copy of the [native lifecycle](cr-a01-native-worker-lifecycle.sql.txt) with a real rate-limit RPC call, a commit after sealed deletion, and deletion of both synthetic Auth rows. Auth and Storage used PostgreSQL scaffolds. The actual database functions handled admission, leases, evidence and sealed deletion.

Seven checks passed. The audit accepted the completed fixture and ignored a different Storage key. It refused retained Auth, an exact Storage residual, a mismatched deletion request, an invalid path and an unexpected rate-token count.

- Ordered migration digest: `310f2c7174f4b6f9ab69bd38fc59b6d84ffeabdee55b2d2cdc5da6ffa034ed76`
- Audit SQL SHA-256: `261f722faa33625e7540d9094d73fd888118e6920a557d493dac0ce1be6d3197`
- Sanitized run log SHA-256: `1c7ddaf48d595bbd7210f2d4256782b5eb370f6c997cb476a64b9c8bd5db8ddb`

CR-A01-S08 remains partial. The ready audit still needs the approved managed Supabase run. This local check verifies the accounting deadline stored at deletion. The accounting expiry job and representative OCR acceptance have separate evidence requirements.
