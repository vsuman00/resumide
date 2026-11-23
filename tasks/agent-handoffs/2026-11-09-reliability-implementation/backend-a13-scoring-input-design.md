# CR-A13 prerequisite: original deterministic scoring inputs

Design proposal only, 2026-11-15. Root authorized this one document while the bootstrap gate proceeds. No production source, test, contract, migration, profile, flag or shared plan changed. No tests, SQL parser, database, provider, environment, service or Git operation ran. The proposals below require a coordinated interface freeze and implementation allocation.

## Actual gap and preserved boundaries

The current `scoreExtractedResume` accepts `text`, `pageCount`, optional `pageTexts`, `jobDescription` and `textChecksum`. Its `JSON.stringify(payload)` result checksum covers the deterministic result, producer versions and resume-text checksum. It does not include the original JD text. `processScoringStage` reads today's related `jobs.description` and extraction before computing; the final persisted call has no JD/extraction snapshot CAS. Capturing the current job during feedback prepare cannot repair that missing proof.

The actual taxonomy-aware producer is `public.persist_deterministic_analysis(uuid,text,jsonb,text,jsonb,text,text,text,text,jsonb,text,integer,text)` in `20260910110000_version_skill_taxonomy.sql`. It inserts one deterministic row and transitions scoring to qualitative review. `persist_analysis_stage_v2` already wraps its call in a subtransaction and rolls back a false result or expired post-check. Preserve that behavior. The privacy migration replaces the lease helper's old deletion predicate with `try_candidate_privacy_write`; use the actual forward postimage, not its original CREATE body.

Do not change any score, weight, parser, taxonomy, normalizer, rule version or existing result checksum. Preserve `hasUncalibratedEvidence` and the native unreviewed-evidence score guards. This path is for NEW legacy deterministic results only. Evidence-v2/canonical analyses remain outside legacy scoring. The content-only feedback core and its policy remain unchanged; an input binding establishes provenance, not calibration or factual support for model prose.

## Preferred storage and native operation

Add one private immutable table, proposed `private.analysis_scoring_inputs`, keyed by `analysis_id` referencing the actual deterministic row with `ON DELETE CASCADE`. Also retain typed owner/org/source/root IDs, a nullable captured job ID, original queue attempt identity, native input digest, opaque JS result checksum, native deterministic-row digest and creation time. Store the exact input snapshot in this protected row; technical logs and metadata responses contain no candidate text.

The snapshot contains actual owned source metadata and the exact scoring inputs: extraction text, page count and page-text array, extractor version, stored/recomputed text checksum; and either an owned job ID/title/description/company snapshot or explicit `job.kind='none'`. A missing job uses an empty effective description, matching existing scoring semantics. A present foreign or malformed job must fail instead of becoming the no-job variant. Preserve an actual empty page-text array; do not infer pages or replace text.

Use owner/org/user/source/job/extraction FKs and a guarded insert validator to correlate every identity with the same actual analysis and deterministic/extraction rows, without adding columns or changing frozen public column lists. A job or extraction deletion may cascade the new binding rather than invent replacement provenance; a surviving old deterministic result then has no admitted original-input proof. Updates to the snapshot are forbidden. All app table DML is denied, including service-role DML. Privacy-authorized cascades remain possible.

Proposed RPCs:

| RPC                             | Exact proposed arguments and result                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read_legacy_scoring_input`     | `(p_analysis_id uuid, p_lease jsonb)`; returns strict ready input context for current scoring, or a committed receipt when the original result already exists; never inserts. |
| `finish_legacy_scoring_input`   | `(p_analysis_id uuid, p_lease jsonb, p_binding jsonb, p_result jsonb, p_process_id text, p_request_id text)`; returns a strict committed receipt, including an exact replay.  |
| `read_legacy_scoring_context`   | `(p_user_id uuid, p_analysis_id uuid)`; owned saved-context union `bound` or `legacy_unbound`. It cannot manufacture a binding for an old result.                             |
| `export_legacy_scoring_inputs`  | `(p_user_id uuid)`; strict versioned `{schemaVersion, scoringInputs:[]}` owner export.                                                                                        |
| `read_legacy_scoring_readiness` | `()`; metadata only, separate exact source/ACL profile with schemaReady and writerExecutable.                                                                                 |

`p_lease` is exactly `{workerId,attempt,leaseFence}`, using the existing worker identity/attempt/fence limits. Native derives owner/org/source from the analysis, never caller proof flags. Initial reads and fresh finish require the actual current unexpired lease, eligible scoring status, owned membership, active source/root and privacy permission. Use the existing lock order and nonblocking shared owner-privacy admission; do not wait on an owner lock while holding object locks. After analysis/job locks, take compatible source, extraction and job locks, refresh privacy and expiry, and compare native digests. Do not hold a transaction across JS scoring.

Fresh finish reconstructs the input snapshot from locked actual rows and requires exact equality with the issued native binding. Check source/root identity and file checksum, recomputed text checksum, page count/page texts, extraction digest and full job digest, including analysis.job_id nullness. Pass `p_result` unchanged into the existing 13-argument deterministic producer. Read back the inserted row and require its exact fields to match the submitted result. Then insert the immutable input row, refresh lease/privacy and return a receipt. Raise inside the enclosing subtransaction if the old producer returns false, any insert/check fails, or the lease expires: deterministic row, transition and binding all roll back together. Do not call the tokenless public producer independently from Node on this path.

## Exact DTO distinctions

Proposed strict `LegacyScoringInputContext` is:

- `schemaVersion:'legacy-scoring-input/1.0.0'`, `analysisId`, `ownerId`, `organizationId`.
- `source:{resumeId,resumeVersionId,fileChecksum,bytes,mediaType}` from actual owned source rows. The stored file checksum is provenance, not fresh object-byte verification.
- `extraction:{text,pageCount,pageTexts,textChecksum,extractorVersion,contentSha256}`; text checksum is SHA256 of exact UTF8 text and must equal the stored extraction checksum. `contentSha256` is a separately named PostgreSQL digest of the fixed complete extraction snapshot.
- `job:{kind:'owned_job',id,title,description,companyName,contentSha256}` or exactly `{kind:'none'}`. The native digest covers the complete protected JD snapshot; timestamps alone do not prove equality.
- `binding:{schemaVersion:'legacy-scoring-binding/1.0.0',analysisId,ownerId,organizationId,resumeId,resumeVersionId,fileChecksum,textChecksum,extractionSha256,jobId,jobSha256,inputBindingSha256}`. Nullable job fields are null only for the none variant. `inputBindingSha256` is native SHA256 over the full fixed input snapshot, not a Node JSON checksum.
- `producer:{parserVersion,rulesetVersion,normalizerVersion,taxonomyVersion}` pinned to the actual unchanged producers, plus strict native readiness metadata.

The ready worker response is `{schemaVersion:'legacy-scoring-read/1.0.0',status:'ready',context}`. The already-committed branch is `{same schemaVersion,status:'committed',receipt}` and causes no rescoring. `p_result` is the existing exact `scoreExtractedResume` result shape, with no new scoring fields.

The finish receipt is `{schemaVersion:'legacy-scoring-receipt/1.0.0',analysisId,ownerId,organizationId,resumeVersionId,inputBindingSha256,resultChecksum,deterministicContentSha256,createdAt,replayed}`. `resultChecksum` stays the existing JS checksum and is stored/correlated as such. `deterministicContentSha256` hashes the actual stored deterministic row with PostgreSQL encoding. Never claim JSON.stringify and jsonb::text produce the same digest. The wrapper does not independently reimplement numeric scoring in SQL; it retains the existing trusted deterministic-worker boundary and records which exact native inputs and result were committed.

The owned saved reader returns `{schemaVersion:'legacy-scoring-context/1.0.0',status:'bound',currentness:'current'|'historical',context,result,receipt}` or `{same schemaVersion,status:'legacy_unbound',analysisId,reason:'original_input_binding_missing'}`. The unbound branch supplies no guessed JD snapshot. Currentness compares today's actual owned source/extraction/job identities and native digests to the stored input; an edited JD makes the original result historical rather than rewriting its input record. Access, privacy and active source/root checks apply before exposing either branch. Future feedback must select the stored original snapshot and use currentness honestly.

Bound requests and outputs should use one finite admitted JSON-byte budget, proposed 4 MiB for input and 4 MiB for result, with existing extraction page-count 1–20 and text limit 200,000 Unicode scalar values. These are explicit unavailable conditions, never truncation. The later feedback core retains its separate 100,000-UTF16 support ceiling and must not silently slice a larger admitted scoring input.

## Replay, retries and erasure

Before fresh lease/status/job CAS, finish checks current ownership/privacy/source access and the prior binding/result for the same analysis. Exact original binding, captured worker/attempt/fence identity and exact result fields/checksums return the original receipt even after transition to qualitative review, lease completion or later JD edits. This compares the original static lease identity without requiring that lease to remain current. Conflicting input/result is refused; no overwrite or rebase. Do not expose a receipt for a deleted/inactive source or withdrawn permission. Replaying finish cannot call the old producer again.

The worker already calls extraction, scoring and qualitative stages on retry. Each stage checks its status; a committed scoring result has moved to qualitative review and is skipped. A precommit rollback leaves scoring status and no binding/result, so a fresh lease may read a new current input and recompute. No code shown resets a completed/failed analysis into a new scoring generation. New JD scoring requires a new analysis. Existing deterministic rows without bindings are never retroactively upgraded, even if today's text/checksums happen to match.

Account deletion already deletes analyses before jobs/resumes, and analysis/source FKs cascade. Retention first marks the root deleted, immediately denying new reads/writes, then `complete_retention_item` deletes the root after all objects complete; that cascade removes analyses, deterministic results and the new binding. Preserve the durable object-plan retry behavior. Do not invent a new retention period or a privacy exception for snapshots. Export must explicitly include the protected full input record: the current privacy worker exports extraction rows but does not select deterministic rows or a new private binding automatically.

## Small implementation leaves and adoption gate

Keep each allocation at five files or fewer:

1. Native foundation: one CLI-created forward migration, new exact source-profile module, SQL source-contract unit file, deferred rollback-only verifier and handoff. Include the new table, guarded proof/finalizer/readers, export and readiness together. No old migration/body changes; pin the actual old persist/fence/privacy helpers. New native calls remain staged/denied, including service-role finish; metadata alone may be service-readable. Do not create fake pins.
2. Privacy adoption: `privacy-worker.ts`, its existing privacy test file and a handoff. Call the separate strict export RPC, validate every owner and complete collection, and fail closed on unavailable export. Native cascade/retention and owner-export fixture checks belong in the foundation verifier. Freeze this paired path before storing snapshots in adopted workers.
3. Real worker adapter: new `legacy-scoring-input.ts`, its new unit test, `scoring-stage.ts`, existing scoring-stage test and handoff. A default-off configured mode uses the owned input read, unchanged scoring function and atomic finish. Once this mode is selected, missing readiness/lease/proof must refuse rather than fall back to old persistence. Existing disabled-mode outputs and every numeric fixture remain unchanged. Root separately owns any additive config/.env-example admission needed for that flag; do not hide activation in adapter construction.

The source-profile export, proposed `LEGACY_SCORING_INPUT_PROFILE`, has schema/profile identities and actual checker/read/finish/context/export/metadata body pins. The metadata response separates schemaReady from writerExecutable; source hashes are not live catalog verification. Preserve the current worker readiness/fence/privacy floors and public base138/typed13 contracts unchanged. Old direct legacy writers remain a known bypass producing unbound rows until a separately reviewed cutover; never label all deterministic rows bound because the new optional writer exists.

Acceptance before adoption includes actual-builder old/new numeric equality, same-text/different-JD distinction, exact page-array binding, job/source/extraction mutation between read and finish, stale/foreign/uncalibrated/lease refusals, rollback on old false/post-expiry, lost-response exact replay after JD movement, conflict refusal, no backfill and paired export/cascade/retention controls. Synthetic checks do not supply native concurrency, catalog, privacy or release acceptance. After this prerequisite, the full A13 operation/support publication, stage sidecar persistence and current/historical consumer work still remain.

## Source evidence

These are Root dirty-source hashes observed during this design, not native catalog attestations:

| Source                                                                | SHA256                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/scoring-stage.ts`                                     | `fd7d8fa7f9677f03756bf884f80e7470e35ce0b38a5c4f6c1d53dc7984ca86d5` |
| `app/lib/server/analysis-stage-fence.ts`                              | `a5746b7295a9644a7cfb63a25ae0b35ab614ab35e84031056cdc0ecb3e4e72b9` |
| `supabase/migrations/20260910110000_version_skill_taxonomy.sql`       | `61ff7b1bc7c59f0792a157206285ea1ed4dd91fc369bf55e26fb91e3e398f5c8` |
| `supabase/migrations/20261110082455_analysis_stage_write_fencing.sql` | `a6e1775315ad5cb05017a5a3adb86354e1ac21d7d4a458f0986194320b4320cb` |
| `supabase/migrations/20261110085512_privacy_write_barrier.sql`        | `ef62285882a13d9c4e8813161fd55f80333faedda45e7f4f3fb52b22997a0417` |
| `app/lib/server/privacy-worker.ts`                                    | `33f4dca1c3002fd24895e44406d38be14666c264ad9c39c4e18185d215cf6015` |
| `runtime-a13-owned-source-design.md`                                  | `c9b9cbf406c2c2ddbe4b44fc7d07afc1f149184b745046a507889cb340af5d22` |

Text-only extraction gives old 13-argument persist body SHA256 `8ccb108f8e38b4634cfe6b9e6e8c3e946272637cca6f0872c6e8213d313c631a`, dispatcher body `6d6d47ebe9aa2b050b9c8dfce0e72cc90552fbdccc5ba11f63d01b0be2f5dd78`, and lease-helper postimage after the actual privacy manifest replacement `d5bf2c2c633833a174f5351275b6b09eb4c8bf945bd7c6c889eaa6ef64893883`. Implementation must recheck guarded chronological postimages before use. Governing references: CR-A13 and ATS alias A12, `CONSTRAINTS.md` sections 1/6, ADR0006, and the existing runtime owned-source design. This document records a proposed prerequisite, not a new protocol approval or full-phase completion.
