# A13 initial-feedback native renderer: finite peer review

- Updated: 2026-11-15; reviewer `/root/a01_page_backend`.
- Scope: read-only comparison of the actual native operators and render shape with frozen Node contract `b8419d23` and plan `f4645db2`. No application or SQL source changed.
- Reviewed native checkpoint: `supabase/migrations/20261115054612_initial_feedback_plan.sql`, SHA256 `cde82231357a0070ac73649487f98d9668de44a442522deca1459c28e88afd01`, in the runtime worktree.
- Result: two concrete source parity findings sent to Root and the runtime author. Both remain OPEN against this checkpoint. This is source inspection, not a parsed or executed SQL result.

## Required corrections

1. **Normalize each rewrite clause before joining.** Native `ifp_expr` appends the variants and calls `ifp_normalize` on the complete joined text at line 494. Node applies the selected normalization to each variant before joining at `initial-feedback-plan.ts:336`. With a source such as `Built a dash\u00ADboard; reduced latency by 20%.` (the escape denotes an actual internal soft hyphen), Node's admitted-prose normalization folds the first clause's soft hyphen. Native's whole-string numeric guard sees the second clause's metric and retains that hyphen. The resulting text and hash differ. Apply normalization to each variant, then join the rendered parts, retaining the existing final terminal operation.

2. **Keep raw role-composition context separate from normalized rendering text.** Native `ifp_clauses` applies `ifp_basic` before deriving its stored object at lines 156–165; the composition guard compares that normalized object suffix with the raw role employer at lines 516–517. Node checks the original IR object's employer suffix against the original role employer at `initial-feedback-plan.ts:374`. For adjacent source lines `Backend Engineer at Cedar Labs` and `Built services at Cedar  Labs.`, Node refuses the exact employer mismatch. Native collapses the contribution's double space and can admit it. Preserve the original clause/object text for this equality guard and use normalized text only for rendering. This finding does not assert that either spelling identifies a different employer; it concerns the frozen exact context admission rule.

## Remaining comparison

No additional concrete finding arose in the assigned pass over exact code-point references and UTF16 legacy anchor IDs, explicit lower-is-better restrictions, whole-clause permutations, role adjacency, question/editorial downgrade, source-content-only return literals, original-to-retained maps, writer/summary maps, minimum-three compatibility padding, or the shared expression/assessment/work ceilings. Native's explicit unsupported-Unicode refusal is distinct from a successful equivalent render. Full recorded Node rejection observations remain outside the native retained-output proof scope.

Root separately owns metadata, permissions and manifest/hash review. No tests, SQL parser, native execution, services, provider calls, environment reads or Git operations ran for this peer allocation. Native semantic equivalence and representative usefulness remain unverified. A narrow source-only review of the two corrected branches can close these findings without repeating the full pass.
