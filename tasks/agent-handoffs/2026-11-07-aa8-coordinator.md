# AA8 coordinator handoff

Owner request: close Gate AA7 and proceed to the next phase, explicitly corrected to AA7, on November 7, 2026. Record owner acceptance of the disclosed AA7 evidence and residual risks; preserve raw findings, failed receipts, untagged-PDF limits, defaults and separate deployment authorization. No production activation is requested.

Integration base: main, HEAD a0b239299d75b0bd64b588fe743ebe2975fb28b9, with extensive existing dirty work preserved. AA7 remains closed; do not rerun its green checks.

## Current slice

Start AA8 with AA080 metadata-only corpus-admission foundation. Governed by accepted AA003/AA005, ADR-0009, CONSTRAINTS sections 1/4/6 and the scoring spec corpus contract. The selected segment is software engineering / English / India, PDF native/scanned/mixed/layout subclasses. Current collection authority remains synthetic-only. Candidate upload consent is not corpus consent. Representative acquisition, independent annotation, calibration and public claim promotion remain later acceptance work.

No raw resume/JD data, external datasets/provider calls, Supabase writes, Docker databases, migrations, new dependencies, UI, deployment or publication. Use opaque IDs and content hashes. Implement a small pure server-side metadata contract and eligibility/lifecycle helpers: reject unsupported schema/source kinds, missing rights/purpose/provenance, expired/revoked/deleted records and out-of-scope segments; require explicit actor access-group membership; expose fixed rejection codes/counts without raw text. Synthetic engineering admission must never set representative validity/release approval or claim a domain-valid corpus. A declared permission reference is metadata, not independent proof of rights.

Root owns shared docs, contract decisions, package scripts and integration. Backend owns app/lib/server/evaluation-corpus.ts only. Tester owns tests/unit/evaluation-corpus.test.ts and tests/fixtures/evaluation-corpus.ts only. CLI agent owns scripts/verify-evaluation-corpus.ts and its own handoff only. Existing worktrees remain separate; no overlapping writes. Agents coordinate exported types/function names before dependent tests. No DB/services needed.

## Acceptance and verification

One working metadata CLI with synthetic-only fixtures and deterministic rejection/readiness results; meaningful tests for permission/access/expiry/revocation/scope/duplicate metadata and no representative-claim promotion. Run targeted tests, typecheck/lint and applicable builds once after integration. No AA7 browser/runtime/scan reruns. AA080's representative-acquisition checkbox stays open unless actual permitted representative data and required controls exist. Update canonical todo, current context and this handoff with exact results.


## Integrated outcome

Integrated only the four owned files from their authors and three npm scripts. No dependencies or lockfile changed. Targeted tests pass 44/44; actual CLI checks pass 14/14, with exact seven-file/temp-directory cleanup. Source formatting, lint, typecheck and web/worker builds pass. Initial concurrent builds let the web build clean the worker output; rebuilding the worker after web completion leaves both artifacts present. No source fix or repeated unit/CLI test run was needed. Nonfatal existing Zod annotation warnings remain. [Canonical report](../../docs/evaluation/AA8_METADATA_ADMISSION_20261107.md).

AA7 gate acceptance is recorded. AA8's metadata foundation is delivered; AA080's representative acquisition remains unchecked. No actual document or candidate data was collected; independent annotation, frozen partitions and domain-validity/release claims remain future work. All requested bounded agent assignments are complete; no services or external-test resources remain. Next AA080 step needs an approved corpus and its rights/governance evidence; do not reuse upload consent or fabricate representative/human evidence.
