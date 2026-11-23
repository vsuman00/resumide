# Reliability repair plan: evidence, JD, scoring and writing

Date: 2026-11-09. **PLAN ONLY; NO REPAIR OR NEW APPLICATION VALIDATION PERFORMED.** Root main/a0b239299d75b0bd64b588fe743ebe2975fb28b9 plus its preserved dirty source is authoritative. This agent owns only this handoff in the licenses worktree. Root owns canonical task IDs, contracts, migration ordering and integration into the existing plans.

## Evidence and objective

The [consumer report](../../docs/evaluation/CONSUMER_VALIDATION_20261109.md) records the current result. In root-relative terms, authoritative receipts are `tasks/agent-handoffs/2026-11-09-consumer-ats/`: 32/39 independent assertions passed, with five unsupported-wording failures and two alias-discovery gaps; both downstream writer probes retained an unsupported claim; nine role checks discovered 21 vocabulary strings across 22 requirements while withholding scores. The owner-file check measured native availability and presence, not semantic correctness. OCR executes, but the block-font fixture still fails CER at 17.105% legacy and 18.421% fusion, and the consumer upload does not supply the engineering OCR adapter. CV04 is a reproduced correction carry-or-disclose failure.

The outcome is reliable behavior for declared supported inputs, factual proposals with inspectable support, and explicit review/unsupported states elsewhere. It is not a perfect employer ATS score. Pricing stays deferred and existing services remain free of commercial charges. Owner plus AI technical review is sufficient for this engineering plan; do not request a reviewer team now. Later opt-in customer/domain studies are a separate validity/claim stage and must not be fabricated from synthetic or AI reviews.

## Ordering and shared contracts

The labels below are proposal labels, not newly assigned canonical task IDs. Every implementation checkbox remains unchecked. Each slice carries its own red/green evidence; do not wait for an all-module rewrite.

1. Preserve native safety and introduce entity-aware evidence (A1-A2).
2. Define correction provenance, then make its import/application transactional (A3-A4). Frontend CV04 work consumes these contracts; a warning alone does not close the requested propagation behavior.
3. In parallel, improve OCR on development data and define JD alias/requirement relations (A5, A7-A8). Keep locked labels and failed receipts frozen.
4. Implement the OCR review integration contract in parallel, but activate actual attempts only under the reviewed runtime/quality-admission scope (A6); build fact-to-requirement relations after A2/A7-A8b (A9).
5. Define bounded writing support, then wire explicit rewrite and qualitative paths sequentially (A10-A12). Frontend labels/controls must consume the same result states.
6. Verify useful before/after recommendations and score withholding (A13-A14), then run the combined consumer paths once. Numerical release remains a separate evidence-backed decision.

Shared interface decisions precede writers: entity/target identifiers; evidence/correction revisions; raw JD wording versus normalized concept; AND/OR requirement groups and experience intervals; fact/relationship support; support-result states and immutable input binding. Changes create new producer/schema/policy versions. Preserve readers for historical versions; never rewrite frozen rows or reinterpret previous receipts as current passes.

Prefer derived projections over new persisted fields where existing immutable spans/events suffice. A change to a stored evidence/canonical/JD shape, producer or replay semantics requires a separately reviewed forward-only SQL/RPC admission slice before enabling any writer. Keep the same source, ownership, revision, value and idempotency checks in TypeScript and database validation. A4 covers correction materialization and A8b covers JD relations. If A2 changes the stored evidence envelope rather than a read projection, root must split its migration/RPC/SQL-test work into a separate small slice, using `tests/unit/evidence-field-sql-version.test.ts` plus a **new guarded managed-target CAS/concurrency verifier**. The existing `scripts/verify-document-evidence-concurrency.py` rejects non-loopback databases and is historical/ineligible for this managed-Supabase workflow; never bypass that guard or start a local database to reuse it. No new envelope may bypass the managed admission checkpoint.

## Proposed bounded slices

### A1. Distinguish native availability from reliable page evidence

**Depends on:** current source manifest; runtime planner owns extractor/container availability. **Likely files, five:** `app/lib/server/ocr/pdf-detection.ts`, `app/lib/server/document-extraction.ts`, `tests/unit/ocr/extraction-router.test.ts`, `tests/unit/document-extraction.test.ts`, proposed `tests/fixtures/native-profile-adverse.ts`.

- Keep the existing eight-character native-text test as an availability observation, not a completeness/accuracy certificate. Add explicit reasons for known sparse/garbled/duplicated/unsupported page evidence using bounded deterministic diagnostics; do not silently score a page because it contains a few characters.
- A native-only supported fixture uses zero OCR; missing/scanned pages remain selected explicitly, and ambiguous content remains review-required. Encrypted, malformed, missing-page, oversized and timeout inputs retain safe error states and no partial authoritative score.
- Preserve source bytes, every page identity and source offsets. No candidate text enters logs or diagnostics.

**Red/green:** existing `npm test -- tests/unit/ocr/extraction-router.test.ts tests/unit/document-extraction.test.ts`; add the known adverse cases before implementation. Existing `npm run benchmark:extraction-v2:engineering` follows after relevant fixtures are source-bound. Proposed diagnostics must not claim measured transcription quality without labelled text. **Rollback:** disable only the new routing policy, preserve its receipts; uncertain pages return review/unsupported, never a permissive native pass.

### A2. Separate legitimate entity multiplicity from contradictory fields

**Depends on:** A1 source/span contract and the stored-evidence admission checkpoint above if needed. **Likely files, five:** `app/lib/server/evidence-fields.ts`, `app/lib/server/document-evidence.ts`, `app/lib/server/canonical-content.ts`, `tests/unit/evidence-fields.test.ts`, `tests/unit/document-evidence.test.ts`.

- Replace the semantic assumption behind `new Set(all values for a field).size > 1` with explicit candidate/entity grouping: contact slots versus employment/education/certification entries, linked to section/page/span context. Multiple legitimate employers/roles/dates are not contradictions by themselves.
- Conflicting observations for the same target remain conflicts. Ambiguous associations stay reviewable; never pick an employer/date by proximity alone and pretend the association is verified. Preserve separate native/OCR disagreements and repeated page headers. Distinguish an unobserved field, an explicitly confirmed absence and a job requirement that does not apply; do not label an optional missing certification as proof of a missing qualification.
- Import each accepted observation once into the intended entry, maintaining exact citations and unconfirmed/review states. The three owner-file conflict counts remain historical observations, not retroactively relabelled false positives.

**Red/green:** existing focused tests above plus `tests/unit/canonical-content.test.ts` in a subsequent integration check; add known two-employer, overlapping-date, dual-email, duplicate-header and native/OCR conflict fixtures before the change. **Rollback:** retain historical schema readers and select the prior grouping producer for new attempts; preserve newer attempts and their source links. No destructive migration or global deduplication.

### A3. Define a correction-to-canonical projection with explicit provenance

**Depends on:** A2 target identity; frontend planner agrees on reviewed target selection. **Likely files, five:** proposed `app/lib/server/canonical-corrections.ts`, `app/lib/server/canonical-resume-schema.ts`, `app/lib/server/evidence-review.ts`, proposed `tests/unit/canonical-corrections.test.ts`, `tests/unit/canonical-resume-schema.test.ts`.

- Project only owned, active, source/attempt-bound correction history with a contiguous revision chain. “Latest” applies within the same stable assertion/entity target, never globally by field. An old-attempt or stale-source correction cannot replace a new resume's value.
- Preserve raw evidence. A corrected value carries a correction-event/actor/revision reference as candidate-authored provenance; it must not inherit a citation that quotes a different old value or become source-supported/calibrated. Initially materialize it unconfirmed, then require the separate canonical confirmation transition.
- Show explicit unresolved targets. Multiple possible employment entries require target selection; a correction with no imported fact needs an explicit reviewed candidate-authored add path. Never silently drop the correction.

**Red/green:** proposed `npm test -- tests/unit/canonical-corrections.test.ts` plus existing schema/evidence-review tests. Fixtures cover confirm versus correct, conflicting revisions, foreign owners, inactive attempts, unknown targets and adding a previously absent value. **Rollback:** turn off materialization for new commands without deleting correction events; show actionable pending corrections. Preserve dual-version readers and avoid rolling back to code unable to read newly written provenance.

### A4. Materialize reviewed corrections atomically and idempotently

**Depends on:** A3 contract and frontend correction diff/target UI. **Likely files, five:** `app/lib/server/canonical-repository.ts`, new forward-only `supabase/migrations/<timestamp>_canonical_correction_materialization.sql`, `tests/unit/canonical-sql-contract.test.ts`, `scripts/verify-canonical-resume.ts`, proposed `tests/unit/canonical-correction-repository.test.ts`.

- Initial import binds the exact reviewed correction revision and selected targets. Existing canonical content changes only through a candidate-visible compare-and-swap child version; never mutate or silently overwrite an existing version.
- One transaction validates owner/active source/correction revision/current canonical head, writes the new version and provenance/audit event, and records replay identity. Identical replay returns the same result; conflicting payload, stale correction/head, revoked ownership/consent, deletion and enqueue/storage failure cannot produce a partial accepted state.
- The CV04 consumer case must show the chosen corrected value once, with provenance, no old-value duplicate, and no repeat correction. Undo/restore produces a new version. Before confirmation export stays blocked; after confirmation it uses the corrected version and parse-back checks.

**Red/green:** proposed repository tests first; existing SQL-contract tests and, after an exact managed-Supabase synthetic allocation, `npm run test:aa2:local` and the original CV04 browser expectation. The local-named command uses `createCanonicalFixture` and `requireBrowserTestTarget`, so an explicitly allowed managed target can be tested with its guarded configuration and exact cleanup. Restore acceptance requires the **new managed-target restore verifier planned in runtime RT24**; its reviewed implementation/command does not exist yet. Existing `npm run test:aa2:restore` requires `AA2_TEST_DB_CONTAINER` and `docker exec` against a database and is historical/ineligible under the no-Docker-database instruction. Do not remove its guard, substitute a fake container or run it against another database. Scripts have hosted side effects: review the exact target and cleanup first; never `npm run test:db`. **Rollback:** stop new materialization, preserve versions/event ledger, retain old readers; use forward corrective migrations, not column/table deletion.

### A5. Improve OCR by declared scan segment without fitting locked tests

**Depends on:** A1 diagnostics and runtime planner's unchanged pinned OCR execution contract. **Likely files, five:** `app/lib/server/ocr/profiles.ts`, `scripts/ocr-runtime/runner.py`, `tests/unit/ocr/text-fusion.test.ts`, `scripts/verify-ocr-pilot.ts`, `scripts/extraction-benchmark-engineering.ts`.

- Diagnose preprocessing/layout/recognition choices on development fixtures only. Compare known normal-font, block-font, mixed/native, rotation, low-resolution, multi-column and damaged/low-contrast segments; do not assume the fusion path is better because it is newer.
- Freeze independent-family/near-duplicate-separated calibration and locked sets before tuning. Report CER, critical-field precision/recall, reading order, exact citations and abstention per segment with document/template clustering and intervals where justified. Preserve the original 17.105%/18.421% failures and the limited 72-field sample; neither may become “OCR works perfectly.”
- Keep original thresholds unchanged. The existing proposed floors are clean CER <=1%, declared challenging CER <=3%, native accuracy/coverage >=99.5%, and critical precision/recall >=98%/97%; final representative release adoption is separate. A segment missing its gate stays unsupported/review-required rather than disappearing from the denominator.

**Red/green:** existing pure OCR evaluation/fusion tests; then allocated serial `npm run test:ocr:pilot`, `npm run test:ocr:fields`, `npm run test:ocr:adverse` and the extraction benchmark. New fixtures/labels must be reviewed and frozen before comparison; no model/library/dependency adoption is implicit. **Rollback:** select the last source-bound profile/image and quarantine unsupported segments; retain both failed and improved receipts. Never use an unchecked external OCR fallback.

### A6. Wire a bounded local OCR review capability into actual uploads

**Depends on:** A5's declared review-only versus supported-segment policy, runtime image/isolation/cleanup readiness and an explicit local-engineering activation decision for actual attempts; not numerical calibration. Pure contract/worker-integration tests may proceed before that activation. **Likely files, five:** `app/lib/server/document-extraction.ts`, `app/lib/server/extraction-stage.ts`, `app/lib/server/ocr/selective.ts`, `tests/unit/document-extraction.test.ts`, proposed `tests/integration/scanned-upload-ocr.test.ts`.

- Introduce a server-created worker capability for review-only OCR. The current `syntheticOcr` request is engineering-only; do not merely expose it to HTTP callers or rename it as production approval. Derive owner, analysis, source hash, selected pages and resource allocation from trusted durable state, with default-off controls and exact pinned runtime identity.
- Native inputs invoke no OCR; scanned/mixed inputs invoke only the selected pages within existing time/memory/pixel/output/process limits. Timeout, cancellation, deletion, lost lease, stale source, missing image and uncertain cleanup produce explicit persisted review/failure states, with no duplicate/adopted stale output.
- Actual signed-in upload through its owned worker reaches source-linked OCR review evidence when enabled; disabled/unsupported cases still explain the missing capability. Success remains uncalibrated and scoring-ineligible; no AI or scoring stage bypasses that guard.

**Red/green:** proposed integration test and focused extraction/selection unit tests, then repeat the existing scanned consumer fixture with real worker/managed Supabase and exact cleanup. The prior scanned-upload pass remains a correct unsupported-state baseline, not evidence of successful OCR integration. **Rollback:** default-off capability stops new OCR admission; preserve in-flight attempt ownership, terminal cleanup/reconciliation and saved review evidence. No Docker database.

### A7. Add versioned alias discovery without changing the JD quotation

**Depends on:** a reviewed narrow alias policy, not wholesale activation of an external taxonomy. **Likely files, five:** `app/lib/server/job-requirements.ts`, `app/lib/server/job-domain.ts`, `tests/unit/job-requirements.test.ts`, `tests/unit/job-domain.test.ts`, `tests/fixtures/job-intelligence.ts`.

- Preserve raw `value` and exact Unicode source spans. Current validation requires the quote to contain the raw value; simply substituting JavaScript for JS breaks that contract. Add separately versioned normalized concept/mapping metadata, with exact/alias/ambiguous distinctions and explicit adopted policy identity.
- Cover the preserved JS/Postgres gaps and approved equivalents only; keep Java/JavaScript and generic SQL/PostgreSQL distinct. Aliases and canonical wording share one credit group, with all original citations retained. Preserve an explicit required clause outside the finite vocabulary as exact-spanned unmapped/review-required evidence rather than silently dropping it or inventing a concept. Unsupported/ambiguous mappings stay visible and unscored.
- Historical requirements keep their original producer/policy. No external taxonomy release is adopted without its existing hash/license/version contract and sole-owner engineering review.

**Red/green:** existing focused parser/domain tests and `npm run benchmark:job-intelligence`; add alias/Unicode/substring/dedup counterexamples first. Preserve the original 39-case receipt. Any new driver adapter inspects the new raw-plus-concept contract without weakening the original semantic expectation. **Rollback:** disable the new mapping policy for new versions; retain raw JD and old/new version readers. Do not rewrite a past rubric.

### A8. Represent alternatives and experience ranges as typed relations

**Depends on:** A7 requirement-version contract. **Likely files, five:** `app/lib/server/job-requirements.ts`, `app/lib/server/score-v2-engine.ts`, `tests/unit/job-requirements.test.ts`, `tests/unit/score-v2-engine.test.ts`, `tests/fixtures/job-intelligence.ts`.

- Represent FastAPI-or-Flask as an OR group and explicit AND clauses separately. Preserve required/preferred scope, negation and clause citations; do not demand both alternatives or count overlapping OOP/long-form/async labels twice.
- Preserve both stated 1-4-year bounds, their inclusive/exclusive semantics and “at least” versus range intent. General software months and dated Python-specific experience remain separate typed observations. Missing/ambiguous duration never becomes zero tenure or a confident failure.
- Required/preferred/unknown company-context behavior remains source-bound; unrelated revenue and technology text stays excluded. Unknown interpretations remain reviewable until a candidate-visible versioned clarification resolves them.

**Red/green:** add the neutral Python AI role case, nested alternative/negation, repeated concepts, disjoint/overlapping dates and skill-specific tenure cases before implementation. Existing parser/engine tests and job benchmark follow. **Rollback:** publish review-only unknown relations rather than falling back to independent keyword requirements; preserve past requirement/scoring inputs.

### A8b. Persist the reviewed JD relations through the actual RPC

**Depends on:** A7-A8 reviewed schema and policy, before their writer activation. **Likely files, five:** `app/lib/server/job-requirement-repository.ts`, new forward-only `supabase/migrations/<timestamp>_job_requirement_relations.sql`, `tests/unit/job-requirement-route.test.ts`, `scripts/verify-job-requirements.ts`, proposed `tests/unit/job-requirement-sql-contract.test.ts`.

- Extend versioned SQL shape/evidence/relationship validation together with TypeScript. Historical versions remain readable and immutable. Raw quotes/Unicode offsets and normalized concept/group/range semantics must agree; a direct RPC caller cannot smuggle unsupported concepts, boundaries or importance.
- Bind source/policy/mapping/relationship content into durable replay identity. Equal payload replays once; a changed policy or OR/bounds payload under the same key conflicts. Preserve exact current-head CAS, organization ownership, deletion and consent boundaries.
- Prove the same alias/alternative/range behavior after save and reload, with no drift between pure parser and UI/server read model. Review additive SQL and exact synthetic cleanup before the managed-Supabase allocation; no migration is applied by this plan.

**Red/green:** proposed SQL-contract tests and existing route tests first, then `npm run test:aa3:local` on an explicitly allocated managed synthetic target. Include direct-RPC tampering and concurrent/replayed versions, not just TypeScript mocks. **Rollback:** disable the new producer for new saves while retaining dual readers and history; use forward corrective migrations rather than dropping or rewriting saved rubrics.

### A9. Bind requirement coverage to facts and their relationships

**Depends on:** A2 entity associations and A7-A8b JD relations. **Likely files, five:** `app/lib/server/score-v2-engine.ts`, `app/lib/server/canonical-resume-schema.ts`, proposed `app/lib/server/requirement-support.ts`, `tests/unit/score-v2-engine.test.ts`, proposed `tests/unit/requirement-support.test.ts`.

- Separate a listed skill, a source-supported contribution using it, candidate-confirmed responsibility and dated experience. Link each proposed coverage state to the exact fact, entry, source and requirement versions; never infer Pydantic/async expertise from FastAPI or microservices from a REST endpoint.
- Exact versus alias mapping and required versus preferred states remain inspectable. No duplicate credit from repeated terms, summaries, alternative spellings or employer prose. Unsupported domains/locales, incomplete pages and missing associations still abstain.
- Findings explain what evidence is missing without declaring the candidate unqualified. Candidate confirmation is a declaration, not independent proficiency verification. Authoritative numeric dimensions remain withheld under the current draft policy.

**Red/green:** proposed relationship tests plus existing score-engine/inflation/snapshot tests and `npm run benchmark:scoring-validity`. Add contribution/skill/date swaps and counterfactual names first; no hidden new weight or free point for an unknown. **Rollback:** revert to explicitly unknown coverage, not permissive keyword matching; preserve exact diagnostics/version bindings.

### A10. Replace lexical grounding with bounded fact/relationship support

**Depends on:** A2/A3 fact provenance; reviewed writing contract. **Likely files, five:** proposed `app/lib/server/writing-support.ts`, `app/lib/server/writer-grounding.ts`, `tests/unit/writer-grounding.test.ts`, proposed `tests/unit/writing-support.test.ts`, proposed `tests/fixtures/writing-support.ts`.

- Build a bounded intermediate representation from trusted immutable facts and exact clause anchors: subject/agency, action, object, method, scope, outcome, metric/unit, time, negation and qualifiers. Proposed support must retain these relationships, not merely find every word/number somewhere in the resume. AI may select/reorder supported units; it cannot certify a new relationship.
- Render approved source-preserving transformations from that representation, including a small reviewed equivalence library. Reject unknown/new claims; turn requests for missing outcomes/leadership/skills into clarification questions outside resume content. A schema or another LLM's “true” judgement is not the acceptance boundary.
- Return explicit supported/clarification-required/rejected results with source fact IDs and source/canonical/prompt/policy bindings. Unsupported wording must not be stored or displayed as grounded. Candidate confirmation remains required before canonical acceptance, not a substitute for honest proposal labels.

**Red/green:** port all five preserved lowercase failures, both downstream failures and existing positive wording cases. Add spelled-out metrics, lowercased names/unlisted skills, moved numbers between contributions, negation, increased-versus-reduced outcomes, changed agency/seniority and source-version swaps. Existing writer tests must stay green; proposed support tests prove the structural contract. **Rollback:** disable the affected generation path or return clarification-required; do not restore the known permissive guard behind a “grounded” label.

### A11. Bind explicit rewrite proposals to supported source versions

**Depends on:** A10 for implementation and injected-transport tests. Actual provider acceptance additionally depends on runtime planner's separately restored live API authentication; do not block the offline repair on that credential fault. **Likely files, five:** `app/lib/server/writer-proposals.ts`, `app/lib/server/rewrite-sources.ts`, `app/lib/server/rewrite-ai.ts`, `app/lib/server/rewrite-service.ts`, `tests/unit/rewrite-service.test.ts`.

- Server derives bounded source IDs from the owned immutable source/facts and binds the generation to its exact version/hash. Ignore JD instructions; JD selects relevance only and cannot supply candidate facts. Stale/foreign/deleted/unconfirmed sources cannot gain grounded status.
- Apply A10 after structured parsing and before persistence. Record source support and safe rejection reasons; save `grounded` only when every retained claim is supported. A provider success followed by stale source, unsupported output or failed save preserves the old draft and does not report success.
- Exact replay must not duplicate mutations/provider work accidentally; actual provider retries/costs remain separately visible. Legacy UI changes are owned by frontend and must consume these support states rather than infer truth from nonempty text.

**Red/green:** existing rewrite-service/AI/worker-transport tests plus the preserved explicit downstream probe, with assertions added to those existing tests as implementation proceeds. After authentication is actually restored, allocate a bounded synthetic live rewrite; a mock pass does not close live quality. **Rollback:** stop new generation, preserve previous drafts and audit receipts, do not promote rejected or stale output.

### A12. Apply the same support contract to qualitative feedback

**Depends on:** A10 and A11's shared proposal protocol; do not parallel-edit shared contracts. **Likely files, five:** `app/lib/server/qualitative-prose.ts`, `app/lib/server/qualitative-ai.ts`, `app/lib/server/qualitative-stage.ts`, `tests/unit/qualitative-prose.test.ts`, `tests/unit/qualitative-stage.test.ts`.

- Validate every factual assertion in tips/explanations/summaries/bullets, not only writer bullets. An exact quote establishes citation identity, not that an added revenue/leadership claim is supported. Distinguish factual statements from requests for missing evidence.
- Retain deterministic ownership of numbers and safe partial results when AI fails/refuses/times out. Unsupported output cannot silently become a completed grounded result, and the uncalibrated-evidence guard remains effective.
- Every delivered recommendation cites its bound source/version or is visibly a question. Persisted legacy and current views agree on support state; no model rating or hidden numerical delta is introduced.

**Red/green:** existing prose/stage/AI/outage tests; retain the qualitative downstream failing receipt and add its exact semantic case plus malicious-JD/citation-only/false-explanation cases. A later bounded synthetic real-provider call is separate evidence after runtime authentication. **Rollback:** serve saved deterministic diagnostics and explicit unavailable prose; never fabricate fallback prose or reuse a draft from different inputs.

### A13. Make before/after recommendations useful without inventing credit

**Depends on:** A3-A4 corrections, A9 coverage and A10-A12 support. **Likely files, five:** `app/lib/server/authoring-contract.ts`, `app/lib/writing-quality.ts`, `app/lib/authoring-ui.ts`, `tests/unit/authoring-contract.test.ts`, `tests/unit/writing-quality.test.ts`.

- Present a claim-level before/after diff, the unchanged fact support and a concrete reason the change improves clarity or JD relevance. Prioritize evidenced Python/FastAPI/API/Git work; ask about Pydantic/async/microservices/RAG/agents/cloud only when a real contribution can supply evidence. Numbers remain optional and must be supplied truthfully.
- Reject unsupported acceptance and stale patches. Edit/apply/confirm/undo/restore retain immutable provenance and do not silently transfer trust. A rewritten sentence using the same facts does not automatically add qualification credit.
- Keep projected versus actual rescored outcomes distinct. While calibration is unavailable, both numeric score/delta remain unavailable; show changed diagnostics and evidence instead. Frontend owns visible controls and consumer accessibility/export checks.

**Red/green:** focused tests above plus existing authoring form/route tests; later `npm run test:aa5:local` and the preserved acceptance/undo/stale consumer journeys on the approved synthetic DB allocation. Reparse the actual corrected export in frontend/runtime acceptance. **Rollback:** leave factual/manual editing and version history available; disable only unsupported proposal application and retain previous drafts.

### A14. Preserve score admission now; separate later numerical validity

**Depends on:** A1-A13 for their declared segments, existing AA8/AA9 evaluation contracts and owner acceptance of the final implementation scope. **Likely files, five:** `app/lib/server/score-v2-contract.ts`, `app/lib/server/score-v2-engine.ts`, `app/lib/server/evaluation-calibration.ts`, `app/lib/server/evaluation-claims.ts`, proposed `tests/unit/scoring-release-admission.test.ts`.

- First ship a red/green admission test proving all current uncalibrated/unsupported/incomplete/failed-export states remain withheld, including after candidate confirmation or a successful OCR/provider call. Repairing availability must not silently activate scores.
- A future numerical policy requires its own immutable policy, approved rule/weight/coverage definitions and actual source-bound calibration/locked evaluation receipts per released segment. Reject missing, expired, tampered, wrong-domain/locale/source or leaked-partition receipts. Runtime policy adoption is a distinct explicit step, not a code-build side effect.
- Use known synthetic source truth and owner/AI technical review for engineering now. Later consented representative/domain/customer feedback follows documented rights/purpose/retention and current claim gates; AI labels never become independent-human or vendor evidence. No employer-specific, probability-of-hire or universal perfect-ATS claim follows from a candidate-facing deterministic index.

**Red/green:** existing score-contract/engine/inflation/claims tests plus the proposed admission tests. Existing scoring/writer benchmarks may pass engineering while release remains false; `--release` is not expected to turn green until its actual conditions exist. Use the existing AA8 offline workflow for controlled receipts, not an unreviewed private corpus. **Rollback:** restore withholding/default-off activation; preserve immutable policy/evaluation history and do not reinterpret historical numbers.

## Verification, locks and acceptance checkpoints

No commands in this plan were executed. Existing command names were read from `package.json`. Every pure test/benchmark execution later uses Node 22 and a private environment with `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic`, `AI_ENABLED=false`, a fake key and no dotenv/network/DB capability. Existing runtime scripts are not automatically pure; allocate exact services/images/fixtures and inspect side effects first. New test filenames above are explicitly proposed, not existing green checks.

Persistence command classifications were checked against their fixture/target code: `test:aa2:local`, `test:aa3:local` and `test:aa5:local` reach `createCanonicalFixture` and its `requireBrowserTestTarget` guard; they are eligible only for a specifically allowed managed synthetic target with exact cleanup. `test:aa2:restore` is Docker-database-only and ineligible. `verify-document-evidence-concurrency.py` is loopback-database-only and ineligible for the managed target even though it does not itself invoke Docker. Their replacements must be new guarded managed-target verifiers, not relaxed guards. OCR pilot/fields/adverse commands and the extraction benchmark may execute Docker **workers**, not databases, and remain subject to the runtime planner's image/resource/source allocation. No other database-container-only command is classified as usable in this handoff.

- After A1-A4, checkpoint source completeness, legitimate multiplicity and real CV04 propagation, including replay/concurrency/ownership and corrected export. A notice alone cannot claim materialization is fixed.
- After A5-A9, checkpoint per-segment OCR quality and actual scanned/native/mixed upload behavior, plus raw JD/concept/alternative/range integrity. A successful OCR container or 21 discovered terms cannot stand in for this evidence.
- After A10-A13, checkpoint all preserved wording counterexamples and both downstream probes, then source-bound real-provider quality if authentication is available. Candidate confirmation and truthful labels must survive every path.
- At A14/integrated acceptance, coordinator runs affected feature checks, typecheck/lint and web build before worker build, then one combined consumer suite. Preserve failures/blocked tiers separately; do not repeatedly rerun an unchanged full suite. Default-off policies, provenance, cleanup and privacy are part of acceptance.

Freeze current receipts as the baseline. Once the 39 cases or downstream failures are used as repair targets, they are regression cases, not fresh unseen validity evidence. New labelled fixtures have a versioned manifest and known synthetic provenance; do not relabel, delete, move or tune against the locked test set. Split by document/template/author family and near duplicates; report missing/unsupported/abstained samples in the relevant coverage denominator. Keep native/OCR, clean/challenging, single/multi-column, supported/unsupported domain/locale, junior/experienced and input-versus-export segments explicit. Existing per-segment numerical floors and source-binding/rights rules remain unchanged. The owner-file observation stays a one-off local diagnostic; it does not become reusable labelled corpus material.

## Cross-coverage and risks outside this allocation

| Audit finding or omission                                                        | Coverage in this proposal                                        | Other owner/dependency                                                                                                              |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| CV03 and all five unsafe wording cases, both downstream failures                 | A10-A12, consumer acceptance in A13                              | Frontend truthful labels; runtime bounded real-model probes.                                                                        |
| CV04 correction saved but not materialized                                       | A2-A4, A13                                                       | Frontend reviewed target/diff/add flow and exact failed consumer case.                                                              |
| CV05 OCR not wired; clean sample versus failed block-font/mixed quality          | A1, A5-A6                                                        | Runtime pinned image, isolation, leases, cleanup and allocation.                                                                    |
| CV06 aliases; framework alternatives; year bounds; weak skill associations       | A7-A9                                                            | Domain/policy adoption remains versioned; no universal mapping promise.                                                             |
| Withheld scores, representative uncertainty, before/after credibility            | A9, A13-A14                                                      | Future opt-in customer/domain evidence; no reviewer-team request now.                                                               |
| CV01 authentication, retry/provider budgets and zero-cost-default telemetry      | Interface dependencies in A11-A12                                | Runtime plan must resolve authentication before any more live calls and separate unknown cost from zero.                            |
| CV02 compiler availability, CV08 error/quarantine, actual runtime confinement    | Not closed by ATS tests                                          | Runtime/sandbox and frontend plans; keep canonical versus standalone LaTeX claims distinct.                                         |
| CV07 generic Build rewrite can alter facts                                       | A10 support contract is reusable, but does not itself close CV07 | Frontend/runtime must bind resume-content modes and protected-fact policy; code rewrites cannot silently acquire a fact-safe label. |
| Actual OAuth/email, hosted restore/SLOs, leaked-password setting and DB advisers | Outside ATS repair ownership                                     | Root/runtime security/launch plan; no automatic hosted changes or index deletion.                                                   |

Highest remaining design risks are losing entity identity across corrections, stale provider output overwriting a newer candidate version, reusing contact/global word overlap as proof of a contribution, activating OCR/scoring through a quality exception, and calling green synthetic fixtures a calibrated ATS product. These risks need explicit negative acceptance, not another general validation loop.

## Planning check

This handoff changes no source, configuration, tests, service or existing receipt. No provider, DB, Docker or personal-file execution occurred. Only document formatting, link/prose and whitespace review are appropriate for this planning deliverable. Root must review shared contracts and merge this proposal with the frontend/runtime plans before any implementation begins.
