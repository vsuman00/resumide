# AA8 and AA9 full-completion coordinator

Objective: complete AA8 and AA9 fully with full verification. The owner has clarified the current completion scope through [ADR-0018](../../docs/decisions/0018-solo-prerelease-aa8-aa9-verification.md): solo owner, subagent technical reviews, full prerelease software/workflow implementation and synthetic/AI-assisted verification; real customer/vendor/recruiter testing and owner launch review are deferred to demo/RC/pre-launch. Keep the full engineering scope, not just validator scaffolding. Preserve honest provenance and do not claim representative/human/customer evidence from these tests.

Base: main a0b239299d75b0bd64b588fe743ebe2975fb28b9 with existing dirty work preserved. Gate AA7 is owner-accepted; no AA7 reruns. Node.js 22, existing dependencies and monolith conventions. Root owns shared docs/contracts/package scripts/lockfiles/integration. No commits, deployments, hosted migrations, raw-data collection/provider calls or external messages have been authorized by a named target yet. Supabase directly if later authorized storage/testing is required; never Docker DB/reset. Current concrete data authority is synthetic-only. No representative corpus or authorized vendor/pilot environment is present. The owner answered the input request: stop requiring a team or actual customer pilot now; use subagents as reviewers and defer real-world testing. No further external-prerequisite requests during this scope.

## Full requirement trace and deferred real-world evidence

| Task | Required completion evidence | Current state |
| --- | --- | --- |
| AA080 | Permitted representative planning sample; rights/privacy/provenance audit; actual access/deletion controls; coverage and gaps | Metadata foundation tested; real acquisition/governance evidence absent |
| AA081 | Two trained independent human annotations, blinded adjudication, agreement by family at approved floor | Missing actual annotations; software support not implemented |
| AA082 | Immutable disjoint partitions; person/employer/template/near-duplicate leakage controls and audited locked access | Not implemented/executed |
| AA083 | Reproducible development/calibration-only policy proposal, sensitivity and rollback with no locked-label access | Not implemented/executed |
| AA084 | Locked end-to-end per-segment results for all declared dimensions, bootstrap bounds, any failed segment fails | No representative locked execution |
| AA085 | Versioned evidence/cards/limitations and independent claim approvals | No publishable representative evidence; no publication authorization |
| AA086 | Only achieved segments/claims promoted with monitor/stop/rollback controls | Domain-valid promotion forbidden pending evidence |
| AA090 | Transparent recruiter protocol covering notice, override, correction/appeal, retention, audit, stop conditions; required owner approvals | Not implemented/approved |
| AA091 | Named authorized vendor/version/config ingestion observations, permitted docs, raw evidence, scoped repeatability | No authorized vendor supplied/executed |
| AA092 | Actual allowlisted recruiter/career-center pilot, measured required outcomes and independent scoped review | No participant/partner supplied/executed |

## First parallel implementation batch

These are software supports and synthetic engineering tests, not execution or completion of unmet phase dependencies.

- Backend agent aa7_review, licenses worktree: app/lib/server/evaluation-annotation.ts and tests/unit/evaluation-annotation.test.ts; own handoff. Independent/blinded label/adjudication contract, measurable agreement and honest eligibility. No raw labels in logs; fixed safe reports.
- Partition agent aa7_validation, sandbox worktree: app/lib/server/evaluation-partitions.ts and tests/unit/evaluation-partitions.test.ts; own handoff. Versioned immutable deterministic locks, all required group/hash leakage checks, locked-test access denial for calibration.
- Pilot agent aa7_frontend_review, accessible-preview worktree: app/lib/server/pilot-evidence.ts and tests/unit/pilot-evidence.test.ts plus docs/design/RECRUITER_VENDOR_PILOT.md; own handoff. Concrete advisory protocol and named observation contracts; no automated rejection/proprietary-score inference or fabricated pilot readiness.

Each agent owns only named files, coordinates exported contracts before dependent imports and returns focused code/test evidence. Existing evaluation-corpus.ts stays frozen unless root assigns a concrete integration change. Keep source and tests bounded and actionable; no generic framework or review loop. Root independently reviews/integrates, runs affected tests once and fixes actual failures. Subsequent work must address the full ledger, not merely mark scaffold tests as phase completion.


## Owner amendment and current gate policy

ADR-0018 supersedes the original external-team/real-pilot execution prerequisites for current engineering completion. The original rows above retain the future evidence needed for those exact empirical claims; they do not justify blocking current software work. Required current modules/drivers must actually operate and be verified end to end. Annotation, partition and pilot agents now implement explicit engineering readiness plus real future authority paths. Global domain/vendor/customer/release claims remain unpromoted. After this batch, finish the remaining intake/calibration/evaluation/evidence/monitoring/operational workflows and perform cross-agent technical review; don't mark the goal complete merely because three modules pass unit tests.

## Integrated batch 1 update

Annotation/partition integration passes 43 tests; independent AI annotation review passed on the recorded hashes. Pilot evidence source `1ff50232e5925e2b009eddb91dfedcc610600a75de65a6e62ef4a8c2b60477cf` and its 26 tests are integrated and pass. Calibration source `40bb3e75dc472e716dd264a832474c1eeeff8e44cebe8a2a03be813ad58dd3da` and its 12 tests are integrated and pass. These are current source/runtime contract checks, not a customer or domain-validity result. Calibration cannot read locked labels or gain credit from missing feature weight.

Next ownership: backend finishes pilot cross-review then operational pilot state machine; validation agent finishes actual storage/audit byte lifecycle ports then the synthetic end-to-end driver; frontend/evaluation agent finishes partition cross-review then clustered statistics and locked evaluation runner. Root integrates and owns shared acceptance evidence. Evidence/claim promotion and monitor controls are still required; do not close the goal on the current 81 new contract tests.

## Final disposition — 2026-11-07

The owner-amended AA8/AA9 prerelease engineering objective is complete. All current software slices and workflows, real cross-agent reviews and applicable verification are finished. The original empirical ledger above remains the deferred claim/research checklist, not an absent-team blocker. See the [canonical closeout](../../docs/evaluation/AA8_AA9_ENGINEERING_CLOSEOUT_20261107.md), [615-input verification](../../docs/evaluation/AA8_AA9_ENGINEERING_VERIFICATION_20261107.json), [actual synthetic workflow](../../docs/evaluation/AA8_AA9_WORKFLOW_20261107.json), [reviewed Regression-tested successor](../../docs/evaluation/AA8_AA9_REVIEWED_CLAIM_20261107.json) and [final manifest](2026-11-07-aa8-aa9-closeout/final-manifest.json).

All 1,438 tests passed; the later test-mock TypeScript error was repaired without runtime/assertion changes and its 17 affected tests plus source/type/web/worker/CLI checks passed. The nonzero original command, fixture/dispatch observations and actual race RED/GREEN receipts remain. Final app source did not drift. Actual Supabase cleanup is independently SQL-verified and exact owned local scratch was removed.

Actual AI review was registered after observing the corrected runtime, not invented during its execution. It permits only the exact synthetic regression meaning in a new immutable metadata card; no higher claim, public activation or deployment. The original blocked card and all unknown/insufficient numeric cells are unchanged. Customer/vendor/representative studies and owner launch review stay deferred as directed.

AA7 source is separately published on chore/aa7-closeout-20261107 at071828f, synchronized with GitHub; main/dirty work is preserved and AA8/AA9 stays local. Deployment remains disabled. No current task, review or service remains running. Await the next owner-selected phase; do not begin release or repeat closed checks automatically.
