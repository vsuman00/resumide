### Phase AA8: Representative validity and staged claims [PRERELEASE ENGINEERING COMPLETE / VERIFIED 2026-11-07]

**Solo-prerelease owner revision (2026-11-07):** [ADR-0018](../docs/decisions/0018-solo-prerelease-aa8-aa9-verification.md) replaces team-verification prerequisites for current completion with sole-owner accountability and actual subagent technical review. Complete all software/workflow capabilities with honest synthetic/AI-assisted evidence. Customer/representative and vendor/recruiter experiments are deferred to demo/RC/pre-launch; their original empirical claims remain unachieved until real evidence exists. Do not block current implementation on a reviewer team or pretend AI reviews are human/customer results.

**Owner direction, 2026-11-07:** Gate AA7 is owner-accepted and closed; proceed to AA8. Start AA080 with metadata-only corpus-admission tooling and synthetic tests. Preserve real-data permission, independent annotation and representative-validity requirements. No AA7 green-check reruns or speculative remediation loop. [Decision](../docs/decisions/0017-aa7-owner-acceptance-and-aa8-start.md), [coordinator](agent-handoffs/2026-11-07-aa8-coordinator.md).

#### AA080: Acquire permitted first-domain data

**Dependencies:** AA003, AA005; **Likely files:** corpus registry, consent/provenance records, retention controls, data card; **Scope:** M

- [x] **AA080 engineering foundation, 2026-11-07:** Strict synthetic metadata admission/access/lifecycle helpers and bounded CLI implemented. All 44 targeted tests and 14 actual CLI cases pass; types, lint, source checks and web/worker builds pass. No raw corpus acquisition or representative validity is claimed. [Report](../docs/evaluation/AA8_METADATA_ADMISSION_20261107.md), [contract](../docs/design/EVALUATION_CORPUS.md).
- [x] **Synthetic storage workflow, 2026-11-07:** Seventeen lifecycle tests and one actual direct-Supabase drill pass: 2 temporary owners, 2 neutral PDFs, byte/hash reads, ownership/group/revoke/expiry checks and 11 audit rows. Independent read-only SQL confirms zero remaining exact objects, owners, audit rows or organizations. No database container, reset, schema change, provider or deployment. [Receipt](../docs/evaluation/AA8_STORAGE_DRILL_20261107.json).
- **Deferred representative acquisition (owner, ADR-0018):** Acquire the approved planning sample across native/scanned/mixed/layout/experience/locale segments with documented rights and exclusions.
- **Verify:** privacy review, provenance audit, access log, deletion drill, segment counts, and coverage gaps are complete before annotation.

#### AA081: Run independent annotation and adjudication

**Dependencies:** AA080; **Likely files:** annotation handbook, annotation store, adjudication log, agreement report; **Scope:** M

- [x] **Prerelease software, 2026-11-07:** Seven-family annotation, immutable original submissions, blind adjudication bindings and measured agreement implemented; synthetic/AI and trusted future human evidence remain distinct. Integrated annotation/partition tests pass 43/43; independent AI source review passed. Independent-human collection remains deferred under ADR-0018.

- **Deferred independent-human research (owner, ADR-0018):** Two trained annotators independently label critical fields, requirements, evidence, and expert rubric; disagreements are adjudicated blind to system output.
- **Verify:** agreement meets the approved floor per label family or the handbook/data are revised before continuing.

#### AA082: Freeze evaluation partitions

**Dependencies:** AA081; **Likely files:** partition manifest, hash registry, leakage report, access policy; **Scope:** S

- [x] **Prerelease software, 2026-11-07:** Canonical immutable locks bind annotation/source hashes, all five leakage categories, access groups and restricted calibration reads. Included in the integrated 43 passing tests; independent AI source review passed. Representative partition acquisition remains deferred under ADR-0018.

- [x] Freeze synthetic development, calibration, and locked test partitions with person/employer/template and near-duplicate leakage controls; representative acquisition is deferred.
- **Verify:** hashes and membership are immutable, test access is restricted/audited, and no calibration report includes locked-test labels.

#### AA083: Calibrate without the locked test set

**Dependencies:** AA082, AA4; **Likely files:** calibration pipeline, policy versions, calibration report, approval record; **Scope:** M

- [x] **Prerelease software, 2026-11-07:** Reproducible per-dimension candidate fitting, sensitivity/rejected alternatives, source/partition/observation bindings and rollback references implemented; all 12 integrated tests pass. Missing features retain full penalties and locked-test calibration is denied before label reads. Existing AA4 policy stays unchanged; representative fitting/adoption remains deferred.

- [x] Fit synthetic offline policy proposals only on development/calibration data with rationale, sensitivity, uncertainty boundaries and rollback version. Representative adoption remains deferred.
- **Verify:** reproducible calibration contains no test-set access and documents sensitivity plus rejected alternatives.

#### AA084: Run the locked end-to-end evaluation

**Dependencies:** AA5-AA7 as released, AA083; **Likely files:** evaluation runner, locked report, fairness/error report, artifact archive; **Scope:** M

- [x] **Evaluator software, 2026-11-07:** Seeded 10,000 whole-cluster bootstrap, tied ranks, per-segment/aggregate gates, explicit withheld measurements and actual restricted locked-reader/calibration bindings implemented; all 24 integrated tests pass. The final 20-document application workflow and CLI pass all 12 engineering checks; 40 statistical cells honestly retain missing/insufficient evidence and no representative validity is claimed.

- [x] Execute the synthetic application workflow and report all required metric slots per segment, preserving unknowns and failed gates. Representative validity, real OCR/render coverage, customer observations and complete cost/fairness measurements remain deferred.
- **Verify:** bootstrap confidence intervals and lower bounds are reported; one failed required segment fails the gate regardless of aggregate score.

#### AA085: Publish versioned evidence and limitations

**Dependencies:** AA084; **Likely files:** model/ruleset card, dataset card, limitations page, release note; **Scope:** M

- [x] **Card/claim software, 2026-11-07:** Versioned dataset/ruleset/model/evidence card bindings, exact five-level claim ladder and guarded higher-claim authority implemented. All 10 integrated tests pass and independent AI source review passed; synthetic failures remain visible and do not qualify higher claims. Final cards, immutable runtime/verification reports and an actual AI-reviewed synthetic successor card are recorded in the [closeout](../docs/evaluation/AA8_AA9_ENGINEERING_CLOSEOUT_20261107.md).

- [x] Record local versioned cards, intended/prohibited use, composition, metrics/unknowns, failures, monitoring, rollback and expiry/retest conditions. External claim publication remains deferred.
- **Verify:** independent technical, domain, privacy, fairness, and product reviewers approve every public claim against the locked report.

#### AA086: Promote only the achieved claim level

**Dependencies:** AA085; **Likely files:** claim registry, product copy, feature flags, rollout/monitor plan; **Scope:** M

- [x] **Monitor software, 2026-11-07:** Complete finite/fresh signal checks, expiry/drift/revocation/complaint/correction/latency/cost/fairness/error stop and previous-version rollback proposals implemented and tested. No feature flag, production claim or deployment was promoted.

- **Deferred release (owner):** Release only the first domain/locale/formats that passed, with monitoring, drift thresholds, stop conditions, and rollback.
- **Verify:** unsupported segments remain labeled; regression, evidence-quality, complaint/correction, latency, cost, and fairness monitors are active.

#### Gate AA8: Domain-valid claim

- [x] **Current prerelease engineering gate:** AA080–AA086 software/workflows, technical cross-reviews and applicable local verification are complete under ADR-0018. [Closeout](../docs/evaluation/AA8_AA9_ENGINEERING_CLOSEOUT_20261107.md).

**Deferred empirical/claim gate:** The original requirements below remain prerequisites for their real-world claims, rather than reviewer-team blockers for current engineering.


- [ ] Every required segment meets the approved lower confidence bound and independent reviewers approve construct validity and exact claim language.
- [ ] Only after this gate may copy use the approved scoped domain-level claim; “all industries” remains unsupported until each claimed segment passes.

### Phase AA9: Recruiter and vendor calibration pilot [PRERELEASE ENGINEERING COMPLETE / VERIFIED 2026-11-07]

**Current acceptance achieved:** Per ADR-0018, the complete advisory protocol, comparison/observation interfaces, corrections/appeals, retention/audit and stop/rollback workflows are implemented and verified with synthetic data and actual subagent technical review. Actual customer/named-vendor/recruiter runs and owner launch review are deferred to demo/RC/pre-launch; no public vendor/selection claims are promoted.

#### AA090: Design transparent recruiter calibration

**Dependencies:** AA8, A5 prerequisites; **Likely files:** pilot protocol, rubric contract, notice/correction policy, legal review; **Scope:** M

- [x] **Protocol software, 2026-11-07:** Strict advisory protocol and receipt-bound evidence assessment implemented, with a sole-owner/AI prerelease path and a separately guarded future external path. All 26 integrated contract tests pass; independent AI source review passed. Operational controller integration passes 17 tests, including async authority/expiry checks; independent AI review passed. Full workflow verification passes all 11 local pilot controls; customer/vendor runs remain owner-deferred.

- [x] Implement employer rubric inputs, visibility, override/rationale, candidate notice, correction/appeal, retention, audit and prohibited automatic rejection for the synthetic prerelease workflow.
- **Verify:** legal, fairness, security, privacy, domain, and product owners approve pilot scope, stop conditions, and human-decision boundary.

#### AA091: Run one named-vendor ingestion comparison

**Dependencies:** AA090, named authorized environment; **Likely files:** comparison protocol, synthetic/consented fixtures, observations, report; **Scope:** M

- **Deferred named-vendor run (owner, ADR-0018):** Compare one named vendor/version/configuration on permitted documents and defined ingestion behaviors without reverse-engineering proprietary scores.
- **Verify:** repeatable observations, limitations, configuration/version, dates, errors, and raw evidence support only the named compatibility statement.

#### AA092: Run one career-center or recruiter pilot

**Dependencies:** AA090, optional AA091; **Likely files:** pilot plan, participant records, outcome rubric, pilot report; **Scope:** M

- **Deferred customer/recruiter run (owner, ADR-0018):** Run an allowlisted advisory pilot measuring rubric agreement, corrections, user comprehension, workflow usefulness, fairness/error, safety, latency, and cost.
- **Verify:** independent review approves scoped findings; no hidden score, automatic decision, general vendor equivalence, or selection-probability claim is enabled.

#### Gate AA9: Scoped recruiter/vendor evidence

- [x] **Current prerelease engineering gate:** AA090–AA092 software/workflows, technical cross-reviews and applicable local verification are complete under ADR-0018. [Closeout](../docs/evaluation/AA8_AA9_ENGINEERING_CLOSEOUT_20261107.md).

**Deferred empirical/claim gate:** The original requirements below remain prerequisites for their real-world claims, rather than reviewer-team blockers for current engineering.


- [ ] Pilot evidence supports only the named domain, locale, vendor/configuration, and workflow; ongoing monitoring, appeals, human oversight, and rollback are operational.

