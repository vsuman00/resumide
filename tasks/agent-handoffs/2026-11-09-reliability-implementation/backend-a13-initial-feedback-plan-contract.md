# A13 initial-feedback closed-plan contract

PROPOSED FOR ROOT FREEZE, 2026-11-15. Only this document changed. No application code, policy, migration, tests, SQL parsing/execution, provider or service ran. This refines design079d and the actual frozen `writing-support.ts` / `qualitative-support.ts` constructors; full usefulness, native execution and activation remain separate gates.

## Header and references

```ts
type SpanRef = { start: number; end: number; textSha256: string };
// start/end are immutable source Unicode-code-point offsets, [start,end).
// Integers 0 <= start < end <= source CP count; SHA is exact UTF8 slice SHA256.
type AnchorRef = SpanRef; // must equal one whole independently derived IR anchor
type Terminal = "as_rendered" | "append_period";
type Typography = "basic" | "admitted_prose";
type VerbChoice =
  | "original"
  | "source_lower"
  | "source_title"
  | "Built"
  | "built"
  | "Created"
  | "created"
  | "Developed"
  | "developed"
  | "Reduced"
  | "reduced";
type Category = "toneAndStyle" | "content" | "structure" | "skills";
```

Every object is strict. Unknown keys/operators/enum values, malformed Unicode, NUL, nonintegral/out-of-bounds offsets, wrong SHA or a reference not found in the actual immutable source refuse the plan. A matching hash is correlation, not semantic proof. No caller/model boolean supplies owner, source, actor, qualifier, reorderability, supported-state or metric authority.

The server wraps the plan in the original owned scoring binding and operation policy. Model content carries only `schemaVersion:'initial-feedback-plan/1.0.0'`, `sourceTextSha256`, `policyVersion:'initial-feedback-plan-policy/1.0.0'` and the fields below. Native independently requires those values to match the operation's stored original source/policy. No canonical or typed-JD identifiers are fabricated for this legacy-extraction tier.

## Exact expression union

```ts
type TextExpr =
  | { kind: "copy_source"; anchor: AnchorRef }
  | {
      kind: "normalize_layout";
      anchor: AnchorRef;
      typography: Typography;
      terminal: Terminal;
    }
  | {
      kind: "rewrite_clauses";
      anchor: AnchorRef;
      clauses: Array<{ sourceIndex: number; verb: VerbChoice }>;
      typography: Typography;
      terminal: Terminal;
    }
  | { kind: "role_summary"; role: AnchorRef; terminal: Terminal }
  | {
      kind: "compose_explicit_role_contribution";
      role: AnchorRef;
      contribution: AnchorRef;
      verb: VerbChoice;
      terminal: Terminal;
    }
  | { kind: "editorial_fixed"; templateIndex: number; period: boolean }
  | {
      kind: "editorial_measured";
      anchor: AnchorRef;
      templateIndex: number;
      period: boolean;
    }
  | {
      kind: "editorial_object_prefix";
      anchor: AnchorRef;
      wordCount: number;
      period: boolean;
    }
  | { kind: "clarification_fixed"; templateIndex: number; period: boolean }
  | {
      kind: "clarification_question";
      topic:
        | "outcome"
        | "result"
        | "context"
        | "scope"
        | "method"
        | "role"
        | "contribution";
      form: "what_verify" | "what_confirm" | "can_verify";
    };
```

There is no arbitrary output string, replacement object, metric, employer, skill, actor or pronoun parameter. The model selects source material and an exact finite operation. The server compiler may emit an expression only when its renderer reproduces the intended retained text byte-for-byte; it never silently rewrites output to fit. Unsupported/nonrepresentable output is explicitly unavailable/native-incompatible, with deterministic-only recovery available. This finite native wire does not redefine every free-form string accepted by the older pure helper as representable.

### Renderer and proof rules

- `copy_source` returns the exact anchor slice. Factual use still requires the frozen core's complete unqualified source-context proof and unknown-question rejection; copying an exact question, tutorial/team claim or qualified snippet cannot bypass that wrapper.
- `normalize_layout` renders `comparable(anchor.text)` for basic or `comparableProse(anchor.text)` for admitted_prose. These are the exact frozen algorithms, not PG trim/locale equivalence. `append_period` appends one ASCII period only when the normalized text contains neither http(s) URL nor mailto and does not already end in a period. Otherwise that terminal choice refuses. `as_rendered` adds nothing. The final exact output must be admitted by the unchanged rewrite assessment.
- `rewrite_clauses` requires 1..16 entries, exactly one for every actual source clause. `sourceIndex` is 0..n-1, with no omission/duplicate. Preserve caller array order. Nonidentity order requires the actual anchor.reorderable proof: known actions, same actor, no negation or unresolved causal/temporal/pronoun dependencies. Never infer independence from a model field.
- Each clause starts from the frozen `comparable(clause.span.text)`. `original` preserves the original action surface; source_lower lowercases that ASCII action; source_title uppercases its first character and preserves the rest, matching actual clauseVariants. Prefixes such as I/We and any source negation remain exact. The explicit Built/Created/Developed alternatives exist only for a nonnegated actual create concept. Reduced exists only in the actual variant set: an original reduced surface or nonnegated improve with the frozen lower-is-better proof. No leadership/supporting/ownership interchange.
- Keep the rest of each clause intact except the explicitly selected basic/admitted-prose normalization. Join the complete clauses with exactly `'; '`, then apply Terminal. Reordering therefore cannot transfer a metric, governor, skill or scope between clauses. Node/native must reproduce the existing relationship comparison as well as matching rendered text.
- `role_summary` is summary-only. Require an actual unqualified explicit role anchor; render `roleDisplay(title) + ' at ' + employer`, pass through basic comparable and Terminal. roleDisplay lowercases only the exact Engineer/Developer/Analyst/Architect/Designer/Scientist words used by the frozen function; no inferred title or employer.
- `compose_explicit_role_contribution` is summary-only. Require the actual unique-employer role, actual contribution.adjacentRoleId equal to it, both unqualified, exactly one contribution clause, implicit source subject, known action, object and no negation. The contribution must end with literal `at <same employer>` under the exact old equality. Render `roleDisplay(title) + ' who ' + lowerFirst(selected clauseVariant)`, then basic comparable and Terminal. Do not prepend another employer phrase or borrow an adjacent bullet without this source proof. This branch uses basic comparable, not typography folding; the old summary branch does not use comparableProse here.

### Exact finite templates

`editorial_fixed.templateIndex` is integer 0..18 into the actual 19-entry frozen `QUALITATIVE_SUPPORT_POLICY.editorialTemplates` array, in its actual order, and renders that exact value with its final period controlled by `period`. Pin policy SHA230f rather than reorder or invent entries. This includes generic nonclaim requests such as Clarify this contribution and Clarifies wording; they need source citation identity but do not require claiming candidate agency. They must never become strengths.

`editorial_measured.templateIndex` is integer 0..4 into this exact array, with their existing periods shown:

1. `Makes the measured outcome clearer.`
2. `Clarifies the measured contribution.`
3. `Clarifies the existing measured contribution.`
4. `Clarifies the existing contribution and measured result.`
5. `Clarifies the result.`

Require at least one independently parsed actual source metric, exactly as frozen editorialForms; no invented metric or broader qualification. The numbered list describes indices 0..4 in order.

`editorial_object_prefix.wordCount` is integer 1..4. Derive the FIRST actual clause's object, remove only its leading a/an/the and final ASCII period using the exact frozen rules, then take the selected prefix words. Reject if too few words or if any selected prefix ends at the frozen scope/conjunction/digit barrier (`at|for|with|during|within|in|by|and`, or a digit). Render `Clarifies <exact prefix> wording.` and require membership in actual editorialForms. Caller text cannot supply a topic such as dashboard or revenue.

For all four fixed/measured/object-prefix/clarification-template operators, `period` is a formatting selector: remove only the template's own one final ASCII period, then append one iff true. It is not an eligibility flag. The complete rendered text must still pass the exact frozen template/editorial membership rule; URL-sensitive comparisons are not relaxed. This preserves both `Clear` and `Clear.` without a free-text suffix. Topic questions retain their fixed question mark and have no period parameter.

`clarification_fixed.templateIndex` is integer 0..5 into the frozen policy's clarificationTemplates, same order, with final period controlled by `period`. `clarification_question` renders exactly `What <topic> can you verify?`, `What <topic> can you confirm?` or `Can you verify the <topic>?` according to form. No free-text question, presupposed outcome or question-mark laundering. These derive clarification_required, type improve, never factual strengths.

## Plan shape and original-to-output mapping

```ts
type TipPlan = {
  originalIndex: number;
  requestedType: "good" | "improve";
  quote: SpanRef;
  title: TextExpr;
  explanation: TextExpr;
};
type BulletPlan = {
  originalIndex: number;
  original: SpanRef;
  rewrite: TextExpr;
  reasoning: TextExpr;
};
type Plan = {
  schemaVersion: "initial-feedback-plan/1.0.0";
  sourceTextSha256: string;
  policyVersion: "initial-feedback-plan-policy/1.0.0";
  toneAndStyle: TipPlan[];
  content: TipPlan[];
  structure: TipPlan[];
  skills: TipPlan[];
  writer: { summary: TextExpr | null; bullets: BulletPlan[] };
};
```

Each array has at most four entries. originalIndex is 0..3, unique within its original category/writer list and sorted ascending; reject reordered/duplicate inputs rather than silently sort. Category order is fixed toneAndStyle/content/structure/skills. quote/original renders the exact immutable source slice and must be nonempty and uniquely present in the source as required by the existing core. Factual title/explanation/rewrite must refer to the same actual whole anchor as the original quote under the frozen comparable lookup; generic editorial/questions do not gain relationship authority from their quote. Role/compose operators are permitted only in summary, clarification operators only in tip fields, and editorial operators only in tip fields or bullet reasoning. No arbitrary expression recursion.

Every captured Node retained=true tip has exactly one matching plan entry with title and explanation expressions; every retained bullet maps once; retained summary maps once. Every false item remains in the full recorded Node assessment, not silently deleted. Native independently renders and verifies the retained parts, including exact UTF8 text hashes and source references. A captured boolean/hash cannot authorize text. If any captured retained output cannot be represented and independently admitted, refuse this publication rather than drop it or pretend the whole capture is verified.

Native returns explicit maps:

- `tips:[{category,originalIndex,retainedIndex,compatibilityIndex}]` for each retained item, with contiguous retainedIndex 0..n-1 derived from original index order.
- `bullets:[{originalIndex,retainedIndex}]`; summary has a separate nullable retained reference.
- `padding:[{category,compatibilityIndex,origin:null,scope:'compatibility_only'}]` for exact legacy padding entries. Padding is never a core assessment or native-supported prose.

`legacyCategoryFromProse` keeps four retained rows as four, never truncates. For fewer than three it appends the existing exact type improve / tip `No additional cited suggestion is available.` / explanation `Review the source evidence before adding information.` with no quote, category score0. Do not join the frozen sidecar's original category/index directly to compressed retained or padded arrays. The browser-safe reader maps verified retained fields explicitly; CitedWritingSuggestions must stop deriving strength from quote plus good alone.

## Two authority scopes, hashes and limits

Persist the full unchanged `QualitativeSupport` sidecar as a recorded Node assessment. Its original literals stay source_content_only/not_provided, including all rejected/raw-part hashes. A native captureSha256 records the stored assessment JSONB; it does NOT prove omitted rejected text or its decisions. Do not claim this entire sidecar was independently reconstructed from retained expressions.

The exact independently derived retained envelope is:

```ts
type NativePart = {
  kind: "source_claim" | "editorial_observation" | "clarification_question";
  state: "supported" | "clarification_required";
  reason:
    "source_transformation" | "editorial_template" | "clarification_template";
  textSha256: string;
  sourceRefs: SpanRef[]; // <=16, independently derived, never caller authority
};
type NativeRetainedSupport = {
  schemaVersion: "initial-feedback-native-support/1.0.0";
  scope: "retained_output_only";
  bindingSha256: string;
  planSha256: string;
  parts: {
    tips: Array<{
      category: Category;
      originalIndex: number;
      retainedIndex: number;
      type: "good" | "improve";
      kind: NativePart["kind"];
      state: NativePart["state"];
      reason: "source_transformation" | "editorial_template" | "question_only";
      quote: SpanRef;
      title: NativePart;
      explanation: NativePart;
    }>;
    writer: {
      summary: NativePart | null;
      bullets: Array<{
        originalIndex: number;
        retainedIndex: number;
        original: SpanRef;
        rewrite: NativePart;
        reasoning: NativePart;
      }>;
    };
  };
  mapping: {
    tips: Array<{
      category: Category;
      originalIndex: number;
      retainedIndex: number;
      compatibilityIndex: number;
    }>;
    bullets: Array<{ originalIndex: number; retainedIndex: number }>;
    summary: { retainedIndex: 0 } | null;
    padding: Array<{
      category: Category;
      compatibilityIndex: number;
      origin: null;
      scope: "compatibility_only";
    }>;
  };
};
```

The immutable publication stores the full unchanged `QualitativeSupport` observation, a native `captureSha256` of that recorded JSONB, and this separate native envelope. It never takes a supplied capture hash as proof. Native independently validates ONLY retained scope. Mapping and parts must agree exactly; no caller-provided output indices are trusted. Question/editorial output is improve; source-claim requestedType is merely the raw requested enum and is retained only after actual support admission. Unknown or incompatible operators refuse. Whole-publication-empty output is unavailable, not a useful completion claim.

## Deterministic-only historical amendment

Root explicitly approved a separate no-provider result input:

```ts
type NoProviderResult = {
  kind: "deterministic_only";
  reason: "ai_disabled" | "historical_inputs";
  plan: null;
  observation: null;
};
```

If current job text changed after deterministic commit, fresh automatic AI preparation must not retry into analysis failure merely because the original binding is now historical. Native returns the actual bound original context/currentness and admits this deterministic-only path when current ownership/privacy/active-source access, the original input/result digests and required worker authority still hold. It copies the unchanged original deterministic result through the safe partial semantics, publishes `currentness:'historical'` with `reason:'historical_inputs'`, and performs no provider construction, consent audit, rate/budget reservation or dispatch claim. It cannot overwrite an existing assessed publication and cannot stamp original JD inputs current. The AI-off variant has the same null plan/observation semantics. Provider-attempt failures with an existing recorded observation need their separate operation/settlement transition; this null-observation variant must not erase an existing assessment or known/unknown usage. Public read/prepare/partial DTOs must preserve these reasons and currentness when the operations leaf is frozen.

Hash domains remain distinct:

- Source and rendered text/ref SHA values are SHA256 of exact UTF8 strings, without normalization unless the specific expression renders normalized output.
- Existing IR IDs remain SHA256 of `sourceSha256 + ':' + decimal JS_UTF16_start + ':' + decimal JS_UTF16_end`. Native must build the UTF16 prefix map from original UTF8 source before recreating those IDs. Returned span/citation offsets remain code points. Never substitute CP offsets into a legacy ID or normalize source before lookup.
- Frozen core policy SHA230f and `legacy-source-transforms/1.0.4` remain unchanged. A NEW plan-policy descriptor pins the exact operator/template/renderer/limit contract and those predecessor identities; compute its actual SHA from implemented source before freezing any production/native literal, never placeholders.
- planSha256/captureSha256/publication/result/writer digests are separately named native JSONB SHA values. Do not emulate them with Node JSON.stringify. The legacy scoring result checksum retains its original ordered JS payload algorithm.

The counterpart must explicitly implement the ECMAScript whitespace set (0009..000D,0020,00A0,1680,2000..200A,2028,2029,202F,205F,3000,FEFF), NFC, actual bullet prefix and period/URL rules. admitted_prose additionally uses ONLY the existing FB00..FB06 map and internal soft-hyphen rules, guarded by action/prose/opaque-identifier/numeric/quoted-context checks. Never use generic NFKC, locale lowercase, PG trim/[:space:] or broad ligature replacement as a substitute. Unsupported native Unicode/category/normalization behavior is explicit incompatibility, not a guessed positive. Full left/right qualifiers, layout boundaries, actor, negation, metric governors, direction and scope must be independently derived from complete source. Missing native validators prevent adoption.

Keep source100,000 UTF16, anchors512, clauses16/anchor, clause/document metrics32/256 and scopes16/256, cited anchors16, assessments73 and input JSON65,536 bytes. At most41 rendered field expressions (16 tip pairs + summary + four bullet pairs); enforce old per-field caps tip500/explanation1000/quote500/summary1200/original500/rewrite700/reasoning500 and the reconstructed prose JSON65,536-byte limit too. Source/plan resource failure refuses, never truncates. Use one bounded native invocation context; preserve aggregate work limits across expressions and any shared cache. No per-expression reset or candidate-controlled proof flags.

## Bounded equivalence controls for implementation

These are proposed source/Node/native vectors, not tests executed by this design:

| Input and operation                                                                                                                       | Exact expected result or refusal                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `Built a dashboard.` / rewrite_clauses sourceIndex0, verb Developed, append_period                                                        | `Developed a dashboard.`; same object/actor, create contribution only.                                                     |
| `Built services; maintained queues.` / clause order1,0, source_title then source_lower, append_period                                     | `Maintained queues; built services.`; no metric or scope transfer.                                                         |
| `Built services; then reduced latency by 20%.` / reversed order                                                                           | Refuse actual nonreorderable dependency.                                                                                   |
| `Backend Engineer at Cedar Labs` newline `Improved API latency by 20% at Cedar Labs.` / explicit role composition, Reduced, append_period | `Backend engineer who reduced API latency by 20% at Cedar Labs.`; actual unique employer/adjacency/lower-is-better checks. |
| Same role but different employer, heading/team qualifier or wrong adjacency                                                               | Refuse, no co-location promotion.                                                                                          |
| `Built a dash` newline `board.` as an admitted continuation / basic normalize                                                             | Reconstruct exact frozen comparable whitespace result; no invented token joining.                                          |
| A plain admitted prose word containing FB01 or internal soft hyphen / admitted_prose                                                      | Fold only when actual comparableProse does; code/URL/metric/quoted contexts do not gain folding authority.                 |
| Emoji before a referenced anchor                                                                                                          | Same CP slice/text hash and separately correct legacy UTF16 ID; no offset substitution.                                    |
| Any quote / clarification_question outcome+what_verify                                                                                    | `What outcome can you verify?`, clarification_required/improve; never good strength.                                       |
| `Built a dashboard?` / copy_source as retained good                                                                                       | Refuse unknown factual-question copy under frozen core wrapper.                                                            |
| Original sidecar indices0 false,1 true,3 true                                                                                             | Two retained rows map1→0 and3→1; compatibility row2 is explicit padding, never candidate index2.                           |

The next executable contract/repository leaf must derive real plans and render these through the unchanged actual core. Runtime independently mirrors the same finite renderer/proof contract and keeps writes denied until paired publication/privacy/consumer adoption. Source vectors, Node synthetic passes, prepared native verifier and actual native equivalence remain distinct. This wire enables useful source transformations beyond copy; it does not declare full representative feedback usefulness or release readiness complete.
