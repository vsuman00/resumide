# A04 atomic correction materialization

2026-11-10. Runtime worktree, base `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus preserved dirty inputs. Root owns integration, migration order, flags and native admission. This packet is SQL SOURCE ONLY. It has not been parsed, applied or executed. No database, Docker, provider, owner-file or Git operation ran.

## Implemented source

The migration implements service-only ledger read, target assignment, and atomic apply/add/reapply. SQL reloads the exact owned source/event/assertion, validates citations and selected placement or owned ancestry, checks current review/assignment/head CAS, derives corrected values and child plans, then writes the operation/application/snapshot/receipt inside one transaction. Initial original import and all selected correction children share that transaction. Public exception handling encloses the whole mutation subtransaction; it does not return a partial successful import.

Existing-mapping reapply follows Root's option A: explicit reassignment at the current head, followed by explicit reapply referencing the prior application. Exact semantic replay returns its historical receipt without moving the current head or allocating new children. Random preview/child IDs do not enter replay identity. Corrected facts are unconfirmed, with citations and confirmation cleared. Absent add uses a separate private delta validator and `canonical-engine/1.0.2`; the existing strong validators remain in use.

Existing save and nested authoring take the C02 owner lock before rows and current R19 READ COMMITTED privacy admission. Canonical saves record snapshot lineage for import, edit, confirm, rename and restore. A manual edit drops its application link; confirm/rename preserve valid links; restore copies the selected historical snapshot or records an empty legacy marker. Foundation `6105eb84` and frozen proposal `00ffd802` remain unchanged.

`writeReady` checks exact routine bodies/attributes/grants and effective table plus column DML denial for application roles. It does not infer readiness from comments or names. The migration preserves old caller grants instead of silently revoking unrelated access; those grants keep new writes unavailable until a reviewed canonical cutover. SELECT remains available. Compatible readers must be deployed before any producer-1.0.2 activation.

## Concrete source reviews and corrections

The initial complete migration was `d54ee0b8ca715243a83afbc9684453fb9f085ad55085f66b41853bc626ee5ea8`. Root independently matched its 34 critical source fingerprints and guarded producer transformations; frontend ACKed the three-RPC UI/DTO boundary. These are source reviews, not SQL syntax, privilege, transaction or race evidence.

Root then found a real admission gap: one employer fact referenced by two entries could be selected through either real member location and changed globally. A03 rejects that placement. The renewed source adds `correction_assert_fact_placement`: nonempty placement and at most one distinct nonnull entry for a non-contact fact, retaining the name/email/phone exception. Existing normalization and resolved existing/imported/reapplied child planning invoke it before any write. Citation and origin checks remain unchanged. The manifest now binds 35 unique routines. The original d54 review is retained as superseded for this delta.

Renewed migration: `edf5c49b3f33354656f6cd25f4d1150c564ea34088435f3032d463bf1f1d4af5`. Its operator draft adds shared-import rejection before initial import and forged-existing-member rejection. It also qualifies exact fixture cleanup as `j.analysis_id=owned_fixture.analysis_id`; the ambiguous draft expression was never executed.

At that preceding source freeze, a separate confirmed-original import mismatch remained under coordination: a later valid confirmation superseded an earlier correction in A03, but the old JavaScript original-import guard rejected any correction history. A fresh transaction-side review/attempt/head authority path was required; a JavaScript-only filter would race a newly committed correction. The three correction commands retained their nonempty selection contract. The approved separate wrapper and its source-only completion are recorded in the A04-S03 addendum below.

## Verification and omissions

One sealed Node 22 run of `npm test -- tests/unit/canonical-sql-contract.test.ts` passed 1/1 (Vitest 138 ms; outer process 725 ms), log `/private/tmp/resumide-a04-schema-contract.log`. The only read-only dependency sync added the frozen schema enum `canonical-engine/1.0.2` from backend SHA `aab78a9a87fe1ef0571fa7e33d4c7a277f0d84d8db705fb719bcea34f898cd0d`; no other schema behavior changed. The contract test file remains `774b9588bfb1981ae9e996467a3f7694e84e9d5f11fcbaa0d2e5f4dbf2874dd5`. This proves JSON schema parity only. The placement-only correction did not change that schema and did not repeat the test.

Source fingerprint regeneration checked exact predecessor hashes and replacement counts without invoking a SQL parser or database. Two local fingerprint-count assertions exposed a duplicate provisional manifest row; it was removed before renewal. The final manifest has 35 unique entries. Focused `git diff --check` passed. Root will run the single integrated application gate after final source packets.

`verify-canonical-correction-materialization.sql` is a MUTATING, rollback-only synthetic fixture and service-role exercise, not a read-only catalog verifier. It requires a separately admitted isolated direct-managed target, exact owner/run allocation, no live workers, genuine metadata write readiness and privileged fixture setup. Its settings do not supply isolation, credentials, hosted-DDL approval or proof. It is NOT PARSED / NOT RUN. Pending legacy-bridge permission does not cover it.

Actual native syntax/transactions, forced two-session review/head/assignment/deletion/legacy-writer races, fault injection at every persistence boundary, column-grant/cutover behavior, all add locations, restore/export/cleanup, deployed readers and representative/release gates remain open. This packet neither activates the feature nor changes old producer/grant policy. Root may integrate reviewed source while preserving these limits.

## A04-S03 original-import source completion

After resuming, the runtime verified the exact edf5 migration and57d operator inputs before editing. Root durably archived those complete bytes in [source-history/edf5c49b-20261110113245_canonical_correction_materialization.sql](source-history/edf5c49b-20261110113245_canonical_correction_materialization.sql) and [source-history/57d04060-verify-canonical-correction-materialization.sql](source-history/57d04060-verify-canonical-correction-materialization.sql), with hashes in `a04-source-archive.json`. The earlier d54 full bytes were not recovered; its historical Root fingerprint/interface receipts remain. Do not claim that an old hash alone reconstructs its source.

Backend reproduced the confirmed-original regression before repair. Root approved [the exact six-argument interface](a04-original-import-contract.json) before either implementation. The new service-only `import_canonical_original` receives the existing15-key server binding, raw body and normalized legacy import command. It validates current authority/privacy/source/attempt/models/readiness, then exact owned legacy key replay before fresh head/review/assignment CAS or active-correction checks. Replay returns the original version without moving the head or treating new body UUIDs as a different operation.

New-only admission requires the current null head and captured revisions. A private predicate resolves current corrections through latest valid observed assignments or the sole real assertion; ambiguous, absent and unresolved targets deny. Its latest event per actual assertion must confirm that exact original value. The existing strong import save runs in the same exception subtransaction. No JavaScript opinion flag, empty correction selection, new table, grant cutover or old flag-off API change was added. Facts stay unconfirmed. The response keeps the existing exact canonical applied receipt/fixed statuses, matching backend JSON invalid422/unavailable503 handling.

The complete migration is `eb981cd4949a71a68f8f42fa765f47f8ee033435fde37528c6d6a500a0029e93`. Root, backend and frontend independently source-ACKed the new boundary on this exact hash. The37 unique critical manifest entries retain all35 preceding routine bodies and add only the new predicate/wrapper. These are source/interface reviews, not PostgreSQL syntax or transaction proof.

The renewed mutating operator draft adds a separate exact synthetic source branch: real correction/confirmation RPC calls; stale review and active proposal rejection without a version; confirmed-original import retaining unconfirmed facts; replay after a later head and active review with regenerated body IDs; changed-attempt, opinion-flag and foreign-owner rejection. Its entire fixture lifecycle remains rollback-only and UNPARSED/NOT RUN. The draft's source assertions are not executed test results. Existing schema parity1/1 remains historical and was not repeated because the schema did not change. Root owns the single integrated application gate after this release.

Documentation consulted during the source change: [PostgREST transaction and volatility contract](https://docs.postgrest.org/en/stable/references/transactions.html), [PostgreSQL17 exception blocks](https://www.postgresql.org/docs/17/plpgsql-control-structures.html#PLPGSQL-ERROR-TRAPPING). The Supabase markdown changelog fetch returned unsupported-content-type400; no CLI/library/config upgrade was attempted, and no such change is part of this packet. Native acceptance and all previously listed race/role/consumer/release omissions remain open.

## Final five-file source release

Source-text inspection confirmed37 unique critical manifest entries, matching all locally declared routine body fingerprints. The preceding routine bodies remain unchanged except the readiness manifest; exactly the approved private predicate and public wrapper were added. No SQL parser, database command or application test ran during this wrapper repair. The earlier schema parity check remains the only runtime leaf application-test receipt. Root performs the combined gate after exact integration.

The current amendment and handoff scored low in the local prose audit, with zero suspicious Unicode. Formatting and source whitespace checks passed. These checks concern the written packet, not native acceptance.

| File                                                                                         | SHA256                                                             |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `supabase/migrations/20261110113245_canonical_correction_materialization.sql`                | `eb981cd4949a71a68f8f42fa765f47f8ee033435fde37528c6d6a500a0029e93` |
| `scripts/verify-canonical-correction-materialization.sql`                                    | `ed1b12be6479117356dc4945aba0ad8902c7e7578d2b7c1b9e95076038dceb88` |
| `tests/unit/canonical-sql-contract.test.ts`                                                  | `774b9588bfb1981ae9e996467a3f7694e84e9d5f11fcbaa0d2e5f4dbf2874dd5` |
| `tasks/agent-handoffs/2026-11-09-reliability-implementation/c02-ledger-current-admission.md` | `0360d2539c25f68c607e9835cfe02db23e3d4ae81a347c97176ffdec1ebadf3a` |
