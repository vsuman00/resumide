# AA7 Trixie transitive style repair

The representative synthetic macro document failed on22cb after the distribution upgrade. A bounded private diagnostic reproduced the unchanged production failure: XeTeX was denied access to etoolbox.sty. No private resume was used, and production logging/output checks were unchanged.

The actual caller is hyperref/hyperref.sty line115, which requires etoolbox. The file belongs to signed-snapshot texlive-latex-base2024.20250309-1, is46,850bytes and hashes to `23e5277f81dc963963081c91b1f674055914bd2ab1b479c522ed3e747fa9d10e`. The [provenance](AA7_TRIXIE_ETOOLBOX_PROVENANCE_20261106.json) binds the owner, parent dependency and hash. A [confined neutral marker probe](AA7_TRIXIE_ETOOLBOX_BRANCH_PROBE_20261106.json) returned0 and proved extrafloats is defined, so etoolbox's legacy etex branch is unnecessary. Its etoolbox.def input occurs only inside the tracingpatches macro; the supported fixture/hyperref does not invoke it. Those extra files remain denied.

The coordinator reviewed a single-file closure addition, using the existing fail-closed required-path helper. The eight direct styles and all directory read roots remain unchanged. The manifest records requiredTransitiveFiles as exactly that one path. The [exact patch receipt](AA7_TRIXIE_ETOOLBOX_PATCH_20261106.json) preserves the22cb failure and source binding; no assertions, resource bounds or PDF checks were relaxed.

The approved fifth build succeeded in2.51seconds as `sha256:4ea4aabf22823a6d76f6de957a8cead659494ae06fd09995dc81e9d2cda977b1`, tag `resumide-latex:aa7-trixie-etoolbox-20261106`. [Build receipt](AA7_TRIXIE_BUILD_ATTEMPT5_20261106.json). All prior images/failed receipts and application configuration remain unchanged.

Trusted [metadata](AA7_TRIXIE_ETOOLBOX_METADATA_20261106.json) verifies1974 closure files,811 required input hashes,8 direct styles,6 font groups and exactly one required transitive file. Closure SHA256 is `bcb690b3566ce83f3c16dcc7403e29b4115c67b5fec47bdb7b10e0ce47b9126c`. Installed222 Debian packages and pinned pypdf6.21.4 are unchanged; no PyPDF2/pip/compiler tools were reintroduced.

The refreshed [license audit](AA7_TRIXIE_ETOOLBOX_LICENSES_20261106.json) hashes222 copyright files and26 common-license files. It retains165 DEP5 declarations and57 explicit non-DEP5 metadata exceptions. No missing files, package-lock mismatch, unmatched lock entry or Python metadata exception was found. This is inventory evidence, not legal acceptance.

Both hardened audit containers were verified absent and the slot released to the tester. Full production-path macro/PDF/runtime verification and the exact-image security scan remain tester/reviewer-owned. Earlier scan findings are not cleared by this compatibility repair, and non-arm64 runtime behavior has not been verified.
