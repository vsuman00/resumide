# Grouped-import source preparation and rewrite feedback

Updated 2026-11-13, Asia/Kolkata. The combined local engineering gate passed **234 tests in five files**, full type checking, lint, web build and worker build. This is progress on CR-A02-S02 and CR-U10; the full reliability goal remains active. The 64-task index now contains 2 VERIFIED, 35 PARTIAL and 27 PLANNED tasks. Its IDs and dependencies are unchanged.

## Result

The grouped-import migration adds thirteen private, immutable, invoker helpers for source projection and trusted-original placement. It preserves existing same-span exclusions, source ordering, label barriers, Unicode codepoint offsets and explicit selection limits. Placement checks the complete critical-assertion mapping and permitted entry delta while preserving fact identities, values, citations, confirmation states and unselected content. The returned producer is derived preparation only: it is not persistable or scoring eligible. No current route or repository dispatches this preparation path, and no existing SQL function or shared shape contract was replaced.

The source corpus contains 61 valid JavaScript reference fixtures and 47 placement fixtures. These replay the existing evidence schema, association helper, structural normalizer and real constructors. The rollback-only SQL verifier contains 54 deferred native refusal branches. **The SQL remains UNPARSED, UNAPPLIED and UNEXECUTED.** JavaScript reference checks and SQL source inspection do not prove PostgreSQL parity, transactional behavior, native refusals or performance.

RewriteGenerator now consumes published safe failure codes. Session expiry asks for sign-in; provider unavailability, refusal, rate limits, timeout, cancellation, unusable output, service capacity and request conflicts receive appropriate feedback. Unknown or legacy codes retain the safe server message, including ambiguous save outcomes. A prototype-safe Map prevents inherited property names from selecting a message. Existing form targets, consent, busy controls, success behavior and saved drafts remain unchanged. The UI adds no automatic request or retry and makes no claim about the underlying provider-authentication cause or exact retry time. All services remain free.

## Verification and preserved failures

The frontend reproduced the actual issue before changing product code: three selected DOM expectations failed when the real refusal, rate-limit and cancellation codes arrived with the same generic error. Its final focused gate passed 38 cases: 28 generator and ten unchanged saved-writer tests. Original assertions remain intact. See the [frontend handoff](frontend-u10-rewrite-errors.md) and [preserved packet](u10-rewrite-errors-evidence/manifest.json).

The backend final focused gate passed 115 JavaScript reference/source-contract cases with scoped types, lint and formatting. Preserved failures include the initial test routine-name selector, test-only intent inference and a generator attempt showing that a nonempty long-s label is rejected by actual evidence replay. That unreachable input was not fabricated into a valid stored fixture. Source review also corrected raw-object guarding, bounded indexing and integral JSON numeric representations without changing candidate text or lowering limits. The [backend handoff](backend-a02-source-validator.md) and [preserved packet](a02-source-validator-evidence/final-packet.json) record the author checks, original failures and remaining native controls. Runnable archive code is retained as .txt with an exact [custody map](a02-source-validator-evidence/root-custody.json).

Root ran one combined gate on main HEAD `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus the integrated, preserved dirty scope:

```sh
npm test -- tests/unit/grouped-import-source-sql.test.ts tests/unit/grouped-import-commands.test.ts tests/components/RewriteGenerator.test.tsx tests/components/ResumeWriter.test.tsx tests/unit/rewrite-service.test.ts
npm run typecheck
npm run lint
npm run build
npm run build:worker
```

The test breakdown is 115 source/reference, 71 command, 28 generator, ten saved-writer and ten rewrite-service cases. The author counts are subsets of this 234-case result, not additional cases. No fresh full-suite or full CI pass is claimed.

The exact Node 22.23.4 controller used a sealed environment with fake credentials and disabled dotenv loading. Its [receipt](a02-source-u10-integrated-610c4f0e-ff0e-4794-9364-9160c5e8e832.json) binds all 726 stable source inputs, the log and both final build artifacts. Root independently rehashed them and observed all five owned process groups absent; [verification record](a02-source-u10-integrated-review.json). Session 19655 closed successfully. The [final peer source review](a02-source-u10-peer-review.json) found no required changes. It is separate from test and database evidence.

No browser, hosted database, provider, OCR, compiler or Docker runtime check ran. Full `verify:ci` was not run for this bounded leaf. No real configuration, owner document or Photos access, deployment, Git mutation or publication occurred. No external fixtures were created and no external cleanup was needed. Historical failures, thresholds and default-off controls remain intact.

## Remaining work

CR-A02-S02 still needs native parse/parity and refusal checks on an admitted direct-Supabase target, atomic approval/import/proof/snapshot/audit persistence, guarded producer admission and ordinary-save bypass denial. C02 and association export, privacy worker, readiness, restore and cleanup coverage must accompany that writer. Authenticated preview, acknowledgement, exact retry, stale/concurrent handling and immutable existing-head regrouping remain open. The pure validators grant no approval or authorization.

CR-U10 still needs equivalent truthful recovery across the other AI consumers and actual browser/live recovery with retained edits and source/version binding. The current DTO cannot distinguish provider authentication from other provider unavailability. This slice does not invent that distinction or close the full task.

Deployment and pricing remain stopped. The pending hosted-SQL decision has not been inferred from local test success. Continue with the next bounded source slice; do not repeat these unchanged checks without a relevant change or failure.

## CR-U10-S04 legacy rewrite and qualitative recovery

Eight expectations failed on the original provider classification. Both legacy transports mapped upstream authentication rejection and temporary outages to the same generic code. The shared classifier now emits `AI_PROVIDER_AUTH` for upstream HTTP 401 or 403 and `AI_PROVIDER_TRANSIENT` for upstream 5xx. Provider rate limits retain their existing code. The installed SDK made one call for each simulated HTTP response.

An expired Resumide session offers sign-in in another tab. The legacy rewrite action reports deployment or temporary service problems separately, without returning raw provider detail or modifying the saved draft. The action tests verified that dispatched requests with unknown usage recorded a hold. A legacy qualitative worker test with more attempts available confirmed that upstream authentication rejection did not schedule another attempt. The worker marked usage unknown before publishing deterministic partial feedback.

All 198 affected tests in ten files, type checking, lint, scoped formatting, and web and worker builds passed on dirty `main` based on `a0b239299d75b0bd64b588fe743ebe2975fb28b9` with Node 22.23.4. Four existing JD clause-order lint warnings remained. This slice used the installed SDK with simulated HTTP, mocked database RPCs and component tests. Canonical rewrite, source-bound initial feedback, legacy rewrite browser recovery, and managed and live checks remain open.
