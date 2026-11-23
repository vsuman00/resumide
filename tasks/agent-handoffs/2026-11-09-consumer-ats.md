# Consumer validation: ATS, JD and authoring

Date: 2026-11-09. Reviewer: backend agent, licenses worktree. Root main/a0b239299d75b0bd64b588fe743ebe2975fb28b9 plus its dirty source is authoritative. Pricing remains deferred. This round changed only this handoff and isolated review artifacts; no application source, threshold, provider, database or service changed.

## Observed results

| Check                                  | Actual result                                                                                                                                         | Evidence tier                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Existing scoring engineering benchmark | Exit 0; nine segments, 180 deterministic repetitions; engineering passed, release failed/open. Maximum observed segment p95 was 1.645 ms on this run. | Known synthetic pure diagnostics, no representative accuracy or employer ATS comparison.        |
| Existing writer engineering benchmark  | Exit 0; 11 adversarial cases, injected adapters; engineering passed, release failed/open; zero real provider calls.                                   | Deterministic canonical-pattern and injected-adapter checks.                                    |
| Independent counterfactual driver      | Exit 1; 39 assertions: 32 passed, seven failed. Five expose unsafe writer proposals; two expose alias-discovery limitations.                          | Pure functions with independent known-truth mutations.                                          |
| Downstream proposal probes             | Exit 1; both valid source-ID/schema paths retained the unsupported revenue claim. Server schema rejected absent/false acceptance confirmation.        | Injected transports through actual rewrite/qualitative functions; no live model or DB mutation. |

The failures remain in the receipts. No assertions, expected values, release floors or production thresholds were changed to obtain a pass.

## P2: unsupported AI wording can be labelled grounded

The source `Built a dashboard.` does not support doubled revenue, team leadership, avoided outages or Pydantic experience. Nevertheless, `groundWriterSuggestions` retained each corresponding lowercase rewrite and retained a summary asserting global-team leadership. It correctly removed an invented digit metric, known Python skill, proper-name employer and a metric borrowed from another contribution.

`app/lib/server/writer-grounding.ts:77` checks known taxonomy terms, digit tokens and capitalized/proper-name tokens. New lowercase factual claims and skills outside that taxonomy escape those checks. `generateGroundedRewrite` with a valid `sourceId`, and `runQualitativeAi` with a valid structured envelope, both retained a rewrite asserting doubled revenue from a source about an internal dashboard. A source citation proves where a passage came from; it does not prove the proposed new claim.

The caller chain matters. `app/lib/server/rewrite-ai.ts:115` and `qualitative-prose.ts:38` use the vulnerable guard. `rewrite-service.ts:300` records retained output with state `grounded`, then saves it to the writer draft after ownership/source checks. `app/components/ResumeWriter.tsx:64` labels it “Grounded suggestions” and “Rewrite with evidence”; its introduction claims the suggestions are grounded in uploaded evidence. The same component asks users to review accuracy and offers Copy buttons. No additional semantic validator exists in that legacy display/save chain.

This is unsafe and misleading proposal leakage, not evidence that the app automatically invents an accepted resume. Current v2 evidence analyses redirect away from that legacy display (`app/routes/resume.tsx:120`). The rewrite and qualitative paths reject uncalibrated v2 evidence through `hasUncalibratedEvidence`. V2 `loadAuthoring` builds deterministic patches from candidate-confirmed facts; it does not ingest the legacy writer draft. Acceptance requires `confirmation: true`, exact reconstruction and current version checks in TypeScript and SQL. Unconfirmed canonical edits cannot export. These protections passed the pure checks or were confirmed in the server/SQL source; no database execution is claimed here.

Recommendation: close this grounding contract gap before enabling or advertising the affected writer flow. Use a bounded source-fact reconstruction or another conservative support rule that rejects newly introduced candidate claims, including lowercase/spelled-out outcomes and skills outside the current taxonomy. Preserve candidate confirmation and the independent canonical/export gates. A warning alone would not make the “grounded” label true. No fix was applied in this report-only allocation.

## JD and scoring observations

Exact TypeScript discovery, Java-versus-JavaScript boundaries, company/benefit exclusion followed by resumed requirement discovery, independent year clauses, negation and exact Unicode source spans passed. Repeated skills/JD clauses did not improve alignment credit. A listed skill stayed confirmation-required, and an absent Kubernetes requirement stayed `not_evaluated` rather than inventing a failure when absence is not established. Missing-page coverage was 0.5 and all authoritative dimension values stayed withheld.

`JS` and `Postgres` alone produced no skill requirement, while their canonical labels were discovered. The independent case names say “approved taxonomy alias,” but that was an overbroad test label: the repo's general matching taxonomy lists these aliases; the current JD parser deliberately uses exact `SOFTWARE_SKILLS` vocabulary. `tasks/accuracy-authoring-plan.md:133` explicitly says no taxonomy release is adopted. Treat the two failures as visible coverage gaps against desired alias behavior, not proof that the app violated an accepted universal-synonym contract or emitted an incorrect authoritative score. Alias/taxonomy discovery should retain exact evidence and versioned mappings when added.

## Authoring and export protections

Pure checks passed for an exact source-bound ready patch, immutable edit lineage and preservation of the original, unconfirmed status after editing, stale-patch rejection, undo as a new version, rejection of a tampered invented patch, and export blocking for an unconfirmed edit. Export observation checks rejected extra claims, missing text, order corruption, wrong link anchors and clipping. The passing synthetic observation used sentinel bytes solely to test the comparison function; it was not an actual rendered or parsed PDF.

Transactional concurrent accept/undo, hosted persistence, actual PDF/DOCX rendering, browser journey, real model quality and external ATS behavior are outside this pure-agent result. The existing `verify-authoring.ts` and `verify-artifact-export.ts` create managed fixtures, so they were inspected but not executed in this allocation. Root/frontend/sandbox evidence must supply those separate tiers where authorized.

## Execution and source binding

Node `v22.23.4`; root Vite Node runner. Both benchmark commands used root `vitest.config.ts`, whose private mode disables dotenv. The independent drivers used the owned `driver.config.ts` with `envDir: false`, an owned cache and explicit root imports. A whitelist environment supplied only PATH, private synthetic mode, `AI_ENABLED=false`, a fake API key, a local origin and `NODE_ENV=test`; the drivers also replaced `fetch` with a rejection. Enabling the pure function argument for an injected transport did not activate a real provider.

Exact argv, environment, stdout, stderr and exit codes are in the execution receipts. Output writes were confined to [the owned artifact directory](2026-11-09-consumer-ats). The first counterfactual launch failed because root Vite blocked loading an outside-worktree driver; that failed receipt is retained. Adding an owned config with explicit filesystem allowances fixed only the harness. The subsequent semantic failures remain unfixed.

- [Scoring result](2026-11-09-consumer-ats/scoring-benchmark.json) and [execution](2026-11-09-consumer-ats/scoring-execution.json).
- [Writer result](2026-11-09-consumer-ats/writer-benchmark.json) and [execution](2026-11-09-consumer-ats/writer-execution.json).
- [39-case results and source hashes](2026-11-09-consumer-ats/counterfactual-results.json), [driver](2026-11-09-consumer-ats/counterfactuals.ts), [execution](2026-11-09-consumer-ats/counterfactuals-execution.json) and [initial harness failure](2026-11-09-consumer-ats/counterfactual-initial-load-failure.json).
- [Downstream results and caller source hashes](2026-11-09-consumer-ats/downstream-results.json), [driver](2026-11-09-consumer-ats/downstream.ts) and [execution](2026-11-09-consumer-ats/downstream-execution.json).

Each result binds the current source files it assessed. Root owns the integrated full-source manifest and static/unit/type/build outcome. Broad application suites were not duplicated here. Final Markdown, prose and scoped whitespace checks are recorded in the review manifest.

## Added role-specific coverage: Python AI Engineer

A separate fresh neutral JD and partial synthetic Python backend resume were tested after the review above. No supplied candidate or company text was reused. [Driver](2026-11-09-consumer-ats/python-ai-coverage.ts), [source-bound result](2026-11-09-consumer-ats/python-ai-coverage-results.json) and [exact execution receipt](2026-11-09-consumer-ats/python-ai-coverage-execution.json) are separate from the original 39-case and downstream receipts.

The new command exited 0: nine checks passed. All 21 requested vocabulary strings were discovered with exact JD evidence: Python, FastAPI, Flask, Object-Oriented Programming, OOP, Pydantic, microservices, LLMs, RAG, embeddings, vector databases, AI agents, agent orchestration, NoSQL, Redis, asynchronous programming, async/await, Git, AWS, GCP and REST APIs. This counts vocabulary strings, including overlapping labels such as OOP and Object-Oriented Programming; it is not a count of distinct qualifications satisfied. No requested vocabulary was missing in this case. Irrelevant company revenue and company-only Azure/Java mentions were excluded.

| Known partial resume evidence                                                                                    | Observed handling                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Python, REST APIs and Git listed, with a Python/FastAPI contribution                                             | Proposed state remains `candidate_confirmation_required`; listed skills do not automatically prove proficiency or dated experience.                                                                                                                                             |
| FastAPI present; the JD says FastAPI or Flask                                                                    | Both terms are discovered, but the alternative is flagged for review rather than requiring the candidate to satisfy both independently.                                                                                                                                         |
| OOP, Pydantic, microservices, AI/retrieval/agent, database/cache, async and cloud skills absent from the fixture | `not_evaluated`, with an explanation that reliable matching evidence was not recovered. These are evidence gaps to review, not proven ATS mismatches.                                                                                                                           |
| Explicit 1-4-year requirement                                                                                    | Minimum 1 recovered; `experience_upper_bound_review` preserves the unresolved upper bound. The fixture has 36 non-overlapping general software months through its explicit synthetic role/date associations, but the engine does not claim to validate this ranged requirement. |
| All authoritative dimensions                                                                                     | Values remain null and ineligible; published alignment states remain `not_evaluated`. No score, probability or external ATS accuracy claim follows.                                                                                                                             |

Concrete safe JD-guided improvements for this partial resume:

- Put the evidenced Python, FastAPI, REST API and Git work first. The source-preserving rewrite “Developed Python REST APIs with FastAPI and Git.” passed the wording guard. It adds no scale, outcome, employer or technology and does not imply a score improvement.
- Ask what endpoints, validation, testing and debugging the candidate actually implemented, then add only confirmed details. FastAPI use alone does not prove Pydantic expertise or async/await work; REST API work alone does not establish independently deployed microservices.
- For RAG/LLMs, embeddings/vector retrieval and agents, request a concrete confirmed project, implementation role and retrieval/agent workflow before adding those skills. For NoSQL/Redis or AWS/GCP, ask which actual store/cache or cloud service the candidate used and what they did. If there is no experience, present learning/project suggestions separately from the resume rather than filling its Skills section.
- Confirm actual software role dates and associations for the experience requirement; do not infer skill-specific tenure from total employment. Keep the 1-4-year upper-bound question visible. Ask for truthful outcomes where useful, without requiring a number or borrowing the company's revenue.

This addition used the same Node 22 whitelist/private environment, owned Vite configuration and fetch denial. It made no network, database, provider, application or shared-build change. The earlier seven semantic failures and their receipts remain intact. The appended checks do not repair the grounding defect or establish representative/domain validity.

## Added local-only owner PDF check

The previously authorized owner file was checked locally without uploading it or retaining its extracted content. File size: 130,556 bytes. SHA-256: `bc75aae9adcfcb87980f4c3ade75ab075b9f9a3a0fc36e05e31bf0750a2989c5`. Its bytes remained unchanged.

The final sealed command exited 0. Native extraction found one text-profile page, 3,778 extracted characters and 3,278 non-whitespace characters; the page exceeded the parser's eight-character native-text threshold. OCR was not required by that threshold and was not executed. No visual rendering or screenshot was produced. This is native-text availability evidence, not visual/text completeness or OCR accuracy validation.

Name, email, phone, location and link presence checks returned true; their values were never printed or retained. The parser detected six sections: summary, experience, education, skills, projects and publications. A standalone certifications heading was not detected. Evidence produced 53 spans, 12 assertions and 56 canonical facts in memory. Its aggregate critical-field states were four review-required, one not evaluated and three conflict states; these observations have no manually labelled truth set and do not establish field accuracy or prove that distinct career entries are errors.

Evidence stayed `review_required` and uncalibrated, with `scoringEligible=false`. All authoritative scoring dimensions remained withheld. No canonical fact was automatically candidate-confirmed. There was no JD/provider request, database/storage write, corpus registration or general reuse of the file.

[The owned driver](2026-11-09-consumer-ats/owner-local-pdf-check.ts) ran under macOS operating-system network denial and suppressed library output before candidate bytes were read. The final input was an inherited read-only descriptor, so its personal path was absent from argv and receipts. [Aggregate result and source hashes](2026-11-09-consumer-ats/owner-local-pdf-results.json) and [execution receipt](2026-11-09-consumer-ats/owner-local-pdf-execution.json) contain no candidate values or raw text. The raw stderr channel was empty. Earlier stdin harness attempts did not yield usable extraction and are retained separately; they were harness failures, not findings that this PDF is invalid. The successful descriptor run was the final personal-file execution.

This is one-off current-owner-file evidence. It supplies neither representative-corpus validity nor an external ATS or hiring claim. Earlier synthetic results and reproduced grounding failures are unchanged.
