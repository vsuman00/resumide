# R19 privacy access consistency and source inventory

Date: 2026-11-10, Asia/Kolkata. Owner: frontend subagent. Base: detached `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus 696 coordinator-synchronized nonsecret inputs. Status: bounded access/route/component slice verified; source documentation updated. Full R19, native SQL/security and release acceptance remain open.

## Ownership and reviewed behavior

The original leaf owns new `tests/unit/privacy-deletion-access.test.ts`, existing `tests/unit/privacy-export-route.test.ts`, the three security documents and this handoff. The separately allocated route leaf owns `app/routes/privacy.tsx`, new pure `app/lib/privacy-deletion.ts`, new `tests/unit/privacy-route.test.ts` and existing `tests/components/Privacy.test.tsx`. The backend owns production repository/export/service guards; the runtime agent owns forward SQL and operator drafts. Their source files are hash-checked inputs only. No provider, real Supabase/database, browser, worker, Docker, owner-file, credential or network operation ran. No Git mutation ran.

The owner-reviewed rule is narrow: a successfully cancelled still-queued deletion is withdrawn, like a failed request. Queued, processing, completed and unknown deletion states remain blocking; an unverifiable lookup fails closed. The cancelled case moved from deny to allow coverage in the export and component matrices. It was not deleted, skipped or relabelled as an unsupported flow. Other ownership, active-source, authentication, origin and final export recheck assertions remain.

The shared pure module exports the readonly inactive tuple and a blocking-request predicate without server imports. The backend filter uses that tuple for two exclusions before limiting the query; actual canonical/JD readers and export route use its strict lookup-result state. The page queries owner-scoped blocking access separately from its twenty displayed requests and returns only allowed/blocked/unavailable metadata. A capped visible history cannot authorize export visibility. Rendering also conservatively checks visible blockers; the API remains the final authority and rechecks before serialization.

The action catches only `PublicApiError` from privacy creation/cancellation. It returns the existing error/success-null shape with the service status, private/no-store, Vary and session headers. A supplied safe integer Retry-After from 1–3,600 seconds is forwarded; the current busy service error supplies none. Authentication, origin and unexpected errors retain their previous behavior. UI layout is unchanged. Unavailable access metadata displays an inability-to-check message rather than falsely asserting that a deletion exists.

## Actual regressions and final checks

- Old export route `8e8ac698...`: the moved cancelled case returned 404 instead of 200; one failure, 16 passes.
- Old actual canonical/JD readers `e3006273...` / `797c9f31...`: four failures, eight passes. Both denied withdrawn deletions and allowed a malformed null lookup instead of failing closed. Active/unknown, query-error and foreign-owner controls passed.
- Old privacy action `172824d7...`: actual SSR handling produced 500 for both public service-contention cases instead of 503; the guard/unexpected-error control passed.
- Intermediate loader `efb78b36...`: one targeted failure showed no blocking-access metadata when the blocking deletion was older than the displayed twenty rows. Three other route cases were not selected; no skip annotations were added.

After the fixed backend input sync and bounded route repair, one affected run passed 43/43: access/pure policy 13, export route 17, route/SSR 4 and component 9. Command: `node node_modules/vitest/vitest.mjs run tests/unit/privacy-deletion-access.test.ts tests/unit/privacy-export-route.test.ts tests/unit/privacy-route.test.ts tests/components/Privacy.test.tsx`. The component run emitted the existing missing-HydrateFallback warning; no assertion or warning suppression was added.

Scoped ESLint passed. Scoped typing passed with 54 transitive source files and four ambient roots, zero diagnostics. The first private checker omitted the configured `.react-router/types/+future.ts` augmentation and reported a root middleware context mismatch; that harness failure is retained. Adding the existing configured augmentation fixed the checker without an application edit. Prettier, Markdown links, prose hygiene and `git diff --check` passed. The coordinator owns the combined gate; no broad suite or unchanged feature campaign ran here.

These tests call the actual repository readers, route functions/SSR handler and component with filtered thenable database or service doubles. They do not prove hosted grants/RLS, SQL locks, deletion completion, global history completeness or atomic enqueue/response revocation.

## Documentation and remaining scope

The repaired map and its displaced archive remain intact; the archive was not rewritten. The documentation adds only the new budget/admission/lease inventory and current source access behavior, while retaining historical evidence as historical. New UUIDs, paths, hashes, usage and actor identifiers are linkable metadata. The source 30-day resume-retention default is neither an all-store purge guarantee nor permission to retain append-only ledgers indefinitely. Export/omission, purge, restrictive foreign keys, Auth/session disposition, backups, restore, old-producer cutover and actual SQL/tenant checks remain open. Forward privacy serialization is separately owned; this packet does not declare it executed or accepted.

Private failed/passing receipts and exact source bindings remain in `/private/tmp/resumide-r19-privacy-access-ux3k26fr`. The sealed Node.js 22 process used `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic` and did not load `.env`. The pure dependency stayed `05701eb4d929467edde903a7e8deb8f9b445c193f6ee1a2090afaa6080e70626`; backend hashes are in `server-inputs.json`. Final owned-file hashes are in `release.json` and the coordinator message.
