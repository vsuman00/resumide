# Managed Supabase SQL verification

The CR-R16 database job runs eight rollback SQL suites, schema lint, and the two-session correction check against an approved isolated Supabase project. Use it after schema replay. The [task tracker](../../tasks/todo.md) records the remaining browser and restore gates.

## Prepare the target

Materialize the exact 94-operation packet into a new directory. The command reads the checked-in migrations and writes copies locally. [Schema packet](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/managed-schema-ci-successor-94.json)

```sh
python3 scripts/materialize-managed-schema-successor.py --managed-ci <new-directory>
```

Obtain owner approval for the isolated target and exact ordered digest before replay. Record the replay receipts and verify project identity and exclusive access separately. Use a project dedicated to synthetic data with its app and workers disconnected during these checks. Share current project access and credentials only through protected configuration.

The current candidate cancellation action requires the forward migration `20261122060000_owned_analysis_cancellation.sql`. The local verifier replays the 100-operation correction packet and then applies that migration in disposable PostgreSQL. Managed execution requires approval for a packet covering the added migration. [Local verifier](../../scripts/verify-local-owned-cancellation.py) · [Verification receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-u16-owned-cancellation.json)

## Run the SQL suites

Use Node.js 22 and `psql`. Set `MANAGED_DB_APPROVAL` to the following JSON, using the approved API URL and the corresponding connection host. Use the direct host when your runner has connectivity. Otherwise use the session pooler host. Both use port 5432. [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres)

```json
{
  "schemaVersion": "managed-db-sql-approval/1",
  "purpose": "cr-r16-rollback-sql",
  "targetUrl": "https://<project-ref>.supabase.co",
  "connectionHost": "db.<project-ref>.supabase.co",
  "orderedDigest": "fba7e856c528d05b6859bc5e6e4785cd4f15a9a93d57eccd1c62c74885958392",
  "exclusiveSyntheticProject": true
}
```

Provide `MANAGED_DB_PASSWORD` as a secret environment value and `MANAGED_DB_CA_FILE` as the absolute path to the trusted root CA bundle for the approved hostname. The client verifies the certificate chain and hostname using `sslmode=verify-full`. If `SUPABASE_URL` is set, it must match the approved URL exactly. Keep the password out of connection arguments, logs, and artifacts. [PostgreSQL TLS verification](https://www.postgresql.org/docs/17/libpq-ssl.html)

```sh
npm run test:managed:db
```

Exit 0 means all eight suites passed and reached rollback. Exit 1 reports an execution failure by phase. Exit 2 reports unavailable configuration or source drift. The runner refuses the shared workspace project and uses an allowlist of reviewed SQL source hashes. It takes a session lock, checks schema readiness and fixture emptiness, then locks the Auth, Storage, analysis and queue tables before each case. Each case runs at read committed because the privacy write guard requires fresh snapshots around its account locks.

## Run the two-session correction check

Approve the exact committed synthetic fixture on the same isolated project. In addition to the SQL settings above, set `MANAGED_DB_CONCURRENCY_AUTHORIZATION=isolated-exact-committed-cas-fixture` and a new lowercase UUID as `MANAGED_DB_RUN_ID`. Set `MANAGED_DB_FIXTURE_LEDGER` to `/tmp/resumide-managed-<run-id>/correction-fixture.jsonl`. The directory must have mode `0700`. Start with an empty regular file with mode `0600` owned by the runner. Retain the private run reference until cleanup is verified.

```sh
npm run test:managed:db:concurrency
```

This check commits the synthetic fixture so two independent PostgreSQL sessions can read it. It observes the second session waiting on the first, applies one revision, verifies the stale conflict, and checks that exactly one correction was written. Both sessions stop before the runner removes the exact fixture and verifies absence. Exit 0 requires both the race result and cleanup. If execution is interrupted, use the recorded test identities to reconcile that run before starting a new one. [Correction verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/r16-managed-correction-closeout.md)

## Run schema lint

```sh
npm run test:managed:db:lint
```

The runner checks the approved schema, invokes `plpgsql_check` for non-trigger PL/pgSQL routines in the same schemas as the legacy lint command, and rolls back temporary extension creation. It reports counts for routines, warnings, and errors. `completed_with_findings` preserves the legacy diagnostic policy. A failed execution or missing rollback receipt exits nonzero. Review the reported findings before treating the schema as release-ready. [Legacy lint implementation](https://github.com/supabase/cli/tree/v2.117.0/apps/cli/src/commands/db/lint)

## Run in GitHub Actions

Configure the `managed-supabase-database` protected environment for reviewed branches. Use environment variables for `MANAGED_DB_APPROVAL`, `MANAGED_DB_CA_PEM`, and `MANAGED_DB_CONCURRENCY_AUTHORIZATION`. Put `MANAGED_DB_PASSWORD` in environment secrets. Run **CI** manually from the reviewed default branch or a protected branch. The managed job verifies the database client and CA, then runs all three commands. Runs are serialized. The workflow derives the synthetic run ID from the repository, run number, and attempt so an interrupted run can be traced back to its exact fixture. [GitHub environment documentation](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

Push and pull request runs report the managed database gate as unavailable. A manual run with missing configuration or failed checks keeps the gate open. Hosted execution and the managed restore drill are pending. [Database CI verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/r16-managed-database-ci-closeout.md)

## Public browser check

The `public-browser` job runs on pushes, pull requests, and manual runs. It checks the signed-out journeys, accessibility, responsive layouts, and security responses in Chromium. The browser server starts with an explicit local configuration, no workspace `.env`, disabled AI, and an unavailable loopback database endpoint. It verifies that `/healthz` responds successfully and `/readyz` reports unavailability.

```sh
npm run build
npx playwright test --config playwright.public.config.ts
```

The public suite passed 45 Chromium checks on Node 22.23.4 at dirty `main` revision `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. The run deliberately supplied conflicting parent configuration to exercise isolation from the workspace environment. The default Playwright config still discovers the live readiness check and authenticated tests. Actionlint, typecheck, lint with four existing warnings, and the synthetic JD engineering benchmark also passed.

A later run passed all 53 public browser checks using Google Chrome for the Playwright project. The 200% zoom case used its existing disposable Chrome for Testing profile. It reused the locally verified SSR build, and both web and worker artifacts were present after the server stopped. [Verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-r16-historical-profile-verify.json)

The `browser` gate stays open until the protected authenticated job and the remaining managed coverage pass. CI uses direct Supabase for managed database tests.

| Coverage pending a managed run                           | Existing evidence or entry point                                                                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live readiness and authenticated Playwright journeys     | [Protected authenticated browser job](#run-the-protected-authenticated-browser-job)                                                                                                 |
| Canonical, JD, scoring, authoring and artifact workflows | Existing `test:aa2:local`, `test:aa3:local`, `test:aa4:local`, `test:aa4:legacy`, `test:aa5:local` and `test:aa6:local` assertions need managed fixture admission and exact cleanup |
| Document worker                                          | [Protected worker job and recovery](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-a01-managed-runner.md#run-the-protected-ci-job)                             |
| Populated canonical restore                              | [Restore procedure](BACKUP_RESTORE.md) and retained assertions in `scripts/verify-canonical-restore.ts`                                                                             |

Keep the legacy Docker restore command out of managed runs. A managed browser pass requires the approved isolated target and proof that the run's exact fixtures were cleaned up. [Coverage contract](../../tasks/agent-handoffs/2026-11-09-reliability-plan-runtime.md#rt18-direct-supabase-non-destructive-ci-contract)

## Browser fixture receipts

The workspace, canonical, native-layout, and evidence-review fixtures generate the Auth UUID before calling the admin API. On an approved managed target, they append and sync that UUID to the private browser ledger before creating the account. The converter fixture does the same in its separate private receipt, including its derived rate-limit key. Prepare both ledgers as regular files with mode `0600` owned by the runner. [Supabase Auth admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser)

Treat a ledger entry as a requested mutation. If creation fails, times out, or returns an unexpected UUID, retain the original entry and reconcile it before retrying. A failed run can include an account that the server created before the client lost the response. Exact Auth, Storage, and rate-limit cleanup still needs an independent witness.

On dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, 183 tests passed across the browser target, managed target, JD browser target, and private verification suites. The focused tests used the installed Auth SDK with a controlled transport. They verified write ordering, a lost response, an unexpected returned ID, and refusal before transport when the ledger is public or a symlink. Type checking and scoped lint passed. The protected job and hosted cleanup remain pending.

## Audit browser fixture cleanup

Run the audit after the browser and its local server have stopped. Use the approved isolated database connection described above and set `SUPABASE_URL` and `BROWSER_TEST_SUPABASE_URL` to the exact approved URL. Set `BROWSER_SUPABASE_AUTHORIZATION=synthetic-owned-records-only` and `MANAGED_BROWSER_CLEANUP_RUN_ID` to the run's UUID. The run's `BROWSER_TEST_LEDGER` and `AA7_AUTH_RECEIPT_FILE` must point to the private files `/tmp/resumide-auth-audit-managed-<run-id>.jsonl` and `/tmp/resumide-aa7-managed-<run-id>.jsonl`. The converter ledger can be empty when the run did not create a converter account.

```sh
node --experimental-strip-types scripts/verify-managed-browser-cleanup.ts
```

The audit reads journaled identities in one read-only PostgreSQL snapshot. It checks the Auth accounts, identities, session and refresh-token rows, selected application rows, exact resume object metadata, and fixture-specific rate keys. Once the database checks pass, it uses the approved project's `SUPABASE_SECRET_KEY` to make a bounded download request for each recorded object and requires an explicit `404 NoSuchKey`. A readable object fails the audit, and the runner cancels its stream without reading the bytes. Exit 0 reports absence across the checks. Exit 1 reports residuals or incomplete PostgreSQL or Storage evidence. Exit 2 reports unavailable admission or invalid ledgers. The report contains categories only. Keep both ledgers private until the run is reconciled. [Supabase Storage download](https://supabase.com/docs/reference/javascript/storage-from-download)

The audit excludes deployment-wide rate buckets and performs no deletions. The download check measures availability through the Storage gateway. Underlying provider retention is tracked separately. The browser suite verifies that the same private page accepts the original session before logout, refuses it afterward, and accepts a fresh session. The test runs before the fixture account is removed. [Storage metadata model](https://supabase.com/docs/guides/storage/schema/design) · [Auth sessions](https://supabase.com/docs/guides/auth/sessions)

The local PostgreSQL 17.11 check replayed the 97-operation packet on dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9` with synthetic Auth and Storage structures. It found all four residual categories, still flagged session records after Auth deletion, and passed after exact fixture removal. Foreign rows, an object with the same key in another bucket, and shared rate metadata remained present. All 150 focused tests, full type checking, and scoped lint passed. Hosted cleanup remains open.

## Run the protected authenticated browser job

`managed-browser` runs on manual CI dispatch from a protected branch after the managed database job passes. Configure `managed-supabase-browser` for reviewed branches and use a dedicated, approved Supabase project. The jobs share a concurrency group. The isolated target must also be free of other writers during the run. [GitHub environment protections](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

Set environment variables `MANAGED_BROWSER_AUTHORIZATION=isolated-authenticated-browser-fixtures`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `MANAGED_DB_APPROVAL`, and `MANAGED_DB_CA_PEM`. Store `SUPABASE_SECRET_KEY`, `MANAGED_DB_PASSWORD`, and `MANAGED_BROWSER_LEDGER_KEY` as secrets. The ledger key is a base64-encoded 32-byte random key. Retain the run's key privately until reconciliation. The runtime requires the approved URL to match the database approval and checks the schema, private bucket, and empty fixture tables before starting the browser.

One Chromium worker runs 14 readiness and authenticated checks across ten suites. The local server runs with disabled AI. After Playwright exits, the runner encrypts the exact ledgers and runs the read-only cleanup audit, including on browser failure. Success requires the browser tests and the audit. The job publishes only the encrypted recovery bundle on failure, with seven-day retention.

For a failed attempt with a recovery bundle, download it to a private directory. Set the original `SUPABASE_URL` and `MANAGED_BROWSER_LEDGER_KEY`, then run the recovery locally. Use the returned run UUID with the [fixture cleanup audit](#audit-browser-fixture-cleanup). Recovery refuses a different target or a modified bundle and preserves existing ledgers. If a runner is lost before it saves a bundle, keep the project isolated and reconcile it before another run.

```sh
node --experimental-strip-types scripts/verify-managed-browser.ts --recover /path/to/fixture-ledgers.enc
```

On dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, Playwright discovery, Actionlint, type checking, scoped lint, and 81 focused tests passed. The exact 97-operation local PostgreSQL replay exercised the real admission and audit SQL with an injected browser failure. The audit ran and the encrypted bundle was retained. Populated Auth blocked the browser before launch.

The GitHub job has yet to run on hosted Supabase. The full browser gate still requires the compiler and Build AI suites, the standalone transaction and worker checks, populated restore, and live Storage and Auth evidence.

The logout route originally returned a success redirect after a returned Auth error. The fixed route returns a retryable `503` and keeps any cookie removal supplied by the SDK. On dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, the built SSR app and installed SDK passed the failed and successful sign-out paths and denied the previous session against a controlled local Auth server. The SDK Storage tests accepted the specific missing-key response and rejected generic missing-resource, authorization, and service errors. All 138 focused tests, 45 public Chromium checks, full type checking, scoped lint, and both builds passed. The authenticated browser assertion still needs its hosted run.

## Verify Build against an isolated managed target

Use the same approved direct Supabase connection, encrypted ledger key and browser authorization as the authenticated job. Set `MANAGED_DB_CA_FILE` and a new private `MANAGED_BROWSER_OUTPUT_DIR`. Load the Build Auth fixture approval in `AA7_HOSTED_TEST_AUTHORIZATION` and set `AA7_TEST_SUPABASE_URL` to the same approved URL. Set `LATEX_TEST_IMAGE` to the reviewed image ID already present on the local Linux ARM64 Docker runtime. Build the web app and install Chromium before the run. The runner checks the target, starts the app on loopback and keeps AI disabled. [Supabase direct connections](https://supabase.com/docs/guides/database/connecting-to-postgres)

```sh
node --experimental-strip-types scripts/verify-managed-browser.ts --latex
```

After a successful browser run, the runner checks that no converter containers remain and preserves the encrypted ledgers. It then removes only the journaled per-user Build rate counters in a transaction. Any matching Auth account, session, identity or refresh token blocks removal. The final audit is read-only. The global compiler bucket and AI buckets remain outside this cleanup. Failed runs retain the recovery bundle and run the audit. Stop other writers before reconciling an interrupted run.

Disposable PostgreSQL verified exact cleanup, refusal while Auth records remained and idempotent replay. Playwright discovered all seven Build cases. Hosted execution still depends on the approved target, schema and credentials. [Verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-u08-managed-build-runner.json)

## Verify email-link recovery locally

Open the replacement email link in the browser that requested it. That browser holds the PKCE verifier used for the code exchange. Failed links return the user to sign-in with their validated in-app destination intact. Both sign-in and callback responses use private, non-cacheable headers and a no-referrer policy. [Supabase PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)

The built app and installed SDK passed the Chromium journey with simulated Auth. The fixture covered a failed resend, an expired link, a different browser, a successful replacement link, replay refusal, and sign-out followed by a protected-page request. Actual inbox delivery and managed session refresh still need verification. [Browser fixture](../../scripts/verify-local-auth-recovery.ts) · [CR-U12-S01 verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-u12-email-link-recovery.json)

## Verify sign-out on other devices

From Account, select **Sign out other sessions**. Resumide keeps this browser signed in, sends any rotated session cookie back with a private response, and reports success after Auth accepts the request. Previously issued access tokens can remain valid until expiry. [Supabase sign-out scopes](https://supabase.com/docs/guides/auth/signout)

The Chromium fixture forced one token refresh and an Auth refusal, then retried successfully. Both sessions still worked after the refusal. After the retry, the current session survived reload, the second session was sent to sign-in, and fresh sign-in restored access. The fixture simulates the provider's session state. Managed revocation and expiry behavior still need verification. [Browser fixture](../../scripts/verify-local-account-sessions.ts) · [CR-U17-S01 verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-u17-account-sessions.json)

## Verify the privacy download and deletion controls

The export download forwards every session cookie the SDK writes and uses private, non-cacheable response headers. This applies to downloads and error responses. [Supabase server-side Auth guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide#can-i-use-server-side-rendering-with-a-cdn-or-cache)

The Chromium fixture passed an exact JSON download after session refresh. It verified that queued deletion blocked downloads, cancellation restored them, and a prepared deletion hid cancellation and kept the download blocked. The completion status described request processing. The fixture exercised the built web app with simulated Auth and Data API responses. [Browser fixture](../../scripts/verify-local-privacy-journey.ts) · [CR-U17-S02 verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-u17-privacy-journey.json)

## Verify privacy request retries

Retry a failed submission from the same loaded form. The app binds the submission key to the signed-in account and request type. A retry can recover an audit failure without creating another request or restarting a cancellation. A fresh form can start a separate request.

Disposable PostgreSQL replayed the 100-operation correction packet and verified the new audit permissions migration. The service role could write an audit and ignore a duplicate. Clients gained no write grants. Include the forward migration in the reviewed packet before running this journey in managed Supabase. [Migration](../../supabase/migrations/20261122063000_privacy_request_audit_permissions.sql) · [Native verifier](../../scripts/verify-local-privacy-request-audit.py) · [Verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-u17-privacy-request-replay.json)

## Verify email confirmation before deletion

Open **Review deletion** in Privacy and request a verification link. Open the link in the same signed-in browser, then select **Start deletion request**. The app uses the existing Auth callback and checks that the verification session belongs to the same account. Verification is valid for up to 10 minutes and uses a separate cookie tied to the original session. [Supabase PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)

The local Chromium fixture used simulated Auth and Data API replies. It verified the confirmation boundary, rejected expired and different-account verification, and verified safe retry after an audit failure. The ordinary sign-in recovery fixture also passed. Run the deletion journey using an approved inbox and managed target to verify real delivery and completion. Physical cleanup still requires its own evidence. [Browser fixture](../../scripts/verify-local-privacy-journey.ts) · [Verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-u17-deletion-verification.json)
