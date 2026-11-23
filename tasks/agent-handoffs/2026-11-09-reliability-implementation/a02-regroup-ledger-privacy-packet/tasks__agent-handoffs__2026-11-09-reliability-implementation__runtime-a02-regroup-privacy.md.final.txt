# Regroup metadata privacy export

The privacy worker now requires all fifteen ledger metadata arrays and preserves
their complete owned rows. Missing regroup arrays fail closed, including an old
workspace response that contains only the original ten collections. This is a
paired application/export preparation change; it does not activate regrouping.

Scope follows the [frozen contract](a02-regroup-ledger-contract.json) and
[three-file allocation](a02-regroup-ledger-privacy-allocation.json). Work stayed in
the preserved runtime worktree at detached base
`a0b239299d75b0bd64b588fe743ebe2975fb28b9`. Root owns shared documents, SQL
integration, profile transitions and the combined gate.

The worker change adds only five required arrays to the existing schema:
`candidateEntryRegroupBatches`, `candidateEntryRegroupGroups`,
`candidateEntryRegroupMembers`, `canonicalEntryRegroupSnapshots` and
`canonicalEntryRegroupLinks`. Existing passthrough rows retain nested fields and
nullable association/regroup origin references. The existing ownership loop
checks every metadata row against the request owner. Failure messages stay fixed;
missing data is never replaced with an empty collection.

The actual old RPC consumer failed before the worker edit: a complete response
with nonempty new metadata reached `SupabasePrivacyRequestRepository`, but Zod
stripped the new arrays and the manifest returned `undefined`. That selected RED
has one failure and 34 unselected cases. The worker was still the exact baseline
`a75d225f74389156acd26c5c13fea6acae7e8362f8f52f3755b8f529cd56e67a`.

The affected file then passed 46 cases: the original 34 plus twelve new cases for
complete preservation, an old ten-array response, each missing new array, and
malformed or foreign rows. A subsequent scoped typecheck found TS7053 in the new
fixture helper's inferred return type. Its only repair adds
`Record<string, unknown[]>`; runtime expressions and assertions are unchanged.
The directly affected case passed on final bytes, with 45 cases unselected.
Scoped types passed with two roots, ten project source files and zero diagnostics;
scoped lint and formatting passed. Root's combined gate remains separate.

Original assertions and the old ten-key list are preserved. Four existing complete
fixtures receive valid empty new arrays so old missing/malformed tests still
isolate their original target. `preservation.json` reconstructs the original test
file exactly after removing the new suite and those fixture additions. It also
proves that removing the five worker fields restores the baseline worker.

Final source hashes:

| File                                    | SHA-256                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/privacy-worker.ts`      | `7f945f101130060ad04ec9566655864bbbe9686b9ba29a2d7b8a9c7e757497b6` |
| `tests/unit/privacy-operations.test.ts` | `abe07767e760178e9fcadd66366b1bb8b90c57f79a74c4c47d93a78fdca5d3e6` |

Private packet:
`/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a02-regroup-privacy-hevsd79r`.
It retains original/final `.txt` snapshots, `red-actual.json`, `focused.json`,
`focused-typed.json`, `types-final.json`, `lint-final.json`, `format-final.json`,
their logs, and preservation/cleanup/custody records. All checks used sealed
Node 22.23.4 with dotenv disabled and synthetic mocked RPC data. Each command
retained a stable 710-input filesystem inventory; 708 nonowned inputs are
unchanged. No Git command was used.

An initial inventory launch failed before any test process started because sealed
PATH did not include `rg`. The empty original log and explicit start-failure record
are retained; the corrected launcher uses the installed absolute `rg` path.
The failed typecheck is also retained. Formatting changed only the allocated test
file and has a separate controlled-write receipt.

SQL/native execution, semantic regroup validation, durable admission, cascade and
restore proof, actual hosted export and rollout acceptance remain open. Row
ownership and response completeness do not prove relational correctness. The SQL
owner must pair the five-array exporter with the guarded profile69 successor;
the current public workspace export pin is `7e84db73...`, while
`export_authoring_records` remains the distinct `5bb5345d...` routine. No SQL,
route, flag, provider, dependency, deployment or Git mutation was performed.
