# A13 original scoring-input native foundation

SOURCE_CANDIDATE / VERIFIED_LOCAL text checks, 2026-11-15. This five-file allocation implements the original legacy scoring-input prerequisite. It does not complete A13 feedback publication, calibrate scores or activate a worker. SQL and the deferred verifier are UNPARSED/UNEXECUTED. Root owns integration and formal/native acceptance.

The allocated files are [the forward migration](../../../supabase/migrations/20261115045834_legacy_scoring_input.sql), [the source profile](../../../app/lib/server/legacy-scoring-input-profile.ts), [nine textual contract tests](../../../tests/unit/legacy-scoring-input-sql.test.ts), [the deferred verifier](../../../scripts/verify-legacy-scoring-input.sql) and this handoff. CLI 2.117.0 created the empty migration in an isolated temporary workspace after version/help checks under network denial. No old migration, public column, scoring function, numeric version, checksum policy, base138, typed13, A12 profile or bootstrap file changed.

## Stored authority and wire

`private.analysis_scoring_inputs` has exactly 17 columns. Its analysis_id primary key references the actual deterministic result; owner/org/root/source/extraction and nullable job references form seven ON DELETE CASCADE foreign keys. The extraction key must equal analysis_id. It stores the exact input_context, native input digest, opaque existing JS result checksum, native deterministic-row digest, first lease/audit identities and creation time. A guarded insert derives the same owned snapshot/result and actual static queue identity; updates are rejected. RLS is enabled and all application-role table/column access is denied. Existing privacy-authorized cascades can delete it. There is no queue-row FK that would erase a committed snapshot during normal completion.

The exact shared Context/Binding/Receipt and ready|committed|skipped / bound|legacy_unbound schemas are in backend's `backend-a13-scoring-input-contract-proposal.md` plus Root's approved skipped branch. Native RPCs are:

- `read_legacy_scoring_input(p_analysis_id uuid,p_lease jsonb)`.
- `finish_legacy_scoring_input(p_analysis_id uuid,p_lease jsonb,p_binding jsonb,p_result jsonb,p_process_id text,p_request_id text)`.
- `read_legacy_scoring_context(p_user_id uuid,p_analysis_id uuid)`.
- `export_legacy_scoring_inputs(p_user_id uuid)`.
- `read_legacy_scoring_readiness()`.

No canonical or typed-JD object is required or invented. The input digest covers a fixed native source/extraction/original owned-job snapshot and unchanged producer identities. It excludes request/process audit IDs, lease expiry, current status, readiness and results. A null analysis.job_id alone creates the explicit job:none variant; a missing/foreign linked job fails. Exact pageTexts, including an empty array, are retained. UTF8 text checksum is recomputed and compared with extraction storage. Stored file checksum identifies the uploaded source; it is not a fresh object-byte verification.

Input contexts and submitted results each have a 4MiB native JSON-text limit. Existing extraction bounds remain 1..200,000 characters and 1..20 pages; nothing is truncated. The old JS resultChecksum remains opaque to SQL. A separate private helper hashes every actual deterministic-row field after replacing created_at with a fixed UTC microsecond string, avoiding session-TimeZone-dependent digests. Native timestamps retain microseconds; Node must not round tokens through Date.

## Atomicity, replay and old compatibility

Owner/current membership/privacy/active-source proof runs before prior lookup. Locks follow analysis, queue, membership, source/root, then exact extraction/job rows. The shared R19 privacy try-lock and fresh blocker check retain the READ COMMITTED requirement; there is no waiting owner-lock inversion. Every evidence-v2 attempt remains uncalibrated and ineligible; the old score trigger remains present and exact-pinned.

A ready read requires the actual current unexpired fenced lease and scoring status. A committed read authenticates the captured original static lease or the actual current queue tuple, then returns the original receipt without rescoring. Skipped requires a real static queue tuple after owner/privacy/source proof; it returns only not_scoring. A well-shaped caller tuple alone is insufficient. A scoring row with an old deterministic result and no input proof cannot be backfilled.

Fresh finish rederives the locked native input, checks the issued binding and forwards the existing result unchanged to the exact 13-argument taxonomy-aware persist function. It verifies the actual inserted result, adds the snapshot and rechecks lease/privacy. False old persistence or post-expiry raises and rolls back result, transition and proof together. SQL retains the trusted deterministic-worker boundary; it does not reimplement or independently prove numeric scoring. The paired Node adapter must compute and validate the unchanged scorer result.

Exact finish replay compares the original binding, captured static lease and complete result/native row digest before today's lease/status/JD checks. Current owner/privacy/source admission still applies. First process/request audit values are retained; safely shaped new audit IDs do not invalidate replay. A saved read exposes the stored original context only after verifying its deterministic row digest. Changed valid current inputs make it historical. Missing or malformed current input is unavailable, not guessed historical proof. No deterministic result means not_found; only an actual old result without a snapshot is legacy_unbound.

## Readiness, export and activation holds

The separate `LEGACY_SCORING_INPUT_PROFILE` contains schema/profile identities and six actual catalog-body pins. The native checker binds 21 routine bodies: 15 new dependencies and six exact older dependencies, plus its separately pinned own body/attributes. Old prerequisites are persist 8ccb108f, actual R19 lease postimage d5bf2c2c, privacy 89e7eec2/e9453369, score blocker 094fbfee and transition eefd6814. Metadata hashes are computed from actual catalog prosrc; source hashes are not installed catalog or native-behavior proof. Self-hash recursion is avoided.

All new data readers, exporter and finalizer remain denied, including service role. Only the catalog-only readiness metadata RPC has service EXECUTE. The checker permits coherent separately approved direct service grants later, while refusing public/anon/authenticated/other grants and grant options. schemaReady is distinct from writerExecutable. The worker flag remains default false under Root ownership; enabling a staged path must fail rather than fall back.

Export includes every same-owner stored row across historical organizations, with original input_context and canonical UTC created_at. It does not filter by the export request's organization/current membership or reconstruct today's JD. Limits are 4096 rows and 32MiB for the complete UTF8 envelope; pre-count/pre-size and final checks fail the whole export without truncation. Paired privacy adoption is unconditional and failclosed. Because export is currently denied, integrating that caller intentionally makes privacy export unavailable until a separately approved native export/adoption grant. This default-mode consequence must be disclosed; no flag-off omission or empty collection fallback is allowed.

Account/source/root/extraction/job/result cascades remove the proof rather than replace provenance. A surviving old result then remains unbound. Existing active-root and privacy guards deny retired/deletion-blocked sources immediately. No new retention period, ledger-erasure waiver or independent cleanup job is introduced. Actual export, cascade, retention and account-deletion acceptance still needs an admitted target and the paired privacy source.

## Checks and remaining evidence

One sealed Node22 textual suite passed 9/9; profile/test ESLint and Prettier passed. Scoped TypeScript passed after correcting only the private check configuration's unnecessary vitest/globals type entry; the initial TS2688 setup receipt is preserved. No assertions, production types or runtime behavior were suppressed. These tests inspect source pins, immutable/FK/ACL structure, fixed 13-argument forwarding, replay/rollback order, UTC digest and resource bounds. They do not parse or execute SQL.

Root's finite source review found and the final source corrected: swapped input/export byte limits, a nonexistent-result unbound label, missing old service-ACL handling, insert static-lease correlation and session-dependent row timestamps. Earlier checkpoints and receipts remain preserved. Source tests ran only after these corrections were consolidated.

The deferred script is privileged, mutating and rollback-only. It requires a separately admitted direct managed fixture, exact pins and an expected result produced by the actual unchanged Node scorer. It drafts native no-write read, changed-JD refusal, old false/post-expiry rollback through exact owned fault triggers, atomic finish, original replay across JD/expiry/TimeZone changes, conflicting result/foreign access refusal, committed new-claim behavior, original export and analysis cascade. It has not run. Two-session lease/source/JD/deletion races, role execution, other cascade/retention paths, old/new numeric equality and full owned feedback publication remain open. No provider, service, SQL parser, native call, actual environment/keys, Git operation or deployment ran in this allocation.

Private source/CLI/check receipts are in `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a13-scoring-input-_q89yh1r`. Root owns the final combined application gate and source integration. This packet supplies no release or native activation approval.
