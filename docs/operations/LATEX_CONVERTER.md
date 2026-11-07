# Standalone LaTeX converter operations

Gate AA7 was closed and owner-accepted on 2026-11-07 through [ADR-0017](../decisions/0017-aa7-owner-acceptance-and-aa8-start.md). The tested limits and residual findings remain recorded; this does not activate production or clear other project release gates.

Updated: 2026-11-07. Local engineering runbook; formal security, accessibility and release acceptance remain open. Keep the converter default off. See [ADR-0016](../decisions/0016-standalone-latex-converter.md), [converter design](../design/LATEX_CONVERTER.md) and [coordinator evidence](../../tasks/agent-handoffs/2026-11-06-aa7-completion-coordinator.md).

The current verified, unpromoted worker is `4b83ffec…`. It includes immutable native HOME, framed geometry, disabled Poppler JPEG2000 support, PDF admission hardening and the verified FreeType source repair. All 28 runtime groups, 49 admission cases, four separate mocked boundaries, 107 frame cases, six profiles, rollback, render and complete private CI pass. Exact Supabase, process and temporary-file cleanup is complete. [Current closeout](../evaluation/AA7_FREETYPE_FINAL_CLOSEOUT_20261107.md).

The final image scan retains 947 raw advisories, including 80 high and zero critical. The original native signer test remains 70/71 under E-010; no vendor rerun under the final FreeType library or actual malicious-font reproduction is claimed. Formal security, accessibility, legal and release acceptance remain separate. The configured local environment has not been promoted. Completed engineering checks do not need another unchanged rerun.

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

Image builds fetch public dependencies. The [Dockerfile](../../scripts/latex-runtime/Dockerfile) pins the dated Debian Trixie base digest and Debian/security snapshot `20261106T000000Z`. The current recipe is an unpromoted security-remediation candidate with archive-authenticated native Expat2.10, framed Poppler and the FreeType repair, a sealed Fontconfig clone and exactly six guarded optional-package removals. Its complete scan still has unresolved findings. APT retains signed metadata/package verification. The image records exact installed versions in `/opt/latex/packages.lock` and the approved read-file hashes in `/opt/latex/closure.json`. Pinning does not establish vulnerability acceptance.

Build only the owned runtime context and inspect its immutable ID:

```sh
docker build --tag resumide-latex:local scripts/latex-runtime
docker image inspect resumide-latex:local --format '{{.Id}}'
```

The current recipe builds this private candidate. Its 28 runtime groups, original 20 PDF cases, 49 admission cases, six examples, rollback and paired rendering pass. Full private application retesting also passes; security acceptance remains open:

```text
sha256:4b83ffec76083b02a79df7addf5ff1f8e09b6d90135d73915b890b38b7753b16
```

A fresh build can produce a different image ID. Test that exact image and retain its receipt before configuring it; do not substitute a mutable tag. Runtime container creation uses `--pull=never`, so a missing image becomes an unavailable result rather than a request-time download.

Provide configuration through the approved process environment. This runbook does not load an environment file or print credentials:

```text
LATEX_CONVERTER_ENABLED=false
LATEX_COMPILER_IMAGE=sha256:4b83ffec76083b02a79df7addf5ff1f8e09b6d90135d73915b890b38b7753b16
```

An empty image setting is the repository default. Keep the flag false unless the applicable authorization permits local activation; formal production activation remains pending. Restart the application after approved configuration changes because server configuration is cached.

## Owner-authorized local activation (2026-10-31)

The owner reported that Recompile was unavailable and requested the browser findings be fixed. The local environment had neither converter setting, so the default-off state was the cause. The existing `600c…` image passed [nineteen actual sandbox/output checks](../evaluation/LATEX_RUNTIME_RECHECK_20261031.json) with no remaining owned containers. Only local `.env` was set to `LATEX_CONVERTER_ENABLED=true` and historical image `sha256:600c3815bdf12a4e3df6d332c0aea11685fd122f0fc3240b7be3c802fd23bf4f`. The newer candidate described above was not the image activated on that date. The Node 22 development web/worker pair restarted after verifying zero queued/leased jobs. Current-site compile, preview and download were then tested with neutral source against managed Supabase authentication/admission.

Repository/example defaults remain off. This is local activation under the owner's current repair request and E-007, not production or formal security/accessibility/release acceptance. No new image, Docker database, host compiler, migration, reset or weaker sandbox was used. Roll back by setting the local flag false and restarting the application. Detailed evidence is in the [comment repair report](../evaluation/BROWSER_COMMENT_REPAIRS_20261031.md).

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

The shared `consume_analysis_rate_limit` RPC uses `latex:user:<SHA-256-user-id>` and `latex:global:v1` keys. It stores opaque rate metadata only and does not consume analysis bucket keys. The two-job bound is per process, not distributed concurrency. Invalid/retried actions can consume admission capacity.

## Verification commands and evidence

Run these against synthetic fixtures, with no active converter jobs. Supply the exact locally built image ID as the positional argument:

```sh
npm run check:latex:source
npm run test:latex
npm run verify:latex -- sha256:4b83ffec76083b02a79df7addf5ff1f8e09b6d90135d73915b890b38b7753b16
npm run benchmark:latex -- sha256:4b83ffec76083b02a79df7addf5ff1f8e09b6d90135d73915b890b38b7753b16
```

The fifth script, `npm run test:e2e:latex`, requires a separately authorized direct Supabase test target and its protected test configuration. It uses port 3110. Do not run it with production credentials, invent an authorization value, provision a Docker database, or use a generic database-reset command. Coordinate its browser/server ownership with the testing worker first.

Historical candidate `19d2…` passed 20 runtime groups and 20 PDF policy cases, including actual Landlock rights, resource/network limits, maintained-parser identity, absent build tools, malformed/active output, cancellation and timeout cleanup. See the [exact candidate runtime receipt](../evaluation/AA7_HARDENING_CANDIDATE_RUNTIME_20261106.json). Its six profile/paper combinations passed; the 712 ms sample p95 is a six-sample local observation, not a performance guarantee. Generated PDFs remain untagged.

Historical `600c…` image evidence and failures remain in their original reports. The current verifier also requires the new required-style/font/runtime manifest fields and current source hashes. Run it against the exact new image; old600c/19d2 receipts do not validate the Trixie recipe. The [private candidate closeout](../evaluation/AA7_PRIVATE_CANDIDATE_CLOSEOUT_20261106.md) binds the current application, browser, rollback, license and scan evidence.


For the approved direct-Supabase synthetic target, `npm run verify:private:aa7 -- sha256:4b83ffec76083b02a79df7addf5ff1f8e09b6d90135d73915b890b38b7753b16` runs literal `verify:ci`, followed by the dedicated AI stub cases, source/self-tests and both dependency audits. It reads only the configured Supabase fields, uses private fixture ledgers and requires independent exact cleanup. Coordinate port3110 and the worker slot; no database container/reset is involved. The [current private receipt](../evaluation/AA7_FREETYPE_FINAL_PRIVATE_CI_20261107.json) records 1,242 unit tests, 65 general plus six AI browser cases, nine zero exits and 588 stable source inputs. Both npm audits report zero. The current image scan and source repair are recorded in the engineering closeout; raw advisory disposition remains open and production stays disabled.

## Diagnostics and retry

Responses expose fixed codes/messages, not compiler logs, paths or source excerpts. Source admission is not proof of isolation; the sandbox and PDF checks remain required.

| Code                                                 | Action                                                                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `source_invalid`, `source_too_large`                 | Check the complete article structure/input metadata or shorten the source.                                                        |
| `source_unsupported`, `source_unsafe`                | Use the supported package/options/source forms. Do not bypass the checker or weaken confinement.                                  |
| `compile_failed`, `missing_glyph`, `layout_overflow` | Correct syntax, use supported glyphs or reduce layout overflow, then recompile the current buffer.                                |
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

Keep `BUILD_AI_ASSIST_ENABLED=false` by default. Local testing requires the converter flag, `BUILD_AI_ASSIST_ENABLED=true`, `AI_ENABLED=true` and the existing configured OpenAI key/model/official base URL. Never expose the key to the browser or place it in screenshots/receipts. Two bounded synthetic probes returned HTTP 401; a subsequent owner-requested structured-response probe succeeded using the configured model. This provider smoke does not establish live end-to-end browser behavior.

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

The current Dockerfile uses the dated Trixie base and signed fixed snapshot, applies available base security upgrades, preserves the maintained pypdf wheel and retains the same supported source policy. Three checksum-pinned official Debian artifacts repair snapshot transport only. The arm64-specific artifact seeds APT only on arm64; other architectures use native signed APT selection. Only Linuxarm64 has been built and tested in this run. Required package, font, format and ELF-loader checks fail closed during the build. The approved transitive files include exactly etoolbox.sty and native /etc/paperspecs data; neither a broad directory read nor a paper-geometry override was added. Failed22cb/4ea4 compile receipts remain historical.

Historical candidate `8f7…` has zero critical, 89 high, 192 medium, 686 low and 11 unknown scanner matches. It has more high and total matches than19d2 and is not a general security improvement claim or release-approved image. The [complete final scan](../evaluation/AA7_FULL_SECURITY_PAPERFIX_COMPARE_20261106.json) preserves raw all-severity findings and full image identity binding. No ignore rule, severity filter or risk acceptance cleared these findings. Available upstream patches and native package availability remain separate questions.

The [full remediation record](../evaluation/AA7_FULL_SECURITY_CLOSEOUT_20261106.md) binds current functional checks, failures, cleanup and unresolved work. The current `.env` was not changed or promoted by this remediation. Production stays disabled pending the documented security, accessibility and release decisions. Do not infer approval from an image build or passing functional tests.

For the paired synthetic glyph/render check, run `npm run verify:latex:render -- sha256:19d2a00a2a830173bf1fae07dddfcac7d54be3047e58b276af031d3cbd1018ac sha256:4b83ffec76083b02a79df7addf5ff1f8e09b6d90135d73915b890b38b7753b16`. It uses the same renderer for both images, checks recovered text and embedded fonts, and writes four synthetic PNGs to a private temporary directory for visual inspection. Remove only that exact directory after review. This is not a tagged-PDF or assistive-technology certification.
