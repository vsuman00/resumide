# JD clause-order catalogue verifier

Status: DRAFT / UNPARSED / UNEXECUTED. This leaf prepares a read-only post-schema verifier. It does not authorize a project, apply migrations, query a database, create fixtures or activate a writer.

The verifier derives all 23 new function signatures, body fingerprints, languages, volatility, strictness, definer status and named arguments from frozen migration `20261116192537` (`29b47287`). It carries the exact 44-entry expected-source manifest and checks the externally pinned checker itself. The trusted profile remains checker `0f272ab4`, writer `486f9b25` and metadata `85d5cd1e`.

Future execution uses one repeatable-read, read-only transaction with finite statement, lock and idle settings. Catalogue checks precede invocation of the pinned readiness routines. They compare actual function bodies, signatures, result types, owners, empty search paths, argument defaults/modes and ACLs. New helpers and the JD v2 writer must have no application-role execution; metadata requires its direct, nongrantable service grant. Historical optional grants remain governed by the existing manifest. No blanket revoke is added.

The expected owner is the existing canonical readiness anchor's actual owner, as in the frozen authority. The anchor's body is checked through the manifest; the owner must exist and differ from the application roles. No guessed hosted role name or approval setting supplies authority. The only emitted result is schema/readiness metadata and fixed catalogue counts. There are no candidate, Auth or storage row reads, temporary definitions, fixtures, DML or privilege changes.

Ten source checks pass. These are text/JSON assertions, not a SQL parser or Native proof. Two failed source-check receipts remain: an omitted language catalogue in the test allowlist, then a lexical scan that confused `IS DISTINCT FROM` with a row read. Only the new test was corrected. The SQL source did not change for either failure.

The three-file packet preserves exact source snapshots, preimages, contract/profile pins, commands, logs and closed process groups. All 80 migrations and existing application sources remain unchanged. A separately admitted fresh isolated target, exact ordered schema application and an actual catalogue run are still required before any Native claim. Actual transactions, roles, replay, races and rollback remain separate acceptance work.
