# Whole-entry regroup metadata and privacy foundation

Status: **INTEGRATED / SOURCE AND MOCKED CONSUMER VERIFIED; SEMANTIC ADMISSION AND NATIVE ACCEPTANCE OPEN**, 2026-11-13. This advances CR-A02-S02/C02 and privacy completeness. It does not enable regroup saving or close the reliability plan.

The tested candidate is preserved dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. The coordinator integrated four backend files and three privacy files from separate preserved worktrees; a third agent independently reviewed source, exact hashes and receipts. Their original packets, failures and source snapshots are archived through the [backend](a02-regroup-ledger-backend-integration.json) and [privacy](a02-regroup-ledger-privacy-integration.json) integration records.

## Storage and export source

CLI-generated migration `20261113155247_entry_regroup_ledger_foundation.sql` declares five new stores: regroup batches, groups, members, versioned composition snapshots and typed composition links. Base/result identities and revisions, scope, command framing, source mappings and original approval references are retained separately. A member may share an original entry with another selected member or remain inside a bullet. Carried whole-entry content is not reduced to the two or three selected source members.

Each active link references its original first-import or regroup group, batch and approval version through a typed XOR pair. The batch creating a new composition does not replace every retained approval's origin. Empty active headers and complete approval history remain separate. The new declarations add 95 columns, 55 foreign keys and ten triggers, with ownership/source/canonical cascades, immutable-update and privacy-write guards, RLS and application DML revoked. Placement, ancestry, exact revision/body correspondence and human intent still require the later semantic admission; FKs do not prove them.

The old ten-collection helper is byte-identical. A new private stable invoker helper adds five owner-qualified aggregates. The guarded public workspace-export successor retains its existing calls and ACLs, appends those aggregates within the same stable snapshot and enforces the existing 32 MiB fail-closed limit afterward. Missing collections are never treated as empty.

The guarded readiness successor moves from 69 to 70 watched routines. All predecessor routine properties remain unchanged except the workspace export fingerprint; the only new routine is the revoked private exporter. Existing 65 column, 21 FK and ten trigger checks are preserved, with the new declarations added. The new external readiness pin is `c09803937360d27e8b9cd5d8cbe20177100560c6cea82c60891d43281f4e2f86`. No new writer, prefix helper, placeholder validator, producer `.4` admission or route is introduced.

## Actual consumer repair

Before the worker edit, a real `SupabasePrivacyRequestRepository` test supplied a complete old response with nonempty new collections. The existing Zod consumer stripped the unknown keys and the manifest omitted them. That actual RED is preserved. The worker now requires all fifteen collections using the existing owner-validated, passthrough row schema. It preserves nested fields and nullable origin identities and rejects missing, malformed or foreign-owner rows. The owner loop and private failure behavior are unchanged.

All 34 original privacy tests and source assertions were preserved, apart from four fixture-only additions of valid empty new collections. The previous server response now fails closed until the paired export migration is applied. The SQL and application changes therefore require a coordinated transition; this report does not claim the configured project has that schema.

## Checks and limits

Root ran one fresh affected gate: **65 tests in three files**: twelve source-contract cases, 46 privacy repository cases and seven canonical SQL shape-reader cases. Full typecheck, lint, web build and analysis-worker build passed on exact Node.js `v22.23.4`. Exec session `44459` completed with exit 0. All checks used sealed synthetic configuration with dotenv disabled and no database, provider or Docker operations.

Root independently rehashed all **744 inputs**, the complete log and both build artifacts, and confirmed five owned process groups absent. Of the 741 previous preparation inputs, only the two allocated privacy source/test files changed; the other 739 are unchanged. Exact commands, source and outputs are in the [gate receipt](a02-regroup-ledger-integrated-5d1173d9-0cb0-4114-9600-d928183dffba.json) and [independent custody check](a02-regroup-ledger-integrated-review.json). This is an affected source/mocked-consumer gate, not full-project CI or native database evidence.

Original failures remain preserved: the actual stripping RED, a harness inventory failure before tests started, test-only typing and lint failures. Source review against the [PostgreSQL 17 executor](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/utils/adt/jsonpath_exec.c#L2662) also identified a recursive key-inspection hazard on scalar nodes. Both checks now filter object nodes before inspecting keys. That finding came from source analysis, not a fabricated native failure; prepared positive and negative SQL controls remain unexecuted. Final independent source review found no remaining required issue.

SQL is **UNPARSED, UNAPPLIED and UNEXECUTED**. The rollback-only verifier contains privileged metadata fixtures, not approved regroup operations. No semantic validator, canonical writer, producer schema adoption, native concurrency, restore, consumer route, provider activation, Git mutation, publication or deployment occurred. `verify:ci` and real Supabase/browser/lifecycle acceptance were not run in this allocation.

Next work is the durable command/normalizer and semantic composition proof, then atomic save/read/repository/whole-entry acknowledgement and exact retry. Confirmation-only changes must not invalidate unrelated approvals, and restore must use the exact TARGET composition. Current pure preview digests must not be reused as native or per-group liveness proof. The existing hosted action question remains pending. Parent totals remain **2 VERIFIED / 35 PARTIAL / 27 PLANNED**; services remain free, with pricing and deployment on hold.
