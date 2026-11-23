# Atomic import source, privacy export and Build feedback

Updated 2026-11-13, Asia/Kolkata. This local batch has **315 unique passing cases across two receipts**, full type checking, lint and web/worker builds. The full reliability goal remains active. SQL is still **UNPARSED, UNAPPLIED and UNEXECUTED**, and the new grouped writer remains denied to every application role.

## Implemented and reviewed

The ledger foundation adds five immutable association stores, scoped foreign keys, RLS, privacy-write guards and private prefix, proof, snapshot and export helpers. Historical origin proof survives edits; active links remain only while the complete entry membership, placement and member values/sources match. Confirmation and section renaming preserve valid links. Add/edit changes invalidate affected groups; rollback copies the target snapshot or explicit legacy-empty state.

The paired workspace export and privacy worker now include all five C02 correction collections and five association collections. The worker requires these arrays, preserves owned row fields and rejects incomplete, malformed or foreign metadata. Its actual RED received a complete response but silently stripped the metadata; that failure is preserved. The worker now requires the matching SQL export update and fails closed against an older incomplete response. Nothing was deployed.

The admission migration implements source-bound normalization and A02 bytes, current owner/privacy/source/catalog checks, exact outer-key replay before fresh CAS, and one approval/proof/version/facts/event/head/snapshot/audit transaction. The internal storage command and key are distinct from the outer approval replay identity. Any error rolls back the transaction. Guarded legacy transitions pair producer admission with ordinary-save and replay bypass denial, producer/rollback checks and snapshot hooks, preserving the existing strict correction-scope response.

The capability successor enumerates 68 actual routines, 15 tables, ten new triggers, 65 columns and 21 foreign keys. The historical 37-routine artifact remains unchanged; 32 bodies carry forward and five have guarded successors. Explicit ACL expectations keep the new public writer revoked, including from service_role. The readiness body is fingerprinted externally as `07d338cc1cbd2c79df76dcbc21bd814b3612c43a0e748531f574974b55c25958`, avoiding a self-hash cycle. Native compatibility and cutover remain unproved.

Build now distinguishes cancellation, unusable output, request conflicts and other published safe failures. Prototype-safe lookup handles unknown codes without exposing response details. Service-capacity copy replaces an unsupported renewal promise. Request construction, selected context, consent, abort sequencing, editor/PDF state, apply/undo and Escape behavior remain unchanged. Three actual DOM failures preceded the fix.

## Verification and preserved corrections

The [initial integrated receipt](a02-atomic-build-integrated-7c3687d9-8e87-4ec6-87c4-c357833c5cf8.json) passed 308 cases and failed one schema-contract test. Its reader selected the last literal SQL declaration and ignored the real guarded forward patch. The test-only repair now resolves actual declarations and guarded transitions, checking predecessor SHA, exactly-once context and successor SHA. The original defined-schema and full application JSON-schema equality assertions remain intact. Historical and drift controls were added; no production schema, expected enum or historical migration was changed to pass the test.

The [follow-up receipt](a02-atomic-build-followup-994b08f8-6d13-4f02-ac4e-0ba5b36b198b.json) passed all seven affected reader cases, full type checking, lint and both builds. Root independently verified all 733 current inputs, both logs, final artifacts and six exited process groups. The reader test was the only changed common source input, allowing the unchanged 308 passing cases to carry forward. This yields 315 unique cases, **not a fresh full-suite pass**. [Independent custody and comparison](a02-atomic-build-integrated-review.json). Sessions 91923 and 89764 are closed.

The current case breakdown is 34 privacy, 15 admission-source, 28 Build DOM, 158 Build helper, 32 Build service, 41 existing correction-repository and seven schema-reader cases. Author checks are included in these counts. Source/JSON/DOM checks do not execute SQL or prove native transactions, concurrency, restore, syntax or performance.

Peer review corrected two cross-lane source defects: the internal storage-command key mismatch and three incorrectly typed readiness columns. A deferred retag-control case now requires the exact expected diagnostic, so an unrelated rejection cannot satisfy it. All earlier fingerprints, failed receipts and source snapshots are retained.

Detailed handoffs and preserved packets:

- [Ledger/privacy](ledger-privacy-foundation.md), [packet](a02-entry-ledger-evidence/final-packet.json).
- [Atomic admission](backend-a02-atomic-admission.md), [packet](a02-atomic-admission-evidence/final-packet.json).
- [Build feedback](frontend-u10-build-errors.md), [packet](u10-build-errors-evidence/manifest.json).
- [Schema reader](backend-a02-schema-reader.md), [packet](a02-schema-reader-evidence/final-packet.json).

All executable archive snapshots use .txt; custody maps preserve original names and hashes. The [frozen contract](a02-atomic-import-contract.json) and allocations identify exclusive file ownership and the ordered migrations. The implementation follows [Supabase function privilege guidance](https://supabase.com/docs/guides/database/functions); no hosted function or grant was changed.

## Remaining acceptance

The actual grouped-import server adapter and route still need owned reads, one trusted constructor call, preview, named relationship acknowledgement, retained exact retry and visible conflict recovery. Existing-head regrouping remains a separate immutable-child operation. Native parse, direct-Supabase transaction/ACL/cascade tests, actual two-session concurrency, restore and real consumer acceptance remain open. The rollback-only verifiers are prepared source only; they were never run.

No provider, real environment, owner document, Photos, browser, OCR, compiler or Docker runtime campaign ran. No dependencies, Git mutation, publication or deployment occurred. Full verify:ci was not run. All services remain free; pricing and deployment remain on hold. Keep these verified local gates closed and continue with the server/route consumer rather than repeating unchanged tests.
