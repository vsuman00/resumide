# AA5 local engineering plan

Status: LOCAL AA050–AA057 ENGINEERING COMPLETE, VERIFIED AND OWNER-ACCEPTED (2026-10-14) under owner-approved ADR-0014/E-005; formal Gate AA5 remains open.

1. AA050–AA051: same-analysis structured editor and source-linked finding targets; retain uncertain/unconfirmed states and no-JavaScript recovery.
2. AA052–AA054: strict versioned patch boundary, clarification provenance and optional grounded XYZ/action-impact-context/action-scope-result patterns. Reject unrestricted changes and unsupported generated claims.
3. AA055: atomic owner/CAS/idempotency actions and immutable authoring ledger; reuse canonical edits/confirmation/restore, preserve exports/deletion and test concurrency/failure/undo.
4. AA056: label projected observations separately from saved-version actual diagnostics; keep all numeric deltas null while calibration is unavailable.
5. AA057: locked known-synthetic grounding/adversarial/model-adapter harness, candidate review flow and fail-closed release mode. Report actual model quality and human review as unavailable.

Use incremental implementation and Supabase workflows already used for AA2–AA4. Preserve the dirty checkout. Generate any migration through the Supabase CLI and apply it only to the isolated local stack. Verify focused behavior before broad tests; close out with database, browser/accessibility/no-JavaScript, privacy/restore, benchmark and full regression evidence. No deployment or publication.

All eight local engineering deliverables are implemented. Final receipts and limitations are tracked in [AA5 closeout](../docs/evaluation/AA5_ENGINEERING_CLOSEOUT.md); formal Gate AA5 is separate.

Final verification: 675 tests / 98 files, 51 browser checks, 40 authoring DB assertions, 68 AA2 + 39 AA3 + 30 AA4 regression assertions, fresh schema lint with no warnings/errors, populated restore including authoring ledger, and fixture cleanup.
