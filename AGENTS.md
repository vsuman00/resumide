# Resumide project instructions

Applies repository-wide. Keep standing rules here, the current task in [CONTEXT.md](CONTEXT.md), and detailed evidence in existing plans and handoffs.

## Start or resume

1. Read `CONTEXT.md`. Check `git status --short`, branch, HEAD, and relevant diffs; unchanged HEAD does not imply unchanged files.
2. Read `CONSTRAINTS.md` sections 1 and 6, the active task and dependencies in `tasks/todo.md`, and applicable sections of `tasks/plan.md`, `ARCHITECTURE.md`, the feature design, and ADR. For Accuracy-v2, include the relevant `tasks/accuracy-authoring-plan.md` section.
3. Verify scope, acceptance criteria, and current owner authorization. Resolve material conflicts before dependent work; continue independent authorized work.
4. Implement the next bounded slice, verify it, update canonical task evidence, then refresh `CONTEXT.md` before handing off.

Load linked sections as needed. Do not preload whole plans, all ADRs, the archive, or transcripts. Context summaries guide discovery; they never replace governing requirements. Follow task dependencies and recorded exceptions. Continuing work does not waive a gate; local engineering approval is distinct from formal acceptance and release.

## Sources and boundaries

- Architecture: `ARCHITECTURE.md`; decisions: `docs/decisions/`; acceptance: `tasks/todo.md`; product contracts: `docs/ATS_SCORING_AND_AUTHORING_SPEC.md`.
- UI: `docs/design/README.md`, `docs/design/PRODUCT_DESIGN_BLUEPRINT.md`, relevant feature design. Evidence: relevant `docs/evaluation/` report. Operations/security: applicable `docs/operations/` and `docs/security/` contracts. `docs/archive/` is historical.
- Preserve candidate-first scope, modular monolith, leased workers, immutable versions, provenance, default-off flags, and server-side ownership/consent/concurrency checks.
- Deterministic versioned rules own numbers; AI provides bounded, validated prose/proposals. Withhold authoritative scores for unsafe or uncalibrated evidence. Candidate confirmation, synthetic regression, representative validity, and release acceptance remain distinct.
- Preserve frozen labels, manifests, thresholds, failed receipts, legacy semantics, and forward-only migrations. Do not fabricate facts, weaken checks, or claim proprietary-ATS/hiring guarantees.
- Keep secrets and resume/JD text, prompts, tokens, and candidate PII out of source, logs, screenshots, telemetry, and handoffs. Check current authorization before hosted changes, real-data/provider use, deployment, or publication.
- Use Node.js 22, npm/lockfile, existing React Router SSR/TypeScript conventions and design tokens. `~/*` maps to `app/*`. Preserve server boundaries; do not edit generated types or add architecture/dependencies outside scope.

## Build and verify

Use commands from `package.json`; inspect actual CI in `.github/workflows/ci.yml`.

- Setup/dev: `npm ci` when needed; `npm run dev`.
- Bug fixes: reproduce first; run the relevant test before/after, e.g. `npm test -- tests/unit/evidence-review.test.ts`. Record unavailable reproduction. Never disable tests, delete assertions, lower thresholds, or add suppressions without the reviewed exception.
- Implementation: relevant feature checks, then `npm run typecheck`, `npm run lint`, and applicable web/worker builds. Coordinate `npm run verify:ci` on the integrated candidate when the environment permits; rerun affected checks after changes.
- Documentation: Markdown formatting, links, command names, and `git diff --check`; application CI is unnecessary for prose-only changes.
- `npm run test:db` resets local Supabase. Use disposable isolated databases; coordinate workers, fixtures, ports, and cleanup. Browser tests claim port 3110 by default. Inspect external-test side effects and authorization first.

Report exact checks, tested revision/dirty scope, evidence tier, failures, and omissions. Green CI does not supply human approval.

## Switching tools or working in parallel

Refresh `CONTEXT.md` before stopping or switching tools: task, authorization, files, verification, failed attempts, and next action. Target 450 words; move detail to [task handoffs](tasks/agent-handoffs/TEMPLATE.md). Keep required constraints even if the target is exceeded. Never store secrets or raw transcripts.

For authorized multi-agent work, read [the coordination workflow](docs/AGENT_WORKFLOW.md). One coordinator owns `CONTEXT.md`, shared plans, contracts, lockfiles, and migration ordering. Assign bounded tasks, explicit file ownership, base revision, acceptance, and services; use separate worktrees for parallel writers. Workers keep separate handoffs. Coordinate overlap, review/integrate diffs, and verify the combined result. Chats, uncommitted files, and services do not synchronize automatically.

## Completion

Preserve unrelated/user/other-agent work. Use focused patches; no reset, clean, bulk-format, staging, commit, push, PR, merge, or deployment without applicable authorization. Update relevant task/design/ADR/runbook when behavior or decisions change.

Keep implemented, verified, owner-accepted, and release-approved states distinct using existing project labels. Apply the installed `clean-user-facing-text` skill to prose while preserving facts, links, code, and quotations. Use `remove-ai-marks` for supported-file inspection or requested provenance removal with health/capability checks. Report unavailable cleaning without blocking unrelated work; never promise undetectability.
