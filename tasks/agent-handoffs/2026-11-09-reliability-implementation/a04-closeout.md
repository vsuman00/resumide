# C02/A04 correction workflow: local engineering closeout

2026-11-10. **Scoped application verification passed; native acceptance remains open.** Tested main `a0b239299d75b0bd64b588fe743ebe2975fb28b9` with the preserved dirty checkout and the exact integrated source records below. The full reliability plan is incomplete: 2 tasks VERIFIED, 29 PARTIAL and 33 PLANNED. Its 64 IDs and dependency graph are unchanged.

## Result

Saved corrections now have a separate review flow with source-specific canonical choices, visible current/proposed values and provenance. Candidates save a target before applying, explicitly add an absent fact, or reassign and reapply after a head change. Values come from the immutable correction event; candidates do not retype them. Corrected facts remain unconfirmed with cleared source citations and require separate confirmation. Original evidence and immutable version history remain intact.

The source implementation covers initial original/corrected children, mapped corrections, candidate-authored additions, exact replay and snapshot inheritance/restore. A later valid confirmation of the original assertion can permit original import through the new transaction-fresh wrapper. It checks owner, privacy, source, attempt and versions before replay, then review/assignment/head CAS and current correction state before a new save. Exact replay returns its prior receipt without moving the head. These transaction properties have source review and mocked-service tests, not native PostgreSQL execution.

`CANONICAL_CORRECTIONS_ENABLED` defaults to false and requires authoring plus evidence review, independently of AI. SQL write readiness checks 37 exact critical routine fingerprints/attributes and effective table/column mutation privileges. Old caller grants remain in place until a separately reviewed cutover. Compatible readers accept producers 1.0.0/1.0.1/1.0.2 without changing the canonical JSON shape or historical correction projection 1.0.1. No flag was activated.

## Failures repaired

- Existing import ignored saved corrections; imported employer/date placement initially had an impossible schema combination.
- Multiple employers had no existing-target choices before selection and could cross-pair another assertion after selection. One admitted batch mapper now returns choices by actual source target.
- Initial-import options and saved targets did not identify the selected source. Labels now include value, page and occurrence context.
- An unknown snapshot policy passed admission; it now requires the exact supported version.
- Confirming an original assertion superseded a correction in the UI but import still returned 409. The new SQL wrapper performs fresh admission without a JavaScript check-to-save race.
- Original import stayed enabled when correction storage was unavailable. Its button now follows real readiness while legacy rendering is preserved.
- Full typing found three legacy callers affected by nullable assignment results. Accurate overloads preserve their nonnull result type; emitted runtime JavaScript is identical.

SQL source review also found that a shared non-contact fact could change multiple entries through one selected location. SQL now applies the frozen A03 nonempty/single-entry placement rule before resolved child writes. No native reproduction was authorized or claimed.

## Verification

| Evidence                      | Result                                            |
| ----------------------------- | ------------------------------------------------- |
| Affected unit/component tests | 282 passed across 21 files                        |
| Full `npm run typecheck`      | PASS                                              |
| Full `npm run lint`           | PASS                                              |
| Web and worker builds         | PASS                                              |
| Recorded inputs               | 701 stable during each run                        |
| Process settlement            | Seven owned groups independently confirmed absent |
| Build artifacts               | Web/worker bytes independently rehashed           |

The first gate passed all 282 tests, then failed typing. The overload fix changed only type declarations; an independent transpilation comparison proved identical runtime JavaScript. Passing behavioral tests were retained, and only the failed type stage and unreached lint/builds ran afterward. Root's historical `.ts` reference copy accidentally entered the compiler glob during the first follow-up; renaming it to `.ts.txt` preserved its bytes and fixed that setup error without exclusions. Both failed receipts remain unchanged. Final follow-up passed all four stages. No behavioral suite was repeated.

Authoritative [combined completion](a04-integrated-completion.json) links the three receipts, log hashes, source reconciliation, runtime comparison, process observations and artifact hashes. Integration records: [application](a04-app-integration.json), [runtime](a04-runtime-release.json), [typing](a04-type-compatibility-integration.json). Source contracts: [current C02](c02-ledger-current-admission.md), [original import](a04-original-import-contract.json), [independent SQL review](a04-root-sql-current-review.json).

Some older temporary raw logs disappeared during pause/resume. Their historical observations remain qualified in agent handoffs; they were not rehashed now. Fresh reproduced failures, current integrated logs and durable pre-wrapper source snapshots are retained. The earlier d54 full SQL bytes were not recovered; its historical fingerprint report remains available.

## Remaining acceptance

The SQL migration and mutating rollback-only operator are **not parsed, applied or executed**. Native transactions, forced races, role/column-grant cutover, fault injection, all add placements, deployed readers, real browser/restore/export/cleanup and consumer acceptance remain open. Current source/UI tests do not supply those proofs. `npm run verify:ci` was not run because its database/load/restore/browser/external checks exceed this local synthetic allocation.

No database, provider, Docker, owner-file, Git publication or deployment operation occurred. Pricing remains deferred and services remain free. Pending approval concerns only the separate legacy bridge, not this migration or operator. C02/A04/U01/U02 remain PARTIAL; release and the full goal remain open. Next independent source work is the exact-value confirmation review in CR-U03, with native actions governed by their own concrete admission packets.
