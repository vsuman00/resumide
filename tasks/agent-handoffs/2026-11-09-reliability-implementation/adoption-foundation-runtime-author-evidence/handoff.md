# Independent restore floor foundation

Status: IMPLEMENTED, SOURCE/SYNTHETIC VERIFIED. No actual restore, production volume, trusted platform adapter, private adopter or serving integration is activated. Deployment remains HOLD. Root owns combined types/builds and acceptance.

The exact five allocated files implement an asynchronous filesystem journal and quarantine/admission controller. The journal has only schemaVersion/generation/revision/fence/phase, canonical bounded decimal counters, strict append history, explicit quarantined bootstrap, exclusive non-stealing lock/CAS, file and directory durability acknowledgements, symlink/type/permission/inode checks, nonblocking opens, and 1 MiB/4,096-record limits. Missing state never initializes itself; full storage fails closed without compaction or rollback.

The controller requires trusted structured fence/checkpoint/provenance adapters. There is no production adapter, Boolean/count fallback, echo witness, pin learning or adopter seed. It orders durable quarantine, real ingress/writer fencing, floor advance, one native transition, actual committed-instance/guard proof, ready acknowledgement, then reopening. Committed recovery acknowledges the same generation without another transition. Proven noncommit grants one fresh, higher fenced cutover; unknown outcome authorizes neither retry nor ready. The journal records global cutovers, without personal work hashes/receipts.

Caller deadlines/cancellation race asynchronous work through one shared maximum 5,000 ms controller deadline. Already-issued kernel I/O cannot be forcibly preempted. Late continuations check cancellation/current authority before any next transition or ready phase. Dirty failures mark the store handle unavailable and retain/reinstall the physical lock; lost ready acknowledgement is bound to its intended CAS target before publication. Best-effort re-quarantine may continue after the caller returns unavailable. No crash lock is stolen or automatically recovered. The current store cannot recover a crash-left physical lock; trusted fencing/quiescence and a controlled physical-lock recovery implementation are still required. Checkpoint-outcome reconciliation applies only to a readable journal and does not supply that missing recovery. Cleanup failures explicitly record unavailable/quarantine-unconfirmed state without raw logging. No hard process-lifetime bound is claimed.

The synthetic restore script preserves the original v1 integrity API and JSON result, then uses a real disposable journal plus explicitly synthetic authority/checkpoint state to reject an older backup. Its output uses stdout directly to satisfy scoped lint. `backup-restore.ts` and all original operations-readiness assertions are unchanged. The tests do not prove SQL conservation, managed restore, physical erasure or a 720-hour guarantee.

Required later integration covers first durable account preparation and first root retirement/tombstone clock capture as well as final fold, so restoring a pre-clock backup cannot restart retention. It also includes the protected transactional DB checkpoint/private adopter bridge, export completion fence, startup/readyz/per-request/per-claim/provider/protected-write checks, and actual already-running/direct Auth/DataAPI/Storage/Native quarantine. A rollbackable DB marker, editable manifest timestamp/checksum or Node-only startup check supplies no independent authority. Whole-volume independence/rollback protection and actual host-topology locking require operational proof. Missing proof keeps adoption denied.

## Exact ownership

Base HEAD `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. Snapshots and the original script preimage are under `/tmp/resumide-restore-floor-successor-1d8prhy0`.

| File | Original SHA-256 | Final SHA-256 |
| --- | --- | --- |
| `app/lib/server/restore-floor.ts` | `ABSENT` | `e2ea11adbbcf19c50efa72ffc5683d79ab03d1f6fcf803b7969cedecb384f0bf` |
| `app/lib/server/restore-admission.ts` | `ABSENT` | `f308db9ca446442fe98db22f92c2fb66f52102aac52a25abc75aaf1054b0d075` |
| `tests/unit/restore-floor.test.ts` | `ABSENT` | `17b41dc79d4cc9c20f28472e7853b98d4f6c512539393bcf1608dc8a7d3b1093` |
| `tests/unit/restore-admission.test.ts` | `ABSENT` | `4a3594d2b0653503440b0b4aede70b98a0e689237895a660a0bccdb6f3d587c7` |
| `scripts/verify-restore.ts` | `564d54caa931f789d63f47a88de6e039244c5f82dd6e868c39652ad5a27dfff1` | `3989a808caa2306cf51ff21fa58be9d3f7e1dba12d2284eb9ce351db6743381c` |

## Finite evidence

- Focused PASS: 61 cases/2 files, zero failures/skips, `/tmp/resumide-restore-floor-NxuTvY/receipt.json`; 933 stable inputs, PG 85019 absent. This covers the final two product/test bytes after the no-empty-catch correction.
- Synthetic restore PASS: `/tmp/resumide-restore-floor-4cNCN3/receipt.json`, PG 85017 absent; both integrity and advanced-floor/old-backup denial outputs are explicitly synthetic.
- Scoped five-file formatting/lint PASS: `/tmp/resumide-restore-floor-FdLFp8/receipt.json`, PGs 85018/85036 absent. No warnings/suppressions. No author full types/build/broad suite.
- Meaningful provisional RED: `/tmp/resumide-restore-floor-qOAPOd/receipt.json`; actual extra-personal-field acceptance caused AssertionError, not an import failure. Its source snapshot is preserved. The name filter excluded 26 unrelated new cases; no test skip was added to source.
- Preserved intermediate failures: `s05h6c` had an async-test closure syntax error plus ready-cleanup race; `FdetoB` exposed the intended-ready cleanup race; `nt4Aqs` recorded the original and new script console lint violations. Subsequent fixes retain assertions. All directories use the `/tmp/resumide-restore-floor-` prefix.
- Formatting-write receipts `cXZKL7`/`Lgm1cR` have child exit 0 and exactly allocated changed inputs; their controller reports FAILED_OR_INCOMPLETE because it deliberately detects any source mutation. These are expected formatting mutations, not passing static evidence. Earlier passing focused/script receipts remain historical.

All 16 receipts, full logs/reports, preserved failures, start identities and independently absent process groups are bound in the release JSON. No actual env/dotenv, network, provider, DB/Native/parser, services, dependency or Git mutation ran. Pinned Node 22.23.4, sealed empty HOME/fake values/private marker, and child OS network/dotenv/Git-write denial were used. Process supervisors ran outside Seatbelt to inspect their own children.

The original release `cc8aaa7c19f72f00a604276aee0c252d164004586bfb45626d8a75cdb314007e` and its handoff/postimages remain immutable history. This successor changes only the two owned products and this handoff; tests/script bytes and original allocated preimages are unchanged. The fresh affected gate above replaces the predecessor gate for current product bytes.
