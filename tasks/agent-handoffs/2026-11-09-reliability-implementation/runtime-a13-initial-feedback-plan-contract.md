# A13 closed initial-feedback plan contract

PROPOSED shared contract, 2026-11-15. This is the bounded operator prerequisite for owned initial feedback, not a new phase plan or implementation approval. No application/SQL source, tests, native calls or services changed. Root and backend agreed the retained-output/capture boundary below; Root owns the final wire freeze.

Reviewed actual backend adoption design SHA `079d29f4c797c3c786e46232396060eaacd810169379829ff0aaef2ee162d96e`, qualitative core `602ba4c5f2be916e85e891dbc9e168083db6e978bb821bce9404a66fa777f666`, and writing IR `083a2b89769005a28eff9b963de8cf38b71ea554e74aa057423bbe9fc712dd67`. Preserve content policy 1.0.0 / SHA 230f2233, writing policy 1.0.4, original source, rejection receipts and the completed scoring-input foundation. A support hash or supplied state never authorizes publication.

## Exact plan boundary

Use the single authoritative TextExpr/Plan/NativeRetainedSupport field list in backend's `backend-a13-initial-feedback-plan-contract.md`, SHA `5cd7e1c7a28aa792cbc1907eaab9aafea9c1f79ce0e5c5bc18e0539b76e1e6a4`; the wire summary below matches that contract. Bind it to the operation's actual immutable scoring-input/source/policy identity, never a caller source string. Every object is strict; unknown or irrelevant keys refuse. No free-form claim text, supported/eligibility flag, metric replacement or caller-derived source metadata belongs in an expression.

```ts
type SpanRef = { start: number; end: number; textSha256: string };
type AnchorRef = SpanRef; // exact whole independently derived IR anchor
type Typography = "basic" | "admitted_prose";
type Terminal = "as_rendered" | "append_period";
type VerbChoice = "original" | "source_lower" | "source_title"
  | "Built" | "built" | "Created" | "created" | "Developed" | "developed"
  | "Reduced" | "reduced";
type TipPlan = { originalIndex: number; requestedType: "good" | "improve";
  quote: SpanRef; title: TextExpr; explanation: TextExpr };
type BulletPlan = { originalIndex: number; original: SpanRef;
  rewrite: TextExpr; reasoning: TextExpr };
type Plan = { schemaVersion: "initial-feedback-plan/1.0.0";
  sourceTextSha256: string; policyVersion: "initial-feedback-plan-policy/1.0.0";
  toneAndStyle: TipPlan[]; content: TipPlan[]; structure: TipPlan[]; skills: TipPlan[];
  writer: { summary: TextExpr | null; bullets: BulletPlan[] } };
```

TextExpr is a nonrecursive strict union with these fields:

| kind | Fields besides kind |
| --- | --- |
| copy_source | anchor |
| normalize_layout | anchor, typography, terminal |
| rewrite_clauses | anchor, clauses:[{sourceIndex,verb}], typography, terminal |
| role_summary | role, terminal |
| compose_explicit_role_contribution | role, contribution, verb, terminal |
| editorial_fixed | templateIndex, period |
| editorial_measured | anchor, templateIndex, period |
| editorial_object_prefix | anchor, wordCount, period |
| clarification_fixed | templateIndex, period |
| clarification_question | topic, form |

SpanRef uses zero-based half-open code-point offsets in the original source. Each category and bullet array has at most four entries, originalIndex is 0..3 and strictly increasing; reject duplicates/reordered inputs rather than sort them. sourceIndex is an actual clause index. period is a required boolean selecting only the finite template's final ASCII period; it carries no support authority. Editorial fixed indices are 0..18 for the actual 19-entry table, measured 0..4, clarification 0..5, wordCount 1..4. Topic is one of the seven actual topics; form is what_verify|what_confirm|can_verify. All tables retain their actual frozen order.

Role expressions are summary-only; questions are tip-only; editorials are tip fields or bullet reasoning only. Writer original is an actual source SpanRef, rewrite is a factual expression, reasoning editorial only, and null summary stays null. Each expression must render the exact retained core text. The finite template period choice supports the existing with/without-final-period domain instead of forcing an unrelated change to a retained title. Template rendering removes only its own one final ASCII period and appends one iff period=true; final frozen template/editorial membership remains required. For source transformations, as_rendered adds nothing; append_period is allowed only if the normalized result contains no http(s)/mailto and does not already end in a period, otherwise refuse.

## Independent native operators

Native loads the actual original source and derives its complete bounded anchor/context document once per finish. The plan selects spans and operations; it does not supply parsed clauses, actors, metrics, qualifiers, adjacency or approval. Every selected anchor is rederived with its surrounding source/section/layout/quote qualifiers. A matching substring without that context is insufficient.

| Operation | Exact native reconstruction and admission |
| --- | --- |
| copy/normalize | copy_source returns the exact complete anchor. normalize_layout applies only the selected exact comparable/comparableProse renderer and Terminal, then enforces the frozen unqualified/source comparison rules. Preserve source facts, technical identifiers and Unicode; no inferred replacement text. |
| equivalent action | Derive actual clause/action boundaries. Keep the explicit I/We prefix and complete object/qualifier/metric material; no rest replacement is allowed. Only the selected frozen normalization may change presentation. Create may select Built/Created/Developed in the existing title/lower forms. Other source actions retain their actual lexical action; same agency/concept alone does not authorize another synonym. |
| Improved→Reduced | Only the actual lowerIsBetter branch: positive finite time/percentage latency or response-time metric, exact unit/boundary/suffix grammar, no compound/negative/uncertain outcome. Preserve the full literal object. PostgreSQL arbitrary-precision positivity is not a substitute for the original finite-number guard. |
| independent clauses | Rederive the complete original split, require a bijective full permutation with no duplicate/omitted clause, and require actual reorderable when order changes: same actor, known actions, no negation/dependency/deictic token. Each selected verb must be in the actual clauseVariants set (including original/lower/title rules). Fixed `; ` joins and Terminal cannot move metrics/scopes between clauses. |
| explicit role | role_summary requires an actual unqualified role anchor and literal employer. Composition additionally requires a unique role for that employer, actual immediate adjacentRoleId, and one implicit/nonnegated known-action contribution with object ending at that same employer. Render the frozen roleDisplay plus ` who ` and lower-first permitted clause variant. Role-only renders the frozen title/employer form. No neighboring header alone establishes attribution. |
| editorial | Fixed table entries copy actual qualitative editorialTemplates. Source-specific base/metric forms copy actual editorialForms; metric forms require an actual parsed metric, and object-prefix uses only the first 1..4 original object words after the existing article/period handling and stop-word/digit rule. No new candidate assertion is inserted. |
| clarification | Copy an exact clarification template, or one of the three fixed question forms with one of the seven fixed topics. Unknown questions/presuppositions refuse. Derive clarification_required and improve, never strength/fact. |

For tips, both title and explanation must use the same exact unique quote. A claim expression must be the anchor selected by the frozen original-quote lookup, not any anchor merely intersecting the citation. Fixed editorial/questions may use the existing valid-citation domain without claiming factual authority. Writer originals require the same unique anchor lookup. Summary role composition has its separate two-anchor proof above.

## Unicode, offsets and limits

SpanRef offsets are code points; PostgreSQL substring is one-based, so extraction is start+1 with end-start characters. Validate bounds and exact UTF8 substring SHA. Reject NUL, malformed/lone surrogates and non-UTF8 databases. Do not normalize the source before selecting offsets.

Legacy anchor IDs have a different detail: writing-support.ts 433-445 hashes sourceSHA plus the original JavaScript UTF16 start/end, while returning code-point start/end. Native must build a bounded code-point→UTF16 prefix map, counting astral characters as two units, and reproduce that old ID exactly. It must not hash code-point indices and call the result an old anchor ID. IDs remain correlation; native span/context derivation supplies authority.

Normalization uses exact JavaScript whitespace/trim code points, NFC and the frozen bullet rules. Native must implement FB00-FB06 expansion/internal-SHY removal only in the admitted lowercase-prose tokens and retain every opaque/numeric/technical guard. Generic PostgreSQL trim, locale lower, POSIX classes or regex flags are not asserted equal to JavaScript Unicode behavior. Use explicit pinned character rules where needed; native-incompatible domains refuse. In particular, roleDisplay changes only the six exact capitalized role nouns, not the whole title or employer. Full Unicode literal copy remains available when its actual context is admissible.

Keep the existing 100,000-UTF16 source ceiling, 512 anchors, 16 clauses/anchor, 16 citation anchors, 73 semantic assessments, four tips/category and four writer bullets. This yields at most 41 generated title/explanation/summary/rewrite/reasoning texts. Plan JSON is at most 65,536 UTF8 bytes; all field-length checks use the existing UTF16 semantics and current 500/1000/1200/500/700/500 limits. No source, clause or output truncation. A retained core part that cannot be compiled and reconstructed byte-exactly causes explicit native_incompatible refusal of the whole proposal, not silent dropping/canonical rewriting into a convenient success. This is a bounded executable domain with real changed-action/reorder/role/editorial/question usefulness; it does not redefine full A13 as copy-only or claim broad free-form usefulness.

## Decision and compatibility mapping

Backend and runtime agreed this mapping before code:

1. Preserve the complete unchanged core sidecar as recorded Node observations. Its authority remains source_content_only and ownedVersionProof remains not_provided. Store an actual native capture digest; it records that observation, not independent proof of omitted/rejected raw text.
2. Every captured retained=true item/bullet/summary must have exactly one plan expression/pair, with rendered text hashes matching that recorded part. Captured false decisions have no retained expression and remain capture-only. No hash or retained flag itself authorizes a positive; native independently proves each rendered expression.
3. Native derives part kind/state and combined item kind/type from the actual proof. Any question forces clarification_required/improve. An editorial-only item is improve. A supported source claim may preserve requested good|improve. Produce a native envelope explicitly scoped retained_output_only, with original category/index→compressed retained index and actual SpanRef source relationships. Its exact fields are schemaVersion/scope/bindingSha256/planSha256/parts/mapping: typed retained tips and writer summary/bullets; mapping tips, bullets, nullable summary and compatibility-only padding. Use the backend NativePart reason/state/type domains unchanged. Do not label the entire raw sidecar native-verified.
4. Use fixed category order and original index order, preserving all arrays. For each compatibility category, copy retained tips then pad only to a minimum of three using the exact legacyCategoryFromProse placeholder and score 0 semantics. Four retained tips remain four. Padding has origin:null, no citation and no supported/verified status; it is never a core observation, useful result or model rating. Keep the actual no-quote placeholder hidden by the presenter. Writer mapping separately preserves originalIndex→retainedIndex; null summary stays null.

The future implementation must compile actual core outputs, render the plan, rerun the unchanged core on reconstructed output and require exact retained-result agreement before dispatching any native publication. Native independently reconstructs/proves the same retained domain from owned original source; it must not call a JS boolean or compare a JS JSON.stringify hash with PostgreSQL jsonb text. Policy tables, new plan/counterpart profiles and offset behavior require actual source pins and finite cross-language vectors at implementation. No placeholder hash or current source approval is supplied by this document.

## Deterministic-only historical path

The exact no-provider result input is `{kind:"deterministic_only",reason:"ai_disabled"|"historical_inputs",plan:null,observation:null}`. A JD edit after deterministic commit may refuse fresh AI dispatch, but must not block safe deterministic_only publication of the original bound result. With current owner/privacy/active-source admission and required worker authority, native may copy the actual original deterministic row and binding and label historical currentness/reason. It supplies no prose/core/native assessment. This path also covers AI off without fabricated consent, provider, dispatch claim or usage. It never rescales, rekeys or stamps historical inputs current, never backfills an unbound old result, and never overwrites an existing assessed publication. A late provider response may settle technical usage but cannot replace the immutable deterministic-only publication. The uncalibrated/evidence-v2 floors remain unchanged.
