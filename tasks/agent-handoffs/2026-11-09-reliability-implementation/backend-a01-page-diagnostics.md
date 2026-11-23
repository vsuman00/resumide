# CR-A01-S02 backend page diagnostics

2026-11-13, Asia/Kolkata. **SOURCE IMPLEMENTED; 28 SYNTHETIC CASES VERIFIED; ROOT INTEGRATION PENDING.** Base HEAD supplied by Root: `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, with preserved dirty prerequisites. This worker owns only the four files in the [backend allocation](a01-s02-backend-allocation.json), SHA256 `69dd34a342d3fe6a618eea5d70648d843ce4f0e02d4bfa280068dfb79c0dd65c`. Root owns Git state, canonical plans, contracts, integration and `CONTEXT.md`.

## Contract and change

The [frozen contract](a01-s02-contract.json), SHA256 `17ed66f08007769f0261c8a0d74632cacecd50d2b20945f98a70c9237c3a8d9b`, is implemented without an interface deviation. `deriveNativePageDiagnostics(native: NativeEvidence): NativePageDiagnostics` is exported from `app/lib/server/ocr/pdf-detection.ts`. Its version is `native-page-review/1.0.0`; reliability is always `unassessed`.

The projection reports page identity, the existing non-whitespace UTF16-unit count, availability at eight units, ordered content reasons and exact duplicate page IDs in source order. It detects replacement characters, unpaired surrogates and the specified C0/DEL controls. Valid supplementary pairs and standard whitespace remain permitted. Only exact raw text with at least eight non-whitespace units enters local duplicate grouping. Blank and short pages receive no duplicate allegation. The input is already validated and bounded to twenty pages and 500,000 aggregate units. Raw strings remain local; output contains metadata only.

`loadEvidenceReview` adds `nativePageDiagnostics` after the existing owned analysis, stored-attempt replay and captured correction-prefix checks. Stored envelopes, historical extractor semantics, blockers, raw strings, spans, offsets, OCR routing and the eight-unit threshold remain unchanged. Every review remains scoring-ineligible.

## Evidence

Receipts, source snapshots and the reviewed source diff are in `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a01-page-zh5dpxm1`. They contain synthetic data only. The exact official Node binary was verified as v22.23.4 with SHA256 `2cc28a1880d0774616959f2210ee739bffa6ac695c887e8988a496a21271f6c0`.

- `red.json` preserves two actual assertion failures through the existing `loadEvidenceReview`, with a validated stored envelope and mocked storage. Eight replacement characters and identical readable pages returned no diagnostics. Only existing exports were imported; neither failure was a missing-import error. Original production sources and the two-case test are preserved as `red__*.txt`.
- `green.json` records **28/28 passing** cases using `node_modules/vitest/vitest.mjs run tests/unit/native-page-diagnostics.test.ts --no-cache` under the pinned Node. Coverage includes both original failures, zero/seven/eight-unit boundaries, all specified controls, malformed and paired surrogates, exact duplicate rules/order, the maximum validated aggregate, source/offset preservation, historical replay, rejection before projection for invalid ownership/source/score inputs, and unchanged OCR failure states. Three native extraction-to-stored-review controls observe zero OCR calls, including replacement and duplicate content.
- `types.json` records project-options scoped no-emit checking: five roots, 24 transitive project source files, zero diagnostics. `lint.json` and `format.json` pass for the three owned source/test files. Root owns full types/lint/web/worker checks and the combined affected gate.

Every completed command used the sealed synthetic environment with `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic`, dotenv disabled, AI disabled and fake credentials. The runner enforces a 60-second deadline and 8 MiB log cap. Its Git-free source enumeration records 702 nonsecret source inputs with no drift during each check. Process identities and exited owned groups are recorded; `cleanup-final.json` independently confirms all five groups absent. No unchanged closed campaign was repeated.

## Frozen source packet and handoff

| File                                         | SHA256                                                             |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/ocr/pdf-detection.ts`        | `5a8d8925dd838352e56829c1ce9c96336a4e2b1f55ba998849a8d22bf9afadbc` |
| `app/lib/server/evidence-review.ts`          | `59c401cef6c6b777cd1d789eb9d3ec7f5b10f5f5f1de321d51b0c75518779918` |
| `tests/unit/native-page-diagnostics.test.ts` | `9eb1c61dac4b7ea1918cacffd493ed36b3fb0fe2bf44e75bd4fc7e567a808eb0` |

Only these three source/test files and this handoff were edited. The installed `clean-user-facing-text` workflow is applied to handoff prose while preserving code, exact values, paths and claims. No database/SQL, provider, OCR engine, Docker, real environment, owner data, Git or deployment action ran. Synthetic projection checks do not establish extraction quality, calibrated confidence, native storage/browser behavior, owner acceptance or release approval. Root should review and integrate the frozen packet, allocate the evidence display against its exact types, then run one combined affected gate. CR-A01 remains open beyond this slice.
