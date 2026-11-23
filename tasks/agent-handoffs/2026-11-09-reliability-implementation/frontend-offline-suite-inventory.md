# Offline unit and component suite inventory

Read-only inventory of the current Root checkout, 2026-11-15. No tests, provider calls, subprocess fixtures or services were launched. No real env file was opened. Only this handoff was written.

The exact command `npm test -- tests/unit tests/components` selects 263 files: 237 unit and 26 component tests. The installed Vitest path filter uses either substring (`node_modules/vitest/dist/chunks/cli-api*.js:10927`). Integration and e2e paths are excluded. `vitest.config.ts:1–28` has no setup/global hooks; private mode sets `envDir:false`. It does not install a universal network-denial shim.

## Concrete seal gap

The command is **not dotenv-sealed in the current checkout**. `tests/unit/ocr/ocr-pilot-cli.test.ts:7–22` invokes the installed `vite-node` with `env:{PATH:""}`, dropping `RESUMIDE_PRIVATE_VERIFY`. Before executing the guarded OCR script, `node_modules/vite-node/dist/cli.mjs:65–80` creates Vite and calls `loadEnv(..., "")`. Without the marker, our config leaves `envDir` undefined; Vite resolves it to the checkout root and reads its dotenv files (`dep-CkSfqg8D.js:49243–49247`, loader at16932). Empty PATH blocks Docker but does not block Node's env-file reads. A sealed parent alone cannot repair that child environment. This is source evidence, not a newly executed RED. No skip or frozen test edit was made. Root must resolve this narrow subprocess seal before the exact broad invocation.

Pins: test `21fa5772a60bc6a8d60e5f45a4b1a50e437bf7cb9008e1d48014eb81b409b3c4`; config `ecd6b6d407a69ebc631187b2d281b7c70675c5f5421d098f190b988eb47af399`; installed vite-node CLI `34d09cf271b09581d8bdcd7ce10e0dec985683433601ac79e82916e1d89366e4`.

## Actual local effects and safeguards

| Files | Actual execution boundary |
| --- | --- |
| `private-verification.test.ts:138–240` | Real Git init/add/ls-files, Node descendants and signals, confined by child `cwd` to a fresh temporary directory. Root explicitly permits this disposable fixture, without workspace Git mutation. Child env forwards only PATH/HOME/TMPDIR/LANG. Use a fresh empty HOME to avoid user Git configuration; the test itself does not disable system Git configuration. No remotes, commit, push or credential operation is requested. Nested process groups have explicit identity checks and cleanup. |
| `document-worker-cli.test.ts:3–47`, `latex-current-render.test.ts:90–169`, `latex-build-inputs.test.ts:660–695`, `latex-build-cancellation.test.ts:323–356` | Real Node CLI children. Document checks fail before client imports. LaTeX children reject bad arguments or run a temporary fake Docker executable; sandbox tests mock child_process. No real LaTeX/compiler/Docker dispatch found. |
| `trivy-metadata.test.ts:15–19,175–190,409–445`, `latex-probe-base.test.ts:64–72`, `latex-build-inputs.test.ts:45–51`, `ocr/text-fusion.test.ts:3–32`, `ocr/runtime-memory.test.ts:4–36` | Real isolated Python children, temporary files/FIFOs and pure helpers. Trivy replaces sockets/HTTP; prefetch receives fake openers; OCR extracts function definitions instead of running recognition. |
| `artifact-renderer.test.ts`, `artifact-corruption.test.ts:18–43`, OCR fixture suites | Real Node worker program `app/lib/server/artifact-worker.mjs`, PDFKit/DOCX parsing, and installed canvas rasterization of authored synthetic content. These are local PDF/render workers, not native LaTeX or OCR recognition. Workers use empty env and bounded heap/time. No owner PDF is read. |
| SDK, route and component suites | Inspected transports use injected fake fetch, mocked SDK execution/admin clients or fake RPC. `reliability-ai-live.test.ts` injects every observer fetch; its imported CLI only executes with absent `--run-ai-live`. AI doctor tests read authored temporary env files and inject fetch. No actual provider, DB or browser launch found. |

## One-run operating envelope

After the child seal is resolved, retain the exact argv above under pinned Node22, an allowlisted private env and no inherited credentials, NODE_OPTIONS, proxy or preload configuration. Set private mode explicitly; retain synthetic config values required by existing tests. Use a fresh empty HOME for subprocess fixtures. Existing tests need writable OS temp, temporary `tests/.idle-worker-*` and `docs/evaluation/aa7-completion-*` directories, cleaned in finally blocks. Python3, `/opt/homebrew/bin/python3.14`, vite-node, pdfjs Liberation font/license and both `assets/fonts/NotoSans-{Regular,Math-Regular}.ttf` are present. Presence was checked, not interpreter execution.

Use one 600-second outer deadline, 32MiB log cap and owned-group cleanup, retaining the suite's existing per-test limits and default worker settings. This is a conservative operational bound, not measured runtime. Several benchmark CLI children use synchronous spawn without their own timeout; Vitest timers cannot interrupt those calls. Keep cleanup identities for nested private-runner groups. No automatic rerun or new skips are proposed.

No outstanding broad-suite failure receipt was found in the active context/latest two closeouts. Their 112/9 and176/9 successes do not prove this 263-file scope. The discovered `r14-offline-corrections.log` records three Node and two Python passes, not a broad run. The current inventory makes no passing-suite, Native or external-effect execution claim.
