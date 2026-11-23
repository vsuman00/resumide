# Typed requirement coverage handoff

CR-A10 remains PARTIAL. The next implementation must deliver the actual owned typed-JD coverage path; a helper supplied with hand-authored authority records is not completion. Initial source inspection changed no A10 production/test files. The allocated reader is now in progress in separate worktrees; no whole-reader completion is claimed. The deliberate typed-JD 503 and numeric withholding remain.

## Confirmed current gaps

- `score-v2-repository.ts` rejects every `requirements/2.0.0` document. The engine accepts the legacy requirement schema only.
- No owned reader exposes validated active relationship/member proof for the exact selected canonical/JD snapshot. Metadata tables remain denied to application roles, including service_role; a direct table query is not an admitted substitute.
- A02 metadata certifies selected employer/role/date associations only. Producer `.4`, shared placement and carried skills/bullets do not establish contribution, responsibility or skill-specific duration.
- Existing raw writing IR is source-transformation support, not an admitted coverage edge. A new versioned validator must derive an explicit relationship from an exact cited clause or exact confirmed declaration with its real lineage.
- The legacy alignment trace requires UUID IDs and at least one requirement UUID. Typed clauses use SHA IDs, and retained unmapped clauses may have zero operands. Do not flatten them into legacy rows or silently omit them.
- Authoring lacks the JD/diagnostic/relationship binding needed for typed proposals. Read-only diagnostics and proposal admission require separate explicit compatibility decisions; unpausing the former must not accidentally unpause the latter.

## Full implementation sequence

1. Implement an owned exact-version header relationship context reader and strict server adapter. This is the first missing prerequisite, not the finished matcher.
2. Implement a versioned semantic producer from actual immutable source clauses and exact confirmed declarations, retaining actor/action/skill/time/negation/qualifiers and current-versus-observed provenance. No new persisted declaration is needed when the existing supported text already states the relationship. Missing assertions require explicit candidate review through an admitted immutable flow, never automatic synthesis from co-location.
3. Implement typed operand/clause coverage using those real witnesses. Preserve AND/OR, polarity, importance, aliases, retained clauses, inclusive/exclusive bounds and overlap union for the same supported subject. Distinguish listed skill, source-supported contribution, candidate-declared responsibility and dated use. Confirmation is not independent proficiency verification.
4. Adopt a strict typed-only diagnostic sidecar and actual read-only consumer. Preserve legacy traces/outputs and null numeric dimensions. Show exact pinned versions, witness/citation references and truncation counts. Use a valid contribution edit target or explanation-only state; never the first cited fact heuristic.
5. Keep typed authoring paused at shared validation and pre-transport repository boundaries until its dependent contract binds JD version/revision, diagnostic identity and relationship context. Old/caller eligibility flags cannot admit it.

The typed 503 must stay until its real coupled read path is implemented. Actual SQL/native/browser/customer acceptance remains separate from source/mocked checks.

## First reader leaf: implementation allocated

RPC: `read_requirement_relationship_context(p_user_id uuid, p_analysis_id uuid, p_selection jsonb)`.
Selection is exactly `{canonicalVersionId: UUID|null, requirementVersionId: UUID|null}`. Null selects current inside the owned read; explicit historical choices must not depend on today's review caps or current-head proof.

DTO: `requirement-relationship-context/1.0.0`, authority `owned_header_relations_only`, scoring eligibility false. Required field families: exact seven-field source binding; actual nullable `resume_versions.page_count`; attempt/envelope; canonical version/revision/locale/native content SHA/content; typed JD version/revision/input/native content SHA/content; ordered owned ancestor suffix of at most 64; selected versions separate from captured current heads; exact A02/JD admission/profile identities; and active header snapshot.

Header snapshot must distinguish actual `regroup|association|none` marker presence, including empty headers and family-specific creation kinds. Active groups carry section/entry, typed origin family/batch/group/original approval version and exact original source selection. Selected employer/role/date members retain assertion/fact/source order, current value/state/confirmation separately from observed source value, full citation/location tuples and current-citation versus owned-ancestor origin references. This is header authority only. Publish the precise strict nested wire schema before dependent adapter/test work; do not use unknown records or caller proof booleans for security-relevant fields.

Reuse the existing narrow ownership/privacy scope, loaded proof/origin/header/resolver helpers and ONE invocation cache. Preserve all current aggregate/per-kind/per-base ceilings. Charge added JD/projection/output work and bytes; do not reset per origin, impose a new 32-active-group ceiling or silently truncate. Preserve opaque PostgreSQL JSONB-text UTF-8 hashes; JavaScript serialization hashes are not equivalent. Capture/recheck selected pair, actual heads/job link and active ownership/deletion before releasing private data. Missing catalogs/proof fail closed.

New public reader execution is service-only after explicit revocation from PUBLIC/anon/authenticated; private helpers remain denied. No writer grants, tables, canonical producer changes, flags or activation. Its exact function version/body/attributes must enter the guarded readiness successor; write readiness does not certify semantic coverage.

Proposed bounded source files: Root-generated forward migration; `app/lib/server/requirement-relationship-context.ts`; `tests/unit/requirement-relationship-context.test.ts`; deferred rollback-only `scripts/verify-requirement-relationship-context.sql`; allocated worker handoff. Split SQL and adapter ownership into separate bounded leaves if the full file/hand-off allocation requires it. Do not invent a migration filename. The governing [reader contract](a10-relationship-context-contract.json) is now allocated. Backend publishes the precise strict nested wire schema and coherent SQL/adapter before dependent test execution; Root controls checkpoint copies.

## Acceptance and current authority

Include actual owned coupled positives for every claimed tier. Test role/employer/date/skill/citation/version/policy swaps, ambiguous and unsupported inputs, stale heads/privacy, header lifecycle/restore, missing/duplicate members, no alias/overlap credit inflation and all bound equalities. Pure fixtures do not prove the owned SQL/native bridge. Unsupported evidence stays unknown with a concrete missing-evidence explanation, never a statement that the candidate is unqualified.

Three read-only agents supplied the findings: backend proposed the reader; frontend identified typed consumer/authoring needs; the third technical reviewer uses existing agent name `pricing_validation` after pool reuse and performs no pricing work. Reader implementation is allocated under contract `5ff23fa3`; the full semantic producer/coverage/consumer sequence remains open. Services remain free; deployment/publication remain stopped. No source, SQL parse/execution, native/compiler/browser/provider, actual configuration/key/PII or hosted operation ran in this preparation.

Current Supabase documentation was checked for the source design: [Data API grants and function access](https://supabase.com/docs/guides/api/securing-your-api) and [CLI v3 changes](https://supabase.com/changelog/supabase-cli-v3). The existing CLI remains 2.117.0; its installed `migration new --help` was read. No upgrade or schema operation occurred. Project authorization still permits only source scaffolding and synthetic checks; native verification/advisors remain deferred rather than being represented as passed.

## Current adapter checkpoint

The strict adapter is implemented in the assigned worktrees at `efa0f6b3`; Root main is not integrated. Initial `61852b99` passed scoped types and source review, then a real grouped-builder/fakeRPC probe found that an association snapshot could accept a regroup-origin group. The successor adds the narrow family invariant while preserving valid mixed regroup origins. The same two affected cases now pass. Original failing receipt, unchanged test snapshot and both source versions remain preserved. The full finite matrix, SQL projection/readiness and native acceptance are still pending. Do not treat adapter-only fakeRPC success as the coupled reader or typed matching being ready.

## Integrated reader and next allocation

The [reader closeout](a10-relationship-context-closeout.md) supersedes the intermediate pending checkpoints above. Root fresh 88-case gate, full types/lint and web/worker builds passed; all 760 inputs remained stable and all previous 756 source inputs are unchanged. Native SQL remains unrun. The three agents now own the actual [semantic producer allocation](a10-semantic-evidence-contract.json): backend module, frontend independent tests and read-only technical review in their existing worktrees. Root owns shared contracts, synchronization, integration and one combined gate. No prior reader campaign will be repeated without an affected change.

## Semantic prerequisites closed; actual consumer in progress

The [semantic/duration closeout](a10-semantic-evidence-closeout.md) records the fresh 158-case, three-file gate and full static/build checks. Reader and semantic prerequisites are integrated. Actual typed coverage has source checkpoint13840b0d but no independent behavioral claim; the [coupled consumer allocation](a10-typed-consumer-contract.json) now owns matching tests, shared technical diagnostics, exact-version readmodel and actual route/UI. Typed authoring remains separately paused. Prior pending checkpoints above are retained history.
