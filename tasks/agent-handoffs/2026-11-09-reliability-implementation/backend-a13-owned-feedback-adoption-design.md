# A13 next slice: owned initial feedback adoption

PROPOSED, 2026-11-15. Root authorized this one design document while the scoring-input foundation gate integrates. No production edits, tests, migrations, shared contracts, SQL parsing/execution, providers, environment access or services ran. The previous source releases stay frozen. This is the next dependency of full A13, not a completion claim.

## Source facts and admission

The actual `qualitative-stage.ts` still reads current mutable `jobs(title,description)` and `analysis_extractions(extracted_text)`. The AI helper already returns `{prose,support,output,usage}` through the released support core, but the stage drops `ai.support`; it passes legacy feedback, prose and writer separately to `persist_qualitative_analysis`. That old producer inserts the AI run, result and draft, then transitions to completed. Existing fenced persistence supplies rollback on false/post-expiry, but no original-JD/support publication binding. `visibleFeedbackGroups` currently relies on quote presence, not an owned support record.

The new scoring-input foundation provides the necessary immutable original full JD, extraction/page array, source identities, original JS result checksum and separate native input/deterministic digests. Adopt only actual bound legacy scoring contexts. An old deterministic/result row without its immutable record remains explicitly legacy_unbound; do not backfill from current jobs or relabel its prose supported. Current JD edits produce historical state. Fresh automatic generation requires the admitted input still current; historical saved output may be read with its original binding and visible historical label. The evidence-v2/uncalibrated Node guard and all three native score guards stay intact; canonical/evidence analyses need their separate prose-only contract, not this legacy scoring path.

The frozen content core remains `qualitative-content-support/1.0.0`, SHA `230f22333dd468f3bf78395b118330ec1ff78de18be9da5349356e84d0f6bd13`, source `602ba4c5`. Keep its literal `authority:'source_content_only'` and `ownedVersionProof:'not_provided'`. A separate owned envelope binds its output to actual inputs; never rewrite those literals to pretend the pure helper performed native admission.

## Exact proposed publication DTO

Freeze the next contract around these strict fields, with actual policy hashes generated from source rather than placeholders:

```ts
type InitialFeedbackBinding = {
  schemaVersion: "initial-feedback-binding/1.0.0";
  analysisId: string;
  ownerId: string;
  organizationId: string;
  resumeVersionId: string;
  scoringInputSha256: string; // native original-input digest
  deterministicContentSha256: string; // actual native deterministic row
  resultChecksum: string; // unchanged legacy JS checksum
  sourceTextSha256: string; // exact original UTF8 extraction text
  jobSha256: string | null;
  policy: {
    version: "initial-feedback-publication/1.0.0";
    sha256: string;
    model: string;
    promptVersion: string;
    supportVersion: "qualitative-content-support/1.0.0";
    supportSha256: string;
    writingSupportPolicyVersion: string;
    limits: { sourceUtf16: 100000; assessments: 73; inputJsonBytes: 65536 };
  };
};
type InitialFeedbackPublication = {
  schemaVersion: "initial-feedback-publication/1.0.0";
  state: "assessed" | "deterministic_only";
  binding: InitialFeedbackBinding;
  prose: QualitativeSourceProse | null;
  contentSupport: QualitativeSupport | null; // frozen core sidecar, unchanged
  ownedSupport: {
    version: "initial-feedback-native-support/1.0.0";
    planSha256: string;
    supportSha256: string;
  } | null;
  receipt: {
    schemaVersion: "initial-feedback-receipt/1.0.0";
    operationId: string;
    analysisId: string;
    ownerId: string;
    bindingSha256: string;
    publicationSha256: string;
    resultSha256: string;
    writerSha256: string;
    createdAt: string;
    replayed: boolean;
  };
};
```

Here `QualitativeSourceProse` and `QualitativeSupport` are the actual released strict schemas, not invented parallel shapes. Null prose/support is permitted only for deterministic_only. Native result/writer digests are distinct from the immutable original-input and old JS checksums. The compatibility `Feedback`/writer schemas remain unchanged; no model category ratings, numerical delta or score fields are added by the new producer. Native copies all deterministic numbers/traces from the actual bound row.

Proposed owned reader result is `{schemaVersion:'initial-feedback-read/1.0.0',status:'available',currentness:'current'|'historical',publication}` or `{same schemaVersion,status:'legacy_unbound',analysisId,reason:'original_input_or_publication_missing'}` or `{same schemaVersion,status:'pending',operationId,attemptId,state:'reserved'|'dispatched'|'unknown'}`. Missing old publication never becomes an empty assessed result. Errors are fixed not_found/stale/unavailable/unsupported outcomes; no source, provider errors or commands are echoed.

## Useful prose and independent native reconstruction

The first executable producer should turn the actual core's accepted parts into a closed plan from the admitted original source, rather than trust a supplied supported boolean or digest. Each title AND explanation has a category/index, exact source code-point range and a concrete derivation: source transformation, approved editorial template or non-presupposing clarification template. Writer bullets retain separate original/rewrite/reasoning derivations; summary retains its actual source anchors. Native selects the same complete source context and independently reconstructs the exact prose and support decisions under a separately pinned counterpart. It must preserve actor, polarity, qualifiers, metrics, dates and scope; exact quote identity alone is insufficient.

Useful acceptance is broader than synonyms: preserve actual source-backed findings and their explanations, source-specific editorial guidance admitted by IR, explicit questions about missing outcomes/context/role, supported bullet layout/independent-clause ordering, and explicit role/contribution summaries when supported by the unchanged IR. Never fabricate an outcome or answer a clarification. A question supplied as good must remain nonstrength. Unknown grammar is withheld with an explicit reason, not silently transformed; a wholly unsupported response is unavailable, not a successful all-empty completion.

This requires a real bounded native counterpart for every admitted plan operation before write adoption. Do not implement missing validators, accept JS sidecar hashes as authority, or narrow the full objective to copied text. The current 100,000-UTF16 source ceiling, 512 anchors, 16 cited anchors, 73 assessments, 65,536 input JSON bytes, four tips/category and four writer bullets remain. Larger scoring inputs stay intact in storage but feedback returns resource-unavailable; no truncation. Broader free-form usefulness remains a later acceptance task, not something source checks can certify.

## Operation, budget and consent sequence

Use separate metadata-only operation and attempt records plus one immutable publication per actual initial result. The operation binds analysis/original scoring input/policy; native assigns operationId/attemptId/ordinal and a finite attempt limit. Keep original policy with the operation so a process restart can return its known publication/status without silently rekeying to today's model. A changed policy cannot create a second automatic operation on the same analysis. Intentional regeneration needs a later explicit versioned contract.

Proposed seams are `prepare_initial_feedback(analysisId,lease,policy)`, `claim_initial_feedback(analysisId,lease,operationId,attemptId,bindingSha256,budgetOrNull)`, `settle_initial_feedback_attempt(operationId,attemptId,bindingSha256,usageOrNull,errorCode)`, `finish_initial_feedback(analysisId,lease,operationId,attemptId,bindingSha256,plan,processId,requestId)`, and `read_initial_feedback(userId,analysisId)`. Freeze actual argument names with runtime before code. Prepare returns `{operation,context}`: dispatchAllowed is ALWAYS false; context is nonnull only for genuinely new preparation. Existing reserved/dispatched/unknown returns status without redispatch; published returns the exact prior publication.

Follow the repaired A12 ordering: current ownership/privacy/source access, exact original operation/publication lookup, then fresh input/lease/currentness checks. Exact prior replay precedes fresh rates, consent audit, budget or provider construction. A fresh path requires actual current qualitative_ai consent in BOTH budget modes and actual lease/fence, not only the current budget-on check. The worker does not invent consent. Budget-off still calls the native operation claim; the budget flag must not bypass mandatory once-only dispatch. Budget-on atomically claims the feedback attempt and existing budget dispatch in one transaction through an adapter that intercepts only the generic budget claim. Existing strict reserve/settle/release/unknown behavior stays unchanged.

Only the winning claim returns dispatchAllowed true. Provider idempotency is scoped to owner/analysis/operation/attempt/native binding, never bare analysisId or a client UUID. Capture safe known usage inside the provider wrapper before a budget helper can replace a failure. Settle technical known usage before support validation or storage, including rejected output. Missing counters remain unknown, never zero. Technical settlement may continue after privacy/lease changes without reading candidate content; publication may not. Preserve unknown holds and exact ambiguous retries. A definitive failure records the same usage plus terminal outcome; ambiguous finish must not overwrite a saved publication with rejected/partial state.

Budget-off needs an owned aggregate usage read that includes these attempts and existing canonical/legacy usage, with unknown claims blocking generation and BigInt comparisons. If compatibility publication also inserts the old AI-run row, exclude that linked run from the legacy component so the same tokens are not counted twice. Count known rejected attempts and late settlement in the original claim month. Do not reuse the unsafe old `Number(tokensUsed ?? 0)` fallback or claim an observational read is a hard atomic quota. The operation ledger's metadata retention/accounting permission remains a separate activation requirement.

## Atomic finish and AI-off partial results

Fresh assessed finish locks the current owned source/scoring-input/deterministic rows, current job identity, lease and privacy admission, and independently reconstructs the plan. It atomically commits the immutable publication plus complete sidecar, compatible result/writer/run projection, operation receipt and transition. Wrap the unchanged old qualitative producer or an equivalently guarded closed factory; if the old function returns false or any post-check fails, raise within the write transaction and roll back every content row. Existing analysis_results/writer slots without the matching publication are a conflict, not authority to overwrite them. Source/consent/lease changes leave prior content intact while usage is retained.

AI off must still deliver the existing deterministic partial result without SDK construction, consent audit, rates, reservation or dispatch claim. The new native finish therefore needs a strict deterministic_only mode that copies the actual deterministic row through the existing partial-result semantics, has null prose/support and an honest availability reason. It may complete after an explicitly terminal/unavailable attempt with the same bound identity; a late response cannot replace the partial publication, though technical usage can still settle. It must never fabricate model output, usage or an assessed sidecar. Original legacy partial expectations remain unchanged when the new mode is disabled.

## Bounded implementation leaves and gates

1. Contract/repository, five files: new `initial-feedback-contract.ts`, new `initial-feedback-repository.ts`, their two unit files and a handoff. Compile the closed source plan from actual core output, carry original scoring context, implement prepare/once claim/technical settle/recheck/finish with injected transport. Genuine tests cover useful supported prose, questions, original-JD mutation, replay, both budget modes, cancellation and known-usage failure preservation.
2. Native, five files: CLI-created forward migration, actual source-profile module, source-contract test, deferred mutating rollback-only verifier and handoff. Include actual independently checked support plan, operation/attempt/publication stores, exact owned reader, currentness, ACL/readiness and separate export. Native data mutations remain denied, including service role. Do not change frozen base138/typed13, A12 or old migrations.
3. Privacy, three files: `privacy-worker.ts`, `privacy.test.ts`, handoff. Mandatory separate owner export must include complete new content/metadata collections and fail closed on unknown/missing/foreign rows. Account/analysis/source cascades and source-retirement denial are required. No snapshot adoption before paired export/erasure is real.
4. Worker, four files: `qualitative-stage.ts`, `qualitative-stage.test.ts`, `qualitative-stage-outage.test.ts`, handoff. Root owns a separate default-off configuration flag. Enabled mode uses original bound scoring context exclusively, preserves ai.support and atomic publication; missing dependency never falls back to mutable jobs/extraction. Disabled legacy API, all old assertions, AI-off partial behavior and uncalibrated guards remain.
5. Consumer, five files: `app/routes/resume.tsx`, `app/lib/result-feedback.ts`, `tests/unit/result-feedback.test.ts`, a route/SSR test and handoff. The loader uses the actual owned publication reader, correlates legacy projections to native receipt digests and carries the sidecar separately. The presenter respects per-part support/kind and current/historical/unbound state; quote presence alone cannot promote strength. Browser imports remain type-only. Old unbound results stay visible with an explicit unverified label, not a forged support badge.

The smallest next executable leaf is the contract/repository plan compiler, coupled immediately to the native leaf before worker activation. Native sidecar reconstruction, immutable publication and privacy adoption are hard dependencies, not replaceable by fake-authority fixtures. Synthetic source/fake-transport tests and native deferred fixtures stay distinct from actual SQL/concurrency/catalog, usefulness and release acceptance. The full A13 scope remains owned truthful useful feedback delivered and persisted consistently, not merely a helper that filters strings.
