# Final test remediation plan (FT-01 to FT-12)

Status: FT-02 to FT-11 IMPLEMENTED 2026-11-27 (FT-01 waits for owner approval; FT-12 is owner work).

Outcome notes:

- Root cause of FT-03 to FT-06: not app defects. Score, canonical and export pages take about 6 s against the hosted project, and parallel workers push the privacy access check past its fail-closed 5 s cap (503). Specs now use a 20 s expect timeout and 120 s test timeout, and hosted runs use one worker (`playwright.config.ts`).
- FT-03: the authoring flow was correct; the final accept step now waits for the reload to settle.
- FT-04: the privacy hardening migration lets the service role only queue a request, so the fixture now claims and completes it through the worker functions. The "Version" of the manifest must be `resumide-export-v1`. The date assertion now uses the stored `created_at`.
- FT-05: the origin error did not reproduce; the failure was the stale "Export parity verified" heading letting the test click before the DOCX check finished.
- FT-06: passes; it had the same 5 s wait problem under load.
- FT-07/08/09/10 done in CSS, meta and spec defaults.
- Also fixed: `browser-repairs` draft test waited for a confirmation checkbox that now only exists inside the clarification preview.
  Source: the final live Chrome and Playwright pass of 26 and 27 November 2026, run on Node 22.23.4, the hosted Resumide test project, the pinned compiler image and AI off.

## Goal

Every Playwright spec passes on the integrated working tree, the small UI and SEO gaps are closed, and the uncommitted ATS work is saved in reviewable commits with a fresh backup. Owner decisions stay with the owner.

## Ground rules (apply to every task)

- Reproduce first. Run the single failing spec before any edit and keep the failing output.
- Decide test or app. A spec is updated only when the app behaviour is the intended contract (cite the design doc or ADR). Otherwise fix the app. Never delete assertions, raise timeouts to hide a hang, or skip a test.
- Synthetic data only. Use the existing fixtures (`createScoreFixture`, `createCanonicalFixture`, `createBrowserOwner`) and clean up every user and storage object afterwards. Check counts after the run: the project returns to 3 users and 7 analyses.
- No schema change without approval. If a fix needs a migration, stop, explain the change and wait.
- Stop rule. If the same spec fails twice after a fix, stop and report instead of looping.
- Definition of done per task: the target spec passes three runs in a row, `npm run typecheck`, `npm run lint` and the affected unit/component tests pass, and the task row in `tasks/todo.md` records the evidence.

## Priority order

| Order | ID    | Area                                    | Severity                     | Type          |
| ----- | ----- | --------------------------------------- | ---------------------------- | ------------- |
| 1     | FT-01 | Save the work: commits and backup       | High (data-loss risk)        | Process       |
| 2     | FT-02 | Shared e2e preflight and fixture health | High (blocks FT-03 to FT-06) | Test infra    |
| 3     | FT-03 | `authoring.spec.ts` (2 tests)           | Medium                       | App or test   |
| 4     | FT-04 | `browser-repairs.spec.ts` (2 tests)     | Medium                       | Fixture       |
| 5     | FT-05 | `artifact-export.spec.ts`               | Medium                       | App or config |
| 6     | FT-06 | `canonical-resume.spec.ts`              | Medium                       | App or test   |
| 7     | FT-07 | Desktop layout of the two result cards  | Low                          | UI            |
| 8     | FT-08 | Footer link target size                 | Low                          | UI / a11y     |
| 9     | FT-09 | `/analyses` meta description            | Low                          | SEO hygiene   |
| 10    | FT-10 | Evidence files overwritten by test runs | Low                          | Test infra    |
| 11    | FT-11 | Full regression and live Chrome re-pass | Gate                         | Verification  |
| 12    | FT-12 | Owner decisions ATS-D1, D3, D5, D6, D7  | Gate                         | Owner         |

---

## FT-01 Save the work (do first, needs owner say-so)

Problem: 40+ changed and new files (matcher v2, shared report, UI fixes, test fixtures) exist only in the working tree on `wip/reliability-snapshot-20261123`. The earlier backup folder disappeared for an unknown reason.

Plan:

1. Ask the owner to approve commits and pick a backup location outside the repo and outside `/tmp`.
2. Make a fresh hosted schema and data backup by following `docs/operations/BACKUP_RESTORE.md` and the backup step recorded in `docs/operations/MANAGED_TESTING.md`. Record its path and checksum.
3. Confirm `assets/test-resume/` and any scratchpad real-resume text are git-excluded (`git check-ignore`), and that no real personal details appear in the diff (grep the diff for the owner's name, email domains and phone patterns).
4. Split into reviewable commits, each passing typecheck and lint on its own:
   - `feat(ats): matcher v2 requirements, roles, titles and vocabulary`
   - `feat(ats): parse health, PDF structure and DOCX extraction modules`
   - `feat(ats): shared report view-model for page and download`
   - `fix(ui): menu Escape, brand name, status wording, landmark names, phone layout`
   - `test(e2e): fixture storage keys, ATS result spec, Node version guard`
   - `docs(ats): plans, todo evidence and managed-testing record`
5. Do not push until the owner asks.

Done when: backup verified readable; `git status --short` shows only intended leftovers; no PII in the commits.

## FT-02 Shared e2e preflight and fixture health

Problem: several failures came from fixtures that no longer match the hosted schema (the storage key rule already broke 9 specs once). The same class of drift likely explains FT-04 and part of FT-06.

Plan:

1. List every insert the e2e fixtures make (`scripts/canonical-test-fixture.ts`, `tests/fixtures/latex-auth.ts`, the inline inserts in `e2e/browser-repairs.spec.ts`, `e2e/artifact-export.spec.ts`, `e2e/authoring.spec.ts`).
2. For each target table, compare the fixture columns against the live constraints and triggers (columns, `NOT NULL`, `CHECK`, triggers such as `private.r17_storage_key`, size limits on JSON columns). Use read-only SQL only.
3. Make every fixture failure print the database error message and code, not a generic "setup failed" string. This is a test-code change only.
4. Add one fast preflight check that creates and deletes one record per fixture table, so schema drift fails in seconds with a clear reason.

Done when: preflight passes on the hosted test project; each fixture error names the violated constraint.

## FT-03 `authoring.spec.ts` (tests at lines 48 and 162)

Symptom: after "Save fact correction" the page lands on `/score?focus=<fact>`; the spec expects `/score` with nothing after it. The second test times out.

Known facts: `app/routes/analysis.author.tsx` line 89 adds `?focus=` only for `clarify`, `accept` and `reject`. The spec opens the page at `/score?focus=<id>` first, so either the form posts to a URL that keeps the query, or the edit is submitted as one of those three actions.

Plan:

1. Reproduce headed and log the submitted `action` value and the redirect `Location` header.
2. Read `docs/design/CANDIDATE_AUTHORING_WORKSPACE.md` for the intended focus behaviour after an edit.
   - If the design says focus returns to the edited fact after a correction (better for keyboard users), the app is right: change the spec to accept the optional `?focus=<id>` and assert focus lands on that fact.
   - If the design says edits clear focus, fix the redirect so an edit never carries the query.
   - If the design is silent, the owner picks; default recommendation is to keep focus (keyboard users lose their place otherwise).
3. For the timeout at line 162: capture the trace, find the step that waits, and fix its cause (likely the same URL assertion, or a role query affected by the new per-item `aria-label` on writing comparison regions).

Done when: both tests pass three runs; the keyboard focus contract is asserted, not just the URL.

## FT-04 `browser-repairs.spec.ts` (tests at lines 69 and 192)

Symptom: "Synthetic completed export setup failed". The inline insert into `data_requests` (status `completed`, a 16,384× repeated manifest) is rejected, and one test times out.

Plan:

1. Use FT-02's error output to get the exact rejection (likely a newer required column such as an expiry or storage key, a status-transition trigger, or a size check on `result_manifest`).
2. If a newer migration requires a field, add it to the fixture with a valid synthetic value. If a trigger forbids inserting directly as `completed`, create the request the way the app does and move it to `completed` through the privacy worker's path.
3. Keep the large-manifest intent: it proves the privacy page does not render huge exports. If a size limit now exists, keep the manifest just under it and add a case just over it that expects the page's error state.
4. Re-run line 192 after line 69 is fixed; treat its timeout as a follow-on unless the trace shows otherwise.

Done when: both tests pass three runs; cleanup removes the `data_requests` rows.

## FT-05 `artifact-export.spec.ts` (line 84)

Symptom: timeout; the server logged an origin-mismatch error on a form submission.

Plan:

1. Capture the request's `Origin` and `Host` headers and the server's `APP_ORIGIN`. All Playwright configs set `APP_ORIGIN=http://127.0.0.1:3110`; check whether this spec, or a redirect it follows, uses `localhost:3110`, which sends a different origin.
2. If so, change the spec to the configured base URL. Do not relax the server's origin check: it is a CSRF defence.
3. If the origins match and the check still fails, trace the comparison in `app/lib/server/` and fix it (for example trailing slash or port normalisation), with a unit test for a matching origin and a foreign one.
4. Then confirm the export reaches a downloadable state and the file matches the preview, as the spec intends.

Done when: the spec passes three runs; a unit test proves a foreign origin is still rejected.

## FT-06 `canonical-resume.spec.ts` (line 8)

Symptom: the "Version 1" heading is not shown after import. The spec header says it is local-only (`test:aa2:browser`) and must not use hosted resources, yet it ran in the full hosted pass.

Plan:

1. Decide where it runs. If it is local-only, exclude it from the hosted full-run config and keep it on its own script; record this in `docs/operations/MANAGED_TESTING.md`.
2. Run it on its intended target. If it still fails, screenshot the page after import and check whether the import failed (fixture rejection, see FT-02) or the heading text changed.
3. Fix the cause: a fixture fix for a rejection, or a spec update if the new heading matches `docs/design/CANONICAL_RESUME_WORKSPACE.md`. Leave the owner-isolation checks in this spec untouched.

Done when: the spec passes on its intended target; the run scope is documented.

## FT-07 Desktop layout of the two result cards (polish)

Problem: on wide screens the two result cards fill only the left half of the summary area.

Plan: in `app/app.css`, make the `.jd-*` summary container a two-column grid above about 900px and one column below. Check at 768, 1024, 1366 and 1920px in Chrome. Add 1366px to the existing overflow loop in `e2e/ats-result.spec.ts`.

## FT-08 Footer link target size

Problem: footer links are 20px tall. They pass WCAG 2.5.8 only through the spacing exception.

Plan: give footer links a minimum target height of 24px using padding in the existing footer styles. Re-run Lighthouse on home and privacy, and the a11y spec. Low priority; skip if the owner prefers the current look.

## FT-09 `/analyses` meta description

Problem: Lighthouse SEO is 75 because there is no meta description. The page is private, so there is no ranking impact.

Plan: extend the existing `meta` export in `app/routes/analyses.tsx` with a short description and `noindex`, following any pattern other private routes already use. Check account and the analysis workspace for the same gap and apply the same pattern. Re-run Lighthouse.

## FT-10 Evidence files overwritten by test runs

Problem: Playwright runs overwrote 21 committed files in `docs/evaluation/`. They were restored by hand.

Plan: find which specs write into `docs/evaluation/`. Make them write to Playwright's output folder by default and only to `docs/evaluation/` when an explicit evidence-capture flag is set. Add a post-run check that fails if `git status --short docs/evaluation` is not empty.

## FT-11 Full regression and live Chrome re-pass (gate)

Run on Node 22.23.4 with AI off:

1. `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` (expect 7,510 or more passing).
2. `npm run test:latex`, `npm run test:build-ai`.
3. Full Playwright: `playwright.config.ts`, `playwright.authenticated.config.ts`, `playwright.ats.config.ts`, `playwright.build-ai.config.ts`. Expect 0 failures.
4. Live Chrome pass: home, sign-in redirects, upload (valid PDF and an invalid file), progress, evidence review, result tabs, downloaded report matches page, Build compile and download, privacy export, site menu by keyboard, light and dark themes, at 320, 390, 768 and 1366px. Lighthouse on home, upload, analyses, result, account and privacy.
5. Clean up and confirm counts (3 users, 7 analyses, no new storage objects), and confirm `docs/evaluation/` is unchanged.
6. Update `tasks/todo.md` and `CONTEXT.md` with the evidence.

## FT-12 Owner decisions (approved and implemented 2026-11-27)

| ID     | Decision                               | Outcome                                                                                                  |
| ------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| ATS-D1 | Vocabulary sources and licences        | O\*NET 31.0 hot technologies imported (CC BY 4.0, attribution shown). ESCO deferred: terms not verified. |
| ATS-D3 | v2 switch date and old-analysis labels | v2 on by default from 2026-11-27; old analyses keep their result and show a note.                        |
| ATS-D5 | DOCX migration                         | Two forward migrations applied to the hosted test project; upload, worker and viewer wired.              |
| ATS-D6 | Replay approach                        | Packet-only replay, guarded by a unit test.                                                              |
| ATS-D7 | Internships count toward years         | Yes, disclosed in the detail.                                                                            |

The earlier version of this table mislabelled several of these decisions; the definitions above match `tasks/todo.md`.

## Risks

- FT-04 and FT-06 may need a migration if the live schema intentionally forbids the fixture's shortcut. That pauses for approval.
- FT-03 depends on a design reading; if the design doc is silent, the owner picks the focus behaviour.
- Each full hosted run creates and deletes synthetic users; a crashed run can leave rows behind, so the cleanup check in FT-11 is required.
