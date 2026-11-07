# AA7 immutable native HOME proposal

2026-11-06. Owner: `/root/aa7_frontend_review`; coordinator: `/root`. Status: proposal with neutral checks; not integrated, built or natively tested. Expat66382 remains open.

The separate [call-path review](../2026-11-06-aa7-pdf-inspector-call-path/README.md) found a real Fontconfig fallback: configuration-load failure enters built-in XML that includes HOME/XDG configuration. The normal sealed-font canary does not test this branch.

## Minimal patch

[runtime.patch](runtime.patch) changes exactly two HOME values: the supervisor's fixed native child environment and the confining launcher's fixed exec environment. Both become `/opt/latex/home`. The separate [dockerfile.patch](dockerfile.patch) creates that previously absent directory as root:root0555 before closure construction and sets the image HOME to the same path. Failing if the path already exists ensures the new directory starts empty. The container filesystem and existing `/opt/latex` permissions preserve its immutability for UID65532.

Working directory, output and temporary Scratch paths, compiler arguments, sealed Fontconfig settings, macros, fonts and geometry stay unchanged. No XDG variable is added. The native child environments already enumerate their complete allowed variables; ambient `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME` and `XDG_DATA_DIRS` do not reach those children.

## Exact default-path semantics

The versioned Fontconfig source is retained in the call-path packet with URLs and hashes. In `fccfg.c:2489–2503`, `FcConfigHome` reads HOME directly, with no passwd/getpwuid fallback. `FcConfigXdgConfigHome` at2534 derives `$HOME/.config` when XDG_CONFIG_HOME is absent; cache and data homes similarly derive `.cache` and `.local/share`. A nonempty absolute HOME prevents the relative `.config` fallback that a missing HOME could create. Default XDG data directories are `/usr/local/share` and `/usr/share`, while configuration search appends the compiled system directory. Those paths are immutable in the runtime.

`FcInitFallbackConfig` in `fcinit.c:38–58` contains the literal fallback XML and XDG includes. With the proposed native environment, its user includes point beneath `/opt/latex/home`, rather than candidate-writable Scratch. Fixed FONTCONFIG_FILE and FONTCONFIG_PATH continue selecting the sealed configuration for ordinary initialization. Scratch remains writable for document processing but is no longer a default Fontconfig HOME configuration root.

## Verification

Four neutral checks exercise the actual AST-extracted supervisor `run` function with fake subprocess/selector objects, parse the C environment literal, compare every non-HOME variable and assert the proposed image directory/working-directory contract. The unchanged baseline produces two expected HOME assertion failures; the proposal passes4/4. Both original and final RED/GREEN receipts are retained. No vendor code, C compilation, Docker process or native API ran for this proposal.

The tester owns the independent native failure-branch helper. Its required control forces a benign missing FONTCONFIG_FILE, places a family-alias canary at `/scratch/.config/fontconfig/fonts.conf`, and confirms the current Scratch HOME actually loads that file through fallback. The same control with immutable HOME must not parse candidate XML. A separate ordinary sealed-config comparison must retain all40 family/style tuples. Actual directory owner/mode/emptiness, fixed environments, native config-file enumeration and exact container cleanup must be recorded. These native tests are pending the coordinator's execution slot; neutral checks cannot stand in for them.

After coordinator integration, the combined image still needs the relevant runtime/render/browser checks and current source/image binding. No CVE is suppressed or accepted by this patch proposal.
