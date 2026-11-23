# R12 single local build-cancellation controller

Updated 2026-11-09. Owns only `scripts/probe-latex-build-cancellation.ts`, `tests/unit/latex-build-cancellation.test.ts` and this handoff. The compiler wrapper, native pins/recipes, OCI materializer and compiler source allowlist are unchanged. This is source preparation for one cancellation proof; **the first probe failed closed; no cancellation proof or compiler build exists**.

## Existing admitted base

The separately allocated materialization succeeded from ROOT. Layout: `/private/tmp/resumide-oci-probe-layout-20261109-runtime/oci-probe-0ro6mgiu/layout`; eleven exact read-only files, nine unique blobs, eight ordered layer entries, zero symlinks/partials and logical hash `48df7e5874dadfb3f9b226e03fbf5c4b182a0da106248b3a3319d6f46dd780f1`. Root independently verified it and the unchanged original archive/receipt hashes in `r12-oci-materialization.json`.

Actual materialization receipts: operation SHA-256 `cf23f414a6a62d5955a2f64daac9b16b49026c8a408152c82de02ab3df9d2246`; stdout `0ce9e44a7a10d323ceffa1c13563dc41630c61f460e6a7fac618c4b48e24657e`; sibling layout receipt `6c26400609c39e355b9827fbf40cdc06990952e32a929679d51385c8e7222749`. The operation returned zero, no stderr, captured its owned PID/PGID/start identity and proved group absence. This did not run Docker or establish runtime acceptance.

The probe names the derived local manifest `sha256:92d09e80a88e72d1dde96543b80c67a3b29ba1bbf9b18bb04e87c0b2e234a03f`. It preserves the distinction from original image/index `ab1d...` and config `b6d5...`. No new export, archive verification, decompression, Docker import, local tag or registry fallback is needed.

## Closed controller behavior

Preparation is the default. It binds the executing checkout, this controller and frozen helper bytes, ROOT's toolchain/materialization records, exact local layout, a new private output directory and generated synthetic context/policy. One fresh eleven-file layout admission supplies file stamps for subsequent checks; the unchanged archive is not reread. It hashes the installed Buildx binary against the admitted value and checks host space. The compiler's explicit 66-file allowlist is unchanged by this utility.

The controller reuses `buildClientEnvironment`, `createOwnedGroupGuard`, `assertExecutingCheckout` and `redactBuildLog`. HOME stays unchanged. Docker/Buildx configuration is private and contains only the admitted plugin directory; no application credentials, inherited builder or ambient registry configuration are forwarded. Its distinct `--probe-cli` entry avoids activating the imported compiler wrapper's `--cli` entry.

The generated context contains only a Dockerfile and `.dockerignore`. The Dockerfile has no external syntax directive, COPY, ADD or host mount. Its two instructions are:

```dockerfile
FROM probe-base
RUN --network=none ["/usr/bin/python3","-I","-B","-c","import time; print('RESUMIDE_PROBE_<unique hex>', flush=True); time.sleep(120)"]
```

The reviewed OCR source includes `/usr/bin/python3` and retains non-root user `10001:10001`. The Docker command supplies `probe-base=oci-layout:///.../layout@sha256:92d09e80...`, `linux/arm64`, no-network RUN execution, plain progress, no-cache and `--output type=cacheonly`. It has no tag, image load/push, privilege, secret, SSH agent or external cache. Docker documents [local OCI digest contexts](https://docs.docker.com/reference/cli/docker/buildx/build/) and [cache-only output](https://docs.docker.com/build/exporters/).

Remote-source fallback is denied separately from RUN networking. The version-1 source policy first denies `*`, then permits only `local://context`, `local://dockerfile` and the exact observed `oci-layout://docker.io/library/probe-base@sha256:<selected digest>` identifier. The OCI scheme denotes the registered local layout; the alias and digest are exact. A Docker registry/image identifier with the same alias is still denied. Every other source stays denied, including unknown schemes. No external frontend is requested. The policy uses `match_type: EXACT`, per the installed-version protobuf JSON field. The original candidate incorrectly selected a registration-store URI; actual LLB metadata supplied the alias form above. [Buildx's OCI registration](https://raw.githubusercontent.com/docker/buildx/v0.38.1/build/opt.go), [BuildKit 0.34 rule ordering](https://raw.githubusercontent.com/moby/buildkit/v0.34.0/sourcepolicy/engine.go) and [JSON enum handling](https://raw.githubusercontent.com/moby/buildkit/v0.34.0/sourcepolicy/pb/json.go) are the primary references. The last matching Allow/Deny rule wins; this is why the deny-all rule is first.

Execution needs the exact prepared fingerprint and creates one exclusive attempt marker. It rechecks source/input stamps and hashes, actual local toolchain/version/resources and host space. Only then can it spawn its detached Docker build client. The client captures and rechecks PID/PGID/start identity before signaling; a vanished/reused/unproven leader stays ownership-unknown and receives no unowned signal.

The controller reads only its private `buildx/refs/default/default` record. It requires one exact ref bound to its context and Dockerfile, with only omitted/empty or observed `default` Target accepted. Internal binding remains qualified as `default/default/<id>`; the CLI receives only the exact suffix ID and explicit builder `default`. Returned Ref must equal that suffix, Context must equal the owned context, and Dockerfile must be `Dockerfile`. It never lists arbitrary history or uses a relative offset. Timed RUN output such as `#5 0.123 RESUMIDE_PROBE_...` establishes readiness. The Dockerfile instruction text containing that marker does not establish execution.

Ready output plus a bound ref requests SIGINT. A delivered signal is counted only after the guarded syscall succeeds. Group absence and daemon terminal state are checked separately. Acceptance requires the actual timed marker, delivered cancellation, owned/ref-bound context, absent owned group, no ownership uncertainty, nonzero/null client exit and a **canceled or failed** terminal daemon record. A completed sleep, exited client alone, missing/running history, source/resource observation failure, output cap or unproven signal cannot pass. The normal receipt retains failures/unknown outcomes; a reusable cancellation proof is written only after pass. `runtimeAccepted:false` remains explicit.

## Caps, source tests and remaining boundary

The proposed probe lifecycle is at most 45 seconds with 1 MiB raw/retained logs. Ready/cancel deadline is 20 seconds, bounded escalation follows, and final history polling fits inside the total reserve. Independent watchdog signals cannot be suppressed by a pending filesystem observation. Individual observations and metadata CLI calls are bounded. Initial host free floor is 12 GiB; stop below 8 GiB. CPU/memory are recorded toolchain observations, not a new BuildKit hard-resource claim. Any ownership/daemon uncertainty remains unknown, preserves evidence and prevents retry/adoption. No global builder stop/prune/removal or unrelated service operation exists.

Initial red was the missing controller module. The first implementation exposed two relevant cases: an empty pre-ref directory needed to mean not-yet-bound, and observation failure could otherwise pass the signal/history checks. Empty-before-create is now handled; source/observation failure is fenced from acceptance. Scoped lint/type errors were then corrected without suppressions.

Final **19/19 focused tests pass**, with scoped ESLint/Prettier and Node22 typecheck. Tests cover the source deny/allow contract, false marker text, fixed cache-only arguments, unique exact refs, non-acceptance of incomplete cancellation, log/time limits, stalled observations and the separate CLI entry. Lifecycle ports simulate Docker; these tests do not prove actual daemon cancellation. No unchanged full suite was repeated.

## ROOT preparation and later single execution

Controller SHA-256: `0eca31f69365964472513f2418eb0408be1ee1bb4c1eb4a48adbb371027800cd`.
Tests SHA-256: `a79997a9b587a13e046cf4fd4048891263cee59813a39778e9845df329305622`.

After exact source integration/review, ROOT can create the following new empty owned 0700 directory and run preparation. Preparation creates synthetic files and a fingerprint; it does not call Docker. If the directory already exists/contains owner data, stop instead of clearing it.

```bash
mkdir -m 700 /private/tmp/resumide-cancel-probe-20261109-runtime-r2
RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic vite-node --config vitest.config.ts \
  scripts/probe-latex-build-cancellation.ts --probe-cli \
  --output-dir /private/tmp/resumide-cancel-probe-20261109-runtime-r2
```

Review the resulting `probe-packet.json`, exact Dockerfile/policy/context hashes, toolchain, host floor and actual generated marker. The admitted toolchain is Docker client/server 29.9.2, Buildx v0.38.1 with binary SHA-256 `c9b80299e87424ea661ae3898139044fe5457432003f71ea69bb225df87563a6`, BuildKit v0.34.0, local Linux/aarch64, 10 CPUs and 8319438848 bytes Docker memory. Execution rechecks those observations; a mismatch stops before build.

The later, separately reviewed one-probe command is:

```bash
RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic vite-node --config vitest.config.ts \
  scripts/probe-latex-build-cancellation.ts --probe-cli \
  --execute --packet /private/tmp/resumide-cancel-probe-20261109-runtime-r2/probe-packet.json \
  --approved REVIEWED_FINGERPRINT
```

No corrected packet or second probe execution exists yet. The original `9d1d02f4...` packet and first attempt remain preserved and must not execute again. Root owns that preparation/admission boundary and the one actual probe allocation. This source utility does not invalidate the existing 66-file compiler packet; the separately approved R13 application repair will change a compiler binding and require ROOT to prepare a fresh compiler packet afterward. Heavy build, compiler/PDF/confinement verification, OS/dependency disposition and release remain separate gates.

## Observed-contract correction leaf

Root's first allocated probe exited 1 after 1200 ms with no RUN marker, no proof, an absent owned group and no ownership uncertainty. Its policy denied the actual local OCI LLB source `oci-layout://docker.io/library/probe-base@sha256:92d09e80...`; it did not allow remote fallback. The private record contained `Target: default`. A fully qualified CLI history argument returned no record, while the exact suffix ID plus builder returned terminal **failed**, with the exact owned Context and Dockerfile. Root preserved the original attempt, log, terminal observation and separate harness-error receipt. No receipt has been rewritten as success.

This correction changes only the controller, tests and this handoff. Four neutral regressions reproduced the actual alias denial, default-target rejection and missing exact-ID history contract. Current focused result: **23/23 tests pass**, retaining all earlier proof/ownership/limits fences. Remote registry schemes, other aliases/digests, unowned targets/contexts and qualified or wrong returned IDs are rejected. The failed terminal fixture with marker/signal absent remains a failed proof. Scoped lint/format and typecheck pass.

The heavy wrapper's matching default-target/exact-ID correction is a separate source leaf. Root must integrate/review both, prepare a new packet and allocate any single corrected probe explicitly. This correction ran no Docker/network/provider/database operation and does not authorize an automatic retry.
