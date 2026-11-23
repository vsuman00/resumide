# A11: rewrite-source and support-unit alignment reproduction

2026-11-09. **Tests-only RED: two structural positives fail; 12 controls pass. No production fix is implemented or authorized by this handoff.** Root's integrated source freeze remains unchanged. Only the new test and this handoff are owned. No owner PDF, extracted content, provider, `.env`, database, Docker, browser or network was used. Fixtures are short, independently authored synthetic examples.

## Exact inputs and scope

The three permitted ROOT inputs were already byte-identical in the frontend worktree, so no source synchronization was needed:

| Input                              | SHA-256                                                          |
| ---------------------------------- | ---------------------------------------------------------------- |
| app/lib/server/rewrite-sources.ts  | 5ee8b6152298331f702de5dda33bb47b52384e8df330460a95c705a730ef8356 |
| app/lib/server/writing-support.ts  | 6dcac128e26dec55bd3d462281adb5ee621a9e7421b8e5fe955b40d19f89d261 |
| app/lib/server/writer-grounding.ts | 486fd5a945339a4bd9014b780fc43bb8fa9d588bcb34071c745bb7df4e38290b |

These inputs stayed unchanged during the focused run. Existing unsafe-output tests, thresholds, fixtures, qualifier logic and action vocabulary were not edited. The prior owner-file evidence is only the aggregate diagnostic already released; none of its text, traits, values or file bytes were reused.

## Actual reproduction

The new `tests/unit/writing-source-alignment.test.ts` calls the real selector, support builder/assessor and downstream writer grounding. Each useful positive requires an exact selected contribution, the approved Built→Created equivalent and the fixed editorial explanation `Clarifies the contribution.` Identity-copy controls additionally establish whether the selector's exact quotation even identifies a support unit; they do not count as useful edits.

| Synthetic case                                                             | Selector range | Existing support ranges                                              | Exact identity result            |
| -------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------- | -------------------------------- |
| Two adjacent independently recognized contributions                        | [0,62)         | [0,34), [35,62)                                                      | rejected / missing_source_anchor |
| Projects/neutral entry, recognized contribution, uppercase reference label | [26,85)        | heading [0,8), entry [9,25), contribution [26,71), reference [72,85) | rejected / missing_source_anchor |

The first fixture has no blank or bullet between the recognized contribution and a separate uppercase recognized action. The second uses the finite Projects/Signal Dashboard structure and an uppercase `API reference` line. In both, the current selector appends the next line to an unterminated bullet. The support builder keeps that line separate, because its continuation predicate admits lowercase continuation or an action after a semicolon. Thus the chosen original spans multiple support units and exact-original lookup fails before proposal evaluation. NFC normalization, whitespace folding, bullet stripping and terminal-period normalization cannot reconcile the extra unit into a single original.

All table offsets are half-open Unicode-code-point positions. These two fixtures are ASCII, so their UTF-16 offsets coincide. The separate passing CRLF/astral-Unicode control checks exact selected bytes and code-point span reconstruction; it prevents a repair from joining normalized/reconstructed strings instead of preserving the source substring.

The original run tested the useful changed proposal directly: **2 failed / 12 passed**, with both failures returning missing_source_anchor and retaining zero drafts. The final test adds explicit unchanged-source identity assertions before those useful expectations: **the same 2 failed / 12 passed**. A separate tiny pure synthetic observation records exact numeric spans and actual identity reasons. The useful expectations remain enabled and unchanged. No test is skipped, threshold lowered or original negative assertion removed.

Passing controls cover lowercase wrapped source, CRLF and Unicode offsets, semicolon-linked recognized clauses, separate bullets, preserved earlier colleague/never/team scopes across section metadata, negation loss, subject reassignment, scope change, an unmatched following negation/scope line, duplicate ambiguity and sparse text. They do not require an unknown action to be admitted or a missing source to be invented.

## Minimal repair proposal for root review

The justified change is to make selection respect the existing support-unit boundaries, leaving support/qualifier authority unchanged. Prefer reuse of the current exact unit spans or a small shared boundary predicate, rather than adding an independent incompatible paragraph grammar. Preserve original bytes, ID ordering, deduplication/ambiguity, 25–500-character selected passages and the 32-source cap. Keep known lowercase wraps and semicolon-linked clauses as one passage. A separate recognized contribution can establish an existing boundary; the useful first contribution must remain available rather than disappearing with the whole unmatched block.

A blanket truncate-to-first-anchor rule is unsafe and is **not proposed**. The passing counterexample appends `Without production deployment.` to the same recognized first line. The current combined original is not admitted; simply cutting at the support unit could remove that following scope/negation and make the shortened body pass. Never clear qualifiers or treat arbitrary uppercase/title-case lines as harmless metadata.

The second RED therefore needs an explicit boundary decision before production work: the `API reference` line remains unknown/qualified in the existing IR. Its finite neutral reference role in the test is not itself a new production grammar or candidate fact. Root must review how a neutral reference/header boundary is proven while an unmatched semantic/scope continuation continues to abstain. If a separate bounded structural rule is required, keep that RED visible and implement/review it explicitly; do not silently weaken the scope control, drop the useful expectation, or declare the ordinary layout unsupported. Selecting the original complete uncertain passage for clarification remains distinct from admitting a shortened claim.

Root's review accepts adjacent independently recognized units as the provable first slice. The API-reference positive remains an unreviewed eligibility expectation, not authority to truncate unknown continuation text or grant new factual support. Root requires both its RED and the passing scope-negative to remain intact. This unfinished test file stays in the worktree and is not part of the next integrated ROOT gate; that is an explicit unrepaired gap, not a disabled test or passing result.

The next allocated source leaf should implement only that reviewed alignment contract, then make both useful positives and every safety control pass. It must not enlarge the action allowlist, infer employers/projects, merge independent metrics, grant verified facts, alter provider prompts or clear historical qualifiers. Broader contact/header/action coverage and the observed owner-file qualification failures remain separate work.

## Commands and receipts

The package test command is `npm test -- tests/unit/writing-source-alignment.test.ts`; the actual sealed child invoked its equivalent pinned Node 22.23.4 `node_modules/vitest/vitest.mjs run tests/unit/writing-source-alignment.test.ts`. The environment was explicit, private verification disabled `.env` loading, and the unused API key was synthetic. Only this 14-case file ran. Scoped ESLint passed; no service/provider transport was imported. Formatting/prose/whitespace are checked separately. Full verification is intentionally not run on an unfixed RED candidate.

Private synthetic receipts are in `/private/tmp/resumide-writing-alignment-red-e0f14yk_`, mode 0700 with mode-0600 files:

| Receipt                    | SHA-256                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| red.log                    | f3fb8760bedb2d6a461292de77815ba025fa74d8f218405e3ae22d8520d1b08b |
| binding.json               | 33111b954dafada5315596a9a4ac874714ff0376ee4843a0578005be42da32f8 |
| identity-red.log           | 5af38f1c38c187bdeeeab2a5ecf227c24de1c6e3e007db99f84f61be7ab33d51 |
| identity-binding.json      | 8aea0ce3fdc8ed41b0e9efa4ac749e562f932e696dec91da8a83849e20107ac8 |
| synthetic-observation.json | a38334b4a5aa2e341bc3de803b8633c9b2bb8d40daa9215b668145dfdac401ff |

The first test revision SHA was `050f748e7191116d687d0cc178948ee9e940ff60be25c72ca5ded0798506fb83`; its failed receipt is preserved. Final test SHA is `981e5f0f886c1a4e2a022854cd61d24e66c83ad1a724a8963b67aafd1e0a1e0e`. The final identity strengthening does not replace or erase the original useful-edit failure.

This is synthetic source-alignment evidence, not representative validity or a model failure. No API call, production behavior, scoring/confirmation/export gate or A11 parent completion is claimed. Root owns review, further source allocation and eventual integration.
