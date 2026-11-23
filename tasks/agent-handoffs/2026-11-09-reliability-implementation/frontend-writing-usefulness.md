# A11 usefulness: focused reproduction

2026-11-09. **IMPLEMENTED AT FOCUSED TIER: contact and bounded entry usefulness pass 84 cases after A11-F01; independent review/integration pending. Full A11 remains PARTIAL.** The coordinator first allocated reproduction, then accepted the narrow contact repair and explicit derived-entry leaf below. Detached frontend worktree at a0b239299d75b0bd64b588fe743ebe2975fb28b9 plus its preserved dirty snapshot; ROOT remains authoritative. Current owned scope is app/lib/server/writing-support.ts, tests/unit/writing-support.test.ts, new tests/unit/writing-support-usefulness.test.ts and this handoff. The frozen frontend-build-review.md remains SHA256 90e10f987fec269649e057d4928ceb82ba56aab6558311f967eaa0b06e32a96f and was not edited. No ROOT source transfer has occurred.

## Inputs and authorization

The coordinator approved three exact nonsecret ROOT input copies after checking prior absence/old hash. These were the initial read-only reproduction inputs. The later contact leaf owns writing-support.ts; writer-grounding.ts and the shared fixture remain unchanged inputs:

| Input                                     | ROOT/copied SHA-256                                              | Prior frontend input                                             |
| ----------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| app/lib/server/writing-support.ts         | f7a7758731176112ada7772eee06d6b7b77ea6151f6a6f5ddf2b69ef5cc2640b | absent                                                           |
| app/lib/server/writer-grounding.ts        | 486fd5a945339a4bd9014b780fc43bb8fa9d588bcb34071c745bb7df4e38290b | 1bd479ea61c4ff1edb1b4a31168447b10045360e0cb57f09e07b8b133675d9d6 |
| tests/fixtures/reliability-regressions.ts | 22788ee9f8eb90e9b2aa640946be6fad03819e192fb66491289b5364e1a0ceaa | absent                                                           |

The former writer input is preserved privately at /private/tmp/resumide-a11-frontend-inputs-20261109/writer-grounding.previous.ts. No .env, real resume/PDF, provider credential, source threshold or locked fixture was copied or edited. schema.ts 37b665d4462fe83b88622971d9aa9b52eb36ea41e459003ae2ad13ed782055fb, vitest.config.ts ecd6b6d407a69ebc631187b2d281b7c70675c5f5421d098f190b988eb47af399 and package-lock.json d190bf3f360b0b2c4a309853ae00c19cbd39e1e58458e5730fda4a626a80d3a9 already matched ROOT. Shared package/config/lockfiles were not synchronized or edited. The existing npm test script invokes Vitest run in both checkouts.

Read the master CR-A11 and ATS blueprint A10 contract: approved source transformations must preserve subject/agency, action/object, metrics/direction/scope and exact version-bound support. Unknown claims abstain. Supported drafts must remain useful on ordinary contact-rich and multi-entry layouts; those layouts are not newly unsupported segments. Candidate confirmation, raw-source transformation support, immutable canonical provenance and calibrated/release accuracy remain distinct.

## Original focused reproduction

Command: npm test -- tests/unit/writing-support-usefulness.test.ts, Node.js 22.23.4 with RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic and AI_ENABLED=false. No dotenv was loaded. The one run returned exit 1: **20 cases, seven failed and thirteen passed**. No production fix or repeated broad suite followed.

| Contrast                                                                                       | Cases | Actual current result                                                                      |
| ---------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------ |
| Same construction rewrite after email, URL or ordinary combined contact header                 | 3     | clarification_required; zero retained bullets instead of the standalone retained draft     |
| Same independently supported first/second contribution within two separated project blocks     | 2     | clarification_required; zero retained bullets; each standalone precondition passed         |
| Same contribution under separate employer/title lines in a two-employer resume                 | 1     | clarification_required; zero retained bullets                                              |
| Existing explicit adjacent-role/contribution summary after an unrelated email                  | 1     | clarification_required; summary removed                                                    |
| Standalone construction rewrite, recognized two-role layout and original adjacent-role summary | 3     | supported; expected draft/summary retained                                                 |
| Five preserved unsafe writer vectors                                                           | 5     | unchanged direct guard withholds all output                                                |
| Two preserved downstream counterexample payloads at the direct guard                           | 2     | unchanged direct guard withholds both payloads; actual pipeline execution was not repeated |
| Cross-employer metric swap, agency borrowing and ambiguous identical-original selection        | 3     | rejected; no retained bullet                                                               |

All material is neutral synthetic development data. The email/domain are reserved examples; project and employer labels are invented. The supported proposals change only an already reviewed Built/Created equivalent or lower-is-better latency wording and retain the exact original object, metric, employer and agency. Separate entries never supply each other's values. The duplicate-original case deliberately keeps rejection until an explicit source target can be selected; fixing usefulness must not choose one employer silently. These are regression vectors, not unseen holdout or representative evidence.

The RED expectations assert the intended supported preservation. They were not changed to expect clarification, skipped or removed. Each outcome computes both real assessWritingSupport and groundWriterSuggestions results before comparing content-free state/count/retention observations. Existing unsafe fixtures are imported unchanged, and the actual structured explicit-rewrite/qualitative pipeline tests stay in their existing file untouched. This new file establishes direct module/wrapper behavior, not a new provider, route, pipeline or consumer-browser result.

## Original source cause

buildWritingSupportDocument declares one document-wide qualifiers array before its line loop. Any nonheading/nonrole/unparsed/noninitial-label line appends its source anchor. That list never resets at a blank line, section heading or later recognized role. Only qualifiers.length===0 yields unqualified_resume_clause. Thus an ordinary contact line or project/employer/title header makes every later contribution qualified_or_unknown, even when the contribution itself has a unique exact source anchor and a correctly parsed action/object/metric.

assessRewrite returns clarification immediately for that context, before comparing the reconstructed equivalent. assessSummary similarly skips qualified contribution and role anchors. groundWriterSuggestions retains only supported results, so it drops these source-preserving bullets/summaries. The test did not find a missing/ambiguous original in the seven usefulness failures. It found a context veto after successful literal anchoring. The distinct duplicate-original safety control still returns ambiguous_source_anchor.

A separate content-free diagnostic before the production change invoked only buildWritingSupportDocument and assessWritingSupport on the same synthetic examples. It confirmed:

| Input class                   | Exact contribution matches | Context                   | Qualifier count | Parsed action       | Support                |
| ----------------------------- | -------------------------- | ------------------------- | --------------- | ------------------- | ---------------------- |
| Standalone                    | 1                          | unqualified_resume_clause | 0               | create              | supported              |
| Email header                  | 1                          | qualified_or_unknown      | 1               | create              | clarification_required |
| URL header                    | 1                          | qualified_or_unknown      | 1               | create              | clarification_required |
| First project                 | 1                          | qualified_or_unknown      | 1               | create              | clarification_required |
| Second project                | 1                          | qualified_or_unknown      | 2               | improve, one metric | clarification_required |
| Separate employer/title lines | 1                          | qualified_or_unknown      | 2               | create              | clarification_required |
| Recognized two-role layout    | 1                          | unqualified_resume_clause | 0               | create              | supported              |

This identifies the current failure without selecting a production repair. Blindly discarding all unknown lines would erase legitimate qualifiers such as another person's work, examples, negation or scope. A later reviewed slice must distinguish inert contact/structural context from meaningful subject/scope qualifiers and preserve exact target/entry provenance. No arbitrary employer association, broader synonym policy, metric transfer, source-selection DTO or canonical acceptance was introduced here.

## Evidence and next step

The failed receipt is /private/tmp/resumide-a11-usefulness-red.log. Scoped ESLint and Prettier pass. A focused TypeScript program using the repository's parsed compiler options and the new test as its root reports zero diagnostics, including transitive source/type imports, with no emitted files. No whole-app build or browser test was run. Clean-user-facing-text and whitespace checks apply to this handoff; source/code/quoted values remain protected.

Reproduction bindings: tests/unit/writing-support-usefulness.test.ts SHA256 7f4d14dd7569417bf8d3286933e24503461f604df03796f31f30156cfebf5b5a; the original RED log SHA256 4b160871d847ab4a1a54b690e77471af44da0f586acd44b8c0c5b62897d52ab9. Preserve that failed receipt even if a later bounded repair addresses only some cases.

## Accepted contact-only split, intermediate state

The coordinator accepted the RED evidence, independently verified the cause and approved the contact-only implementation. A blanket reset at blanks/headings/roles is unsafe and was not used. The narrow contact repair recognizes whole trimmed single-mailbox lines, bare or with the exact Email: field prefix, and whole bare HTTP(S) URL lines with no whitespace/userinfo. It retains those exact raw anchors without adding them as new qualifiers. It never clears an earlier qualifier, grants candidate identity or turns contact metadata into a contribution/role/summary source. A policy revision distinguishes this changed source-transform admission while preserving the IR shape and old receipts.

New controls keep Things I have never done, Team Results, Hypothetical Example, Other Candidates and colleague scopes effective through contact lines and cosmetic blank/section/role boundaries. Mixed contact-plus-prose lines stay unresolved qualifiers. The observed contact-only result is four repaired positive cases and three remaining project/employer RED cases, not full A11 completion.

Entry usefulness needs a separate reviewed source-bound association leaf: bounded entry/header/contribution spans under explicit Projects/Experience structure, exact reviewed role grammar and preserved subject/scope context. Unlabelled project/employer headers can be structural candidates, not verified facts or automatic candidate attribution. Their adoption must have an explicit reviewed association/target path, potentially using canonical entry/fact provenance. A general title-case exemption would erase meaningful qualifiers and is not accepted. The three existing supported-usefulness expectations remain until their positive path is implemented; they must not be changed to an unsupported-layout expectation.

## Contact-only implementation and checks

The existing writing-support.test.ts was absent in this worktree and copied from the allocated ROOT baseline SHA256 2ea23ba483dd9f99af95e15a18033c73abe15dc7358f4d8abff38072a152feb6. Its complete original 25-case bytes remain unchanged; one additive 11-case describe block supplies the adversarial/metadata/policy controls. The original new 20-case usefulness file remains byte-identical at 7f4d14dd7569417bf8d3286933e24503461f604df03796f31f30156cfebf5b5a, including all seven supported expectations and safety controls.

The production delta is one inert-contact predicate, its qualifier-admission exception, explanatory comments and policy version legacy-source-transforms/1.0.1. The predicate performs no external validation or fetch. It accepts the whole mailbox or parsed bare HTTP(S) URL only, retains the exact source anchor and never mutates the existing qualifier array. Contribution/action/metric/actor parsing, role/summary composition, anchor selection, limits, IR schema, wrapper, persistence and score/confirmation behavior are unchanged. A caller bound to the former policy is rejected rather than silently replayed under the new admission semantics.

Before production edits, the combined command npm test -- tests/unit/writing-support.test.ts tests/unit/writing-support-usefulness.test.ts returned **nine failed/47 passed**. That preserves the seven original usefulness failures plus the two authored policy-revision expectations. After the minimal source change, the same command returned **three failed/53 passed** across 56 cases. All 36 existing-plus-additive support cases pass. The 20-case usefulness file passes 17 and fails exactly the two separated-project contributions and the separate employer/title layout. Those three assertions stay enabled and still expect supported drafts; none was moved, skipped, weakened or relabelled unsupported.

Receipt bindings:

| Receipt                                             | SHA-256                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| /private/tmp/resumide-a11-usefulness-red.log        | 4b160871d847ab4a1a54b690e77471af44da0f586acd44b8c0c5b62897d52ab9 |
| /private/tmp/resumide-a11-contact-red.log           | 18052f22fc3d28d0d6fac59e1746da84c797ecff262bd132687c618b6f285515 |
| /private/tmp/resumide-a11-contact-partial-green.log | 85b2e463bef946d6d40cf64ffd9ccf0b66d380887c29f56b5b194051736bdf1f |

The last receipt is named partial-green for the contact slice; its actual exit is 1 and is not a green full suite. Scoped ESLint/Prettier and project-options/transitive no-emit TypeScript for both test roots pass with zero diagnostics. Only these affected module cases ran; no unchanged broad suite, application build, provider or actual pipeline execution was repeated. Final source review/combined verification remains the coordinator's responsibility, with the remaining RED cases explicitly unresolved.

Contact-only intermediate bindings, superseded by the entry candidate below:

| File                                          | SHA-256                                                          |
| --------------------------------------------- | ---------------------------------------------------------------- |
| app/lib/server/writing-support.ts             | 73917370073b16030c031e51a24d94cf82b03e053b94a0e99f9aa6c0538639f4 |
| tests/unit/writing-support.test.ts            | c20e7447a4136c4de096322294d6bac15e51c35d3fc933880d4620d799032e2a |
| tests/unit/writing-support-usefulness.test.ts | 7f4d14dd7569417bf8d3286933e24503461f604df03796f31f30156cfebf5b5a |

Only the four allocated files are this candidate's owned outputs. The copied writer wrapper and shared fixture are not production replacements. No ROOT transfer was performed, and full A11/CV03, entry association, canonical/version adoption, actual provider quality and release acceptance remain open. All services remain free, deployment/Git publication remain stopped, and no provider/network/DB/browser/Docker/service operation occurred. ROOT's R14 inputs were untouched. Next: coordinator reviews this bounded partial repair and settles the explicit entry-association leaf while retaining the three meaningful RED cases and all historical receipts.

## Approved next entry-context contract, before source edits

Root selected and ACKed this bounded derived-layout leaf to repair the remaining three cases. It supports only source-preserving clause transformations under explicit engineering resume structure, not persisted entities, verified employment, candidate attribution or a general layout parser. The same four files remain owned; a fifth helper is permitted only if needed. The 20-case usefulness file and original unsafe controls must remain unchanged.

The finite label grammar is two to four ASCII alphanumeric words, each beginning with a capital and containing two to 24 characters, with a maximum complete label length of 80 UTF-16 units. Punctuation, possessives and free prose are not accepted. The final word must match a reviewed structural marker, case-insensitively:

- Projects: Project, Dashboard, Worker, Service, API, Tool, Platform, App, Application, System, Library, Pipeline, Portal, Tracker or Console.
- Employer metadata: Labs, Works, Technologies, Systems, Software, Solutions, Inc, LLC, Ltd, Limited, Corporation, Corp, Company or Co.

Capitalization/final noun alone is insufficient. Reject action verbs and negative, other-subject, example, possessive or ambiguous-scope tokens, including no/not/never/without, thing(s)/done, team/result(s), hypothetical/example/sample, other/candidate(s)/colleague, and personal/possessive pronouns. Inspect camel-case splits and compact reserved forms too, including TeamResults and OtherCandidates. This is a conservative engineering metadata grammar; unmatched labels remain review-required qualifiers, not newly unsupported product segments.

Only the exact Projects or Experience section enables this grammar. A project entry needs a qualifying label immediately after that section or after a blank gap following a parsed contribution, then an immediately adjacent parsed contribution. An employer entry needs the label, an immediately adjacent standalone title matching the exact existing reviewed title grammar, then a parsed contribution. Complete recognized contribution units may retain the entry context; an incomplete/unmatched chain is not promoted. No heading, blank, role or recognized metadata clears a prior unknown/semantic qualifier.

Proposed local model revision: writing-support/1.1.0 and legacy-source-transforms/1.0.2. Each contribution context gains nullable layoutEntry with id, kind, headerAnchorIds, entrySpan, authority=derived_layout_only and attribution=not_inferred. The exact section/header/title source anchors and complete entry span bind its identity to source hash/policy. Metadata anchors remain nonclaimable and keep role null. Supported provenance includes these context anchor IDs plus the contribution ID, without inserting header text into the draft. Canonical source reconstruction/tamper checks cover the new context; old expected-policy bindings reject. A separate employer/title tuple must not support a synthesized role-at-employer fact or summary. No metrics, agency or facts join across entries, and identical originals still need explicit target selection.

Before implementation, add meaningful scope/final-noun/possessive/prose/outside-section/incomplete-chain negatives, exact provenance and tamper assertions, and separate-role summary rejection. Preserve all original seven positive expectations rather than redefining these layouts as unsupported. This section records the agreed grammar/DTO before code; the next receipt will report actual red/green results and remaining limitations.

## Entry-context implementation and final focused result

The agreed leaf is implemented in the same four files, with no helper/dependency or copied-wrapper change. The document model is writing-support/1.1.0 and source policy legacy-source-transforms/1.0.2. Source units retain the previous exact wrapping/clause extraction. A bounded structural pass identifies only complete reviewed patterns under exact Projects/Experience sections. It records header metadata and contribution membership before the unchanged forward qualifier pass; it does not remove or reset a qualifier. Candidate-like structural labels outside a qualifying section cannot bypass this rule by being treated as a first-line personal name.

The finite label policy and reviewed title grammar contribute to the entry identity hash alongside source hash, exact section/header/title IDs, entry kind and exact entry span. Each contribution receives its nullable derived-only context. Raw metadata anchors are retained and nonclaimable; standalone title/employer metadata keeps role null and cannot create an adjacentRoleId for role composition. Support provenance includes section/header/title anchor IDs plus the exact contribution ID. No header or employer text is inserted into the proposed wording, no candidate attribution is inferred, and no persisted canonical entity/fact is created. Exact source reconstruction compares the complete new context before any support is granted, including altered IDs/spans/attribution/header lists.

The existing explicit role-at-company grammar is shared with the standalone-title metadata check without widening its recognized titles. The existing explicit role/contribution positive and every original negative remain. Unknown, negative, colleague, hypothetical and other-subject scopes stay effective through multiple fake blank/section/role boundaries. Cross-entry metric/agency swaps and identical-original target ambiguity still reject. Only the approved equal-agency literal transformations are available; this is not a language-entailment or verified-employment model.

### Final red/green chronology

| Step                                          | Actual result                                                                                                                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry assertions before source implementation | 11 failed / 68 passed in two files. The three remaining useful layouts, missing exact context/provenance/schema and the outside-section name-label ambiguity were exposed.                   |
| Initial bounded entry implementation          | 79 passed / zero failed in the same two files.                                                                                                                                               |
| Final source-review framing contrast          | Four failed / 79 passed. Fictional, planned and mock structural labels, including fictional employer metadata, could still be mistaken for neutral headers.                                  |
| Narrow framing correction                     | 83 passed / zero failed. The finite rejected-token policy now retains fictional/fake/mock/planned/proposed/template framing as qualifiers. No transformation or title grammar was broadened. |

All seven original usefulness expectations now pass in the byte-identical 20-case file. The 25 original support-test bytes are preserved exactly. The support file now contains 63 cases: the original 25, contact controls and the new entry/source/negative controls. The original five unsafe writer vectors and two downstream payload controls remain unchanged and pass at the direct guard boundary. Their actual structured pipeline execution remains in the original unmodified pipeline tests and was not repeated in this worktree.

New coverage verifies exact Unicode/code-point entry spans and section/header provenance; wrapped/later contributions in one entry; metadata not claimable as a summary or role/employer fact; unsafe final-noun/camel-case/possessive/prose/outside-section/incomplete patterns; semantic scopes across multiple fake sections; cross-entry metric/agency changes; duplicate-original refusal; 80-unit label admission/81-unit refusal; old-policy/source mismatch; and context/header/span/identity/attribution tampering. These are development regression checks, not fresh holdout or representative accuracy evidence.

Pre-A11-F01 83-case source/test bindings, preserved as historical evidence:

| File                                          | SHA-256                                                          |
| --------------------------------------------- | ---------------------------------------------------------------- |
| app/lib/server/writing-support.ts             | 6ce0a8ec01ee2e234865f5919f6b40baf2a7ff5a2afa92defa41356bf76503d3 |
| tests/unit/writing-support.test.ts            | d128d26203169d671b33680ff85fe919ac95a6d20d50394fe4cf4fe0b3210441 |
| tests/unit/writing-support-usefulness.test.ts | 7f4d14dd7569417bf8d3286933e24503461f604df03796f31f30156cfebf5b5a |

The copied writer-grounding input remains 486fd5a945339a4bd9014b780fc43bb8fa9d588bcb34071c745bb7df4e38290b and the shared fixture remains 22788ee9f8eb90e9b2aa640946be6fad03819e192fb66491289b5364e1a0ceaa. They are not part of the source delta.

| Additional receipt                              | SHA-256                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| /private/tmp/resumide-a11-entry-red.log         | 42a1c17fb7c1deb813de1c2ed7bb68fdcb8061df545c9458cefd4a06cfb84d66 |
| /private/tmp/resumide-a11-entry-green.log       | 8fd5a835d02bc7929405dd800263926e57edc3ec3d48f2e9d30a9bd74020b5d0 |
| /private/tmp/resumide-a11-entry-framing-red.log | 1a62fa45624167bd278995a7748f759c1709cf84aff8fe7cf906c28c94d78623 |
| /private/tmp/resumide-a11-entry-final.log       | 59161c615169053d6c95ffda84f5c63b0749a47fe5bdff842c7bda0352567379 |

Scoped ESLint/Prettier and project-options/transitive no-emit TypeScript for both test roots pass with zero diagnostics. Node 22/private verification/disabled AI isolation is unchanged. No broad suite/build, provider, network, DB, Docker, browser or service was run. No ROOT file, compiler input, threshold, locked fixture, consent, canonical confirmation or application flag was changed.

### A11-F01: dense entry serialization

Root and author independently identified the same bounded-input work regression before integration: copying the full entrySpan.text into each contribution's context repeats the same entry text. It was finite under the existing 100,000-source/512-anchor limits but could grow quadratically in a dense valid entry. This is a reproduced local representation/work regression, not an unbounded input or demonstrated production exploit.

The added RED uses one complete valid project entry with 80 recognized roughly 200-character contributions. Its 17,135-byte source and 82 anchors remain inside all original source/anchor/relation limits. Its first source-preserving transform stays supported. Serialized IR was 1,636,831 bytes against a generous linear regression budget of sourceBytes*12 + anchorCount*4096 = 541,492 bytes. The run failed exactly this assertion, with all 83 prior cases passing.

Root allocated the minimal DTO correction: entrySpan now contains only id/start/end. The full source hash and canonical reconstruction still bind that exact range. Tests reconstruct its text on demand from source/code-point offsets and retain the original exact-entry text assertions, without repeating the text in every context. Context/header/span/identity/attribution tampering still rejects, and an added fabricated text field is also rejected. The draft remains writing-support/1.1.0 and legacy-source-transforms/1.0.2 because this new schema was not activated or persisted before correction; no stored shape or producer changes.

The same dense source now serializes to 259,551 bytes under the unchanged 541,492-byte budget and remains supported. Final focused evidence is **84 passed in two files, zero failed**: 64 support cases plus the byte-identical original 20 usefulness cases. This is size/regression evidence for the corrected representation, not a throughput/latency benchmark or full resource-isolation guarantee. Scoped lint/format/transitive no-emit TypeScript pass again after the correction.

The old source/test and original 83-case receipt are preserved privately at /private/tmp/resumide-a11-entry-before-work-bound-20261109 as writing-support.ts, writing-support.test.ts and 83-case-green.log, matching the prior hashes above. The original seven-red, contact-partial, initial entry, framing and 83-green receipts remain unchanged.

| A11-F01 receipt                                | SHA-256                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| /private/tmp/resumide-a11-work-bound-red.log   | e7f28efae619412d5645c48d0b7f92d83fd77e7f730c669a42fc5773bc6fda54 |
| /private/tmp/resumide-a11-work-bound-final.log | d70fef395b8b98904276c77384e350207e7a571b05308b299a7f08445756f388 |

Current final source/test bindings for terminal independent review:

| File                                          | SHA-256                                                          |
| --------------------------------------------- | ---------------------------------------------------------------- |
| app/lib/server/writing-support.ts             | 6dcac128e26dec55bd3d462281adb5ee621a9e7421b8e5fe955b40d19f89d261 |
| tests/unit/writing-support.test.ts            | 4c0e5e5dc91e4636816bf6fdff0cfa44d2c4b7a84ff2e64722003e12039b2ebc |
| tests/unit/writing-support-usefulness.test.ts | 7f4d14dd7569417bf8d3286933e24503461f604df03796f31f30156cfebf5b5a |

The candidate remains held until independent source review and coordinator integration. Full A11/CV03, canonical/fact-based acceptance, broader source-layout/qualifier semantics, actual provider quality, scored coverage, representative validity and release gates remain open. Unmatched structures still require review; this finite grammar is not a declaration that other ordinary resume layouts are unsupported product segments. Next: peer review the frozen four-file candidate, integrate only after acceptance, then run the coordinator's affected structured pipelines and combined web/worker checks.
