# Stages 1 through 9 verification checkpoint

The rollout plan remains open. This batch advanced upload tracking for stage 1, ran the engineering benchmarks for stages 2 through 4, verified a real OCR development profile for stage 5, and verified Auth and database isolation for stage 7 on the restarted Supabase project. The work is based on dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. [Test evidence](stages-1-to-9-resume-evidence.json).

## Upload tracking and account deletion

The bound upload route enrolls each new tracked attempt in the same transaction as preparation. It takes a single-use dispatch grant before writing to Supabase Storage. It records an acknowledgement only after Storage returns the expected bucket and key with a valid object ID. The database requires that receipt before a tracked upload can be adopted. An uncertain dispatch grant stops the upload. An uncertain Storage result or acknowledgement stops adoption and leaves records available for reconciliation. The migrated database checks ownership, serializes the dispatch against deletion, permits a late acknowledgement of an existing attempt, and includes transport evidence in account exports. Older uploads remain outside the tracked protocol and keep their unknown status. The earlier deletion hold remains in force. [Migration](../../../supabase/migrations/20261121130718_analysis_admission_upload_transport.sql) · [Ingestion](../../../app/lib/server/analysis-ingestion.ts).

The dispatch-order test reproduced the missing evidence before the change. Focused tests passed after it. A disposable PostgreSQL 17 fixture verified the real function bodies for scope, single use, replay, late acknowledgements, export and direct privileges. It used a private socket and synthetic support tables. The tracked acknowledgement is evidence about an observed upload response. Physical object deletion, reconciliation of older unknown writes and final erasure still require their own proof. [Fixture](admission-transport-native-fixture.py.txt).

## Database, Auth and local verification

Resumide reports `ACTIVE_HEALTHY` and the hosted PostgreSQL server responded. Its migration history reports 33 entries and its catalogue lacks admission tracking and the owner write fence. The project served two synthetic password sign-ins, workspace bootstrap, owner reads, cross-tenant denial and global sign-out with cleared client sessions. A separate read-only SQL query found zero remaining fixture Auth users, sessions, profiles, workspaces, memberships and privacy requests. The configured project received fixture writes only. Its schema and deployment were untouched. [Probe source](managed-auth-synthetic-probe.mjs.txt).

Local checks passed with **6,752 tests across 323 files**, TypeScript, lint with four existing warnings, both builds, all 13 formatting and source/configuration checks, and five engineering benchmarks. The benchmark reports retain their release failures and missing evidence. Canonical PDF/DOCX parity passed 20 cases. It exercises canonical artifact rendering. The standalone LaTeX converter has a separate runtime gate.

The fresh OCR image is 370,412,050 bytes. The isolated smoke passed for scanned, mixed and native routes. The default 300 DPI run failed the quality threshold at 94.66% exact line agreement for clean and mixed documents. The documented PSM 3 and 150 DPI profile achieved 100% exact-position line agreement and 0% character error across nine synthetic development documents in three, three-document segments. Both receipts are retained. Real upload integration and locked and representative validation remain open. All test containers were removed. The pinned compiler candidate and historical baseline are absent after Docker cleanup.

## Remaining acceptance by stage

The latest [CR-A01 checkpoint](cr-a01-extraction-closeout.md) adds bounded native extraction, actual SQL function checks and 12 locked synthetic OCR passes. The source checks for native layout, OCR and phases AA2 through AA5 passed, along with the alert and container checks. Six local benchmarks passed for extraction/scoring fixtures, native layout, JD intelligence, scoring validity, writer grounding and render parity. Synthetic load and restore passed.

Local Chrome passed 29 public and signed-out smoke and accessibility cases. The run covered the mobile menu, keyboard and file states, five upload widths, dark-mode layouts, sign-in recovery and six automated axe scans. Supabase readiness and authenticated journeys remain open. An initial harness attempt routed local traffic to its deny proxy. Adding the loopback bypass corrected the harness, and the tests ran without changes to their assertions. [Verification receipt](cr-a01-extraction-verification.json).

| Stage | Remaining acceptance                                                                                                                                     |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Reconcile unknown uploads, verify exact physical cleanup and erasure, and prove the newer schema and worker lifecycle on an isolated managed target.     |
| 2     | Prove persisted correction, re-import, confirmation and stale/deletion recovery through the actual app.                                                  |
| 3     | Verify JD and score admission against current managed persistence and complete the applicable locked calibration and policy evidence.                    |
| 4     | Run current AI and authoring acceptance, including useful grounded edits and the three JD browser journeys.                                              |
| 5     | Admit actual OCR for uploads and clear the remaining locked field and document gates.                                                                    |
| 6     | Restore the exact LaTeX runtime images within the disk budget, verify real compile and compare results, and exercise Build in the browser.               |
| 7     | Finish account erasure and verified history, exports, mobile/accessibility and operational alerts. The hosted password Auth and tenant checks are green. |
| 8     | Run integrated consumer acceptance, actual capacity, restore and rollback drills in a safe target.                                                       |
| 9     | Obtain opt-in and representative evidence and complete operations and owner release acceptance.                                                          |

The first 80 migrations are byte-identical to the earlier packet. The inventory now identifies the exact three successors and pins all 83 revisions. The empty managed target and authorization for those schema operations remain outstanding. The restarted configured project is suitable for scoped Auth and baseline database checks. It has no isolated development branch. Deployment stays on hold. [Migration inventory](managed-schema-successor-inventory.json) · [Managed schema plan](native-schema-action.md).
