# CR-A01-S02 evidence-page diagnostics

Updated 2026-11-13, Asia/Kolkata. Status: implemented and verified through focused synthetic Router SSR and source checks. CR-A01 acceptance, integrated checks, native/browser behavior, empirical reliability and release acceptance remain open.

## Allocation and source binding

The coordinator allocated only `app/routes/analysis.evidence.tsx`, `tests/unit/evidence-review-route.test.ts` and this handoff in the preserved frontend worktree. Detached HEAD remains `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, with unrelated inherited dirty work preserved. The two allocated source files matched their entry hashes. The released legacy UI leaf was not edited again. The coordinator owns shared documents and `CONTEXT.md`.

The evidence allocation has SHA256 `7c88bcfdd1712b8686f93f9cd152c8b042572c9638b11797d44592cfb0cc4671`. The unchanged diagnostic contract has SHA256 `17ed66f08007769f0261c8a0d74632cacecd50d2b20945f98a70c9237c3a8d9b`. The coordinator physically synchronized the reviewed backend before this leaf began: `ocr/pdf-detection.ts` SHA256 `5a8d8925dd838352e56829c1ce9c96336a4e2b1f55ba998849a8d22bf9afadbc`; `evidence-review.ts` SHA256 `59c401cef6c6b777cd1d789eb9d3ec7f5b10f5f5f1de321d51b0c75518779918`. These exact bytes were verified and left untouched.

| File                                       | Entry SHA256                                                       | Final SHA256                                                       |
| ------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `app/routes/analysis.evidence.tsx`         | `79f8ab2a0f7a68f72347edfc9aa05a863eb413484cc163714dffa320a853f939` | `4b14f99286d18c3629593facfc7f2b3ce765e8c340d5cfc22ce8f5c5dd36f759` |
| `tests/unit/evidence-review-route.test.ts` | `5ebd93471e4af2a7e47cbe7e39ab81b3cbdba9c6ddbce32f297ad6c7f4487963` | `7591eddc3fdad07975ee7df596fd08e344b9c66a3163d872c73362c2b124a40f` |

## Display and preservation

The page review section renders each page number, plain native-text detection status, recorded OCR-page presence and fixed labels for all six derived reasons. Exact counts and the eight-unit availability rule appear only within a closed "Text detection details" disclosure. The invalid-character warning asks the reader to compare the page with their PDF. Identical native text is described only as text extracted from another page; matching page numbers are shown without alleging duplicate PDF pages. Empty reason lists retain the explicit unassessed reliability and accuracy statement.

A separate recorded-limits section renders all six existing blocker labels and all seven existing OCR failure labels. Unsupported, timeout, cancellation, resource limit, engine failure, invalid request and invalid output remain distinct. The absence of a recorded failure does not claim engine availability or successful extraction. An OCR page record can coexist with insufficient text and withheld scoring.

All label maps are exhaustive against the synchronized read-model types through `satisfies Record`. There are no casts or suppressions. The new sections render fixed prose and bounded metadata only. Existing source excerpts remain in their separate UI and retain React escaping.

Removing only the new label declarations and diagnostic sections reconstructs the entire original route byte for byte. Existing authentication, same-origin checks, private headers/cookies, loader/action/meta/error handling, feature flags, form keys/revisions, corrections, source text and score withholding are unchanged. Exact reconstruction also confirms all original test bodies/assertions and form helpers are preserved. Ten SSR cases were added to the original nine cases.

No backend, stored schema, retry/routing policy, scoring, dependencies, database, OCR execution, provider, environment file, Docker, Git mutation, publication or deployment action occurred. The recorded OCR fixture is a static validated synthetic envelope; no recognition function is called.

## RED, GREEN and source checks

All application checks used official Node `v22.23.4` at `/Users/vaibhavsuman/.codex/tools/resumide-node22/v22.23.4-darwin-arm64/node`. The focused command was:

```sh
RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic /Users/vaibhavsuman/.codex/tools/resumide-node22/v22.23.4-darwin-arm64/node node_modules/vitest/vitest.mjs run tests/unit/evidence-review-route.test.ts --reporter=verbose
```

The private mode disables environment-file loading. Tests use `createStaticHandler`, the actual route loader/component, `createStaticRouter` and `StaticRouterProvider` with `hydrate: false`. Synthetic envelopes are validated by `reconcileDocumentEvidence` before rendering.

The validated RED, captured before any route edit, exited 1 with ten missing-display assertions and all nine original cases passing. The actual HTML lacked `Page extraction review`, the unassessed empty-reason statement and each fixed recorded-OCR label. Imports, schema validation and Router SSR succeeded. An earlier retained RED had nine such display failures plus one fixture setup error: a blank saved-OCR record used `review_required` instead of `insufficient`. Only that fixture status was corrected before the validated RED.

The first implemented candidate, route SHA256 `b60ff3ec12c78440a0191cbaeb744811e65a24f886c58632b82505d57f698edb` and test SHA256 `705765dfe09c2bdd36b8d97fa2d85c14389a6b97f8ba2fc5de5eed5abca5abf5`, passed all 19 cases plus scoped types, lint and formatting. Coordinator product review then requested plain detection labels, optional technical details and an actionable invalid-character warning. These changes affected only the new declarations/sections/assertions.

The final candidate ran only the ten affected new SSR cases, as requested by the coordinator:

```sh
RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic /Users/vaibhavsuman/.codex/tools/resumide-node22/v22.23.4-darwin-arm64/node node_modules/vitest/vitest.mjs run tests/unit/evidence-review-route.test.ts --reporter=verbose -t 'renders bounded|keeps empty|renders the recorded|shows recorded'
```

It exited 0: ten passed, nine unselected by the test-name filter. No source test was skipped or disabled. Coverage includes all six page reasons, all six blocker labels, all seven OCR failure labels, an empty reason list, absent OCR records and a recorded-but-insufficient OCR page. Assertions also verify four closed details disclosures, exact counts/rule inside them, no UTF-16 or threshold prose outside them, escaped synthetic source text, no source sentinel in diagnostics, preserved correction fields, immutable evidence and `scoringEligible: false`. No additional full route campaign, types or lint was run after this product correction; the coordinator owns those final integrated checks.

These bounded source checks exited 0 on the first implemented candidate:

- Exact Node plus `node_modules/eslint/bin/eslint.js app/routes/analysis.evidence.tsx tests/unit/evidence-review-route.test.ts`.
- Exact Node plus `node_modules/prettier/bin/prettier.cjs --check app/routes/analysis.evidence.tsx tests/unit/evidence-review-route.test.ts`.
- Exact Node with a TypeScript API program reading the repository `tsconfig.json` through `readConfigFile` and `parseJsonConfigFileContent`. Its roots were the allocated route, allocated test and `types/index.d.ts`, plus imports. `createProgram` used parsed repository options with `noEmit: true` and `incremental: false`; `getPreEmitDiagnostics` returned no diagnostics. No typegen or generated files.
- Byte reconstruction of the original route and original test bodies/helpers.

Scoped formatting and byte reconstruction passed again on the final product candidate. All nine original cases remain unchanged; their last leaf execution was the first candidate's 19-case pass.

Raw logs remain under `/tmp/resumide-a01-evidence-20261113-` for coordinator custody:

| Log suffix                 | Exit | SHA256                                                             |
| -------------------------- | ---- | ------------------------------------------------------------------ |
| `red.log`                  | 1    | `1273616ee71b00abd908be99e831522ee99d7992c795006bf54f698180ec9a9f` |
| `red-validated.log`        | 1    | `ae7b8df5e9ca4cdbda4c4145c6e6477c8ded1b0bc813da1949bd5464ffd44008` |
| `green.log`                | 0    | `eb26b83a880e9564a570b9445a70dd83c7795e01a93cf47f761704e5a127d6c5` |
| `types.log`                | 0    | `689af96a54f28fdf0b02489721bdb436c24b53d40ac32877a3d462ac32621096` |
| `lint.log`                 | 0    | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `format.log`               | 0    | `17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20` |
| `preservation.log`         | 0    | `2e507be2991e894775cfc8cd70c5f38868a42f3a6a73e21ee3e5603e3235d1a3` |
| `product-green.log`        | 0    | `66ae623e555ac6910bb3bde8f311439974d65f3db96e0d8ea5e2c9b9ab030a42` |
| `product-format.log`       | 0    | `17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20` |
| `product-preservation.log` | 0    | `4091c5de871acb96a8248987d37c9916ef01950537247950a8b0994f2de9b0b8` |

The installed `clean-user-facing-text` workflow inspected and cleaned the new UI prose: zero suspicious Unicode, zero changes, low density, score `0.235` before and after. The same prose pass was applied to this handoff. These are hygiene observations, not claims of authorship or watermark removal.

## Next action

The route and test bytes are frozen for coordinator review and integration. The coordinator owns the single combined affected gate and canonical evidence updates. This leaf does not claim full repository CI, native/browser execution, representative validity, calibrated quality or CR-A01/release acceptance.
