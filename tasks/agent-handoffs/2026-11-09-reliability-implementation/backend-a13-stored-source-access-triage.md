# A13 stored-source access: bounded source triage

- Updated: 2026-11-15; reviewer `/root/a01_page_backend`.
- Result: CONFIRMED conditional native access gap after a privileged analysis source-pointer change. No current consumer exposure or database behavior was demonstrated.
- Reviewed foundation: `20261115045834_legacy_scoring_input.sql`, SHA256 `2cb4e2e684d4f4270085a541911422637b811aba8b02ce668f5dab4833dc8f80`, in Root's current source.
- Scope: relevant analysis privileges, triggers, source foreign keys and the legacy saved-read/replay branches. No tests, SQL parser/execution, source changes or catalog queries ran.

## Source-pointer mutation is not generically forbidden

The base `analyses.resume_version_id` is a normal foreign key to `resume_versions(id)` (`20260909073321_candidate_resume_analysis.sql:70`). Its `analyses_set_updated_at` trigger only sets the timestamp (same migration, lines 3–13 and 126).

The generic `zz_candidate_privacy_write` trigger does not make that pointer immutable. Its update branch checks that the owner is unchanged; otherwise ordinary writes proceed after `try_candidate_privacy_write(new_owner)` (`20261110085512_privacy_write_barrier.sql:54–78`). Installation includes `analyses` at lines 84–99. It does not compare old/new `resume_version_id`. The immutable admission identity triggers belong to `private.analysis_admission_operations` and `private.analysis_admission_uploads`, not `public.analyses` (`20261110080809_analysis_admission_binding.sql:26–47`).

Some correction/association/regroup child tables reference the composite analysis/source identity and can prevent changing a referenced source pointer. For example, correction admission references `(analysis_id,source_resume_version_id,owner_id,organization_id)` (`20261109164851_correction_ledger_foundation.sql:99,143`). That is conditional on those child rows. The legacy scoring-input row has no such source-pointer foreign key: it independently references the deterministic result, original resume root/version, extraction and job (`20261115045834_legacy_scoring_input.sql:10–25`). A legacy analysis with none of those optional correction/grouping children therefore has no demonstrated generic immutability constraint on the pointer.

## Conditional access sequence

1. A valid original snapshot is committed against version V1/root R1. Its insert guard proves the then-current relationship; later updates to the snapshot itself are forbidden (foundation, lines 157–174).
2. A role allowed to update `analyses` changes only its source pointer to V2/root R2, retaining the same owner/organization and an active account. Both source versions remain valid rows.
3. R1 becomes `deleted`, while R2 is active. Retention has a real tombstone-before-delete interval: `claim_expired_resume_objects` updates the root status at `20260911110000_phase7_security_privacy_operations.sql:306–310`; physical root deletion happens later in `complete_retention_item` at lines 329–335. The original snapshot's cascading foreign keys remove it only on physical deletion, not a status change.
4. `legacy_scoring_access` locks/adopts today's analysis pointer, version and active root R2 (foundation, lines 58–79). It does not load the stored snapshot's original V1/R1.
5. `read_legacy_scoring_context` validates the deterministic row and derives a current comparison context, then returns the immutable V1 `s.input_context` as `historical` (lines 257–273). It does not separately require R1 to remain active. The exact finish-replay branch likewise checks the supplied original binding/lease/result and returns its receipt after the current-source admission (lines 220–231); that branch returns a receipt, not the raw snapshot. The committed worker read also returns only a receipt (lines 182–191).

This confirms the missing original-source admission in the source branches. It does not prove a concurrent execution, actual retained row or deployed permission.

## Allowed actor and exposure limits

Anonymous and authenticated clients cannot perform the pointer mutation through the checked-in table grants: both lose all base-table privileges and authenticated regains only SELECT (`20260909073321_candidate_resume_analysis.sql:139–140`); subsequent membership policies remain SELECT-only. No existing application route or RPC that changes an analysis's source pointer was found in this bounded search. Existing transition RPCs update status/correlation fields instead (`20260909150000_analysis_state_transitions.sql:80–87`).

The established actor is the table owner or another privileged database role allowed to UPDATE it. Whether `service_role` has direct UPDATE in an actual installation depends on its catalog/default privileges; this review did not establish that grant and does not assume RLS bypass grants table privileges. In addition, the new legacy input/context/finish/export RPCs remain explicitly revoked from public, anon, authenticated and service_role; only metadata readiness is granted to service_role (foundation, lines 543–561). The feature is staged, so there is no demonstrated current consumer path to the old snapshot.

Before adoption, either the stored original source/root needs its own fresh owner/privacy/active-root admission on saved access/replay, or an actual generic immutable source-pointer contract must prevent this sequence. Rechecking the original root can preserve exact receipt replay across mutable job changes without treating a replacement current source as permission for the original snapshot. This document proposes no source change or activation.
