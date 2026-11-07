# AA7 owned-source LEFT join implementation

Status: PREPARED FOR COORDINATOR INTEGRATION. The three candidate files are frozen. No shared ROOT files, services, database rows, dependencies, migrations, timeouts or release gates were changed by this worker.

The coordinator approved LEFT embedding after the earlier INNER-only proposal exposed an error-precedence ambiguity. That read-only proposal remains historical evidence. The final selector uses the explicit resume_versions_resume_id_fkey alias without !inner. It filters source id/owner/organization and nested active-resume owner/organization/status. Strict object validation binds the parent id to source.resume_id; null, array, foreign and inactive parents deny access. No denial fallback is needed.

ownedAnalysis starts membership/deletion reads alongside the joined source query, handles speculative rejection immediately, validates source scope before scope errors, and validates the parent after scope success. This keeps source-first 404 behavior and scope-error precedence when the source is valid but its parent is absent. ownedJob keeps its existing grouped query-error precedence. All final freshness barriers, CAS logic, historical reads and return shapes remain unchanged.

Controlled pending-promise tests show authorization takes two dependent read waves rather than three. Canonical ownership uses four reads rather than five; job ownership uses five rather than six. This is a query dependency result, not a measured browser latency claim. The tester independently confirmed the actual deployed LEFT object/null semantics in six synthetic cases and verified cleanup; this worker made no database calls.

Verification:

- New tests reproduced the original gap: 4 failed, 17 passed before implementation. Final focused result: 21 passed, 0 failed.
- TypeScript AST comparison confirms all 11 original top-level test statements are unchanged, preserving 13 expanded original cases. Four new parameterized statements add eight cases covering held queries, exact predicates, source/parent denials, membership/deletion and rejection precedence.
- Scoped ESLint and Prettier checks passed. A read-only TypeScript compiler-host overlay of these three candidates onto current ROOT, including the existing ambient types/index.d.ts, reported zero diagnostics and emitted no files. The earlier missing ParseView names came from omitting those ambient declarations in the scoped command; they were not ROOT defects.
- A broader isolated run passed 93 of 94 tests. The remaining canonical-sql-contract.test.ts failure compares a stale isolated schema date-time pattern with current shared dependencies. No schema, migration or assertion was changed to conceal it. Integrated current-ROOT verification remains required.

The byte-identical current-ROOT authoring-repository.ts copy was test support only and is excluded from the patch. The patch includes only canonical-repository.ts, job-requirement-repository.ts and repository-read-scheduling.test.ts. Exact baseline/candidate and patch SHA-256 values are in the adjacent implementation.json receipt; all ROOT baselines still matched when the patch was exported.

Next: coordinator review/integration, one unchanged authoring browser case under its original 30-second limit, then the integrated full suite. Actual latency and complete Phase AA7 acceptance remain unverified by this slice.
