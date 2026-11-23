# Owned AI privacy export adoption

Released for Root integration. The worker now requires complete owner-wide R03 budget and paired A13 publication/retirement exports, regardless of AI, budget, scoring, organization, or period selection. Missing or denied Native capabilities fail the whole export. No empty fallback, source activation, provider call, expiry, Auth erasure, or restore behavior was added.

## Payload and admission

Every existing manifest array remains. Nine arrays were added to `records`: `aiBudgetOperations`, `aiBudgetAttempts`, `aiBudgetEvents`, `aiBudgetReconciliationOperators`, `aiBudgetOperatorActions`, `initialFeedbackOperations`, `initialFeedbackAttempts`, `initialFeedbackPublications`, and `ownedAiRetirements`.

The top-level `aiBudgetExportMetadata` preserves the actual R03 `schemaVersion`, `ownerId`, and four closed `omissions` labels through a strict pick of `OwnedAiBudgetExportSchema`. These labels describe shared-pool/opening exclusions and foreign actor/target redaction. They are not fabricated array records. The manifest retains `resumide-export-v1`; the additive `OwnedAiPrivacyExportManifest` type preserves the old manifest contract. Downloads already serialize the stored JSON unchanged.

The worker calls actual `readOwnedAiBudgetExport` with the released five-field export profile and actual `createInitialFeedbackOwnerExporter` with full profile `0b281187...` plus the explicit six-field retirement profile. Both calls are unconditional. The strict paired schema checks the fifth field before all retirement rows enter the manifest. Native ownership, redaction, parent/state/cost validation, limits, deadlines, and private retirement capability checks remain in the real readers. Fixed outer errors expose no raw rows or private RPC details.

## Independent source review and dependencies

The bounded R03 source review found two issues before Runtime's first green check: a `STABLE` export function used a row-locking Auth read, and the Node reader omitted its final elapsed-time/abort check after synchronous validation. Runtime repaired both. Exact successor SQL `de681bc0447b72918698f431f9ea189aef42617c7dde541f5ce685451cfe9bdf`, profile `985cf18192de167c1ad8af47e08038ed618c68bc7f973484f188f077a52af6e5`, and helper `4b0af9a5...` received narrow source ACKs.

Runtime's terminal helper `834f7037cf64f227d4b056152b105ac78836d8718c8e6fd883cdb8184b2eabda` additionally short-circuits invalid numeric strings before `BigInt` and uses a function declaration for TypeScript narrowing. These deltas received source ACKs; SQL/profile values stayed unchanged. Private preimages and exact read-dependency transfers are recorded. This review supplies no Native execution or catalog approval.

## Evidence

Packet: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-owned-ai-privacy-u30cd8x6`.

- `omission-red.json/.log`: the actual old worker `5bcd0637...` succeeded while omitting supplied budget and retired feedback records with all AI flags false. One genuine behavior failure; no new R03 module import or missing-module failure. 885 inputs stable; group 94193 closed.
- `finite.json/.log`: 76 passed, comprising all 54 existing privacy-operation cases and 22 new coupled worker cases. Covers flag-off export, owner-wide historical organization/period data, exact decimal costs, unknown null usage, mandatory capabilities, denial, schema, foreign ownership, parent/proof mismatch, and row bounds. Tested helper `4b0af9a5...`; no application source changed afterward. Group 96493 closed.
- `types.json/.log`: preserved failure with 31 diagnostics, all in that Runtime helper's control-flow narrowing. The owned caller had none. `types-final.json/.log` passes on terminal helper `834f7037...`: five roots, 54 sources, zero diagnostics. Groups 96491 and 98022 closed.
- `privacy-fixture.json/.log`: all 35 existing privacy cases passed after the separately authorized positive RPC fixture additions. Group 98020 closed. Lint/format passed for the three initial owned source/test files and the later privacy fixture; groups 96492, 96490, 98019, and 98021 closed.

All receipts have stable source hashes and confirmed process cleanup. Exact arguments are in `commands.json`; commands used sealed Node 22.23.4, no dotenv, a 60-second deadline, and an 8 MiB log cap. No database, provider, Docker, or external compiler ran. Root owns the combined gate.

`assertion-preservation.json` confirms all 122 original privacy-operation assertion calls and 100 original privacy assertion calls remain unchanged after the approved bijective UUID fixture normalization. `fixture-uuid-mapping.json` records that mapping; the old test sources remain archived. No assertion or case was removed or weakened. The final five-file hashes, snapshots, dependency identities, and author-source manifest are in `release-packet.json`.
