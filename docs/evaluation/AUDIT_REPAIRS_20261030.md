# Browser audit repairs and managed testing

Status: PARTIAL repair; final managed browser suite has one unresolved latency failure on dirty base `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. The original [audit](BROWSER_AUDIT_20261030.md) remains historical evidence.

## Changes

- Removed the decorative numeric score and the example readiness/role-match numbers. Home-page wording now describes evidence review without unmeasured impact rankings.
- Switched the public header to its menu at medium widths, including the reproduced 788 px viewport. The browser regression verifies menu access and no horizontal overflow; its screenshot is [the repaired header](audit-header-repair-20261030.png).
- Clarified that the current analysis workflow requires AI consent, with deterministic fallback if the provider is unavailable after consent. The API consent requirement is retained. This does not add a deterministic-only consent-declining flow.
- Disclosed that generated LaTeX PDFs are not tagged for screen readers. PDF tagging and formal assistive-technology acceptance remain unresolved renderer work. A disclosure is not an accessibility repair.
- Added a guarded managed-Supabase browser configuration, synthetic-owner fixtures, a private exact cleanup ledger and six admission regressions. Existing isolated local fixtures continue to work. Managed tests require the exact configured URL, explicit synthetic-record authorization, disabled AI and a private ledger. Browser screenshots/traces are disabled except the public-header screenshot.
- Reduced serial database round trips in canonical ownership checks and scoring reads. Every ownership, membership, source, deletion and moving-head validation remains required before returning data. The authoring action reuses its already-loaded, bound canonical snapshot when validating a suggestion. Final ownership, deletion and moving-head checks still run; three binding regressions cover mismatched owner, analysis and version. No shared cache was added.

## Hosted rollout

The first managed run passed two checks and failed eleven at evidence setup. Read-only inspection found the canonical, JD and authoring tables missing and an evidence validator differing from the repository. The owner explicitly approved the [eight-migration rollout](MANAGED_BROWSER_PREREQUISITES_20261030.md); every migration applied successfully through Supabase. This is a hosted database change, not an application deployment or release approval.

A subsequent run passed twelve checks and reproduced a five-second authoring-save wait failure. An intermediate authorization-read optimization still failed that wait. A later score-read optimization moved the failure to suggestion acceptance, where the form was still busy after five seconds. Grouping independent score reads alone still exceeded that acceptance wait. Reusing the same-request canonical snapshot then passed the entire authoring journey in 32.4 seconds, with all individual five-second waits retained. These failed attempts remain part of the evidence. The managed scenario limit is 90 seconds for multi-action remote journeys; individual assertion waits remain five seconds.

## Verification boundary

All checks use synthetic fixtures against the configured managed Supabase project and one browser worker. They verify seeded authenticated application journeys, not the normal upload-to-background-worker/provider lifecycle. No live provider, real resume/JD, database reset, Docker database, application deployment, commit or push was used. Formal scoring, accessibility, security and release gates remain separate.

## Final evidence

- The final application passed lint, typecheck and web build. The full unit/integration/component suite passed 1,161 tests in 133 files, including six managed-target admission tests and three snapshot-binding tests. Earlier `npm run verify` also passed formatting and worker build; later server read changes were rechecked with lint, full tests, types and web build.
- Final `playwright test --config playwright.authenticated.config.ts`: 12 passed, one failed, one worker, approximately 2.4 minutes. Passing journeys include native-layout/evidence ownership and keyboard review, canonical import/confirmation/edit/history/restore, JD review/history, withheld-score diagnostics, PDF/DOCX preview/download, no-JavaScript editing/export, privacy reload/native export, mobile navigation/sign-out and authoring-focus recovery.
- The isolated complete authoring journey passed once in 32.4 seconds. The final combined run reproduced a suggestion-acceptance wait exceeding five seconds while the old contribution remained visible and the form was disabled. This is an unresolved intermittent lag/refresh finding; functional completion in one isolated run does not close it. The original assertions and individual five-second waits remain unchanged. Further work needs per-request timing of mutation and redirected score-page reads; no claim of production latency improvement is made from total journey durations.
- Exact cleanup across all attempts checked 72 synthetic owners and 15 recorded storage object names. Direct SQL returned zero recorded users, profiles, organizations, memberships, audit/consent records, resumes, analyses, canonical versions, JD versions, authoring events and storage objects. The private ledger was removed after verification. No broad data deletion or global counter reset occurred.

The remaining blockers are intermittent authoring-acceptance latency and untagged LaTeX PDFs. Real-provider/browser operation, normal upload/worker completion, representative accuracy, load performance and formal release acceptance remain outside this synthetic seeded test evidence.
