# Inflated baseline score repair

Status: IMPLEMENTED locally and verified on dirty base `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. Authoritative v2 scoring and release gates remain open.

## Reproduction and cause

The owner reported a saved 100 labelled Strong despite missing JD keywords. Read-only inspection of the open authenticated result reproduced that presentation. Local extraction of the owner-supplied PDF and comparison with the supplied JD reproduced the 100 baseline without any model call.

The legacy matcher recognized the later Qualifications heading but not Job Purpose and Impact or Key Accountabilities. As a result, it masked the earlier technical requirements. No recognized skills remained in this reproduction, so the keyword rule was excluded and the remaining document checks yielded 100. Independently, the keyword rule awarded its full 26 points once half the recognized terms matched. A synthetic resume matching two of four recognized terms therefore also received 100. Both regressions failed before repair.

## Changes

- Matching now recognizes role-purpose and accountability headings while still masking company/benefits sections and preserving source offsets.
- Exact lexical vocabulary includes Express, Jest, Mocha, Cypress, Playwright, ChatGPT, GitHub Copilot and Claude. These are term-presence observations, not proficiency or externally validated taxonomy claims. Selection remains capped at 20 terms.
- New analyses record `ats-rules-v4`. Keyword points are proportional to recognized coverage, and the rule passes only when all selected recognized terms match. Traces retain weight and expose fractional credit/earned points. The two-of-four regression now yields 87 from the unchanged hand-authored weights. Unrecognized/unevaluated requirements do not become arbitrary penalties.
- Result, ATS and historical category displays no longer endorse uncalibrated values with Strong or quality-band colors. They explain the distinction between a saved checklist baseline, term coverage and authoritative job alignment.
- Stored historical values are retained. The open saved result still contains 100, now labelled Uncalibrated. It was not rewritten to the local recalculation. A fresh analysis with the updated worker is required to persist a new version; no running worker restart or production deployment is claimed.

## Owner-provided input validation

The corrected local comparison selected 20 terms, including 15 recognized technical terms. Six recognized terms were present and nine were not evidenced in extracted text. The resulting v4 checklist baseline was 84/100. This is not 84% job fit, an employer ATS result or a calibrated probability. It does not validate experience duration, proficiency or every JD requirement.

The PDF and full JD stayed out of source, logs, screenshots and handoffs. Temporary private input/probe files were removed. The PDF was processed locally; no real document was uploaded or sent to an AI provider. The browser screenshot uses a synthetic fixture only.

## Verification

- Focused scoring/matching/UI tests: 35 passed before the final trace-credit addition; the final root `npm run verify` then passed full tests, formatting, lint, types, web and worker builds.
- `npm run benchmark:phase5`: approved thresholds pass, zero differing deterministic pairs, parser field precision/recall 1.0, section F1 0.95238 and matching precision/recall 1.0. This is the existing synthetic regression corpus, not field accuracy.
- Authenticated native-layout/result browser regression: passed sequentially with one worker against managed Supabase. It verifies owner isolation, keyboard evidence access, Uncalibrated labelling and absence of Strong in the score header. The final neutral-color presentation was rebuilt and rechecked in the same browser test.
- Two test attempts each used two synthetic accounts and one synthetic storage object. Exact Supabase cleanup was verified after each run; no user-owned analysis was altered. No migration, reset, provider request, commit or publication occurred for this repair.

Remaining limits: legacy numbers are not calibrated; selected term presence does not prove qualification. The earlier intermittent authoring latency and LaTeX PDF-tagging findings remain open and are unrelated to this repair.
