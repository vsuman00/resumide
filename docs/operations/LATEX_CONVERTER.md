# Standalone LaTeX converter operations

Gate AA7 was closed and owner-accepted on 2026-11-07 through [ADR-0017](../decisions/0017-aa7-owner-acceptance-and-aa8-start.md). The tested limits and residual findings remain recorded; this does not activate production or clear other project release gates.

Updated: 2026-11-09. Local engineering runbook; formal security, accessibility and release acceptance remain open. Keep the converter default off. See [ADR-0016](../decisions/0016-standalone-latex-converter.md), [converter design](../design/LATEX_CONVERTER.md) and [coordinator evidence](../../tasks/agent-handoffs/2026-11-06-aa7-completion-coordinator.md).

The [November 9 consumer check](../evaluation/CONSUMER_VALIDATION_20261109.md) found the configured compiler image absent. Two pinned builds stopped at Docker/BuildKit retrieval of the same public Expat asset. No new successful compiler, PDF, confinement or compile-dependent browser result was established. The current repair uses a verified local public-asset context; its source review and preparation do not establish runtime availability. See the [R12 record](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/runtime-assets.md).

Historical November 7 worker `4b83ffec…` was verified and unpromoted. It included immutable native HOME, framed geometry, disabled Poppler JPEG2000 support, PDF admission hardening and the verified FreeType source repair. Its receipts record 28 runtime groups, 49 admission cases, four separate mocked boundaries, 107 frame cases, six profiles, rollback, render and complete private CI passes, with exact Supabase/process/temporary-file cleanup. These are dated results for that image and source, not current runtime admission. [November 7 closeout](../evaluation/AA7_FREETYPE_FINAL_CLOSEOUT_20261107.md).

That historical image scan retains 947 raw advisories, including 80 high and zero critical. Its original native signer test remains 70/71 under E-010; no vendor rerun under the final FreeType library or actual malicious-font reproduction is claimed. Formal security, accessibility, legal and release acceptance remain separate. No image, environment or production flag is promoted by this runbook update. Preserve completed and failed receipts; retest the affected current candidate under its own allocation.

## Boundary and prerequisites

The authenticated `/build` editor sends its current source to `/build/compile`, previews the returned PDF and permits download. Uploading that PDF into the resume checker is a separate manual action. Compilation calls no analyzer or AI provider. Optional Build AI assistance uses a separate consent-gated `/build/suggest` resource. Redis is not required.

Use Node.js 22 and the repository's existing npm/lockfile installation. Docker is a local compiler-worker dependency only. Database, authentication and rate metadata use Supabase directly; do not start a Docker database, add a migration or reset hosted data for this feature. Existing application server configuration is still required even though compilation itself does not use AI.

The local Docker daemon must be reachable through a Unix socket. The backend verifies and pins that endpoint before sending source, rejects remote endpoints, and never changes Docker contexts. Inspect the selected context before operating it:

```sh
docker context inspect --format '{{.Endpoints.docker.Host}}'
```

If `DOCKER_HOST` is explicitly configured, it must also identify a local Unix socket. The compiler needs a Linux Docker kernel with working Landlock ABI 6 or later and the exact required filesystem rights. A reported ABI number alone is insufficient: run the actual confinement checks below. Missing enforcement fails closed. There is no host compiler or Docker-only fallback.

No compiler receives host mounts, credentials, the Docker socket or network access. The immutable package/font closure is the allowed read boundary; disposable scratch is the write boundary. Programmable TeX and package loading perform file IO, so this is not a zero-IO guarantee. A future hosted worker needs a separate privilege and Docker-daemon boundary review; this local setup is not a deployment recipe.

## Build, pin and configuration

Image builds fetch public dependencies. The [Dockerfile](../../scripts/latex-runtime/Dockerfile) pins the dated Debian Trixie base digest and Debian/security snapshot `20261106T000000Z`. The current source retains archive-authenticated native Expat 2.10, framed Poppler and the FreeType repair, a sealed Fontconfig clone and exactly six guarded optional-package removals. APT retains signed metadata/package verification. The built-image contract records exact installed versions in `/opt/latex/packages.lock` and approved read-file hashes in `/opt/latex/closure.json`. Historical scans retain unresolved findings; the changed recipe needs its own current image evidence. Pinning does not establish vulnerability acceptance.

The recipe now copies `expat-2.10.0.tar.xz` from the named local `verified-expat` context. The previous raw `docker build ... scripts/latex-runtime` command omits that required context and is no longer a valid build procedure. Use the [reviewed wrapper](../../scripts/build-latex-verified.ts); do not replace the context with a remote URL/image or bypass its input checks.

### Prepare a review packet only

From the same canonical checkout that contains the wrapper, use Node.js 22 and the existing local npm installation. `--asset-dir` must be an owned directory containing only the verified 543,404-byte `expat-2.10.0.tar.xz`, with SHA-256 `c624ba2998fc65df1163a49641ff3f9ab73138b11641d92c86bee0fb01b1bc7f` and read-only mode. Public-asset fetching is a separate explicit allocation; this command does not fetch it.

Create a new empty owned directory with mode 0700 outside the checkout for `--output-dir`. Replace each path below with its exact reviewed local path. Run from `RESUMIDE_CHECKOUT` so the configuration and local launcher resolve there:

```sh
RESUMIDE_CHECKOUT='/absolute/path/to/reviewed/checkout'
RESUMIDE_EXPAT_DIR='/absolute/path/to/verified-cache/c624ba2998fc65df1163a49641ff3f9ab73138b11641d92c86bee0fb01b1bc7f'
RESUMIDE_REVIEW_DIR='/absolute/path/to/new-empty-private-output-directory'
cd "$RESUMIDE_CHECKOUT"
RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic node node_modules/vite-node/vite-node.mjs --config vitest.config.ts scripts/build-latex-verified.ts --cli \
  --workspace "$RESUMIDE_CHECKOUT" \
  --asset-dir "$RESUMIDE_EXPAT_DIR" \
  --output-dir "$RESUMIDE_REVIEW_DIR"
```

Private mode disables `.env` loading in this launcher. The wrapper uses read-only local Docker/toolchain observations and creates the exact allowlisted compiler snapshot, separate public-asset context and `review-packet.json`; it does not start a build, contact an AI provider or access Supabase. It preserves `HOME` and isolates build clients with private `DOCKER_CONFIG`, explicit `--config` and `BUILDX_CONFIG`, without forwarding application credentials or inherited Docker settings. A successful preparation reports `review_required` and `buildStarted: false`.

### Execute only after separate review and allocation

Before execution, review the exact packet fingerprint, executing checkout, source/context hashes, local Unix daemon/toolchain and current resources. The wrapper requires a recent reviewed cancellation receipt that binds that toolchain and a proved exact-owned terminal daemon ref plus client-group absence. An exited client alone is insufficient. The local-only cancellation probe is a separate operation; preparation does not authorize it or a compiler build.

The allocated build must retain the wrapper's 2400-second owned-build lifecycle bound, 32-MiB log cap, 12-GiB host free-space admission and 8-GiB stop floor. CPU/memory are observed, not hard BuildKit limits. Execution uses `--cli --execute --packet <exact review-packet.json path> --approved <reviewed 64-character fingerprint> --cancellation-receipt <exact reviewed receipt path>` instead of preparation flags. A consumed attempt must not be retried automatically. Earlier packets withdrawn after source changes must remain evidence only.

Each reviewed output directory has its own local worker tag. The wrapper checks that the tag is unused before starting and verifies that Docker reports the built image ID under that same tag afterward. Earlier candidate images and their receipts can stay available for diagnosis.

The final result keeps `runtimeAccepted: false`, including after a `candidate_built` solve. Inspect and test that exact immutable image, with fresh source/advisory admission and actual compiler/PDF/confinement/rollback/browser checks, before any separately authorized configuration change. Unknown ownership, daemon outcome or candidate identity does not supply acceptance.

On November 22, the reviewed image was absent locally. A new preparation verified the pinned Expat archive and froze 61 build files for Docker 29.9.3 and BuildKit 0.34.2. The previous cancellation proof is tied to an older toolchain, and its probe layout is absent. Restore an approved immutable image copy if available. For a rebuild, review a new local-only probe base, verify cancellation on the current toolchain, then review and allocate the prepared build. [Preparation receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-r12-compiler-recovery-preflight.json)

The replacement cancellation probe uses an exact, read-only ARM64 OCI layout exported from a local worker. Prepare it with `scripts/probe-latex-build-cancellation.ts --probe-cli --output-dir <private-empty-output> --layout <reviewed-layout>`. The build and probe packets bind the current daemon ID and socket identity. A Docker restart or replacement can require new packets and a fresh proof. On Docker 29.9.3, the independently reviewed probe reached its neutral marker, canceled the exact owned BuildKit operation, and observed the client group exit. [Cancellation receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-r12-current-cancellation-proof.json)

The first rebuild stopped when the rolling Debian mirror returned a different security source-index checksum. The recipe now fetches all three source indexes from the dated Debian archive. The archive returned the exact pinned bytes for each index. BuildKit still verifies every original checksum, and the package, signature and runtime checks stay in force. [Recovery receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-r12-debian-snapshot-recovery.json)

### Test the reviewed worker artifact in GitHub Actions

The **Isolated LaTeX compiler** workflow runs source and unit checks for the converter and Build AI on manual dispatch. The `run_runtime` option adds compiler runtime, benchmark, and rollback checks on a protected branch and a native ARM64 runner. The protected job pulls a previously approved artifact. Build preparation continues through the reviewed wrapper above. [GitHub ARM64 runner availability](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) · [Docker digest pinning](https://docs.docker.com/reference/cli/docker/image/pull/)

Configure the `reviewed-latex-runtime` environment after the exact reviewed compiler has an authorized registry copy. Set `LATEX_CI_ARTIFACT_AUTHORIZATION=reviewed-compiler-runtime`, `LATEX_CI_IMAGE_REF` to the immutable manifest reference at `ghcr.io/<owner>/<repository>-latex-worker@sha256:<manifest-digest>`, and `LATEX_CI_IMAGE_ID` to the reviewed Docker image ID. The manifest digest identifies the transfer. Before any compiler starts, the runner checks that the pulled image ID and `linux/arm64` platform match the review. Grant the workflow read access to the package. [GitHub Container Registry authentication](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

The workflow uses a read-only package token and uploads only synthetic runtime receipts. A source-only dispatch supplies source evidence. A requested runtime run reports unavailable or failed if admission or verification cannot finish.

On dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, the 10 artifact-admission tests passed with a controlled Docker CLI. They covered the exact command order, mutable references, foreign repositories, wrong image IDs and platforms, and failed transfer. Both source checks passed along with 117 LaTeX and 216 Build AI tests. The previous candidate was absent from local Docker. Registry transfer, actual compiler/PDF and rollback execution, rendered parity, and authenticated compiler and Build AI checks still need their approved targets.

Historical November 7 receipts belong to this image:

```text
sha256:4b83ffec76083b02a79df7addf5ff1f8e09b6d90135d73915b890b38b7753b16
```

A fresh build can produce a different image ID. Test that exact image and retain its receipt before configuring it; do not substitute a mutable tag. Runtime container creation uses `--pull=never`, so a missing image becomes an unavailable result rather than a request-time download.

Provide configuration through the approved process environment. This runbook does not load an environment file or print credentials:

```text
LATEX_CONVERTER_ENABLED=false
LATEX_COMPILER_IMAGE=
```

An empty image setting is the repository default. Keep the flag false unless the applicable authorization permits local activation; formal production activation remains pending. Restart the application after approved configuration changes because server configuration is cached.

## Owner-authorized local activation (2026-10-31)

The owner reported that Recompile was unavailable and requested the browser findings be fixed. The local environment had neither converter setting, so the default-off state was the cause. The existing `600c…` image passed [nineteen actual sandbox/output checks](../evaluation/LATEX_RUNTIME_RECHECK_20261031.json) with no remaining owned containers. Only local `.env` was set to `LATEX_CONVERTER_ENABLED=true` and historical image `sha256:600c3815bdf12a4e3df6d332c0aea11685fd122f0fc3240b7be3c802fd23bf4f`. The newer candidate described above was not the image activated on that date. The Node 22 development web/worker pair restarted after verifying zero queued/leased jobs. At that time, compile, preview and download were tested with neutral source against managed Supabase authentication/admission.

Repository/example defaults remain off. That local activation used the owner's October 31 repair request and E-007; it was not production or formal security/accessibility/release acceptance. No new image, Docker database, host compiler, migration, reset or weaker sandbox was used. Roll back by setting the local flag false and restarting the application. Detailed evidence is in the [comment repair report](../evaluation/BROWSER_COMMENT_REPAIRS_20261031.md).

## Supported source and limits

Accept one complete `article` document with ordinary helper macros, headings, lists and math. Approved direct packages are `titlesec`, `latexsym`, `amssymb`, `amsmath`, `enumitem`, `geometry`, `hyperref` and `xcolor`. The exact literal package-option keys are versioned in [`LATEX_PACKAGE_OPTIONS`](../../app/lib/server/latex-source.ts); examples include geometry margins/paper dimensions, math alignment options, enumitem options, hyperref visual/metadata/bookmark options and named color sets. Unknown keys, option paths and embedded control sequences are rejected. Do not infer arbitrary package-option compatibility from a package name.

Accepted source bytes, geometry, typography and macros are preserved. No replacement font/geometry preamble is injected. Example A4/Letter choices edit the example source only. Actual output must be A4 or US Letter portrait, with supported crop/rotation/unit settings. One pass is supported; external assets, includes, supplementary uploads, bibliographies, custom classes/fonts and runtime installation are unsupported. This is not full Overleaf compatibility.

| Control                 | Enforced setting                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Source / JSON body read | 48 KiB UTF-8 source; bounded JSON framing; five-second body deadline                                                        |
| Output                  | 5 MiB PDF; 10 pages; bounded internal parse-back text                                                                       |
| Admission               | Per-user 3/minute; global 20/minute; two active jobs per server process                                                     |
| Runtime                 | Two CPUs; 512 MiB memory with no extra swap; 128 MiB scratch                                                                |
| Process/file limits     | 64 PIDs; 64 open files; 8 MiB single-file limit                                                                             |
| Time                    | 10 CPU seconds per engine process; 20-second compilation wall deadline; cleanup verification has separate bounded CLI calls |

The shared `consume_analysis_rate_limit` RPC uses `latex:user:<SHA-256-user-id>` and `latex:global:v1` keys. It stores opaque rate metadata only and does not consume analysis bucket keys. The two-job bound applies per process and covers startup checks, image inspection, compilation and cleanup. A saturated process returns `busy` before running another Docker command. A failed or cancelled preflight releases its slot without creating a container. Invalid or retried actions can consume rate-limit capacity.

The two rate checks share a five-second deadline after authentication. Cancellation stops the pending transport and prevents further admission or compile work. If the deadline expires, Build reports temporary unavailability and keeps the editor ready to retry. A rate increment that already committed still counts.

## Verification commands and evidence

Run applicable checks against synthetic fixtures under their allocated services/targets, with no active converter jobs. Runtime commands require a newly admitted exact local image; the November 7 ID is historical and the November 9 check found the configured image absent. Replace the placeholder with the reviewed immutable image ID before an authorized runtime run:

```sh
npm run check:latex:source
npm run test:latex
RESUMIDE_TEST_IMAGE_ID='sha256:<reviewed 64-character image digest>'
npm run verify:latex -- "$RESUMIDE_TEST_IMAGE_ID"
npm run benchmark:latex -- "$RESUMIDE_TEST_IMAGE_ID"
```

The fifth script, `npm run test:e2e:latex`, requires a separately authorized direct Supabase test target and its protected test configuration. It uses port 3110. Do not run it with production credentials, invent an authorization value, provision a Docker database, or use a generic database-reset command. Coordinate its browser/server ownership with the testing worker first.

Use the [guarded managed Build runner](MANAGED_TESTING.md#verify-build-against-an-isolated-managed-target) to run the same browser cases with the approved compiler and reconcile the exact Auth and rate-limit fixtures.

Historical candidate `19d2…` passed 20 runtime groups and 20 PDF policy cases, including actual Landlock rights, resource/network limits, maintained-parser identity, absent build tools, malformed/active output, cancellation and timeout cleanup. See the [exact candidate runtime receipt](../evaluation/AA7_HARDENING_CANDIDATE_RUNTIME_20261106.json). Its six profile/paper combinations passed; the 712 ms sample p95 is a six-sample local observation, not a performance guarantee. Generated PDFs remain untagged.

Historical `600c…` image evidence and failures remain in their original reports. The current verifier also requires the new required-style/font/runtime manifest fields and current source hashes. Run it against the exact new image; old 600c/19d2/4b83 receipts do not validate the changed recipe. The [November 6 private candidate closeout](../evaluation/AA7_PRIVATE_CANDIDATE_CLOSEOUT_20261106.md) binds that dated application, browser, rollback, license and scan evidence.

The [November 7 private receipt](../evaluation/AA7_FREETYPE_FINAL_PRIVATE_CI_20261107.json) records the then-authorized `verify:private:aa7` run against historical image 4b83: 1,242 unit tests, 65 general plus six AI browser cases, nine zero exits and 588 stable source inputs, with both npm audits at zero. That wrapper runs literal `verify:ci` and further AI stub/source/audit checks; inspect its current side effects before any new allocation. A fresh run requires an admitted image, protected direct-Supabase synthetic target, exact fixture ledgers/cleanup and coordinated port 3110/worker ownership. Docker database/reset or legacy loopback restore paths are ineligible. The historical scan and source repair remain in their closeout; raw advisory disposition remains open and production stays disabled.

## Diagnostics and retry

### Verify the missing compiler in a local browser

The November 22 Stage 6 check used the exact reviewed image from the prior runtime receipt. The image was absent from local Docker. Two requests from the authenticated Build page reached the real read-only image check and returned HTTP 503 with `runtime_unavailable`. The editor retained the current code, Recompile stayed available, and Download PDF stayed disabled. The Docker command record contains one container listing and two image inspections. [Verification receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-u11-real-missing-compiler-browser.json)

The test uses the built application, synthetic sign-in and rate admission, and the actual local Docker daemon. The fixture sends no requests to a managed service. It requires the specified image to be absent and no converter containers to be present. Run it after the web build with Node.js 22.

```sh
compiler_image='sha256:5e5c2436bcac0a97c4616d7392d1089ecf7ef7d6d5df9063c02e4498d1e0d431'
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=production RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic \
  SUPABASE_URL=https://local-build.invalid SUPABASE_PUBLISHABLE_KEY=synthetic-build-fixture \
  SUPABASE_SECRET_KEY=synthetic-build-fixture OPENAI_API_KEY=build-ai-harness-no-live-key AI_ENABLED=false \
  LATEX_CONVERTER_ENABLED=true LATEX_COMPILER_IMAGE="$compiler_image" \
  node node_modules/vite-node/vite-node.mjs --config vitest.config.ts \
  scripts/verify-local-build-missing-compiler.ts "$(command -v docker)"
```

The reviewed successor worker passed the local Chrome compile, preview and download journey with synthetic authentication. The runtime drill refused admission when it found an abandoned test container. Exact removal left that process quarantined, and a fresh process compiled a readable PDF. No converter containers remained. [Verification receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-r18-latex-debian-stock-security.json)

### Verify the editor with synthetic PDF responses

Local Chromium used the built application and PDF.js to verify page navigation, readable page text, AI apply and undo, and downloaded PDF bytes. The browser sent the original, edited and restored source in order. Applying and undoing the edit cleared the previous canvas, text and download. Synthetic routes supplied compilation and suggestion responses. Real worker compilation remains open. [Verification receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-u08-build-pdf-lifecycle.json)

Run the browser check after the web build with Google Chrome installed. It uses a loopback server and synthetic credentials. At 200% page zoom, the check covers sign-in in a separate tab, exact source retention, empty response refusal and retry. [Recovery verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-u08-compile-response-recovery.json)

```sh
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=production RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic \
  SUPABASE_URL=https://local-build.invalid SUPABASE_PUBLISHABLE_KEY=synthetic-build-fixture \
  SUPABASE_SECRET_KEY=synthetic-build-fixture OPENAI_API_KEY=build-ai-harness-no-live-key \
  AI_ENABLED=true BUILD_AI_ASSIST_ENABLED=true LATEX_CONVERTER_ENABLED=true \
  RESUMIDE_BUILD_BROWSER_ZOOM=true \
  node node_modules/vite-node/vite-node.mjs --config vitest.config.ts scripts/verify-local-build-pdf-lifecycle.ts
```

After the reviewed ARM64 image is available locally, add `RESUMIDE_BUILD_REAL_IMAGE="$RESUMIDE_TEST_IMAGE_ID"` and `LATEX_COMPILER_IMAGE="$RESUMIDE_TEST_IMAGE_ID"` to that command's isolated environment. The browser sends three neutral documents to the real compiler. Auth, rate admission, the AI suggestion and the recovery responses use fixtures. One reply declares a single page for a readable two-page PDF. Chrome verifies that Build withholds preview and download from that reply, then recompiles the same source. Chrome verifies the PDF.js canvas and page text, and compares each downloaded file with the exact response bytes. The check simulates one canvas failure and verifies that keyboard retry restores the page without a new compile request. The runner checks for remaining converter containers at the end. [Output verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-u08-browser-pdf-verification.json)

At 200% zoom, the runner holds two browser requests before forwarding them. One check keeps the Code pane and editor focus through a successful compile. The other keeps focus on Cancel until the response arrives, then verifies that focus returns to Recompile. [Keyboard and pane verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-u08-compile-pane-focus.json)

Add `RESUMIDE_BUILD_ADMISSION_EXPIRY=true` to the real-worker run to hold one synthetic rate response until the server deadline. Chrome checks the 503 message, disabled download and retained editor source, then retries through the actual worker. [Admission recovery receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-u08-compile-admission-deadline.json)

On November 22, XeTeX chose the development copy of `article.cls`, and Landlock denied access. The compiler now searches the stable LaTeX and generic package directories. The build verifies that class lookup selects the exact stable path. The rebuilt image passed all six profile and paper combinations, a two-page PDF render with eight embedded fonts, and three byte-matched Chrome downloads. The final Docker check found zero converter containers. [Current image and browser receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-r14-real-compiler-and-chrome.json)

Use the same fixture environment with `scripts/verify-local-build-ai-deadline.ts` to reproduce the suggestion deadline. Chromium deliberately receives the expired reply after a fresh, consented request. Only the fresh suggestion can be reviewed and applied. The check simulates the suggestion endpoint. [Deadline verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-u10-build-ai-client-deadline.json)

Responses expose fixed codes/messages, not compiler logs, paths or source excerpts. Source admission is not proof of isolation; the sandbox and PDF checks remain required.

| Code                                                 | Action                                                                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `source_invalid`, `source_too_large`                 | Check the complete article structure/input metadata or shorten the source.                                                        |
| `source_unsupported`, `source_unsafe`                | Use the supported package/options/source forms. Do not bypass the checker or weaken confinement.                                  |
| `compile_failed`, `missing_glyph`, `layout_overflow` | Correct syntax, use supported glyphs or reduce layout overflow, then recompile the current buffer. `compile_failed` and `layout_overflow` can carry a `diagnostic` with a kind and line; success can carry up to 20 line-level warnings in the `X-Latex-Warnings` header.                                |
| `output_invalid`                                     | Withhold the PDF. Review a synthetic reproduction against output policy; never return the rejected output as a fallback.          |
| `busy`, `rate_limited`                               | Wait for capacity; rate-limit responses provide a retry interval. Avoid repeated automatic submissions.                           |
| `cancelled`, `timeout`                               | Confirm cleanup, simplify the source if needed and explicitly retry. A stale result must not become current.                      |
| `runtime_unavailable`                                | Check the pinned local image, Unix daemon, Landlock and direct Supabase admission availability. Do not switch to a host compiler. |
| `cleanup_failed`                                     | Stop retries and follow quarantine recovery.                                                                                      |

Authentication, disabled-feature, method and origin errors require the normal signed-in page and correct configuration/request path. No retry should send source to another provider or persist it for debugging.

## Quarantine recovery and rollback

Startup refuses admission if converter-owned containers already exist. Cleanup failure or ambiguous Docker creation also quarantines the process. A killed/disconnected create client can leave a late-created idle container; immediate absence does not clear that uncertainty. Source is not sent until creation succeeds. Quarantine is deliberately not cleared by an automatic retry.

First set `LATEX_CONVERTER_ENABLED=false` in the approved process configuration and stop converter-serving processes. Coordinate all workers so an active job from another process is not mistaken for an abandoned one. Inspect only converter-owned resources:

```sh
docker ps -a --filter label=resumide.latex.service=converter --format '{{.ID}} {{.Names}} {{.Image}}'
```

For each reviewed resource, inspect its full ID, `resumide-latex-<UUID>` name, image and both service/policy labels. Do not inspect raw logs or environment values. Replace the placeholder only after ownership review:

```sh
CONVERTER_CONTAINER_ID='<reviewed full container ID>'
docker container inspect --format '{{.Id}} {{.Name}} {{.Image}} {{index .Config.Labels "resumide.latex.service"}} {{index .Config.Labels "resumide.latex.policy"}}' "$CONVERTER_CONTAINER_ID"
docker rm -f "$CONVERTER_CONTAINER_ID"
docker container inspect --format '{{.Id}}' "$CONVERTER_CONTAINER_ID"
```

The final inspect must report that the exact container is absent; a daemon connection error is not proof of absence. Re-list owned labels after the daemon settles to catch late creation. Do not prune globally, remove unrelated containers, or delete database resources. Keep the feature off if ownership or cleanup cannot be established.

After reconciliation, restart the serving process to reset its quarantined in-memory state, rerun the isolated checks against the pinned image, and obtain any required activation approval. Rollback leaves the flag off and cleans only reviewed owned resources; the resume checker remains independent.

## Privacy and claims

Source/PDF remain transient in request/browser memory and disposable container scratch; no application source/PDF persistence or remote history is implemented. User-downloaded files are the user's explicit local copies. Never retain source, extracted candidate text, PDF bytes, raw compiler logs, credentials or screenshots in operational receipts. Keep only approved opaque metadata, hashes, fixed codes and synthetic verification results.

PDF structure, embedded-font, link, page and parse-back checks do not establish complete source-content parity, factual correctness, ATS compatibility, hiring outcomes or accessible/tagged PDF conformance. Keep formal security-owner, accessibility and release approvals separate from the local engineering results above.

## Optional Build AI assistance

Keep `BUILD_AI_ASSIST_ENABLED=false` by default. Local testing requires the converter flag, `BUILD_AI_ASSIST_ENABLED=true`, `AI_ENABLED=true` and the existing configured OpenAI key/model/official base URL. Never expose the key to the browser or place it in screenshots/receipts. Historical AA7 probes recorded two HTTP 401 results followed by one successful owner-requested structured-response probe. The original November 9 consumer probes returned HTTP 401 and remain preserved. After the owner updated the configured key, all five bounded synthetic generation requests returned HTTP 200; one repaired the LaTeX fixture, while four writing paths retained no edits. [Updated-key report](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/r01-live-validation.md). That run predates the new all-mode source guard and does not prove its live usefulness or browser behavior.

All three modes now use the finite source-support contract described in the [design](../design/LATEX_CONVERTER.md#inline-ai-assistance-follow-up), with consent policy `build-ai-selected-context-v2`. Unsupported content is withheld; changing an AI mode cannot bypass the check. Supported edits retain exact source/range binding and the existing Apply/Undo lifecycle. Feature defaults, provider configuration and technical budgets are unchanged.

The service admits at most two active requests per process, three per user per minute and twenty global requests per minute. Deployment-wide counters use managed Supabase's existing atomic rate-limit RPC. Membership determines the organization; versioned selected-context consent and content-free audit are stored in existing tables. No prompt/source/output is stored.

The existing actual-token ledger covers analyses only. Build therefore reserves a conservative 25,000-token allowance per request through an organization/month request counter, keyed by UTC month and an opaque organization hash with a 32-day window. The allowed request count is the floor of the remaining analysis token allowance divided by 25,000. Failed and cancelled admitted requests are not refunded. This bounds Build requests conservatively; it is not shared atomic billing with concurrent analysis jobs and does not represent measured charged tokens. Enforced payload/context byte limits, fixed prompt/schema size and the 768-output-token cap support the reservation.

The provider timeout is ten seconds, with SDK retries disabled and no tools. Failures expose fixed safe messages; never log provider bodies. To roll back assistance, disable its flag and restart the server. Manual editing and compilation retain their separate controls. Formal compiler/security/accessibility/release approval remains required before production enablement.

## Private rollback drill

Run `npm run verify:latex:rollback -- <reviewed immutable image ID>` under Node 22 with the local worker daemon available and no existing owned converter jobs. The verifier first checks the disabled service branch with mocked identity/storage/compiler, then uses one stopped worker container to prove refusal and retained process quarantine. It removes only that exact resource and compiles a neutral synthetic document in a fresh isolated process. It does not reset a database, stop the daemon or make a provider call. The flag-off stage is unit HTTP evidence; the quarantine/restart stage uses the actual worker.

The dated [rollback receipt](../evaluation/AA7_ROLLBACK_RECEIPT_20261106.json) records the successful internal drill. Keep production/security/accessibility approval separate. Database tests use managed Supabase directly; Docker is worker-only.

## Exact-image private security evidence

The [historical19d2 license inventory](../evaluation/AA7_CANDIDATE_IMAGE_LICENSES_20261106.md) records package copyright hashes, declared DEP5 labels, vendored parser metadata and unresolved entries. The earlier baseline inventory remains historical. `python3 scripts/audit-latex-licenses.py --self-test` checks its parser without opening image paths. Run the audit itself only with the reviewed worker-only launcher in that report and an explicit `--image-id` argument matching the independently inspected immutable image; it is not a host inventory command or legal approval.

The [CVE report](../evaluation/AA7_IMAGE_CVE_20261106.md) preserves an enforced-offline scan of the exact pinned image, including four critical and 269 high raw package matches. Functional tests do not clear these findings. Keep raw results, vendor applicability and runtime reachability separate. No scanner upload, suppression or production activation is authorized by these receipts.

## November 6 historical19d2 candidate

The prior recipe used maintained pypdf 6.21.4, a hash-pinned wheel, and builder-only compiler/header/pip tools. It preserves the same Debian base, snapshot and TeX capability policy. One XeTeX artifact is obtained from the official Debian pool using the exact SHA256 authenticated by the fixed snapshot's signed index; a read-only build-stage mount seeds APT after index update. This changes transport, not package selection. [Provenance](../evaluation/AA7_PINNED_XETEX_ARTIFACT_PROVENANCE_20261106.json).

Candidate19d2 passed runtime20/PDF20, six profile/paper cases, rollback, combined application verification and all13 dedicated browser cases. Its paired private scan retains3critical/70high raw package matches. Do not treat the candidate as security-cleared or automatically replace configuration; the previous600c image and all failed receipts remain preserved. See the [private closeout](../evaluation/AA7_PRIVATE_CANDIDATE_CLOSEOUT_20261106.md).

## Historical paperfix candidate and unresolved security gate

The historical paperfix recipe used the dated Trixie base and signed fixed snapshot, applied available base security upgrades, preserved the maintained pypdf wheel and retained the same supported source policy. Three checksum-pinned official Debian artifacts repair snapshot transport only. The arm64-specific artifact seeds APT only on arm64; other architectures use native signed APT selection. Only Linux arm64 was built and tested for that candidate. Required package, font, format and ELF-loader checks fail closed during the build. The approved transitive files include exactly etoolbox.sty and native /etc/paperspecs data; neither a broad directory read nor a paper-geometry override was added. Failed22cb/4ea4 compile receipts remain historical.

Historical candidate `8f7…` has zero critical, 89 high, 192 medium, 686 low and 11 unknown scanner matches. It has more high and total matches than19d2 and is not a general security improvement claim or release-approved image. The [complete final scan](../evaluation/AA7_FULL_SECURITY_PAPERFIX_COMPARE_20261106.json) preserves raw all-severity findings and full image identity binding. No ignore rule, severity filter or risk acceptance cleared these findings. Available upstream patches and native package availability remain separate questions.

The [November 6 remediation record](../evaluation/AA7_FULL_SECURITY_CLOSEOUT_20261106.md) binds that candidate's functional checks, failures, cleanup and unresolved work. That remediation did not change or promote `.env`. Production stays disabled pending the documented security, accessibility and release decisions. Do not infer approval from an image build or passing functional tests.

The historical paired synthetic glyph/render invocation was `npm run verify:latex:render -- sha256:19d2a00a2a830173bf1fae07dddfcac7d54be3047e58b276af031d3cbd1018ac sha256:4b83ffec76083b02a79df7addf5ff1f8e09b6d90135d73915b890b38b7753b16`. A new run requires two separately admitted local image IDs and an allocation; those historical IDs do not establish present availability. The checker uses the same renderer for both images, checks recovered text and embedded fonts, and writes four synthetic PNGs to a private temporary directory for visual inspection. Remove only that exact directory after review. This is not a tagged-PDF or assistive-technology certification.

## Opt-in local-PDF image

`poppler-local-pdf-artifacts` builds the packages and records their native test results. `local-pdf-runtime` uses the reviewed artifact directory as the `local-pdf-packages` named context and requires its `POPPLER_LOCAL_PDF_RECEIPT_SHA256`. It exports a fresh filesystem with the existing nonroot runtime settings. The Dockerfile still selects `default-runtime` when no target is supplied. [Dockerfile](../../scripts/latex-runtime/Dockerfile)

`scripts/verify-latex-rootfs.py` compares Docker-saved Linux ARM64 image archives, their platform manifest digests, and effective filesystem exports from stopped, disposable containers. The November 22 receipt binds those checks to the exact image, Chrome downloads, the Landlock probe and the full offline scan. [Verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-r18-flattened-latex-worker.json)

For the reviewed local image, extract the six files from the [build evidence bundle](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-r14-local-pdf-admission-artifacts.tar.gz) into a disposable directory. The primary verifier takes that directory and the reviewed image digest. Its default invocation continues to use the predecessor Poppler profile.

```sh
npm run verify:latex -- "$RESUMIDE_TEST_IMAGE_ID" --local-pdf-admission "$RESUMIDE_POPPLER_ARTIFACT_DIR"
```

The opt-in profile verifies the installed package evidence and the separate original and padding-normalized signature records. It also runs the frozen 107-case frame suite, the Landlock probe and four layout checks. Broader runtime and release acceptance remain open. [Admission receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-r14-local-pdf-primary-admission.json)

Run the lifecycle checks separately against the same immutable local worker image.

```sh
npm run verify:latex -- "$RESUMIDE_TEST_IMAGE_ID" --focused-lifecycle
```

The verifier holds worker input open before sending any document bytes. It checks cancellation, wall-time expiry of a paused worker, capacity refusal and container cleanup. It then compiles an ordinary two-page document in the same process to verify recovery. [Lifecycle receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-r14-flattened-latex-lifecycle.json)

Check the source and output page limits with ordinary synthetic documents.

```sh
npm run verify:latex -- "$RESUMIDE_TEST_IMAGE_ID" --focused-boundaries
```

The source check refuses 49,153 UTF-8 bytes. The worker compiles an exact 49,152-byte source, and PDF.js verifies the text and order of all ten pages. The eleven-page document is withheld. A one-page compile in the same process verifies recovery, and the verifier checks for remaining converter containers. [Boundary receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-r14-exact-source-page-boundaries.json)

The output byte check runs the installed supervisor and compiles an ordinary one-page document. A test wrapper pads the rendered PDF with comments before the supervisor checks its size.

```sh
npm run verify:latex -- "$RESUMIDE_TEST_IMAGE_ID" --focused-output-bytes
```

At 5,242,880 bytes, the supervisor reads the PDF, checks it and returns the parsed page. At 5,242,881 bytes, it rejects the file before reading it or running text extraction. Separate adapter tests check the same limits on decoded response bytes. [Output ceiling receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-r14-exact-pdf-output-ceiling.json)

Check the effective kernel settings from inside a disposable worker.

```sh
npm run verify:latex -- "$RESUMIDE_TEST_IMAGE_ID" --focused-resources
```

The probe reads CPU, memory, swap, scratch and privilege settings. It confirms that the kernel denies excess processes, file descriptors and file size. It verifies loopback-only active networking and checks the routing tables without sending packets. The scratch capacity and CPU and memory ceilings are measured settings. Saturation tests for those resources are separate. [Resource receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-r14-effective-worker-resources.json)

Run the saturation checks in one disposable worker while other converter jobs are idle.

```sh
npm run verify:latex -- "$RESUMIDE_TEST_IMAGE_ID" --focused-saturation
```

The probe observes a local cgroup OOM kill at the 512 MiB memory ceiling, a child stopped at the 10-second CPU limit, and an allocation refused after 128 MiB of scratch fills. It releases the test files and checks that scratch capacity returns before removing the worker. [Saturation receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-r14-exact-worker-saturation.json)

Verify the installed PDF inspector and compile a known two-page document with a public link.

```sh
npm run verify:latex -- "$RESUMIDE_TEST_IMAGE_ID" --focused-pdf-policy
```

The profile checks 16 neutral structural cases against the installed inspector. Five additional tests use mocks to observe image-policy rejection and hook restoration. The production compile adapter then returns a two-page PDF, which PDF.js checks for the exact link and eight text positions. The profile records the inspector hash and verifies container cleanup. [PDF policy receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-r14-exact-worker-pdf-policy.json)

## Image requalification, 2026-11-24

The package list grew (`fancyhdr`, `tabularx`, `array`, `marvosym`, `babel[english]`, `parskip`), the supervisor now returns structured diagnostics, and overfull boxes up to 20 pt are warnings. That required a new image. Candidate `sha256:e7a49adc9a9c232ffa99894d84d4e65fac5aae7b251c42f54b0e732dde01d23a` passed the runtime verifier (31 checks), the template corpus, the six starter profiles and the rollback check. Two earlier candidates were withdrawn: `2dce2827…` (the closure exposed all of `tex/latex/tools`, so `shellesc.sty` was readable) and `110feecb…` (every overfull size compiled, so off-page text was possible). The closure now grants only `tabularx.sty` and `array.sty` from `tools/`. The cancellation probe base was rebuilt locally and re-pinned in `scripts/probe-latex-build-cancellation.ts`. The Trivy result (0 critical, 145 high, 47 unique CVEs) needs owner disposition. This is a local engineering candidate; release stays disabled. [Receipt](../../tasks/agent-handoffs/build-experience/image-requalification.json)
