# AA8 completion audit and bounded authority repair

Audit started 2026-11-07 17:21:37 UTC; `2026-11-08` in this filename is the run identifier. ROOT is authoritative: main, HEAD `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, extensive dirty work preserved. Read ROOT AGENTS.md, CONTEXT.md, constraints, coordination workflow, AA080–AA086, ADR-0018, the architecture and current evidence. No services, hosted operations, provider calls, AA7 rechecks, commit or deployment occurred.

## Governing scope and current evidence

ADR-0018 requires complete prerelease software and synthetic execution with sole-owner accountability and actual AI technical review. Representative/customer research, independent-human annotation, named-vendor/recruiter studies and owner launch review are deferred, not fabricated or current team blockers. Deployment remains explicitly stopped.

At the audit snapshot, all 615 current ROOT source hashes matched `AA8_AA9_ENGINEERING_VERIFICATION_20261107.json`; zero missing files or drift. That immutable receipt is SHA256 `2babdfb5f8f33261bdd0cb865031c75afa9acfd04826c010838f60b88c4a1960`. It records 1,438 tests/160 files passing, followed by an outer TypeScript failure in a test mock. Its type-only repair, 17 affected tests, source/type/web/worker/CLI recovery checks passed. The original exit 2 is preserved. Full verify:ci and accepted AA7 checks were intentionally not repeated.

The current actual workflow receipt is SHA256 `9d641194909ef59ee147909a1ab4e2892696a304047f941a51b5bba9f10fffe7`: 20 synthetic documents, eight locked, one PDF plus one DOCX export, 12 engineering checks and 11 pilot controls. Forty numeric cells remain four exact-observed, fourteen insufficient-cluster and twenty-two withheld; no representative numeric gate passed. The reviewed successor is SHA256 `e655838922bf9c21eaca80e51de0cf468a928533118bc4bf4f4ad32c9988700d`: Regression-tested only, higher eligibility and activation false, missing-signal stop/rollback retained.

## Task-by-task audit

| Task | Current ROOT software and evidence | Missing engineering item at audit |
| --- | --- | --- |
| AA080 | `evaluation-corpus.ts` metadata/access/lifecycle; `EvaluationCorpusDrill` byte/hash/audit/revoke/delete ports; 44 metadata and 17 lifecycle tests. Direct Supabase receipt `4cdc5a0a…` has 12 checks, two synthetic owners, two neutral PDFs, 11 audit rows and independently verified zero exact remnants. | One confirmed gap: the intake contract could never admit a future authorized non-synthetic record. Bounded repair described below; no real acquisition required. |
| AA081 | `evaluation-annotation.ts` (`d3f7246c…`), 16 tests: original submission/source/handbook hashes, separate adjudication, seven families, actual agreement, undefined/insufficient failure, AI engineering and trusted future human path. | No additional concrete gap established. Actual human annotation is deferred research. |
| AA082 | `evaluation-partitions.ts` (`199ce3fa…`), 27 tests: immutable locks, all declared leakage groups, group access, calibration locked-label denial and fresh bindings. Actual workflow preserves split access. | No additional concrete gap established. Representative membership/independence evidence remains deferred. |
| AA083 | `evaluation-calibration.ts` (`40bb3e75…`), 12 tests and actual development/calibration fitting: per-dimension choices, penalties, sensitivity, rejected alternatives, hashes and rollback version. Locked reader is never called for fitting. | No additional concrete gap established. Production policy adoption is intentionally absent. |
| AA084 | Statistics (`ca8c4dba…`), runner (`ea49f47a…`), 24 tests plus three actual workflow integration tests: whole clusters, 10,000 draws, ranks, exact coverage, null withholding and every-segment failure. | No additional concrete gap established. Null cost/fairness/coverage and failed numeric gates are disclosed measurements, not passing empirical validity or missing generic gate handling. |
| AA085 | Claim/card module (`0984b34d…`), 10 tests; local dataset/ruleset/model/evidence cards, exact five claim levels, trusted execution/review and the actual reviewed synthetic successor. | No additional concrete gap established. Public publication and higher claims remain unauthorized/deferred. |
| AA086 | Same tested claim module: complete finite/fresh signals, all required monitors, expiry/revocation/drift/failure stop and immutable previous-version rollback proposal. Actual missing-signal run stops. | No additional concrete gap established. Live production monitors/flags are not activated under the deployment hold. |

## Confirmed AA080 gap and authorized repair

ROOT's original `evaluation-corpus.ts:108` unconditionally returned UNAUTHORIZED_SOURCE for every non-synthetic kind. The public assessor had only three arguments, and the drill ports had no authority context. Therefore even future approved rights could not use intake without changing software. This conflicts with ADR-0018's requirement to support future authorized evidence paths. Today's default denial was correct; the missing part was a trusted opt-in path, not real-data collection or permission approval.

The coordinator confirmed the gap must close and reassigned exactly four files. I copied their current ROOT baselines, including the repaired drill-test `key: string` annotation. The minimal future-metadata regression reproduced admittedCount 0 with a trusted authority; the existing 44 tests still passed.

The repair adds `EvaluationCorpusAuthority.authorize`, `EvaluationCorpusAuthorization`, `hashEvaluationCorpusRecord` and `REPRESENTATIVE_CORPUS_PURPOSE = representative_corpus_evaluation`. The optional in-process authority binds the entire schema-normalized record hash, ID/content/source kind, permission/license/purpose, authenticated caller group set and explicit clock. No authority, a thrown callback, JSON boolean or non-true result retains UNAUTHORIZED_SOURCE. Neither upload consent nor qualitative/synthetic AI consent authorizes representative intake. All existing scope, state, expiry, retention, access and duplicate guards remain. Real metadata need not claim fictional identities; synthetic semantics stay unchanged. Admission still grants no representative validity or release claim.

The drill forwards optional `ports.authority`. Its existing post-await read check now consults that live authority, so revocation during download or terminal audit returns no bytes. Cleanup of exact owned objects remains possible after rights withdrawal. No actual real data, storage or provider was used; all new tests use fictional metadata and neutral in-memory bytes.

Frozen candidate hashes:

- `app/lib/server/evaluation-corpus.ts`: `da9a90eb3595420289a717a256c809696a879428ae13da1c5be967fe28db5331`.
- `app/lib/server/evaluation-corpus-drill.ts`: `da87f4ca787e164afcc2999cbba5cc3cc7360c63746421a311f268e8d74dd4f0`.
- `tests/unit/evaluation-corpus.test.ts`: `5ea0cb1ac7715d6decc3c8f9c8b7e0d57efadb2f2abe0bb94d53e4249d465498`.
- `tests/unit/evaluation-corpus-drill.test.ts`: `313488a4271c1781fd22243f8e3d7fd11c8ae2cd91e9dc3eea32b2460b7e3b7f`.

Actual focused result: 76 tests pass, preserving all original 44+17 tests. ESLint, Prettier and diff checks pass. Strict standalone TypeScript passes with the repository's allowImportingTsExtensions option; its first invocation omitted that option and produced TS5097, without a product source failure. Node is 22.23.4. A ROOT fixture symlink serves only as a read-only worktree dependency and is not an integration file. ROOT integration, peer review and one integrated verify/CLI run remain coordinator-owned; the old 615-source receipt must not be relabelled as testing this patch.

## Checkboxes and requested files

At audit start, tutorial.md and plan.plan.md were absent; the coordinator created them during this run. They now index the canonical task/plan/evidence records and distinguish completed software from deferred studies. `tasks/todo.md` already marks AA080–AA086 prerelease work and the current engineering gate complete. Its two open Gate AA8 empirical boxes mean representative lower-bound/construct review and permission to use a domain-level claim; they must not be checked as achieved merely to clear the display.

`tasks/accuracy-authoring-plan.md` explicitly records current prerelease completion and separate empirical gates. `tasks/plan.md` also has unrelated MVP Phase 8 billing and Phase 9 enterprise work; these are not AA8/AA9 and should not be marked complete by this request. The new index files should retain their links rather than become a competing task ledger.

Conclusion: one bounded current software omission was found and repaired in the isolated candidate. No other AA080–AA086 engineering gap was established. Keep the completion label conditional on integrating and verifying these four exact changes, then update the evidence bridge. Preserve deferred research/launch checkboxes, failed receipts, higher-claim denial and deployment STOP. No broader audit or repeated accepted checks is proposed.
