# Nov6 Build frontend audit and bounded fixes

- Role: `/root/aa7_workspace`, frontend. Updated 2026-11-06, Asia/Kolkata.
- Root base: `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, main with extensive unrelated dirty work. Audited current root, including October 31 toolbar/navigation/contrast changes; historical worktree code was not treated as current.
- Applied requested ponytail workflow: trace existing paths, reproduce concrete failures, add the smallest guard in each owning component. No dependency or new abstraction.
- Coordinator: [Nov6 run](2026-11-06-aa7-coordinator.md). Scope is private internal validation. No public release or formal AA7 acceptance is claimed.

## Confirmed defects and exact production changes

1. `app/components/LatexPdfPreview.tsx`: dismissal during deferred `pdf.arrayBuffer()` could still start PDF.js afterward. The effect cleanup ran before `loading` existed; a subsequent loading failure had no task destruction. An actual React/JSDOM probe of the root component reported one loading task started after dismissal and zero destroyed. The fix obtains the bytes, then checks `active` again before `getDocument`. The same probe after the fix starts zero tasks after dismissal.
2. `app/components/BuildAiAssistant.tsx`: Escape dismissed on keydown, but the generic textarea keyup selection listener reopened the dialog while nonempty text remained selected. The actual component probe reported dialog counts `1 -> 0 -> 1` across selection/Escape keydown/Escape keyup. The listener now ignores Escape keyup. After the fix, the dialog remains closed; a fresh selection still opens it.

Only these two assigned component files changed. The coordinator reviewed their small diffs. Testing owns permanent deferred-byte and selected-editor Escape regressions. No source/compiler/AI policy, undo semantics, toolbar presentation or test assertion was weakened.

## Verification performed by this worker

Node 22.23.4, existing dependencies, actual components transpiled in memory with synthetic React/JSDOM doubles: both failure reproductions and corrected controls passed. No files, services, browser sessions, providers or databases were needed for these probes. Focused ESLint, Prettier and `git diff --check` passed.

The initial worktree-wide TypeScript run failed only because transferred `tests/unit/browser-test-target.test.ts` referenced missing `scripts/browser-test-target.ts`. No component type error was reported. The coordinator owns resolving this baseline transfer limitation and combined verification. The tester's separate report records the integrated suite; this worker did not rerun it or claim it as independent evidence.

## Read-only browser configuration review

Recommend six existing cases, sequentially on the testing-owned port3110:

- `playwright.latex.config.ts`, grep `exact current macro source|keyboard resizing|cancellation and late response`.
- `playwright.build-ai.config.ts`, grep `hover and keyboard selection|review/apply/undo|edits/cancel/dismiss`.

This combines actual synthetic PDF rendering/download, current buffer/mobile/splitter behavior, cancellation/late response, AI hover without requests, apply/undo and selected-context cancellation. Retain the component regressions for the deferred-byte lifecycle race. Extend the existing AI hover case with selected-text Escape keydown/keyup dismissal. Narrowly extend the existing toolbar cases to assert 44-pixel controls, fixed disabled/ready download geometry and keyboard options activation at desktop and narrow mobile sizes.

The real-compile test currently explicitly writes `docs/evaluation/build-clean-toolbar-20261031.png`. Before running it, the testing owner must retarget that screenshot to a new Nov6 artifact; do not overwrite historical evidence. Configured automatic screenshots and traces are off, but this explicit screenshot remains active.

## Environment and cleanup prerequisites

Both dedicated configs use Chromium, one worker, no parallel suite execution and `reuseExistingServer: false` at `http://127.0.0.1:3110`. Build the reviewed integrated candidate first. Use Node22 for Playwright and the child server PATH. Keep the compiler Docker worker only; never start a Docker database or reset/migrate a database.

Load only the approved managed Supabase direct target privately. `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` are required. The dedicated guards check target equality, but do not themselves reject localhost: the testing launcher must independently verify the exact approved managed target and reject local database URLs.

Required fixture guards:

- `AA7_HOSTED_TEST_AUTHORIZATION=temporary-synthetic-users-20261030`.
- `AA7_TEST_SUPABASE_URL` exactly equals the approved `SUPABASE_URL`.
- `AA7_AUTH_RECEIPT_FILE` is a new private file matching `/tmp/resumide-aa7-[a-z0-9-]+.jsonl`. Precreate exclusively with mode0600 and verify permissions/writability before creating owners; the append mode does not repair an insecure existing file.
- Standalone converter configuration requires parent `AI_ENABLED=false`; its server also forces false. Supply a non-live placeholder key if required by server config. Set `LATEX_COMPILER_IMAGE` to the reviewed immutable local image; actual compiler success depends on its availability.
- AI configuration requires `OPENAI_API_KEY=build-ai-harness-no-live-key`. The server forces `AI_ENABLED=true`, `BUILD_AI_ASSIST_ENABLED=true`, `LATEX_CONVERTER_ENABLED=true` and `BUILD_AI_TEST_HARNESS=selected-context-synthetic-only`. Use the existing official OpenAI base URL so the test-only preload intercepts `/v1/chat/completions`; no production egress bypass or live key. Hover and Escape cases must remain zero-request controls.

The browser helper creates temporary synthetic auth owners, records owned identifiers/rate keys in the private ledger and signs them in. Every test must retain its `finally` cleanup. Verify auth/session/profile/membership/organization cascades and content-free consent/audit cleanup. Fixture cleanup does not delete private rate buckets: the tester must separately remove only exact owned user and monthly keys from the ledger and verify zero remaining rows. Preserve shared `latex:global:v1` and `build-ai:global:v1` buckets and respect their rate windows. No broad reset, pruning, migration or account cleanup is permitted.

No browser, database, provider, Docker or service action was performed during this configuration audit. The tester owns runtime execution and dated receipts; these recommendations are not acceptance evidence.
