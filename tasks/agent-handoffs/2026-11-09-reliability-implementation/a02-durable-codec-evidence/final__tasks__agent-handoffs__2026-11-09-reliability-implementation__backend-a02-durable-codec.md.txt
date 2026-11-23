# CR-A02-S02 grouped import framing foundation

2026-11-13, Asia/Kolkata. **FRAMING SOURCE IMPLEMENTED; SCOPED AUTHOR CHECKS PASS; NO DURABLE WRITER OR APPROVAL.** The [contract](a02-durable-codec-contract.json), SHA256 `1cec3213aa514128fc3140a18bd0491da9bb305b99e2d8de0f4c4eba3d4e6e53`, and [five-file allocation](a02-durable-codec-allocation.json), SHA256 `14465129599e9b2da3c00bbe3ef7abf1c91bf2d5f2a803a3286c240b4161a3a8`, govern this leaf. Root supplied base `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus preserved dirty prerequisites and owns integration, shared context and migration ordering.

## Implemented source

`GroupedOriginalPreviewRequestSchema` and `GroupedOriginalCommandSchema` accept strict compact browser requests. `prepareGroupedOriginalCommand(rawEvidence, ownedContext, rawPreviewRequest)` and `normalizeGroupedOriginalCommand(rawEvidence, ownedContext, rawCommitCommand)` resolve nonempty selections through the actual frozen owned-evidence association helper. Browser input cannot supply members, values, a canonical body or an authoritative structural DTO.

The metadata normal form binds exact owned source/model identities, original submitted review/assignment/association revision-head pairs, null canonical head and explicit output locale. The locale is submitted output intent, not a stored preference or current-locale CAS. This pure helper does not check current prefixes/head/locale or look up prior operations. Later SQL admission must check current ownership/privacy/source, compare original-command replay, then apply fresh preconditions and the versioned output-locale policy.

Selected groups and members follow frozen helper/source order. Structural selections contain page/method, assertion/field and complete attempt/span/code-point references with derived page offsets. Opaque group/observation/target IDs and source values never enter authoritative atoms. Group IDs remain diagnostic UI lookup IDs. Generated batch/version/member IDs, timestamps, request ID, preview hash and idempotency lookup key are excluded from semantic bytes. Commit normalization retains the parsed original command/key and requires its preview hash plus literal acknowledgement.

The prospective operation is one atomic approve-and-import. It acknowledges relationships only, retains all unselected content and records no approval during preview or normalization. A later transaction must create one immutable approval batch and canonical version together, with neither surviving failure. All results remain `authority: derived_review_only`, `persistable: false`, `scoringEligible: false` and `requiresDurableAdmission: true`; unavailable results contain only fixed metadata and no partial normal form.

`a02-command-bytes/1.0.0` uses the dedicated `A02OP1` LF header, exact UTF8 length framing, explicit nulls, a 2048-atom limit and a 128 KiB total byte limit including framing. It rejects NUL, unpaired surrogates, invalid atoms and sparse arrays without Unicode normalization. The allocated empty migration now contains only `private.grouped_import_command_bytes(text[])` and `private.grouped_import_command_sha256(text[])`, in one transaction, immutable/security invoker with empty search path and execute revoked from public, anon, authenticated and service_role. It is **UNPARSED, UNAPPLIED and UNEXECUTED**. JS goldens and SQL source checks do not establish native PostgreSQL parity.

## Evidence and preservation

Packet directory: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a02-durable-codec-hj174_n0`.

- `c02-characterization.json` passes the healthy existing C02 byte/hash golden before new protocol implementation. No missing-import or healthy-code RED was fabricated. Existing C02 code, limits and migration bytes remain unchanged.
- `initial-green.json` passes the initial actual two-job normalization, preview/commit parity and independent A02 Unicode byte/hash golden. Read-only peer review found no required production-source issue before expanded controls.
- `frozen-affected-final.json` passes 71 cases in the new test file. Controls cover exact owned/model binding, strict browser shapes, original captures/locale, source ordering and subset preservation, stale selectors, invalid replay, actual Unicode offsets, all 32 groups, preview/ack binding and codec text/atom/byte boundaries. The full two-job golden has 102 atoms, 1723 bytes and SHA256 `a3317f16273a02b72c5d5a6e527e73c477b105a68bc97527517023b4573847fe`; independent Python framing is retained in `manual-golden.json`.
- `frozen-types.json` passes project-options no-emit checking: five roots, 22 project files, zero diagnostics. `frozen-lint.json` and `format-final.json` pass. Earlier runs are retained and are not additional case counts. Root owns combined checks/builds.
- Two formatter mutation receipts report changed inputs because the immutable-input runner detected their intended formatting edits; both commands exited zero and only allocated files changed. The first read-only format check then caught the new golden assertion's wrapping; that failure remains in `format.json`. Its two-line formatting correction passed the final check and the frozen test/types/lint run.

Every terminal check records exact Node22.23.4, a sealed synthetic environment with dotenv and AI disabled, 711 stable nonsecret source inputs, bounded logs/process groups and exited children. `cleanup-final.json` independently confirms all recorded groups absent and log hashes matched. `preservation.json` records all 707 other existing source inputs unchanged, including the legacy importer, frozen helper, producers, schemas, C02 codec and prior SQL migrations. Root's setup-only CLI failures and successful isolated scaffold receipt remain separate evidence; this agent did not run the CLI.

## Frozen files

| File                                                                     | SHA256                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `app/lib/server/grouped-import-commands.ts`                              | `2b83c53fb2b6147f97488bf3b577acc74c8196df41ac0362ca13857689f488e5` |
| `app/lib/server/grouped-import-command-codec.ts`                         | `c77e497a384693b968595fff94f848e1a57b1fcd6721fac56ae7c799cb024f51` |
| `tests/unit/grouped-import-commands.test.ts`                             | `9fec9667ca5d764a2e6f687dc7ad2abe7fd47d5d1fef870db04016a369de69d5` |
| `supabase/migrations/20261113113504_grouped_import_structural_codec.sql` | `6439a2c18b3aefbaa5aebe0e17b1853720f771c786ef06c32bd9262e94fa2753` |

Only these four files and this handoff changed. No current route/repository/producer/helper/schema, C02 protocol, readiness profile, grants, history table or public RPC changed. No DB, SQL parser/runtime, provider, real environment, candidate data, OCR engine, Git, dependency or deployment action ran. Full A02 remains open. Independent stored-source SQL derivation, durable exact replay, atomic approval/save, correction safeguards, guarded reader/mutation compatibility, snapshots/export/restore/privacy integration, authenticated preview/commit consumption and native/release acceptance remain required.
