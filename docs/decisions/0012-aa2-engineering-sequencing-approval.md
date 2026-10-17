# ADR-0012: Approve AA2 engineering after AA1 engineering closeout

Status: **Accepted by the workspace owner, 2026-10-11.**

The owner stated: “Everything is clear in this phase AA1, then ready to go for
the AA2 phase. Approve all.” This records owner approval of the disclosed AA1
engineering closeout and authorization to start AA2 engineering. It does not
record approval by unavailable independent reviewers.

## Decision

Proceed with AA020–AA024 in dependency order under the frozen ADR-0007/0009
canonical-content design. Start with a bounded, strict draft contract, then add
tenant-scoped persistence, import, immutable lineage, fact verification and reads.
Each slice requires its own verification; this approval does not mark AA2 complete.

Exception E-003 permits AA2 engineering sequencing before Gate AA1 passes. The
owner accepts the disclosed locked synthetic field failure (92.31% precision,
75% recall) as an outstanding risk for isolated development. Preserve the failing
receipt, unchanged thresholds, review states and numerical score withholding.
AA2 must not silently import uncertain evidence as verified facts. The exception
expires at Gate AA2 acceptance, or before any release/production activation,
whichever comes first; acceptance then needs either the original dependencies
or a separately reviewed replacement decision with evidence.

Independent validation and calibration remain deferred under ADR-0011. This
approval supplies no real-data collection permission, external-provider spend,
hosted migration/deployment, publication or Git commit/push authorization.

## Approval roles

Approver: workspace owner, retaining the product, data/privacy, security, scoring
and engineering decision roles documented in the project plan. No other reviewer
approval is inferred. Gate AA1 stays **NOT PASSED**; AA2 becomes **AUTHORIZED FOR
ENGINEERING**, with its own integrity gate open.

## Subsequent AA1-first direction (2026-10-11)

The owner then directed: “You have to wrap up this phase firstly and fully wrap
up right now Phase AA1.” Complete and hand off the AA1 engineering closeout before
further AA2 implementation. Preserve the existing AA020 draft-contract slice and
this sequencing authorization; do not treat the direction as a rollback or as a
passed AA1 accuracy gate. The [final closeout](../evaluation/AA1_ENGINEERING_CLOSEOUT.md)
records the completed engineering scope and remaining acceptance obligations.
