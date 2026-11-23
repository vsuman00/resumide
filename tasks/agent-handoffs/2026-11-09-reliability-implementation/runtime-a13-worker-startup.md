# CR-A13 worker startup handoff

Status: IMPLEMENTED / LOCAL SYNTHETIC VERIFIED; parent CR-A13 remains PARTIAL. Runtime lane, 2026-11-15 Asia/Kolkata. Base HEAD `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, dirty source preserved; no Git mutation. Root owns CONTEXT, shared plans and integration.

`INITIAL_FEEDBACK_ENABLED` defaults false in server and analysis configuration. Both parsers reject selected mode without original legacy scoring input and analysis fencing. Both worker entry points forward the selected flag and dependencies before queue construction.

Startup preserves the old two storage checks and unchanged `worker-schema-readiness/1.0.0` wire. Selected mode additionally validates exact source profiles and capabilities from `read_legacy_scoring_readiness`, full 19-field `read_initial_feedback_readiness` with all seven capabilities, eight-field retirement-export readiness and seven-field budget-export readiness. These four independent metadata calls share the original deadline and AbortSignal. Private exports remain mandatory when AI generation is off. No data, claim, policy-seeding or provider RPC is called. Failed startup aborts remaining metadata requests.

Verification used pinned Node `v22.23.4`, empty HOME, sealed fake environment and `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic`; no dotenv. Supervisors remained outside macOS Seatbelt so process identity could be verified. Test transports are synthetic. No native SQL parsing/execution, DB, hosted, provider, service, browser, compiler, Docker, dependency, key or candidate-data access occurred.

- RED: `/tmp/resumide-a13-startup-red.log` preserves the actual missing-feature-gate failure: selected startup resolved instead of rejecting old-only metadata. This initial focused command predates the finite supervisor; its filter excludes 16 unrelated cases, without changing or skipping test source.
- Final GREEN: `/tmp/resumide-a13-startup-check-8JWcaQ/receipt.json`, `tests.json`, `check.log`: 138 tests / two files, zero failures/skips; 890 stable inputs; closed PG8308. Includes actual imports of both CLIs for success and dependency/hash/ACL/malformed/missing/timeout/cancel failures, proving queue construction and claims stay blocked.
- Static: `/tmp/resumide-a13-startup-check-fjocoY/receipt.json`, `check.log`: full `tsc` and scoped ESLint pass; 890 stable inputs; closed PG8450/8540. Earlier `/tmp/resumide-a13-startup-check-AiEiy0` also passes before the final explicit-disabled test addition.
- Preserve `/tmp/resumide-a13-startup-check-f27d88`: React Router typegen exited zero; immediate lifecycle sampling was incomplete. Independent subsequent `ps` inventory found PG7933 absent. No typegen rerun occurred.
- `/tmp/resumide-a13-startup-controller.mjs` retains the finite supervisor: 120-second stage limits, 8-MiB log cap, start identities, source hashes and group cleanup. `/tmp/resumide-a13-startup-check-7p5pQE` retains the first 137-test green receipt. Original assertions remain.

All seven Root source preimages matched the allocation before release. `/tmp/resumide-a13-startup-release.patch` is the bounded source delta. Root should archive temporary receipts and integrate only the allocated eight files; run the affected integrated gate after backend release. Native metadata/role/transaction behavior, rollout and release acceptance remain open. Deployment stays STOP.

| Source                                | SHA-256                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/config.ts`            | `afa7eaf05ceb3d54c74d455f805ac58095094709392575f2f97ac8f5f5b7650f` |
| `app/lib/server/worker-readiness.ts`  | `9f4432ed039f5950399e5f0cc94bbb867a44b4eb01125404bbb525272ff5356d` |
| `scripts/run-worker.ts`               | `e0362c9b054cfce87a197f96abc80f69f5d01ad9f6c62c83e462d0346d20a12b` |
| `scripts/run-worker-once.ts`          | `672b1ed73479d85e2f5db702bcdfc292459b28aae222e12489bd635a99b28a9c` |
| `.env.example`                        | `5062bb6015ca0773818d1524e79d674b92c896992184e1689fdae2250edf7b86` |
| `tests/unit/config.test.ts`           | `b86e9ca90afbe50fd39e732d978301969195143731ddc1be177ceebf762e9a00` |
| `tests/unit/worker-readiness.test.ts` | `d06dab4487222d43a93ecd420493356b51e8bd054013ba58638bd96339fb99f0` |
