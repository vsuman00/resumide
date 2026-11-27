# ATS remediation plan: one consistent, evidence-backed result

**Status:** IMPLEMENTED 2026-11-26; owner decisions ATS-D1, D3, D5, D6 and D7 approved and implemented 2026-11-27 (see todo.md) (R-01 to R-11, R-13 and the R-14 test wiring; not committed). R-12 is documented and waits on ATS-D6; DOCX upload waits on ATS-D5. Final acceptance results are in [`todo.md`](todo.md). Follows the ATS accuracy plan ([`ats-match-plan.md`](ats-match-plan.md)) and the live verification recorded in [`todo.md`](todo.md) (ATS-07 to ATS-16).
**Goal:** every number, label, summary point and downloaded report on the analysis page gives the same answer, and each answer can be traced to text in the resume and the job description (JD).
**Approach:** one integrated change set (R-01 to R-14), with all its tests written alongside it. It is verified once at the end against the acceptance protocol in section 6, not piecemeal.

## 1. What testing found (2026-11-26)

Live testing on the Resumide project, with a synthetic seed and one owner-approved real resume, confirmed that the JD match items are correct (25 of 25 matched a hand check). It also found problems in how the page and report present them, plus gaps that still need fixing.

| #   | Finding                                                                                                                                    | Where                                                                     | Effect on the user                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| F1  | The downloadable evidence report has no Parse health, JD match or minimum-qualification results                                            | `buildEvidenceReport` in `app/routes/resume.tsx`                          | The report disagrees with the page                                  |
| F2  | Overview "Strengths" and "Items to improve" count only feedback tips                                                                       | `resume.tsx` (`strengthCount`, `improvementCount`, `repairQueue`)         | Shows "0 items to improve" while minimum qualifications are missing |
| F3  | The legacy "Keyword coverage" box shows its own "% matched"                                                                                | `app/components/Heatmap.tsx`                                              | Two different match numbers on one page                             |
| F4  | The legacy blended score is still shown beside the two results                                                                             | `resume.tsx` score header                                                 | Reads as a job-fit score; it is not one                             |
| F5  | The subject of a years requirement ("3+ years of software development") also becomes a separate phrase requirement                         | `matching/requirements.ts`                                                | Double counts one qualification                                     |
| F6  | The degree field ("in Computer Science") is a separate requirement from the degree                                                         | `requirements.ts`                                                         | Double counts one qualification                                     |
| F7  | Responsibility lines produce junk phrases ("Write unit")                                                                                   | `requirements.ts` extraction                                              | Stored noise; would surface if contextual items are shown           |
| F8  | Internships count toward years of experience without saying so                                                                             | `matching/roles.ts`, `JdMatch.tsx`                                        | The candidate cannot see why years are "partly met"                 |
| F9  | New parse-health warnings (ATS-15) are not part of "N of M checks pass"                                                                    | `TwoResults`                                                              | A file with hidden text can still show "8 of 8 checks pass"         |
| F10 | Vocabulary is thin outside software (QuickBooks, BLS, RN license, Scrum, Bash)                                                             | `matching/vocabulary.ts`                                                  | Held-out met-recall 0.63 against legacy 0.68                        |
| F11 | Results saved before 2026-11-26 have no `altGroup`, so alternatives count separately                                                       | `JdMatch.tsx` `summarize`                                                 | Old results show inflated counts                                    |
| F12 | Raw migration `20261111010000_job_requirement_relations.sql` cannot run (CASE inside IF), and 20 raw files differ from the verified packet | `supabase/migrations/`, `scripts/materialize-managed-schema-successor.py` | Any fresh replay from the raw files fails                           |
| F13 | Under the wrong Node version, 1,091 unrelated tests fail with no clear cause                                                               | test setup                                                                | Looks like a code regression                                        |
| F14 | The pre-migration backup and the pinned Node install disappeared from `~/.resumide-private`                                                | environment                                                               | No restore point for the 2026-11-26 replay                          |
| F15 | DOCX reader built but not wired; upload, storage and the database are PDF-only                                                             | `docx-extract.ts`, upload path                                            | DOCX resumes are refused                                            |
| F16 | The new e2e spec and its config are not in `package.json` or the format and lint lists                                                     | `e2e/ats-result.spec.ts`, `playwright.ats.config.ts`                      | Not run by CI                                                       |

## 2. The single source of truth

Every visible or exported result must come from one view-model, built once on the server from the stored typed result:

```
buildAtsReport(result: AnalysisResult): AtsReport
  parseHealth:   { passed, total, checks: [...rule trace + parse-health warnings] }
  jdMatch:       { minimum: Summary, preferred: Summary, items: ReportItem[] }
  actions:       ReportAction[]      // ordered: missing minimum, partial minimum, parse errors, preferred
  strengths:     ReportItem[]        // met minimum with dated-role evidence
  applicationChecks, titleEvidence, profile
  provenance:    { matcherVersion, vocabularyVersion, normalizerVersion, asOf }
```

The page header, the Overview counts, the Keywords tab, the Parse view tab and the downloaded report all read `AtsReport`. No component recomputes a count. This one rule removes F1 to F4 and stops new disagreements from appearing.

## 3. Global constraints

- Deterministic, versioned rules own every number. AI prose may explain but never changes a count or a state.
- Every "Met" or "Partly met" item carries resume evidence, and that evidence's text occurs verbatim in the stored resume text. Every "Not found" item has none. This is enforced in code (R-03), not only in tests.
- Never suggest claiming anything the resume does not show. Hints say "if you have this, show it in a dated role."
- No real resume or JD text in source, fixtures, logs, screenshots or commits. Real-resume checks run locally on owner-supplied files and are deleted afterwards.
- Forward-only migrations. Explain any schema change and get owner approval first.
- Node 22.23.4 for the full suite; npm with the lockfile; no new dependency without owner approval.

## 4. Change set

### Matcher correctness

**R-01 Fold the years subject into the years requirement (F5).** A years line yields one requirement of kind `years`. Its subject ("software development") becomes `years.subject`, used for per-skill months when it is a vocabulary skill, and otherwise shown as context. No separate phrase requirement.
Tests: a JD line "3+ years of software development experience" yields exactly 1 required item. A skill subject ("4+ years of Python") still uses per-skill months.

**R-02 Fold the degree field into the degree requirement (F6).** "Bachelor's degree in Computer Science or a related field" is one `degree` requirement with `field` and `relatedAllowed`. A field mismatch is "Partly met", with the reason in `detail`.
Tests: one item, met, partly met for the wrong field, met for the wrong field when "related" is allowed.

**R-03 Evidence invariant (all states).** After matching, `assertEvidenceGrounded(result, resumeText)` checks that each met or partial item has at least one evidence span whose text equals `resumeText.slice(start, end)`, and that missing items have none. An item that breaks the rule is downgraded to `not_evaluated` with detail "evidence check failed" and counted in `result.integrity.downgraded`. It never throws for users.
Tests: a property test over the 18 synthetic corpus pairs (12 tuning + 6 held-out) asserts zero downgrades. A mutation test confirms a tampered span is downgraded.

**R-04 Clean responsibility extraction (F7).** Do not split "X and Y" when the result starts with a verb or has fewer than 2 content words. Responsibilities stay `contextual` and are never counted or shown as requirements.
Tests: "Write unit and integration tests" yields no phrase "Write unit".

**R-05 Internships and years (F8).** Roles whose title marks an internship are kept in `totalMonths` but reported separately: `internMonths`. The years item's detail reads "2.5 years across dated roles, including 1.2 years of internships". Whether internships count toward "met" is a versioned rule (`years-policy/1.0.0`, default: they count), shown in the detail.
Tests: met, partial and the detail text for intern-only, mixed and no-intern profiles.

**R-06 Vocabulary pack v2 (F10).** Extend `vocabulary.ts` with reviewed non-software entries (finance, healthcare, sales, operations, scripting and agile), each with a source and licence. This must not be tuned on the held-out set: write new held-out pairs (at least 6 more, covering new fields) before running them. Importing O*NET or ESCO stays behind owner decision ATS-D1.
Tests: the vocabulary schema test (every entry has an id, aliases, a source and a licence). The held-out run is recorded as-is, failures included.

### One report for page and download

**R-07 `buildAtsReport` view-model (section 2).** New `app/lib/ats-report.ts` (shared, no server imports), with one pure function and one test file. `summarize` moves there and handles old results without `altGroup` by grouping alternatives from the same JD line (`jobEvidence[0].line`) (F11).
Tests: counts for grouped and ungrouped alternatives. A saved result without `altGroup` produces the same counts as a new one. Snapshot of the report for the synthetic seed.

**R-08 Parse health includes structure and parse-health warnings (F9).** `parseHealth.checks` = the rule trace (minus keyword coverage) plus each `error` and `warn` from parse-health and PDF structure as its own check. "N of M checks pass" counts them all.
Tests: a hidden-text PDF shows a failing check and "7 of 8", not "8 of 8".

**R-09 Overview counts and priority actions from the report (F2).** "Items to improve" = `actions.length`. The priority queue lists missing minimum qualifications first, then partial minimum items, parse errors and preferred gaps; AI tips come after. "Strengths" = `strengths.length`.
Tests: the seeded analysis shows 1 missing minimum as the first action. No missing items with no parse errors shows "0 items to improve".

**R-10 Retire the conflicting legacy views when a typed result exists (F3, F4).** With `typed` present, hide the Heatmap "% matched" header (or show it as "Keyword list, for reference"). Move the legacy blended score into the existing "How this saved score was calculated" disclosure, labelled "Legacy score, not job fit". Results without `typed` keep today's view unchanged.
Tests: component tests for both cases. The e2e test asserts exactly one match figure on the page.

**R-11 Evidence report from the same view-model (F1).** `buildEvidenceReport(report)` prints, in order:

1. Parse health (N of M, failing checks).
2. JD match: minimum (N of M, each item with state, the evidence quote or "not found", and the alternative used).
3. Preferred.
4. Application questions.
5. Title evidence.
6. Parsed profile summary (role count, total months, education count).
7. Versions and date, and the "guidance, not an employer decision" line.

Legacy score last, labelled. No item text other than JD phrases and quotes from the user's own resume.
Tests: report text for the synthetic seed. Every count in the report equals the page count, asserted from the same report object.

### Platform and process gaps

**R-12 Migration replay safety (F12).** Owner decision ATS-D6:

- (a) add new forward migrations that make the raw lineage replayable; or
- (b) declare the materialized packet the only supported replay path and add a CI check that fails if any raw file that differs from the packet is used for replay.

Either way, the 2026-11-26 replay record (adapted files, packet files, grant) goes into `docs/operations/MANAGED_TESTING.md`.

**R-13 Environment guards (F13, F14).**

- A `vitest` global setup that fails at once, with a clear message, when `process.version` is not v22.23.4.
- `engines.node` in `package.json` and an `.nvmrc`.
- A backup step in the managed runbook: `pg_dump` to an owner-chosen location before any replay, with a checksum recorded in the handoff.

**R-14 Wire tests and DOCX (F15, F16).**

- Add `test:e2e:ats` and include the new spec, config and fixture in the format and lint lists.
- DOCX upload stays behind owner decision ATS-D5 (database `media_type` check). After approval: upload validation, storage key extension, worker branch to `readDocx`, and the same structure warnings.

## 5. Order and dependencies

1. R-01 to R-05 (matcher), then R-03 last, since it guards all of them.
2. R-07 (view-model), then R-08 to R-11 (page and report all read it).
3. R-13 and R-14 (tests, environment).
4. R-06 (vocabulary with new held-out pairs) after the rest, so its effect is measured on its own.
5. R-12 and DOCX after owner decisions ATS-D5 and ATS-D6.

## 6. Final acceptance (one pass, at the end)

Run once, on Node 22.23.4, after the full change set:

1. `npm run typecheck`, `npm run lint`, `npx vitest run` (all green, no expected failures other than the recorded held-out miss), `npm run build`, `npm run build:worker`.
2. `npm run test:e2e:ats` on the approved project: page, overview, Keywords tab, Parse view and the downloaded report all agree (one shared report object, so asserted once).
3. Accuracy protocol on owner-supplied files (real resume plus JD, local only, deleted afterwards):
   - (a) Upload through `/upload`, then the worker, then `/resume/:id`.
   - (b) For each item, check "Met" quotes exist in the resume text and "Not found" terms are absent (scripted search, yes/no output only).
   - (c) Check years against role dates by hand.
   - (d) Download the report and confirm every count and state equals the page.
   - (e) Confirm zero evidence downgrades (R-03).
   - (f) Clean up the test user, stored file and records, and audit for leftovers.
4. Record evidence in `todo.md` (ATS rows and R-01 to R-14), with no candidate details.

## 7. Owner decisions

| Id     | Decision                                                               | Blocks                                     |
| ------ | ---------------------------------------------------------------------- | ------------------------------------------ |
| ATS-D1 | Import O*NET or ESCO vocabulary                                        | Full R-06 coverage                         |
| ATS-D2 | Calibration corpus source and consent                                  | Calibrated scores, retiring legacy         |
| ATS-D3 | v2 switch date and how old analyses are labelled                       | Turning `MATCHER_V2_ENABLED` on by default |
| ATS-D5 | Migration allowing DOCX                                                | DOCX upload                                |
| ATS-D6 | Raw-migration repair or packet-only replay                             | R-12                                       |
| ATS-D7 | Do internships count toward years? (default: yes, shown in the detail) | R-05 wording                               |

## 8. Review focus

1. A saved analysis from before this change (no `altGroup`, no structure warnings) must render the same counts on the page and in the report, without errors.
2. A JD with no "Requirements" heading must still produce minimum items, or say clearly that none were found, never "0 of 0 met".
3. A resume with no dated roles must give years "Not checked" with a fix hint, never "Not found".
4. A scanned or OCR resume must not show PDF structure checks it could not run; it should show "not checked".
5. Very long JDs (more than 80 requirements) must say the list was truncated, and the counts must state they cover the first 80.
