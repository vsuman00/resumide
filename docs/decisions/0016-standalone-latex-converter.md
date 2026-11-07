# ADR-0016: Standalone LaTeX converter and compiler boundary

## Status

**Owner acceptance update, 2026-11-07:** Gate AA7 is now closed and owner-accepted under [ADR-0017](0017-aa7-owner-acceptance-and-aa8-start.md), with disclosed residual risks. The dated local implementation history below remains unchanged; deployment and whole-project launch remain deferred.

Accepted by the workspace owner for bounded local implementation and synthetic verification, 2026-10-30, after the revised design and this ADR were presented and the owner replied “ok go for that.” This includes public dependency/image builds and the standalone workflow. Formal AA7 runtime/security, accessibility and release acceptance remain open; controls below are implemented and locally measured as recorded in the [closeout](../evaluation/AA7_ENGINEERING_CLOSEOUT_20261030.md). Expansion or production activation requires separate review. No production activation, hosted deployment, private-document use or publication is authorized.

## Accepted local product direction

Provide a separate authenticated source editor that converts supported single-file LaTeX to a visual PDF for preview and download. The candidate may manually upload that PDF through the existing resume checker. Conversion does not call the analyzer, create a canonical resume, assign scores, confirm facts or write source/PDF to application storage.

The requested source style uses custom commands and preamble configuration. The earlier proposal that rejected all macro definitions does not satisfy that requirement. The revised capability target includes `newcommand`/`renewcommand`, ordinary text/math, article documents, and reviewed uses of `titlesec`, `latexsym`, `amssymb`, `amsmath`, `geometry`, `enumitem`, `hyperref` and `xcolor`. Reviewed fonts and required engine packages form part of the immutable runtime. Preserve accepted source bytes, typography and geometry; withdraw the earlier forced-font/geometry injection. Source settings determine A4 or US Letter portrait output, with dimensions measured from the PDF. The [source design](../design/LATEX_CONVERTER.md) must enumerate supported forms, options and limits; these names alone do not promise arbitrary package options, macro programs or full Overleaf compatibility.

This standalone workflow is a proposed scoped departure from ADR-0007's canonical-to-LaTeX path and spec section 12. It leaves canonical rendering and its verification requirements intact. The coordinator must record accepted scope changes in the governing plan/spec before dependent implementation.

## Trust boundary

Treat programmable TeX as hostile code. Macro expansion can construct command names and file operations that are absent as literal tokens in the submitted source. Source validation provides supported-language errors and rejects known unsafe forms; a token allowlist cannot establish runtime isolation.

The enforceable target is bounded filesystem access: the compiler may read its submitted source, a sealed runtime/package/font closure and its own generated scratch files, and may write only its disposable scratch. Package loading and compilation necessarily perform file IO. User-uploaded include files, arbitrary host files, runtime package downloads and shell execution are unsupported. Synthesized loading of an already approved package file inside the closure is not claimed to be impossible. If the owner requires zero runtime includes or zero file IO, this programmable-source design cannot satisfy that requirement.

## Local runtime

Use a disposable XeLaTeX Docker container per attempt, addressed by immutable `sha256:` image ID. Never execute submitted TeX on the host or fall back to host Tectonic/XeLaTeX. No container receives host mounts, the Docker socket, host credentials, other candidates' content or provider configuration. Runtime network is disabled. The server constructs fixed arguments and a minimal environment; source travels through bounded stdin, never a shell command.

The container runs as a dedicated non-root user with read-only root, dropped capabilities, no-new-privileges, private PID/IPC namespaces, Docker's reviewed seccomp policy and no published ports. Docker exposes these controls, but configuring them is separate from proving the proposed worker uses them. See [Docker run reference](https://docs.docker.com/reference/cli/docker/container/run/).

Require a small, reviewed, single-threaded Landlock launcher before executing the compiler. It must deny filesystem rights by default, grant exact runtime/source reads and owned scratch writes, and permit execution only of reviewed engine/helper binaries. Include write/truncate and rename/link controls; close inherited file descriptors before entry. Landlock restrictions apply to the enforcing thread and descendants, not automatically to an unconstrained parent. Require ABI 6 or later and every policy right actually used; absence or failed enforcement returns a fixed unavailable diagnostic. Do not degrade to Docker-only compilation. The local worker kernel exposes ABI8; actual read/write/exec and resource probes passed on the pinned image. Other hosts remain unsupported until the same checks pass. See [Linux Landlock documentation](https://docs.kernel.org/userspace-api/landlock.html).

The compiler's approved closure must not grant broad read/execute access to `/usr`, the full TeX installation, `/proc`, shell binaries or interpreters. A separate supervisor may perform bounded input/output handling inside the container, but it passes no privileged descriptors or secrets to the confined compiler. The launcher and supervisor remain trusted code requiring review.

Use `-no-shell-escape` plus fixed Kpathsea configuration, including restrictive input/output policy and disabled runtime font/package generation. These are additional controls. `openin_any=p` does not identify an approved package set and does not replace the OS filesystem boundary. Dependencies sometimes need internal file loading; test the actual closure rather than claiming a configuration setting proves all includes are denied. See [Web2C file access policy](https://tug.org/texinfohtml/web2c.html).

## Package and build policy

Build public dependencies only after owner approval. Pin the base digest, repository snapshot, package versions, engine/helper binaries, fonts and launcher source. Record hashes and licenses in an image manifest. A digest pins a built image; it does not make a build against mutable repositories reproducible.

The proposed package roots are `titlesec`, `latexsym`, `amssymb`, `amsmath`, `geometry`, `enumitem`, `hyperref`, `xcolor`, required XeLaTeX/font support and their explicitly inventoried transitive files. Trusted synthetic examples can help discover required files, but observed dependency traces alone do not approve them. Review the closure manifest and expose only those files to the compiler. No `tlmgr`, `apt`, network font lookup, user-supplied fonts, class files, style files, bibliography or image assets are available at runtime. Adding a package or widening a file rule requires a reviewed image/policy version and repeat probes.

## Limits and output contract

| Resource                            | Proposed hard limit                              |
| ----------------------------------- | ------------------------------------------------ |
| UTF-8 source                        | 48 KiB                                           |
| Active attempts                     | 2 per server process; no unbounded queue         |
| CPU allocation                      | 2 CPUs                                           |
| Container memory / memory plus swap | 512 MiB / 512 MiB                                |
| Writable scratch                    | 128 MiB tmpfs, no persistence                    |
| Processes / open files              | 64 / 64 per process                              |
| Single file                         | 8 MiB                                            |
| Compiler CPU / attempt wall time    | 10 seconds per engine process / 20 seconds total |
| Returned PDF / pages                | 5 MiB / 10                                       |

Use one compilation pass initially; references or features requiring further passes remain unsupported until separately bounded and tested. A per-process CPU limit is not an aggregate container CPU-time budget. The wall deadline covers container launch, compilation and output checks. Bound JSON framing, stdout bytes, stderr consumption and PDF-parser work independently. Do not persist container logs; return only fixed diagnostic codes, never raw source, paths, compiler logs or extracted text in receipts.

The proposed application entry point accepts only a runtime-revalidated prepared document plus server-owned image ID and optional cancellation signal. A TypeScript brand alone is insufficient. Successful output contains transient PDF bytes, page count, extracted text for internal verification, safe diagnostics and elapsed time. The HTTP layer returns only necessary PDF metadata/bytes with private, no-store handling.

Before success, independently parse the PDF and reject malformed/encrypted output, active actions or embedded files, unsupported link schemes, missing/unembedded fonts, missing glyphs, overflow and excessive pages/bytes. Define and test the exact object/action policy, font policy and text/layout checks before implementation is accepted. Macro-authored documents have no canonical truth baseline; parse-back does not establish factual parity, ATS compatibility, tagged-PDF conformance or assistive-technology acceptance.

## Failure, cleanup and rollback

Cancellation, timeout, output overflow and failure must kill and remove the exact attempt container, then verify its absence. CLI exit alone is insufficient cleanup evidence. Track only run-owned container IDs and labels; never perform global pruning. Failure to prove cleanup closes local admission until an operator resolves the owned resource. Startup reconciliation handles abandoned owned attempts without touching unrelated containers.

Keep the feature default off. Missing image, failed manifest/policy check, unavailable Landlock or failed isolation probes makes conversion unavailable. Rollback disables conversion and removes only owned resources; it does not change the resume checker. A future hosted deployment needs a separately reviewed Docker-daemon/worker privilege boundary. This ADR proposes no hosted daemon exposure or new service.

## Evidence required before acceptance

The controls are IMPLEMENTED and VERIFIED at local synthetic engineering tier. Recorded evidence includes the exact source/image/manifest hashes, kernel and Landlock ABI, actual Docker inspect configuration, and real compiler probes for allowed packages/macros, constructed IO, denied files/packages, shell/network attempts, file writes, resource exhaustion, cancellation, timeout and cleanup. Probes must exercise the production confinement path. Test-only malicious payload entry points must not be exposed by the application API.

Use known synthetic fixtures for each supported profile/page size and macro/package capability. Record latency, parse-back, font/layout failures and visual inspection separately. Mock tests cannot replace container evidence. Accessibility, representative validity, security-owner acceptance and production release remain separate decisions. No private screenshot text or candidate content belongs in committed fixtures or receipts.

## Review outcome needed

The owner approved the standalone scope, bounded programmable-source capability and mandatory containment design for local implementation and dependency downloads. Security review must accept the residual TeX/kernel/parser risk and the conditional host requirement: conversion runs only on a Linux Docker runtime where the required Landlock policy is enforceable. A broader compatibility promise requires a different reviewed design, not a silent fallback.

## Product naming follow-up

Owner-requested current routes are `/build` and `/build/compile`, labelled Build. Legacy LaTeX URLs remain fixed same-origin compatibility redirects. This naming change does not widen the compiler boundary, activate production or authorize a new provider. AI assistance is a separate owner-authorized follow-up, specified in the [design](../design/LATEX_CONVERTER.md#inline-ai-assistance-follow-up) and [coordinator packet](../../tasks/agent-handoffs/2026-10-30-build-ai-coordinator.md). The owner explicitly approved reuse of the configured key and a bounded synthetic smoke. The first probe returned HTTP 401; a later owner-requested synthetic provider probe succeeded. No credential change, model fallback, production activation or formal gate waiver follows from this authorization. The assistant offers reviewed transient patches only, with per-request consent and strict source binding; it does not gain numeric authority or canonical fact provenance.

## Private hardening candidate, November 6

The coordinator reviewed a separate local security candidate under the owner's existing private-build authorization. Maintained, wheel-hash-pinned pypdf replaces PyPDF2; compiler headers/tools and pip stay in a builder stage. Base image, snapshot, allowed TeX packages, source policy, runtime isolation and PDF checks remain fixed. A checksum-pinned official Debian transport supplies one identical snapshot-authenticated artifact after the canonical snapshot URL failed; no unsigned package, version/date fallback or runtime host mount was introduced.

The exact candidate19d2 passed the internal matrix recorded in the [private closeout](../evaluation/AA7_PRIVATE_CANDIDATE_CLOSEOUT_20261106.md). Paired scans retain unresolved findings, and license metadata is not legal approval. The old image/configuration is preserved; production activation, security acceptance and document accessibility approval remain open.
