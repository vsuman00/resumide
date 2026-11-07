# Sequential browser audit - 30 October 2026

Status: PARTIAL audit of the local dirty candidate at base `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. This is engineering evidence, not project completion or release acceptance. Tests used synthetic data and one browser worker at a time. Existing uncommitted work was preserved.

## Findings

1. **Unqualified example score and impact language on the home page.** The hero illustration displays `92` without an example label. The page also promises the "highest-impact issues" and "three high-impact repairs", while the project has not established calibrated impact ranking. A separate example result is labelled as an example, but also displays ATS readiness and role-match numbers. Review these claims and illustrations against the achieved claim level before release. See `app/components/EvidenceScene3D.tsx` and `app/routes/home.tsx`.
2. **Medium-width navigation wraps awkwardly.** At the visible browser's approximately 788-pixel viewport, "How scoring works" wrapped across three lines in the public header. The link remained visible; no functional failure was observed. Review the breakpoint and spacing at that width.
3. **PDF accessibility remains incomplete.** All six synthetic LaTeX benchmark outputs had zero tagged pages. The browser's Axe checks do not establish PDF/UA or assistive-technology acceptance. This is a known release gate, not a newly established regression.
4. **Consent is required before analysis.** The upload page says deterministic evidence remains available if AI feedback is unavailable, yet requires the AI consent checkbox to start. This is the current flow; review whether a user who declines AI should be offered a deterministic-only path. No claim is made that such a path is currently supported.

No new server non-response, stale PDF refresh, or client exception was observed in the exercised paths. This does not establish their absence elsewhere.

## Fresh verification

- Node 22.23.4: `npm run build` passed. Rollup emitted dependency comment-annotation warnings.
- `playwright test e2e/smoke.spec.ts e2e/phase6.spec.ts e2e/phase7.spec.ts e2e/a11y.spec.ts --workers=1`: 44 passed. Covers signed-out pages, theme reload, upload validation and cancellation, responsive widths, limited console checks, accessibility scans, health/readiness, telemetry and origin checks. Some error and partial-result paths use browser mocks.
- The existing LaTeX browser suite ran from a temporary identical copy except its screenshot write was removed to preserve the prior artifact: 6 passed with one worker. It exercised real sandboxed compilation, a readable two-page preview/download, edits and preview invalidation, validation failures, origin policy, mobile layout and cancellation. One late-response case uses transport fault injection.
- The existing Build AI browser suite ran from a temporary identical copy except its screenshot write was removed: 6 passed with one worker. It used the controlled provider harness, including consent, apply/undo, invalidation, mobile, refusal, stale responses and timeout. No live model request was made.
- `npm run test:latex`: 5 files, 106 tests passed. `npm run test:build-ai`: 4 files, 88 tests passed.
- `npm run verify:latex -- sha256:600c3815bdf12a4e3df6d332c0aea11685fd122f0fc3240b7be3c802fd23bf4f`: 19 runtime groups passed, including confinement, hostile inputs, limits, cancellation and cleanup. One synthetic two-page compile took 902 ms.
- `npm run benchmark:latex -- sha256:600c3815bdf12a4e3df6d332c0aea11685fd122f0fc3240b7be3c802fd23bf4f`: six synthetic example/paper combinations passed heading-order checks; observed compilation times were 503-930 ms and sample p95 was 930 ms. This small local sample has no approved performance target and is not a load or production latency measurement.

## Environment and cleanup

The configured `.env` matched the active Resumide Supabase project. A direct SQL query returned PostgreSQL 17.6 and application readiness passed. No database image was present in the local Docker inventory. The existing Supabase analytics image was retained as an unrelated resource. Docker was used for the existing pinned compiler worker only.

The LaTeX and Build AI browser runs created 11 synthetic owners in total. Fixture cleanup and exact scoped SQL confirmed zero remaining recorded auth users, profiles, memberships, organizations, consent records, audit events and per-user/month rate keys. Thirteen existing exact buckets were deleted. Shared global rate metadata was retained. Temporary test copies and private ledgers were removed; no converter-owned containers or browser server were left running. No database reset, hosted migration, private resume, live provider call or deployment was performed.

## Coverage still required

The authenticated analysis, evidence review, canonical editing, job requirements, scoring, exports and privacy flows were not freshly exercised end to end: their existing test fixtures explicitly require an isolated local database and cannot run against the managed project as written. The latest earlier evidence is in the relevant phase closeouts; it is not a current end-to-end pass. Real-provider browser behavior, representative accuracy, live load and field performance were not measured. Future features that have not been implemented cannot be browser-tested. Formal accuracy, security, accessibility and release gates remain open.
