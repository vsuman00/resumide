# CR-R17 retention Node handoff

2026-11-15 Asia/Kolkata. **SOURCE IMPLEMENTED / CONTROLLED NODE CHECKS PASS; INTEGRATED TYPES AND NATIVE ACCEPTANCE PENDING.** Base HEAD `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, dirty work preserved. Exactly five implementation/test files plus this handoff were allocated by `r17-storage-runtime-allocation.json`; Root owns CONTEXT, profiles and integration. Product source is frozen for peer review.

The adapter requires strict current disposition metadata: nine keys, all six expected profile strings and `schemaReady`. Export/access grants remain independent and may both be false. There is no legacy claim fallback or caller-selected profile. Each metadata/RPC pair shares at most five seconds. Claims reject null/malformed/open/oversized arrays, invalid UUID/key framing, wrong embedded root and duplicate item/key/version before any removal. Multiple versions of one root remain valid. The exact three-field Native wire and mapped Node result remain unchanged. Canonical key/root correspondence is not independent owner proof; Native owned enrollment supplies that authority.

Completion/failure require literal true acknowledgments. Complete-after-deleted may succeed idempotently; fail-after-deleted false remains unacknowledged. Removal failure and completion uncertainty are separate. Successful removal followed by missing/false/error/late completion cannot call fail or count completed. A removal error counts failed only after confirmed recording. Unconfirmed failure stops the sweep.

The sweep keeps its existing report and adds optional signal/timeout options: one 30-second maximum/default overall budget, with metadata/RPC stages capped by five seconds and remaining time. Finite/nondecreasing elapsed checks and cancellation guards run before/after awaits and before effects. The storage API has no abort hook: a timeout bounds the outcome wait and prevents later completion/failure work; it does not prove the underlying removal or process stopped. The CLI forwards SIGINT/SIGTERM, emits fixed safe diagnostics/exit code 1 on uncertainty, and prints no success JSON after cancellation. Its successful JSON line is unchanged.

Evidence directories under `/tmp/resumide-r17-runtime-`:

- `jhxxh2`: meaningful RED, all three cases fail on null-claim coercion, false completion and completion relabelled storage failure; PG29645 closed.
- `zLJg6I`: first 131-case/three-file PASS, retained as history.
- `NkyQGK`: an already-started finite compiler check found RPC union-call and CLI listener annotation errors. Corrected explicit types; no repeat full typecheck occurred. Root owns integrated type acceptance.
- `eHHNEn`: 133 tests/three files pass, including two added finite/backwards-clock controls and early claim-size refusal. No failures/skips.
- `w5Gf3R`: scoped lint caught inherited console output in the now-linted CLI. No suppression: changed to stdout with the same JSON/newline.
- `BbmnNF`: all five affected actual-CLI import tests pass after that output change. The other 128 cases carry forward by exact unchanged source/dependency hashes; this is 133 unique passing cases, not a later fresh three-file rerun.
- `BuDbIE`: scoped five-file ESLint passes. Formatting and owned whitespace checks pass. All receipts retain source hashes, identities and group cleanup; failed receipts remain.

Pinned Node v22.23.4, sealed empty HOME/fake environment/private marker, child network/dotenv/Git-write denials, 120-second command and 8-MiB log limits. No application service, physical storage call, Native SQL parsing/execution, DB, provider, actual keys/data, browser, PDF/OCR runtime, Docker, dependency or workspace Git mutation ran. No broad suite/build repeated. Tests used read-only profile `bd0f226335d95cd8bde3eb4605bd5055f1074615caee430f9c06f7124cc567f3`; Root will install the actual R17 profile successors after backend freeze and run the integrated gate. This supplies no ownership, race, physical cleanup or exclusive-lease proof. Deployment stays STOP.

`/tmp/resumide-r17-runtime-release.json` binds exact pre/post images, dependency and all evidence; `/tmp/resumide-r17-runtime.patch` contains the scoped delta. Prose cleanup preserves bytes.

| Owned file                              | SHA-256                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/retention.ts`           | `8d30fb8ccf34d163fe619ba947a9de46e930bbde38e6e41a5801cb64bddaed83` |
| `tests/unit/retention.test.ts`          | `b47aaa6b8c700a4bdaef2fcd177e2e3f1218f22b7f6d02425a8f257e0f458c71` |
| `tests/unit/privacy-operations.test.ts` | `714c98b986c2448801cc1af6e090bc991f3a9cdcbae4afd6dbddb2f34cd04419` |
| `scripts/run-retention.ts`              | `988d73cc5e2c302c782a13c27786b94eea0e4b7151deafad2889a55e353ecd16` |
| `tests/unit/retention-cli.test.ts`      | `7b1f3e89c71cb20b9a76e594b6462a4a2d0f749e498bd8458731a2197cf0c1e5` |
