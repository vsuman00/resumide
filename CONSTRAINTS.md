# Resumide constraints

Status: **CURRENT ENGINEERING FLOOR PLUS PROPOSED ACCURACY-V2 GATES**
Last reviewed: 2026-10-11; E-003 sequencing approved by the workspace owner; release accuracy/calibration gates remain open

This file records the quality bar. It must not be weakened to make an implementation pass. A proposed gate is not enforced evidence until its named checker exists and runs against the required corpus.

## 1. Floor

- No new `@ts-ignore`, `eslint-disable`, skipped tests, deleted assertions, empty catches, or unimplemented production stubs without a reviewed exception.
- No secrets, resume text, job-description text, provider prompts, or candidate PII in source, logs, metrics, fixtures, screenshots, or telemetry.
- No numeric ATS/job-alignment score may be owned or silently changed by an LLM.
- No generated candidate fact may be accepted without source evidence or explicit candidate confirmation.
- No score may be shown when its critical extraction inputs are known to be incomplete or unreliable.
- No product or marketing claim may exceed the achieved claim level in `docs/ATS_SCORING_AND_AUTHORING_SPEC.md`.
- No real resume/job corpus may be collected or reused without documented permission, purpose, retention, and deletion policy.
- This file and benchmark thresholds may be tightened through review; relaxing them requires a named owner, rationale, evidence, and expiry or replacement target.

## 2. Enforced today

| Dimension                           | Rule                                                       | Checked by                                                                                   | Runs at      |
| ----------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------ |
| Formatting                          | Repository files in the formatter target have no drift     | `npm run format:check`                                                                       | task end, CI |
| Lint                                | Zero configured lint errors                                | `npm run lint`                                                                               | task end, CI |
| Types                               | Zero TypeScript/type-generation errors                     | `npm run typecheck`                                                                          | task end, CI |
| Tests                               | No failing committed Vitest tests                          | `npm run test`                                                                               | task end, CI |
| Build                               | Production build completes                                 | `npm run build`                                                                              | task end, CI |
| Synthetic parser/matcher regression | Existing approved Phase 5 thresholds do not regress        | `npm run benchmark:phase5`                                                                   | CI           |
| Browser/accessibility regression    | Existing Playwright/axe gates pass                         | `npm run test:e2e` and `npm run test:a11y`                                                   | CI           |
| Security floor                      | Existing secret, container, and high dependency gates pass | `npm run scan:secrets`, `npm run check:container`, `npm audit --omit=dev --audit-level=high` | CI           |

The Phase 5 benchmark is explicitly a synthetic regression check. Passing it does not satisfy the Accuracy-v2 validity gates below.

## 3. Proposed Accuracy-v2 release gates

These targets apply per released segment, not only in aggregate. A segment includes the declared occupation/domain, language/locale, document class, and scan/layout class. Final thresholds require human approval after the benchmark design and baselines are reviewed.

| Dimension                  | Proposed gate                                                                                                                           | Reason                                                                                                                             | Planned checker                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Deterministic stability    | 100% identical numeric result for identical content and version inputs                                                                  | Reproducibility is a core product promise                                                                                          | `npm run benchmark:scoring-validity` |
| Native-text transcription  | At least 99.5% character accuracy and 99.5% page text coverage                                                                          | A few lost characters can corrupt names, dates, skills, or links; target is deliberately stricter than the current synthetic floor | `npm run benchmark:extraction-v2`    |
| OCR transcription          | Character error rate at most 1% on clean scans and 3% on the declared challenging-scan segment                                          | OCR quality varies materially by document quality; separate gates prevent an easy segment hiding failures                          | `npm run benchmark:extraction-v2`    |
| Critical field extraction  | Precision at least 98% and recall at least 97% for name, email, phone, employer, role, dates, education, and certifications             | False facts and missing qualifications both harm candidate trust                                                                   | `npm run benchmark:extraction-v2`    |
| Reading order              | At least 98% ordered-line agreement on single-column and 95% on the supported multi-column segment                                      | Visual presence is not enough if extracted content is reordered                                                                    | `npm run benchmark:extraction-v2`    |
| Requirement extraction     | Macro F1 at least 95% for typed JD requirements; required/preferred classification macro F1 at least 93%                                | Job alignment cannot be valid if the rubric itself is wrong                                                                        | `npm run benchmark:job-intelligence` |
| Evidence citation          | 100% precision and at least 98% recall for source spans attached to scored findings and requirements                                    | Every displayed scoring claim must be inspectable; missing non-critical evidence is measured separately                            | `npm run benchmark:scoring-validity` |
| Unsupported accepted facts | Zero unsupported facts in the locked release corpus and runtime rejection of unsupported generated facts                                | One invented employer, metric, certification, or skill can harm a candidate                                                        | `npm run benchmark:writer-grounding` |
| Render parity              | 100% recovery of critical fields and at least 99.5% normalized text coverage for artifacts labelled verified                            | Export must not silently lose or reorder candidate information                                                                     | `npm run benchmark:render-parity`    |
| Expert agreement           | Spearman rank correlation at least 0.80 against adjudicated domain-expert rubric per released domain, with confidence interval reported | This is an initial construct-validity threshold, not proof of hiring outcomes                                                      | `npm run benchmark:scoring-validity` |
| Counterfactual invariance  | Zero score change for name and other protected/non-job-related substitutions in deterministic candidate mode                            | Protected identity must not affect compatibility or public-JD evidence                                                             | `npm run benchmark:fairness`         |
| Reliability                | Zero silent scoring of `insufficient`, `unsupported`, or failed parse-back states                                                       | Safe failure is more important than forced coverage                                                                                | `npm run verify:accuracy-v2`         |

## 4. Corpus and statistical constraints

- Development, calibration, and locked test partitions are separate; near-duplicate resumes and templates cannot cross partitions.
- Critical labels use at least two independent annotators and adjudication. Target inter-annotator agreement is at least 0.80 using an appropriate documented statistic because lower agreement means the rubric is not stable enough to calibrate a score.
- Scoped local-testing exception E-002 permits AI-assisted labels with known synthetic source truth. Such records explicitly lack independent-human validation; they cannot satisfy the representative release/calibration requirements above or establish human agreement. See [ADR-0010](docs/decisions/0010-ai-assisted-synthetic-annotation.md).
- Metrics report document-level bootstrap 95% confidence intervals and per-segment results.
- Sample size is justified through a documented precision/power calculation. The planning floor of roughly 203 independent documents per released segment estimates a 95% binomial success rate within approximately ±3 percentage points at 95% confidence; final analysis must account for clustering and non-binomial metrics.
- A segment cannot be declared supported when its lower confidence bound misses an approved gate, even if the global aggregate passes.
- Vendor-specific claims require a named ATS/version, controlled test protocol, and reproducible evidence. General compatibility tests cannot be relabelled as vendor verification.
- Interview/callback outcomes cannot be used as the sole ground truth because they are confounded by employer, market, timing, referral, candidate, and human-review factors.

## 5. Performance and cost targets for the new workflow

These are proposed product targets and must be baselined before enforcement:

| Dimension                                    | Proposed target                                                                                           | Reason                                                                               | Planned checker                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Analysis acceptance                          | p95 at most 1 second excluding upload transfer                                                            | The web request should only durably enqueue work                                     | existing load harness plus Accuracy-v2 scenario |
| Deterministic rescore after an accepted edit | p95 at most 500 ms for a two-page resume                                                                  | The editor needs interactive feedback                                                | planned authoring browser/load benchmark        |
| Standard two-page analysis completion        | p95 target set after OCR/provider bake-off; no invented number before measurement                         | Provider and scan behavior must determine the budget                                 | `npm run benchmark:extraction-v2`               |
| LLM factual drafting                         | One bounded request for the normal path; escalation only for low-confidence cases                         | Controls free-product cost and latency without letting the cheap model own the score | `npm run benchmark:writer-grounding`            |
| Compile/render                               | p95 target set after renderer selection; hard timeout and resource cap required from first implementation | LaTeX/DOCX/PDF paths have different costs and risks                                  | `npm run benchmark:render-parity`               |

## 6. Exceptions

| ID    | Constraint                                      | Scope                                      | Reason                                                                                                                                                                                              | Owner                       | Expires                                                                               |
| ----- | ----------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------- |
| E-001 | Accuracy-v2 benchmark commands do not exist yet | Scoring/authoring initiative               | AA010 is authorized; planned accuracy benchmarks still require implementation and representative evidence                                                                                           | Workspace owner             | At the relevant Accuracy-v2 release gate                                              |
| E-002 | Independent human annotation prerequisite       | Local AA1 synthetic engineering tests only | Owner approved AI-assisted annotation; record AI provenance, known source truth and unverified human validation. No metric threshold or representative-release requirement is waived. See ADR-0010. | Workspace owner, 2026-10-04 | Before representative release evaluation or any human-validated/domain-validity claim |

| E-003 | AA2 engineering depends on Gate AA1 passing | Isolated AA020–AA024 engineering only | Owner approved progression after the disclosed AA1 closeout. Keep failed locked metrics, score withholding, uncertain facts and release requirements unchanged. See [ADR-0012](docs/decisions/0012-aa2-engineering-sequencing-approval.md). | Workspace owner, 2026-10-11 | At Gate AA2 acceptance or before release/production activation, whichever comes first |

No implementation task may add another exception silently.

**E-004 (owner accepted 2026-10-12):** Permit isolated AA040–AA046 local synthetic engineering while formal AA1–AA3 acceptance remains failed/open. Preserve the failed/blocked receipts, uncalibrated states, withheld authoritative values, original thresholds and all representative/domain/calibration/release requirements. No provider activation, hosted migration/deployment, real-data access or publication is authorized. Expires at formal Gate AA4 acceptance or before scoring-policy/production activation. See [ADR-0013](docs/decisions/0013-aa4-local-engineering-sequencing-proposal.md).

**E-005 (owner accepted 2026-10-12):** The instruction to proceed to AA5 after disclosure of open Gate AA4 permits AA050–AA057 local synthetic engineering and necessary additive local authoring storage. Formal upstream acceptance, numeric scoring/calibration, actual model adoption, representative/human review and release requirements remain unchanged. Hosted SQL/deployment, provider activation, real data, spend and Git publication are outside this authorization. Expires at formal Gate AA5 acceptance or before numeric/production activation. See [ADR-0014](docs/decisions/0014-aa5-local-engineering-sequencing.md).

**E-006 (owner accepted 2026-10-14):** The explicit instruction to implement AA6 permits local synthetic AA060–AA065 rendering and verification while formal upstream gates remain open. Artifact floors and formal accessibility/security/release requirements are unchanged. Deployment, hosted SQL, real data, providers, spend and publication remain deferred. Expires at formal Gate AA6 acceptance or before production activation. See [ADR-0015](docs/decisions/0015-aa6-local-engineering-sequencing.md).
