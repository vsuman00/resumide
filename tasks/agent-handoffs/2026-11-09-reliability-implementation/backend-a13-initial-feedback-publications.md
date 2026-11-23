# A13 owned initial-feedback publication source

Implemented the assigned forward native publication leaf. This is source-only work: the SQL and deferred verifier are **UNPARSED/UNEXECUTED**. Data/private routines remain denied, the registry is unseeded, and neither feature nor worker adoption is enabled. Shared usage/full readiness and account erasure/technical retention remain separate mandatory dependencies.

## Scope and interfaces

The actual network-denied Supabase 2.117 CLI created `20261115081345_initial_feedback_publications.sql`; Root recorded its filename before SQL was written. The new migration adds one private publication table, fifteen new routines and five forward routine bodies. Its diagnostic checker records 62 actual body postimages, composes the unchanged guarded legacy scoring and pure-renderer closures, and checks both unchanged qualitative/result evidence-score triggers. It does not claim to reconcile native CHECK/default expressions or prove runtime behavior.

The public data interfaces are:

- `finish_initial_feedback(analysis, lease, operation, nullableAttempt, bindingSha, completion, processId, requestId)` returns the strict existing finish/publication wire.
- `read_initial_feedback(user, analysis)` returns `available`, `pending` or `legacy_unbound`. A missing original input/publication is explicitly unbound; malformed, busy, foreign or inaccessible stored state fails closed.
- `export_initial_feedback_records(user)` returns the exact four-key account envelope: `schemaVersion`, `operations`, `attempts`, `publications`. It includes all owned organizations, source states and periods. Shared incremental limits are 4,096 operations, 12,288 attempts, 4,096 publications and 32 MiB. It refuses the whole export rather than truncating it.
- `read_initial_feedback_publication_readiness()` returns the separate eleven-field diagnostic metadata. `INITIAL_FEEDBACK_PUBLICATION_PROFILE` contains its actual seven source strings. The forwarded operation profile contains its actual seven strings; the unchanged claim and metadata body hashes are retained. No nonexistent full nineteen-field profile or usage body is exported.

The publication table has 29 columns. Its immutable operation/attempt/native run links and nullable unique `run_id` provide the later shared counter's exact deduplication seam. `publication-table-interface.json` in the private packet records the full interface. Candidate content FKs cascade; technical operation/attempt RESTRICT lifecycles remain an adoption hold.

## Admission, atomicity and proof boundaries

Current ownership, membership, privacy and source admission, followed by independently active immutable original-source admission, precede every read/replay. Exact prior publication checks the original operation, attempt, binding and completion before fresh lease/JD/consent/policy checks. It retains the original finish lease for no-dispatch replay and never rebases a stored command or invokes a provider.

Fresh assessed publication requires the actual latest known, error-free attempt, exact current policy/consent/input guards and, in budget mode, the actual linked settled R03 counts. Usage above the old producer's PostgreSQL integer domain is refused without clipping or losing accounting. The factory invokes the frozen pure renderer once, then checks the complete retained tip/bullet/summary correspondence against the full captured Node observation. Original-to-retained mapping, quote/code-point ranges, legacy UTF16 anchor IDs, per-part hashes, kinds, states and reasons must agree. Rejected observations remain recorded capture-only data; the native support envelope proves retained output only.

The factory calls the unchanged qualitative or partial producer inside the publication transaction. It refuses unmatched existing result/writer/run slots. A false producer result, lost lease, privacy/source/consent drift or saved-row mismatch raises and rolls back the result, run, writer, transition and publication together. Numbers, traces, versions, original deterministic checksum and original full JD/source binding are copied from the guarded immutable producer record; no score or checksum algorithm changes.

The native publication digest covers the publication core **excluding receipt**, avoiding a self-digest cycle. Exact completion, plan, render, retained support and full Node capture have separate native JSONB digests. Result/writer/run row digests retain all real fields and normalize only their actual temporal fields to UTC. Node does not emulate these digests.

The unchanged partial producer always inserts a real physical empty legacy summary draft. Its private full-row digest protects that projection. Logical `compatibility.writer` and public `receipt.writerSha256` remain null; this is not retained writer proof. No fake writer ID, timestamp or hash is created to represent absence.

Forward guards permit only open-to-published operations, cancel never-claimed reserved metadata, refuse late claims/retries and preserve terminal reasons. A partial unknown hold may later receive actual known usage without modifying its immutable publication. Assessed settlement replay cannot turn saved output into an error. Technical settlement still has no fresh candidate admission or second budget debit.

## Verification and preserved failures

Private packet: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a13-publications-035socqv`.

Commands used the pinned Node `v22.23.4`, sealed synthetic environment and `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic` (`envDir:false`). Exact command arrays, source hashes, process identities and log hashes are in `commands.json` and the named receipts. All relevant process groups were confirmed absent; no provider requests, database operations, Docker operations or SQL parser runs occurred.

- `finite.json` / `finite.log`: 25 source assertions passed; one preservation assertion failed because this worktree lacked the frozen pure-plan migration. This was a dependency/setup failure, not a native or behavior RED. It remains preserved.
- `dependency-transfer.json`: exact missing-only Root source `7a67f96d...` was copied after absence/hash assertions.
- `finite-successor.json` / `.log`: 26/26 across both source test files passed. All thirteen historical foundation assertions and helper bytes after import plumbing are unchanged; `historical-preservation.json` records the byte comparison to the actual `95658ac8...` baseline and historical `91004edb...` profile.
- Before final release, the early `5c9c` checkpoint was preserved. Two bounded source cleanups added explicit protected legacy trigger floors and moved the export byte check before local row-array capture. Wire and policy fields did not change.
- `affected.json` / `.log`: final thirteen publication source controls passed on successor `6bc869e8...`. The thirteen historical assertions were carried from the unchanged passing run.
- `types-final.json` / `.log`: five roots, four TypeScript source files, zero diagnostics.
- `lint-final.json` / `.log` and `format-final.json` / `.log`: passed. Final runs observed 806 stable source inputs; no source changed during a command. Root owns the fresh integrated application gate.

The privileged mutating rollback-only verifier drafts actual producer-backed assessed, terminal-unknown partial and no-dispatch partial scenarios, exact replay, changed completion refusal, saved-row digest refusal, late known accounting, complete export and immediate deferred-constraint checks. It requires separately admitted synthetic native fixtures and actual compiler capture. Its comments retain budget-on, historical/source/privacy, role, two-session race, lifecycle and cleanup gaps. It has never been parsed or run.

## Released files

| File | SHA256 |
| --- | --- |
| `supabase/migrations/20261115081345_initial_feedback_publications.sql` | `6bc869e81b7d9a81447f3228496ba44bffdc3c783922063a6ddfe1b01130c62e` |
| `app/lib/server/initial-feedback-publication-profile.ts` | `d1e59a0573979737cf4dbe4df75539cfda4dd0e6f58cfdd87b8f60319d3ed2a9` |
| `app/lib/server/initial-feedback-operation-profile.ts` | `871d489793a9091b8dc75fb97e1019a1b892d9e5478b387deab654514cb8c87e` |
| `tests/unit/initial-feedback-operation-sql.test.ts` | `18169658256aac3104791b702a40f101b357b203a17226bd5f8fe9559b47aa71` |
| `tests/unit/initial-feedback-publication-sql.test.ts` | `1d939df0bf5e25410316c27e431f59ef3f65749e52167cb617a288a158c6cd4d` |
| `scripts/verify-initial-feedback-publications.sql` | `6311bd25525da2fe71e987c79915620bfdfe75923aba039a63f9248a46b07cfd` |

The full release packet also pins this handoff, immutable source snapshots and every receipt/log. No old migration, numeric producer, support/plan policy, caller, worker, flag, grant or shared plan was edited. Root controls review/integration. Native correctness, concurrency, complete privacy lifecycle, representative usefulness and release acceptance remain open.
