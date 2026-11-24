# Resumide project guide for Claude Code

@AGENTS.md

Resumide (`ResumeATS`) is a candidate-first resume analysis and authoring app. It compares a resume with a job description (JD), shows the evidence behind compatibility and alignment, and helps the candidate make grounded edits. Build is a separate LaTeX-to-PDF workspace with optional AI suggestions.

## Start here

1. Read [CONTEXT.md](CONTEXT.md) for the current handoff. Check `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, and the relevant diffs. The working tree may contain newer changes than `HEAD`. Preserve existing work.
2. Find the requested task in [tasks/todo.md](tasks/todo.md). Read its acceptance criteria, dependencies, and evidence in the [reliability plan](tasks/reliability-remediation-plan.md) and [task graph](tasks/reliability-remediation-plan.json). Use the [main plan](tasks/plan.md) for the original roadmap and the [Accuracy-v2 plan](tasks/accuracy-authoring-plan.md) for `AA` tasks. Reliability stages and Accuracy-v2 phases use separate gates.
3. Read sections 1 and 6 of [CONSTRAINTS.md](CONSTRAINTS.md), then the relevant sections of [ARCHITECTURE.md](ARCHITECTURE.md), the feature design, and the applicable decision record. The shared rules live in the imported [AGENTS.md](AGENTS.md). Load detailed plans and evidence only for the task in scope.
4. Confirm that the current user request authorizes the work. Take one bounded slice, verify the affected path, and record evidence in the task tracker. Refresh `CONTEXT.md` when handing off implementation. Use the [coordination workflow](docs/AGENT_WORKFLOW.md) for authorized parallel work.

## Handoff checkpoint

At the November 22, 2026 handoff, the reliability goal was **paused** on a working tree with changes based on `main` at `a0b2392`. A new session should report or inspect as requested and resume implementation only when the owner asks. Use the current tracker if the checkout has moved on. [Remaining work by stage](tasks/agent-handoffs/2026-11-09-reliability-implementation/remaining-goal-work.md)

- **First parent task to close after resumption is `CR-A01`.** Local extraction and lease checks are recorded. Managed acceptance still needs an approved empty Supabase project, the exact approved schema packet, and a synthetic upload through the real worker. Verify saved evidence, lease recovery, and exact fixture cleanup. [Managed validation action](tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-a01-managed-validation-action.md)
- **Build has real local compiler and Chrome evidence.** Source editing, PDF preview and byte-matched downloads were exercised locally. Managed Build browser execution, live Build AI acceptance, and release-candidate image qualification remain open. The earlier AA7 owner acceptance applies to the worker and scope recorded in its ADR. [Build runbook](docs/operations/LATEX_CONVERTER.md) · [AA7 decision](docs/decisions/0017-aa7-owner-acceptance-and-aa8-start.md)
- **Public launch is on hold.** `CR-G01` covers the integrated consumer journey, `CR-G02` covers opt-in feedback and representative validity, and `CR-G03` covers operations acceptance and the owner's launch decision. The owner handles prelaunch review. Keep services free until the owner resumes billing after testing and feedback. [Launch gates](tasks/todo.md#stage-19-progress) · [Solo review decision](docs/decisions/0018-solo-prerelease-aa8-aa9-verification.md) · [Billing deferral](docs/decisions/0019-phase8-billing-prerequisites.md)

## System map

- Node.js 22, npm, TypeScript, React Router SSR, Vite, and a modular monolith with leased background workers. [Runtime dependencies](package.json) · [Architecture](ARCHITECTURE.md)
- [Route registry](app/routes.ts) maps the UI and resource routes. `app/routes/` owns route handlers, `app/components/` owns UI, and `app/lib/server/` owns server-only logic. `~/*` resolves to `app/*`. Generate route types through the existing tooling.
- The analysis path starts with `/upload` and `POST /api/analyze`. The worker claims queued analyses, extracts document evidence, and publishes guarded stage results. The `/analysis/:id` workspace has evidence, canonical resume, JD requirements, scoring, authoring, and export routes. [Analysis worker](scripts/run-worker.ts) · [Route registry](app/routes.ts)
- Supabase provides PostgreSQL, Auth, and private Storage. Schema evolution is forward-only under [supabase/migrations/](supabase/migrations/). Keep owner, consent, version, lease, and retry checks on the server. Verify privacy changes through the actual export, deletion, and recovery paths. [Privacy worker](scripts/run-privacy-worker.ts) · [Privacy data map](docs/security/PRIVACY_DATA_MAP.md)
- `/build` edits LaTeX and previews a downloadable PDF. `/build/compile` uses the isolated compiler and `/build/suggest` is the separate consent-gated AI entry point. Users can manually upload the downloaded PDF into the checker. Build compilation works independently of analysis and AI. [Build design](docs/design/LATEX_CONVERTER.md) · [Compiler runbook](docs/operations/LATEX_CONVERTER.md)

## Feature contracts and verification records

| Work area                               | Read for the active task                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extraction, OCR, and corrections        | [Evidence review](docs/design/DOCUMENT_EVIDENCE_REVIEW.md), [canonical resume](docs/design/CANONICAL_RESUME_WORKSPACE.md), [OCR protocol](docs/evaluation/OCR_RELIABILITY_PROTOCOL.md), [OCR worker](docs/operations/OCR_WORKER.md)                                                                                                                   |
| JD analysis, ATS scoring, and authoring | [Product scoring and authoring spec](docs/ATS_SCORING_AND_AUTHORING_SPEC.md), [JD review](docs/design/JOB_INTELLIGENCE_REVIEW.md), [scoring review](docs/design/SCORING_V2_REVIEW.md), [authoring workspace](docs/design/CANDIDATE_AUTHORING_WORKSPACE.md)                                                                                            |
| PDF and DOCX exports                    | [Verified core artifacts](docs/design/VERIFIED_CORE_ARTIFACTS.md), [canonical version and rendering decision](docs/decisions/0007-canonical-resume-and-verified-rendering.md)                                                                                                                                                                         |
| UI and accessibility                    | [Design index](docs/design/README.md), [product design blueprint](docs/design/PRODUCT_DESIGN_BLUEPRINT.md), and the relevant feature design                                                                                                                                                                                                           |
| Identity, security, and operations      | [Auth provider contract](docs/decisions/0022-auth-provider-contract.md), [threat model](docs/security/THREAT_MODEL.md), [egress rules](docs/security/EGRESS.md), [managed testing](docs/operations/MANAGED_TESTING.md), [backup and restore](docs/operations/BACKUP_RESTORE.md), [dependency dispositions](docs/evaluation/DEPENDENCY_DISPOSITION.md) |

Versioned deterministic rules own numbers. Keep document compatibility and JD alignment distinct, preserve historical score semantics, and withhold authoritative scores when evidence or calibration is insufficient. AI provides validated prose or reviewable proposals grounded in resume evidence and confirmed facts. Preserve provenance, source versions, frozen benchmarks, and failed receipts. Report what was implemented, what was verified and where, and what still needs owner or release approval.

## Run and verify

Use [package scripts](package.json) and [CI](.github/workflows/ci.yml) for exact commands. `npm run dev` reads local environment configuration and can start the analysis worker alongside the web server. Confirm it points at the intended test environment before starting it.

| Purpose                        | Command                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| Install from the lockfile      | `npm ci`                                                                                         |
| Local UI and worker            | `npm run dev`                                                                                    |
| Focused regression             | `npm test -- tests/unit/evidence-review.test.ts` (replace the test path with the affected suite) |
| Type and lint checks           | `npm run typecheck`, `npm run lint`                                                              |
| Build web, then worker         | `npm run build`, then `npm run build:worker`                                                     |
| Build and Build AI unit checks | `npm run test:latex`, `npm run test:build-ai`                                                    |
| Integrated checks              | `npm run verify:ci` when the required dependencies and authorized test targets are available     |

Use synthetic fixtures by default. Use direct Supabase for approved database and Auth tests, and reserve Docker for worker runtimes. The legacy `npm run test:db` resets a local Docker-backed Supabase database and falls outside the current testing scope. Follow the managed runbook for target approval, schema verification, fixture cleanup, and protected credentials. For browser work, use Chrome or Chrome DevTools. Keep macOS settings and VoiceOver untouched.

Treat any real resume/JD, hosted write, live provider call, Git publication, or deployment as a separately authorized action. Keep secrets, candidate data, and prompts out of commits, logs, screenshots, and handoffs. For documentation-only changes, verify formatting and links and run `git diff --check`.

## Working rules for Claude Code

**Commands** (npm, lockfile `package-lock.json`, Node 22): install `npm ci` · dev `npm run dev` (web + worker, reads `.env`) or `npm run dev:web` · build `npm run build` then `npm run build:worker` · test `npm test` (Vitest; focused: `npm test -- <file>`) · lint `npm run lint` · typecheck `npm run typecheck` · format check `npm run format:check`.

**Coding rules**

- Strict TypeScript; no `any` or non-null assertions where a type guard works. Small functions; follow the surrounding file's conventions.
- No new dependency without owner approval. No edits to files outside the task.
- Before any `supabase/migrations/` change, explain the schema change and wait for approval. Migrations are forward-only.

**Definition of done:** `npm run lint`, `npm run typecheck` and the relevant tests pass. Report files changed, checks run, and remaining risks, and update the task row in `tasks/todo.md`.

**Model and effort policy** (details in [docs/ai-workflow.md](docs/ai-workflow.md))

- `code-explorer` (Haiku, low): read, search, explain, trivial edits.
- `implementer` (Sonnet, medium): approved tasks, bug fixes, tests.
- `architect` (Opus, medium; high only for security, auth, payments, migrations or a failed medium attempt): plans, hard bugs, reviews.

**Token-saving rules:** read only the files the task needs, and read large files by line range (`tasks/todo.md` is 2,000+ lines). Never dump logs, lockfiles, `graphify-out/` or evidence JSON. Work in small verified steps. If the same test fails twice after a fix, stop and report instead of looping.

**Git:** never commit or push unless asked. After each verified change, suggest a Conventional Commit message (`feat(build): ...`, `fix(ocr): ...`).
