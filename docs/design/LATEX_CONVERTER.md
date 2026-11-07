# Build workspace: LaTeX-to-PDF converter

**Owner acceptance, 2026-11-07:** Gate AA7 is closed and owner-accepted under [ADR-0017](../decisions/0017-aa7-owner-acceptance-and-aa8-start.md), with disclosed risks and tested limits retained. Production activation remains deferred; AA8 has started.

Status: OWNER-APPROVED LOCAL DESIGN, 2026-10-30. The owner approved implementation after reviewing the revised design and ADR-0016. Implementation and synthetic verification are complete; formal Gate AA7 release/security/accessibility acceptance remains open. See the [closeout](../evaluation/AA7_ENGINEERING_CLOSEOUT_20261030.md).

## Purpose and scope

Provide a separate authenticated `/build` page with a LaTeX source editor beside a visual PDF preview. The candidate pastes a complete single-file document, compiles it, reviews the PDF, and downloads it. They can then manually upload the PDF through the existing resume-checker workflow. Compilation does not call the analyzer, create canonical resume records, calculate scores, or upload the result automatically.

The owner's Overleaf screenshot establishes the intended code-and-preview workflow and the required language capabilities. It is not a source fixture. No private document text from that screenshot is transcribed or retained here. Overleaf is a workflow reference; the converter does not connect to Overleaf or promise unrestricted project compatibility.

This request changes the canonical-to-LaTeX boundary in AA071 and [ADR-0007](../decisions/0007-canonical-resume-and-verified-rendering.md). The coordinator must record that scope change in the governing task evidence. The owner accepted this scoped departure through ADR-0016/E-007; existing canonical-renderer contracts and formal release gates remain unchanged. [Accuracy-v2 section 11](../../tasks/accuracy-authoring-plan.md#11-phase-aa7-standalone-sandboxed-latex-to-pdf-conversion) and [the artifact contract](../ATS_SCORING_AND_AUTHORING_SPEC.md#12-verified-rendering-and-latex) retain their separate security, accessibility and release gates.

## Supported single-file document proposal

The following capabilities define the implemented local scope. The dated closeout names the measured cases; this is not an unrestricted Overleaf compatibility claim.

| Area            | Proposed support and boundary                                                                                                                                                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document        | One complete `article` document, with ordinary class size and A4/US Letter options. Other classes require a later review.                                                                                                                                                                                                             |
| Packages        | An explicit versioned manifest containing `titlesec`, `latexsym`, `amssymb`, `amsmath`, `enumitem`, `geometry`, `hyperref`, and `xcolor`, plus their reviewed transitive dependencies. All packages are installed when building the compiler image. No package download occurs during compilation.                                    |
| Layout          | Headings, `titleformat`/`titlespacing`, list spacing, indentation, alignment and source-defined geometry within the agreed output bounds. Standard text styles, sizes and math notation are supported.                                                                                                                                |
| Macros          | Ordinary `newcommand` and `renewcommand` definitions, parameters and nested formatting used by single-file templates. User-defined helper commands are supported; a scanner cannot reject every command absent from a fixed global list. Reserved runtime/security commands cannot be intentionally redefined as a supported feature. |
| Content         | Lists, inline/display math and the environments supplied by the approved math packages. A concrete command/environment compatibility corpus must be agreed before implementation is labelled supported. Tables are a separate capability decision; the screenshot does not establish a table requirement.                             |
| Links and color | Text colors and ordinary `http`, `https`, and `mailto` links. Links are not fetched. PDF actions and annotations must pass the output policy before preview or download.                                                                                                                                                              |
| Fonts           | Use the immutable image's reviewed fonts and package defaults. Preserve the accepted document's typography. Filesystem font paths, arbitrary font installation and uploaded fonts are outside scope. Unicode support must be declared from measured glyph coverage, not assumed from engine selection.                                |
| Inputs          | Pasted UTF-8 source only. No project archive, external image, font, bibliography, attachment or supplementary source upload.                                                                                                                                                                                                          |
| Outputs         | Visual PDF preview and download. No DOCX, ATS-verified label, tagged-PDF certification or hiring-outcome claim.                                                                                                                                                                                                                       |

The package manifest must include versions and allowed options, not merely names. Layout and macro options can contain executable TeX; their presence in an approved package does not make arbitrary option values safe.

Templates for early-career, experienced and general-document examples will use synthetic content and the same capabilities above. They are editable starting points, not profile scoring policies. Each example declares its package manifest, language/font coverage and supported paper sizes. All three editable examples have been implemented and compiled on A4 and US Letter; the six-case benchmark passes. Measured Latin text and math coverage does not establish arbitrary Unicode support.

## Preserve source layout

Preserve accepted source bytes and hash the exact UTF-8 source dispatched to the compiler. Do not silently replace user geometry, fonts, heading definitions or helper macros. The earlier proposal to inject a fixed font/geometry preamble is withdrawn: it conflicts with the demonstrated document.

The editor should default to “Document settings” for paper size. A4/Letter controls may select an example's initial source; they must not silently override a pasted document. An explicit future paper-size conversion action would need to show its source changes before compilation. Effective PDF dimensions are measured after compilation; mixed or unsupported page sizes fail the output policy. Proposed page bounds are A4 or US Letter in portrait orientation. Margin and font-size bounds remain a layout decision; they must not silently reject the demonstrated layout. Security/layout review must define any additional bounds and distinguish visual inspection from machine-verifiable properties. No validator currently proves those bounds.

## Source admission and compiler boundary

TeX is programmable. Supporting template macros, math and package-defined commands invalidates the earlier tiny command allowlist. Static source inspection is an admission and usability layer; it is not proof that accepted input cannot read files, write files, loop, consume resources or synthesize another command.

Before dispatch, proposed admission checks validate UTF-8, the byte cap, one complete document, class/package manifest declarations and prohibited control/bidi characters. Reject `^^` encoding and direct shell, external include, arbitrary file, runtime package-loading, category-code and control-sequence construction primitives. Report only safe error codes. Definitions and comments require a real lexical model; substring matching alone is inadequate. These checks can reject obvious misuse but cannot establish the meaning of arbitrary macro expansion. Obfuscated or dynamically constructed operations remain hostile input for the sandbox to contain.

The runtime must deny network and shell execution, expose no host mounts, credentials, Docker socket or host environment, and provide only an immutable compiler/package/font filesystem plus bounded disposable scratch. Necessary TeX package reads are distinct from arbitrary external input access; read/write restrictions must be tested against the actual engine and manifest. No host compiler fallback or runtime installation is allowed. A non-root disposable container, hard resource limits, bounded transport, exact request ownership and verified timeout/cancellation cleanup are required proposals, subject to the separate compiler threat-model review.

Proposed admission/runtime limits remain 48 KiB source, 5 MiB PDF, 10 pages and two active compilations; the sandbox design owns CPU, memory, process, scratch, output and time caps. An immutable image digest and the policy/manifest version must accompany verification evidence. Containerization is a containment proposal, not a claim of immunity to engine, package, kernel or Docker vulnerabilities. The implemented sandbox requires Landlock confinement inside hardened Docker: permit reads only from the sealed engine/package/font closure, writes only to disposable scratch, and execution only of the approved engine. Fail closed when the required kernel enforcement is unavailable. Exact paths, rights, startup ordering, inherited handles and enforcement probes belong to the sandbox threat model; the runtime receipt proves the tested local configuration and exact image/source closure. Formal security review and acceptance of residual engine/kernel/parser risk remain release requirements.

Safe URL filtering at source level cannot cover every macro-expanded PDF link. Independently inspect compiled PDF actions, annotations and embedded objects. Reject scripts, launch/file/remote actions, attachments, unsafe URI schemes and malformed output before serving it. Hyperref settings that introduce active content are unsupported. If output inspection cannot enforce the reviewed policy, withhold the PDF rather than present it as safe.

## Proposed contracts and diagnostics

Source preparation should validate and preserve source, returning its hash, policy version and selected example profile. It must not infer a security guarantee from a TypeScript type. The sandbox independently checks the source/hash/policy binding before dispatch. The previous four-field contract with a server-forced `pageSize` needs revision: source paper settings are authoritative, and effective dimensions belong in the compiled output report. Exact interfaces require coordinator agreement before code is written.

The service authenticates and checks same-origin requests, enforces body/rate/concurrency limits and keeps source/PDF transient. Neither source nor raw compiler logs enter telemetry or handoffs. Diagnostics use fixed categories such as unsupported package, syntax failure, missing glyph, resource limit, unsafe output and cancellation. A sanitized line number may be useful, but raw log excerpts and host paths are never returned. Changing source invalidates the old preview/download; cancellation and late responses cannot restore a stale result.

Parse-back confirms that the output is readable and records its pages and text. Without a canonical expected-content model, that check does not establish complete source-to-PDF parity. A PDF that parses can still omit content, reorder it or be inaccessible. Synthetic examples must separately verify expected text/order/link recovery and layout. Candidate review remains required.

## Acceptance needed before implementation and release

The implementation records literal package-option keys, tested source/macro forms, preserved paper settings, resource/layout bounds and source/hash/policy contracts. Expanding classes, packages, fonts or options requires a new reviewed policy/image and affected tests. The owner has now approved the revised compiler design for bounded local execution; successful containment, output and compatibility evidence is still required before implementation is accepted.

The completed local verification ran synthetic compatibility cases for every declared package and example, preserving geometry and macro behavior. Include malformed source, comments and escapes, encoded controls, direct and macro-obfuscated file/shell/package access, link/action payloads, recursive macros, oversized output, page overflow, cancellation and cleanup. Verify denial at the correct boundary; do not claim every dangerous operation was rejected before execution when runtime containment stopped it instead.

Compilation, PDF inspection, parse-back, browser preview/download, private/no-store handling and stale-response behavior require separate evidence. Record the exact source/policy/image hashes, tested revision and omissions. Formal accessibility, security-owner acceptance and release approval remain open even when engineering checks pass. The feature stays default off until its applicable approvals permit activation.

### Current-page text access

The preview offers a native keyboard-operable “Read page text” disclosure below the visual PDF. It extracts text locally from the same PDF.js document and current page, renders plain React text and caps each page at 100,000 characters. Extraction failure leaves preview/download available and reports that the text is unavailable. Changing or dismissing a PDF, switching pages, and late extraction results cannot restore stale text. This helps users access page content; it does not add PDF tags, repair reading order or establish PDF/UA or assistive-technology acceptance. The real two-page browser check and component edge cases are recorded in the [accessible-preview evidence](../evaluation/AA7_INTERIM_ACCESSIBLE_PREVIEW_20261106.md).

## Build naming follow-up

The owner requested Build as the product name and `/build` as its public route. The compile resource is `/build/compile`; legacy `/latex` and `/latex/compile` redirect to their fixed same-origin replacements. The underlying LaTeX/compiler contract and default-off flags are unchanged. Historical AA7 receipts describe their original URLs and are not rewritten.

## Owner-reported interface and local activation repair (2026-10-31)

The Build page uses the shared floating navbar and one rounded editor/preview frame. The redundant icon-only rail and duplicate upload shortcut are removed. Desktop shows both panes; mobile uses labelled Code and PDF preview tabs. The footer explains the separate workflow: download the PDF, then choose New analysis. Decorative arrows are hidden from accessible control names.

The compile toolbar uses aligned controls with a minimum 44-pixel target. Example options has a fixed square SVG chevron, an expanded state and an explicit panel relationship. Download PDF retains the same outlined button dimensions before and after compilation, with paired theme colors and a decorative download icon. Below 360 pixels it occupies its own full-width row. Keyboard focus remains visible. See the [toolbar repair evidence](../evaluation/BUILD_TOOLBAR_REPAIR_20261031.md).

The owner reported disabled compilation on the local site. The local compiler settings were unset, so the default-off flag correctly blocked Recompile. After all nineteen runtime checks passed for the existing pinned image, local `.env` activation was applied and the web/worker pair restarted with an empty queue. Defaults and production activation remain unchanged. Actual current-site preview/download and sequential synthetic browser regressions pass; see [comment repairs](../evaluation/BROWSER_COMMENT_REPAIRS_20261031.md).

## Selection and native-option contrast (2026-10-31)

The transparent editing layer must still paint selected glyphs: use a selection foreground/background pair and avoid an explicit transparent WebKit text fill that overrides it. In forced colors, use system text and highlight colors. Native theme/example/paper options need an opaque theme-matched surface and foreground. Preserve the source, syntax highlighting and native keyboard interactions. The five-mode raster/contrast regression and native-popup evidence are in the [contrast repair report](../evaluation/EDITOR_CONTRAST_REPAIR_20261031.md).

## Inline AI assistance follow-up

The owner approved contextual fixes, rewrites and resume wording suggestions using the configured OpenAI credential. This is a separate capability from compilation and remains default off through `BUILD_AI_ASSIST_ENABLED` and `AI_ENABLED`. Local synthetic implementation and controlled-provider verification passed; details are in the [Build AI packet](../../tasks/agent-handoffs/2026-10-30-build-ai-coordinator.md). Two earlier synthetic live probes returned HTTP 401. A subsequent owner-requested structured-response probe succeeded; live end-to-end browser acceptance remains separate.

Hovering over a line, selecting lines or using the toolbar opens an accessible, dismissible popover. Hovering makes no provider request. Each Ask AI request requires explicit selected-context consent. The full buffer goes to Resumide transiently for source/hash/range binding; only the selected text and at most two nearby lines on each side reach OpenAI. The selection is limited to 20 lines/4,000 characters, the combined context to 8,000 UTF-8 bytes and the source to 48 KiB. Source, prompts, responses and PDFs are not persisted.

Show plain-text Before/After, explanation and questions before Apply. A proposed replacement must pass source admission. Applying requires the exact current source/hash/range/original text, invalidates the old PDF and leaves recompilation to the candidate. Undo applies only while the source exactly matches the last AI edit. Closing, editing or changing selection cancels pending work; generation checks reject late responses.

Resume wording is an unverified draft, with an explicit fact-confirmation checkbox before Apply. Protected numbers, emails and URLs must survive; missing facts produce advice/questions. These checks cannot establish semantic truth or canonical provenance. The tool does not calculate scores, add verified facts to canonical resumes or integrate with the analyzer.

Server-side authentication, same-origin checks, versioned consent, content-free audit, rate limits and a conservative monthly request quota precede provider use. The provider has no tools, retries or custom egress; requests use the configured model and official OpenAI endpoint, a 10-second timeout and 768-output-token limit. No dependency or database migration is added.

## November 6 security and runtime compatibility

The current private candidate preserves the eight-package source contract and source-defined paper settings. Trixie's hyperref requires the exact etoolbox.sty transitive file; its paper library requires the exact /etc/paperspecs data file. Both are hashed and verified in the sealed read closure. No broad read root, source rewrite, geometry override, Docker database or runtime network access was added. Earlier failed candidate receipts remain separate from the corrected image's passing checks.

All current private functional checks pass on imagefc8, including 1,242 unit tests and 71 browser cases. Full security closure remains incomplete: the unsuppressed image scan retains 80 high findings, with vendor/upstream and research-unknown states recorded separately. Production, document-accessibility and security acceptance remain open. See the [current closeout](../evaluation/AA7_FULL_SECURITY_CLOSEOUT_20261106.md).


## Accessible preview text fallback

The Phase7 completion audit found that the canvas exposes a page label but no readable document text to assistive technology. Add a labelled, keyboard-accessible text fallback for the current page, using PDF.js extraction from the same transient PDF already loaded in the browser. Keep the code/PDF two-column layout and PDF-only download. This is a web preview aid, not PDF tagging, a new exported format, canonical verification or an analyzer integration.

Use plain React text nodes, preserve page boundaries, and bound retained text to100,000 characters. No provider, persistence, telemetry or new dependency is allowed. Bind extracted text to the exact PDF generation and page; changing source/PDF, cancelling or switching pages must not expose a stale page's text. If local extraction fails, preserve visual preview/download and show a fixed text-preview-unavailable state. Browser keyboard/Axe and deferred-result/stale-generation tests must cover the fallback. Document-accessibility acceptance remains distinct from these web UI checks.


## Output admission hardening, November 7

The source now enforces the existing text-and-font-only scope at PDF output. It rejects raster filters before reader construction can decode structural streams, rejects inline images before their scanner runs, resolves indirect type names, and validates font and graphics resource roles. Embedded-font entries must resolve to nonempty streams. A per-inspection rejection flag prevents a parser recovery path from accepting a PDF after a policy failure. The pinned pypdf 6.21.4 hooks are restored after each call and require review on parser or concurrency changes; the worker handles one request per disposable process.

The original 20 PDF cases remain unchanged. The actual `6f623e1c…` worker passes the separate 49-case admission helper, four mocked boundary checks, all 107 frame cases and six supported profile/paper cases. The mocked checks generate no PDF bytes and do not exercise the real reader or a decoder. Full private application and browser checks also pass. [Current receipt](../evaluation/AA7_ATOMIC_NATIVE_PRIVATE_CI_20261107.json); [source and mock evidence](../../tasks/agent-handoffs/2026-11-07-aa7-image-latch-smask-proposal/README.md). This establishes bounded private verification, not generic PDF safety or security-gate acceptance. The known FreeType finding is being repaired separately.

## Proposed native extractor boundary

The current verified worker retains bbox XML. The [native geometry transport proposal](NATIVE_GEOMETRY_TRANSPORT.md) defines a private versioned mode preserving exact absolute coordinates and word order, alongside the upstream no-OpenJPEG build option. It is not adopted or a completed vulnerability fix. Existing formats, thresholds, supported source and public responses remain authoritative until the source, parity and complete runtime gates prove the replacement.
