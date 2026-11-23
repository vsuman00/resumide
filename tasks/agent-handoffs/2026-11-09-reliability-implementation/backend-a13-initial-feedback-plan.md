# A13: pure initial-feedback closed plan

- Updated: 2026-11-15; worker `/root/a01_page_backend`.
- Worktree: `/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats`.
- Status: IMPLEMENTED; VERIFIED_LOCAL with actual frozen source assessor/IR and synthetic source literals. Native equivalence, publication, worker/consumer adoption and representative usefulness remain open.
- Authorization: Root's frozen `a13-initial-feedback-plan-coordinator.json`, backend wire5cd7/runtime6bc/consumerb449, followed by the exclusive four-file pure leaf. No operation/repository/worker/consumer implementation belongs to this release.

## Result and API

`compileInitialFeedbackPlan(sourceText, rawProse)` calls the actual `assessQualitativeProse` itself. It returns `{status:'available',plan,rendered,recordedObservation}` or `{status:'unavailable',reason,recordedObservation}`. The full original observation includes rejected items and original category/index references. It is not supplied by the caller and is never relabelled native or owner proof.

`renderInitialFeedbackPlan(sourceText, plan)` validates strict plan shape, derives the actual complete source IR, renders the finite operations and calls the real assessor. It returns `InitialFeedbackRenderSchema` or throws fixed `InitialFeedbackPlanError`. The result has source_content_only/not_provided literals, source/policy hashes, prose, retained parts, explicit mapping and compatible padded categories/writer. It has no native binding, JSONB digest or owner proof.

Compilation requires byte-exact reconstruction of every retained text and complete preservation of retained output. Only the real core may downgrade the requested type of questions/editorials to improve. Compiler internals reuse that invocation's own actual observation after exact reconstruction instead of spending another 73 core assessments; public render obtains its own actual assessment. No exported API accepts a cached proof boolean or assessment object. Full failed/raw-part hashes remain recorded Node observations; they are not declared independently reconstructed.

Supported operator families are exact source copy, layout/NFC/guarded prose normalization, equivalent action choices, complete independent-clause reorder, explicit role summary and adjacent same-employer role/contribution composition, fixed/measured/source-object editorial wording and non-presupposing clarification templates. The compiler derives clause indices through bounded variant lookup, not permutation search. It has a shared per-invocation eight-million-unit planning budget and source/reference caches; there is no per-expression budget reset. Unknown or nonrepresentable retained output is unavailable rather than silently rewritten or dropped. Frozen core admission remains the final source-content check.

Original indices map explicitly to compressed retained rows and compatibility padding. Four retained rows stay four. A fewer-than-three legacy category gets the exact existing no-quote placeholder, marked compatibility_only with null origin; padding is never a supported core observation. Writer and summary mappings are separate. The exported `InitialFeedbackNativeSupportSchema` is validation infrastructure for a later native publisher; this pure implementation does not manufacture that envelope. The no-provider historical/AI-off schema is likewise a shape contract, not an executed publication or ownership decision.

## Policy and frozen files

Actual policy export `INITIAL_FEEDBACK_PLAN_POLICY_VERSION` is `initial-feedback-plan-policy/1.0.0`; SHA256 `972b648ccc90b29c0c88fc504ac2746ab1489e17f05cfd2048cb487a2b38cc48`. `policy-actual.json` in the packet was exported from the real imported module, not manually reconstructed. It pins the finite operators, verbs, template arrays, renderer rules, existing limits and shared planner budget. Runtime received this exact descriptor before native literals were implemented.

| Owned file                                    | Final SHA256                                                       |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/initial-feedback-contract.ts` | `b8419d239a86762cf4df92b5ec7164bb0c72ae6b8f0d360dd2348ff645b20ae6` |
| `app/lib/server/initial-feedback-plan.ts`     | `f4645db230b01a456d8cb8868deac1f38bd9d1764fbd5a10981146bd24d3c554` |
| `tests/unit/initial-feedback-plan.test.ts`    | `96fd45229bc39c1d63e9be4fb78ff7eab5e3e429fbb9862a347ba5b9ed0ea688` |
| This handoff                                  | Recorded in final packet manifest                                  |

The copied comparison/typography primitives come from the actual frozen IR; source-anchor authority still comes from actual `buildWritingSupportDocument` and the frozen qualitative assessor. Rechecked unchanged dependencies: qualitative-support602ba4c5, qualitative-prose83df6a0d, qualitative-aidf99c8e2 and writing-support083a2b89. Existing support policy230f and IR policy legacy-source-transforms/1.0.4 were not edited. The independent 12-case oracle JSON7b0e3da3 was copied missing-only from Root with exact SHA checks and was not changed or used to tune this test file.

## Verification and preserved failure

Private packet, mode0700:

`/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a13-plan-backend-7b8y85m2`

`commands.json` has exact arguments; labels below name `.json` receipts and `.log` files. Coherent and terminal `.txt` snapshots preserve both module checkpoints. All checks used pinned Node22 `/Users/vaibhavsuman/.codex/tools/resumide-node22/v22.23.4-darwin-arm64/node` through the sealed packet runner, without dotenv or live credentials.

| Label          | Exact child command                                                                                                                                              | Result                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `policy`       | Packet `read-policy.cjs` importing the actual new contract through installed TypeScript transpilation                                                            | PASS; actual descriptor/SHA exported.                                                                           |
| `finite`       | `node_modules/vitest/vitest.mjs run tests/unit/initial-feedback-plan.test.ts`                                                                                    | PASS18/1 on contractb841/plan0430505c/test96fd.                                                                 |
| `types`        | Packet `types.cjs`                                                                                                                                               | Preserved failure: one TS2322, frozen question-topic array inferred string instead of the closed literal union. |
| `types-final`  | Same scoped script                                                                                                                                               | PASS4 roots/9 source files/0 diagnostics on final f464.                                                         |
| `lint-final`   | `node_modules/eslint/bin/eslint.js app/lib/server/initial-feedback-contract.ts app/lib/server/initial-feedback-plan.ts tests/unit/initial-feedback-plan.test.ts` | PASS.                                                                                                           |
| `format-final` | `node_modules/prettier/bin/prettier.cjs --check` followed by the same three paths                                                                                | PASS.                                                                                                           |

The sole successor delta from 0430505c to f464 is a readonly literal array of the same seven question topics, resolving the type diagnostic without changing values, policy or runtime behavior. The 18 tests were not repeated for that type-only delta. They cover all useful families, actual source/actor/qualifier refusal, question/editorial downgrade, four-row retention and padding maps, full original failed observations, CP versus UTF16 IDs, unknown fields/operators, bounded input and explicit no-provider schema validation. Root owns the fresh integrated gate on terminal bytes. Frontend subsequently reported the independently frozen 12-case suite passed on exact b841/f464 without source or oracle changes. Root owns its separate receipts and static checks; do not count those cases as author evidence or native acceptance.

Finite log SHA256 is `8ac150a1ec6ef5b69916cba86d3e482d65d7c17cb90fb5e9986d46f139aa50f9`; failed types log `52c3e7d2bfc01b07980882994320aadb4e9beb97cdef8a626a56a79d1c483aa2`; final types log `2b4955747df74c12665e31c8353d9b467fcefc83dfcae84b80f3ce31861b13df`. Final lint has the empty-log SHA256; final format log is `17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20`. Final receipts report787 stable inputs, no in-run drift and confirmed process-group cleanup. The earlier descriptor-only policy run had785 inputs before plan/test files existed.

## Release boundaries

All four files are released to Root. No native profile, operation, durable publication, provider, data store, consent, budget, stage, route or presenter was activated. No SQL was parsed/executed, no real environment/key was read and no Git action ran. Native parts/mapping equivalence and metadata pins remain runtime's separate source/verifier task, not proof supplied by these synthetic checks.

Root may integrate terminal source and run one combined gate after independent oracle/source review. Concrete failures may authorize bounded corrections; there is no reason to repeat older closed campaigns. Full A13 still requires the owned immutable publication/receipt, mandatory once-only dispatch in both budget modes, known/unknown usage settlement, privacy export/erasure, safe deterministic-only historical/AI-off publication, exact consumer mapping and representative usefulness acceptance.
