# ATS checker gap analysis: resume vs JD, against enterprise ATS practice

Date: 2026-11-25 · Checkout: `wip/reliability-snapshot-20261123` at `734c858` · Type: advisory review (no code changed)

## Scope and method

I read the live scoring path (`scoring-stage.ts` → `atsRules.ts`), the JD matcher (`matching/matcher.ts`, `matching/taxonomy.ts`, `SOFTWARE_SKILLS` in `job-requirements.ts`), the section parser and layout checks (`parseSim.ts`, `parsing/*`), the typed requirement model (`job-requirements.ts`), the v2 engine (`score-v2-engine.ts`) and the flag defaults in `config.ts`. I then ran the live matcher on a synthetic Google-style JD and a matching synthetic resume (results below).

Industry statements describe common behaviour of enterprise ATS products (for example Workday Recruiting, SAP SuccessFactors, Oracle Taleo, iCIMS, Greenhouse and Lever) and in-house systems. Which system a specific company uses, and how it is configured, is not public and varies by team, so this review does not claim one.

## How enterprise screening actually works

There is no single "ATS score". A real pipeline has five layers, and a candidate can fail at any one:

1. **Parsing into fields.** The resume becomes structured data: contact, each job (title, employer, dates), education (degree, field, school), skills. Parse failure (columns, tables, text in headers, images, odd date formats) silently drops facts. This is the most common real failure.
2. **Knock-out questions.** Work authorization, location, willingness to relocate, minimum degree, minimum years. These are hard filters, often answered in the application form, not the resume.
3. **Recruiter search and filters.** Boolean and keyword search over the parsed profile, filtered by title, years, location and recency. Synonyms come from the vendor's skills ontology, not from exact strings.
4. **Matching and ranking (where enabled).** Ontology or ML matching of skills and titles to the requisition, separating required ("minimum") from preferred qualifications.
5. **Human review.** For large tech companies: evidence of impact, scope and the stated qualifications. Amazon-style roles also look for behavioural evidence; Google-style postings split "minimum" and "preferred" qualifications explicitly.

## What the product does today

| Layer                                | Current behaviour                                                                                                                                                                                               | Verdict                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Live score                           | `atsRules.ts`: 9 hand-weighted rules. Email 12, phone 4, experience section 14, education 8, skills 10, dates 10, bullets 8, length 8, JD coverage 26.                                                          | Heuristic. About 74% of the score is formatting and contact checks; only 26% depends on the JD. |
| JD matching                          | `matchJobDescription`: a 19-entry taxonomy plus 39 software skills, then **single-word tokens** for everything else, **capped at 20 terms**. Pass threshold: 50% present.                                       | Too narrow and too noisy for real JDs (see the demo).                                           |
| Required vs preferred                | Not distinguished in the live score. Typed `importance` exists in v2 only.                                                                                                                                      | Missing in live path.                                                                           |
| Years of experience, degree, title   | Not evaluated live. v2 counts confirmed months only.                                                                                                                                                            | Missing in live path.                                                                           |
| Knock-outs (location, authorization) | Types exist (`location`, `authorization`), never checked.                                                                                                                                                       | Missing.                                                                                        |
| Parsing                              | PDF only. Section headers, dates, bullets, multi-column and reading-order warnings. Native layout and OCR paths exist behind flags.                                                                             | Good warnings, but no DOCX input and no field-level parse preview in the live score.            |
| v2 engine                            | Typed requirements, evidence-gated matches, withheld uncalibrated numbers. `SCORING_V2_ENABLED`, `JOB_INTELLIGENCE_ENABLED`, `JOB_RELATIONS_ENABLED` and `LEGACY_SCORING_INPUT_ENABLED` all default to `false`. | Right direction, not live, not calibrated.                                                      |

## Demo: live matcher on a Google-style posting

The JD had "Minimum qualifications", "Preferred qualifications" and "Responsibilities". The resume was a strong match: B.S. Computer Science, 6 years, distributed systems on K8s and GCP, LLM work, led and mentored engineers.

- **Terms extracted (20, the cap):** bachelor, degree, computer, science, equivalent, software, development, one, more, programming, languages, data, structures, algorithms, designing, distributed, Kubernetes, Google Cloud, LLMs, Machine learning.
- **Reported missing:** bachelor, degree, equivalent, development, one, more, programming, languages, designing, Google Cloud, LLMs.
- **Result:** 9/20 = 45%, so the 26-point coverage rule **fails** for a candidate a recruiter would shortlist.

Root causes shown by this one run:

1. **Noise terms.** "one", "more", "equivalent" and "languages" count as requirements.
2. **No normalisation.** "Designed" does not match "designing", "Developed" does not match "development", and "LLM" does not match "LLMs".
3. **Missing synonyms.** "GCP" does not match "Google Cloud", and "B.S." does not match "Bachelor's degree".
4. **Phrases split into words.** "Data structures/algorithms" and "computer science" become separate tokens; "distributed systems" is only half-matched.
5. **Cap and order.** The 20-term cap filled up on minimum qualifications, so preferred qualifications (Master's/PhD, leading and mentoring) were never evaluated, and responsibilities never were.
6. **No requirement logic.** "5 years" and "or equivalent practical experience" are treated as words, not as a rule the resume meets.

## Gaps, ranked by impact

| #   | Gap                                                         | Why it matters for top-company screening                               | Fix                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | JD terms are unigrams with a 20-term cap and weak stopwords | Real postings have 25–60 requirement phrases; noise inflates "missing" | Extract **requirement phrases** (n-grams, the existing typed requirement parser) per section, no fixed cap; expand stopwords; ignore generic verbs                                                       |
| 2   | No normalisation or ontology                                | Enterprise ATS match concepts, not strings                             | Lemmatise both sides; plural and verb forms; acronym table (GCP, K8s, LLM, ML, CI/CD, B.S./M.S./PhD); grow the taxonomy from a maintained source (O*NET, ESCO or Lightcast-style skill lists), versioned |
| 3   | Required vs preferred not weighted                          | "Minimum" items act as filters; "preferred" items rank                 | Score the two groups separately; never hide a missing minimum behind preferred matches                                                                                                                   |
| 4   | No years, degree or title check                             | Recruiters filter on these first                                       | Compute years per skill and overall from parsed role dates; degree level and field with "or equivalent experience"; title similarity to the requisition                                                  |
| 5   | No knock-out awareness                                      | A great match fails on authorization or location                       | Surface location, authorization and relocation requirements as explicit "answer in the application" items, not score points                                                                              |
| 6   | Score is 74% formatting                                     | Formatting rarely decides a shortlist once parsing works               | Split into **Parse health** (can the ATS read it?) and **JD match** (does it meet the role?). Show both; do not blend them into one number                                                               |
| 7   | PDF only                                                    | DOCX is widely accepted and some parsers handle it better              | Accept DOCX through the same extraction and parse-health path                                                                                                                                            |
| 8   | No field-level parse preview in the score                   | Users cannot see what an ATS would store                               | Show the parsed profile (each role: title, employer, dates) with gaps flagged; the canonical resume workspace already models this                                                                        |
| 9   | Skill recency and context ignored                           | "Python in 2014" ≠ "Python in 2024"                                    | Weight evidence by the role and date it appears under; a skills-list-only mention counts less than a dated bullet                                                                                        |
| 10  | Uncalibrated number shown as a score                        | Users read a number as a pass/fail promise                             | Keep "guidance, uncalibrated" labels until v2 calibration (AA8 / CR-A tasks) on a consented, representative corpus is done                                                                               |
| 11  | Impact and content quality not part of JD fit               | Big-tech reviewers look for scope and measurable impact                | Keep these as separate writing guidance (the authoring workspace already has checks), not ATS points                                                                                                     |

## What to keep

- Evidence spans, provenance and the "withhold when uncertain" policy. Real recruiters distrust inflated scores, and this is the product's credibility.
- Deterministic, versioned rules for numbers. Use AI only to propose phrases and synonyms that a versioned table then decides.
- The parse warnings (multi-column, reading order, missing headers, dates). These mirror real parser failures.

## Suggested order

1. **Fix the live matcher (gaps 1–2).** Requirement-phrase extraction, normalisation, acronym and degree tables, no 20-term cap, better stopwords. Add the demo above as a regression fixture with expected matches. This is the largest accuracy gain for the least work.
2. **Two-part result (gap 6) plus required/preferred (gap 3).** Parse health and JD match shown separately; minimum qualifications listed as met, missing or unclear.
3. **Years, degree and title (gap 4) and knock-outs (gap 5).** Reuse v2's confirmed-month logic and typed requirement types.
4. **DOCX input and parsed-profile preview (gaps 7–8).**
5. **Calibrate and switch to v2 (gap 10).** Then retire `atsRules.ts` weights and the legacy flags.

## Not verified

- Behaviour of any named vendor's parser on these files. Testing that needs vendor sandboxes or exported parse results.
- Which ATS any named company uses or how it is configured.
- v2 engine output on real JDs. Its flags are off, and it was not exercised in this review.
