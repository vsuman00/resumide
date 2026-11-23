# Document-review page-count repair

Status: **VERIFIED_LOCAL source repair; Native and consumer acceptance OPEN.** CR-A01-S04 remains PARTIAL. No database migration, browser, provider, PDF parser or worker service ran. Services remain free; deployment stays HOLD.

## Problem and resulting behavior

The review extraction branch returned an evidence envelope while discarding the parser's declared PDF total. It persisted no source `page_count`, unlike the legacy extraction branch. The strict JD authoring reader correctly refuses unknown or mismatched coverage. This made a fresh review-path analysis a source-level counterexample to the intended upload-to-authoring journey. Real-record prevalence remains unmeasured.

The regression exercised actual extraction-stage and review/reconciliation logic with controlled PDF-layer output. Both legacy and fenced transports omitted the declared count even though the resulting envelope contained both pages: **two failures, thirteen existing cases passing**. This was a product failure, not a missing mock or module.

The repair carries the actual declared count from the same parser invocation, outside the immutable evidence envelope. The old envelope-only extraction API remains available. Current complete page boundaries, including blank pages, must agree with the declared integer total and configured limit. The one-page aggregate fallback retains its existing semantics; missing multipage boundaries are refused. No second extraction, default count or historical inference is added.

The new SQL source adds an explicit five-argument persistence overload while preserving the four-argument function. It validates actual source/owner/organization/checksum, active root, privacy and page consistency. Evidence and a previously unknown count are written in one exception-protected operation; known conflicts and old-attempt replay with unknown metadata are refused. The fenced dispatcher retains its old exact key set and accepts the new exact count-bearing set, with pre/post lease checks and rollback on refusal. The source grants only the existing worker's `service_role` authority to the new overload, denying public and user roles. No hosted grant has occurred.

Startup now requests the new catalogue capability whenever evidence review is selected, in both fencing modes. Both entrypoints forward that selection explicitly. Missing functions, source-pin drift, denied required execution, timeout or cancellation prevent queue construction. Review disabled retains the legacy selection. No feature default or scoring policy changed.

## Verification and preserved failures

The integrated run executed **481 affected tests in 18 files**, scoped formatting, full type checking, full lint and web/worker builds. All six commands exited zero; all 481 test cases passed, with no failed or pending cases. Root reconciled 1,007 bound inputs, logs, the raw report, current artifacts and six absent command groups plus the controller. Seventeen allocated files are integrated; nine prior raw inputs changed, 980 remained unchanged, and all 80 historical migration files are untouched.

The controller itself exited one and recorded FAILED_OR_INCOMPLETE: its four-step predecessor count had not been updated for the six configured commands. That receipt remains unchanged. Root corrected only `commands.length === 4` to `commands.length === 6`, preserved the old controller bytes, and independently checked every command and assertion. Two agent reviews ACKed that reconciliation. No application/test source changed afterward, and no unchanged tests or builds were repeated. This is reconciled affected-check evidence, not a fresh full-suite or a successful rerun of the repaired controller.

- [Original integrated receipt](document-page-count-61576f59-f19d-4759-8bd1-b25e18e02070.json), [reconciled review](document-page-count-integrated-review.json), [allocation and source bindings](document-page-count-integration.json).
- [Actual source-derived readiness profile](document-page-count-profile-binding.json), [CLI migration allocation](document-page-count-migration-allocation.json), [archived author packets](document-page-count-evidence-archives.json).
- [Extraction handoff](document-page-count-backend.md), [startup handoff](document-page-count-startup.md), [SQL/readiness handoff](document-page-count-runtime.md), [independent consumer handoff](evidence-page-count-frontend.md).

Separate author results are 56/3 extraction cases, 9/1 startup cases, 152/2 readiness/SQL-source cases and 12/1 consumer cases. They are not added to the integrated 481. The startup predecessor had six new selector failures with its three old cases passing; readiness had two new failures with 108 old cases passing. Formatting/lint failures are preserved. Original assertion blocks remain. Review also found a trigger-catalogue omission: both privacy trigger checks now require no `WHEN` condition, and the zero-argument deletion trigger requires empty arguments. No fabricated product RED is claimed for that source-review finding.

## Native execution and next action

The new migration is [20261117060054_document_evidence_page_count.sql](../../../supabase/migrations/20261117060054_document_evidence_page_count.sql), SHA-256 `f3c88c69d760ed3de8e1b7ecd44e72da84628f6589f19366c4bee3fd11e42f77`. It remains **UNPARSED / UNEXECUTED**. The trusted profile binds its actual writer, checker and metadata source bodies; those pins do not prove actual catalogue state or transaction behavior.

The existing [80-migration schema packet](native-schema-action.md) remains a separate frozen baseline operation awaiting a target/owner decision. This new 81st migration and its grants are outside that packet and are not implicitly approved. A matched worker must not be launched against the older schema: the new startup check is intended to refuse it. Keep the target isolated, use Supabase directly and never start/reset a Docker database.

After target and exact SQL approval, verify actual catalogue/ACLs, atomic false/error rollback, known-count conflict, old unknown replay, real fresh extraction, lease expiry/races, deletion fencing and cleanup. Then resume the real upload/import/confirmation/JD/accept/undo browser journey. The proposed fixture and new browser configuration/specs were not implemented as a workaround for this defect. Consumer tests use an actual measured producer and a synthetic owned-reader input; they do not simulate SQL writes or prove that a stored count was repaired. OCR-unsafe/blank/incomplete sources and numerical scores remain withheld.

PostgreSQL documents rollback of persistent changes within a caught-exception block; a boolean refusal alone is not rollback. It also distinguishes a new overload from replacement of an existing function, whose owner and permissions persist. These support the source design, not its unexecuted Native acceptance. [PL/pgSQL error handling](https://www.postgresql.org/docs/17/plpgsql-control-structures.html#PLPGSQL-ERROR-TRAPPING), [CREATE FUNCTION](https://www.postgresql.org/docs/17/sql-createfunction.html).

The full 64-task goal remains incomplete: **2 VERIFIED, 42 PARTIAL, 20 PLANNED**. No parent, numerical-validity or release gate closes from this repair.
