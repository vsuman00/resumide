# CR-A01-S02 legacy availability UI

Updated 2026-11-13, Asia/Kolkata. Status: implemented and verified by focused synthetic DOM and source checks; coordinator integration, native/browser evidence, empirical reliability and release acceptance remain separate.

## Allocation and baseline

The coordinator allocated only `app/components/ParseView.tsx`, `tests/components/Phase6Accessibility.test.tsx` and this handoff in the preserved frontend worktree. HEAD is detached at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. The worktree has extensive inherited dirty work; the two allocated source files were clean at entry and matched the coordinator's exact baselines. No unrelated file was edited. The coordinator owns shared documents and `CONTEXT.md`.

The frozen contract `a01-s02-contract.json` has SHA256 `17ed66f08007769f0261c8a0d74632cacecd50d2b20945f98a70c9237c3a8d9b`; the legacy allocation has SHA256 `3de4481f13029a2e901248775b2522358cff27d0d844205a69e3d171223952b7`. Both were read and matched. The separately allocated evidence route has not been edited.

| File                                            | Entry SHA256                                                       | Final SHA256                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `app/components/ParseView.tsx`                  | `4be66a398fc83a8c58ec9e283a76cf419ecce4d9fe7463fb05aa47a65f00eeea` | `51a966a0295d69867accab94fea8d0d6fb1098fd4cda10ec79e451336e261614` |
| `tests/components/Phase6Accessibility.test.tsx` | `42c292cc4b14f2778e7e4b0e55566c78cd0c07e1310d370400aab6541e614db4` | `0be9ff1f1ccf9ccdf1b7ca88456963ac21a4a70fe296f5f73f6102f62a02cfb9` |

## Result and preservation

Both count-band labels now say text availability. The introductory copy explains that availability reflects extracted text length and that reliability and accuracy are unassessed. An empty warning list says: "No additional page warnings were recorded. Page reliability and accuracy remain unassessed."

The source diff contains four prose changes and Prettier's equivalent JSX whitespace folding. Stored `confidence` fields, types, fallback data, CSS selectors, page navigation, extracted content, warnings and all executable decisions are preserved. Four DOM regression cases cover all three stored bands and the empty-warning boundary. Exact reconstruction preserves all original test bytes except the affected `Low confidence` assertion, now `Low text availability`.

There were no numeric, routing, schema, backend, dependency, database, OCR, provider, environment-file, Docker, Git mutation, publication or deployment actions.

## Verification and frozen receipts

All application checks used the exact official Node `v22.23.4` at `/Users/vaibhavsuman/.codex/tools/resumide-node22/v22.23.4-darwin-arm64/node`. Vitest used `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic`, which disables environment-file loading. This leaf exercised synthetic component DOM only.

The RED command, run before the copy fix, was:

```sh
RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic /Users/vaibhavsuman/.codex/tools/resumide-node22/v22.23.4-darwin-arm64/node node_modules/vitest/vitest.mjs run tests/components/Phase6Accessibility.test.tsx --reporter=verbose
```

It exited 1: five failed and two passed. The actual rendered DOM contained `confidence`, `parse-confidence is-high` and `No page-specific limitations detected.` Assertions failed because `High text availability`, the equivalent medium/low labels and the bounded recorded-warning text were absent. Imports and rendering succeeded. The same command after the fix and scoped formatting exited 0 with seven cases passing.

Final source checks exited 0:

- Exact Node plus `node_modules/eslint/bin/eslint.js app/components/ParseView.tsx tests/components/Phase6Accessibility.test.tsx`.
- Exact Node plus `node_modules/prettier/bin/prettier.cjs --check app/components/ParseView.tsx tests/components/Phase6Accessibility.test.tsx`.
- A bounded TypeScript API program reading the repository `tsconfig.json`, with roots `app/components/ParseView.tsx`, `tests/components/Phase6Accessibility.test.tsx` and `types/index.d.ts`, plus their imports; `noEmit: true`, `incremental: false`. No typegen or generated files.
- Exact reconstruction of the original test bytes, allowing only the intended assertion replacement.

The raw logs remain under `/tmp/resumide-a01-availability-20261113-`. The following suffixes and hashes freeze the local receipts for coordinator custody; no raw candidate text is present.

| Log suffix                 | Exit | SHA256                                                             |
| -------------------------- | ---- | ------------------------------------------------------------------ |
| `red.log`                  | 1    | `166ef42bf55028992a7a9dd17a1c94a8f370946d9e2f54ad3734e1c5db883573` |
| `green.log`                | 0    | `20dbf42bad4684d780a9a94bd187a5b4545a7a2246426774aa7fc26750ad3182` |
| `final-green.log`          | 0    | `e99df648d4fa0f7f50b03a71061a9b5c71c5d2172b224e955b164bf26e294c3a` |
| `types.log`                | 2    | `689a899657ab134e24d6c8fb82961cf469edf49fb837b2c354eb90d500d45416` |
| `types-retry.log`          | 0    | `689af96a54f28fdf0b02489721bdb436c24b53d40ac32877a3d462ac32621096` |
| `format.log`               | 1    | `06ca506201da9a9ddfb7d4a72f8ab2a6aa9b257f8ea8da9c67fc5c303b40b0c0` |
| `final-format.log`         | 0    | `17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20` |
| `final-lint.log`           | 0    | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `test-preservation.log`    | 0    | `cdb34e6289019e86672f09e49f3c10abcd9dc467558f5fd12d3ea8ac318f442c` |
| `preservation.log`         | 1    | `69ab9619259588a04a3c0f6c6123552cbeaec0adc6df057942c56f83bf332f5d` |
| `preservation-refined.log` | 1    | `52aa98c40f7b33a820a31d0393e551bafd9224a86f8b877fc706ae4ce3969781` |

The first scoped TypeScript harness placed its config in `/tmp` and could not resolve `node` or `vite/client` types. Reading the repository config through the TypeScript API resolved this verification setup failure. Initial formatting flagged one JSX wrap; scoped Prettier corrected it. Two optional AST preservation harnesses were too strict: one counted equivalent single-space JSX folding; the second compared aggregate syntax-list prose. They did not establish product defects. The final manual source diff and exact original-test reconstruction support the preservation claim; no AST equality result is claimed.

The installed `clean-user-facing-text` workflow inspected and cleaned the replacement UI prose: no suspicious Unicode, no changes, low density, score `0.1543` before and after. The same handoff pass found no suspicious Unicode and produced identical bytes; density was low. This is a text-hygiene result, not proof of authorship or watermark removal.

## Next action

The coordinator can integrate these two exact source files and this handoff, preserve the failed receipts, then run the combined affected gate with the backend diagnostics. Evidence-page work waits for its separate allocation and exact backend bytes. Full repository typecheck/lint/build, native/browser checks and release acceptance were not run by this leaf.
