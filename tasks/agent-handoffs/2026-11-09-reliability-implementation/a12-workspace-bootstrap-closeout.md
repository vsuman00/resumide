# Explicit writing workspace source checkpoint

Fresh evidence analyses can now offer an explicit writing-workspace setup action. GET stays read-only. The authenticated POST creates only a missing empty summary slot with database identity and time, preserves existing content, and returns actual validated tokens. The page revalidates after setup; generation remains a separate consented action. Pending generation requests retain their original selectors and draft tokens.

The first integrated gate passed 126 tests in seven files, full types and lint, then failed the web build. A type import emitted an empty runtime import and pulled Node crypto into the browser graph. The one-line `import type` correction preserves the loader and its strict validation. The separate correction gate passed 69 affected tests in five files, full types, lint, web and worker builds on 863 stable inputs. The other 57 cases have unchanged source dependencies. This is 126 unique passing targeted cases across two receipts, not a new 126-case run. Root rehashed all 863 source bindings, both artifacts and the log, and confirmed all six recorded process identities absent. The failed receipt and controller remain unchanged.

[Final review](a12-workspace-bootstrap-integrated-review.json) · [Initial failed gate](a12-workspace-bootstrap-integrated-c86bec26-9457-4bd3-9627-89f85a08c95f.json) · [Correction gate](a12-workspace-bootstrap-build-fix-integrated-572d03ce-e822-4c40-9807-e6f0030eff9d.json) · [Build diagnosis](frontend-a12-bootstrap-build-fix.md).

The native source review matches four routines, three catalog bodies and four profile pins. It checks GET without DML, one initializer insert, no update, conflict handling, current heads before reuse, actual inserted tokens and no scoring/provider writes. The initializer remains denied. The old canonical readiness profile, scoring guards and frozen support policy are unchanged. [Text review](a12-workspace-bootstrap-source-review.json).

This checkpoint verifies source, synthetic fake-RPC/handler/DOM behavior, typing, lint and builds. SQL was neither parsed nor executed. Native grants, catalog, transactions, privacy, unique races, retention, cleanup, actual browser/provider delivery and broader useful writing remain open. The deferred SQL verifier is privileged and mutating despite rollback; do not run it without an exact database allocation. Flags remain off and deployment remains on hold.

A13 implementation now adds immutable original scoring inputs, paired privacy export and a default-off worker adapter. That separate work is not covered by this checkpoint. Old results cannot acquire original-JD proof from today's mutable job. Parent totals remain 2 VERIFIED, 38 PARTIAL and 24 PLANNED across the unchanged 64-task graph.

## CR-A12-S04 native rewrite read admission

Socket-only PostgreSQL 17.11 replayed the 100-operation packet with ordered digest `4e253744226912aab1c9411cb03e528f8fbdaa10984aa5933a88ff380601293a`. Both service-role metadata readers reported a valid schema with setup and generation denied. The installed checker hashes matched the regroup migration and differed from the older application pins. On the unpatched web build, the browser could not reach the rewrite setup view.

The app now accepts the complete regroup and predecessor profiles for rewrite and workspace reads. It keeps the exact schema and permission checks and rejects altered reader, initializer and usage hashes. No migration, flag or database grant changed. The focused suite passed 214 tests across nine files. Type checking, lint, web build and worker build passed with Node 22.23.4 on dirty `main` based on `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. Lint reported four existing JD clause-order warnings.

The [local runner](../../../scripts/verify-local-typed-score.py) with `--browser --authoring --rewrite` loaded the built score page in Chromium with simulated Supabase Auth and Data API transport backed by PostgreSQL. With no summary row, it showed a disabled setup control and created no draft. After seeding an existing synthetic legacy draft, it showed the saved text and its unbound provenance on both current and historical inputs, with generation disabled. The saved row stayed identical, including its timestamp. The combined run also passed the staged authoring and score checks. An intermediate browser check expected generation to be hidden. The UI intentionally displays a disabled control, which the final check verified.

Setup, draft publication, version-bound rewrite replay, managed browser acceptance and live-provider usefulness remain open under their respective gates.

## CR-U05-S03 saved draft copy and retry

The [local runner](../../../scripts/verify-local-typed-score.py) with `--browser --authoring --rewrite` replayed the same 100-operation packet. Chromium loaded the built score page from both current and historical inputs. It showed the legacy provenance and kept generation disabled. From each view it copied the exact saved summary and the suggested bullet, which differed from the original. The first clipboard write was deliberately denied. The page showed an error, kept the draft visible and copied successfully on retry. The fixture held clipboard text in page memory.

Copy sent no write request to the analysis or authoring routes. The request check permits the application's ordinary telemetry beacons. The PostgreSQL snapshot confirmed the same saved draft, timestamp, canonical version IDs and head before and after copy. The initial checks exposed fixture issues in the canonical snapshot join and the classification of telemetry beacons. Those corrections stayed in the verification harness.

Node 22.23.4 passed 106 tests across six files, plus type checking and lint for the changed verification script, on dirty `main` based on `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. Managed browser acceptance, version-bound generation and publication, and live-provider validation remain open.

## CR-U10-S05 canonical rewrite failure recovery

Six HTTP action expectations reproduced the recovery gap. Session expiry returned an invalid-input response, while most classified provider failures offered exact retry. The action now identifies session expiry before database or provider work. The panel offers sign-in in a new tab and keeps the original operation key and input versions for manual retry.

Confirmed upstream authentication rejection ends generation recovery in the current panel. Temporary errors, upstream rate limits, timeouts, refusals and unusable output allow a separate request with fresh consent and a new operation key. The service accounts for usage before reporting these outcomes. It settles observed usage and holds unknown usage. If the settlement fails or its state cannot confirm recovery, the client keeps the original request. Neither the recovery path nor opening sign-in modifies an earlier draft.

All 263 affected tests in nine files, full type checking, lint, formatting and the web build passed on dirty `main` based on `a0b239299d75b0bd64b588fe743ebe2975fb28b9` with Node 22.23.4. Lint reported four existing JD clause-order warnings. The failure tests used simulated SDK HTTP, mocked database boundaries, and component tests. Source-bound initial feedback recovery, canonical generation failures in the browser, and managed and live checks remain open.

On the rebuilt app, Chromium passed the pinned score, staged authoring and saved-draft copy journeys against the isolated 100-operation PostgreSQL replay. Current and historical views kept generation disabled. Copy and its retry wrote no draft or resume revision. Auth and API transport were simulated. This browser run covered saved reads while the failure outcomes were verified by the affected action and component tests.
