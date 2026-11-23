# A11 layout equivalence: focused regression evidence

Status: focused regression PASS; ready for coordinator integration. This is a synthetic source-level slice of CR-A11, not representative accuracy or release acceptance.

## Scope and contract

The coordinator assigned the new 20-case regression file and two policy-version assertions in the existing support test. Backend owns the source repair. The worktree is based on `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus the coordinator's preserved dirty inputs.

Reviewed behavior allows typesetting equivalence inside admitted prose, using the finite font-ligature character set and discretionary soft hyphens between alphabetic letters. It also recognizes a leading square bullet consistently in support and source selection. It does not normalize original-source lookup, identifiers or code, change evidence, or grant candidate facts. Policy advances to `legacy-source-transforms/1.0.4`; the document schema remains `writing-support/1.1.0`.

## Reproduction

On the unchanged source below, `node node_modules/vitest/vitest.mjs run tests/unit/writing-layout-equivalence.test.ts` returned **5 failed / 15 passed**. Four useful prose cases returned `clarification_required`: ligatures in two ordinary words and soft hyphens in two different ordinary words. A square-bullet item was omitted when an ordinary bullet was also present; this bypasses fallback selection and exposes the actual selector gap.

The ASCII control passed. Protected URLs, mailboxes, uppercase/digit identifiers, backticked code, mixed-case identifiers and underscore identifiers stayed unsupported. Metric, agency, actor, negation and scope changes stayed unsupported, as did colleague-qualified text and duplicate originals. Stale source/policy bindings and a normalized forged original quote were rejected. The tests call the actual assessor and grounding path. Retained drafts require raw source hash, exact original and code-point spans to remain intact. The baseline square-bullet failure occurred at the selector assertion before those downstream checks.

Original source snapshots, the unformatted test, command, hashes and failure log are preserved at `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-writing-layout-tests-1a_3xbgo/`. The source files were not edited by this worker.

| Baseline input                     | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `writing-support.ts`               | `5b73a8583d6a3140ca8a306f76aeffc0b1d17c000c67d82372942f7475fed6ca` |
| `rewrite-sources.ts`               | `1c9ae03bb67f92973812d0cf22a290355c13a0688cdb0b4fe17d83ecb239828b` |
| `writer-grounding.ts`              | `486fd5a945339a4bd9014b780fc43bb8fa9d588bcb34071c745bb7df4e38290b` |
| Existing `writing-support.test.ts` | `6db064cd042ae2b78e1fc3ca9f3212fb867e1efa80067b25e23947ba614f1f6c` |

## Final verification and release

The backend released `writing-support.ts` at `083a2b89769005a28eff9b963de8cf38b71ea554e74aa057423bbe9fc712dd67` and `rewrite-sources.ts` at `badad66ebfd192b675230189c3a337dd63bd7884fd862c3681c74938e70382a9`. Both were copied as reviewed dependency inputs after checking their prior and new hashes. Grounding remained unchanged. This worker releases no production edits.

The same 20 expectations now PASS. The new test was formatted without changing its expectations between RED and GREEN. The existing support test changed only its two policy assertions from `1.0.3` to `1.0.4`; reversing those two substitutions reproduces every baseline byte. No unsafe expectation was relaxed.

The author ran only the new 20-case file. Scoped ESLint and Prettier passed for both test files. Scoped TypeScript passed with two roots, four ambient inputs, 325 source files and zero diagnostics. Root will run the existing support and safety consumers once on the integrated candidate. Failed and passing logs, source snapshots and metadata remain in the private receipt directory above.

| Released test                                       | SHA-256                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| New `tests/unit/writing-layout-equivalence.test.ts` | `ba44b38fbcf3188b36e7550ccb01c85242f540e7534eac762016da1548a8e62d` |
| Existing `tests/unit/writing-support.test.ts`       | `ce6c53f1b65c3cd3e244e2a1e21ee3c898002bf585cd705e0ee79fd3f5ff4097` |

This proves finite synthetic typography support and preserved controls, not arbitrary text equivalence, document accuracy or independent candidate truth. The normalization intentionally abstains in protected and ambiguous contexts. Raw source lookup and evidence remain authoritative; only admitted prose comparison changes. No provider, network, database, Docker, browser, owner file, build or Git mutation was performed. No original safety suite was repeated by this worker. Root owns the integrated gate and current task records.
