# Paired owned AI retirement export

Implemented and released for Root integration. Evidence is source review and sealed synthetic RPC behavior; Native SQL execution, concurrency, activation, privacy-worker adoption, and the later expiry lifecycle remain unverified.

## Behavior and API

`readOwnedAiRetirementExport(client, {ownerId}, explicitProfile, options)` reads the separate eight-field readiness metadata, matches all six supplied profile fields and both capabilities, then calls `export_owned_ai_retirement_records({p_user_id})`. It has no default profile, cache, retry, or fallback. One deadline covers both calls, settlement of thenables, abort, decoding, and the final elapsed-time check. The whole envelope is bounded to 32 MiB and 4,096 rows.

The strict fourteen-field row decoder checks owner identity, canonical IDs/hashes/timestamps, unique operation/publication/attempt/run identities, deletion-request versus retention-item exclusivity, and assessed versus deterministic-only correlations. The reader copies and freezes its rows. A private WeakMap issues the capability consumed by `snapshotOwnedAiRetirementExport`; parsed JSON, cloned objects, and caller-supplied arrays cannot mint it.

`createInitialFeedbackPublicationRepository` accepts optional `options.retirementProfile`. Without it, `exportOwned()` preserves the original strict four-key return and missing-publication refusal. With it, the actual retirement reader always runs, including for empty exports. Only an exact retained published operation and matching attempt may account for an absent publication. Present-publication/proof conflicts, missing or mismatched proofs, orphan records, or foreign ownership refuse the complete export. Cross-snapshot races may therefore require a retry.

The paired Node return has the original four keys plus `retirements`, including every validated owned proof. `InitialFeedbackPairedOwnedExportSchema` bounds the entire five-key envelope to 32 MiB. The Native four-key exporter and its schema are unchanged. Later privacy-worker adoption must preserve the fifth field.

## Source review

Reviewed Runtime migration checkpoint `552794aa281f101ad7b760bfcb4a58245c779684a4e04d36df5241e46c4c8203` against the approved retirement design before its first source checks. No additional scoped source finding: capture derives the real deletion/retention authority before content deletion, validates the actual publication/run link, uses nonblocking row locks in the stated order, and cannot invent a proof for content already missing. The counter keeps one CTE snapshot and refuses conflicting present content. This is a source comparison, not Native approval.

Runtime subsequently released `ba89d609204d73e0588e1af33b54d46bf0583c810b14f80e843893bea9730cc5`; Runtime reports only final assertions were added, with the nine inspected bodies unchanged. The explicit helper has no production profile import or altered source pins. Data RPCs remain denied; no feature or registry was activated.

## Verification and preserved failures

Packet: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-retirement-export-3tejhrj8`.

- `missing-pub-red.json/.log`: genuine pre-fix failure on repository `43aff60f...`; an actual retained operation/attempt plus separately supplied retirement RPC still failed the old missing-publication check. One failed control, nineteen unselected; 819 inputs stable, group 84810 closed.
- `finite.json/.log`: 47 passed, one new fixture expectation failed. The intended wrong binding used `f` repeated 64 times, which equalled the actual fixture binding. All original nineteen assertions and all twenty-four helper controls passed. The fixture changed only that SHA to distinct zeroes; no application source changed.
- `binding-fixture-affected.json/.log`: corrected control passed, twenty-three unselected. These receipts cover all 48 controls; this is not a fresh 48-case run. 821 inputs stable; groups 87130 and 87675 closed.
- `types.json/.log`: five roots, 45 sources, zero diagnostics. `lint.json/.log` and `format.json/.log` passed. These checks preceded only the new fixture SHA correction. Groups 87132, 87129, and 87131 closed.

`commands.json` records exact argument arrays. Every command used the pinned Node 22.23.4 sealed runner, no dotenv, 60-second limit and 8 MiB log cap. Receipts record source hashes, log hashes, and process cleanup. No provider, database, Docker, or external compiler ran. Root owns the later integrated checks.

`preservation-proof.json` confirms all original test bytes remain contiguous and unchanged, with SHA `c4b9f2db35eec1a2915070da270a41854a295a982ca7965516d8a4122b2a4408`. Only the appended test's fixture changed after the finite run. `dependency-transfer.json` records the missing-only read dependency copied from Root: operation repository `22304ba6...`.

The five-file hashes, immutable release snapshots, evidence hashes, and current author-source manifest are in `release-packet.json`. No unrelated source, shared profile, plan, or Native migration was edited in this leaf.
