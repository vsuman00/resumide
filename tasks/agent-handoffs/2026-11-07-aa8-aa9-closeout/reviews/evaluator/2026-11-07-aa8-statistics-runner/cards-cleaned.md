# AA8/AA9 prerelease evidence cards

Version: `aa8-aa9-prerelease-cards/1.0.0` · Recorded: 2026-11-07 · Scope: software engineering, English, India.

Status: local engineering cards for coordinator review. Final workflow measurements are recorded in `AA8_AA9_WORKFLOW_20261107.json`; that receipt is pending at this draft's freeze. This document supplies no missing measurements or final acceptance by inference. [ADR-0018](../decisions/0018-solo-prerelease-aa8-aa9-verification.md) defines the current solo-owner prerelease scope. AI subagents provide technical review; representative research, customers, vendors, recruiters and owner launch review remain deferred.

## Dataset card

| Field                | Recorded scope                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Dataset version      | Synthetic engineering fixture version and content hashes in the final workflow receipt                                  |
| Composition          | 20 authored documents: 8 development, 4 calibration and 8 locked evaluation                                             |
| Locked cohorts       | 4 native, 2 simulated scanned and 2 simulated mixed documents                                                           |
| Provenance           | AI-assisted, known-truth fictional fixtures; no real candidates or independent-human research                           |
| Composition families | Three authored families sharing a PDF serializer and common generation provenance                                       |
| Rights and purpose   | Synthetic engineering evaluation only; upload consent does not grant future corpus permission                           |
| Labels               | Known-truth engineering labels and agreement/adjudication contract checks; no trained-human annotation result           |
| Split controls       | Immutable source/hash bindings and declared person, employer, template, source-family and near-duplicate leakage checks |
| Access and retention | Permission-aware admission, group/owner checks, expiry, revocation, run-owned removal, audit and verified absence       |

The cohort names describe simulations. They do not establish actual scanned-document OCR performance. Three composition families are not three independent acquisition populations: shared serializer and provenance can produce correlated successes and blind spots. Declared cluster checks detect declared overlap; they do not discover all real-world dependencies or establish representativeness.

A separately authorized [direct Supabase storage drill](AA8_STORAGE_DRILL_20261107.json) passed 12 checks using two synthetic owners, two neutral PDFs and 11 audit rows. Independent SQL verification found zero remaining exact storage objects, synthetic owners, audit rows and organizations. The receipt binds the tested sources and distinguishes the raw drill from independent cleanup verification. This is an actual hosted storage/access/cleanup check, not a database-container test, a customer corpus or a new deployment.

## Ruleset and calibration card

Versioned deterministic rules own numeric outputs. The workflow's three-dimension offline calibration proposes policies for ATS compatibility, required-job alignment and preferred-job alignment using only development/calibration access. Locked labels cannot be read for fitting. Missing applicable feature credit is withheld rather than renormalized away; absent references and observations remain in the loss denominator. The proposal retains candidate sensitivity, provenance hashes and the previous policy version.

This proposal does not change the production draft policy, approve production thresholds or unlock authoritative scores. Unsafe, unsupported or uncalibrated evidence remains subject to existing withholding and review rules. Actual selected policies, proposal version/hash, failures and withheld outputs belong to the final workflow receipt; this card invents none.

Intended use is candidate-first engineering diagnosis and review of grounded writing proposals. Prohibited uses include automated candidate rejection, hidden ranking, hiring-probability estimates, proprietary ATS score reconstruction, general vendor-equivalence claims and unsupported authoritative scoring.

## Model and writing-assistance card

No model was trained and no live LLM or hosted AI provider was used for this verification. AI assistance authored/reviewed engineering artifacts; that provenance is distinct from executing a production model against a representative benchmark. Any actual writer-grounding, evidence binding, unsupported-claim rejection or artifact-render checks are bounded by the operations and measurements recorded in the workflow receipt.

This evidence supports no model accuracy, factuality rate, hiring outcome or universal resume-writing claim. Existing AI prose remains a bounded proposal requiring validation and candidate confirmation. Deterministic score ownership and the production model configuration are unchanged.

## Evaluation and evidence card

Integrated synthetic workflow tests passed 3/3, including actual PDF and DOCX export checks, the eight locked documents and pilot control operations. The final CLI execution is still pending at this draft's freeze; the reproduction command is `npm run verify:aa8:workflow`. Its registered harness selects the authorized local synthetic, AI-off workflow. This card does not claim that pending command passed.

Engineering checks and numeric validity are separate outputs. A successfully executed workflow can preserve failed numeric gates and `null` measurements. Neither an engineering check pass nor a validated report format changes those numeric outcomes or permits automatic activation.

The final workflow receipt is the source for measured extraction, job intelligence, scoring, writer grounding, artifact parity, accessibility, fairness/error, safe failure, latency and cost, per required segment and in aggregate. A genuinely unmeasured slot is `null`, retains the expected document denominator and withholds the affected cell. It is never a zero, a success or an excluded hard example. Latency/cost intervals concern means, not p95. No cost estimate is fabricated when no cost measurement exists.

Statistics use 10,000 seeded whole-cluster percentile resamples with two-sided 95% intervals. Aggregate resampling keeps cross-segment cluster members together. Per-segment draw plans are deterministic. Undefined rank replicates, insufficient clusters, degenerate intervals, missing segments and withheld measurements block the numeric gate. Zero observed safety incidents is an observed check, not a population-error guarantee. Nominal interval level does not establish finite-sample coverage, sample sufficiency or independence. Small simulated cohorts cannot establish domain or population validity.

The current claim ceiling is **Regression-tested**, limited to the exact trusted execution and technical-review evidence. That label can describe an executed engineering regression with disclosed failures or insufficient numeric power; it does not mean every quality gate passed. **Corpus-validated**, **Domain-validated**, **Vendor-observed** and **Outcome-calibrated** remain unachieved and deferred. Future higher claims require exact trusted execution/review, eligible representative evidence, all required metric/segment gates, sample justification and, at their respective levels, named vendor/configuration observations or a prospective outcome study. Input JSON readiness flags cannot approve them.

Synthetic pilot operations exercise notice, visible rubric, human override/rationale, correction, appeal, retention, audit, stop and rollback capabilities. Simulated adapters and receipts remain synthetic. They establish neither external vendor compatibility nor recruiter/customer outcomes. One owner may hold the accountable roles; AI technical review is never relabeled independent-human research.

## Binding, limitations and invalidation

The workflow receipt must bind the actual fixture content/partition lock, annotation evidence, calibration proposal, measured ledger/report, code-source hashes and worker/runtime identity. Storage evidence has its own source-hash binding and is not substituted for application evaluation. Current local card text is not a newly published release, merged change, deployment or approval of a mutable later source tree.

Known limits are common synthetic provenance, simulated scan/mixed cohorts, small segment sizes, known-truth/AI labels, no live-model evaluation and absent real vendor/recruiter/customer outcomes. Any actual OCR, extraction, rendering, policy or upstream failure and every unknown measurement must remain visible in the final receipt. [AA7's owner acceptance](../decisions/0017-aa7-owner-acceptance-and-aa8-start.md) remains a separate bounded decision; these cards provide no new vulnerability clearance.

Claim controls require versioned limitations, explicit expiry and a previous rollback version. Missing, stale, future, revoked or binding-drifted monitor signals; failed evaluations; and complaint, correction, error, fairness, latency or cost breaches propose stop and rollback. These functions do not themselves activate flags, publish claims or deploy. Operational action and owner approval remain separate.

Retest before a claim's expiry and after any change to corpus membership/labels, segment definitions, policy/proposal, code/runtime dependencies, model/provider, supported input or locale, vendor version/configuration, permissions, retention, monitors or the claimed use. New evidence must retain failed receipts and use new version/hash bindings. Owner launch review and real-world research/pilots remain on the demo/RC/pre-launch checklist. Deployment is explicitly on hold.
