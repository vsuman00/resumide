# Build AI assistance: frontend handoff

- Updated: 2026-10-30, Asia/Kolkata; worker `/root/aa7_workspace`.
- Base HEAD: `a0b239299d75b0bd64b588fe743ebe2975fb28b9`; uncommitted reviewed Build baseline and unrelated dirty work preserved.
- Authority: [Build AI coordinator record](2026-10-30-build-ai-coordinator.md). Owner approved bounded implementation after the credential-reuse decision. No key values were handled by this worker.
- Status: IMPLEMENTED frontend; focused lint/types/build passed. Browser/fault/accessibility acceptance remains testing-owned. A coordinator-reported live credential probe returned 401; this frontend does not establish live AI availability.

## Exact frontend deliverables

- `app/components/BuildAiAssistant.tsx`: selection/current-line/hover popover, explicit request consent, review, guarded apply/discard and undo.
- `app/components/BuildAiAssistant.module.css`: Resumide tokens, clamped responsive popover, wrapped plain-text review and keyboard focus styles.
- `app/routes/latex.tsx`: integrates the assistant with the existing editor ref/current source and `changeSource`, using loader `aiEnabled` with a false fallback.
- `app/routes/build.suggest.ts`: thin resource action delegates backend `buildSuggestAction`; GET returns fixed private/no-store JSON 405.
- `app/routes.ts`: registers `/build/suggest`.

Backend-owned shared `app/lib/build-assist.ts` and server/config/loader prerequisites were copied read-only for local verification. They are not frontend-owned deliverables. No dependencies, environment files, tests, old receipts or unrelated production files were changed for this task.

## Interaction and privacy contract

A stationary hover opens the controls after 450 ms. Selecting nonempty editor lines opens the same popover; a keyboard-accessible AI suggestions button uses the current selection or caret line. Hovering, selecting and opening the controls never request a model. The disabled feature state has no hover listeners and a disabled toolbar control.

The popover discloses that the complete buffer reaches Resumide for binding, while only selected lines and bounded nearby context reach the configured provider. A fresh explicit selected-context checkbox is required for every Ask AI request and resets on submission, range/mode change and dismissal. No automatic retry, provider fallback, auto-apply or auto-compile is added.

Fix code, Rewrite and Resume wording use the shared request policy, limits and source hash. Context, before/after, explanation and questions render as plain React text. Resume results are labelled unverified drafts and require a fact-preservation checkbox before Apply. Candidate confirmation does not establish factual verification. Provider errors are mapped to fixed messages; raw error text is never displayed.

The shared source/range helpers bind whole selected lines. Textarea-normalized offsets determine line indices, which are applied back to the exact source through the shared CRLF-aware helper. Invalid or oversized selections cannot request a suggestion. Full-source byte overflow is rejected before the frontend request.

Edits, changed line ranges, dismissal and unmount abort pending requests and advance the request sequence. Returned hashes, ranges, original text, mode and bounded fields are checked. Apply rechecks the current source, range, open state and sequence after its asynchronous hash check. Closing/discarding during that check cannot apply an edit. Withdrawing fact confirmation also blocks Apply. Parent `changeSource` invalidates any current/pending PDF; recompilation remains explicit.

Undo retains only the last AI before/after snapshots in memory. It is enabled only while current source exactly matches the applied after-state, and uses the shared stale-check helper. Source and model output are not persisted by the component.

Escape and outside clicks dismiss without trapping focus. Keyboard-opened controls receive focus; Escape restores the trigger when focus was inside the popover. Hover entry into the popup cancels its leave timer. Position is clamped to the viewport and updates on resize/content-size changes; review text wraps inside the scrollable popup.

## Selectors for testing

- Toolbar: `AI suggestions`, `Undo AI edit`.
- Dialog name: `AI suggestions`; close button: `Close AI suggestions`.
- Select: `Suggestion type`; options: `Fix code`, `Rewrite`, `Resume wording`.
- Consent: `I agree to send this selected context for this request.`
- Actions: `Ask AI`, `Cancel AI request`, `Apply suggestion`, `Discard suggestion`.
- Resume confirmation: `I confirm this draft preserves my facts and adds no experience, skills, employers, credentials or metrics.`
- Review region: `AI suggestion review`; headings: `Before`, `After`, `Unverified draft`, `Questions to resolve` when applicable.

## Verification and limits

Against this dirty worktree and explicitly transferred backend prerequisites, Node 22.23.4 checks passed: focused ESLint; React Router `typegen`; TypeScript `tsc --noEmit`; production React Router build. Existing Zod annotation and empty resource-chunk notices remain. Initial missing backend-service types were resolved by explicit file transfer, without suppressions or stubs. Focused formatting and `git diff --check` also pass.

Apply the installed `clean-user-facing-text` workflow to new UI prose and this handoff while protecting code and exact protocol values. No frontend server, database operation, model call, provider stub or browser test was run by this worker during AI implementation. Testing owns actual mock-provider browser/keyboard/hover/consent/apply/stale/undo/accessibility checks and any separately authorized live synthetic smoke. No live success, release acceptance or deployment is claimed.

Next: coordinator transfers the five frontend production files, shared/backend prerequisites and testing changes; testing verifies the integrated candidate. Frontend addresses concrete findings within its exclusive files. Default-off flags and existing compiler/manual-upload boundaries remain unchanged.
