# AA7 private internal revalidation, 2026-11-06

Status: VERIFIED for the checks below. This is local engineering evidence, not formal acceptance or release approval.

The coordinator authorized safe focused checks, four reproduced P2 fixes, and integrated verification. Tests ran in the root checkout on `main`, HEAD `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, including the reviewed uncommitted candidate and preserved unrelated dirty files. Node.js was `v22.23.4`, acquired in the external npm cache without project dependency changes. AI was disabled and provider credentials were dummy values.

## Reproduction and regression scope

Four owned test files add 12 cases. Against the pre-fix root baseline, the targeted 59-case run failed 10 cases and passed 49. The failures demonstrated one cached transient startup failure, six formatted-unit mutations, two PDF loading races after dismissal/unmount, and one Escape keyup reopening. Quarantine retention and unchanged-unit controls passed. After explicit transfer of the owners' four corrected modules, all 59 cases passed.

- Startup uses mocked child processes; a failed reconciliation retries, while an existing-container quarantine stays closed without another dispatch.
- Resume wording rejects changed units inside `textbf`, `emph`, `textit`, nested formatting, grouped font declarations and formatted numbers. Each case also permits an unchanged metric. The existing `mathrm` case remained protected before the fix.
- Deferred PDF bytes cannot start `pdfjs.getDocument` after dismissal or unmount.
- An active nonempty editor selection stays dismissed after Escape keydown and keyup, then opens on a fresh selection. No fetch occurs.

These tests prove the named boundaries in a controlled unit/React environment. Metric matching remains conservative lexical protection, not semantic fact verification.

## Integrated root results

| Command                                                                                               | Result                                                                                        |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm run check:latex:source`                                                                          | PASS, exit 0                                                                                  |
| `npm run check:build-ai:source`                                                                       | PASS, exit 0                                                                                  |
| `npm run test:latex`                                                                                  | PASS, 5 files / 108 tests                                                                     |
| `npm run test:build-ai`                                                                               | PASS, 4 files / 95 tests                                                                      |
| `npx vitest run tests/components/LatexPdfPreview.test.tsx tests/components/BuildAiAssistant.test.tsx` | PASS, 2 files / 3 tests                                                                       |
| `npm run verify`                                                                                      | PASS, exit 0; 145 files / 1,203 tests, formatting, lint, type checking, web and worker builds |
| Focused ESLint, Prettier and `git diff --check`                                                       | PASS for the four test files                                                                  |

The focused counts overlap the full suite and must not be summed. The worker build retained the existing Vite `.env` NODE_ENV warning; it completed successfully. No credentials, private text or provider response bodies are included here.

## Evidence limits and next acceptance checks

The initial static/unit phase ran no services. A separately authorized compiler-only runtime phase is recorded below. No real provider, database, hosted fixture, browser, web app or publication operation ran. No test credentials or accounts were created, so this task required no cloud cleanup. `verify:ci` was not run: its broader DB/browser flow includes local Docker Supabase/reset assumptions outside the authorized scope.

The Oct31 runtime receipt `LATEX_RUNTIME_RECHECK_20261031.json` remains historical evidence for 19 runtime groups and image `sha256:600c3815bdf12a4e3df6d332c0aea11685fd122f0fc3240b7be3c802fd23bf4f`. Its source hashes matched the Nov6 pre-fix root baseline. The startup adapter changed in this task; the new recovery/quarantine tests cover that change, but the old receipt must not be relabeled as a fresh runtime run; the new Nov6 receipt below now supplies current runtime evidence. No engine or containment policy change was made. Compiler OS/package CVE scanning remains unrun; npm checks do not substitute for it.

The Oct30 AI closeout's failed 401 is historical. A later preserved receipt records successful bounded synthetic provider smoke; neither is a new live product-flow acceptance result. Current browser evidence is inherited from Oct31 toolbar repair and earlier controlled feature flows. A coherent current-candidate browser check is the next useful acceptance tier if the coordinator authorizes services and scoped synthetic fixtures. A live AI product flow needs separate current authorization. Default-off behavior, candidate confirmation, PDF accessibility limits and formal release gates remain unchanged.

## Current candidate SHA-256 binding

| File                                         | SHA-256                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/latex-sandbox.ts`            | `e7b0b41aee2d83553c29437264524cf71f4fbb9a6bf8b1f760e4041d5eea2477` |
| `app/lib/server/build-assist.ts`             | `fcf452ab04fd247de4374727a3d8e3b0ae551420ce5f5659f6d684e9b65e3b65` |
| `app/components/LatexPdfPreview.tsx`         | `ffef3ff2f44e0297186ee6dd37660b8e93b4df388daa4bf697d7f5a7331b2947` |
| `app/components/BuildAiAssistant.tsx`        | `1186438a8e9c8411f9f3a1844281ecab2dc794220a24e3f594c1658faf2656c3` |
| `tests/unit/latex-sandbox.test.ts`           | `93c99b80b1881d260f180ad1ed5b5c6b4ea3f46d39b9d98690d5864524631ad2` |
| `tests/unit/build-assist.test.ts`            | `6a927d2cb757114f95e799c42434969b3c103533dc5d5a905ba0058cc99d51c2` |
| `tests/components/LatexPdfPreview.test.tsx`  | `126c9ce18a040d97152c2c663a0ed4a6f2e768c848851afe82b84a2a5f51c8e7` |
| `tests/components/BuildAiAssistant.test.tsx` | `45c3e02d3ee034c7da5a149138b154cebd3c612c9074601babb3a40a1a5295e1` |

## Read-only runtime availability

The subsequently authorized availability checks (`docker version`, `docker info` and exact pinned `docker image inspect`) each exited 1: the configured Unix Docker socket `/Users/vaibhavsuman/.docker/run/docker.sock` does not exist. Docker was not started. Image presence is unknown, not absent. This was the initial availability result. The coordinator subsequently started Docker for compiler-only tests; the successful follow-up is recorded below.

## Fresh compiler-only runtime revalidation

After the coordinator started the existing Docker app, Docker Server `29.9.2` became available. The running-container inventory was empty and the exact pinned image was present. No image build or download occurred.

`npm run verify:latex -- sha256:600c3815bdf12a4e3df6d332c0aea11685fd122f0fc3240b7be3c802fd23bf4f` completed with exit 0 and 19 executed groups. [The new machine receipt](LATEX_RUNTIME_RECHECK_20261106.json) binds the current adapter/source hashes, immutable image, runtime files and closure manifest. Historic receipts were preserved.

The run exercised Landlock ABI/read/write/exec confinement, actual Docker network/resource configuration, PDF active-content/bounds validation, a real two-page macro/math/layout PDF, a neutral negative-wrapper control, file-read/write/package attempts, unsafe links, page overflow, overfull layout, recursive macros and CPU loops. It also proved production cancellation, active cancellation, a real paused-worker wall timeout and two-active admission with exact cleanup. Generic `compile_failed` negative outcomes do not by themselves prove a particular denial path; the independent OS probes establish those access restrictions. Overfull layout returned `layout_overflow`; unsafe PDF/link and excessive pages returned `output_invalid`.

After completion, all converter-labelled containers, including stopped containers, were absent; the complete running-container inventory was empty. No database container, Supabase operation, application web service or provider request was started. Docker itself remains coordinator-owned; it was not stopped by testing. This closes the earlier availability blocker and refreshes the runtime evidence for the startup adapter change.

The PDF skill marker initially failed because the skill cache changed from version `26.1030.10813` to `26.1104.12130` between discovery and execution. The corrected installed marker succeeded, but the verifier had already started. This ordering deviation is retained; it does not alter the recorded runtime assertions. Structural PDF inspection does not establish assistive-technology or PDF/UA acceptance. Compiler CVE scanning remains unrun.
