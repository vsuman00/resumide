# CR-R16 managed two-session correction verification

The [managed correction runner](../../../scripts/verify-managed-db-concurrency.ts) uses the reviewed evidence fixture and the same target and schema checks as the rollback runner. It records exact synthetic identities before committing the fixture. The run ID determines those identities so they can be reconstructed if the private workspace is lost. Setup checks the empty target while holding table locks. Cleanup matches the synthetic Auth identity and verifies that the exact owner, organization, analysis, evidence and correction rows are absent.

The second connection must be visibly blocked on the first before the first commits. The runner then requires revision 1, a conflict for the stale request and exactly one correction row. Failure also enters cleanup. [Operator command](../../../docs/operations/MANAGED_TESTING.md#run-the-two-session-correction-check)

## Verification

On dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, all 100 managed-target and runner tests, typecheck, scoped lint and formatting passed under Node.js 22. The npm command exited 2 without a managed scope.

The 93-operation packet plus the legacy claimant fix ran on disposable PostgreSQL 17.11. The actual runner SQL, lock observation, and both writers used private Unix-socket connections. The check returned success and no fixture owners, analyses or corrections remained. A second run deliberately failed the second client after committing the fixture. It returned a race failure with cleanup confirmed. Reusing the completed ledger was refused.

| Artifact           | SHA-256                                                            |
| ------------------ | ------------------------------------------------------------------ |
| Correction runner  | `6ea85616f8a7b288cc0c627423f650546f59c44b38e8fb7ef3b36c81d1c5235f` |
| Native receipt log | `239fe7db9699af2b1d536f2b909c11233ef0a5442ac7a2c27afa8d0fe13eca73` |

The native fixture used synthetic Auth and Storage structures. Hosted session routing, managed schema lint and the database and browser CI cutover still need verification. CR-R16 remains partial.
