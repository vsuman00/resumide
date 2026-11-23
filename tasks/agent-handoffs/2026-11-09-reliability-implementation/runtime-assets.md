# R12(a): verified public compiler input

Updated 2026-11-09 in the fresh runtime worktree. Scope: `scripts/latex-runtime/prefetch-inputs.py`, `tests/unit/latex-build-inputs.test.ts`, `scripts/latex-test-fixtures.ts` and this separate handoff. No pin/recipe/package/configuration changes, Docker build, provider call, DB operation or image adoption occurred. R12 remains partial: a verified host asset is not a compiler image or a runtime security pass.

## Implemented and tested

The helper reads the existing native Expat pin manifest and accepts only the reviewed upstream asset identity. Verification is offline by default. A fetch requires explicit `--fetch`, an existing owner-controlled safe cache directory, exact canonical upstream URL, HTTPS/default port and a restricted repository release-asset redirect path. There are no retries, cookies, authorization headers or ambient proxies. Whole-transfer timeout is 45 seconds, each operation at most 10 seconds, and at most three redirects. Signed redirect queries/body are never retained or printed.

Transfer size is checked before publication, with rejection at expected size plus one byte. Expected length and SHA-256 must match. Only then is the artifact atomically linked into its content-addressed location with mode 0444. Symlinks/non-regular/writable/tampered cache entries fail; a failed existing asset does not become an implicit refetch or overwrite. An empty owned digest directory can be reused by a subsequent explicitly requested fetch. Partial files are removed by exact identity; no broad cleanup occurs.

The receipt explicitly labels `networkAttemptsUnit: transport_chain`; one transport chain can include multiple HTTP exchanges. The existing source-binding function now includes the new helper and test file. Native package/archive comparison, signatures, licenses, pinned versions and accepted signer-test disposition are unchanged.

TDD/checks:

- Initial red: all 17 new tests failed because the helper did not exist.
- First green: 17/17 pure tests.
- Added a real guard regression: an existing empty digest directory caused `cache_missing` even with explicit fetch; one red/17 passes, then 18/18 after the bounded fix.
- Receipt-unit assertions reproduced two red expectations; helper receipts now explicitly say transport chain. Final **19/19** tests pass with injected streams and local temporary fixtures, no network.
- Scoped ESLint and Prettier on `latex-build-inputs.test.ts`/`latex-test-fixtures.ts` pass; Python AST parsing passes without bytecode output; `npm run typecheck` passes under Node 22/private mode.
- Prior doctor/endpoint checks remain separate evidence. No unchanged broad suite was repeated here.

## One actual allocated transfer and fresh offline proof

The coordinator approved one public-source staging chain. The successful transfer below consumed that allocation; a later acknowledgement/approval did not permit a second fetch. No second fetch ran.

- Canonical URL: `https://github.com/libexpat/libexpat/releases/download/R_2_10_0/expat-2.10.0.tar.xz`.
- Expected/observed bytes: **543404**; reject at byte **543405**.
- Expected/observed SHA-256: `c624ba2998fc65df1163a49641ff3f9ab73138b11641d92c86bee0fb01b1bc7f`.
- Transfer observation: one allocated chain, 617 ms reported by the helper; not a general latency claim.
- Retained cache root: `/tmp/resumide-latex-public-input-VFqSgh`, created as an owned 0700 directory.
- Artifact: `c624ba2998fc65df1163a49641ff3f9ab73138b11641d92c86bee0fb01b1bc7f/expat-2.10.0.tar.xz`, regular, non-symlink and 0444.
- A separate offline verification immediately returned verified/cache with zero network chains. Root independently verified size/hash/mode and that the digest directory contains exactly one file.

The public artifact stays outside Git/source. Only canonical identity/size/hash/allocation metadata is retained here; no signed Location header/query or raw HTTP response body. Preserve this cache for the named build context; do not clean it before root's admission/build decision.

## R12(b) initial proposal, superseded by the frozen packet below

Use a local **named BuildKit context**, not a binary copied into the repository. Installed read-only observations: Docker client/server 29.9.2, Buildx v0.38.1; `docker build --help` advertises `--build-context`, `--metadata-file`, `--platform`, `--progress` and `--tag`. The Docker context remains local `desktop-linux`; no build/pull/container operation was performed.

Proposed five-file implementation child: `scripts/latex-runtime/Dockerfile`, new `scripts/build-latex-verified.ts`, `scripts/latex-test-fixtures.ts`, `tests/unit/latex-build-inputs.test.ts` and its handoff. Root/runtime `.gitignore`/`.dockerignore`, package and runbook stay unchanged in this child. Documentation/package usage can follow as a separate root-owned slice.

Exact recipe change: replace only the failed GitHub `ADD --checksum=...` for this one upstream tar with:

```dockerfile
COPY --from=verified-expat --chmod=0444 /expat-2.10.0.tar.xz /inputs/expat-2.10.0.tar.xz
```

The wrapper must always supply `--build-context verified-expat=<owned exact verified directory>` and cannot accept an arbitrary URL/image for that context. It must refuse a missing, extra-file, symlink, writable, size/hash-mismatched context before Docker starts. Raw manual Docker invocation is not accepted as evidence; the wrapper is the reviewed path. Preserve the destination/name/mode and every subsequent native size/hash/archive/ABI/test/license check. No package/source pin or E-010 disposition changes.

Proposed wrapper acceptance, before any build allocation:

1. Default to metadata/preflight only, with no build. Validate strict arguments without echoing arbitrary input, Node 22, a verified local Unix Docker endpoint, arm64 platform and the exact owned image-tag pattern. Do not read/copy app credentials or forward their environment into the build client.
2. Bind the current source manifest, recipe/helper/wrapper hashes, exact context contents and actual selected Docker/version/resource observations. `latexSourceHashes` must include the wrapper and accept an explicit base directory so a caller cannot accidentally hash another checkout. Freeze that packet; reject drift before execution and after build. Copying the public asset into an immutable owned temporary context is permissible if needed to prevent input mutation; do not alter the retained root-verified cache or place a binary in Git.
3. Fixed build arguments supply the local endpoint, `linux/arm64`, named context, reviewed main runtime context, plain progress, exact owned tag and metadata receipt path. No caller-selected build args, extra mounts, network override, privilege, alternate context or package/tag fallback.
4. Proposed resource bounds for root review: 30-minute wall deadline, 16-MiB retained-log ceiling, at least 12 GiB host space before start and stop if it falls below 8 GiB; record actual Docker CPU/memory rather than claiming this limits all BuildKit consumption. Root may refine these before the actual allocation. No daemon/resource configuration change is implied.
5. Spawn only the owned build client/process group; timeout, log cap, disk floor, cancellation or source drift stops that group with bounded TERM then KILL. Never stop/prune Docker globally or touch Evoloryx. Preserve failed build/log/cache evidence; uncertain daemon cancellation remains an operator-review state, not a claimed full teardown. Redact signed URL queries before retaining log lines.
6. A successful build still requires exact image-ID inspection, current source/resource/image admission, real compiler/confinement/PDF/profile/rollback/browser checks and later advisory disposition. Do not update `.env`, enable production, promote an image or mark CV02 resolved merely because Docker exits zero.

The next child should add meaningful injected-runner/context tests before implementation. No Docker build has been allocated by this packet, and there is no permission to consume another public transfer or live AI request.

## R12(a) corrective child: offline special-file admission

Independent frontend review found that the initial cache verifier opened a path before checking its descriptor type. A FIFO could therefore block outside the network deadline. This is a source defect; the earlier public artifact verification and successful transfer remain separate evidence.

The three-file correction changes only the helper, its existing test file and this handoff. `lstat` now rejects special files before open. `O_NOFOLLOW | O_NONBLOCK` prevents a symlink/FIFO substitution from blocking at open, and the existing descriptor regular-file check still runs after open. Offline verification now shares the configured whole-operation deadline and reports zero network chains on timeout.

Three focused reds were recorded against the original helper: a FIFO reached the forbidden open hook; a real regular-file-to-FIFO swap hit the child's 750-ms timeout; and slow offline verification escaped the requested 10-ms deadline. The first green attempt left one receipt defect: the reused deadline incorrectly counted a network chain. The helper now takes the actual attempt count for that deadline. Exact temporary FIFO directories are removed by the parent test in `finally`, including after the deliberately timed-out red child. No unbounded FIFO process, fetch or Docker operation ran.

Final focused result: **22/22 tests pass** under Node 22/private mode. Scoped test lint/format and Python syntax checks pass.

The unrelated R12(b) wrapper/recipe draft is parked and remains unintegrated while these three files are reviewed. Its test block is held outside the source tree until this corrective release is transferred. The earlier R12(a) 19-test freeze is superseded by this corrected helper/test pair; full compiler/runtime acceptance remains open.

## R12(b) implemented source and frozen review packet

This five-file child owns the Dockerfile, `scripts/build-latex-verified.ts`, `scripts/latex-test-fixtures.ts`, `tests/unit/latex-build-inputs.test.ts` and this handoff. The corrected R12(a) helper is unchanged in this child. No package, lockfile, ignore policy, pin, native recipe/test, license record, E-010 disposition or application source was changed. No compiler build or cancellation probe ran.

The only Dockerfile change replaces the one upstream Expat `ADD` with the named-context `COPY` shown above. The source manifest now binds the wrapper, `.dockerignore`, the manifest function itself and the existing helper/tests. It accepts an explicit checkout base. The wrapper prepares a private source snapshot from this allowlist, not a repository glob. Compiler files are 0444 and directories 0555. The exact public Expat file occupies a separate one-file named context. The original verified public cache stays unchanged and outside Git.

Preparation is the default. It validates Node 22, a local Unix Docker endpoint, Linux/arm64, installed plugin hash/version and CPU/memory observations. It performs no Docker build. Execution additionally requires the exact reviewed packet fingerprint and a recent terminal, exact-owned cancellation receipt for the same observed toolchain. A durable exclusive-create attempt marker prevents an automatic retry in that prepared output directory; an existing owned image tag is never overwritten. The image tag is fixed as `resumide-latex:reliability-20261109-r12`. Build arguments, contexts and paths are fixed by the packet. The client preserves the original HOME and receives only PATH plus explicit private Docker/Buildx settings; no application environment, registry credentials, inherited builder, secret, SSH agent, privileged entitlement, push or caller-supplied build argument is forwarded.

The source and frozen context are checked before execution, during monitoring and after a successful solve. URL queries/fragments/userinfo and terminal control sequences are removed from retained public logs. An entire overlong line is discarded, including a tail split into a later chunk. Raw output crossing 32 MiB requests cancellation; retained output remains byte-bounded. A source/disk-monitor failure also cancels the owned group. The active deadline uses a monotonic clock and an independent owned-client watchdog, so a pending asynchronous monitor cannot suppress the scheduled signals.

The proposed allocation is **2400 seconds total**, with cancellation requested by 2340 seconds and 60 seconds reserved for bounded signaling/history/identity checks; **32 MiB logs**, **12 GiB host free before start**, and cancellation below **8 GiB**. CPU/memory are recorded observations, not a BuildKit hard-resource limit. Software signaling and an exited client do not establish daemon termination. Unknown/late history or a surviving client group remains `daemon_outcome_unknown`, preserves receipts/cache and blocks a retry or acceptance claim.

Buildx 0.38.1 has no per-build cancel subcommand. The wrapper uses a private `BUILDX_CONFIG`; it expects exactly one `default/default/<id>` local-state record whose context and Dockerfile match the frozen inputs. It signals only that detached client group, then inspects only that exact ref. It accepts terminal `canceled`, `failed` or `completed` status separately from client-group absence. The private default-builder/ref behavior is still a runtime hypothesis for the upcoming probe. See the installed-version primary sources for [local-state binding](https://raw.githubusercontent.com/docker/buildx/v0.38.1/build/localstate.go), [record fields](https://raw.githubusercontent.com/docker/buildx/v0.38.1/localstate/localstate.go) and [history terminal states](https://raw.githubusercontent.com/docker/buildx/v0.38.1/commands/history/inspect.go). No global builder stop/removal/prune, daemon change or unrelated container/image cleanup is present.

A zero-exit solve only produces lifecycle evidence. The final receipt separately checks source/context integrity, immutable image ID, the selected local tag and metadata build-ref agreement. Failed final admission is `candidate_identity_unproven`; no receipt implies runtime acceptance. Image admission, actual compile/confinement/PDF parity, current OS/dependency advisory disposition and browser acceptance remain later work.

### Focused checks and preparation evidence

- The initial wrapper import produced the expected missing-module red. After implementation, context canonicalization and exact cleanup needed correction in temporary fixtures; a deliberately frozen snapshot remained intact while the original source changed. The exact leftover owned temporary tree was removed after its directories were made writable.
- Two new reds reproduced a resource-monitor exception escaping cancellation and a signed-query tail surviving an overlong-line split. Both now pass. Native/source thresholds were unchanged.
- Two CLI regressions reproduced Vite Node's preserved launcher argv and its `.bin` entry alias. Explicit `--cli` entry keeps utility imports inert; both launcher forms now run strict argument admission and emit safe structured failures.
- An independent fake-clock watchdog red was added before its implementation. The test proves scheduled signals proceed without an async monitor and stop after owned-group absence; this is simulated lifecycle coverage, not actual Docker cancellation.
- Final focused result: **58/58 tests pass**, including all 22 staging/FIFO assertions. Scoped ESLint, Prettier and Node22 `npm run typecheck` pass. No full unchanged application suite was repeated.
- The final actual preparation command returned `review_required`, `buildStarted:false`, fingerprint `28530293873644856b290c318a7534dd2ac5375f06533c812312dc66c9ea66f5`, **66 source bindings** and **61 frozen compiler files**. Its packet is `/private/tmp/resumide-r12-review-final-1n_659yr/review-packet.json`. It used the existing public cache, with no fetch.
- Observed host free: **23397576704 bytes**. Docker client/server **29.9.2**, Buildx **v0.38.1** with SHA-256 `c9b80299e87424ea661ae3898139044fe5457432003f71ea69bb225df87563a6`, BuildKit **v0.34.0**, local Linux/aarch64, **10 CPUs**, **8319438848 bytes** Docker memory. These observations do not allocate a build.
- An earlier preparation packet at `/private/tmp/resumide-r12-review-d94ya3yj` is obsolete after the final watchdog/source changes. It is retained as preparation evidence and must not be executed. A preceding launcher attempt emitted no packet; its CLI entry defect was then reproduced and fixed. No failed Docker build was retried.

Current safe preparation command, with a new empty owned 0700 output directory:

```bash
RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic vite-node --config vitest.config.ts scripts/build-latex-verified.ts --cli --workspace CHECKOUT --asset-dir VERIFIED_DIGEST_DIRECTORY --output-dir EMPTY_PRIVATE_DIRECTORY
```

Execution is a separate reviewed boundary and is not authorized by the preparation receipt. It takes `--cli --execute --packet REVIEW_PACKET --approved REVIEWED_FINGERPRINT --cancellation-receipt REVIEWED_PROOF`. The coordinator owns any package/runbook addition. Keep the source packet frozen during independent review.

### Separate cancellation-probe packet, not executed

Before the expensive build, prepare one tiny probe on an exact local base derived from the existing OCR image `sha256:ab1d5c0fab7533a23584bd533df8459fdf2090fb27fbabe3355bbc7fb750b58c`. Fresh local inspection must confirm this image/architecture; no image pull or remote metadata fallback is permitted. A local tag and `--pull=false` provide local preference but do not themselves prove absence of registry fallback. `RUN --network=none` governs the process, not base-image resolution. This distinction is an open preparation prerequisite, not permission to relax egress.

The coordinator has separately allowed one bounded read-only export of that exact inspected image to a fresh owned 0700 temporary directory: archive at most 512 MiB, at most 60 seconds including owned-client teardown, no pull/tag/build. Inspect the archive without extraction to determine whether this Docker version already supplies OCI layout/index/blobs. If conversion is needed, propose a separate small helper/test child that verifies the original image-config digest and each layer/diff-id, bounds all archive contents and emits only a local OCI layout. Do not silently expand this five-file slice.

Once a verified local-only base context is ready and reviewed, the proposed probe Dockerfile contains only the base reference and a public neutral marker followed by a bounded sleep, under no-network execution, no host mounts, unique context/config/ref and no image adoption. Its proposed cap is 45 seconds/1 MiB; signal only the owned detached client after the marker, inspect only its bound exact ref and prove group absence plus terminal daemon status. Keep all archive/log/ref/context evidence and any exact owned tag until cleanup is proved. Unknown/still-running outcomes cannot become stopped, retried or full compiler acceptance. Return exact frozen probe arguments before execution; this handoff has not executed or allocated it.

### Independent-review corrections and second source freeze

Frontend review identified two gaps in the first R12(b) candidate. Neither was treated as a runtime pass. First, the packet bound a selected checkout but not the code executing from another checkout. Both preparation and execution now require that checkout's canonical root to equal the root derived from the executing wrapper's `import.meta.url`; the fixture import is static and relative to that same script directory. A focused missing-admission red was recorded before the fix; the executing root passes and a separate temporary checkout fails.

Second, the independent watchdog could signal the client while a stalled awaited monitor prevented a result from returning. The focused fake-clock regression returned no receipt after 60 seconds before the fix. Disk/source/ref/history observations now have two-second deadlines; observation failures request exact-owned cancellation or remain unknown. The production history CLI also has the two-second bound. Tests cover permanently pending disk, source, reference and history reads, alongside the watchdog and client/history distinctions. Final focused result is **63/63 tests passing**, with lint/typecheck passing and all 22 staging assertions preserved. These are injected lifecycle tests, not actual daemon confinement evidence.

The earlier packet with fingerprint `28530293873644856b290c318a7534dd2ac5375f06533c812312dc66c9ea66f5` is withdrawn because its source hashes predate these peer fixes. Both earlier preparation directories remain evidence only and must not execute. Renew source/resource admission after the second source freeze is reviewed; no build/probe is allocated. The 2400-second proposed allocation concerns the owned-build lifecycle, with read-only admission before start and the 60-second cleanup reserve inside it. No CPU/memory hard cap or OS-level guarantee is inferred from a software deadline.

One separately allocated local OCR export has now succeeded without extraction, tag/pull/build or image mutation. The archive is `/private/tmp/resumide-ocr-local-export-cbwzvgnp/image.tar`, **96254464 bytes**, SHA-256 `137b0b6b0f6aa97485f0abcc7a514aa2935e9d44660071887f633f005639499d`, observed export **645 ms**, no stderr and owned client group absent. The output is private/read-only and retained. It has 14 safe members, OCI layout/index and optional Docker manifest, nine blob files and eight described layers. Format presence is not OCI/image admission. The initial inspection deliberately reported that exported config digest differs from Docker's image ID. Later diagnostic identity assumptions also failed: the OCI index selects manifest `92d09e80a88e72d1dde96543b80c67a3b29ba1bbf9b18bb04e87c0b2e234a03f`, while the config is `b6d5c39fd0b861309ea4c6ec09900b10cc4e0d1b24399814b6dd094a39c06dcc`. Neither equals the inspected `ab1d...` ID. Preserve this distinction and reconcile the derived local export against selected daemon descriptor/platform/rootfs/runtime metadata and bounded diff-ID checks before proposing a local OCI base. No second export or cancellation probe ran.

### Coordinator process-identity correction and final source release

Root identified that a stored PID/PGID alone could be reused before a delayed signal. The wrapper now follows the existing private-verification guard: capture the detached leader's `ps pid/pgid/lstart` identity, require the expected PID to be its own PGID, and recheck the original identity before every signal. Missing, vanished or changed identity makes ownership/cleanup unknown and never signals a replacement group. Group absence remains a separate observation from the exact daemon ref. Lifecycle receipts carry the captured start identity and ownership-unknown flag; they contain no process arguments or environment.

Four focused reds preceded this guard. Injected reused, vanished and uncaptured leaders now receive zero signals and cannot claim cleanup; an unchanged original leader receives only the owned signal and then separately proves group absence. Final source result: **67/67 focused tests**, scoped lint/format and Node22 typecheck pass. Prior checkout/stalled-monitor/FIFO assertions remain intact. Actual spawned Docker identity/cancellation evidence is still deferred to the reviewed probe, and all earlier source packets remain withdrawn.

The local OCR derivation has now been reconciled read-only, without another export or extraction. Docker's original `ab1d...` descriptor is an **OCI index**, 856 bytes; a platform-specific `docker image save --platform linux/arm64` produces the selected derived manifest `92d09e80...` and config `b6d5c39f...`. Original image ID was observed before export and remains unchanged in the fresh daemon inspection. All nine compressed blob hashes match their names and the exact referenced closure. Eight bounded decompressions hashed **261908992 bytes** total under a **512 MiB** cap; each diff-ID equals both daemon RootFS and the exported config. Ten runtime-field comparisons, including Env, were performed only in memory and all match; no values or whole config/env are printed or retained in the diagnostic receipt.

Receipt: `/private/tmp/resumide-ocr-local-export-cbwzvgnp/derivation-inspection.json`. The observed inspection took 498 ms, with a 45-second outer deadline/30 CPU-second bound. The export remains a derived local OCI artifact with its own digest, not byte-identical proof of the original multi-platform/index/attestation object. `layoutAdmission:false` remains explicit. This is provenance preparation for a local-only probe base, not actual compiler, OCR quality, OS-vulnerability or runtime confinement acceptance.

Proposed next small child, if allocated: `scripts/latex-runtime/prepare-oci-probe.py`, `tests/unit/latex-probe-base.test.ts` and a separate probe handoff. It would verify the exact frozen archive/selected manifest/config/layer/diff-ID identities, reject duplicate/traversal/symlink/special/unbounded members and extra blob closure, and atomically materialize only a private read-only OCI layout with strict aggregate compressed/decompressed caps. No new tool/dependency, network, Docker import/tag/build or general archive extraction is needed. Keep that preparation separate from the cancellation probe itself; return exact source/tests/derived-layout hash and reviewed arguments before any build-side operation.

### Environment instruction correction

Before ROOT preparation, the coordinator found that the wrapper repurposed HOME for isolation, which conflicts with the standing developer instruction. The wrapper now preserves HOME unchanged and isolates the client with explicit `--config`, `DOCKER_CONFIG` and private `BUILDX_CONFIG`. Build/history/image commands share that same private Docker config. Application credentials and inherited Docker settings are excluded. Historical container HOME settings in the Dockerfile remain untouched.

A focused environment-admission red preceded the helper change. The final **68/68 focused tests pass**, including original HOME preservation and exact private config paths; lint/typecheck/format pass. The newly allocated OCI materializer child was paused after its expected missing-helper red for this correction. No Docker/OCI operation or source-packet renewal ran in this correction. These three wrapper/test/handoff hashes supersede the prior release; recipe/fixture hashes remain unchanged.

## Separate observed Buildx default-target/history correction

After the R13 source freeze, root allocated a separate three-file leaf: the heavy compiler wrapper, `latex-build-inputs.test.ts` and this handoff. The controller's observed OCI-selector/default-target/history fix was released first and remains a distinct leaf. No Docker/network/provider/database operation or probe retry ran in either correction.

The first real cancellation attempt failed closed before RUN. Its private local-state JSON used `Target: default`; the initial readers incorrectly rejected that value. Its internal qualified ref was `default/default/qx42uyaghp7g0tkt8dqqm0drp`, but the installed CLI required the exact suffix `qx42uyaghp7g0tkt8dqqm0drp` with builder `default`. Root's bounded suffix query returned terminal failed, an owned Context, Dockerfile `Dockerfile` and CompletedAt. The original unknown result, log and root's separate history-harness error receipt are preserved. Terminal failure without the RUN marker/delivered cancellation remains no proof.

Neutral replay tests exposed the unchanged private-reader behavior before the fix: empty target passed, observed `default` target failed, and history arguments still contained the qualified ref. The source now accepts only omitted/empty/default Target, retains qualified internal ownership binding, passes only its validated suffix to the exact-builder CLI, and requires the returned short Ref, Context and default Dockerfile to match. Other targets/IDs/contexts/files, arbitrary history and relative offsets remain refused. The renamed exported reader/helper functions are the same purpose-specific paths used by the actual wrapper, not test-only substitutes.

Final scoped result: **71/71 build-input tests pass**; together with the corrected controller and R13 sandbox tests, **115/115 tests in three files pass**. Scoped lint/format and Node22 typecheck pass. Existing timeout/log/disk/ownership/unknown-state guards, pins, native tests, E-010 disposition and image admission are unchanged. No broad suite was repeated.

Current wrapper SHA-256: `93443ba095ebe8717a30978c09e1fe66a23e71af342d5f55499f8e47dcf5c292`.
Current tests SHA-256: `4ffd367e2c8ffd59377f9c46414583f5cb403fa31f2f5c7c470f24a0710dfe70`.

This changes compiler source bindings. Root must integrate/review this leaf and R13, then prepare a fresh source/resource packet and separately allocate any corrected probe or heavy build. No old compiler/probe packet may execute against changed bound source. The utilities remain outside the compiler's explicit source list unless already listed; do not add new utility files speculatively.
