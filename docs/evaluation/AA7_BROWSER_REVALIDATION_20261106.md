# AA7 private browser revalidation

Status: selected private browser flows VERIFIED on the uncommitted Nov6 candidate. This does not close formal release, compiler CVE/license, document-accessibility or representative-validity gates.

## Results

The recovered completed run logs prove three converter scenarios passed in 25.9 seconds and three controlled-provider AI scenarios passed in 15.1 seconds. Their original process handles are no longer live; the final result files and exact fixture ledger were reconciled before any further test work. No browser rerun or new account was needed for recovery.

Converter coverage includes real macro PDF compilation/download, a legacy POST preserving the submitted source, toolbar target geometry and matching disabled/ready download sizes, keyboard/mobile buffer preservation, and stale cancellation. AI coverage includes explicit selected-context disclosure with no hover request, Escape keydown/keyup dismissal, source-bound review/Apply/Undo, preview invalidation, stale/cancel behavior, mobile interaction and consent reset. The final selected Axe checks pass without exclusions.

The first AI run failed with duplicate-banner and landmark-unique findings: a portal popup heading used a page-level header element. The frontend owner changed that wrapper to a div while preserving the labelled h2 and styles. The subsequent run passed all three scenarios. The earlier failure log remains distinct. Semantic-fix source checks, component test, typecheck and web build also completed successfully. The larger 1,203-test verification and 19-group actual runtime matrix are recorded in the separate revalidation report; these counts overlap and must not be summed.

The [machine receipt](AA7_BROWSER_REVALIDATION_20261106.json) binds current source/configuration hashes. The [synthetic toolbar screenshot](build-toolbar-private-20261106.png) uses a new path, preserving the October31 screenshot. Logs show dummy provider credentials and a test-only official-endpoint intercept; no live model call or private candidate document was used.

## Scoped cleanup

Seven exact recorded synthetic owners were already removed by fixture cleanup. Independent direct Supabase SQL verification confirms zero remaining recorded auth users/sessions, profiles, memberships, owned organizations, consents, audit events and recorded organization IDs. The 15 exact recorded user/month rate keys had four remaining rows; only those four exact rows were deleted, and the same scoped query then returned zero. Shared global counters were neither deleted nor restored because no baseline had been captured.

The initial SQL attempt used an incorrect column name and failed without mutation. The authoritative migration identified bucket_key; subsequent exact lookup, deletion and absence verification succeeded. This is not a claim that all project metadata is absent.

The two private fixture files were deleted only after exact absence verification. Port3110 is not listening; no converter containers, including stopped ones, remain; running container inventory is empty. Docker was used only for compiler workers. Database testing used the configured managed Supabase project directly, without migrations, reset or a database container. No publication, deployment, commit or push occurred.

## Private rollback and quarantine drill

The subsequent coordinator-approved drill used one exact stopped compiler-labelled resource created from the existing hardened production argument builder and pinned image. A fresh production adapter refused admission with cleanup_failed and left only that resource present. The drill removed that exact ID and verified absence; the same adapter process remained quarantined. A fresh isolated process then compiled the neutral two-page fixture successfully and cleaned its own container. No daemon restart, global cleanup, provider or database operation occurred.

The flag-off stage reused the existing unit Request/Response service test with mocked identity/storage/compiler: disabled compilation returns HTTP404 without privileged storage or compiler calls. This is unit HTTP-boundary evidence, not a live authenticated rollback test. The [receipt](AA7_ROLLBACK_RECEIPT_20261106.json) binds production and verifier hashes. Run with Node22: `node node_modules/vite-node/vite-node.mjs --config vitest.config.ts scripts/verify-latex-rollback.ts sha256:600c3815bdf12a4e3df6d332c0aea11685fd122f0fc3240b7be3c802fd23bf4f`.

An initial harness comparison used Docker's truncated ps identifier against the full created ID. It failed, ran exact cleanup and left zero owned containers. Adding --no-trunc to the inspection fixed that harness error while preserving the exact-ID assertion. The complete rerun passed. No production guard was weakened.
