# ADR-0013: Accepted AA4 local engineering sequencing

Status: **ACCEPTED by the workspace owner, 2026-10-12, for local AA040–AA046 engineering only.**

The owner responded to the scoped sequencing request: “Then go for the AA4 phase, complete it's tasks fully, with full verification.” This explicitly authorizes the proposed local engineering sequence and E-004. Calibration, authoritative numeric activation and release acceptance remain gated as disclosed in the request.

The owner requested: “If everything is wrap up of phase AA3 then go for the AA4.” AA3's local implementation and cleanup are wrapped up. Formal Gate AA3 remains not passed: its domain pack is under review, no real taxonomy release is adopted, and representative annotation/mapping/calibration evidence is unavailable. The AA1 locked field gate also remains failed; AA2 formal acceptance is open. The later explicit approval authorizes E-004 sequencing without passing those formal gates.

AA040 explicitly depends on AA1–AA3. `CONSTRAINTS.md` states, “No implementation task may add another exception silently.” E-003 covers AA2 engineering only. The AA0-approved design permits contract/interface preparation now; that scoped decision is now accepted above.

## Accepted decision

Authorize **local synthetic AA040–AA046 engineering** while the upstream formal acceptance obligations remain open. Exception E-004 affects implementation sequencing only. It expires at formal Gate AA4 acceptance or before any production/scoring-policy activation, whichever comes first. It does not waive a metric threshold, corpus requirement, domain review, confidence calibration or any release decision.

- Keep the failed AA1 receipt and the blocked AA3 release receipt visible.
- Preserve immutable legacy score values, versions and dates. Label them legacy; never compare them as v2 improvement.
- Implement separate compatibility and required/preferred alignment dimensions. Model prose has no numeric authority.
- Keep production weights, coverage floors, bands and calibration unavailable until approved. Illustrative AA0 arithmetic remains test-only.
- Withhold authoritative v2 values for uncalibrated, incomplete, review-required, unsupported or unknown critical evidence. Candidate confirmation cannot override missing source quality.
- Build local rule/requirement traces, repair reasons, bounded owner read models and metamorphic regression checks. Live providers, real-data access, hosted migration/deployment, spend and Git publication are outside this decision.
- Report unavailable expert agreement, representative error/fairness and comprehension evidence as unavailable. Green regression tests do not pass Gate AA4.

The workspace owner retains the documented product, scoring, data/privacy and engineering decision roles. No unavailable reviewer signature is requested or inferred. The recorded approval authorizes engineering work, not numeric activation or release acceptance.

## Reviewable preparation

`app/lib/server/score-v2-contract.ts` provides the AA040 preparatory interfaces: an explicitly uncalibrated draft policy, strict withheld-score envelope and legacy presentation adapter. Weights/coverage thresholds remain null, bands empty, and aggregate readiness disabled. Focused tests reject forged calibration/weights, fake withheld numbers, duplicate dimensions and unknown policy versions, and retain original legacy history. That preparatory snapshot was isolated. The delivered AA4 diagnostics route now uses these interfaces while numeric activation remains disabled.

The [AA4 execution plan](../../tasks/aa4-local-engineering-plan.md) describes the work and verification. Owner acceptance is recorded above; no other reviewer approval is inferred.

Implementation and verification: [AA4 closeout](../evaluation/AA4_ENGINEERING_CLOSEOUT.md).
