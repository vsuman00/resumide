# CR-R16 accounting export lint repair

The local lint run from the database CI cutover included one deliberately invalid function. With that function removed, PostgreSQL reported 89 error entries. Eighty-five used the application's rejection codes for invalid input, conflicts, unavailable capabilities, or access denial. Four reported database-level errors. They were an ambiguous budget export query, a record-to-composite cast in disposition capture, an ambiguous expiry balance, and a reference to the staged expiry adoption function. The [expiry scope](../../../docs/decisions/0020-owned-ai-accounting-retention.md) and its existing adoption gate still apply.

The budget export was reproduced outside the linter. Asking for the records of a fresh synthetic account raised SQLSTATE `42702`. The [forward migration](../../../supabase/migrations/20261121224800_owned_ai_budget_export_alias_resolution.sql) renames the conflicting aliases in the attempt and event queries and updates four dependent catalogue checks. The owner filter, record limits, volatility, and execution grants are preserved.

## Verification

On dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, disposable PostgreSQL 17.11 replayed the prior 94 operations and the forward repair. The [fixture](cr-r16-native-budget-export-alias.sql.txt) checked a fresh account with no operations. It then created two synthetic reservations through the actual source-bound budget RPC and verified that each collection returned only the owner's linked operation, attempt, and event. It also checked the null usage on the reserved attempt, unchanged ledger counts, and denied execution for service and client roles. The repaired routine reported zero lint errors.

An injected downstream grant change made the migration refuse the candidate and roll back its earlier edits. The first migration attempt exposed a JSON delimiter error, which was corrected. An intermediate fixture attempted raw ledger insertion and was correctly refused by source admission. The final fixture used the budget RPC and rolled back both synthetic reservations. All 68 focused export, disposition, and expiry tests passed.

| Artifact                | SHA-256                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| Forward migration       | `e486f80df59584096d6df2f5ace97f6b881b5b936b1556e412a379ac11fb76f3` |
| Baseline error triage   | `6053e1e5571a6d19fab4e69e269604f569e88d05e1f626796df0ed69aba1713e` |
| Runtime failure receipt | `f8f117bd6ced564e22b51157e2349935355c65ce65e0cfb32de042a714fc0091` |
| Native passing receipt  | `4c71ad7cc5eabf9b8a259b07221d755b5db5233e04695808d5a801221f05e607` |

The [95-operation packet](managed-schema-budget-export-successor-95.json) materializes with `--budget-export-repair`. Its first 94 operations are byte-identical to the current CI packet. The hosted CI receipt and runtime profile adoption still need the approved successor. The remaining lint findings, browser cutover, and managed restore stay open.
