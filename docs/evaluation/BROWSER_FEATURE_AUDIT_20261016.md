# Browser feature audit - 16 October 2026

Status: **BROWSER TESTING COMPLETE FOR THE COVERAGE BELOW; FAILURES CONFIRMED; NO IMPLEMENTATION FIXES APPLIED.**

The project is not ready to be described as an accurate resume-to-JD scoring product. This browser run found failures in requirement selection, requirement persistence, resume structure, authoring state, export fidelity and download navigation. Several underlying services work, but their successful execution does not establish that the information presented to the candidate is correct.

## Inputs and environments

- Resume: the owner's existing `docs/Vaibhav_Suman_Resume.pdf`, selected through the browser file chooser. It is a one-page text-based PDF. No edit was made to the source file.
- JD: the original Python AI Engineer description from the earlier **Phase Implementation** conversation, recovered from the owner's message. All 4,697 characters, including the company section, were entered into the upload form. A replacement JD was not invented.
- Browser: the Codex in-app browser, operated through actual page controls. Screenshots, rendered DOM, keyboard interactions, downloads and console logs supplied the browser evidence.
- Shared-backend run: `http://localhost:5173`, the current development build and existing hosted Supabase configuration, with its original feature flags. The owner completed sign-in. One normal worker cycle was run after a metadata check found this test analysis was the only queued record. It produced the real partial result discussed below.
- Isolated run: `http://localhost:5174`, the production build, a new local Supabase project on API port 57321, a test account and a local email inbox. Current repository migrations were applied only to this new local project. Evidence, canonical, JD, scoring diagnostics, authoring and artifact flags were enabled only in the test process. AI was disabled for this isolated run. Its ordinary worker processed the uploaded PDF; no database shortcut fabricated analysis results.
- Live Vercel: `https://resumide.vercel.app` loaded in the browser. This was a public-page check, not an authenticated production feature certification. Local uncommitted features are not assumed to be deployed.

The original environment files, application implementation, hosted schema and deployment were not changed. All test confirmations and authoring/version mutations were confined to the isolated copy. These confirmations exercise the UI; they are not independent factual verification or owner approval of a scoring policy.

## Browser-confirmed findings

### B01 - P1: Keyword coverage measures generic opening prose instead of the actual requirements

The real resume received **74/100, Strong**. The keyword screen showed **45% matched, 9 found and 11 missing**, using only 20 selected terms. They included `the`, `job`, `practical`, `exposure`, `focuses` and `based`. FastAPI, Flask and Pydantic were absent from that selected set despite being explicitly present in the supplied JD. The browser's extracted-text view also contained FastAPI.

Eight displayed terms carried **Uncertain evidence** labels, while the headline still counted nine terms as found. The uncertain `the` entry had a green check. This presentation overstates the certainty and relevance of the coverage number. All eight non-keyword legacy rules passed; the keyword rule failed and removed 26 points. The 74 is a legacy heuristic baseline, not an established fit percentage for this role.

Reproduce: upload the supplied PDF and original JD; process it; open **Keywords**, then **ATS evidence**. Source: `app/lib/server/matching/matcher.ts:152`, `app/lib/server/atsRules.ts:174`, and the result keyword presenter. Required repair: select actual requirement clauses before ranking/capping terms, handle certainty separately, and keep ATS compatibility distinct from job alignment. Calibrated replacement weights remain a separate gate.

![Actual keyword coverage showing generic terms](</Users/vaibhavsuman/.codex/visualizations/2026/10/16/01a145bd-018c-7252-8edd-53795cd1088d/browser-audit/legacy-keyword-coverage.jpg>)

### B02 - P1: Saving the JD requirements fails in the browser

In the isolated run, **Review job description > Save job requirements for review** produced: **The requirements failed provenance validation.** No reviewed requirements were persisted, blocking downstream JD-specific diagnostics.

This reproduces the earlier source-contract finding: `job-requirements.ts:124` emits `jd-parser/1.0.1`; the database shape validator in `20261012064727_job_requirement_versions.sql:4` accepts only `jd-parser/1.0.0`. The repository maps that validation failure to 422. Repair requires a forward migration and import/read-back regression, preserving historical versions.

![Browser-visible JD save failure](</Users/vaibhavsuman/.codex/visualizations/2026/10/16/01a145bd-018c-7252-8edd-53795cd1088d/browser-audit/jd-save-failure.jpg>)

### B03 - P1: Professional experience is imported as skills

The canonical importer created 55 facts: among them 19 skill facts, 27 contribution facts, two role facts and three date facts. It created no Experience section. **Professional Experience** itself and several employment achievement lines appeared as skills under Technical Skills. Professional Summary became a contribution rather than a summary heading. Employer/title/date information remained merged in role strings, with no separately recovered employer fact.

Reproduce: import the uploaded evidence into **Review structured resume**, then inspect its content preview and fact types. Source: `app/lib/server/canonical-content.ts:40` and its heading lookup at line 100, plus evidence-field relationship extraction. The importer must share the supported heading vocabulary and preserve employment relationships. Fixing a score formula cannot recover information already misclassified here.

### B04 - P1: Changing contributions retains a draft belonging to the previous contribution

On the actual authoring page, an unsaved `QA draft - do not save` answer was entered. A different **Review writing for this contribution** link was opened. Browser checks then showed:

```text
URL focus changed to the requested contribution: true
Selector still showed the previous contribution: true
Previous unsaved answer remained: true
```

No answer or fabricated achievement was saved; the draft was cleared. Source inspection confirms that the submission target follows the new selected fact, while the uncontrolled selector and question-kind-keyed input state can remain old. Source: `app/components/AuthoringWorkspace.tsx:316` and line 336. Remount/reset or correctly scope drafts by fact, and keep the selector controlled. Re-test back/forward navigation and unsaved changes.

### B05 - P1: Successful PDF/DOCX generation loses source fidelity

The browser generated, checked and downloaded both formats. The PDF passed **Export parity verified**, but comparison of the actual downloaded artifact with the supplied PDF found:

| Property | Source PDF | Downloaded PDF |
| --- | ---: | ---: |
| Pages | 1 | 3 |
| Clickable link annotations | 5 | 1 |
| Contact-email occurrences | 1 | 2 |

The downloaded DOCX is readable and has one hyperlink relationship. Its UI estimated three pages; actual Word/LibreOffice pagination was not tested. The less-than-or-equal character survived PDF export, so that earlier glyph issue was not reproduced.

The parity check compares against the already reduced canonical representation. Passing it does not prove preservation of original links, section structure or compact layout. Repair import/link preservation, duplicate contact rendering and layout before treating the output as a faithful replacement resume.

### B06 - P2: The privacy download link opens an empty route

The privacy request queued, completed through the normal local privacy worker, and showed **Completed > Download export**. Clicking that link changed the browser route to the export resource and rendered an empty page; no download event occurred. The console reported that the leaf route has no component. Direct downloading from the same visible resource link succeeded and produced a readable 4,062,300-byte JSON export.

This separates the functioning export service from the broken download navigation. Source: the React Router `Link` at `app/routes/privacy.tsx:277`, pointing to the attachment-returning resource loader in `app/routes/api.privacy-export.ts:54`. Use document/download navigation for this resource and test the actual button/link action.

### B07 - P2: The source PDF link expires while the result remains open

The source preview initially rendered. After the page had been open for a few minutes, opening its existing PDF URL returned **400 InvalidJWT: exp claim timestamp check failed**. `app/lib/server/storage.ts:81` defaults signed URLs to 60 seconds; the result reuses the URL without a visible renewal path. Keep authorization and expiry controls, but mint a fresh authorized URL when opening the source or provide recovery. Do not solve this by making the bucket public.

[Screenshot of the expired-source response](</Users/vaibhavsuman/.codex/visualizations/2026/10/16/01a145bd-018c-7252-8edd-53795cd1088d/browser-audit/expired-source-link.jpg>)

### B08 - P2: Provider-unavailable placeholders become candidate repair priorities

The shared-backend analysis ended partial because qualitative feedback was unavailable. Its three highest-impact fixes were identical **Qualitative feedback is currently unavailable** messages, all under Tone and style. The summary counted 12 improvements from the repeated placeholders. It offered no direct qualitative retry control despite saying feedback could be retried later. Rewrite showed **No rewrite is available yet**.

Unavailable service output must be represented as availability state, not as twelve resume defects or three candidate repair priorities. Source: `app/lib/server/qualitative-stage.ts:21` and the fixed-order improvement collection at `app/routes/resume.tsx:225`. The exact provider failure cause was not isolated by this browser run.

### B09 - P2: Decorative result statistics contradict the saved result

The real result was 74 with four displayed strengths. Its evidence illustration contained **78, 12 strengths, 6 repairs**, verified from the rendered image-role element. These are fixed values in `app/components/EvidenceScene3D.tsx:81`, line 109 and line 123. The homepage labels its sample analysis as an example; this result illustration does not make that distinction. Remove measured-looking decorative numbers or bind them to valid result data.

### B10 - P2: Private mobile navigation omits Privacy and Sign out

At verified widths of 390px and 899px, the signed-in workspace had no Privacy link or Sign out button. It exposed Analyses, New analysis and Account; the Account screen offered only signing out other sessions. Both missing controls were present at 1280px. The public mobile menu did expose Privacy and Sign in correctly.

Source: `app/components/WorkspaceShell.tsx:113`. Provide the account/privacy/session actions through an accessible private mobile menu or account screen.

![390px workspace navigation](</Users/vaibhavsuman/.codex/visualizations/2026/10/16/01a145bd-018c-7252-8edd-53795cd1088d/browser-audit/mobile-workspace-navigation.jpg>)

### B11 - P2: Terminal progress still looks active or unsaved

For the saved partial result, Save result remained Pending while a working partial-result link was offered. After successful cancellation, the page still headed itself **Analyzing your resume** and **Evidence is being prepared**. The needs-review state showed all timeline stages pending even though evidence had already been persisted. Terminal-state headings and stage completion need to reflect the actual result.

### B12 - P2: A development rendering crash was observed

During initial Vite dependency optimization/reload, the upload page rendered a raw Application Error with `Cannot read properties of null (reading 'useContext')` in React Router Meta. Reload restored it. A file-picker attempt during this failure timed out; that timeout is not counted as a separate uploader defect. The production-build run did not reproduce this particular crash. Investigate the development React/dependency-loading path without assuming the cause is established.

### B13 - P2: Production-build privacy navigation produced hydration errors

Console inspection during the isolated privacy journey captured React error 418 and `Cannot read properties of null (reading 'parentNode')`. These are additional rendering failures to investigate; their exact cause was not established. The console is not clean, even where a page appears usable. This finding is separate from the empty resource-route download in B06.

### B14 - P3: Export-blocked recovery leads to Account instead of the required review

Before confirmations, export correctly refused to proceed and asked for every fact to be reviewed. Its recovery control was **Return to your account**, with no direct route to the structured resume needing those confirmations. Provide an actionable review link with the pending count.

## Coverage and successful checks

These are browser checks, not inferred passes from unit tests. Where a normal background worker was needed, that assistance is disclosed above.

| Area | Exercised behavior | Result |
| --- | --- | --- |
| Public UI | Local page/navigation and light/dark selection/persistence; live homepage load only | Passed for the exercised controls |
| Public mobile menu | Open/close, keyboard Enter, Privacy and Sign in discovery | Passed at 390px |
| Authentication | Owner sign-in to shared backend; normal local email-link sign-in through the local inbox | Passed |
| Email validation | Empty and malformed email fail native validity checks without sending email | Passed |
| File picker | Select owner's PDF; replace; remove; readiness state | Passed after recovery from B12 |
| Upload limits | Non-PDF and 10 MiB + 1 byte file rejected in the client | Passed |
| Server validation | File named PDF but lacking PDF contents rejected; recoverable UI remained | Passed |
| Consent | Analyze disabled without consent and enabled with valid file plus consent | Passed |
| Real upload | Original PDF plus full original JD submitted through UI in both environments | Passed |
| Background processing | Normal leased processing produced partial legacy result and persisted v2 evidence | Passed with disclosed runtime setup |
| Cancellation | Newly created isolated quarantined analysis cancelled through progress UI | Passed |
| History | Durable rows, continue links, highest-score sort selection | Passed; numeric ordering not established with null-score local rows |
| Results | Overview, ATS evidence, Parse view, Keywords, Rewrite tabs | Reachable; content failures above |
| Keyboard tabs | ArrowRight selected ATS evidence; End selected Rewrite | Passed |
| Source preview | Original PDF preview initially rendered | Passed initially; B07 after expiry |
| Evidence text report | Browser download completed; non-empty report contained saved score and keyword section | Passed |
| Evidence review | Native source candidates and citation links displayed; confirmation incremented revision and saved review history | Passed for display and confirmation; individual citation-anchor navigation not separately certified |
| Canonical versions | Import, confirmation, version creation, restore version 1 as a new child while retaining prior versions | Passed for version behavior; B03 for content structure |
| Same-page editor | Section title changed and restored on the isolated copy; fact confirmation controls exercised | Passed for those operations; B04 remains |
| JD review | Original JD displayed; save attempted | Failed, B02 |
| V2 score safeguards | Three dimensions stayed Unavailable, no progress bars, even after all isolated facts were confirmed | Passed; no authoritative numeric score claimed |
| Export gate | Unconfirmed facts block rendering | Passed; recovery problem B14 |
| PDF export | A4 generation, parity check and checked-file download | Passed mechanically; fidelity failed B05 |
| DOCX export | US Letter generation, parity check and checked-file download | Passed mechanically; source-link loss and viewer limits remain |
| Account sessions | Sign out other sessions kept the isolated browser usable | Passed |
| Privacy request | Export queued, completed, remained visible in history | Passed |
| Privacy artifact | Direct download from visible resource link produced readable JSON | Passed; ordinary click failed B06 |
| Privacy cancellation | Second queued export request cancelled without affecting the completed export | Passed |
| Deletion review | Opened review dialog, Escape dismissed it, focus returned to trigger | Passed; final deletion was not submitted |
| Sign-out and access | Isolated account signed out; subsequent private diagnostics visit redirected to sign-in and hid the editor | Passed |
| Skip navigation | Skip link moved focus to main-content | Passed |
| 404 recovery | Deliberately invalid route showed branded Page not found with return action | Passed |
| Reflow | History, upload and diagnostics measured 390px viewport and 390px document width | Passed for those screens; private menu actions still missing |

## Limits and retained artifacts

- This was a manual functional/browser audit, not proof that every possible interaction, race or accessibility requirement passes. Separate screen-reader, contrast, full axe, performance/load and multi-browser validation were not completed.
- The provided PDF has selectable text. Scanned-document OCR, OCR accuracy and provider activation were not certified. No alternative scan was used to claim a pass.
- The supplied JD could not persist. Consequently, a complete v2 requirement-confirmation and accepted JD-alignment journey could not be certified. The earlier source audit contains additional synthetic cases; those are not relabeled as browser passes here.
- Numeric v2 calibration and formal release gates remain open. Test confirmations did not change this. Successful rendering did not validate the candidate's claims or demonstrate employer-ATS behavior.
- The shared-backend rewrite/qualitative path was unavailable. The isolated run disabled AI intentionally; no successful live rewrite or factual patch acceptance is claimed.
- Destructive account deletion, unrelated users' data, billing and deferred enterprise features were not exercised.
- Actual DOCX pagination in Word/LibreOffice and other approved viewers remains unverified.
- Generated files remain in the owner's Downloads directory: the evidence text report, `resume.pdf`, `resume.docx`, and `resumide-export.json`. They contain private resume/account data and were not copied into this report or committed.
- The temporary isolated services were stopped after testing and their copied credential file was removed. Local database volumes were retained for recovery. The shared-backend development web app and its real-result tab were left available for review.
- Screenshots linked above omit resume contents, contact identifiers and authentication URLs. Existing application changes were preserved. This audit adds only this report and the separate local screenshot artifacts; it does not deploy, commit or push anything.

## Repair sequence

1. Fix JD schema-version compatibility and the contribution/draft binding defect; add browser regressions for both.
2. Correct canonical section/relationship/link import, then check the owner's actual resume again before altering score policy.
3. Scope JD matching to requirements, handle uncertain evidence separately, and remove placeholder/decorative statistics from measured result UI.
4. Repair resource-download navigation, source-link renewal, terminal progress and private mobile account actions.
5. Recheck source-to-export fidelity and the unavailable qualitative path. Complete the documented validation/calibration work before enabling authoritative v2 scores.
