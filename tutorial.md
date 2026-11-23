# AA8/AA9 local workflow tutorial

Status: **prerelease engineering complete and verified, 2026-11-07**. This guide explains how to inspect and, when needed, reproduce the synthetic local workflow. It is an index of existing implementation and evidence, not a replacement for [tasks/todo.md](tasks/todo.md), [tasks/accuracy-authoring-plan.md](tasks/accuracy-authoring-plan.md) or [tasks/plan.md](tasks/plan.md). [plan.plan.md](plan.plan.md) lists each completed task.

## Understand the completion scope

[ADR-0018](docs/decisions/0018-solo-prerelease-aa8-aa9-verification.md) defines the owner's solo prerelease scope: the complete software/workflow is implemented, exercised with synthetic data and technically reviewed by AI subagents. One owner holds accountability. AI review and known-truth synthetic labels are not independent-human research.

Both current engineering gates are complete. Representative/customer studies, actual named-vendor/recruiter runs and owner launch review are deferred to demo/RC/pre-launch in the [release-readiness backlog](tasks/aa8-aa9-release-readiness.md). Those experiments have not happened. This does not authorize a higher validation claim, publication or deployment.

## Completion record

This mirrors the task-by-task evidence in [plan.plan.md](plan.plan.md) and the canonical [task ledger](tasks/todo.md).

- [x] AA080: permission-aware corpus intake and byte lifecycle.
- [x] AA081: annotation, adjudication and agreement.
- [x] AA082: immutable partitions and restricted locked access.
- [x] AA083: development/calibration-only fitting.
- [x] AA084: locked workflow evaluation and uncertainty/failure handling.
- [x] AA085: versioned evidence, limitations and claim authority.
- [x] AA086: monitoring, stop and rollback.
- [x] AA090: transparent advisory protocol.
- [x] AA091: controlled ingestion-comparison capability.
- [x] AA092: complete local advisory-pilot workflow.
- [x] Gate AA8: current prerelease engineering acceptance.
- [x] Gate AA9: current prerelease engineering acceptance.

The deferred real-world claim gates remain in the release-readiness backlog; these completed software entries do not assert that those experiments took place.

## Inspect the recorded run first

Read the [engineering closeout](docs/evaluation/AA8_AA9_ENGINEERING_CLOSEOUT_20261107.md), [verification receipt](docs/evaluation/AA8_AA9_ENGINEERING_VERIFICATION_20261107.json), [workflow receipt](docs/evaluation/AA8_AA9_WORKFLOW_20261107.json) and [versioned cards](docs/evaluation/AA8_AA9_PRERELEASE_CARDS_20261107.md). They bind the tested code, runtime inputs, fixtures, calibration and report. An unchanged Git HEAD alone does not establish unchanged source files.

The recorded workflow uses 20 synthetic documents: eight development, four calibration and eight locked. The locked cohorts contain four native, two simulated scanned and two simulated mixed documents. Three authored composition families share a serializer and common provenance; they are not independent samples. Empty-page controls are not real OCR scans.

All 12 engineering checks and 11 pilot controls passed, including actual PDF/DOCX export checks. All 40 statistical cells retain their original outcomes: 22 withheld, 14 insufficient-cluster and four exact observed-safety cells. The locked family forms one correlated cluster. No representative numeric gate or population interval passed. Compute cost is unknown, not zero; simulated scan and render checks do not establish real OCR or complete render coverage.

The actual application path covers extraction, document evidence, canonical content, public-JD requirements, deterministic diagnostics, grounded writer proposals, exports and a restricted locked reader. Calibration fits three separate offline dimensions without locked-label access. It does not replace the production draft policy or expose withheld authoritative scores. No live LLM/provider request was made.

## Reproduce only when needed

Use Node.js 22 and the existing npm lockfile from the repository root. Check `node --version` before running commands. If dependencies are absent in a fresh checkout, use `npm ci`; no new dependency is required. Preserve existing dirty work and coordinate any shared services. Reading the evidence requires no test execution, and the completed run need not be repeated merely to confirm it is still green.

For a deliberate local synthetic workflow reproduction:

```bash
npm run verify:aa8:workflow
```

The registered script selects the private verification harness, disables AI and passes `--run-local-evaluation`. It uses fictional local fixtures, not a real corpus, a live vendor or the Supabase storage drill. Inspect its JSON result for engineering checks, per-segment cells, unknowns, limitations and claim status. Do not fill `null` slots with zero or change thresholds to make a gate pass. The private harness marker disables dotenv loading; it does not grant data/provider authority.

For changed AA8/AA9 source, the existing focused commands are:

```bash
npm run check:aa8:source
npm run check:aa9:source
npm run test:aa8
npm run test:aa9
```

The coordinator chooses affected checks and integration verification. The project's `npm run verify` includes static checks, the full unit suite, types, web build and worker build. Web builds clear worker output, so build web before worker when invoking builds separately. Do not start an AA7 browser/runtime/image rescan or repeat full CI for a documentation edit.

The latest [completion verification](docs/evaluation/AA8_AA9_COMPLETION_TRACKING_20261107.json) passes 1,453 tests across 160 files, source checks, lint, types, web/worker builds and the local CLI on the repaired intake implementation.

The earlier stored verification contains 1,438 passing tests across 160 files. Its first combined command exited 2 after the tests because of a test-mock TypeScript annotation error. The type-only repair, 17 affected tests, source/type checks, web/worker builds and final CLI passed. The failed command and logs remain; they were not relabeled successful. No new test run is claimed by this guide.

## Future authorized intake

AA080 includes an optional trusted server authority for future permitted non-synthetic sources. Exact record/source/rights/actor/time bindings and the explicit representative-corpus purpose are required. The default CLI cannot grant that authority; JSON flags or ordinary upload/AI consent cannot authorize reuse. The local workflow remains synthetic. This capability was tested with metadata and mocked storage only; it does not authorize collecting real resumes now. Current-source verification is recorded in the [completion reconciliation](docs/evaluation/AA8_AA9_COMPLETION_TRACKING_20261107.json).

## Keep live storage separate

The [direct-Supabase drill receipt](docs/evaluation/AA8_STORAGE_DRILL_20261107.json) records 12 passing checks, two synthetic owners, two neutral PDFs and 11 audit rows. Independent exact SQL checks confirmed zero remaining objects, owners, audit rows and organizations.

That was a separately authorized hosted test. Do not include `verify:aa8:storage` in the default local reproduction or reuse its expired private allocation. A future live drill needs an approved target, secure configuration, fresh private ledger and exact cleanup/independent absence verification. Use Supabase directly; Docker is worker-only, never the application database. Do not run a reset or migration to reproduce the local workflow.

## Interpret claims and the hold

The original workflow's pending-review card remains blocked. Actual post-run AI technical review produced a [new bound Regression-tested card](docs/evaluation/AA8_AA9_REVIEWED_CLAIM_20261107.json). Its eligibility means the exact synthetic regression was executed and reviewed, not that its unknown or insufficient numeric cells passed. Higher-claim eligibility and activation remain false. Missing monitor signals correctly propose stop and rollback.

Corpus-validated, Domain-validated, Vendor-observed and Outcome-calibrated claims remain unachieved. Future evidence must pass its trusted authority, sample, segment, review and specific vendor/outcome requirements. The advisory workflow retains notice, visible rubric, human override/rationale, corrections/appeals, audit, retention, stop and rollback; it does not permit hidden scores or automatic rejection.

Deployment remains explicitly on hold. AA8/AA9 changes are local; the separate AA7 publication did not authorize merging, deploying or publishing this work. Follow [CONTEXT.md](CONTEXT.md) and the release-readiness backlog for the next owner-selected action.
