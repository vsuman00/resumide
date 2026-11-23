# Writing layout equivalence

Released 2026-11-10. This slice changes [writing support](../../../app/lib/server/writing-support.ts) and [rewrite selection](../../../app/lib/server/rewrite-sources.ts). Frontend owns the finite tests. No provider, owner PDF, database, Docker or network operation was performed.

The source baseline is support `5b73a8583d6a3140ca8a306f76aeffc0b1d17c000c67d82372942f7475fed6ca`, selector `1c9ae03bb67f92973812d0cf22a290355c13a0688cdb0b4fe17d83ecb239828b`, and grounding `486fd5a945339a4bd9014b780fc43bb8fa9d588bcb34071c745bb7df4e38290b`.

The approved contract adds comparison-only equivalence for font ligatures `U+FB00` through `U+FB06` and discretionary `U+00AD` between alphabetic neighbors. It uses character classes, not a list of fixture words, and never applies blanket NFKC. The new comparison runs only within an admitted prose rewrite and records `normalize_layout`. Exact source text, SHA256, quotes, Unicode codepoint offsets, original-anchor lookup and rebuilt binding checks remain unchanged. Original exact-copy/action equivalents remain available.

The new path admits complete lowercase Latin word tokens with limited sentence punctuation. Numeric, code, URL, mailbox, quoted and other technical syntax retain the old comparison. Mixed-case/underscore identifiers, noninternal or consecutive soft hyphens, and words following explicit identifier cues are not converted. These conservative abstentions can still withhold useful wording; they are current implementation limits, not a new unsupported-input product policy. Relationship/metric extraction is not normalized.

Structural `▪` bullets follow the same leading-bullet rules as existing glyphs in support parsing and rewrite selection. This does not change attribution, action meanings, metrics, scope, negation or qualifiers. The behavior advances `legacy-source-transforms/1.0.3` to `1.0.4`; schema `writing-support/1.1.0` remains unchanged. Accepted proposals retain source-transformation authority only; no candidate fact is verified or persisted.

Frontend reproduced **5 failures / 15 passes** on the original source: four typography examples were withheld, and the square-bullet source was omitted when an ordinary bullet was also present. The unchanged 20-case test then passed **20/20** on the released implementation. It includes fresh `workflow`/`streamlining` words, protected technical text, changed metric/agency/actor/negation/scope, colleague context, duplicate ambiguity, raw-original lookup and stale source/policy bindings. Raw source/hash/codepoint checks remain in that test. The source-bound baseline and green receipts are in the frontend-owned temporary `resumide-writing-layout-tests-1a_3xbgo` directory; no original failure was relabelled.

Source freeze:

| File                            | SHA256                                                             |
| ------------------------------- | ------------------------------------------------------------------ |
| `writing-support.ts`            | `083a2b89769005a28eff9b963de8cf38b71ea554e74aa057423bbe9fc712dd67` |
| `rewrite-sources.ts`            | `badad66ebfd192b675230189c3a337dd63bd7884fd862c3681c74938e70382a9` |
| Unchanged `writer-grounding.ts` | `486fd5a945339a4bd9014b780fc43bb8fa9d588bcb34071c745bb7df4e38290b` |

Scoped Prettier and ESLint passed for the two changed source files. Frontend also passed test-file formatting/lint and changed only its two allocated existing policy-version assertions. Backend did not duplicate the behavioral run. Root owns the single combined affected safety/type/build gate and independent source review. Full A11/canonical support, live usefulness, representative validation and release acceptance remain open.
