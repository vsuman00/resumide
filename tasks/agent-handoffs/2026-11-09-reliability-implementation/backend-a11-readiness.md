# A11 typed authoring readiness admission

Implemented the allocated Node readiness gate and repository integration. Root owns shared contracts, integration and the combined gate. Runtime owns the forward SQL closure, actual source-pin profile and deferred verifier; frontend owns independent repository/HTTP regressions. This handoff does not establish native catalog readiness or activate the writer.

`assertTypedAuthoringReady(client, expectedProfile, options)` reads `read_typed_authoring_readiness` exactly once with `{}`. The profile argument is mandatory and server-owned. The strict reply contains only schemaVersion, profileVersion, schemaReady, writerExecutable and the four actual canonical-readiness, typed-readiness, writer and reader source hashes. All six profile strings must match and both booleans must be true. Missing RPCs, malformed/extra fields, errors, drift and a compatible but staged writer fail with the existing fixed TypedAuthoringError unavailable. There is no table fallback, retry or cross-attempt cache.

A single deadline covers dispatch, asynchronous RPC/thenable settlement and schema admission. The default is 2,000 ms; the optional server/test timeout accepts integers from 1 through 5,000 ms. Caller cancellation is optional. Abort is forwarded to compatible RPC builders; a bounded race still settles if a transport ignores it. Absolute clock checks run before dispatch and after settlement/validation. Synchronous transport throws and late successful replies cannot bypass the gate.

The only repository change is two imports and one awaited assertion. Order remains command parse/hash/request-owner correlation, absent-capability refusal, actual owned ORIGINAL canonical/JD context and command proof, fresh readiness, then exact capability apply. The real profile is imported from runtime's released module. Original command heads, IDs, hashes, acknowledgement and idempotency key are preserved. No current-head/CAS check is inserted before native prior-receipt replay. Preview, HTTP fields, flags, legacy/manual operations and global typed guards are unchanged.

## Verification and preservation

Evidence is source/static and synthetic fake RPC only. The unit vectors explicitly inject artificial catalog pins; they do not assert an actual grant or database result. Thirty-two controls cover exact admission, staged/incompatible states, all six profile identities, strict malformed output, missing profile/RPC, timeout limits, safe errors, synchronous/asynchronous failure, no caching/retry, pre-abort, ignored abort, racing abort and absolute post-response expiry. The first run passed two and failed thirty because the test expected a class name that the existing error class does not set; its reason/status were correct. That test expectation was replaced by equality with the actual exported error instance. The failed receipt also retains its test-generated unhandled assertion. The corrected file passes all 32 controls without production changes.

Scoped types pass with five roots, 50 source files and zero diagnostics; lint and formatting pass. Helper runs recorded 759 stable inputs; the final static checks recorded 760 after the approved runtime profile dependency arrived. Every receipt records no source drift and confirmed process-group cleanup. No old suite, full build or new corpus ran in this worktree. Root owns fresh coupled repository/HTTP and full-project checks.

Private packet: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a11-readiness-backend-et_svwxp`.

Exact sealed wrapper commands use `/Users/vaibhavsuman/.codex/tools/resumide-node22/v22.23.4-darwin-arm64/node` followed by that packet's `run.mjs` and the label below. `commands.json` preserves their complete argument arrays.

| Label | Command after the pinned Node executable | Receipt and log |
| --- | --- | --- |
| focused | node_modules/vitest/vitest.mjs run tests/unit/typed-authoring-readiness.test.ts | focused.json / focused.log (fixture failure) |
| focused-fixed | node_modules/vitest/vitest.mjs run tests/unit/typed-authoring-readiness.test.ts | focused-fixed.json / focused-fixed.log (32 PASS) |
| types | private packet types.mjs | types.json / types.log (PASS) |
| lint | node_modules/eslint/bin/eslint.js app/lib/server/typed-authoring-readiness.ts tests/unit/typed-authoring-readiness.test.ts app/lib/server/typed-authoring-repository.ts | lint.json / lint.log (PASS) |
| format | node_modules/prettier/bin/prettier.cjs --check app/lib/server/typed-authoring-readiness.ts tests/unit/typed-authoring-readiness.test.ts app/lib/server/typed-authoring-repository.ts | format.json / format.log (PASS) |

| Released file | SHA-256 |
| --- | --- |
| app/lib/server/typed-authoring-readiness.ts | 17bb670738a38021b965668b8cd54a2c482a098d490ce651885d54f114155cc8 |
| tests/unit/typed-authoring-readiness.test.ts | 7e807c953068858fd40400b4e8202d2901ce18f68f7592841ee271cc3a5dc244 |
| app/lib/server/typed-authoring-repository.ts | f9380f63d17e5dfe6c0d4290331cd1c3bf0504b5235256d096a69cf31a3d8ada |

Dependency profile `app/lib/server/typed-authoring-readiness-profile.ts` was copied byte-for-byte from runtime. The scoped checks used coherent predecessor SHA `7c9c575d20f28f5993452a65f27de6e092ec1f16da593d57136dbe715d8ad238`. Root then approved final successor SHA `26c3e7a0bbae85bac840b70cb3045c5f734ac231f6a9c647256b14453cb1be41`, changing only canonical/typed source-pin strings after the native legacy job-owner/org check was added. Both profiles are preserved. No backend code changed or author check was repeated; Root covers the final dependency in the combined gate. No placeholder was introduced. The profile binds source postimages, while a future actual RPC must verify its own catalog. Current service-role writer EXECUTE remains denied, so the source-staged response is refused. A future authorized grant is separate from source compatibility and candidate authorization.

No SQL parsing/execution, database, provider, actual configuration/keys, candidate data, service, browser, Docker, dependency, Git or deployment operation ran. Default-off flags, native transaction/privilege/privacy/concurrency/rollback evidence, broader supported authoring/usefulness, representative evaluation and release remain separate obligations. Full CR-A11 remains PARTIAL.
