# CR-A01-S02 observations from saved text

Updated 2026-11-13, Asia/Kolkata. Status: implemented and verified through local synthetic component DOM checks. Integrated checks, native/runtime behavior, empirical quality and CR-A01/release acceptance remain separate.

## Allocation and bindings

Only `app/components/ParseView.tsx`, `tests/components/Phase6Accessibility.test.tsx` and this handoff were allocated. The preserved frontend worktree remains detached at `a0b239299d75b0bd64b588fe743ebe2975fb28b9` with unrelated dirty work preserved. The coordinator owns shared documents and `CONTEXT.md`. The evidence route was not edited.

The extension contract has SHA256 `c6cf8f4716b7eb94b501d325d8bc7c1f2d8b93ca58795aaaebebb5becec52b17`; the saved-UI allocation has SHA256 `31570104f1a7b400b3dd7d14b5d8f1abcaefa3a1f69cbce9334dc172be18c38f`. Both were read and matched. Before implementation checks, the coordinator physically synchronized `app/lib/page-text-diagnostics.ts` SHA256 `c1fdfc504c39fde015ea6a0453c901c42151df3d56ef66847c797564e75326ee`; that exact browser-safe module was verified and left untouched.

| File                                            | Entry SHA256                                                       | Final SHA256                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `app/components/ParseView.tsx`                  | `51a966a0295d69867accab94fea8d0d6fb1098fd4cda10ec79e451336e261614` | `d28be85410b17a4541f68783abac2dcaef4c6bba3f4e0dbe393a09cb5101f4cf` |
| `tests/components/Phase6Accessibility.test.tsx` | `0be9ff1f1ccf9ccdf1b7ca88456963ac21a4a70fe296f5f73f6102f62a02cfb9` | `3158358972a85c44c680fb8d1af07cce925c031de4e2b9ab216135fb4a4981c9` |

## Behavior and preserved boundaries

The component calls the shared `inspectPageText` with original supplied `parseView.pages` and `totalPages`. It never scans component placeholders or reimplements the scanner policy. An exhaustive fixed label map renders the six generic reason types without importing the server PDF module.

"Observations from saved text" describes saved text groups. It states that original PDF page boundaries and whether text came from the PDF or OCR are unverified, and that extraction reliability and accuracy remain unassessed. Replacement/invalid/control-character observations ask the reader to compare with their PDF. Identical text is described as matching saved groups, not duplicate PDF pages. Empty reason lists retain the unassessed caveat. Unavailable metadata produces guidance without a derived reason list. No raw diagnostics, model identifiers, internal enums, counts or threshold terms appear in the new normal flow.

Recorded warnings remain separate and unchanged. The supplied object, original source display, availability labels, CSS selectors, handlers, fields and all seven prior component cases/assertions remain preserved. All five frozen producer/scoring/checksum/native-schema source hashes match the extension contract exactly; no producer or stored payload changed.

Review found one inherited allocation failure: `pages: []` and `totalPages: 2 ** 32` are accepted by the real durable `ParseViewSchema`, but the original `Array.from` fallback throws before the unavailable notice renders. The coordinator explicitly approved a tiny same-allocation exception. The fallback now uses the original count only when the core reports `missing_page_data`, which establishes a supported count. Other unavailable metadata gets one display-only placeholder. This adds no independent bounds policy and never creates observations from placeholders. A normal missing two-page result still has two placeholders.

Byte reconstruction recovers the original component exactly after removing the new import/declarations/observations and restoring only that approved fallback allocation expression. All original fixture and seven prior test bodies/assertions remain byte-identical. No correction forms, private behavior, numerical/scoring rules, parser versions, producer checksums, dependencies or routes changed.

## Reproductions and verification

All application commands used official Node `v22.23.4` at `/Users/vaibhavsuman/.codex/tools/resumide-node22/v22.23.4-darwin-arm64/node`. Vitest used `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic`, disabling environment-file loading.

The primary command was:

```sh
RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic /Users/vaibhavsuman/.codex/tools/resumide-node22/v22.23.4-darwin-arm64/node node_modules/vitest/vitest.mjs run tests/components/Phase6Accessibility.test.tsx --reporter=verbose
```

Before any component edit or shared-core import, the actual DOM RED had eleven failures and all seven prior cases passing. Real `parseSim` outputs supplied eight replacement characters and identical readable groups, alongside other content/unavailable controls. The accessible observations region was absent. Parser import and rendering succeeded; no missing-module failure was used.

The first implemented candidate, component SHA256 `4af203f4436ce2ce308e33a021a287454310d18cb3963690b4b1cd23791e9ea2` and test SHA256 `b3aad12898cc253e7ccf431fa8c6e9e87e9ef30ce919a6d9c877dfff83c7dcf6`, passed all 18 cases and scoped types/lint/formatting. The separately reviewed oversized fallback was then reproduced before its correction using the same command plus `-t 'bounds the saved-page fallback'`. It failed with `RangeError: Invalid array length` after real schema validation; the other eighteen cases were unselected by the filter.

After the approved correction, the primary focused command passed all 19 cases. The twelve new cases cover five content reasons, duplicate-group navigation and escaped source, missing/count-mismatched/nonsequential/unsupported metadata, no placeholder-derived claims, retained recorded warnings, empty reasons, object immutability and the schema-valid oversized fallback. The missing-pages case also checks the original two-placeholder behavior. No earlier assertion was weakened or disabled.

Scoped checks on the first implemented candidate exited zero:

- Exact Node plus `node_modules/eslint/bin/eslint.js app/components/ParseView.tsx tests/components/Phase6Accessibility.test.tsx`.
- Exact Node plus `node_modules/prettier/bin/prettier.cjs --check app/components/ParseView.tsx tests/components/Phase6Accessibility.test.tsx`.
- A TypeScript API program reading repository `tsconfig.json` options with roots consisting of the allocated component/test and `types/index.d.ts`, plus imports; `noEmit: true`, `incremental: false`, zero pre-emit diagnostics. No typegen or generated files.
- Byte reconstruction and all five frozen-source hash comparisons.

Final scoped formatting and preservation checks also passed. Types/lint were not repeated after the small fallback guard; the coordinator's first combined gate owns full final types/lint/build coverage. This worker ran no unrelated suite or native campaign.

Raw logs remain under `/tmp/resumide-a01-saved-20261113-` for coordinator custody:

| Log suffix               | Exit | SHA256                                                             |
| ------------------------ | ---- | ------------------------------------------------------------------ |
| `red.log`                | 1    | `2c07e2ca450a2e8830215d13038fe2d6b9fdb3a1db2c3ae38b114a47f0974fdf` |
| `green.log`              | 0    | `634e020b2bf76ee81aef1870a051a66110770216e69d0d316706d7c54a839f45` |
| `bounds-red.log`         | 1    | `5757682ab48a722dbbb63de06ef80f5ad871adc8b2053f19f0d50da826ca4a60` |
| `final-green.log`        | 0    | `794cdd5012440b28dde63f082d5cdd9909efe1d920ed77714af29ee5eeb66f17` |
| `types.log`              | 0    | `689af96a54f28fdf0b02489721bdb436c24b53d40ac32877a3d462ac32621096` |
| `lint.log`               | 0    | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `format.log`             | 0    | `17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20` |
| `preservation.log`       | 0    | `8cf1ec40a725c6aab6f57fcf5396176061ae201ef4379e504d639b48898ae1de` |
| `final-format.log`       | 0    | `17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20` |
| `final-preservation.log` | 0    | `af9376066890ec92452a2c78e289ff508d8e16d7f0e4fd7ea932bb655b8c8ea0` |

The installed `clean-user-facing-text` workflow inspected and cleaned the new UI prose: zero suspicious Unicode, unchanged bytes, low density, score `0.235` before and after. The same prose pass was applied to this handoff. These are hygiene observations, not proof of authorship or watermark removal.

## Handoff

The three allocated files are ready for coordinator integration with the shared core and native adapter. The coordinator owns the first combined affected gate and canonical evidence updates. There was no database/SQL, provider, real data, environment-file, OCR/native execution, Docker, Git mutation, publication or deployment action. Source regression proof does not establish reliable original PDF page boundaries, calibrated extraction quality, consumer acceptance or release approval.
