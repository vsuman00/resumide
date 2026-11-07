# AA7 accessible preview handoff

Owner: `aa7_frontend_review`; coordinator `/root`. Worktree: `/Users/vaibhavsuman/.codex/worktrees/aa7-20261106-accessible-preview/resume_ats`, supplied base HEAD `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. Only the three assigned component/style/test files and this handoff were written. Shared root, package/lockfiles, verification configurations, e2e fields and generated types were not changed. No install, browser/server, container, provider or database action.

The canvas-only accessibility gap was reproduced before implementation: the new current-page fallback regression failed on missing labelled native details while the canvas rendered. The original two pending-byte dismissal/unmount tests passed. Then the bounded local PDF.js text fallback was implemented.

Changes: labelled native details/summary, keyboard-scrollable labelled plaintext region, line boundaries from PDF text items, 100,000-character retained cap and notice, fixed empty/unavailable states. Text errors do not mark visual rendering failed. State is tagged with the exact Blob and page; each extraction effect checks active lifetime and current document identity before/after await. Replacing/dismissing PDF or changing page immediately hides previous text; late results cannot replace current text, including reopening the same Blob/page after dismissal. The existing code/PDF division, canvas controls and PDF download remain.

Final verification on Node22.23.4 (`/Users/vaibhavsuman/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node`), shared existing dependencies:

- `node node_modules/vitest/vitest.mjs run tests/components/LatexPdfPreview.test.tsx`: **15/15 pass** (1 file), after formatting. Includes genuine deferred getTextContent resolution/rejection, page/PDF changes, loaded-text clearing while replacement waits, same-Blob/page dismissal generation, literal markup, bounds, empty page and isolated extraction error.
- Scoped TypeScript program using existing tsconfig options for the component/test: no diagnostics. No temporary verification config was created.
- `node node_modules/eslint/bin/eslint.js app/components/LatexPdfPreview.tsx tests/components/LatexPdfPreview.test.tsx`: pass.
- Prettier check of all three files: pass. Scoped diff/whitespace checks: pass.

| Candidate file                            | SHA-256                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| app/components/LatexPdfPreview.tsx        | `6d24f94848f1c60e6f2d639174e8e7f4df571e807f35c5149f82f6b7f3d8d16f` |
| app/components/LatexConverter.module.css  | `a7670aef88bfb592a887b9decc1d263c8afe885b10808f63a232d2ac850c49ff` |
| tests/components/LatexPdfPreview.test.tsx | `401045fcefcfda28429cf7b67f6b63cb1c37eb2de0c198b62cbe541eeee2a47b` |

Coordinator should inspect/copy only these three files into current root, then run integrated checks and have the tester verify real PDF text plus keyboard/Axe behavior. This is a web preview aid using the existing transient PDF; it supplies no PDF tagging, canonical verification, reading-order guarantee, assistive-technology acceptance or formal GateAA7 claim. The broader phase/security findings remain separately open.

Reviewer finishing changes: the native summary keeps its marker and now has min-height44px/padding12px. A single additional functional test reproduced a UTF16 mathematical glyph split at the cap, then passed after discarding only a final dangling high surrogate on truncated text. The retained complete mathematical glyph and100,000-character cap are asserted. Final15tests, scoped TypeScript, ESLint and formatting pass. Real44px geometry/keyboard/Axe remain tester work after integration.
