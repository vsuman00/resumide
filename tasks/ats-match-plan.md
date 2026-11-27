# ATS checker accuracy plan (resume vs JD)

**Status:** IN PROGRESS 2026-11-25. Phases A to D are implemented and unit-tested, not committed. Browser-checked from real matcher output; the live route is blocked on the hosted schema. Phase E needs owner decisions. Tracked as ATS-01 to ATS-16 in [`todo.md`](todo.md#ats-checker-accuracy-plan--in-progress-2026-11-25-phase-a-built).

**Goal:** A strong candidate for a top-company role is never reported as a poor match because of noise words, word forms, synonyms or a term cap. The result tells the candidate, with evidence, what an enterprise ATS can read (Parse health) and which minimum and preferred requirements the resume meets (JD match).

**Architecture:** [ARCHITECTURE.md §11](../ARCHITECTURE.md#11-scoring-architecture): "Matching vocabulary and normalization" and "Live score migration" (both added 2026-11-25). Evidence: [gap analysis](../docs/reviews/2026-11-25-ats-checker-gap-analysis.md). Contracts: [scoring spec](../docs/ATS_SCORING_AND_AUTHORING_SPEC.md), [scoring review](../docs/design/SCORING_V2_REVIEW.md).

**Tech stack:** existing TypeScript server modules, Vitest, Playwright and Chrome. No new dependency: DOCX uses the installed `fflate` and `fast-xml-parser`.

## Global constraints

- Deterministic, versioned code and data decide every match and number. AI may only propose aliases into a review queue.
- Every saved result records `matcherVersion`, `vocabularyVersion` and `rulesVersion`. Old analyses are never re-scored or relabelled.
- Parse health and JD match are separate results. No blended number is shown as an "ATS score".
- Location, work authorization, relocation and travel are application checks, never points.
- Synthetic fixtures only; no real resume or JD in the repo, logs or screenshots.
- Forward-only migrations. Explain any schema change before applying it.
- Claim level stays `Regression-tested` until the calibration in ATS-16. UI copy must not promise employer outcomes.

## Review focus

1. **A requirement in two sections** (for example a skill in both minimum and preferred) counts once, at its highest importance.
2. **Negation and optionality** ("not required", "nice to have", "no relocation") never become missing required items.
3. **Acronym collisions** ("Go" the language vs "go" the verb, "R", "C") match only in a skill context.
4. **Overlapping role dates** do not double-count years.
5. **An unreadable or scanned PDF** returns `insufficient` for JD match, not 0%.

---

## Phase A — Matcher accuracy (largest gain, ship first)

### ATS-01: Regression corpus and baseline metrics

- **Create:** `tests/fixtures/ats-match/*.json` with at least 12 synthetic JD/resume pairs (Google-, Amazon- and Microsoft-style SWE; data or ML; PM; SRE; frontend; non-tech; a strong, a partial and a poor match each). Each pair is labelled with its requirement phrases (section, importance), expected matched, missing and not-a-requirement items.
- **Create:** `scripts/benchmark-ats-match.ts`, reporting requirement-extraction precision and recall and match precision and recall per segment. Save the current matcher's numbers as the baseline in `tasks/agent-handoffs/ats-match/baseline.json`.
- **Done when:** the gap-analysis demo pair is in the corpus, and the baseline is recorded (it is expected to fail).

### ATS-02: Normalizer

- **Create:** `app/lib/server/matching/normalize.ts` with `normalizeTerm(text): string` and `tokenize(text): {token, start, end}[]`. It handles NFKC, case, hyphen and slash forms, the `C++`, `C#`, `.NET` and `Node.js` exceptions, plural forms and verb forms (`-ed`, `-ing`, `-ment`, `-tion` to a stem through a rule table plus irregulars).
- **Test:** `tests/unit/ats-normalize.test.ts`: designed = designing = design; developed = development; LLMs = LLM; `C++` survives; "Go" is not lowered into the verb "go".
- **Done when:** the same function is used for both the JD and the resume.

### ATS-03: Versioned vocabulary pack

- **Create:** `app/lib/server/matching/vocabulary/` with JSON packs `skills.json` (canonical, aliases, acronyms, source, licence), `degrees.json` (level and field: B.S. = BSc = Bachelor's; M.S.; PhD; "or equivalent practical experience"), `titles.json` (families and seniority) and `stopwords.json` (generic words and verbs such as one, more, equivalent, strong, ability). Seed the skills pack from O*NET (public domain) and ESCO (CC BY 4.0) subsets plus a reviewed tech list (GCP, K8s, LLM, NLP, SQL dialects, cloud services).
- **Interface:** `loadVocabulary(): {version, skills, degrees, titles, stopwords}`, validated with zod at load.
- **Test:** schema validation, no duplicate aliases across entries, and every entry has a source and a licence.
- **Owner decision ATS-D1:** approve the sources and the attribution text.

### ATS-04: Requirement-phrase extraction

- **Modify:** `app/lib/server/matching/matcher.ts`. Replace single-word candidates with section-aware requirement phrases: minimum or required, preferred, responsibilities, other. Use vocabulary phrases first, then noun-phrase spans from a POS-free rule set (adjacent non-stopword tokens), then single words only for skills in the pack. Reuse the section headings `requirementText` already knows, and extend them ("Minimum qualifications", "Basic qualifications", "What you'll bring", "You have").
- Remove the 20-term cap. Bound to 80 requirements and report `truncated: true` if more.
- **Test:** the demo JD yields requirements such as "Computer Science degree or equivalent experience", "5+ years software development", "data structures and algorithms", "distributed systems", "Kubernetes", "Google Cloud", "LLMs", "machine learning infrastructure" and "technical leadership/mentoring", each with its section and importance. No noise words.

### ATS-05: Matching semantics

- **Modify:** `matcher.ts`. Match normalized phrases against the normalized resume: exact, then alias, then all components present within one bullet or line (partial). Dedupe across sections at the highest importance. Fix negation so only the requirement clause is dropped, and treat "not required" or "nice to have" as preferred.
- **Output per requirement:** `{phrase, section, importance, state: "met" | "partial" | "missing" | "not_evaluated", resumeEvidence[], jobEvidence[]}`.
- **Test:** the demo pair reports no missing minimum requirements, and ATS-01 match precision and recall pass the thresholds set in ATS-01 (proposed ≥ 0.90 / ≥ 0.85 on the synthetic corpus).

### ATS-06: Versioned live switch

- **Modify:** `scoring-stage.ts` and `atsRules.ts`. Replace the `keywords.coverage` rule input with the new matcher behind `MATCHER_V2_ENABLED` (default off), and store `matcherVersion`, `vocabularyVersion` and `rulesVersion` with each result. Old analyses render with their saved versions and labels.
- **As built:** no migration. The matcher and vocabulary versions are stored in the existing `taxonomy_version` field, which the database only requires to be non-empty.
- **Test:** an old saved analysis renders unchanged; a new one stores the versions.

## Phase B — Result model

### ATS-07: Parse health vs JD match

- **Modify:** `app/routes/analysis.score.tsx` and the score components. Show two panels. **Parse health** lists the ATS Compatibility checks with pass, fail and not-evaluated states and the fix for each. **JD match** shows requirement coverage by importance. Drop the blended 0–100 number from the primary view; keep it only as a labelled legacy value for old analyses.
- **Test:** component tests plus Chrome e2e with Axe at 390 and 1366 px.

### ATS-08: Minimum qualifications checklist

- In the JD match panel, list minimum qualifications first as met, partial, missing or unclear, each with evidence and a "how to show this" hint. The preferred list follows. A missing minimum is never hidden by preferred coverage.
- **Test:** the poor-match fixture shows the missing minimums at the top.

## Phase C — Typed requirements

### ATS-09: Years of experience

- Parse "N+ years (of|in) X". Compute total and per-skill months from dated roles, merging overlaps (reuse `confirmedExperienceMonths` in `score-v2-engine.ts`). Skills listed only in a skills list count as declared, not as experience.
- **Test:** overlapping roles; "or equivalent practical experience"; missing dates give `not_evaluated`.

### ATS-10: Degree level and field

- Match the degree level against `degrees.json` (requirement ≤ resume level), the field with alias families, and "or equivalent experience" alternatives.
- **Test:** B.S. Computer Science meets "Bachelor's in CS or related field"; a missing degree with 6 years meets an "or equivalent" requirement.

### ATS-11: Title alignment

- Normalize resume role titles and the JD title through `titles.json` (family and seniority). Report aligned, adjacent or different, as evidence only, without points until calibrated.
- **Test:** "Software Engineer II" vs "Software Development Engineer" are aligned; "Sales Manager" vs "SWE" are different.

### ATS-12: Application checks and skill recency

- Extract location, authorization, relocation and travel requirements into an "Answer in the application" list, with no points.
- Recency: evidence under the most recent role or dated bullet ranks above a skills-list mention or an old role. This affects ordering and the hint, not points, until calibrated.
- **Test:** "Must be authorized to work in the US" appears as an application check and never as missing.

## Phase D — Input and parsing

### ATS-13: DOCX upload

- **Modify:** `FileUploader.tsx` (accept `.docx`), `api.analyze.ts` (MIME and magic-byte checks, size limit) and the extraction stage. Read `word/document.xml` with `fflate` and `fast-xml-parser` into paragraphs, runs, tables and header or footer text, with the same parse-health checks.
- **Security:** reject macros (`.docm`), external relations and oversized zip entries (zip-bomb bounds), and never fetch remote content.
- **Test:** synthetic DOCX fixtures (simple, table layout, header contact, zip-bomb rejected).

### ATS-14: Parsed-profile preview

- Show what an ATS would store: contact, each role (title, employer, dates) and education, with "not found" flags linking to the fix. Reuse the canonical resume model.
- **Test:** Chrome e2e shows each synthetic role. A role without dates shows the date flag.

### ATS-15: Remaining parse-health checks

- Complete the list in §11: tables, text boxes, header and footer text, images carrying text, hidden or white text, font encoding without ToUnicode (copied text is garbled), and links without visible text. Add each as a versioned rule with evidence.
- **Test:** one synthetic PDF per check (generated through the Build compiler where possible).

## Phase E — Validity

### ATS-16: Shadow v2, calibrate, retire legacy

- Run v2 (`SCORING_V2_ENABLED`) in shadow mode on the new matcher's requirements and compare it with the live result on the corpus. Then run the consented calibration work (AA8 / CR-A tasks) to reach `Corpus-validated`, switch the live path to v2, and retire the `atsRules` weights and `LEGACY_SCORING_INPUT_ENABLED`.
- **Owner decision ATS-D2:** the corpus source and consent model.
- **Owner decision ATS-D3:** the switch date and the copy for old analyses.

---

## Priority and order

| Order | Tasks                                      | Why                                                            |
| ----- | ------------------------------------------ | -------------------------------------------------------------- |
| 1     | ATS-01 → ATS-02 → ATS-03 → ATS-04 → ATS-05 | Fixes the false "poor match" results; measurable on the corpus |
| 2     | ATS-06, ATS-07, ATS-08                     | Ships the fix safely, versioned, as two honest results         |
| 3     | ATS-09 → ATS-12                            | Recruiter filters: years, degree, title, application checks    |
| 4     | ATS-13 → ATS-15                            | Input coverage and parser fidelity                             |
| 5     | ATS-16                                     | Validated claims, then legacy removal                          |

## Owner decisions

- **ATS-D1:** vocabulary sources and licences (O*NET 31.0 is CC BY 4.0 and needs attribution; ESCO terms not yet verified). DECIDED 2026-11-27: O*NET imported, ESCO deferred.
- **ATS-D2:** the calibration corpus source and consent.
- **ATS-D3:** when to switch to v2, and how old analyses are labelled.
- **ATS-D4:** the version-column migration in ATS-06 (forward-only; explained before apply).
