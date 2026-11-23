# CR-A 14 clause-order decision contract proposal

Read-only discovery; only this handoff is authored. Current CONTEXT, actual preview kernel, old typed protocol/codec/repository/HTTP and prior review were inspected. No code, tests, profiles, migrations or gates changed or ran. Existing 1.0/1.1 bytes/policies remain frozen. The next implementation needs both original-pair verification and independent Native authority.

## Proposed strict wire

Constants: `jd-clause-order-command/2.0.0`, `jd-clause-order-receipt/2.0.0`, `jd-clause-order-proposal/2.0.0`; decision policy `jd-clause-order-decisions/2.0.0`; codec `a11-clause-order-command-bytes/2.0.0`. The existing draft/kernel policy and IR 1.0.4 remain unchanged.

Command exact fields:

- `schemaVersion`, `operation:'accept'|'reject'`, UUID `idempotencyKey`, `acknowledgement:boolean`, `draftId` SHA 256.
- `binding`: existing exact source/canonical/requirements/captured-heads/profilesSha 256 object.
- `policies`: existing exact `{clauseOrderVersion,clauseOrderSha256,writingSupportVersion}`.
- `decisionPolicy:{version,sha256}` for the independently frozen decision policy.
- `target`: existing exact fact/location/currentValueSha 256/confirmationActorId/confirmedAt object.
- `jdClauseId`: the single actual saved atomic JD clause digest.
- `sourceClauses`: exactly two `{index,start,end,sha256}` records, indices 0/1 and current-fact code-point half-open coordinates. No replacement prose.
- `transform`: existing fixed `{kind:'reorder_source_clauses',order:[1,0],rendererVersion:'jd-two-clause-renderer/1.0.0',terminal:''|'.'}`.
- `afterSha256`: SHA 256 of exact independently reconstructed UTF-8 replacement.
- `sourceCitations`: ordered actual full-fact citations,1..20, using existing eight-field citation shape.

Acknowledgement is true exactly for accept. Captured heads must equal the selected canonical/JD IDs/revisions in the command. An accepting base must leave room for two revisions. Strict bounds reject unknown fields, invalid UUIDs/integers/digests/text, duplicate/substituted citations or ranges and identity permutation. Proposed/review text is not a wire authority.

`draftId` is CORRELATION ONLY for Native. It is the existing SHA of the ordered Node draft body and is not reimplemented through a JSON serializer. Node must rederive and compare the complete ORIGINAL draft/id. Native includes this opaque ID in its command fingerprint and receipt but must independently prove every owned source/target/confirmation/location/JD/range/transform/afterSha invariant. It must never use draftId, an IR hash, a client supported flag or a caller Boolean as support.

Proposal exact fields: `{schemaVersion,draft,acceptCommand,rejectCommand,acceptCommandSha256,rejectCommandSha256}`. Both commands correspond to that actual draft, use distinct keys and differ only in their operation/key/acknowledgement consequences. Full before/after/JD/source review remains in the draft. Browser schemas/types are a separate browser-safe module; Node computes support and byte hashes.

## Portable A 11OP 2 command atoms

Header is ASCII `A11OP2\n`. Each null is `N;`; each string is `T<UTF8 byte length>:<bytes>;`, including `T0:;` for the empty terminal. SHA 256 covers the complete framed bytes. Integers use canonical base 10 and acknowledgement uses lowercase true/false. Reject NUL/unpaired surrogates, over 256 atoms or over 16384 framed bytes. Old A 11OP 1 code and golden vectors are untouched. Unlike the old wire, the new fingerprint explicitly includes its idempotency key.

Exact 53 fixed atoms followed by 8N citation atoms:

| Positions | Ordered atoms |
| --- | --- |
|1–5|schemaVersion, operation, idempotencyKey, String(acknowledgement), draftId|
|6–12|binding.source.ownerId, organizationId, resumeId, analysisId, sourceId, attemptId, inputSha 256|
|13–15|binding.canonical.versionId, revision, contentSha 256|
|16–19|binding.requirements.versionId, revision, inputSha 256, contentSha 256|
|20–23|binding.heads.canonicalHeadId, canonicalHeadRevision, requirementHeadId, requirementHeadRevision|
|24|binding.profilesSha 256|
|25–27|policies.clauseOrderVersion, clauseOrderSha 256, writingSupportVersion|
|28–29|decisionPolicy.version, sha 256|
|30–36|target.factId, sectionId, entryId, bulletId(nullable), currentValueSha 256, confirmationActorId, confirmedAt|
|37|jdClauseId|
|38–42|transform.kind, rendererVersion, terminal, order[0], order[1]|
|43|sourceClauses.length, always 2|
|44–47|sourceClauses[0].index, start, end, sha 256|
|48–51|sourceClauses[1].index, start, end, sha 256|
|52|afterSha 256|
|53|sourceCitations.length|
|54 onward, each citation|attemptId, spanId, pageId, method, start, end, pageStart, pageEnd|

The maximum is 213 atoms at 20 citations. Citation order is the actual original fact's order, not a client reorder. Confirmation timestamp preserves its exact canonical string.

## ORIGINAL proof without forged live heads

The current public draft API invokes `requireDraftContext`, which enforces fresh heads. It cannot be reused for a retry after later edits or JD changes. Do not overwrite/clone `context.heads`, substitute current versions into the command or reclassify a stale original as a fresh context.

Add `rebuildOriginalJdClauseOrderDraft(rawContext,expected:{analysisId,ownerId},rawSelection):JdClauseOrderDraft` to the existing kernel. It validates the actual owned selected immutable pair and all current access/source/provenance requirements. Split source eligibility from freshness; the existing fresh public API keeps its identical freshness check. The ORIGINAL API skips only live-head equality, retaining original whole confirmed source, unique placement, complete selected stream, source scope, atomic saved JD relevance, exact reconstruction and IR proof.

Its explicit proposal-binding assembly derives captured proposal heads from the immutable selected pair's IDs/revisions. These are the same fields every fresh original draft captured. They are not represented as the reader's current heads, and the input owned context is never changed. This reconstructs the original body/id after live heads move. Native separately rechecks actual fresh heads under locks after exact replay. There is no claim that an arbitrary never-current pair was admitted: fresh Native admission establishes that; exact replay requires its stored event.

New server API proposal in `clause-order-authoring.ts`: strict parse/create command, `clauseOrderCommandAtoms`, `clauseOrderCommandSha256`, `verifyOriginalClauseOrderCommand(rawContext,expected,rawCommand)`, `validateClauseOrderReceipt(raw,command)`. Creation maps an actual draft to the closed command. Original verification rebuilds the selected draft, creates the expected command with the submitted operation/key/acknowledgement and compares every field, including draftId and afterSha. A pure creation/schema function alone does not grant owned admission.

## Receipt, replay and actual repository boundary

Receipt exact fields: `{schemaVersion,status:'applied',action,idempotencyKey,commandSha256,draftId,baseVersionId,baseRevision,requirementVersionId,requirementRevision,versionId,revision,eventId,idempotent}`. Accept result must differ from base and increment revision by 2; reject returns the base version/revision unchanged. Node validates every correlation field and exact new byte hash. No old receipt fallback or vague hash-shape acceptance.

Proposed separate RPC `apply_jd_clause_order_action(uuid,uuid,jsonb,text)` returns receipt 2 or the existing bounded status failure envelope. Current owner/privacy/active root/source/org membership checks precede exact event replay. Under the same owned idempotency namespace, replay requires exact command, command digest, event scope and validated stored receipt; another command using the key conflicts. A valid replay returns before fresh current-head conflict, even after later canonical/JD heads move.

Fresh operations then lock/recheck current canonical and latest saved JD pair, Native source support and exact reconstruction; accept atomically edits then confirms and writes event/audit. Direct source citations are cleared on edited wording; the resulting confirmation is a candidate declaration with historical support provenance. Reject records the exact decision without moving the head. Recommended initial semantics retain old fresh-head checks for both fresh accept and reject; historical rejections are not silently added. Transport ambiguity retains the exact command/key; no fresh proposal, key or old-verb fallback retries it.

A future owned repository adapter follows existing `applyTypedAuthoring`: parse/bind request key and owner/analysis, read the ORIGINAL selected pair, verify its original proof, read actual v 2 readiness and invoke the real capability. It must not call the current-only preview builder before replay. Native owns fresh locked admission and stored replay; no client optimistic claim replaces that authority.

Undo must validate the actual owned accepted event, command 2/receipt 2 and immutable result canonical tuple before using guarded rollback/CAS. Existing authoring undo locates an event by result version and restores its base, rather than merely moving to the confirmation parent. The new v 2 event uses the same ledger shape, but actual Native rollback compatibility still needs verification before exposing controls. An additive undo 2 HTTP/receipt envelope must correlate the accepted event/command hash and fresh undo key; it cannot accept a receipt 1 downgrade. This is required consumer work, not implemented by this discovery.

## Policy freeze and concrete blocker

Freeze decision policy JSON before deriving its SHA: version, existing draft policy version/hash, writing-support version, original-proof semantics, current-access-before-replay order, fresh locked-head rules, exact renderer/source ranges, edit+confirm/reject behavior, correlation-only draftId and command limits. No placeholder hash or proprietary JSON serializer is needed.

The independent Native full-stream source grammar remains a real freeze dependency. Runtime identified that existing SQL Unicode/identifier predicates are not automatically the exact Node L/M and /iu sets, and there is no arbitrary full IR interpreter in SQL. Either independently implement the exact admitted source subset, or freeze a narrower explicit decision-scope policy mirrored by Node decision admission. Do not silently broaden Native matching or change the preview policy/IR. Source-only differential checks do not establish Native execution.

Proposed backend ownership after Root freeze: new `app/lib/server/clause-order-authoring.ts`, new `app/lib/server/clause-order-command-codec.ts`, existing `jd-clause-order-drafting.ts` ORIGINAL API, new protocol/codec unit tests and own handoff. Frontend owns browser-safe schemas/types/review; runtime owns separately allocated forward SQL/readiness. Actual repository/HTTP/UI decisions and undo need explicit coupled allocation after core wire freeze. Old 1.0/1.1 readers/writers, policy JSON, atoms, receipts and replay remain untouched. No implementation is claimed here.
