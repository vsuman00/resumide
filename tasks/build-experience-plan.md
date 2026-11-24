# Build (LaTeX) Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** APPROVED by the owner 2026-11-23; IMPLEMENTED AND LOCALLY VERIFIED 2026-11-24 (not committed; release not accepted). Tracked as BX-01 to BX-15 in [`todo.md`](todo.md#build-experience-plan--approved-2026-11-23-implemented-and-locally-verified-2026-11-24).

**Goal:** Make `/build` feel like Overleaf for single-file resumes. Popular templates should compile, errors should point to lines, work should never be lost, selecting a line should show where it lands in the PDF, and AI should suggest fixes and rewrites inline. The user experience should be polished, keyboard-first and accessible.

**Architecture:** Keep the existing split: browser editor → `/build/compile` → disposable XeLaTeX container → verified PDF; and the browser → `/build/suggest` → validated AI proposal. The work runs in five phases, and each phase ships on its own:

- **Phase 0:** browser-only fixes.
- **Phase 1:** one compiler image rebuild, re-qualified under the existing runbook.
- **Phase 2:** CodeMirror editor and an improved PDF.js preview.
- **Phase 3:** inline AI.
- **Phase 4:** onboarding and polish.

**Tech Stack:** React Router SSR, TypeScript, Vitest, Playwright, pdfjs-dist (already installed), CodeMirror 6 (newly approved), and the existing XeLaTeX image in `scripts/latex-runtime/`.

**Spec:** the owner decisions dated 2026-11-23:

- **PDF link:** selecting a code line highlights the matching PDF text with a margin label such as "L42".
- **Onboarding:** for end users, in-app.
- **Engine:** keep XeLaTeX.
- **Editor:** CodeMirror 6 is approved.

Contracts: [Build design](../docs/design/LATEX_CONVERTER.md), [ADR-0016](../docs/decisions/0016-standalone-latex-converter.md), [runbook](../docs/operations/LATEX_CONVERTER.md). Supporting evidence: the [2026-10-31 overflow repair](../docs/evaluation/LATEX_DOCUMENT_OVERFLOW_REPAIR_20261031.md) shows the owner's own resume was rejected for a 0.78-point overfull line.

## Required resources and tools

| Need | What | Cost |
|---|---|---|
| Local runtime | Node 22, npm, Docker Desktop on ARM64 with Landlock, plus the reviewed compiler image | Free |
| New dependencies (approved) | `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/search`, `@codemirror/autocomplete`, `@codemirror/lint` and `@codemirror/legacy-modes` (the `stex` mode). Pin exact versions in the lockfile. | Free |
| Already installed | pdfjs-dist (`TextLayer`, `AnnotationLayer`), Vitest, Playwright, Chrome DevTools, Axe | Free |
| Template corpus | 12 popular open-licence resume templates (record each licence), rebuilt with synthetic names and text only | Free |
| Image security | The existing Trivy and `scripts/latex-runtime/verify-*.py` checks | Free |
| Accounts | A Supabase test project (already used). The OpenAI key is needed only for the separately authorised live probe in Task 12. | Free tier |
| Skills to use | `superpowers:test-driven-development`, `design-review` (Phase 4), `ecc:accessibility`, `superpowers:verification-before-completion` | — |

## Global Constraints

- The server never persists source or PDFs. Browser-only storage is allowed (Task 1).
- Limits stay unchanged: 48 KiB source (49,152 bytes), 10 pages, 5 MiB PDF, 2 active compiles, 3 per user per minute, 20 globally per minute.
- AI selections: at most 20 lines and 4,000 characters. Every request needs explicit consent under policy `build-ai-selected-context-v2`. Resume wording still requires fact confirmation before Apply.
- Source, prompts, AI output and compiler logs never reach telemetry, server logs or test snapshots. Compiler diagnostics carry only `{kind, line}`.
- Flags stay default-off: `LATEX_CONVERTER_ENABLED`, `BUILD_AI_ASSIST_ENABLED`, `AI_ENABLED`.
- Any change to the compiler image or `supervisor.py` needs a fresh image build plus the runbook's verification suite before activation. Earlier receipts stay bound to the earlier image.
- Accessibility target: WCAG 2.2 AA, 44 px minimum targets, `prefers-reduced-motion` honoured, zero serious or critical Axe findings.
- Use the `~/*` import alias, the CSS modules in `app/components/LatexConverter.module.css`, and the existing design tokens.
- Tests run with `npm test -- <path>` and use synthetic content only.
- Commit only when the owner authorises it, on a feature branch.

## Review Focus

1. **Corrupted or oversized saved draft** (bad JSON, more than 49,152 bytes, or an old version) → ignore it, keep the default example, never crash. *(Task 1)*
2. **The same visible text appears twice in the PDF**, or a line holds only macros → highlight the occurrence closest in order to the line, or show "No visible text for this line". Never highlight the wrong place. *(Task 10)*
3. **The user edits after an error or AI reply arrived** → a diagnostic line or AI range from an older source hash must not jump to or replace the wrong line. *(Tasks 8 and 11)*
4. **A PDF link with a `javascript:`, `file:` or other unsafe scheme** → render it as plain text, never clickable. *(Task 9)*
5. **A template with a harmless pdfLaTeX-only line** (`\pdfgentounicode=1`, `\input{glyphtounicode}`) → it compiles under XeLaTeX with a visible notice, and the source in the editor is never rewritten. *(Task 3)*

---

## Phase 0 — Browser-only fixes (no image change, ship first)

### Task 1: Autosave drafts in the browser

**Files:**
- Create: `app/lib/build-drafts.ts`
- Modify: `app/routes/latex.tsx` (initial `source` state at line 123, plus a save effect)
- Test: `tests/unit/build-drafts.test.ts`

**Interfaces:**
- Produces:
  - `loadBuildDraft(storage: Storage | null): { source: string; savedAt: number } | null`
  - `saveBuildDraft(storage: Storage | null, source: string, now: number): void`
  - `listBuildSnapshots(storage: Storage | null): { source: string; savedAt: number }[]` (newest first, maximum 5)
  - Storage key: `resumide.build.draft.v1`

- [ ] **Step 1: Write the failing tests.** Cover each of these:
  - Save then load returns the same source.
  - Invalid JSON returns `null`.
  - A source over 49,152 bytes is neither saved nor loaded.
  - The newest 5 snapshots are kept, at most one per 60 seconds.
  - A `null` storage, or one whose accessor throws, is a no-op and doesn't throw.
- [ ] **Step 2:** Run `npm test -- tests/unit/build-drafts.test.ts`. Expect FAIL (module missing).
- [ ] **Step 3: Implement.** Wrap every storage access in try/catch. In `latex.tsx`:
  - Initialise from `loadBuildDraft(window.localStorage)` on the client, falling back to the example.
  - Save after 800 ms without typing.
  - Show "Saved in this browser · 12:04" in the status line.
  - Change the editor note at line 467 from "does not save your code" to "Saved only in this browser."
- [ ] **Step 4:** Run the tests and expect PASS. Also run `npm test -- tests/unit/latex-routes.test.ts`.
- [ ] **Step 5:** Commit: `feat(build): autosave drafts in browser storage`

### Task 2: Template compatibility corpus and report

**Files:**
- Create: `tests/fixtures/latex-templates/<name>.tex` (12 files, synthetic content, with the licence noted in a header comment)
- Create: `tests/fixtures/latex-templates/manifest.json` (`[{file, origin, licence, expected: "compile" | "reject", reason?}]`)
- Create: `scripts/benchmark-latex-templates.ts`
- Test: `tests/unit/latex-template-corpus.test.ts`

**Interfaces:**
- Consumes: `prepareLatexDocument` from `app/lib/server/latex-source.ts`, and `compileLatex` from `latex-sandbox.ts` (only when `LATEX_COMPILER_IMAGE` is set).
- Produces: a JSON report on stdout, `{file, admission: "ok" | <LatexSourceError code>, compile?: "ok" | <LatexSandboxCode>}[]`. Task 4 uses it to choose packages.

- [ ] **Step 1:** Write a test that loads `manifest.json` and asserts every fixture with `expected: "compile"` passes `prepareLatexDocument`. Gate it behind `BUILD_TEMPLATE_CORPUS=1` until Task 6 removes the gate.
- [ ] **Step 2:** Run `BUILD_TEMPLATE_CORPUS=1 npm test -- tests/unit/latex-template-corpus.test.ts`. Expect FAIL, naming the rejected packages. Record the list.
- [ ] **Step 3:** Implement the script. It runs admission for every fixture, and runs the real compile only when the image is configured.
- [ ] **Step 4:** Run `npx vite-node scripts/benchmark-latex-templates.ts`, with and without the image. Save the report to `tasks/agent-handoffs/build-experience/template-baseline.json`.
- [ ] **Step 5:** Commit: `test(build): add template compatibility corpus`

### Task 3: Handle pdfLaTeX-only lines with a notice

**Files:**
- Modify: `app/lib/server/latex-source.ts` (add the export below; call it in `prepareLatexDocument` before the unsafe-command check at line 165)
- Modify: `app/lib/server/latex-converter-service.ts` (send notices as the `X-Latex-Notices` header, base64 JSON)
- Modify: `app/lib/latex-compile-response.ts` (`readLatexCompileReply` also returns `notices`) and `app/routes/latex.tsx` (show them)
- Test: `tests/unit/latex-source.test.ts`, `tests/unit/latex-service.test.ts`

**Interfaces:**
- Produces: `neutralizePdfTexOnly(source: string): { source: string; notices: { line: number; kind: "pdfgentounicode" | "glyphtounicode" }[] }`. It replaces exactly these whole lines (ignoring surrounding whitespace) in the **dispatched copy** with `%` comments: `\pdfgentounicode=1`, `\input{glyphtounicode}` and `\input glyphtounicode`. Line count and every other byte stay unchanged. The editor source is never modified.

- [ ] **Step 1:** Write failing tests:
  - Each of the three forms is neutralised, and its 1-based line number is reported.
  - `\input{other}` is still rejected as `source_unsafe`.
  - A line containing `\input{glyphtounicode}\input{x}` is still rejected.
  - The dispatched hash is computed on the neutralised copy.
- [ ] **Step 2:** Run the tests. Expect FAIL.
- [ ] **Step 3:** Implement as specified. The UI notice reads: "Line 4 is for pdfLaTeX and was skipped. Build uses XeLaTeX, which already embeds Unicode text."
- [ ] **Step 4:** Run `npm test -- tests/unit/latex-source.test.ts tests/unit/latex-service.test.ts`. Expect PASS.
- [ ] **Step 5:** Commit: `feat(build): skip pdfLaTeX-only lines with a visible notice`

## Phase 1 — One compiler image rebuild

### Task 4: Expand packages from the corpus data

**Files:**
- Modify: `app/lib/server/latex-source.ts:32-60` (`LATEX_PACKAGES`, `LATEX_PACKAGE_OPTIONS`)
- Modify: `scripts/latex-runtime/build-closure.py` (the `roots` list)
- Modify: `scripts/latex-runtime/Dockerfile` (line 144): add an install package only if the corpus needs one outside `texlive-latex-extra` or `texlive-fonts-recommended`, for example `texlive-fonts-extra` for `fontawesome5`. Measure its size first.
- Modify: `app/routes/latex.tsx` (the `source_unsupported` message builds its package list from `LATEX_PACKAGES`, moved to `app/lib/latex-converter.ts` so the browser can import it)
- Test: `tests/unit/latex-source.test.ts`, `tests/unit/latex-build-inputs.test.ts`

**Interfaces:**
- Produces: the expanded `LATEX_PACKAGES`. **Initial candidates** are `fancyhdr`, `tabularx`, `array`, `multicol`, `marvosym`, `fontenc`, `babel` (option `english` only), `ragged2e`, `parskip` and `fontawesome5`. Keep only those the Task 2 report shows are needed by 2 or more templates.

- [ ] **Step 1:** Write failing tests. Each admitted package is accepted with its listed options, and an unlisted option is rejected with `source_unsupported`.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement the lists. Add the matching `tex/latex/<pkg>` roots to the closure.
- [ ] **Step 4:** Run the tests and expect PASS. Then run `npm run test:latex`.
- [ ] **Step 5:** Commit: `feat(build): admit resume template packages`

### Task 5: Structured diagnostics; overfull boxes become warnings

**Files:**
- Modify: `scripts/latex-runtime/supervisor.py` (lines 11–12 `output`; 51–55 the log checks; 67 the success JSON)
- Modify: `app/lib/server/latex-sandbox.ts:293-319` (accept `diagnostic` on errors and non-empty `diagnostics` on success)
- Modify: `app/lib/server/latex-converter-service.ts` (error JSON gains `diagnostic`; success adds the `X-Latex-Warnings` header, base64 JSON)
- Modify: `app/lib/latex-compile-response.ts` (return the diagnostics)
- Test: `tests/unit/latex-sandbox.test.ts`, `tests/unit/latex-service.test.ts`

**Interfaces:**
- Produces, exported from `app/lib/latex-converter.ts` (shared with the browser):
  - `type LatexDiagnosticKind = "undefined_command" | "missing_brace" | "missing_package" | "environment_mismatch" | "overfull_box" | "other"`
  - `type LatexDiagnostic = { kind: LatexDiagnosticKind; line: number | null; severity: "error" | "warning" }`
- Supervisor output: an error is `{"error": code, "diagnostic": {"kind", "line"}}`. Success is `"diagnostics": [{"kind", "line", "severity": "warning"}]`, with at most 20 entries.
- `readLatexCompileReply` returns `{ pdf, pages, notices, diagnostics: LatexDiagnostic[] }`. On failure it throws `Error(code)` with an attached `diagnostic`.

- [ ] **Step 1:** Write failing tests in `latex-sandbox.test.ts`, mocking the container stdout:
  - An error with a diagnostic → `LatexSandboxError` carries `diagnostic`.
  - A success with 3 warnings → the result's `diagnostics` length is 3.
  - A line over 100,000, an unknown kind, or extra keys → `output_invalid`.
  - More than 20 warnings → `output_invalid`.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement the supervisor parser. Read only log lines matching `^\./main\.tex:(\d+): ` and the first `! ` line, and map them to a kind with fixed regexes. **Never emit the matched text.**
  - **Policy change (owner sign-off required):** `Overfull \hbox` and `Overfull \vbox` become `warning` diagnostics with their line, instead of `layout_overflow`. The PDF is still checked by `inspect_pdf`, the page limit and the geometry parsing.
  - `Missing character` stays an error.
- [ ] **Step 4:** Run `npm test -- tests/unit/latex-sandbox.test.ts tests/unit/latex-service.test.ts`. Expect PASS.
- [ ] **Step 5:** Commit: `feat(build): return line-level compiler diagnostics`

### Task 6: Rebuild and re-qualify the image

**Files:** no new source. Write the evidence to `tasks/agent-handoffs/build-experience/image-requalification.json`.

- [ ] **Step 1:** Build with the reviewed wrapper in `docs/operations/LATEX_CONVERTER.md`, and record the new `sha256:` image ID.
- [ ] **Step 2:** Run the runbook's runtime suite: the six starter profiles, PDF policy, rollback, resource limits and Landlock probes. Expect every check to PASS on the new ID.
- [ ] **Step 3:** Run `LATEX_COMPILER_IMAGE=<id> npx vite-node scripts/benchmark-latex-templates.ts`. Expect every `expected: "compile"` template to report `compile: "ok"`, including a synthetic copy of the 0.78-point overflow case. Remove the `BUILD_TEMPLATE_CORPUS` gate from Task 2.
- [ ] **Step 4:** Run the Trivy scan and compare it with the 79-high baseline. Record any new high findings for owner disposition.
- [ ] **Step 5:** Commit the evidence (never the image ID in `.env`).

## Phase 2 — Overleaf-grade editor and preview

### Task 7: CodeMirror editor component

**Files:**
- Create: `app/components/LatexEditor.tsx`
- Modify: `app/routes/latex.tsx` (replace the `Highlight` component at lines 92–113 and the textarea, line-number and scroll-sync block at lines 409–459; keep the toolbar buttons, routed through the handle)
- Modify: `package.json`, `package-lock.json` (the approved `@codemirror/*` packages)
- Test: `tests/components/latex-editor.test.tsx`; update the selectors in `e2e/latex-converter.spec.ts`

**Interfaces:**
- Produces:
  - `type LatexEditorHandle = { focus(): void; goToLine(line: number): void; getSelectionLines(): { startLine: number; endLine: number } | null; insertAround(before: string, after: string): void; showInlineDiff(range: { startLine: number; endLine: number } | null, replacement: string | null): void }`
  - `LatexEditor` props: `{ value: string; onChange(value: string): void; onCompile(): void; onCursorLine(line: number): void; onSelectionLines(range: { startLine: number; endLine: number } | null): void; onAskAi(): void; diagnostics: LatexDiagnostic[] }`, forwarding a ref to `LatexEditorHandle`.
  - Extensions: `stex` mode, line numbers, bracket matching, `closeBrackets`, history, search (Ctrl/⌘+F), `indentWithTab` (Escape then Tab leaves the editor), `Mod-Enter` → `onCompile`, `Mod-k` → `onAskAi`, `Mod-/` toggles `% `, and lint gutter markers from `diagnostics`.

- [ ] **Step 1:** Write failing component tests:
  - Typing calls `onChange`.
  - `Mod-Enter` calls `onCompile`.
  - `Mod-/` toggles `% ` on the selected lines.
  - `goToLine(5)` places the cursor on line 5.
  - A diagnostic on line 3 renders a gutter marker labelled "Error on line 3: undefined command".
- [ ] **Step 2:** Run `npm test -- tests/components/latex-editor.test.tsx`. Expect FAIL.
- [ ] **Step 3:** Implement. Mount CodeMirror client-only (using the existing `ClientOnly` component), with a plain `<textarea>` as the SSR fallback. Keep the 49,152-byte guard in `changeSource`.
- [ ] **Step 4:** Run the component tests and `npm run test:e2e -- e2e/latex-converter.spec.ts`. Expect PASS, with zero serious Axe findings.
- [ ] **Step 5:** Commit: `feat(build): Overleaf-style CodeMirror editor`

### Task 8: Problems panel with jump-to-line

**Files:**
- Create: `app/components/CompileProblems.tsx`
- Modify: `app/routes/latex.tsx` (keep the `diagnostics` and `diagnosticsSourceHash` state; render the panel under the compile tools)
- Test: `tests/components/compile-problems.test.tsx`

**Interfaces:**
- Consumes: `LatexDiagnostic` (Task 5), `LatexEditorHandle.goToLine` (Task 7), and `hashBuildSource` from `app/lib/build-assist.ts`.
- Produces: `CompileProblems` props `{ diagnostics: LatexDiagnostic[]; stale: boolean; onJump(line: number): void; onFixWithAi?: (diagnostic: LatexDiagnostic) => void }`

- [ ] **Step 1:** Write failing tests:
  - An error renders as "Line 42 · Undefined command — check the spelling or remove it", with a Jump button.
  - Warnings render in a collapsed "1 warning" group.
  - When `stale` is true, Jump is disabled and the panel reads "Code changed since this compile. Recompile to refresh."
  - Each kind maps to a fixed help sentence.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement. `stale` is true when the current source hash differs from `diagnosticsSourceHash`.
- [ ] **Step 4:** Run them. Expect PASS.
- [ ] **Step 5:** Commit: `feat(build): problems panel with line jump`

### Task 9: Continuous preview with a text and link layer

**Files:**
- Modify: `app/components/LatexPdfPreview.tsx` (render all pages in one scroll container; add the PDF.js `TextLayer` and a safe link layer; keep the page-text, retry and stale guards)
- Create: `app/lib/pdf-links.ts`
- Test: `tests/unit/pdf-links.test.ts`, `tests/components/latex-pdf-preview.test.tsx`

**Interfaces:**
- Produces:
  - `safePdfHref(uri: string): string | null`, which returns the URI only for `http:`, `https:` and `mailto:`.
  - Preview props add `highlight?: { page: number; rects: { x: number; y: number; width: number; height: number }[]; label: string } | null` (in PDF user-space units) and `onPageVisible?: (page: number) => void`.
  - The preview also exposes its extracted page items for Task 10: `onTextItems?: (pages: PdfPageItems[]) => void`, where `type PdfPageItems = { page: number; items: { str: string; x: number; y: number; width: number; height: number }[] }` is exported from `app/lib/latex-line-locator.ts`.

- [ ] **Step 1:** Write failing tests:
  - `safePdfHref("javascript:alert(1)")` → `null`; `"file:///x"` → `null`; `"HTTPS://a.b"` → the href; `"mailto:a@b.c"` → the href.
  - The preview renders N page containers for an N-page PDF.
  - The page indicator follows scroll via `onPageVisible`.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement. Render pages lazily with an `IntersectionObserver`. Links use `target="_blank" rel="noopener noreferrer"`. Text is selectable.
- [ ] **Step 4:** Run them, then the Build e2e. Expect PASS.
- [ ] **Step 5:** Commit: `feat(build): continuous PDF preview with selectable text and safe links`

### Task 10: Highlight the selected code line in the PDF

**Files:**
- Create: `app/lib/latex-line-locator.ts`
- Modify: `app/routes/latex.tsx` (on `onCursorLine` or `onSelectionLines`, debounced 150 ms, compute and pass `highlight`)
- Modify: `app/components/LatexPdfPreview.tsx` (draw the highlight and a left-margin label `L{line}`; scroll it into view only if it's off screen; respect reduced motion)
- Test: `tests/unit/latex-line-locator.test.ts`

**Interfaces:**
- Consumes: `PdfPageItems` (Task 9).
- Produces:
  - `visibleTextOfLine(latexLine: string): string`. It strips comments and command names, keeps the text arguments of `\textbf`, `\textit`, `\emph`, `\section`, `\subsection`, `\item` and the second argument of `\href`, and decodes `\&`, `\%`, `\$`, `\_`, `\#` and `~`.
  - `locateLineInPdf(lineText: string, lineIndex: number, totalLines: number, pages: PdfPageItems[]): { page: number; rects: PdfPageItems["items"] } | null`
- Algorithm (not determined by the signature): lowercase and collapse whitespace on both sides, then find runs of consecutive items whose joined text contains the first 60 characters of the visible text. If there are several matches, pick the one whose relative document position (item index over the total item count) is closest to `lineIndex / totalLines`. Return `null` when the visible text is shorter than 3 characters.

- [ ] **Step 1:** Write failing tests:
  - `visibleTextOfLine("\\item \\textbf{Built} APIs \\% 30")` → `"Built APIs % 30"`.
  - `visibleTextOfLine("\\vspace{2pt}")` → `""`.
  - With two identical bullets on pages 1 and 2, line 80 of 100 → page 2.
  - Text split across 3 items → one result with 3 rects.
  - No match → `null`.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement. On `null`, show a quiet "No visible text for this line" chip in the preview toolbar.
- [ ] **Step 4:** Run them. Expect PASS. In Chrome, select a bullet line and confirm the highlight and the L-label appear on the correct page.
- [ ] **Step 5:** Commit: `feat(build): highlight selected code line in PDF preview`

## Phase 3 — Inline AI on selection

### Task 11: Selection-triggered inline AI with diff and accept/reject

**Files:**
- Modify: `app/components/BuildAiAssistant.tsx` (remove the hover trigger at lines 282–305; take selection and anchoring from `LatexEditorHandle` instead of `editorRef`; render a floating chip at the selection)
- Modify: `app/routes/latex.tsx` (wire the handle; highlight the suggestion's lines in the PDF via Task 10)
- Test: `tests/unit/build-assist.test.ts`, `tests/components/build-ai-assistant.test.tsx`, `e2e/build-assist.spec.ts`

**Interfaces:**
- Consumes: `LatexEditorHandle.getSelectionLines` and `showInlineDiff` (Task 7), `onAskAi` (Task 7), plus the existing `applyBuildSuggestion`, `undoBuildSuggestion` and `hashBuildSource` in `app/lib/build-assist.ts`.
- User experience contract:
  1. Selecting 1–20 lines shows a "✦ Ask AI" chip at the end of the selection. `Mod-K` opens it from the keyboard.
  2. The panel offers three actions: **Fix code**, **Rewrite** and **Improve resume wording**. It also shows the exact lines that will be sent, and the consent checkbox (still per request).
  3. While waiting it shows "Reading lines 12–14…", then "Checking the suggestion…". Cancel is always available.
  4. A `replace` result is drawn as an inline diff in the editor (removed lines struck in red, added lines in green), and the same lines are highlighted in the PDF. **Accept** (Tab or button) applies it through `applyBuildSuggestion`. **Reject** (Esc) calls `showInlineDiff(null, null)`. Undo stays available.
  5. An `advice` or `no_change` result shows only the explanation.
  6. Resume wording keeps the fact-confirmation checkbox before Accept.

- [ ] **Step 1:** Write failing tests:
  - Hovering a line no longer opens the panel.
  - A selection plus `Mod-K` opens it, with focus on the first action.
  - A `replace` reply calls `showInlineDiff` with the reply's range.
  - Tab applies it, and Esc clears the diff without changing the source.
  - If the source is edited before the reply arrives, the reply is dropped with "Code changed. Ask again."
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement. Keep every existing server-side check unchanged.
- [ ] **Step 4:** Run `npm run test:build-ai` and the Build AI e2e with the stubbed provider. Expect PASS, with zero serious Axe findings.
- [ ] **Step 5:** Commit: `feat(build): inline AI suggestions on selection with diff review`

### Task 12: "Fix with AI" from a compile error

**Files:**
- Modify: `app/lib/build-assist.ts` (an optional request field)
- Modify: `app/lib/server/build-assist.ts` (`validateBuildAssistRequest` accepts it; the prompt includes only the kind and the relative line number)
- Modify: `app/components/CompileProblems.tsx`, `app/routes/latex.tsx`
- Test: `tests/unit/build-assist-service.test.ts`, `tests/unit/build-assist.test.ts`

**Interfaces:**
- Produces: `BuildAssistRequest.diagnostic?: { kind: LatexDiagnosticKind; line: number }`. The line must fall inside `startLine..endLine`, and the mode must be `"fix"`. The selection is the error line with 2 lines either side, clamped to the document.

- [ ] **Step 1:** Write failing tests:
  - A request whose diagnostic line falls outside the range → `invalid_request`.
  - An unknown kind → `invalid_request`.
  - The provider payload contains the kind string and no log text.
  - Clicking "Fix with AI" opens the Task 11 panel prefilled, with consent still required.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement. Change `BUILD_AI_POLICY_VERSION` only if the owner decides the consent text must change.
- [ ] **Step 4:** Run `npm run test:build-ai`. Expect PASS. A live provider probe is a separately authorised action.
- [ ] **Step 5:** Commit: `feat(build): fix compile errors with AI`

## Phase 4 — Onboarding and polish

### Task 13: First-run onboarding and template gallery

**Files:**
- Create: `app/components/BuildOnboarding.tsx`
- Modify: `app/lib/latex-converter.ts` (`LATEX_EXAMPLES` gains `description`, plus the corpus templates that compile in Task 6, with synthetic content)
- Modify: `app/routes/latex.tsx`
- Test: `tests/components/build-onboarding.test.tsx`

**Interfaces:**
- Consumes: `loadBuildDraft` (Task 1).
- Produces:
  - `BuildOnboarding` props `{ hasDraft: boolean; onChoose(choice: { kind: "template"; id: string } | { kind: "paste" } | { kind: "restore" }): void; onDismiss(): void }`
  - A dismissed flag stored under the key `resumide.build.onboarded.v1` (browser storage only).
- Flow:
  1. A first visit shows a dialog: **Start from a template** (cards with a name, a one-line description and a static preview image), **Paste your LaTeX**, and **Restore your draft** (only when a draft exists).
  2. After the choice, show three dismissible coach marks in order: Recompile (⌘/Ctrl+Enter); select lines → Ask AI (⌘/Ctrl+K); Download → Check this resume.
  3. "Show tips again" sits in the options menu.

- [ ] **Step 1:** Write failing tests:
  - The dialog shows on the first visit only.
  - Restore is hidden without a draft.
  - Choosing a template loads it.
  - Focus is trapped and returned on close.
  - Esc dismisses it.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement with the native `<dialog>` and the existing CSS module.
- [ ] **Step 4:** Run them. Expect PASS, with zero serious Axe findings.
- [ ] **Step 5:** Commit: `feat(build): first-run onboarding and template gallery`

### Task 14: "Check this resume" handoff to the analyzer

**Files:**
- Create: `app/lib/pending-upload.ts`
- Modify: `app/routes/latex.tsx` (button next to Download, shown when the PDF is verified)
- Modify: `app/components/FileUploader.tsx` (on mount, take the pending file, preselect it, and show "From Build" with a remove option)
- Test: `tests/unit/pending-upload.test.ts`, `e2e/latex-converter.spec.ts`

**Interfaces:**
- Produces: `setPendingUpload(file: File): void` and `takePendingUpload(): File | null`. The file is held in module memory, used once, and cleared when read.
- This keeps the analyzer separate: nothing is uploaded until the user submits the normal upload form, with its consent.

- [ ] **Step 1:** Write failing tests:
  - Take returns the file once, then `null`.
  - The e2e flow (Compile → Check this resume → `/upload`) shows `document.pdf` preselected and nothing submitted.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement. Navigate client-side with `useNavigate()`.
- [ ] **Step 4:** Run them. Expect PASS.
- [ ] **Step 5:** Commit: `feat(build): hand compiled PDF to the resume checker`

### Task 15: Polish pass to the quality bar

**Files:** `app/components/LatexConverter.module.css`, `app/components/BuildAiAssistant.module.css`, and the components touched above.

**Quality bar** (each item is checked in Chrome at 390, 768, 1366 and 1440 px, in light and dark, and at 200% zoom):

- **Response time:** compile feedback appears within 100 ms of the keypress. Status changes are announced through `aria-live`. There are no layout jumps.
- **States:** every async state has a designed empty, loading, success and error view. No raw codes are shown.
- **Keyboard:** a shortcut sheet opens with `?`. Every action is reachable by keyboard, and focus is always visible.
- **Motion:** 150–200 ms ease-out on panels and diffs. None under `prefers-reduced-motion`.
- **Copy:** short and sentence case, written for the user's goal (for example "Fix this error", not "Run diagnostic").

- [ ] **Step 1:** Run the `design-review` skill on `/build` and list the issues.
- [ ] **Step 2:** Fix them. Run `npm run test:e2e -- e2e/latex-converter.spec.ts e2e/build-assist.spec.ts`. Expect PASS, with zero serious Axe findings.
- [ ] **Step 3:** Update `docs/design/LATEX_CONVERTER.md` with the new behaviour, and record the evidence in `tasks/todo.md`.
- [ ] **Step 4:** Commit: `style(build): polish pass`

---

## Priority order

| Order | Task | Why |
|---|---|---|
| 1 | Task 1, autosave | Small, and stops users losing work |
| 2 | Task 2, corpus | Measures the real failure rate before anything else is changed |
| 3 | Task 5, overfull boxes become warnings (owner sign-off) | Already broke the owner's own resume. Probably the biggest cause of failing templates. |
| 4 | Tasks 3–4, notices and packages | Popular templates compile |
| 5 | Task 6, re-qualification | Required before tasks 4–5 can be enabled |
| 6 | Tasks 7–8, editor and problems | The core Overleaf feel |
| 7 | Tasks 10–11, PDF highlight and inline AI | The headline features requested |
| 8 | Tasks 9 and 12–15 | Preview, AI error fixes, onboarding and polish |

## Owner decisions still needed

- **Task 5:** approve turning overfull boxes from errors into warnings.
- **Task 4:** approve the final package list once the corpus report exists.
- **Task 11:** consent stays per request. Remembering consent per session would feel smoother, but it's a privacy policy change.
- **Task 12:** authorise the live provider probe.
