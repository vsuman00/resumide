# A13 initial-feedback operation contract and source policy

- Updated: 2026-11-15; worker `/root/a01_page_backend`.
- Worktree: `/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats`.
- Status: IMPLEMENTED; VERIFIED_LOCAL with actual pure scorer/compiler and explicitly synthetic metadata/configuration. No operation repository, provider execution, native publication or adoption is supplied by this leaf.
- Allocation: Root's `a13-initial-feedback-operation-contract-coordinator.json`, reviewed operation wire e6c198b1 and supplement131a611d, plus Root's exact compatibility decision below. Seven owned files; all frozen core/IR/plan/source-profile files are unchanged.

## Implemented API and authority boundary

`initial-feedback-operation-contract.ts` exports strict bounded schemas for usage, attempts, original binding/context, operation, prepare/claim/settlement/finish/read, completion, publication/receipt, compatibility, generation failures, intended full readiness/profile and usage totals. It validates nested identities, exact original text/result checksums, UTC microsecond tokens, provider ordinal/state/usage correlations, complete retained-part/mapping coverage, summary hashes, compatibility padding and fixed partial semantics. Questions and compatibility-only padding do not become factual strengths.

Preflight limits are 12MiB per complete envelope, 500,000 visits and depth32, including object/array punctuation, with invalid UTF16/NUL/non-JSON objects refused. Two separate existing 4MiB scoring-object limits still apply through the actual validators. Original source is retained intact; a resource-ineligible/historical context cannot claim eligible generation. Decimal token counters use canonical strings and BigInt; unknown usage stays null and aggregate totals are checked without Number coercion. No native JSONB digest is computed in Node.

The full nineteen-key readiness schema has no invented profile constant. Its validator requires explicit expected source pins and the capabilities used by a caller. Runtime's smaller foundation readiness is a separate protocol; it is not a fabricated complete profile. Structural decoding, opaque digest correlation and source pins are not proof of ownership, installed catalog state or policy activation. Actual owned readers, native checks and fresh liveness/admission remain required.

The new additive `validateLegacyScoringResult(raw, expectedInputTextChecksum)` calls the existing bounded strict parser and original ordered-result checksum validator. It neither rescores nor changes that hash domain. Removing only the wrapper restores the complete old helper SHA28aef84b, including all previous call sites. This is additional self-consistency validation, not an independent proof of numerical correctness.

## Exact compatibility supplement approved by Root

`Publication.compatibility` is exactly `{deterministicResult, feedback, writer}`. The first value is the entire actual `LegacyScoringResult`, parsed and checked with its existing checksum. `feedback` is the recursively strict existing Feedback shape, requiring actual BASELINE_SEMANTICS, original overall/ATS score, exact first-four ruleTrace passed/detail tips and zero qualitative category scores. `writer` is the existing ResumeWriter shape or null.

Assessed feedback/writer must match the retained prose and its exact legacy padding. Original indices, compacted indices, complete tip/bullet sets, quote hashes and summary support match the plan/recorded observation/owned retained mapping; duplicates, omissions and reordered mappings refuse. This does not reassess rejected text or promote the full Node capture to native proof. Deterministic-only feedback matches the actual old partial builder, with writer:null. Null-attempt publication cannot correlate to any prior claimed attempt.

## Publication policy and actual codec

`initial-feedback-publication-policy.ts` exports `createInitialFeedbackPublicationPolicy({model,maxOutputTokens,attemptLimit,budgetPolicyVersion})`, strict descriptor/full-policy/selector schemas, `encodeInitialFeedbackPublicationPolicy`, `hashInitialFeedbackPublicationPolicy` and a fixed-error validator. Inputs are explicit; there is no environment read, model default, registry seed, organization selection or activation. Returned descriptors and nested actual profiles are frozen.

The source domain is exactly UTF8 header `INITIAL-FEEDBACK-POLICY/1\n`, followed by the supplement's twenty-seven ordered `T<byteLength>:value;` or `N;` atoms. sha256 itself is excluded. No sorting, normalization or JSONB/JSON serialization equivalence is introduced. Existing source supplies provider, prompt3.0.0, output256–8000, attempts1–3, support230f, plan972, IR1.0.4 and real scoringf2/plane9 profile values. The prompt literal has an exact source-equality test; the IR version is imported.

Actual imported factory vectors are in `publication-policy-vectors.json` in the packet, SHA256 `88d5d62b7fb5acf4e0dc882d9eed14596b311488b08a1b434bfa1a24bc80d733`. The explicitly supplied source-default technical off vector has 1268 framed bytes and SHA `5f5eace5226885c3bbaf6c430e656034edbb3f12e42ffa4634faffd8f94619ca`. The on vector uses the clearly SYNTHETIC `synthetic-budget-policy/1`, 1296 bytes, SHA `fd7f080752a0aaddd1f9330aa27f2c8bad7daee0feb342030105258c5713de8a`. Neither is an admitted registry entry or enabled selection. Runtime received exact bytes; source-policy hashes are separate from native binding/publication digests. An initial artifact/receipt filename collision was corrected by writing vectors to that distinct artifact path; both executions/logs remain preserved.

The vector artifact was generated on policy sourcece388bda. Final b4 adds frozen return values and safe invalid-schema failure handling; its actual factory's off/on expected-hash tests passed with those same bytes. The artifact is not mislabelled as a newly generated final-source receipt.

## Release files

| Owned file                                               | SHA256                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/initial-feedback-operation-contract.ts`  | `52e9b4e31ee45a8010596c2b64de03b2b57b84f047029bf65c2794040c8549da` |
| `app/lib/server/initial-feedback-publication-policy.ts`  | `b4c33a5bfebf9fe1b22253c40ea8bf84050b63f2da8472ead2b73a1dc44aa6c8` |
| `app/lib/server/legacy-scoring-input.ts`                 | `57246d936a251b14b0df1e9b51dd147063da9997820b670ddeb2948e5f08fefa` |
| `tests/unit/initial-feedback-operation-contract.test.ts` | `f69ac6eba160b54a6afc71a9ae90a9200b63e858e1fd1534684359b2b1978e57` |
| `tests/unit/initial-feedback-publication-policy.test.ts` | `5fdaa9c764c517be57e4f3153dc62bd611cb70498efb67176f52c0807cb95579` |
| `tests/unit/initial-feedback-result-validation.test.ts`  | `b600ca776dde2ab4f247ec199c5968bbcc3216e493f8922740a8521246e78338` |
| This handoff                                             | Recorded in the final packet                                       |

## Verification, failures and limits

Private packet:

`/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a13-operation-contract-pyu_cryd`

All child commands use pinned Node22 through packet `run.mjs`, sealed without dotenv or live credentials. `commands.json` has exact arguments; every label has `.json` receipt and `.log`.

- `mapping-red` and `mapping-red-actual`: preserved SETUP failures, not behavior RED. A trailing bare skill qualified the first compiler fixture; the next fixture omitted the scorer's required textChecksum. Both were corrected without weakening assertions.
- `mapping-red-confirmed`: genuine real-scorer/compiler positive PASS plus duplicate-retained-part assertion FAIL. The early contract accepted a duplicate that dropped another item. `mapping-green` passed both after complete mapping/parts/summary correlation was added. No second core assessment was introduced.
- `finite`: 49 cases in three owned files, 48 PASS/1 test-only failure importing a private config schema. Three typing diagnostics also remained in `types`: that import, literal-score mutation typing and a raw result's widened producer version. Tests now use the public pure parser, schema-decoded actual result and an explicitly constructed untrusted payload; no casts/suppressions or assertion removals.
- `affected-final`: PASS2, closing that config fixture and the added real deterministic-only/late-claim control. Final authored total is 50 unique cases across three files; no claim of an author full50 rerun. Prior48 plus affected corrections remain separate receipts for Root's fresh combined gate.
- `resource-final`: PASS1 after the final two-byte/object punctuation accounting correction. This changes only the operation-contract source from a17 to52e9; published frames and other algorithms remain identical.
- `types-terminal`, `lint-terminal`, `format-terminal`: PASS. Scoped types cover seven roots/47 source files/zero diagnostics. The terminal source matches all six code/test hashes above.

Receipts report 797 stable worktree inputs and confirmed cleanup for the final campaigns; earlier two-case probes had795 before the last two test files existed. Original failed receipts, diagnostic logs and snapshots are preserved. No old assertions or frozen source policy changed. Root owns the one integrated gate and dependent-lane checks.

No actual environment/keys, provider/network, database, SQL parser/execution, services, browser, dependency changes, Git or deployment ran. Native role/concurrency/catalog tests remain unperformed. Full source-bound operation storage/publication, mandatory dispatch adoption, shared A12/A13/legacy quota cutover, privacy export/erasure, worker/consumer integration and representative usefulness remain open. This release is the executable contract/codec prerequisite, not the full A13 implementation.
