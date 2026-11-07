# AA7 native paper data repair

The4ea4 quick macro test still failed. A bounded private reproduction proved XeTeX now succeeds and xdvipdfmx fails to recognize native a4. The source is the same neutral synthetic fixture; no candidate document or private resume was used.

The coordinator authorized one diagnostic-only public-tree XeTeX recorder run and one unconfined verbose xdvipdfmx run inside the unchanged hardened worker image. The recorder succeeded and every non-scratch recorded input was already in the sealed closure. Confined XeTeX regenerated the same neutral document's XDV; the diagnostic backend succeeded and identified no additional missing font/map path. These controlled discovery runs do not prove production confinement or all possible library opens. Raw logs and recorder inputs remain in a private directory.

The exact missing data file is `/etc/paperspecs`, owned by libpaper2:arm64 version2.2.5-0.3+b2. It is1309bytes with SHA256 `d335af4a3d4a834d8b4156a8f7ae435a6463b78e83d34d774622b0aab3ae8962`, and contains native A4/Letter definitions. [Signed package, causal diagnostics and exact diff](AA7_TRIXIE_PAPERSPECS_PROVENANCE_20261106.json). No geometry override was introduced.

The reviewed one-line change adds that exact file beside etoolbox.sty to required_transitives. Direct styles remain8, requiredRuntime remains3 and directory read roots remain unchanged. Both transitive inputs are required and hashed before closure output.

Approved build6 succeeded as `sha256:8f7cbabfb247412220b1fa3b27aa9dff8e8c7c316173c0edad6b7690ce082fb8`, tag `resumide-latex:aa7-trixie-paperspecs-20261106`. All pins, production logging, source/PDF checks and limits remain fixed. Existing images, failed receipts and application configuration are preserved. [Build receipt](AA7_TRIXIE_BUILD_ATTEMPT6_20261106.json).

Trusted [metadata](AA7_TRIXIE_PAPERSPECS_METADATA_20261106.json) and [license inventory](AA7_TRIXIE_PAPERSPECS_LICENSES_20261106.json) passed; exact audit-container absence was verified and the slot released. The closure contains1975 files,812 verified required hashes and exactly two required transitive files. Closure SHA256 is `71b7e83e7bebfe4abd634188baeeea0d24cf933339d91742326dfe3ebeaa2e54`. Package versions remain unchanged:222 Debian packages,165 DEP5 declarations and57 explicit non-DEP5 metadata exceptions; no missing/lock/Python exceptions. This does not provide legal acceptance.

The coordinator/tester owns source integration, the unchanged confined macro regression and full matrix on this exact image. The compatibility repair does not clear the fresh all-severity vulnerability findings or provide cross-architecture verification.
