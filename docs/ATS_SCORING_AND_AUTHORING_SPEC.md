# Spec: Evidence-grounded scoring and job-specific resume authoring

Status: **AA0 DESIGN ACCEPTED 2026-10-04; LOGICAL CONTRACTS FROZEN IN ADR-0009; AA1 IMPLEMENTATION PROVISIONAL; CALIBRATION/RELEASE GATES OPEN**
Module family: `document-evidence`, `job-intelligence`, `scoring-evaluation`, `resume-authoring`, `verified-rendering`
Research basis: [`ATS_SCORING_AND_AUTHORING_RESEARCH.md`](ATS_SCORING_AND_AUTHORING_RESEARCH.md)

AA0 accepted contract: [`ADR-0009`](decisions/0009-aa0-truth-contract-and-evaluation-design.md), candidate 1 at `e629a2882b3cc14a63771ae400f4f67a7e4f3f62`, explicitly approved by the workspace owner on 2026-10-04. It freezes score semantics, logical contracts, annotation/governance design, local-only OCR evaluation and software engineering / English / India scope. Runtime implementation, calibration and release validity remain separately verified gates; historical proposal text below must be read with this accepted decision.

## 1. Objective

Build a candidate-first workflow that can:

1. Faithfully extract native-text, scanned, and mixed resumes with visible provenance and uncertainty.
2. Convert the verified information into a canonical, editable resume document.
3. Interpret a supplied job description into required, preferred, and contextual requirements with exact source evidence.
4. Produce separate deterministic `ATS Compatibility` and `Job Alignment` results.
5. Explain blockers and rank the highest-impact truthful improvements.
6. Let the candidate edit the resume line by line on the result page, accept/reject AI drafts, answer missing-fact questions, undo changes, and compare versions.
7. Generate PDF and DOCX first, then LaTeX and compiled PDF, and verify every export by parsing it again.

Success means the candidate can understand and improve a job-specific application without being misled about an employer's hidden ATS configuration or having facts invented on their behalf.

## 2. Assumptions

1. Candidate/student B2C remains the first product mode.
2. Recruiter/career-center calibration is a later mode behind separate human, legal, fairness, and security approval.
3. The exact job description is the primary job-specific source.
4. The original uploaded file is immutable; edits create new canonical resume versions and generated artifacts.
5. A low-cost model may draft or classify, but no model owns the authoritative numeric score.
6. A score is withheld when the evidence needed to calculate it is unreliable.
7. Existing synthetic tests remain useful regression evidence but do not establish external validity.

## 3. Non-goals

- Guaranteeing an interview, shortlist, or employer ATS passage.
- Claiming exact emulation of Workday, Greenhouse, Oracle, Taleo, Lever, iCIMS, or another proprietary system without controlled vendor-specific evidence.
- Adding unsupported skills, metrics, responsibilities, titles, employers, education, or certifications.
- Automatically applying on behalf of the candidate.
- Employer-side automatic rejection or autonomous hiring decisions.
- Scraping job boards where terms, robots policies, or licenses do not permit collection.
- Treating a generic LLM prior as evidence of current market frequency.

## 4. Capability map

| Module ID               | Responsibility                                                                                         | Depends on                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `document-evidence`     | Native extraction, selective OCR, geometry, reading order, quality, provenance, candidate verification | `resume-ingestion`, `analysis-orchestration`                |
| `canonical-resume`      | Structured fields, confirmed facts, immutable revisions, source links, change ledger                   | `document-evidence`, `persistence-history`                  |
| `job-intelligence`      | Requirement extraction, required/preferred classification, O*NET/ESCO mapping, dated market evidence   | `persistence-history`                                       |
| `scoring-evaluation`    | Deterministic score dimensions, confidence/gating, ruleset versions, benchmark and calibration         | `document-evidence`, `canonical-resume`, `job-intelligence` |
| `resume-authoring`      | Same-page editor, question flow, grounded drafts, accept/reject/undo, projected and actual deltas      | `canonical-resume`, `scoring-evaluation`, `qualitative-ai`  |
| `verified-rendering`    | ATS-safe templates, PDF/DOCX/LaTeX generation, sandboxed compile, parse-back parity                    | `canonical-resume`, `document-evidence`                     |
| `recruiter-calibration` | Recruiter-defined weights/requirements, human review, audit, fairness evaluation                       | all above, `enterprise-administration`, `privacy-security`  |

Build order:

`document-evidence` → `canonical-resume` + `job-intelligence` → `scoring-evaluation` → `resume-authoring` → `verified-rendering` → `recruiter-calibration`.

`recruiter-calibration` is deferred until the candidate product passes the real-world validity gate.

## 5. User-visible score contract

### 5.1 Evidence Confidence

Evidence Confidence is a gate, not a measure of candidate quality. It reports whether the system has sufficient document and job evidence to calculate other results.

States:

- `verified`: candidate-confirmed critical fields and extraction quality pass the active policy.
- `high`: automatic evidence passes the active policy; confirmation is optional.
- `review_required`: one or more critical fields/pages require candidate correction.
- `insufficient`: scoring is withheld.
- `unsupported`: the document or language is outside the released capability.

The UI must never convert `review_required`, `insufficient`, or `unsupported` into a low candidate score.

### 5.2 ATS Compatibility

A deterministic 0–100 index of cross-system document compatibility under the released ruleset. It covers only observable document and parsing properties:

- Required contact and section detectability.
- Page completeness and text availability.
- Reading-order stability.
- Dates, role/employer grouping, bullets, links, and standard section semantics.
- Columns, tables, text boxes, headers/footers, images, hidden/overlaid text, and font/encoding risks.
- Export parse-back parity.

It does not measure candidate qualification. Rules that cannot be evaluated are excluded and reported; they do not earn free points.

### 5.3 Job Alignment

A deterministic 0–100 index of how strongly verified resume evidence covers the supplied public job requirements under a versioned job/occupation profile.

Requirement states:

- `satisfied`: direct verified evidence supports the requirement.
- `partially_satisfied`: related evidence exists but does not fully establish scope, duration, or proficiency.
- `candidate_confirmation_required`: a plausible mapping exists but lacks verified evidence.
- `not_evidenced`: no supporting resume fact exists.
- `not_applicable`: excluded by an approved clarification.
- `not_evaluated`: evidence or classifier confidence is insufficient.

Rules:

- Required and preferred requirements are scored separately.
- Recruiter-authored importance overrides inferred importance when recruiter calibration is permitted.
- Exact matches, approved aliases, and semantic mappings are distinct evidence types.
- Synonyms and repeated terms cannot receive duplicate credit.
- Skills listed without experience evidence remain visible as weaker evidence rather than being treated as proven proficiency.
- Years, dates, education, certifications, authorization, and location are evaluated by typed rules rather than keyword counts.
- Unknown or ambiguous requirements are shown to the candidate and do not silently become failures.

### 5.4 Application Readiness

An optional candidate-facing summary may be introduced only after product research proves users can understand the component scores. If used, it must:

- Be labelled `Application Readiness`, never `the employer ATS score`.
- Be computed deterministically from approved component policies.
- Display its component values and confidence.
- Never be shown when Evidence Confidence is insufficient.
- Never be presented as a probability of interview or hire without outcome calibration and legal approval.

### 5.5 Writing quality

Writing diagnostics remain separate from ATS Compatibility and Job Alignment. They may report evidence-backed checks such as weak openers, unclear ownership, excessive length, duplicated phrases, missing scope, or missing outcome. No generic requirement says every bullet must contain a number.

## 6. Extraction and evidence contract

The extraction pipeline operates page by page:

1. Validate and quarantine the file.
2. Render every page deterministically.
3. Extract the native text layer with positions where available.
4. Detect missing, sparse, corrupt, duplicated, hidden, or conflicting text.
5. Run OCR only on pages/regions that require it and only under approved consent, region, retention, cost, and provider policy.
6. Reconcile native and OCR candidates without discarding disagreements.
7. Infer reading order and structured fields.
8. Store evidence spans, polygons, page identifiers, method, provider/version, and confidence.
9. Present uncertain critical fields for candidate verification.
10. Block scoring until the active evidence policy is satisfied.

Every extracted field must support an audit path:

```text
structured field
  → normalized value
  → source text span
  → page and polygon
  → extraction method/version
  → confidence and warnings
  → candidate confirmation or correction
```

Provider confidence is not accepted as calibrated truth. Each provider's confidence must be calibrated against the Resumide corpus before threshold use.

## 7. Canonical resume document

The canonical resume is structured data, not LaTeX, HTML, DOCX, or PDF. Minimum model:

- Identity/contact and links.
- Target title and summary.
- Experience roles with employer, title, location, dates, bullets, and verified facts.
- Education, projects, skills, certifications, publications, awards, volunteering, and configurable sections.
- Source evidence and confirmation state for every factual field.
- Stable IDs for sections, entries, bullets, and facts.
- Immutable version parent, author, reason, timestamps, and accepted suggestion IDs.
- Template-independent ordering and visibility settings.

The uploaded original remains immutable. Editing creates a child version. Generated documents record the canonical version and renderer/template versions.

## 8. Job-intelligence contract

The job-description parser produces typed requirements with exact JD evidence:

```text
requirement id
type: skill | experience | education | certification | responsibility | location | authorization | other
importance: required | preferred | contextual | unknown
normalized concept ids
minimum/target values where explicitly stated
source span
confidence
derivation: exact | taxonomy | model_proposed | recruiter_confirmed
```

The LLM may propose structure and taxonomy mappings. Deterministic validation must ensure every requirement is grounded in a JD span. Low-confidence importance/mapping decisions remain visible and do not silently change the score.

Market trends are a separate optional dataset. Every trend carries source, license, captured date, geography, seniority, occupation mapping, sample size, query version, and expiry. Model memory alone cannot populate this dataset.

## 9. LLM boundary and truthfulness

Permitted model tasks:

- Propose JD structure and taxonomy mappings for validation.
- Explain deterministic findings in candidate-friendly language.
- Draft alternate summaries/bullets from verified facts.
- Generate clarification questions for missing result, scale, method, or context.
- Classify candidate-approved facts into a writing framework.

Prohibited model authority:

- Setting or changing authoritative numeric scores.
- Inventing or estimating candidate facts for final content.
- Declaring current market frequency without retrieved evidence.
- Silently adding a missing keyword as if it were experience.
- Treating model confidence as product confidence.
- Editing accepted resume content without a candidate-visible change record.

Every draft must include source fact IDs. A post-generation verifier rejects unsupported numbers, proper nouns, skills, employers, dates, certifications, causal claims, and scope. If stronger wording needs new evidence, the product asks a question and stores the answer as an unconfirmed fact until the candidate verifies it.

## 10. Same-page authoring experience

The durable result route becomes a workspace with synchronized panels:

- Resume preview and editable structured outline.
- Findings grouped by blocker, high-impact fix, missing evidence, and reliable strength.
- Exact source highlighting for each finding.
- Original/suggested diff with explanation and affected requirements/rules.
- Accept, edit, reject, ask for another version, and undo.
- Projected score impact labelled as an estimate; actual deterministic delta appears only after rescoring the accepted version.
- Version comparison and restore-as-new-version.
- Export controls and parse-back verification status.

The original uploaded PDF is never modified in place.

### 10.1 Four-level guidance contract

The user's existing job-specific resume prompt becomes a presentation and drafting contract, not the scoring engine. The result page should generate these sections from versioned finding objects:

1. **Resume state:** target role, analyzed resume version, job-description version, extraction/evidence status, and score-policy version.
2. **Blockers:** only failed or unsafe items that can prevent reliable parsing or leave an explicit required job criterion unsupported.
3. **Top five high-impact improvements:** at most five ranked, line-linked changes with rationale, evidence, effort, and projected deterministic effect. “Five” is a display limit, not a claim that exactly five issues exist.
4. **Reliable strengths and missing evidence:** separate verified strengths from requirements/facts that are absent, ambiguous, or require candidate confirmation.

The score panel uses a versioned response schema. A model may replace narrative placeholders with grounded explanations, but it may not replace numeric placeholders with model-generated scores, change score-band meanings, or omit unknown/unsupported states. The server assembles all numeric fields from deterministic score results.

## 11. Bullet-writing contract

XYZ is one supported pattern:

> outcome (X), evidence/measurement (Y), method/action (Z)

Other supported patterns include action–scope–result, challenge–action–result, technical contribution, and research/academic contribution.

Rules:

- Prefer verified results and scope over adjectives.
- A number is never mandatory when no truthful measurement exists.
- Estimates may be used only in the private clarification UI and can enter resume content only after candidate confirmation.
- Job vocabulary may be used only when supported by a verified fact.
- Each bullet should express one primary contribution; visual line count is evaluated only after rendering.
- Industry/domain packs may vary writing checks when documented and benchmarked.

## 12. Verified rendering and LaTeX

Renderers consume only the canonical resume and approved template configuration.

Required initial sequence:

1. Semantic HTML preview.
2. ATS-oriented PDF renderer.
3. DOCX renderer.
4. LaTeX source renderer and sandboxed compiler.

Every generated artifact is parsed again. Verification compares expected critical fields, text coverage, order, links, dates, and section boundaries. A failed comparison produces `export_verification_failed`; the artifact is not labelled ATS-verified.

LaTeX-specific controls:

- Allowlisted templates, packages, commands, and fonts.
- Escaping for all user-controlled content.
- No shell escape, network, host filesystem, arbitrary includes, or uncontrolled package installation.
- CPU, memory, file, process, page, and wall-time limits.
- A4 and US Letter variants.
- Template suitability by candidate profile rather than one fixed technology/student structure.
- Tagged/accessibility support evaluated before an accessible-PDF claim.

**Standalone converter scope (owner approved 2026-10-30):** ADR-0016/E-007 permits an independent LaTeX editor→PDF preview/download page. It consumes supported user source rather than canonical resume data and never calls the analyzer or creates `artifact-verification/1.0.0` records. Source/PDF are transient. Known synthetic recovery checks and output safety do not establish canonical truth, ATS compatibility or accessibility certification. This separate category does not change existing canonical renderer/verified-artifact contracts or their release floors.

## 13. Data additions

Target entities, names subject to migration review:

- `document_pages`, `evidence_spans`, `extraction_candidates`, `field_assertions`.
- `canonical_resumes`, `canonical_resume_versions`, `resume_sections`, `resume_entries`, `resume_facts`.
- `job_requirements`, `requirement_mappings`, `occupation_profiles`, `taxonomy_releases`.
- `score_policies`, `score_runs`, `score_dimensions`, `score_findings`.
- `authoring_suggestions`, `clarification_questions`, `candidate_answers`, `change_events`.
- `render_templates`, `rendered_artifacts`, `artifact_verifications`.
- `evaluation_corpora`, `evaluation_documents`, `annotations`, `evaluation_runs`.
- `recruiter_calibrations` only after the enterprise gate.

Resume/JD text and model prompts remain prohibited in general application logs and metrics.

## 14. Testing and evaluation strategy

### Test levels

- Unit: normalization, typed requirements, score arithmetic, confidence gates, escaping, diff application.
- Contract: OCR/document provider, taxonomy release, LLM structured output, renderer/compiler.
- Integration: evidence persistence, immutable versions, rescoring, export verification, ownership and deletion.
- Property/metamorphic: whitespace, page order, equivalent dates, aliases, demographic-name substitutions, repeated keywords, prompt injection.
- Browser: verify/correct extraction, edit/accept/reject/undo, version comparison, low-confidence blocking, export failure.
- Benchmark: native extraction, OCR, structured fields, JD requirements, evidence citations, score stability, writing truthfulness, rendering parity.
- External: controlled ATS/vendor sandbox or partner evaluation before vendor-specific claims.

### Corpus design

- Only consented, licensed, synthetic, or irreversibly anonymized data with documented permitted use.
- Stratify by occupation, seniority, geography, language, document type, layout, scan quality, and accessibility.
- Maintain separate development, calibration, and locked test partitions.
- Use at least two independent annotators for critical labels and adjudicate disagreement.
- Report document-level bootstrap confidence intervals and per-segment results; do not hide a failing segment in an aggregate.
- Determine final sample sizes through a documented power/precision analysis. As an initial planning floor, approximately 203 independent documents per released segment are needed to estimate a 95% binomial success rate within about ±3 percentage points at 95% confidence; correlated field observations require document-level analysis rather than pretending every field is independent.

### Claim ladder

- `Regression-tested`: synthetic fixtures only.
- `Corpus-validated`: locked representative corpus and confidence intervals pass.
- `Domain-validated`: one occupation/domain pack passes its segment gates.
- `Vendor-observed`: controlled test on a named ATS/version passes.
- `Outcome-calibrated`: approved prospective study supports a clearly defined outcome claim.

The UI and marketing copy may use only the highest claim level actually achieved.

## 15. Commands

Current repository commands:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run benchmark:phase5
npm run test:e2e
npm run test:a11y
npm run build
```

Planned commands that must be implemented before the corresponding gates can be enforced:

```bash
npm run benchmark:extraction-v2
npm run benchmark:job-intelligence
npm run benchmark:scoring-validity
npm run benchmark:writer-grounding
npm run benchmark:render-parity
npm run benchmark:fairness
npm run verify:accuracy-v2
```

## 16. Boundaries

### Always

- Preserve source evidence and versions for every score and accepted edit.
- Show uncertainty and withhold unsupported scores.
- Keep numeric scoring deterministic and ruleset-versioned.
- Require candidate approval for new or changed factual content.
- Report benchmark limitations and disaggregated results.

### Ask first

- Select an OCR/document provider or send resume data to a new subprocessor.
- Approve score weights, thresholds, labels, or product claims.
- Add a new occupation/domain pack.
- Add dependencies, migrations, renderers, or compiler infrastructure.
- Collect real resume/job data or begin recruiter/vendor pilots.
- Enable any employer-facing ranking or selection use.

### Never

- Invent candidate facts or silently insert unsupported keywords.
- Call a candidate-facing index the exact employer ATS score.
- Score an extraction known to be incomplete or unreliable.
- Train or evaluate on resume data without documented permission and retention.
- Use protected attributes or obvious proxies as positive/negative scoring features.
- Compile untrusted LaTeX without isolation and strict resource controls.
- Treat documentation, a build pass, or synthetic fixtures as external validity evidence.

## 17. Success criteria

- The score UI exposes ATS Compatibility, Job Alignment, and Evidence Confidence without conflation with LLM opinion.
- Every scored finding and matched requirement has an inspectable evidence path.
- Identical inputs and versions produce identical numeric results.
- Scoring is withheld for low-confidence critical evidence.
- Candidate edits create immutable versions and a complete accept/reject/undo ledger.
- Unsupported facts cannot reach an accepted generated version through the normal workflow.
- Every generated artifact passes parse-back parity before receiving a verified label.
- At least one occupation/domain pack passes the approved representative-corpus gates before an industry-level claim.
- Vendor-specific language appears only after controlled evidence for the named vendor/version.
- Employer mode remains inaccessible until separate fairness, legal, security, notice, and human-oversight gates pass.

## 18. Decision register after AA0 approval

1. Approved first domain: software engineering; other domains remain unsupported until separately validated.
2. Approved validation segment: English / India-focused resumes; release support still requires the segment gates.
3. Approved UI semantics: two scores plus Evidence Confidence, no aggregate Application Readiness in initial scope.
4. The approved scoring dimensions and weights after corpus/panel calibration.
5. Approved evaluation design: local Tesseract/native comparison, synthetic-only, no external OCR spend or new paid infrastructure; actual host feasibility is required before execution.
6. Approved format sequence: PDF/DOCX export first; LaTeX deferred behind separate compiler/isolation gates. PDF input scope is distinct from exports.
7. Who may contribute real/anonymized evaluation documents and who adjudicates labels.
8. Whether recruiter calibration is a career-center pilot first or an employer pilot.
