# CR-R16 managed SQL runner

The [runner](../../../scripts/verify-managed-db.ts) pins the eight reviewed SQL suites and the readiness check. It validates the approved target, selects an explicit PostgreSQL host, checks the catalogue and runs each fixture under a rollback transaction. The [operator command](../../../docs/operations/MANAGED_TESTING.md) has no reset or provisioning action.

The [94-operation successor](managed-schema-ci-successor-94.json) adds the legacy claimant repair. All 93 preceding operation files were byte-identical to the existing worker packet. The existing CR-A01 worker approval still refers to its original 93 operations.

## Verification

Dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. All 22 runner and 75 existing managed-target tests passed on Node.js 22. Typecheck, scoped lint and formatting passed. The actual npm command refused missing credentials and a legacy reset argument with exit 2.

Disposable PostgreSQL 17.11 ran the SQL emitted by the real runner through a private Unix socket. It refused a catalogue before the forward repair and a populated Auth table after the repair. The empty candidate passed eight suites in one client session and returned to zero test rows in Auth, analyses, queue and privacy requests. The first native run exposed a harness argument offset. Once corrected, PostgreSQL also showed that repeatable read refused synthetic Auth enrollment. The runner now uses read committed and short-lived table locks for each write fixture. These checks used synthetic stand-ins for the managed Auth and Storage schemas.

| Artifact                     | SHA-256                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| Runner source                | `dc7b0b315821215950b912809621dab5e5d3013d6720d32b9dee9cbdd77b4336` |
| Native isolation failure log | `605c0a3f6c8f5c7f6c87aad57693439a289bfa1da4ce30ef953cd7e82578a00b` |
| Native passing log           | `2b8145139abc5b82fa7ad72bf162e63782f302997fbd262b0188095278310f39` |

CR-R16 remains partial. Hosted TLS and target behavior still need an approved isolated Supabase run. The database and browser workflows still need the cutover, including managed schema lint and the existing two-session correction and browser coverage.
