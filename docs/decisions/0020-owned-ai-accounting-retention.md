# ADR-0020: AI accounting metadata after deletion

Status: **OWNER DECISION ACCEPTED; IMPLEMENTATION AND VERIFICATION PENDING**
Date: 2026-11-15
Owner: workspace owner

## Decision

The owner explicitly selected **30 days** in response to the question about the maximum retention of linkable AI accounting metadata after deletion. The question covered identifiers, timestamps and usage counts without resume/JD text, and specified removal of personal linkage at expiry while unresolved cost holds remain blocked for reconciliation.

Use an immutable deadline measured from the first committed durable deletion-preparation event. A retry, late provider response, settlement or worker restart must not extend that deadline. This is a technical implementation of the maximum period; it is not a new purpose for collecting candidate content.

Before the deadline, keep only the accounting envelope required for exact post-dispatch settlement, original-period attribution and controlled reconciliation. New candidate access and provider dispatch remain denied after deletion. At expiry, remove personal linkage and per-subject/per-attempt material that can reconnect accounting to the erased subject. Do not call a renamed or hashed identifier anonymous without evidence.

Preserve known usage and conservative unresolved cost holds in restricted aggregates without recreating candidate content or retained subject links. Deletion must not silently reset quota, invent zero usage, refund unknown spend, permit a second dispatch or move usage to the deletion/settlement month. Unknown hold expiry and identity-retention expiry are distinct events.

Complete owner-wide export must include every currently retained personal accounting record across organizations and feature settings. Erasure must cover the corresponding candidate records and old export artifacts. Restore must reapply the deletion/disposition state before serving restored data. Actual field, storage, Auth/session, organization and restore behavior requires the next bounded design and tests; this decision does not assert that any of those paths already work.

## Evidence and limits

The owner answered “30 days (recommended)” through the pending retention question on 2026-11-15. The [source triage](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/backend-owned-ai-privacy-lifecycle-triage.md) separates current content/profile deletion from full Auth/organization erasure and identifies the late-settlement and missing-publication quota gaps.

The prior resume-root RETENTION_DAYS setting is not reused as proof of this accounting policy. Earlier source comments and failed/open receipts remain historical. No threshold, unknown-spend safeguard or representative/release requirement is waived. This is not a compliance certification, an executed migration, a data grant, a provider call, a deployment or a publication.
