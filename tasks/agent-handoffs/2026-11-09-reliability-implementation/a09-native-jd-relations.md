# CR-A09-S07 native JD storage and replay

The actual typed JD writer passed on a disposable, socket-only PostgreSQL 17.11 cluster. The schema replay applied 100 operations with ordered digest `4e253744226912aab1c9411cb03e528f8fbdaa10984aa5933a88ff380601293a`. The checks ran on dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9` with Node 22.23.4.

## Frozen SQL operator

The local runner checked the archived operator's SHA-256 and materialized a local copy with separate admission and the current private source key. The archived operator and its fixture were preserved. The run checked the TypeScript semantic digest, exact role grants, validated source and policy, atomic version, item and audit writes, replay across an edit, stale-head and owner refusal, legacy downgrade refusal, and privacy refusal. It completed its rollback. Fresh inventories for users, versions, items, jobs and audit rows were empty afterward.

## Service-role commits

A separate fixture went through the normal TypeScript constructor and the real service-role save RPC in three observed advisory-lock races. Identical saves returned the same version without extra inserts. A different save from the same head conflicted. A save waiting behind a deletion left no version, items or audit row.

On reload, the stored document and semantic hash matched the TypeScript output. The code-point offsets still selected `JS` and `Postgres` exactly after a supplementary Unicode character. The same stored JD preserved FastAPI-or-Flask, Python-and-SQL, inclusive one- and four-year bounds, and an unfamiliar required clause as unknown. These are parser and storage results for synthetic inputs.

The first service-role run committed correctly but the verifier compared complete bound objects to only their values and inclusivity. Bound objects also carry source evidence. The corrected assertion checks the bound values and inclusivity while retaining full stored-document equality.

The [local verifier](../../../scripts/verify-local-job-relations.py) takes `--pg-bin`, `--jsonschema-library` and `--node`. All 252 affected tests in nine suites passed. Type checking, scoped lint and the synthetic job-intelligence benchmark passed. The benchmark's representative release gate remains open. Managed role and RLS acceptance, authenticated browser reload and populated restore are still pending.
