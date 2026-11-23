# JD clause-order browser fixture backend

Status: IMPLEMENTED_SOURCE / MOCK_VERIFIED. Future full cleanup and a positive browser campaign are BLOCKED. This is not functional browser completion or Native acceptance.

The backend worktree remains based on `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, with the coordinator's 993-input source sync and unrelated dirty files preserved. This assignment changes only `scripts/jd-clause-order-test-fixture.ts`, `tests/unit/jd-clause-order-test-fixture.test.ts` and this handoff. The coordinator supplied the runtime guard as a read-only dependency.

`createJdClauseOrderTestFixture({ pdf, syntheticConsent: true, signal?, timeoutMs?, pollIntervalMs? })` first validates the fixed Root build binding and current configuration. Root's `expectedTargetUrl: null` refuses actual calls before clients, ledger writes or HTTP. Configuration caching cannot override the admitted target, origin, keys, model or fixed feature flags. Node/build byte checks are local evidence and do not establish target isolation or owner approval.

When independently admitted in the future, setup creates a synthetic owner with a preallocated ID recorded in the private ledger, signs in through the real SSR SDK, and submits authenticated same-origin multipart `POST /api/analyze`. PDF bytes come from the caller. The fixed neutral JD and explicit synthetic consent pass through production upload admission. No PDF is generated or parsed by this fixture. It never seeds evidence, page counts, confirmation, leases or readiness.

Polling reads the exact owned analysis and source, validates the actual production review envelope against ownership, checksum, source and persisted physical page count, and waits for the exact analysis job to be absent or terminal without a lease. `needs_ocr` alone does not reject valid native review. No global queue query, claim, worker cycle or filter-after-claim exists. A separately approved isolated real worker must operate externally. Setup then calls the production original importer, confirmation writer, typed JD writer, strict owned relationship-context reader and JD2 proposal workspace. Missing or unsupported results fail setup.

The returned object carries the contracted owner/source/analysis/attempt/fact IDs, canonical and requirement version IDs/revisions/clause ID, exact before/after/source/JD quotes, in-memory credentials, admin client and cleanup function. Credentials, cookies, bytes and text are never logged or written to the ledger. The neutral constants are exported for the future PDF callback. API upload does not establish browser upload-UI coverage.

The total setup deadline is 120 seconds by default and at most 180 seconds; polls are 1 to 1,000 ms. Cleanup has a 15-second bound and returned SDK calls have five-second bounds. SDK and HTTP response bodies remain bounded and cancellable through consumption, with a 16 MiB private response limit. Writes are not retried by the fixture. Unknown or in-flight operations retain their recovery ledger and refuse destruction.

## Concrete cleanup blocker

`20261110080809_analysis_admission_binding.sql` creates private admission operations with `owner_id` referencing `auth.users` and `organization_id` referencing organizations using `ON DELETE RESTRICT`. Admission uploads also have restrictive references. The admission identity trigger rejects DELETE. Existing production APIs expose prepare/finalize/cleanup of an unadopted upload, not retirement of an adopted operation or exact rate-key deletion. An Auth cascade therefore cannot prove complete cleanup after required bound admission.

For an attempted upload, cleanup proves the exact owned job is quiescent, retains the private ledger, and throws `admission_retirement_unavailable` before deleting any object, key or owner. Unknown ingestion and live work have separate refusal reasons. For a proved owner with no attempted ingestion, cleanup verifies no analyses, deletes the owner, then verifies owner and organization/membership/profile absence. It never reports a partial Auth cascade as full cleanup. Setup errors carry the bounded cleanup function for recovery without exposing credentials.

The coordinator acknowledged this source conflict and instructed an honest hold. Do not disable admission binding, alter immutable history, add direct metadata writes, or claim the fixture completes a clean browser campaign. A separately reviewed production retirement/adoption fix is required before that campaign can succeed.

## Verification

The sealed author packet is `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-jd-browser-backend-fajkf496`. Its controller uses the existing `verify-private-aa7.mjs` `runCommand`, pinned Node 22.23.4, empty HOME, and OS denial of network, dotenv reads and Git writes. Tests use mocked SDK/repository/HTTP operations and non-PDF byte arrays only.

The initial 25 mock tests passed. The first scoped lint check failed on an unused `describe` import; the import was removed without weakening assertions or adding suppressions. The successor 33 tests passed. Final formatting, lint and test receipts, source snapshots and process-group checks are recorded in the frozen packet. Formatting intentionally changes the allocated source bytes; check receipts require stable inputs. Root owns one integrated full typecheck after dependencies are integrated.

No actual PDF generation/parser, SQL parsing/execution, database/hosted access, environment/credential inspection, provider, browser, server, worker, Docker, dependency installation, Git write or deployment ran. The new 81st migration and grants remain unapproved and unexecuted. Supabase target and worker approval remain pending. Old 80-operation approval is a separate baseline. Full consumer, cleanup, Native, representative and release acceptance remain open.

## Cookie serializer correction

Root's first combined gate passed all 135 affected tests and formatting, then full typechecking found the fixture's two-argument call to `serializeCookieHeader`. The installed SSR API requires an explicit third options argument. The failed integrated receipt `jd-browser-fixture-97ff123d-3802-4b98-80c6-8a54c96f9735.json` and original author packet remain unchanged.

The fixture now passes `{}` explicitly and still takes only the serialized cookie name/value before the first semicolon. The mock checks the third argument so this API shape cannot disappear behind a permissive two-argument test double. No token logging or runtime scope changed. The successor author packet is `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-jd-browser-cookie-fix-mkbvjpv2`; it preserves the three exact preimages, final snapshots, source hashes, raw check receipts and process-group results. Root retains combined full typechecking and lint ownership. All cleanup and execution holds above remain.
