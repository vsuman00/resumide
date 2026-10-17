# ADR-0014: AA5 local engineering sequencing

Status: ACCEPTED for local engineering by the workspace owner, 2026-10-12.

After being informed that formal Gate AA4 remains open, the owner instructed: “Okay, so go for the next phase AA5.” This authorizes the local AA050–AA057 engineering sequence. E-005 permits that sequencing while formal AA1–AA4 gates remain failed/open; it does not accept calibration, release claims, domain validity or reviewer outcomes. It expires at formal AA5 acceptance or before numeric scoring/production activation.

Implement progressive-enhancement editing on the private analysis workspace, explicit finding targets, strict source/fact/version-bound suggestion patches, candidate-confirmed clarification, optional truthful bullet patterns, immutable candidate actions and undo/compare/restore. Existing canonical versions remain immutable and CAS/idempotency guarded. Add only the local storage required to preserve authoring decisions and clarification provenance, with owner RLS, private export, deletion and restore verification.

Model proposals must not add invented facts or unrestricted document replacements. Local deterministic patterns and injected synthetic adapters can be exercised without live providers. No live model or cheaper model is adopted without the locked quality/cost evidence. Projected and actual numeric values/deltas stay unavailable until an approved scoring policy exists; actual diagnostics are recomputed only from saved versions. Deployment, hosted SQL, real corpus access, spend and Git publication remain deferred.

[Execution plan](../../tasks/aa5-local-engineering-plan.md). Formal Gate AA5 remains separate from local implementation/testing.

## Engineering closeout acceptance — 2026-10-14

The workspace owner replied “I approved” after the completed AA050–AA057 local engineering closeout and its remaining formal-gate limitations were disclosed. The owner accepts that engineering closeout and its existing verification evidence; the original 2026-10-12 sequencing authorization remains recorded above. See the [accepted closeout](../evaluation/AA5_ENGINEERING_CLOSEOUT.md). Formal Gate AA5 remains open for missing measured evaluation. This acceptance does not authorize AA6, numeric scoring activation, live providers, deployment or publication.
