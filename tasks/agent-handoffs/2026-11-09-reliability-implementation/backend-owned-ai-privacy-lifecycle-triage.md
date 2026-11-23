# Owned AI privacy lifecycle: source triage

**Result:** the existing application deletion path is not itself blocked by the new Auth/organization RESTRICT references, because it does not delete either parent. Full Auth/organization erasure would be blocked while those records exist. Two concrete A13 post-content-deletion defects need repair. A retention/disposition decision is still missing; source defaults and accounting holds do not supply one.

This is read-only source evidence. No SQL was parsed/run, database accessed, test executed, service/provider called, environment inspected or production source edited. No JavaScript-store result is presented as a native reproduction.

## What deletion actually does

`prepare_deletion_request` in `20260911130000_durable_privacy_deletion_plan.sql:73–133` records the exact storage plan, then deletes owned analyses, jobs, resumes, consents, memberships and `profiles` in one transaction. `privacy-worker.ts:169–185,434–459` calls that RPC, deletes the exact objects and completes the durable request. The function does **not** delete `auth.users`, Auth sessions, organizations, old export manifests or audit rows. The governing map states this limitation at `docs/security/PRIVACY_DATA_MAP.md:71–84`.

Consequently, a ledger FK to `auth.users` does not restrict deletion of the separate `profiles` child. None of the R03, A12 or A13 technical-operation tables has a cascading analysis/source FK. Their retained rows therefore do not, by themselves, block the current content/profile deletion transaction. Candidate A12 versions/heads, A13 publications and original scoring snapshots have declared content-parent cascades. A13 publication immutability blocks UPDATE only, leaving genuine FK deletion available.

A real Auth delete, or explicit organization delete, is different:

| Store | Actual restrictive dependency |
| --- | --- |
| R03 | `ai_budget_operations.user_id`, reconciliation operator/event actor IDs reference Auth; operations, period openings and reconciliation operators reference organizations. Attempts/events/pools retain further RESTRICT links. See `20261110062548_technical_ai_budget.sql:33–42,60–94,105–141`. Operations/events/openings also reject DELETE/UPDATE. |
| A12 | `canonical_rewrite_operations.owner_id` and `organization_id` are RESTRICT; analysis/source IDs are plain captured UUIDs (`20261114181344_canonical_rewrite_operations.sql:10–22`). |
| A13 | `initial_feedback_operations.owner_id` / `organization_id` and organization policy selections are RESTRICT; attempts reference operations restrictively (`20261115072701_initial_feedback_operations.sql:128–160`). Operation/attempt triggers reject deletion. |

With referencing records, simply issuing Auth/organization deletion or changing FKs to CASCADE is not a complete repair. It would either be refused or encounter immutable accounting guards; cascading away dispatched accounting would also violate the budget contract. These are declared source consequences, not observed database outcomes.

## What already survives withdrawal or removal

The R19 owner barrier prevents new candidate work and reserve/claim after an active deletion request. Its budget patch gates only reserve/claim/current membership; it leaves exact already-dispatched accounting available (`20261110085512_privacy_write_barrier.sql:8–25,150–169`). Consent withdrawal is not permission to forget spend.

- **R03:** settlement/unknown/reconciliation uses the immutable operation/attempt/pool binding and original period. It does not require current membership, consent or source content. It still needs the retained organization row. A dispatched known response can settle after revocation; a `held_unknown` attempt requires the separately allowlisted reconciliation path, not ordinary `settle`. No automatic expiry/refund exists (`20261110062548...:275–300,354–423`).
- **A12:** `settle_canonical_rewrite_attempt` reads only the exact retained owner/analysis/operation binding, preserves known usage and never reads the deleted analysis/source (`20261114181344...:430–447`). Source/content/profile deletion therefore does not inherently lose technical settlement. Auth/org erasure remains blocked or requires a new lifecycle.
- **A13 open operation:** the settlement RPC reads only retained operation/attempt metadata and the fixed usage/error envelope. Source, membership and consent removal do not inherently prevent that update. Published assessed usage is already known and replays without rewriting content.
- **Content access:** fresh reads, provider claims and publication continue to require actual ownership/privacy/source admission. Keeping technical settlement available supplies no new dispatch or candidate lookup authority.

## Two concrete A13 defects

1. **Late known usage depends on erasable candidate content.** Forward `ifo_attempt_guard` permits a published partial's `held_unknown → failed` usage fill only while `initial_feedback_publications(state='deterministic_only')` still exists (`20261115081345_initial_feedback_publications.sql:563–569`). The publication has analysis/source/original-input CASCADE FKs at lines 27–32,53. A normal content/retention deletion can remove it while retaining the operation/attempt. The same exact technical settlement then reaches UPDATE but is rejected by that trigger. This contradicts its intended post-content-removal accounting path; null usage must remain unknown until safely observed/reconciled.
2. **Content erasure leaves quota reads unavailable.** Shared counter `63ddc8a4...`, `20261115082125_owned_ai_usage.sql:93–95`, refuses every published A13 operation whose publication row is missing. A legitimate cascade therefore leaves a retained technical operation that makes later same-organization quota reads fail closed, even if usage is known. Resume retention can produce this while another analysis/source and membership remain active. This is safe refusal, not invented zero or double counting, but it prevents normal post-retention use. Missing-row corruption must remain distinguishable from an admitted retirement.

The existing deferred publication draft covers late known usage while the publication remains. It does not exercise either deletion sequence. Native reproduction is unavailable under current authorization; no behavior RED is claimed.

## Existing authority and the missing decision

`docs/operations/AI_BUDGETS.md:13–19,33,43,77` authorizes the technical safety purpose: exact one-dispatch identity, preserved known usage, conservative unknown holds, captured policy/rates, original-month accounting and controlled reconciliation after revocation. It excludes raw source/JD/prompt/response content from the R03 ledger. Minimal settlement data follows that purpose: operation/attempt and subject binding, immutable policy/rates, claimed original period, reservation and actual counters, state/fixed error, and necessary reconciliation identity/evidence. A12/A13 additionally retain selector/binding/receipt hashes and worker/attempt metadata. All remain linkable personal metadata; opaque IDs/hashes are not automatically anonymous.

That is **not an approved retention schedule**. The privacy map at lines 42–47 explicitly requires retention, export/omission, deletion and restore treatment; it rejects indefinite identified retention. `RETENTION_DAYS=30` applies to resume-root selection only, not these technical stores. A month is an accounting boundary, not expiry. The current privacy worker includes the paired A12 and original scoring exports but does not include R03 or A13 operation/attempt/publication collections. Their export RPC availability alone does not complete customer export or erasure coverage.

For Root's owner-policy review, the two concrete options are:

- **Bounded identified technical retention:** approve exact fields, restricted purpose/access/export scope, a duration/start event and disposition at expiry. Define how an unresolved hold and late provider evidence remain settleable without either forgetting spend or retaining identity indefinitely. Full Auth/org deletion would require explicit unlinking/archive semantics and revised RPCs/FKs; retaining the existing live identity is not completed erasure.
- **Immediate identity separation on erasure:** remove candidate content and replace operational Auth/org dependencies with a restricted settlement subject/archive, retaining only the approved accounting envelope and exact no-dispatch/late-settlement authority. Decide how long that remaining linkable envelope survives and how unknown holds are reconciled. This requires an atomic migration, export/disposition and restore design; renaming an identifier or hashing it is not proof of anonymization.

Neither choice permits deleting a dispatched ledger or releasing an unknown hold merely to make erasure succeed. No duration or policy choice is made here. Root should take only these explicit decisions to the owner; a blanket new team review is unnecessary.

## Next bounded source repair

The first defect can be fixed under the existing accounting contract without selecting a retention period or adding stored PII: forward only the published late-known trigger branch to depend on the immutable claimed attempt (`held_unknown`, null old usage, fixed terminal error, exact unchanged identity/claim fields, safe known new usage and `failed`), rather than the existence of its candidate publication. It must still reject new dispatch, retry, changed known usage or terminal-error mutation. This is a staged accounting-consistency repair, not privacy adoption.

A five-file leaf can contain the forward migration, operation/full source-profile pin successors, one source-contract test and handoff. The native deferred scenario must publish a genuine unknown partial, perform an authorized original content cascade, then supply the exact known usage and verify no content resurrection or counter refund. Do not replace that with a fake-store Native RED.

Root should separately freeze an explicit content-retirement signal/counter disposition for defect two and the selected Auth/org lifecycle. Wire the actual R03/A13 owner-wide privacy export and erasure/restore treatment together afterward; missing/denied native collections must fail closed, never be omitted because a feature flag is off. Keep all current source-only/default-off/data-denied adoption holds until those dependencies and actual native acceptance are satisfied.
