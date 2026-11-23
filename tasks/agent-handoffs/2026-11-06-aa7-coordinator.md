# AA7 private internal continuation

Owner requested private implementation and internal validation with senior developer/tester subagents and coordinator review, using ponytail. Previous goal turn produced a successful provider capability probe; it was progress, not end-to-end acceptance. Current root files include later October 31 fixes, so old worktrees are not authoritative.

Base HEAD: `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, extensive unrelated dirty changes preserved. Coordinator owns shared documents/integration. Backend `aa7_source` and frontend `aa7_workspace` first audit current root read-only; testing `aa7_sandbox` owns safe focused tests and its dated handoff. No parallel production writes until exclusive worktree ownership is recorded.

Scope is current AA7 Build completion and internal correctness, separate from analyzer/canonical authoring. No public tests, publication, deployment, real documents, provider calls, migrations or database resets. Preserve default-off production flags and formal security/accessibility/representative evidence distinctions. Supabase remains direct database boundary; Docker worker only.

Acceptance: inspect current code against the current design; reproduce concrete defects before fixes; integrate bounded owner-specific worktree patches; run focused tests then applicable lint/types/build and combined verification. Report exact omissions and evidence tier. Formal release is not implied by internal checks.

## Assigned defect fixes

Backend owns only `app/lib/server/latex-sandbox.ts` and `app/lib/server/build-assist.ts` in its source worktree. Tester owns regression changes only in `tests/unit/latex-sandbox.test.ts` and `tests/unit/build-assist.test.ts` in its sandbox worktree. Current app/tests/scripts baseline transferred explicitly without credentials. Reproduce before patch; backend returns production diff for coordinator review, tester verifies and returns test diffs. Preserve quarantine, supported-source behavior and conservative fact guard. No daemon, providers, hosted DB or public tests needed for these regressions.

Frontend owns only `app/components/LatexPdfPreview.tsx` and `app/components/BuildAiAssistant.tsx` in its refreshed workspace worktree. Two additional reproduced races: PDF getDocument starts after a deferred arrayBuffer resolves following dismissal; Escape keyup reopens the popup after keydown dismisses it. Tester additionally owns `tests/components/LatexPdfPreview.test.tsx` and `tests/components/BuildAiAssistant.test.tsx`. No public/browser service or database is required for these component regressions.

## Integration and regression evidence

Coordinator reviewed and integrated exactly four production files and four test files. Before fixes the regression run had 10 failures / 49 passes; the same 59 cases passed after the fixes. Current-root source checks and focused suites pass: converter 108, AI 95, components 3. Final combined `npm run verify` completed with exit 0 under tester-owned session 24390: 1,203 tests / 145 files, formatting, lint, types, web and worker builds. Current evidence proves internal mocked lifecycle/component safeguards, not live Docker/provider or formal accessibility/security acceptance.

Runtime availability check: the configured Docker Unix socket is absent; `docker version` exits 1. The compiler runtime matrix and pinned image presence cannot be revalidated until Docker is running. No service was started. This is the first observed runtime blocker in this continuation; the overall goal remains active.

## Runtime continuation

The next goal turn rechecked the absent socket and installed Docker.app, then launched Docker locally with `open -a Docker`. Tester polls this existing startup and owns reviewed compiler probes with the exact pinned image and scoped cleanup. No DB container/image build/provider/hosted change is authorized. Backend reviews scanner availability and frontend reviews browser configuration read-only. Previous turn was progress: four fixes plus current-candidate verification; this continuation addresses remaining acceptance evidence.

Fresh runtime verification passed 19/19 groups against the changed startup adapter and exact pinned image; new receipt `docs/evaluation/LATEX_RUNTIME_RECHECK_20261106.json`. All converter containers, including stopped ones, are absent afterward and running inventory is empty. Owner reiterated Docker worker only and managed Supabase for database tests.

Next frontend owns only the two existing e2e files for narrow Escape/toolbar checks and a fresh screenshot path. Tester then owns sequential dedicated-config browser runs with explicit direct-managed target, pre-recorded synthetic ledger and exact cleanup. No model call, Docker DB, schema or public operation. Backend inspects private image-scanner/license options read-only.

## Current browser validation

Three converter scenarios passed on the current candidate: real macro PDF/download and legacy POST, keyboard/mobile buffer/toolbar and stale cancellation. Managed Supabase direct fixtures only. The AI Escape/no-request flow passed functionally, then Axe found a duplicate banner caused by the portal's header element. Coordinator reviewed and integrated a two-line semantic wrapper fix from the frontend owner; tester reruns the three AI cases without exclusions. Supabase SQL connector timed out; exact private test ledger is retained for rate-bucket cleanup, and global rows remain untouched. Authentication fixture cleanup has succeeded for completed attempts. Do not claim all cloud metadata removed until verified.

Cleanup was completed using the refreshed SQL connector: seven recorded owners/sessions and related rows absent, fifteen exact rate keys absent after four-row scoped deletion. Global rows were untouched; private ledger/environment deleted only after verification. Both browser terminal logs passed3/3; no rerun. The private rollback drill passed actual quarantine/precise cleanup/fresh-process recovery; flag-off stage is explicitly a mocked HTTP unit check. The new runnable verifier is registered as `verify:latex:rollback`; see dated browser/rollback receipts.

## Private security evidence

The exact worker-image metadata audit completed without network, mounts or credentials: 222 copyright hashes, 131 parsed DEP5 declarations, 91 explicit non-DEP5 unresolved entries and zero package-lock mismatch. Reviewed script `scripts/audit-latex-licenses.py` is integrated, with a bounded self-check in `check:latex:source`. The rollback verifier is registered as `verify:latex:rollback`; the reviewed actual drill passed.

A temporary, checksum-verified Trivy 0.76.2 scanned the exact image archive under enforced macOS network denial after public DB bootstrap. Raw findings are preserved in `docs/evaluation/AA7_IMAGE_CVE_20261106.json`: 3,632 package matches / 2,462 unique IDs, with four critical and 269 high matches. No suppression, image mutation, upload or release clearance. Temporary tool/archive/databases were removed after durable raw identity verification. Backend vendor/runtime triage remains the next step; particularly the directly used PyPDF2 parser. Raw package severity is not proof of runtime exploitability, nor do functional tests clear it.
