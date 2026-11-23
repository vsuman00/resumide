# CR-R16 accounting disposition type repair

The normal service-role deletion preparation call failed for an account with a source-bound Build reservation. PostgreSQL raised `42846` when disposition capture passed a generic record to a function that requires an accounting table row. The same capture routine runs during resume retention. [Retention decision](../../../docs/decisions/0020-owned-ai-accounting-retention.md)

The [forward migration](../../../supabase/migrations/20261121224900_owned_ai_disposition_typed_budget_row.sql) uses the exact accounting row type in the budget loop and updates the dependent catalogue seals. The producer records, source checks, grants and retention rules keep their existing semantics.

## Verification

On dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, the same [native fixture](cr-r16-native-budget-disposition.sql.txt) reproduced the failure before applying the repair and passed after it. Disposable PostgreSQL 17.11 used synthetic Auth and Storage structures. The fixture created its two reservations through the actual source-bound budget RPC and made no provider request.

- Account deletion captured a Build reservation without a resume root, removed the owner's profile, and preserved the second owner's data and reservation. The next worker attempt kept both the original preparation time and the 720-hour deadline.
- Resume retirement captured the second owner's exact rewrite source and its deadline from the retention item. The application removed the resume after the fixture supplied a synthetic Storage-absence receipt.
- The private routine remained unavailable for direct service-role execution. The existing expiry readiness result stayed the same. The repaired routine reported zero lint errors, and rollback removed the fixture Auth, request, and disposition rows.

The intermediate fixture tried to resolve a private routine name while operating under the service role and was refused by the schema boundary. The final fixture checks that role's grant through the database owner's catalogue. All 111 focused tests passed.

| Artifact                | SHA-256                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| Forward migration       | `0c8135c82d8b5b81d6360c3905df62b3ad4c5698eac50487a088d86c0b3afe5a` |
| Runtime failure receipt | `397e44a1aee153d866743091481482abd8e901a76880787ba7cfe2870e3080d3` |
| Native passing receipt  | `ffc4c37e8e6c21959beb832757b95201a96e0e0745c9d7cf7d82eff64c45b12f` |

The [96-operation packet](managed-schema-disposition-successor-96.json) materializes with `--disposition-repair`. All 95 preceding copies and their ordered digests were verified unchanged. The retained-account expiry path, hosted schema and application adoption, browser cutover, and managed restore require their own evidence. This run covers preparation and root disposition on a synthetic database. Managed Storage, account erasure, and expiry were outside the run.

The original native receipt omitted operation 94. The subsequent exact 96-operation replay reran and passed the same disposition fixture with that operation in place. [Exact packet receipt](r16-managed-lint-expiry-closeout.md)
