# AI stage diagnostics: source review

2026-11-09. **HOLD for one bounded test-oracle regression; stage-count and selected-case contracts otherwise ACK at source tier.** Own only this report. No source edits, provider/network request, configured environment/key read, database, Docker or owner-PDF access occurred. The five C02 foundation files stay frozen.

## Required correction: internal identifier punctuation

On the reviewed script, `words()` at `scripts/verify-reliability-ai-live.ts:354–368` tokenizes first, then removes a period from every alphabetic-ending token. A period included in a token can be an internal identifier separator, not sentence punctuation. This new normalization makes `Node.js` and `Node js` compare equal, contrary to the intended terminal-period-only correction.

One bounded offline child imported the exact current script and evaluated its exported pure helpers with synthetic text:

```text
original: Built a Node.js API.
proposed: Created a Node js API.
assessLiteralSupport: true
assessWriterProbe with injected-supported IR: passed
```

The same child returned false for a signed-metric change from `+20%` to `-20%`, and true for the intended independent-clause reorder. The production path still requires actual IR support at `:445–455` / `:523–525`; this finding is a regression in the independent test oracle, not evidence of automatic fabricated product output or canonical mutation. Existing leading-dot identifier imperfections are outside this change and are not a new finding.

Minimal correction: normalize only a whole-input sentence-final alphabetic period before tokenization, or use an equivalently bounded span-aware punctuation rule. Keep internal dotted separators, exact words, signed/decimal metrics and the unchanged material-change predicate. Add the `Node.js` versus `Node js` negative to the same test file and preserve the genuine reorder positive, original unsafe-output controls and material-change assertions. No identifier framework, new alias vocabulary or production fact-policy expansion is needed.

The first offline attempt used Node strip-only loading and failed before module evaluation because an existing TypeScript parameter property needs transformation. The corrected child used the same pinned Node 22.23.4 with `--experimental-transform-types`, an explicit private-verification/fake-key environment and a denied global fetch. It exited zero with only the four synthetic enum/boolean results above. No file was written by that probe, and no production module, SDK or live main was invoked. This is a causal loader correction, not a product error or provider retry. The complete test suite and production readiness control were not repeated by this reviewer.

## Source ACKs and boundaries

- **Unknown versus observed zero:** `summarizeWritingStages()` (`:381–402`) retains null until a known stage exists. Main initializes every stage to null (`:1003–1009`); not-dispatched cases also keep writing stages null (`:1252–1257`). Confirmed zero dispatch counters are distinct from unknown writing counts. The legacy accepted-change zero is not relabelled as zero proposals.
- **Honest stage names:** qualitative observation occurs after the production transport resolves source IDs (`qualitative-ai.ts:94–102`), and its schema-validated boundary is labelled `qualitative_transport_source_resolved` (`:1031–1040`). Raw provider proposal count remains null. Explicit rewrite records the service's validated pre-source-resolution proposal count (`:1085–1094`), so the downstream difference includes both resolution and grounding losses. Retained counts and text/material changes remain separate. No unobserved raw-stage loss is invented.
- **No text in new diagnostics:** the receipt publishes count/enum observations (`:1201–1209`), not proposals, reasoning or replacement content. The wrapper delegates the request and returns the original response unchanged. The existing source/request/response bounds and private receipt controls remain in effect.
- **Closed allocation:** `resolveAllocatedCases()` (`:18–43`) admits unique members of the fixed five-case enum and validates the exact declared count/token ceiling. Omission keeps five/4,352. The proposed four are qualitative, rewrite, build_rewrite and build_resume with four/3,584. The observer checks allowed names plus aggregate request/token caps before dispatch (`:283–314`); the main loop iterates only the validated selected list (`:978`). Excluded Build fix cannot leak into live dispatch through offline readiness checks, which validate its pure syntax path only. This is bounded operator tooling, not authorization for another run.
- **Legitimate positive opportunity:** the revised first passage retains independent TypeScript-dashboard and Python-maintenance clauses (`:539–557`). The neutral Python-first JD prioritizes an already-present contribution. Known reorder, source-ID resolution, actual IR/grounding, writer wrappers and Build pure apply are preregistered in readiness (`:614–750`). The material-change predicate (`:371–379`) is unchanged. A supported fixture opportunity does not guarantee a model will choose it or prove broader writing quality.

Root owns adding the newly integrated Build-support module to final source bindings and rerunning readiness against current policy 1.0.3 before any future allocation. Its documented absence from this intermediate runner's required-source list is an explicit integration follow-up, not a new defect asserted by this review. No HTTP allocation, G01 usefulness, durable idempotency, database/browser/compile or release acceptance follows from this report.

## Exact reviewed freeze

| Runtime worktree input                   | SHA-256                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `scripts/verify-reliability-ai-live.ts`  | `f6dcff9a9b8628499f8eae5f539cf2aab81385ef757286cf6a4c0ee7a0498297` |
| `tests/unit/reliability-ai-live.test.ts` | `9499f7b37d893298880449446d00ac4c13b92af6979fa2cb271cbac4b5e3cc6f` |
| `runtime-ai-stage-diagnostics.md`        | `c0f1d42f184bbbd21bf500ca9572326692711b1720cb0721ab9aeccb76b37e88` |

The source/test diff was reviewed against the prior ROOT input. Report formatting, whitespace and prose checks are separate from behavioral evidence. Re-review only the minimal oracle fix and its exact new hashes once Root allocates it; do not reopen unrelated runtime or production work.

## Post-fix addendum: narrow HOLD resolved

**ACK at source/pure-probe tier for the corrected freeze below.** The original review above, including its failed candidate and HOLD, is preserved as the exact `32f12f9671f38ebd230dab1ae0416d61298b56c725a5563aecac27ad01208dc2` byte prefix. This addendum supersedes only that current disposition; it does not erase the observed regression or supply live/product acceptance.

| Corrected runtime input                  | SHA-256                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `scripts/verify-reliability-ai-live.ts`  | `49e4ec3a1e1b74f6b0205d5c5ab336e1bb3ec42752289fea5b91f9cd57548610` |
| `tests/unit/reliability-ai-live.test.ts` | `8a1a5448866eef4fcbc65c255fdec3440f57bdfdf8b4ce2cb665486cc7e26092` |
| `runtime-ai-stage-diagnostics.md`        | `a8152eed93da6b8402979c11cca489af1e0746bc6e076131efba09777c5697ae` |

The whole-input sentence-terminal alphabetic period is now normalized before tokenization (`words() :364`), with the unsafe per-token strip removed. A narrow optional leading dot retains `.NET` in the token capture at `:365`. This is the explicit identifier-preservation correction selected by Root, not a general identifier grammar. Reversing only those punctuation/tokenization edits exactly reconstructs prior source `f6dcff9a…`; the material-change predicate, metadata/stage labels, selected-case/observer caps, fixtures and other guards are byte-identical to that reviewed source.

The reviewer repeated one small pure child using pinned Node 22.23.4 transform-types, the sealed private-verification/fake-key environment and denied global fetch. All three altered-identifier cases now return `literal:false` and `classification:unsafe_output`, even with an injected accepting IR: `Node.js` → `Node js`, `Node.js20` → `Node js20`, and `.NET` → `NET`. The corresponding unchanged-identifier Built→Created controls all remain true. The intended independent-clause reorder remains true; signed `+20%` → `-20%` and `API` → `APIs` changes both remain false. No request, SDK construction, production module load or output file occurred. The author's 36 selected unit passes remain author evidence; this reviewer did not repeat that suite or current ROOT readiness.

The original source ACKs and integration limits remain. Root must still bind the new Build-support module and run fresh integrated readiness after the separate R06 repair. No conclusion about the new color/section-placement guards, actual AI writing quality, G01, provider allocation or release follows from this punctuation fix. The C02 five-file packet stayed frozen during this review.
