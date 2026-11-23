# One owner-provided PDF: local eligibility diagnostic

2026-11-09. **Completed at the local diagnostic tier; a downstream coverage/alignment gap is observed.** This is one owner-provided document, not representative accuracy, factual verification or a live AI test. The owner previously supplied the exact repository PDF for testing; root allocated this bounded local-only check. No production source, fixture, configuration, database or provider request changed.

## Method and privacy

The known authorized project PDF was read in place once, with no search outside the project. The Node 22.23.4 child imported the current ROOT `extractPdfTextLayers` and `detectPdfTextProfile`, `buildRewriteSources`, `buildWritingSupportDocument`, `assessWritingSupport` and `groundWriterSuggestions`. It used the native-text extraction path with layout transport off, limits of 10 pages/100,000 characters/10 MiB and a 35-second parent deadline. Existing Node type stripping and a bounded extension-resolution hook loaded the actual source; no dependency was added or source copied. Eight source/package inputs were hashed before/after and remained unchanged. These are code hashes, never a document/content hash.

The fresh child received a small explicit environment, private verification mode and AI disabled, without credentials or `.env` loading. Fetch and Node outbound socket entry points were trapped before application imports. Library console/stdout/stderr were suppressed; only constructed enum/count JSON was emitted. The observed outbound-attempt count was zero. This is an in-process network trap, not an operating-system isolation claim. No provider or database client was invoked.

PDF bytes, extracted text, anchors, source hashes of that text and identity proposals existed only in child memory. No PDF/text/quote/value/image was copied, logged, rendered or retained. The child exited; no service or hosted fixture needs cleanup. The private directory retains only the control script and sanitized count/code-binding metadata. Existing owner file and data remain unchanged.

## Actual counts

| Observation                                                |        Result |
| ---------------------------------------------------------- | ------------: |
| Pages / pages needing OCR                                  |         1 / 0 |
| Native text length, UTF-16 characters / code points        | 3,778 / 3,778 |
| IR anchors / clauses                                       |       50 / 55 |
| Recognized contribution anchors                            |             3 |
| Unqualified / qualified recognized contributions           |         0 / 3 |
| Anchors containing an unknown action                       |            47 |
| Recognized section headings                                |             6 |
| Explicit role anchors                                      |             0 |
| Derived layout entries / metadata-header anchors           |         0 / 0 |
| Distinct qualifier anchors                                 |            40 |
| Selected rewrite sources                                   |            14 |
| Identity eligibility: supported / clarification / rejected |     0 / 7 / 7 |
| Rejection: missing source anchor / ambiguous source anchor |         7 / 0 |
| Actual grounding retained identity drafts                  |             0 |
| Network attempts / provider calls / database calls         |     0 / 0 / 0 |

The extraction profile is `text`. A usable native layer and a successful parse do not prove transcription completeness, reading order, field accuracy or factual truth. The 47 unknown-action anchors include headings and metadata; they are **not** 47 lost contributions. A recognized contribution means every clause matched the current finite action grammar, not that its facts were verified.

`HEADER` and `UNKNOWN_ACTION` below are diagnostic positional categories, not production enums or semantic labels inferred from private content. HEADER means an actual qualifier anchor before the first recognized contribution; UNKNOWN_ACTION means an actual qualifier at or after that point. HEADER can therefore include prelude/summary/skills content, not just contact headers.

| Diagnostic blocker count                                                               | HEADER | UNKNOWN_ACTION |
| -------------------------------------------------------------------------------------- | -----: | -------------: |
| Distinct qualifier anchors                                                             |     18 |             22 |
| Recognized contributions carrying that category                                        |      3 |              2 |
| Selected sources with an exact trimmed/bullet-normalized anchor carrying that category |      7 |              6 |

Blocker categories overlap; columns must not be summed as disjoint contribution/source totals. The final row is a diagnostic exact-anchor match count, not an alternate implementation of production support matching.

## What this establishes

All three recognized contributions carry earlier context qualifiers. The source guard deliberately never clears an unknown or semantic qualifier at a blank, heading or role; `assessRewrite` requires an unqualified context before even accepting an identity copy. This source-preservation safety rule explains why recognized action vocabulary alone does not admit these drafts. No context was reset, relabelled safe or attributed to the candidate for this diagnostic.

The two current producers also do not yield interchangeable source boundaries for this document: seven selected exact rewrite passages return `missing_source_anchor` in the actual support assessor. The rewrite selector groups bullet-led continuation lines, while the support builder merges continuation lines only for recognized action-led units under narrower boundaries. The observed mismatch is an eligibility/segmentation issue; it does not establish a false quotation, unsafe generated claim or missing PDF text. This diagnostic did not inspect/report each private passage to assign a finer cause to every mismatch.

The 14 unchanged-source controls were then passed through actual grounding with the fixed approved editorial explanation. None survived. These intentionally unchanged controls test local admission only: they are not useful edits and do not simulate, force or evaluate a model response. No original personal text, employer, contact, dates, skills, measurements or generated output appears in this report.

This supplies a concrete next investigation boundary: synthetic reproductions of the structural qualifier and selector/support-anchor mismatch, preserving all existing negative scopes and source bindings, before any production repair. It does not authorize broad header clearing, entity inference, a new action allowlist, dropping unsupported-output checks, or declaring common resume layouts unsupported. The earlier five HTTP-200 synthetic calls remain separate: their concise-fixture no-change outcomes were not provider failures and are not repaired by this diagnostic.

## Source and evidence binding

Actual ROOT inputs, stable during the run:

| Source                              | SHA-256                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| app/lib/server/ocr/pdf-detection.ts | d31e93982dfeb7fa864f13a97672b6c648c3b9e92c4af96f46c7f47e75dd0113 |
| app/lib/server/extract.ts           | 9f5ae2ae4d54dcc2ad944d8233076d9508d67ea5d016f9a4dafd15967c4eae4d |
| app/lib/server/native-layout.ts     | 9d37dc0532dfe1097dcb6094262788eaa6f82f0aceb0a15e4a18e4fc34cc0bf3 |
| app/lib/server/writing-support.ts   | 6dcac128e26dec55bd3d462281adb5ee621a9e7421b8e5fe955b40d19f89d261 |
| app/lib/server/rewrite-sources.ts   | 5ee8b6152298331f702de5dda33bb47b52384e8df330460a95c705a730ef8356 |
| app/lib/server/writer-grounding.ts  | 486fd5a945339a4bd9014b780fc43bb8fa9d588bcb34071c745bb7df4e38290b |
| package.json                        | 1422b25b5c1f193c89a77a64b6892c7263ac4bdc8efd7ed7d0416626b1fb15b4 |
| package-lock.json                   | d190bf3f360b0b2c4a309853ae00c19cbd39e1e58458e5730fda4a626a80d3a9 |

Source references: `ocr/pdf-detection.ts:88` (bounded local extraction); `rewrite-sources.ts:8` (source grouping); `writing-support.ts:573` (continuation merging), `:611` (recognized action predicate), `:700`–`:725` (retained qualifiers), `:845` (context admission), `:1068` (exact unique original); `writer-grounding.ts:8` (actual downstream filter). These refer to the bound ROOT source, not this worktree's potentially older unrelated files.

Private evidence is `/private/tmp/resumide-owner-pdf-diagnostic-4mdrsviz`: `control.mjs`, `counts.json`, `source-bindings.json`, all mode 0600 in a mode-0700 directory. Control SHA-256: `6db7c2c465c166e8220d9425651e97d1ababb6a0574793fbabbd270676c896f3`. The private control uses only the preauthorized input path; no private document hash or content is in these receipts. Actual execution completed in the bounded child; no retry, provider run, browser, screenshot, render, OCR worker, managed DB or Docker operation occurred.

No scoring, canonical confirmation/save/export, tenant/auth/consent, browser, transcription quality or representative release gate is closed. Current A11 remains a broader factual-support/usefulness task; this is one observed consumer capability gap at a precise local boundary.
