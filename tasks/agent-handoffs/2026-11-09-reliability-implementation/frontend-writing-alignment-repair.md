# A11: shared source units and right-edge qualification repair

2026-11-09. **Implemented and focused-verified; independent ROOT review/integration pending.** All 14 frozen alignment expectations now pass. No model, owner-file, representative or release acceptance is supplied. Root authorized this bounded five-file implementation after the synthetic diagnosis and backend continuation contract; it replaces neither the original failed receipts nor broader A11 work.

## Authorization, inputs and ownership

The reviewed backend contract is `backend-writing-alignment-contract.md`, SHA-256 `6c9291cd807110a2c7d18d9f7bf23da6002ffc68d70b73de52ae7b3842b1dfa7`. Root approved exact existing-unit selection, conservative right-edge qualifiers and the sole finite reference exception. The optional new test-file allocation was explicitly replaced with the existing support test so its version assertion could advance without exceeding five files.

ROOT input bindings before implementation were `rewrite-sources.ts` `5ee8b6152298331f702de5dda33bb47b52384e8df330460a95c705a730ef8356`, `writing-support.ts` `6dcac128e26dec55bd3d462281adb5ee621a9e7421b8e5fe955b40d19f89d261` and read-only `writer-grounding.ts` `486fd5a945339a4bd9014b780fc43bb8fa9d588bcb34071c745bb7df4e38290b`. All were already identical in the worktree, so no synchronization or unrelated source copy occurred. Work remained in the assigned frontend worktree; ROOT source was not edited.

| Owned file                                  | Frozen SHA-256                                                   |
| ------------------------------------------- | ---------------------------------------------------------------- |
| app/lib/server/rewrite-sources.ts           | 1c9ae03bb67f92973812d0cf22a290355c13a0688cdb0b4fe17d83ecb239828b |
| app/lib/server/writing-support.ts           | 5b73a8583d6a3140ca8a306f76aeffc0b1d17c000c67d82372942f7475fed6ca |
| tests/unit/writing-source-alignment.test.ts | 981e5f0f886c1a4e2a022854cd61d24e66c83ad1a724a8963b67aafd1e0a1e0e |
| tests/unit/writing-support.test.ts          | 6db064cd042ae2b78e1fc3ca9f3212fb867e1efa80067b25e23947ba614f1f6c |
| frontend-writing-alignment-repair.md        | This handoff; final hash is delivered separately.                |

The isolated 14-case alignment file is byte-identical to its frozen diagnosis. In the existing support test, the entire old byte prefix remains after removing two new imports and restoring the single reviewed policy-version literal. All old assertions remain. Twenty-four new continuation/bounds controls are appended. The existing usefulness fixture/test, grounding source, prior diagnosis and all other released handoffs are unchanged.

## Resulting behavior

`buildRewriteSources` builds the bounded shared support document once and selects exact anchor text. It no longer independently appends an uppercase next unit into the selected quotation. Supported lowercase wraps and semicolon-linked recognized clauses stay whole. Raw substring identity, code-point spans, deterministic ordered IDs, duplicate-text ambiguity, bullet-first/fallback selection and the 25–500-character/32-source limits remain. An eligible quote is still not a supported claim: unknown/qualified units can remain selected for clarification, while the assessor retains authority. The selector now shares the existing source/anchor/relationship admission limits; a limit failure propagates instead of offering an unsupported partial quote.

The support builder conservatively examines each parsed contribution's and explicit role's unresolved right edge. Any unknown/semantic unit in that corridor adds its actual source-anchor ID to the contribution's existing `context.qualifierIds` and makes the context require review. This happens before direct rewrite/summary admission, downstream grounding or non-bullet fallback can accept a shortened claim. Terminal punctuation, unknown bullets, blanks, headings, contacts and cosmetic metadata do not silently terminate the scan. Only a separate recognized contribution, an explicit reviewed role boundary or an independently complete existing layout-entry boundary stops the association. Existing forward qualifiers remain intact.

The sole new exemption is the whole case-sensitive ASCII `API reference` label, with only ASCII edge whitespace, immediately after a recognized contribution inside its existing complete Projects/project layout. It may spare only that preceding contribution's right edge. The label remains qualified with its own anchor and retains its forward qualifier; it cannot support a summary/fact or erase later scope. A following `Without production deployment.` still qualifies the earlier contribution, including through an intervening blank, heading/contact or reference. Near-match prose, a colon/suffix/URL, a different case, a blank before the label or missing project context receives no exemption. This finite structural rule grants no entity, attribution or world-truth claim.

The derived policy advances to `legacy-source-transforms/1.0.3`. The strict shape remains `writing-support/1.1.0`; no field, stored producer, canonical record or SQL changed. Existing source/policy binding and full derived-document rebuild recompute the qualifier/reference decision and reject removed qualifier IDs or an old expected policy. The new corridor pass carries IDs rather than repeated entry text; each unresolved corridor between parsed units is bounded by the existing 512-anchor/100,000-character floors. Dense-entry serialization and existing relationship caps still pass. This is regression evidence, not a performance benchmark.

## Red to green evidence

The original two alignment failures remain at `/private/tmp/resumide-writing-alignment-red-e0f14yk_` and in the frozen diagnosis. Before production edits, new direct/grounding/summary/fallback and trailing-scope tests reproduced the unsafe shortening route: **20 failed / 80 passed across two files**. That total includes the frozen two alignment failures and 18 new guard/policy failures; every original support test and all 12 prior alignment controls passed. The pre-fix sources and original tests are preserved privately.

After the minimal source change, all six affected feature files first passed 134 tests. An additional contract regression checks source-length/count bounds, exact substrings and deterministic IDs; that intermediate candidate passed 135. The independent role-right-edge correction below brings the final focused result to **136 passed / six files, zero failed**. This includes all 14 frozen alignment expectations, all 64 original support cases, the byte-identical 20 usefulness cases, and the existing grounding/explicit Rewrite/qualitative transport controls. Existing negation, actor/agency, metric/governor, duplicate, scope and unsupported-output floors remain green. No assertion or threshold was removed, skipped or suppressed.

The affected test command is `npm test -- tests/unit/writing-support.test.ts tests/unit/writing-source-alignment.test.ts tests/unit/writing-support-usefulness.test.ts tests/unit/writer-grounding.test.ts tests/unit/rewrite-ai.test.ts tests/unit/qualitative-ai.test.ts`. The actual fresh sealed child ran the equivalent pinned Node 22.23.4 Vitest CLI with those exact six roots. Private verification disabled `.env` loading; only an unused synthetic provider key was supplied. These tests use local fixtures/transports, not real provider requests.

Scoped ESLint and Prettier pass for both production modules and the two owned test files. A no-emit TypeScript program used the repository's parsed compiler options and the same six test roots, including their 461 transitive source/declaration files: zero diagnostics. This is a focused transitive type check, not the whole application's generated-type/build gate. Root owns one later integrated check; no broad unchanged suite, application build or browser/service test ran here.

## Independent role-right-edge hold and correction

Root's source review found a related bypass in the 135-pass intermediate candidate: the right-edge loop visited parsed contributions but not explicit role anchors, even though direct identity/summary admission can accept an unqualified role. The actual synthetic `Backend Engineer at Cedar Labs\nHypothetical example.` returned supported for both role copy and headline summary, with one grounded identity draft. A new negative and strengthened prior-boundary test reproduced **2 failed / 100 passed across the two support/alignment files**, before the correction. The earlier valid contribution's stop at the explicit role remained a required positive.

The minimal correction adds explicit roles to the same existing right-edge scan's eligibility condition; it adds no new classifier, field, source unit or boundary. The role itself is now qualified by its following unresolved scope, while a prior contribution still stops at that separate role. The exact responsible future anchor is retained, source/policy rebuild remains authoritative, and the unchanged-schema/new-policy contract is the same unintegrated 1.0.3 candidate. Final six-file checks pass 136 tests, scoped lint/format and the 461-file transitive TypeScript check pass. All 135 previous tests/expectations and the frozen 14-case file bytes are preserved; one additional test and extra assertions close the independently reproduced bypass.

The original intermediate handoff SHA `cab9a3d9b48c25481fa6e4653bd73e4d4617ee8ca4f393d644b0a03ab2c14f0f`, support source `64e44caa77e9ad6476c06adecc9d6708727cdc4800ea82934df3e5daeae9d009` and support test `823946e32edeca44f69dbc28b6f2c0ac109f42dbcd9df5557a81d57f27cd785c` are retained as `.first-freeze` snapshots. The old release is superseded, not transfer-ready evidence. The original diagnosis and every earlier failed receipt remain unchanged.

## Preserved receipts and limits

Private receipt directory `/private/tmp/resumide-writing-alignment-repair-9e_9f70z` is mode 0700, with mode-0600 source snapshots and synthetic receipts:

| Receipt                   | SHA-256                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| role-pre-fix-red.log      | f75756f7ac6e15c7f84af9b65913b3be8cadead03209299c2200956d2266e673 |
| role-pre-fix-binding.json | 692a4fe69d94a4db933fd934d83bfb1a8dd45fc3435eef84c1196ba356f53e59 |
| role-final-focused.log    | e9c8a40fd6324a27de3238397498d8ff1d301e59e34680e5f0e533d3531b76a4 |
| role-final-format.log     | 17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20 |
| role-final-types.log      | cb9811f2b217f6a28350eea6132bb5da0bf3784c123fae8ff736ab7b6027e546 |
| pre-fix-red.log           | 3391ebdd877c8766364156f28265f51831daa814a32af14cbb618013fd550371 |
| pre-fix-binding.json      | b542aa8517be347af43212829d4218f8d7945706985eb4cd3f66117685813b67 |
| first-fix-focused.log     | b5e76117c863ff8964eefd1be7193defb2327f6be128c2583addedbbdd30cc69 |
| focused-green.log         | 657fa17d55190bca66243a21c64eacc3a2d01e6eaa4dae4d9abd56fe6cd3108b |
| scoped-format.log         | 17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20 |
| transitive-types.log      | cb9811f2b217f6a28350eea6132bb5da0bf3784c123fae8ff736ab7b6027e546 |

Scoped lint exited zero with an empty log. The prior failed/diagnostic receipts are neither overwritten nor relabelled as passed. No original owner-file content, trait, file hash or extracted text was read again or reused. No provider/network operation, credential/environment-file read, DB/SQL, Docker, browser, PDF rendering, canonical fact/confirmation, pricing, Git publication or deployment occurred.

Broader real-resume layout/action coverage, candidate factual validation, representative accuracy, actual useful live writing and the other A11/consumer/release requirements remain open. The previous concise-fixture no-change provider outcomes were not provider failures; this local structural repair does not reinterpret them. Root should independently review/integrate the exact frozen candidate and collect the next authorized evidence at its own tier.
