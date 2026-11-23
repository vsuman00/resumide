# Recruiter and vendor pilot protocol

Status: implemented assessment contract, schema version 1. No vendor comparison,
customer study, recruiter pilot or production activation has occurred through this
module. Current work follows [ADR-0018](../decisions/0018-solo-prerelease-aa8-aa9-verification.md):
one accountable owner and recorded AI-assisted technical review for prerelease
engineering. External observations and launch review remain deferred.

## Two distinct modes

`prerelease_engineering` permits a synthetic local workflow with no named partner,
vendor or external environment. Engineering readiness requires a bound owner
approval and a technical review of the frozen synthetic evidence. The owner can
hold all accountability roles. Technical review may be AI or human; the result
reports its actual kind and does not call AI review independent human research.
Enterprise gates, six role-specific approvals and partner receipts do not block
this mode. Engineering readiness never sets actual vendor, recruiter or AA9 gate
readiness.

`external_pilot` supports a future authorized software-engineering / English /
India pilot. It requires the exact vendor name, version, configuration hash,
partner/environment references, immutable corpus and partition bindings, permitted
document hashes, allowlisted participant references and a bounded run window.
Changes require a new protocol hash and fresh matching authority. Actual external
execution remains outside current authorization.

## Protocol and evidence

`pilotProtocolSchema` requires notice, visible rubric, human override with rationale,
correction/appeal, retention, audit, monitoring, stop and rollback policy references.
It also binds limitations and the exact proposed claim-text hash. Automatic
rejection, hidden scoring, proprietary-score inference, general vendor equivalence
and selection-probability claims are rejected. Unknown versions or fields fail
closed. Raw resume/JD text, personal names, credentials and provider errors have no
place in these records; participant and actor references are opaque identifiers.

`pilotEvidenceSchema` separates protocol approval from execution and measurements.
It records dated ingestion attempts, normalized accepted/rejected/error outcomes,
output or safe error codes, artifact hashes and limitations. Each approved document
needs at least two distinct, separately evidenced attempts with repeatable results.
Reproducible vendor rejection is an observation, not a compatibility success; error
counts remain visible.

Advisory outcomes cover rubric agreement, correction rate, user comprehension,
workflow usefulness, fairness disparity, error rate, safety incidents, latency and
cost. Values have explicit metric semantics and finite ranges; every outcome needs
a positive sample size and matching evidence. External acceptance criteria are
declared in the versioned protocol and covered by its approval. There are no
library-supplied quality thresholds. Unit-test criteria are fictional contract
fixtures and approve no real threshold.

Operational evidence must cover every required control. Every allowlisted
participant needs a notice before use and an evidenced human decision with a
rationale; overrides are visible, not automatic ranking or rejection. Additional
unverified, late or out-of-scope notice/decision records fail the assessment rather
than being ignored. A stopped or failed control prevents pilot readiness. The
module assesses these records; it does not deliver notices, mutate application
decisions, delete files, call vendors or implement an event persistence layer.

## Authority boundary

`assessPilotEvidence(protocol, evidence, asOf, authority?)` accepts an explicit clock
and a separate trusted in-process `PilotEvidenceAuthority.receipt(reference)`
lookup. No authority is read from input JSON. Missing authority denies readiness.
The application must populate this lookup from verified, authenticated receipt
storage or reviewed execution artifacts, never by wrapping request JSON. The
lookup is synchronous and snapshotted per reference for one assessment.

Resolved receipts must match their reference, artifact hash, kind, protocol hash,
frozen payload hash, verified status, issuing actor/role, date and expiry. Revoked,
expired, future, mismatched or failing lookups deny eligibility without returning
private errors. This validates receipt bindings; it does not independently verify
the underlying legal permission, artifact bytes or identity. Those are obligations
of the trusted authority source.

For external mode, legal, fairness, security, privacy, domain and product approvals
are separate recorded responsibilities; one authorized owner may hold multiple
roles. Actual AA8 and enterprise prerequisite, environment, rights and execution
receipts are required. A separately evidenced independent human review follows
execution and cannot come from the protocol author, operator or decision reviewer.
These external-claim requirements do not apply to current prerelease engineering.

`hashPilotProtocol` normalizes strict parsed metadata and sorts object keys.
`hashPilotEvidence` hashes the frozen bundle with the technical and independent
review fields set to null, so review receipts do not hash themselves. Receipt
issuers must use these functions. Metadata and artifacts remain private; safe
assessment output contains only statuses, counts, review kind and fixed reason
codes.

## Readiness and stop boundary

The assessor reports engineering readiness, protocol approval, named-vendor
observation readiness and advisory-pilot readiness separately. AA9 evidence readiness
requires both external observation and advisory evidence branches to pass, including
the supplied outcome criteria and operational controls. It does not publish the
claim, enable employer mode or authorize deployment. A failed required branch
cannot be hidden by another passing branch or an aggregate count.

Current tests exercise both accepted and denied authority contracts using explicitly
synthetic fixtures. A passing future-authority unit branch is not a real pilot
receipt. Current local workflow and actual AI technical review are complete, with
[execution evidence](../evaluation/AA8_AA9_WORKFLOW_20261107.json) and
[verified closeout](../evaluation/AA8_AA9_ENGINEERING_CLOSEOUT_20261107.md).
Representative acquisition, actual partner access, customer observations and
pre-launch review stay on the [release checklist](../../tasks/aa8-aa9-release-readiness.md). No external request should
start until its exact target, rights, purpose, retention and environment have been
authorized.
