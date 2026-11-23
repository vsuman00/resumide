# AA7 native-frame consumer integration proposal

2026-11-06. Owner: `/root/aa7_frontend_review`; coordinator: `/root`. Status: prepared against current root with neutral verification; not adopted. The running backend native build and later worker gates remain mandatory.

[supervisor.patch](supervisor.patch) rebases the frozen consumer integration onto current supervisor `282d4d7e2cbc64d6b8ad1df1c077631dd794929e5977b0273cc0e8619da017e2`. The resulting supervisor hash is `dc37bb22b043d5947d766776a4b09d8d390fd1a36e429289145d5393857cb559`. Its subprocess function is AST-identical to current root, preserving immutable HOME, Fontconfig settings, limits and work paths. The existing PDF inspector stays hash-bound at `07b6a1bb20579a8fbb25d98aa6c303180b62eb563034bf7733800e7375b89bb2`.

The patch imports the exact frozen [native_geometry.py](native_geometry.py), SHA256 `8399d3432cde87c92f55771f272bad82c42b26856f3b4096fc1f76bc88249da1`. It requests only private `-resumide-bbox` output into `/scratch/text.frame`, retains the2MiB file-stat check, and passes the independently inspected PDF page count into the consumer. Fixed `GeometryError` categories map through the existing output function. The supervisor's ElementTree import and bbox XML traversal are removed, with no alternate XML parser or fallback. Public JSON keys, PDF bytes, diagnostics and timeout mapping remain unchanged. The helper's own byte/page/text bounds and existing geometry predicate are preserved byte-for-byte.

The separate [Dockerfile COPY patch](dockerfile-copy.patch) adds the immutable helper before the existing read-only permissions step. The required [context allowlist patch](context-allowlist.patch) admits exactly that one additional file, changing the current18-file context to19. These patches add no package-installation stage; root owns the later native Poppler package integration. All three patches pass `git apply --check` against unchanged current root.

## Neutral verification

The existing independent consumer suite was reused without edits: six methods,107 cases, all passed. It binds the exact helper SHA and retains its original XML oracle only in the neutral test program; production has no XML fallback.

Ten new integration tests execute only the trusted supervisor's main AST with fake files, subprocesses and PDF inspector. The actual frozen consumer runs on synthetic frame bytes. They verify successful JSON, PDF inspection before extraction, independent page-count mismatch, layout category, XML rejection, stat bound before reading, growth after stat, missing frame, nonzero decoder, timeout and PDF-policy rejection. The success test also checks the exact private option/path. No actual resource limits are changed and no native or pypdf process runs. [integration-checks.json](integration-checks.json), [consumer-107-checks.json](consumer-107-checks.json) and [final-checks.json](final-checks.json) record those results and evidence limits.

The existing71 CTest executables,56 actual Qt outcomes, old-header ABI, native parity and package/source authentication gates are not supplied by these neutral tests. The proposed option requires the reviewed native producer; stock current pdftotext cannot substitute. Root must bind the combined worker image and new helper hash, then run full policy/profile/render/rollback/browser/CI/unsuppressed-security verification before adoption. Python XML7210 remains open on the current worker until that replacement is integrated and verified. Pypdf's separate lazy XMP import and native Fontconfig XML are covered by their own scoped evidence, not erased by this patch.

No root source, producer recipe, dependency, Docker container, database, provider or environment setting changed in this preparation.
