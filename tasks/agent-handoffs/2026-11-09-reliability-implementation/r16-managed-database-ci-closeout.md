# CR-R16 managed database CI cutover

The database job in [CI](../../../.github/workflows/ci.yml) now uses the guarded direct Supabase connection for the eight SQL suites, schema lint, and the two-session correction check. A manual run from the default or a protected branch uses the `managed-supabase-database` environment and serializes work on the target. Push and pull request runs report this gate as unavailable. The database-only manual run skips the legacy browser and container jobs. [Operator setup](../../../docs/operations/MANAGED_TESTING.md#run-in-github-actions)

## Verification

Dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. All 103 managed target and runner tests passed under Node.js 22, together with typecheck, scoped lint, formatting, and Actionlint 1.7.7. Local workflow shell checks covered missing CA material, exact file permissions, a duplicate fixture directory, and the success, unavailable, and failure branches of the gate.

The native database used disposable PostgreSQL 17.11 and the 94-operation schema. The build used `plpgsql_check` 2.7.11 at commit `7e23f9daa6b5408151aaec197c6cf6c948e23957` in a private PostgreSQL copy. The real extension scanned 378 routines and reported 176 warnings and 90 errors. The database included synthetic Auth and Storage stand-ins and one deliberately invalid function. The counts require triage and cannot establish a clean schema. The check confirmed that the temporary extension was absent after rollback.

The initial native build used an unavailable SDK path in the installed PostgreSQL build flags. The private build used the installed SDK instead. The first PostgreSQL copy also missed the targets of Homebrew's symlinks. The final private copy included them. No installed extension or database was changed.

| Artifact               | SHA-256                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| CI workflow            | `ea578ea563ba436436f0835fb82d14eef77acb8d04c2c6a3409f31cbcca4cc72` |
| Managed lint runner    | `3869bd385e54668f86364e243194ea7e1ac9850be043d250e32c0f8d4f0e595a` |
| Linter source archive  | `ba1fedb89ad58eb1eb12dc57b02df6d06e3377fc3882562a0afe6a2f5d9c0ba3` |
| Native lint receipt    | `e44b5124342f84a97669802346b8a8d63d7d538ebc879b6f602f4efb47308a86` |
| Workflow shell receipt | `b303a32a7b9cd8e9f9c9682c08b63bca098cef15fc440b93d44242e323863e94` |

CR-R16 remains partial. Hosted execution needs an approved isolated target and protected environment settings. Routine push and pull request browser CI still uses the separate legacy database setup until the authenticated and restore checks move. The workflow source has not been published or triggered.
