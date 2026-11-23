# Functional Rewrite generation repair

Date: 2026-10-31, Asia/Kolkata. T066 legacy Review follow-up. Engineering on the dirty working tree based on `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. No Git publication, deployment or hosted migration.

## Authorization and reproduced failure

The owner explicitly requested actual grounded generation for the supplied resume and JD, validated in a browser using Supabase directly. Scope was the owner's saved MERN analysis and the supplied PDF, plus disposable synthetic regressions. Real input was not copied into source, fixtures, screenshots, traces or reports. Existing private draft/run retention applies; this is not permission to build or reuse a real-data evaluation corpus.

Before the repair, a live structured request proposed one bullet but the original pipeline retained none. Replacing the explanation with a neutral one still retained none. The exact rejection cause for that historical output was not retained, so it is not attributed to a specific token. Two synthetic regressions separately proved that an ordinary sentence-initial editorial word could remove valid wording, and that the old whole-resume gate could incorrectly borrow a metric or skill from a different contribution. Both regressions now pass. A punctuation false rejection and numeric-substring acceptance are also covered.

## Implementation

- The model selects IDs for server-created source passages. The server supplies exact original substrings, including PDF line wrapping; unknown/duplicate IDs cannot create source evidence. Both the normal qualitative pipeline and explicit Review generation resolve these IDs before grounding. Normal prose uses `qualitative-cited-prose/3.0.0`; explicit generation uses `source-bound-rewrite/1.0.0`.
- Grounding checks each bullet against its own passage, preserving the skill, proper-noun and numeric checks. Sentence-initial editorial words are treated separately from candidate facts. Numeric values must match source tokens rather than numeric substrings. Missing evidence still withholds a proposal.
- Review offers Generate suggestions with per-request consent, announced progress, disabled busy controls, saved-state feedback and automatic loader revalidation. POST uses saved server-side inputs rather than caller-supplied candidate text. The provider gets a bounded structured request using the configured model/key; no model/provider was changed.
- Authentication, strict origin, bounded form input, active ownership/membership/deletion access, evidence checks, monthly budget and shared database rate limits precede generation. Access and input bindings are checked again before saving. A draft timestamp supplies compare-and-swap protection. Service-only AI run receipts retain draft history and token usage. Failed, empty, cancelled or stale requests preserve the previous draft. Scores, parse results, the PDF and canonical versions are untouched.

## Live browser evidence

Chromium was launched locally with screenshots/traces disabled. The supplied PDF checksum matched the saved source; the saved JD was the MERN role. Supabase was used directly, with no Docker database. The temporary owner test session was revoked locally without signing out other sessions.

The successful generation receipt records HTTP 200 in **5,211 ms**, four proposed bullets and **two retained suggestions**, with 2,163 input / 292 output tokens. Original passages matched the resume, wording changed, measurements remained in the cited originals, Copy worked, reload preserved the saved suggestions, mobile had no horizontal overflow and no page exception occurred. Numeric and parse results were unchanged. This is one bounded latency observation, not a percentile or provider reliability guarantee.

Direct Supabase verification also found three completed generation runs, retaining 2/3/2 bullets, with analysis-result timestamps preceding every rewrite. A repeat request returned 429 during the cooldown and left the saved draft intact. No synthetic resume or raw candidate text is included in these receipts.

Preserved receipts:

- [Initial browser harness failure](REWRITE_LIVE_RECEIPT_20261031_20261030T195429001Z.json): its plain-URL response matcher did not handle React Router's `.data` route; server/Supabase evidence showed generation had completed.
- [Cooldown response](REWRITE_LIVE_RECEIPT_20261031_20261030T195437341Z.json): 429, with the test session revoked.
- [Successful live generation and UI checks](REWRITE_LIVE_RECEIPT_20261031_20261030T195615417Z.json).
- [Final saved-result validation](REWRITE_LIVE_RECEIPT_20261031_20261030T200030315Z.json): the displayed wording exactly matched the current saved draft, with zero scoped accessibility violations. This final run made no generation request.

The local development web/worker pair was restarted under Node 22 after checking that the database had zero queued or leased jobs. The worker reported ready. A final [current-site check at localhost:5173](REWRITE_LIVE_RECEIPT_20261031_20261030T200427473Z.json) passed the same saved-draft, Copy, reload, mobile and scoped accessibility checks without another provider call.

An initial preflight returned `AI_PROVIDER_UNAVAILABLE`; subsequent requests with the same configured provider succeeded. Early probe harness failures involved temporary-module loading and a singular PostgREST relation, before a provider call. Formatting failures were corrected under Node 22. Failed receipts and assertions were retained.

## Engineering checks and limits

`npm run verify` passed formatting/source contracts, lint, **142 files / 1,189 tests**, types, web and worker builds. Tests cover source-ID resolution in the normal transport, exact wrapped originals, changed wording, unsupported source IDs, cross-contribution borrowing, invented metrics/JD-only skills, refusal, timeout, origin/auth/consent, budgets, shared limits, ownership revocation/deletion access, run-save failure and stale draft protection.

The existing writer-grounding benchmark passed its engineering tier and eleven adversarial cases. Its real-model comparison, representative quality, candidate acceptance and release results remain unavailable/open. This single owner smoke does not close those gates or prove semantic correctness for all rewrites. Candidates must review suggestions before use.

The managed synthetic native-layout browser case passed sequentially, including disabled-generation error feedback, preserved prior wording, legacy navigation/layout and cross-owner denial. Direct cleanup verification returned zero remaining auth/profile/organization/membership/resume/analysis/audit/storage rows for the exact ledger of two synthetic owners and one storage object; the private ledger was removed. The owner-requested real suggestions and private run receipts remain saved. No broad database reset, Docker image or unrelated owner-data mutation was used.

Supabase advisory review found existing private-table no-policy information notices, missing/unused-index information notices and the existing leaked-password-protection warning. These were not changed by this repair. See [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) and [database advisor guidance](https://supabase.com/docs/guides/database/database-linter).
