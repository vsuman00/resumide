# AA2 engineering closeout — 2026-10-12

Status: **AA020–AA024 ENGINEERING CLOSED and VERIFIED on localhost; formal Gate AA2 acceptance OPEN.**

The owner requested full AA2 construction and localhost feature testing before cloud deployment. ADR-0012/E-003 authorized engineering after the AA1 engineering closeout. Its exception expires at formal Gate AA2 acceptance or release. The locked AA1 synthetic field gate still fails (92.31% precision, 75% recall), and representative validation/calibration remain deferred. This work preserves that failure: imported facts are unconfirmed, numeric scoring is withheld, and no real candidate data or external OCR/AI provider is used.

| Task  | Implemented result                                                                                                                                       | Local evidence                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| AA020 | Immutable, tenant-bound versions and facts; strict server-owned writer; privacy export/deletion/retention; forward migration and populated restore       | SQL verifier, live local transactions, populated scratch restore                              |
| AA021 | Ordered native/OCR page import into contacts, sections, entries, bullets and skills with exact source citations                                          | Native, mixed OCR and long-line unit fixtures; live import                                    |
| AA022 | Child versions, expected-head concurrency, exact idempotency, append-only events and restore as a new child                                              | Two concurrent live writes, replay/conflict, history and restore checks                       |
| AA023 | Uncertain source proposals stay unconfirmed; exact owner/value confirmation; edits clear stale support; SQL rejects invented/foreign/unsupported content | Forged source, metric, duplicate ID, dangling reference and source-supported insertion checks |
| AA024 | Owner-only private SSR read, paged history, deterministic comparison, historical read-only view and keyboard-accessible review forms                     | Local authenticated browser, accessibility, CSRF, cross-owner and soft-deletion checks        |

The storage foundation is `20261012051515_canonical_resume_draft_storage.sql`; `20261012054243_canonical_resume_transactions.sql` supplies the complete transaction and export functions. The application flag `CANONICAL_AUTHORING_ENABLED` defaults off. Both migrations are required before enabling it. No AA2 migration was applied to hosted Supabase or Vercel.

## Local verification

- A fresh isolated local Supabase reset applies the tracked migrations. `scripts/verify-canonical-storage.sql` passes with rollback-only fixtures. SQL lint reports no schema errors; the local security advisor reports no issues.
- `scripts/verify-canonical-resume.ts` passes **68** assertions against local Auth, Data API and PostgreSQL. It checks one winner for concurrent edits, idempotent replay, rejected tampering without partial writes, privacy export, pending-deletion read revocation, hard deletion and retention cleanup. Its bulk fixture exceeds 1,000 stored facts across immutable versions: the ordinary Data API read returns 1,000 while the export RPC returns the entire canonical history. Zero AI runs are created.
- `scripts/verify-canonical-restore.ts` restores a populated full database into a scratch local database and confirms two canonical versions, content/row parity across four canonical tables, owner RLS, denied client writes/RPC calls and immutable history. This is local populated restore evidence, not hosted recovery evidence.
- `npm run verify:ci` passes: registry signatures, secret/alert/container checks, formatting and lint, **81 Vitest files / 558 tests**, typecheck, web/worker builds, load/restore and Phase 5 benchmark, **47 Chromium browser tests**, and zero production dependency vulnerabilities. The AA2 browser test exercises keyboard import, confirm, edit, compare, restore, historical read-only view, accessibility, foreign-origin rejection and cross-owner isolation. React Router rejects the foreign document action with HTTP 400 before the application action.

All fixtures use disposable `@example.test` users and synthetic content. The AA2 scripts require loopback Supabase and clean up their users. The scratch restore database and dump are removed after verification. Existing user data, local worker sessions and hosted services are outside this AA2 test environment.

Local receipts: `/tmp/resumide-aa2-db-reset-final.log`, `/tmp/resumide-aa2-storage-final.log`, `/tmp/resumide-aa2-integration-final.log`, `/tmp/resumide-aa2-restore-final.log`, `/tmp/resumide-aa2-db-lint-final.log`, `/tmp/resumide-aa2-advisors-final.log`, and `/tmp/resumide-aa2-verify-ci-final.log`. A final database check found zero AA2 fixture users, canonical rows or scratch restore databases. These are local execution logs, not hosted verification receipts.

The local commands ran on the available Node.js 26.5.0 host. GitHub CI is configured for Node.js 22, but no pushed CI run is claimed for these uncommitted changes.

## Remaining gate boundary

AA2 engineering completes the approved task scope, but formal Gate AA2 acceptance is **not claimed**. ADR-0012/E-003 requires the original AA1 dependencies or a separately reviewed replacement decision before that gate or release. The AA1 locked field failure, representative/independent validity, confidence calibration, and production Gate A4 stay open. The candidate workspace therefore shows review states and no numeric scoring. Hosted migration, provider activation, production restore and launch are deferred until the project's final deployment phase.

Design and operations details: [canonical workspace](../design/CANONICAL_RESUME_WORKSPACE.md), [migration discipline](../../supabase/migrations/README.md), [privacy map](../security/PRIVACY_DATA_MAP.md), and [AA1 residuals](AA1_ENGINEERING_CLOSEOUT.md).
