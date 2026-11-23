# CR-A12: explicit rewrite workspace initialization

- Updated: 2026-11-15
- Author: `/root/a01_page_backend`
- Status: IMPLEMENTED; VERIFIED_LOCAL with synthetic builders and fake RPC storage. Native acceptance and activation remain open.
- Worktree: `/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats`
- Source admission: Root's approved bootstrap allocation after its 218-test/12-file integrated gate, with 851 stable Root inputs. All changes are uncommitted. No Git operation was run for this allocation.
- Governing record: Root's A12 workspace bootstrap allocation and current `CONTEXT.md`; the prior design is `backend-a12-workspace-bootstrap-design.md`.

## Result and ownership

The reader exposes an honest `initialization_required` state when the owned analysis has no writer slot. It derives the binding from the full validated relationship context and supplies no draft ID, timestamp, version, or hash until storage returns real values. Reading this state does not write.

The separate authenticated POST initializes an empty workspace for exact current canonical and requirement UUIDs. Existing rows are returned without an update, including nonempty legacy drafts. A setup response is a current read after creation, not an immutable receipt for the original initialization attempt. A lost response can be retried with the same selection; the helper reads the existing slot rather than automatically creating another row or generating prose.

Only these four files are owned by this allocation:

| File                                             | Purpose                                                                                         | Final SHA256                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/canonical-rewrite-workspace.ts`  | Strict state decoder, read adapter, explicit initializer, bounded form/RPC handling, and action | `f73e1f4722b72d1bbfe685d7e2460a2864a8ad2b49dda30a4b678c4c618b08de` |
| `app/routes/analysis.rewrite.workspace.ts`       | Thin POST resource; GET returns 405                                                             | `99d74a89bfcdc57a38373a3f92142ef80a5ad2201c1b4228f737ab49a407dcf4` |
| `tests/unit/canonical-rewrite-workspace.test.ts` | 29 actual-helper/resource controls with fake native storage                                     | `208d19001f6f93942de9c11899394becbc1db034c4fee6dd4562ef4d8a4352fd` |
| This handoff                                     | Author evidence and release                                                                     | Recorded in the private final packet                               |

Runtime owns the forward migration, separate workspace profile and deferred native verifier. Frontend owns the panel/score integration and its tests. Root owns registration, shared plans, integration and the final combined gate. Existing A12 generation/compatibility and A13 core files were not edited.

## API and admission

`loadCanonicalRewriteWorkspaceState(client, analysisId, ownerId, options)` returns the strict `CanonicalRewriteWorkspaceState` union. Its branches are `available {workspace}` and `initialization_required {binding, canInitialize}`. `decodeCanonicalRewriteWorkspaceState` applies the same schema, ownership, selection and profile checks to raw native responses. `initializeCanonicalRewriteWorkspace(client, analysisId, ownerId, selection, options)` returns `CanonicalRewriteWorkspaceInitialization`: `{kind:'workspace_initialized', created, workspace}`.

The read RPC is `read_canonical_rewrite_workspace_state`; the initializer is `initialize_canonical_rewrite_workspace`. Both receive exactly `p_user_id`, `p_analysis_id`, `p_selection` and server-derived `p_policy`. The missing branch validates the actual relationship proof before deriving its binding. The existing branch uses the existing real rewrite-workspace validator. Initialization requires selected heads to be current even when a row already exists; it does not use generation eligibility as a substitute for head checks.

The resource accepts exactly `canonicalVersionId` and `requirementVersionId` as lowercase UUID fields in URLencoded or native multipart form data. The body limit is 4096 bytes. Duplicate, unknown, file, malformed, aborted and over-budget forms fail before admin IO. RPCs share a bounded request deadline with absolute completion checks. Reply size, exact profile strings, owned binding and native output tokens are validated. SQLSTATE errors map to fixed safe errors; raw native messages are never returned.

The action checks the rewrite, authoring and scoring flags before client IO, then method, same origin and authenticated owner. Initialization needs no AI flag, AI consent audit, rate reservation, budget claim or provider call. While `AI_ENABLED` is false, the HTTP response explicitly sets `workspace.canGenerate=false`. The pure helper retains the native capability view. Generation remains a later explicit operation using actual returned draft tokens and its separate consent checks.

## Checks and preserved attempts

The private packet is:

`/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a12-bootstrap-backend-vxz27anq`

It is mode 0700. `released-code.json` records exact final code hashes and `.txt` snapshots. `commands.json` and each JSON receipt retain exact arguments, source hashes, timestamps, log hashes and process cleanup results. The pinned executable is `/Users/vaibhavsuman/.codex/tools/resumide-node22/v22.23.4-darwin-arm64/node`. Checks ran through the packet's `run.mjs` with sealed synthetic configuration, no dotenv, no live credentials and a fetch tripwire.

| Label and exact child command                                                                                                                                                                             | Result                                        | Source distinction                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai-off-capability-red`: `node_modules/vitest/vitest.mjs run tests/unit/canonical-rewrite-workspace.test.ts -t 'initializes with AI off'`                                                                 | EXPECTED_RED: 1 failed, 28 unselected         | Actual new action returned generation capability while AI was off. Preserved before the HTTP-only overlay.                                                        |
| `finite-green`: `node_modules/vitest/vitest.mjs run tests/unit/canonical-rewrite-workspace.test.ts`                                                                                                       | PASS: 29 tests, 1 file                        | Module `a845ab26`, test `1fc6cc0b`, workspace profile `81ddb614`; final differences are two unused import removals and the separately released profile successor. |
| `scoped-types`: packet `types.cjs`                                                                                                                                                                        | PASS: 4 roots, 67 source files, 0 diagnostics | Module `a845ab26` and final profile `c35d78e6`; includes the new module, resource, test and repository declarations.                                              |
| `scoped-lint`: ESLint on the three new code/test files                                                                                                                                                    | Preserved failure: two unused imports         | No runtime defect; both imports were removed without changing assertions or behavior.                                                                             |
| `terminal-lint`: `node_modules/eslint/bin/eslint.js app/lib/server/canonical-rewrite-workspace.ts app/routes/analysis.rewrite.workspace.ts tests/unit/canonical-rewrite-workspace.test.ts`                | PASS                                          | Final three code/test files and profile `c35d78e6`.                                                                                                               |
| `terminal-format`: `node_modules/prettier/bin/prettier.cjs --check app/lib/server/canonical-rewrite-workspace.ts app/routes/analysis.rewrite.workspace.ts tests/unit/canonical-rewrite-workspace.test.ts` | PASS                                          | Final three code/test files and profile `c35d78e6`.                                                                                                               |

Receipts and logs use the labels above as filenames with `.json` and `.log`. The finite-run log SHA256 is `e6cf501b95f549abd8d7f7387218536240f651b713790d2135fbdf77d2f83fda`; the genuine RED log is `74d160ec5aa3fff10f43ba37b343fa5f3b4c0b0e1e95b3dfae1b212babffccc9`. Scoped types log SHA256 is `4247a2dcf20f3d1e93e356fa064c16ee06db21e3098b3df77dc9aae8391e6809`. Terminal lint has the empty-log SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; terminal formatting log is `17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20`.

All receipts report 780 stable worker inputs, no source drift during checks, and confirmed process-group cleanup. The 29 controls include missing/existing/current/historical states, unchanged legacy projections, a lost-response retry, denied capability, forged output, native head movement, ownership/privacy, exact forms and bounded cancellation. One control continues from initialization through the actual existing generation repository and reconstruction, then proves exact saved replay without a second fake provider call. Mocks cover configuration/auth/client factories and native storage/transport boundaries; they do not stand in for the workspace, canonical, relationship or generation validators.

The final runtime workspace profile is `c35d78e62ad391f8800291ee313d78c105541fc917339c5ed54009d0d19c8ac2`. It replaced archived `81ddb614` after the finite run settled. Only its checker self-ABI guard changed; reader, initializer, metadata and wire stayed unchanged. The 29-case run was not repeated for this dependency-only successor. Root's final integrated gate is responsible for the complete candidate. Existing canonical rewrite readiness `d80052f6` and support policy `648e65` are unchanged.

## Limits and release

This is source and fake-RPC evidence. No native SQL was parsed or executed, no real database row was initialized, and no provider, browser, service or environment credential was used. The native initializer remains denied by default. Native locking, unique-row races, grants, catalog verification and rollback fixtures still need their separately authorized acceptance. This leaf does not activate generation or establish representative rewrite usefulness.

The three code/test files are frozen and released to Root. Root may integrate them while this prose packet is finalized. The next action is Root's single combined bootstrap gate with the final runtime profile and frontend consumer. Shared context and acceptance records remain coordinator-owned.
