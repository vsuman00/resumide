# ADR-0018: Solo-developer AA8/AA9 prerelease verification

## Accepted owner revision

On November 7, 2026, the owner clarified that they are the only developer/reviewer, instructed “Remove the team verification”, requested subagent review of every aspect, and deferred customer/recruiter/vendor testing to an open-source release, demo, RC and pre-launch review. The active goal remains to complete AA8 and AA9 fully under this clarified prerelease scope. Gate AA7 stays closed under ADR-0017.

The workspace owner is the sole accountable approver. Independent AI subagents perform technical review of source, tests, evidence flow, privacy/access controls and failure behavior, with authorship and reviewed hashes recorded. Their provenance is AI-assisted technical review; it is not an independent-human annotation or customer-pilot result. Current engineering work must not wait for a reviewer team, recruiter partner or vendor credentials. Do not request those again during this prerelease scope.

## Required current completion

Implement and verify the complete AA8/AA9 software workflow: permission-aware corpus intake/retention interfaces, annotation/adjudication and agreement, immutable leakage-checked partitions, calibration without locked-label access, end-to-end evaluation with uncertainty and failure gates, versioned evidence/claim controls, and advisory pilot notice/override/appeal/retention/audit/stop/rollback plus comparison/observation capabilities. Exercise the actual local workflow and negative paths with explicitly synthetic/AI-assisted fixtures, preserve failures and run appropriate integrated tests. Three toy metadata records or validator unit tests alone do not satisfy this goal.

Use one owner plus actual subagent technical review for prerelease engineering acceptance. Keep supported first-domain/locale scope, deterministic numeric ownership, withheld uncalibrated scores, privacy, isolation, consent, retention and fail-closed authority boundaries. No new infrastructure/dependencies, hosted writes/migrations, deployment, external contact or publication is supplied by this decision. Supabase remains the database choice when storage work is separately applicable; Docker is worker-only.

## Deferred real-world evidence

Representative/customer data collection, independent human research, actual named-vendor comparison, real recruiter/career-center pilot observations, and the owner's launch review move to the demo/RC/pre-launch checklist. Current source authority remains synthetic-only until specific rights/purpose/retention are documented. Upload consent is not corpus permission.

Software must support these future authorized evidence paths; it must not permanently hardcode every future gate false. In-process trusted authority or reviewed execution receipts are separate from untrusted JSON claims, and missing authority denies real-world eligibility. Protocol approval, engineering readiness, representative evidence, actual vendor observations, customer validation and production release are separate statuses.

No domain-valid, human-expert-validated, named-vendor-compatible or outcome-calibrated public claim is granted by synthetic testing or AI review. Existing quantitative thresholds and failed locked receipts remain intact. The original representative and pilot methods remain reference/deferred claim requirements, rather than prerequisites that stall current implementation. The owner will perform review testing before launch and customer testing at the stated later stage.

[Full goal coordinator](../../tasks/agent-handoffs/2026-11-07-aa8-aa9-coordinator.md).
