# Resumide agent guide

Resumide is a React Router SSR application that combines deterministic ATS compatibility checks with schema-validated qualitative feedback. The current product uses Supabase for authentication, private storage, and durable job state, plus leased workers for analysis and privacy operations.

## Read first

Before changing implementation, read these files in order:

1. [`CONSTRAINTS.md`](CONSTRAINTS.md) for the quality floor and proposed Accuracy-v2 gates. Do not weaken it to make a change pass.
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) for system boundaries and invariants.
3. [`tasks/plan.md`](tasks/plan.md) for the gated implementation sequence.
4. [`tasks/todo.md`](tasks/todo.md) for executable task status and evidence.
5. [`docs/README.md`](docs/README.md) for the documentation map and verification sources.
6. The relevant ADR in [`docs/decisions/`](docs/decisions/).
7. Applicable design documents in [`docs/design/`](docs/design/), including the blueprint and feature contract for the surface being changed.

Standing workspace-owner instruction (2026-10-04): before building anything, follow the applicable plan, todo, architecture, constraints, design and decision documents. Identify the active task and verify its dependencies/approval gates before editing implementation. Resolve contradictions or missing decisions with the owner; do not silently substitute your own sequence, scope or architecture. A request to continue is not permission to skip a documented prerequisite. Update status with implementation, verification and approval evidence kept distinct.

Preserve the status vocabulary used by the project: `IMPLEMENTED`, `VERIFIED`, `PARTIAL`, `TARGET`, `DEFERRED`, and `BLOCKED`. Documentation is not evidence by itself. Do not mark a phase or gate complete without its named automated evidence and required human approval. Hosted deployment, restore, notification sink, rollback, policy, and deployment-owned security controls remain separate external gates where noted.

### Accuracy-v2 sequencing guard

Gate AA0 passed on 2026-10-04 through explicit workspace-owner approval of ADR-0009 candidate 1 at `e629a2882b3cc14a63771ae400f4f67a7e4f3f62`. AA000–AA005 logical design contracts are frozen. AA010/AA011 scoped native conformity is accepted. AA012–AA015 engineering is closed and owner-accepted under ADR-0011, but the frozen held-out synthetic field gate fails. Preserve its locked labels and result; AA1 accuracy, calibration and production Gate A4 remain open. Independent reviewers remain deferred. The owner then approved AA2 engineering under ADR-0012/E-003 after the AA1 engineering wrap-up. The 2026-10-12 instruction is to complete AA020–AA024 and feature-test on localhost before final deployment planning. AA2 engineering is implemented; see `docs/evaluation/AA2_ENGINEERING_CLOSEOUT.md` for its final local verification and formal gate status. E-003 does not authorize formal Gate AA2 acceptance or release while AA1 dependencies are unresolved. Uncertain evidence stays unconfirmed and unscored. Real-data access, external providers, AA2 hosted migration and deployment remain unauthorized. Never infer gate sign-off from green CI. Preserve existing implementation/migrations; do not reset history or roll back schema without a scoped recovery decision.

Current owner direction (2026-10-12): proceed to Phase AA3 after AA2 local engineering. The JD review/persistence/parser and bounded model/taxonomy/market contracts are now implemented for local review. Read `docs/evaluation/AA3_ENGINEERING_STATUS.md` and the first-domain review candidate before extending them. Formal Gate AA3 is not passed: domain review, adopted taxonomy/mapping validation, representative corpus/annotation and calibration remain open. Keep both AA2 and AA3 review paths unscored, flags default-off, and hosted deployment deferred until final project wrap-up. Synthetic regression and adapter checks are not real provider or domain validity evidence.

Current AA4 owner authorization (2026-10-12): “Then go for the AA4 phase, complete it's tasks fully, with full verification.” ADR-0013/E-004 explicitly permits local AA040–AA046 engineering despite the upstream formal gates. Local engineering is complete and verified (653 tests, 49 browser checks, 43 AA4 DB assertions, upstream regressions, populated restore and cleanup); read `docs/evaluation/AA4_ENGINEERING_CLOSEOUT.md` and `docs/design/SCORING_V2_REVIEW.md` for final verification/status. The default-off diagnostics read model writes no scores, binds selected immutable source/canonical/JD versions, rejects stale/unauthorized/deleted inputs and preserves null authoritative dimensions. New model output is cited prose only; compatibility placeholders are hidden and historical numeric values retain legacy labels. E-004 does not permit activation of weights/calibration, real providers/corpora, hosting, release or Git publication. Formal Gate AA4 remains open. Do not require an unavailable independent reviewer to complete the authorized local engineering work, and do not infer formal reviewer acceptance.

Current AA5 owner instruction: “Okay, so go for the next phase AA5,” after disclosure of open Gate AA4. ADR-0014/E-005 authorizes local AA050–AA057 engineering and necessary additive local storage. The owner accepted the AA5 engineering closeout on 2026-10-14 with “I approved.” Local engineering is complete and verified (675 tests, 51 browser checks, 40 authoring DB assertions, upstream regressions, fresh schema lint, populated restore and cleanup). Read `docs/evaluation/AA5_ENGINEERING_CLOSEOUT.md` and `docs/design/CANDIDATE_AUTHORING_WORKSPACE.md`. Authoring is default-off, on the private analysis workspace; actions use source/ownership/CAS/idempotency guards and an immutable ledger with privacy export/deletion/restore. Candidate clarification does not establish source accuracy. Generated patches are limited to strict known-fact reconstructions; no provider/model is adopted. Numeric projections/deltas stay null. Formal AA5 acceptance and upstream gates remain open; hosted deployment/publication remains deferred.

## Stack and layout

- Node.js 22, React 19, React Router 7 framework/SSR mode, TypeScript 5, Vite 6, and Tailwind CSS 4.
- Supabase PostgreSQL, Auth, and private Storage.
- OpenAI Structured Outputs with Zod for qualitative feedback.
- Application code lives in `app/`; server workers and scripts live in `scripts/`; SQL migrations live in `supabase/migrations/`.
- `~/*` resolves to `./app/*`. Generated route types must not be edited by hand.

## Common commands

```bash
npm ci
npm run dev
npm run verify:ci
npm run test:db
npm run test:e2e
npm run test:hosted:phase4
npm run test:hosted:rls
```

Use the focused command that matches the change, then run `npm run verify:ci` before handoff when the environment permits it. Keep `.env` and all secret values local; never commit credentials or place server secrets in browser code.

## Engineering rules

- Keep migrations forward-only and pair schema changes with recovery notes.
- Enforce tenant ownership, consent, private storage, same-origin checks, and bounded inputs at the server boundary.
- Keep resume text, prompts, tokens, and other PII out of logs, metrics, and client telemetry.
- Treat deterministic scoring and parse evidence as the source of truth; AI feedback is bounded and schema-validated.
- Preserve unrelated dirty work. Use `apply_patch` for focused edits and do not reset or clean user-owned files.
- Update the appropriate plan, task, ADR, or runbook when behavior or an operational decision changes.
- Review links and status claims whenever documentation moves.

Current AA6 owner instruction (2026-10-14): “Go to next phase AA6, start implementation completly.” ADR-0015/E-006 authorizes local synthetic AA060–AA065 engineering. Read `docs/evaluation/AA6_ENGINEERING_CLOSEOUT.md` and `tasks/aa6-local-engineering-plan.md`. The default-off private preview/PDF/DOCX path uses one canonical plan and independent parse-back, with current-owner/version checks before download. Local parity tests do not establish approved-viewer, assistive-technology, representative-corpus or formal Gate AA6 acceptance. No hosted migration, deployment or publication is authorized.
