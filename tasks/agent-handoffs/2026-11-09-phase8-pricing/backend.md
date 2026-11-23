# Phase 8 pricing: backend metering audit

Date: 2026-11-09. Read-only source audit of root main/a0b239299d75b0bd64b588fe743ebe2975fb28b9 plus its current dirty files. This handoff is the only file written by this assignment, in the licenses worktree at the same base. No application code, migration, database, provider, service or Git publication changed.

## Confirmed owner terms

- India: INR 300/month. Remove the earlier USD 10 proposal.
- Free: ten resume reviews and one resume edit, renewed every month.
- Build editor, compilation, preview and PDF download remain free. Build AI fixes and writing suggestions belong to the paid AI plan.
- Paid usage quantities and the meaning of one resume edit remain undecided. Access to all AI features does not establish unlimited provider use.

## Actual entry points

Paths and lines below refer to the authoritative root checkout, not the agent worktree's older source.

| Entry point                                                                       | Current behavior                                                                                                                                                                                                   | Proposed commercial meter                                                                                                                                                                                  |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/routes/api.analyze.ts:111`, `app/lib/server/analysis-ingestion.ts:47`        | New review enters `create_queued_analysis` after abuse admission and upload. The RPC resolves duplicate requests; duplicate source upload is removed at line 67.                                                   | One review reservation per durable, payload-bound logical analysis; retries and exact replays do not consume another review. Release on an unsuccessful review under an explicit terminal-outcome policy.  |
| `app/lib/server/qualitative-stage.ts:107`                                         | One logical qualitative call supplies diagnostic prose and writer proposals; the same persistence operation stores the initial writer draft at line 185. Retryable failures may retry or produce partial feedback. | Qualitative work is a component of the review. Do not silently debit a second edit for automatic review output. Paid/free writer boundaries need an explicit policy, described below.                      |
| `app/routes/resume.rewrite.ts:8`, `app/lib/server/rewrite-service.ts:287`         | An explicit generation creates a fresh provider request and replaces the saved writer draft after ownership/source/stale-write checks. Its provider key currently uses a new random run ID.                        | One AI edit should mean one successfully saved, grounded rewrite batch for one bound resume version and job. Add a durable user-operation replay key before treating this as commercial usage.             |
| `app/routes/analysis.author.tsx:47`, `app/lib/server/authoring-repository.ts:243` | Manual edit, confirm, rename, clarify, accept, reject, undo and restore mutate immutable canonical versions through `apply_authoring_action`. These actions do not call an AI provider.                            | Applying a purchased/generated batch, manual corrections, confirmation and undo should not each spend another AI edit. Label the paid unit as an AI rewrite rather than a keystroke.                       |
| `app/routes/build.suggest.ts:3`, `app/lib/server/build-assist-service.ts:231`     | A selected block requests one bounded fix, rewrite or resume wording suggestion. Source limits, consent, membership and separate abuse/token guards apply.                                                         | Paid AI suggestion admission; reserve per logical request and bind source hash/selection/mode. Keep separate from reviews and full resume rewrites unless an approved shared-credit policy says otherwise. |
| `app/routes/latex.compile.ts:3`, `app/lib/server/latex-converter-service.ts:104`  | Authenticated, flagged, sandboxed compilation. Preview/download are separate from the analyzer and AI request route.                                                                                               | No paid entitlement and no review/edit debit. Keep existing authentication, source, sandbox and abuse limits; free does not remove runtime safety controls.                                                |

There is no separate public reanalysis endpoint in the current route/source search. A fresh `/api/analyze` request is a new review; reading an existing result or worker retry is not. A future reanalysis action must join the same commercial boundary.

## Review and edit overlap to resolve

The current review prompt offers up to four writer wording improvements (`app/lib/server/qualitative-prose.ts:33`). Therefore, gating only the explicit rewrite route would leave Free users receiving writer batches with all ten monthly reviews. If one edit means one AI rewrite batch, that is an allowance bypass.

Recommended contract: review allowance covers analysis and diagnostic feedback; the one free monthly AI rewrite is an explicit generation of a saved rewrite batch. Repeated application, manual correction and undo of that batch are free. The implementation must stop the review path from silently exposing additional rewrite batches after the edit allowance, using an explicit output/entitlement policy while preserving required provenance and numerical scoring rules. An alternative is to promise that initial review suggestions are included in reviews and define the edit allowance only as later regeneration; that distinction must be visible to users. Neither choice is currently implemented or owner-approved.

## Cost and budget findings

These are repository defaults, not a reading of `.env` or proof of current runtime settings:

- `app/lib/server/openai-model.ts:1`: default model `gpt-6-luna`; live availability and vendor prices are outside this audit.
- `app/lib/server/config.ts:74`: organization AI budget defaults to 100,000 tokens; analysis/rewrite output defaults to 1,200 tokens at line 92. These are operational guards, not free/paid commercial quotas.
- `app/lib/build-assist.ts:11`: one Build AI request reserves a conservative 25,000 tokens, with 768 output tokens at line 17. The separate monthly bucket never refunds failures (`app/lib/server/build-assist-service.ts:195`). At the 100,000-token default with no other usage, this admits only four requests. It cannot support a larger advertised monthly suggestion allowance without an explicit coherent budget policy.
- `app/lib/server/qualitative-ai.ts:59` does not override SDK retries; the installed SDK defaults to two retries (`node_modules/openai/src/client.ts:482`). Rewrite and Build explicitly use `maxRetries: 0`. Worker retry and SDK retry are different attempts; neither should duplicate a customer's commercial debit. Provider-attempt costs must remain visible separately.
- `app/lib/server/config.ts:160` defaults both model unit costs to zero. `recordProviderUsage` multiplies those configured values (`app/lib/server/observability.ts:234`); zero output under defaults is not evidence of free AI or a profitable INR 300 plan. Unknown cost needs an explicit unknown state in future commercial reconciliation.

Recommend finite paid monthly review, rewrite and inline-suggestion allowances plus independent cost/rate safeguards. Do not sell unlimited use at this price. A candidate product package could be 30 reviews, ten rewrite batches and 50 inline suggestions per paid period, but these are proposals only, not approved or cost-validated quantities. Measure real bounded synthetic token usage and apply current official model fees before choosing quantities; the current 100,000-token guard would not support that proposal.

## Minimum implementation and verification

Before dependent work: resolve the local T080 sequencing exception or A4 prerequisite, exact AI-edit definition, paid quantities, calendar-versus-anniversary monthly reset, proration/renewal/downgrade and failed/partial/canceled-work treatment. Merchant, tax, refund and provider/test-mode decisions follow before T081/T082; the INR amount alone does not settle them.

T080 needs immutable plan/version records, server-derived organization and periods, a shared append-only reserve/commit/release ledger, payload-bound operation IDs, atomic quota admission coupled to durable jobs and reconciled terminal settlement. Apply it to every entry point in the table. Existing anti-abuse, read-before-call token sums and Build's conservative request bucket do not substitute for that ledger. Preserve free Build access and enforce paid Build AI on the server as well as in its availability projection.

Focused tests should prove the tenth review/first edit succeeds and the next is denied; last-unit races; exact and conflicting replay; free monthly reset without a paid purchase; paid period renewal; safe downgrade; failure/cancellation release; worker/SDK retry without duplicate debit; ownership and unknown policy denial; free compile after exhaustion; paid-only Build AI; and the review-writer bypass above. Database concurrency needs an approved isolated Supabase target, never a Docker database/reset.

## Checks and limits

Source search and targeted line reads completed; no application behavior changed. The self-contained prose inspection found zero suspicious Unicode spans and a low density tier (score 0.1225); no rewrite was needed. The scoped new-file whitespace check passed. The Prettier invocation could not run because the previously allocated Node 22 binary is absent; root must format/check the integrated file with its current allocated runtime. No application suite or provider/DB test was run for this documentation-only task. T080-T082 and release approval remain incomplete.
