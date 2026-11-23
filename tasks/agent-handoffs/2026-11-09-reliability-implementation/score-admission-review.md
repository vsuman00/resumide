# CR-A15 independent source review

Status: FINAL SOURCE ACK, no remaining scoped finding. Baseline and final author source review are complete; integration/acceptance remain Root responsibilities. This handoff is the only reviewer-owned file. No application checks, tests, Native/SQL/parser, database, provider, browser, environment, services, dependency, Git or deployment operations ran for this review.

The frozen score-admission contract is `0498c4b2c88af1dbf121365b98bfefec650c89f7824990062494a3957cae7048`. Canonical CR-A15 depends on CR-A10/CR-C00 and corresponds to blueprint ATS A14. The current allocation preserves the draft numerical policy and history; engineering consistency does not supply representative calibration or policy adoption.

## Baseline findings and counterexamples

No numerical-admission defect was found in the inspected baseline. `score-v2-contract.ts:103` restricts v2 to withheld state, null calibration receipt, three unique dimensions, null values/coverage and false eligibility, each retaining calibration_not_approved. `score-v2-engine.ts:484` binds the owner/analysis/attempt/hash/retention/citations and policy; its output at line669 remains withheld for every valid input. Its observed rule credits and page recovery fractions are diagnostic observations, not authoritative scores.

`typed-score-diagnostics.ts:71` validates the real owned relationship context and returns the same withheld envelope at line175, with no aggregate; unknown declared pages remain unknown. `score-v2-repository.ts:117` rejects mismatched evidence and rechecks owned context, head/version/hash bindings and privacy before releasing results. Invalid/moving/unavailable read inputs retain their existing errors rather than being converted to a numerical result.

The concrete presentation counterexample is `analysis.score.tsx:325`: one generic notice combines evidence review and scoring calibration, while dimensions/readiness print raw blocker labels at lines365/391. That does not explain which candidate actions are useful or that service policy validation remains unavailable independently of confirmation/correction. The frontend leaf should repair this explanation using observed blockers and real owned review links.

A considered claim counterexample is intentionally already correct: `evaluation-claims.test.ts:303` permits low-power synthetic Regression-tested eligibility while denying higher validity. Do not require representative power for that historical claim. `evaluation-claims.ts:207` binds current claim/report/scope/receipt authority and always returns activationAllowed=false. `evaluation-calibration.ts:122` produces offline proposals only; productionAdoptionAllowed remains false even where future trusted representative proposal authority is supplied. Neither path activates the draft scoring engine.

## Independent scenario expectations sent to both authors

1. Full candidate confirmation and successful OCR/provider recovery still yield null/false/null authoritative dimensions and no aggregate. Availability cannot clear calibration.
2. Incomplete, failed, unsupported or mismatched source/export evidence rejects or withholds. Cross-owner/organization/analysis/attempt/hash/version or unsupported domain/locale cannot create numerical eligibility.
3. Mutated policy weights, bands, receipt, dimension count/identity or extra future-adoption keys reject through the existing strict interfaces. No new numerical-policy API is needed.
4. Typed diagnostics use actual relationship admission; missing page count and uncertainty remain visible, without merit zeros or invented confidence.
5. Calibration and claims distinguish engineering, independent-human/domain/vendor/outcome evidence; expired/binding-drift/leaked/wrong-source authority cannot authorize higher claims. Regression-only low-power semantics remain intact.
6. UI reasons come from actual dimension/readiness blockers, deduplicated. Calibration/coverage-policy validation is a service limitation, not a candidate task; evidence/canonical/requirements links are real owned routes retaining the selected canonical/requirements versions where supported. Unsupported and unknown blockers get safe explanations, without promises that review, confirmation or successful OCR unlocks a score. Preserve raw diagnostics, historical/version behavior and accessible labels.

## Baseline source bindings

These are the synchronized runtime bytes inspected before author changes, not a fresh test result.

| File | SHA-256 |
| --- | --- |
| `app/lib/server/score-v2-contract.ts` | `3b6ba7cab792893aba68bd24c13baf9eb7e21525d716b99bb613d9af0836c80d` |
| `app/lib/server/score-v2-engine.ts` | `175cc512066abc2f11e9aa27e80ad61beea86d8d21423d5bfc21cf4c7ccbe6f2` |
| `app/lib/server/typed-score-diagnostics.ts` | `2c389425584526db32d4ba946037113528fe5683053595e649189df1750ed334` |
| `app/lib/server/score-v2-repository.ts` | `bcdfef98b11c60f8e5344a5f03a86ae97ddc9db90db5eda9fd1d11d927746e23` |
| `app/lib/server/evaluation-calibration.ts` | `40bb3e75dc472e716dd264a832474c1eeeff8e44cebe8a2a03be813ad58dd3da` |
| `app/lib/server/evaluation-claims.ts` | `0984b34dbe1ab029eaa3522959d641654b6616d1905453003762f26e7bc0589c` |
| `app/routes/analysis.score.tsx` | `e13535841c0d0666012e7b7acace043d03f4810b7dd202144a989f5587546e9b` |

## Final author review

The backend's new 46-case matrix uses actual legacy/typed diagnostics, owned repository, strict policy/score contracts, artifact verifier, selective OCR normalizer, bounded provider wrapper and offline calibration/locked-evaluation/claim entrypoints. The four allocated production files are byte-identical to their preimages. Assertions require all authoritative dimensions null/false/null, calibration blocker/no aggregate, and rejection/withholding of mutated provenance/receipt/policy inputs. Diagnostic observations remain available. The owned persistence reader and external work are synthetic doubles; no real PDF/OCR/provider/Native result follows. The initial 43-pass/3-fail run was an author fixture API error, not a product defect; its receipt remains preserved.

Frontend now unions and deduplicates actual dimension/readiness blockers. Known reasons map to candidate review or service validation; unknown codes receive a safe fallback. It adds accessible labelled text and actual owned links, with no mutation, auto-confirmation, weight or score output. Existing raw diagnostics, historical banner, loader/action and policy semantics remain intact. The initial 13-fail/2-pass presentation RED is preserved.

Resolved Root finding: initial new notice navigation opened current heads from historical diagnostics. Final route and component pass the exact selected canonical and optional requirements version IDs into both top navigation and notice links. Source evidence remains generic because no historical selector exists. The added historical and missing-JD controls retain the selected IDs without inventing a requirement version; the intermediate 1-fail/16-pass RED is preserved. Final source re-read confirms this repair.

The Root-owned typed-JD documentation replacement accurately describes score-v2-repository.ts129-235 and the current owned context, pair/source/page metadata and repeated head/content checks. It removes the stale permanent typed-JD 503 description without claiming Native storage, representative quality or policy activation. The linked a10 typed-consumer closeout exists. The updated UI paragraph also matches the actual notice and selected-version links, separating earlier browser checks from this new DOM evidence. Its score-admission closeout link is an explicit Root integration deliverable after the gate; it is not an existing acceptance receipt.

### Frozen author source bindings

All eight hashes below matched the final author-provided pins at review and again at handoff freeze. Backend production hashes also equal the allocated preimages. Runtime typed/repository baseline hashes above remained unchanged during review.

| Lane and file | SHA-256 |
| --- | --- |
| `backend:app/lib/server/score-v2-contract.ts` | `3b6ba7cab792893aba68bd24c13baf9eb7e21525d716b99bb613d9af0836c80d` |
| `backend:app/lib/server/score-v2-engine.ts` | `175cc512066abc2f11e9aa27e80ad61beea86d8d21423d5bfc21cf4c7ccbe6f2` |
| `backend:app/lib/server/evaluation-calibration.ts` | `40bb3e75dc472e716dd264a832474c1eeeff8e44cebe8a2a03be813ad58dd3da` |
| `backend:app/lib/server/evaluation-claims.ts` | `0984b34dbe1ab029eaa3522959d641654b6616d1905453003762f26e7bc0589c` |
| `backend:tests/unit/scoring-release-admission.test.ts` | `dfde8271e87f30c3ff8514b6a8d184682854b324b44a1882a2a4ccffca66b31c` |
| `frontend:app/routes/analysis.score.tsx` | `6b2f725270082dab2a6d050ec0153c3fe4f80e0d4ed02e2ab43e5af72d642fad` |
| `frontend:app/components/ScoreAdmissionNotice.tsx` | `ff517a62ae9167d1d70068a04b49800d93412df9f3fee04f626fc9f8ba007a2d` |
| `frontend:tests/components/ScoreAdmissionNotice.test.tsx` | `b57915356b14eb6494635babc887d955a1271453734133bbe97ab5e70b12c052` |

Root documentation `docs/design/SCORING_V2_REVIEW.md` SHA-256: `0fe21d115f27148ce7280ecf9f690f0039e2eab947ac2550b40ba51572d4ce22`.

### Evidence attribution

- Backend author release: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-score-admission-backend-04v3ky_6/release.json`, SHA `d299a4e6fde2c12e66cc636cf8796a7346b475905d409a7ec5b805a82e38dea9`. It records 46/1 PASS, scoped lint/format PASS and nine absent groups, with prior fixture failures preserved. This is source/synthetic verification, not numerical activation.
- Frontend frozen release: `/private/tmp/resumide-score-admission-frontend-mafipu1p/release.json`, SHA `05e05239190aec1998abe3ecd130cd043aae2d1fa7856e50a3fd8873a04f491c`.
- Frontend author final DOM receipt: `/private/tmp/resumide-score-admission-frontend-mafipu1p/historical-green/receipt.json`, SHA `8d99f9650f95026707cd937f63038f0d95327a2d64ca4ef1c82e97da51b50004`. It records PASS for the final selected-version successor; author reports 17/1, zero pending, scoped three-file lint/format and groups absent. This is jsdom/MemoryRouter/keyboard simulation, not browser or full-loader acceptance.
- Reviewer ran no application/test/static/build/process campaign. This ACK is independent source and expectation review; the authors' receipts are separately attributed, not a fresh reviewer test result. Root owns combined affected tests/types/lint/builds and exact artifact reconciliation.

No product score change or numerical policy adoption occurred. Empirical validity, representative calibration, owner and release gates remain open. No expiry/core/adoption re-review was requested or performed.

