# Final combined worker build

The combined worker built with exit 0 in 9.413 seconds. Its immutable image is `sha256:6f623e1c0210724e742e24dc4ec6fe2516b4116eb978c9abae22bb71b1db614a`, Linux arm64, UID `65532:65532`. All 578 code files, 48 runtime inputs and 42 context inputs stayed unchanged.

The first preflight stopped before Docker at the original 9 GiB admission limit. The coordinator recorded E-011 for one retry at 9,500,000,000 bytes; the 5,176,082,432-byte restoration reserve and abort floor stayed unchanged. Free space was 9,559,699,456 bytes before the build and 9,535,844,352 afterward. Peak consumption was not measured. No cleanup or pruning occurred.

The original dependency prefix, Expat build, native Poppler build and fresh-install check were cache hits. Their prior actual results remain bound to the image receipts; this build did not rerun those tests. The final runtime installation and closure generation ran. Copied immutable-image metadata retains native Poppler's actual 70/71 CTest result, all 56 complete Qt summaries and exact E-010 failure. The signer cause and later assertions remain unresolved.

The image contains 216 Debian packages, including the exact native Poppler two-package cohort and Expat 2.10.0 local package. OpenJPEG remains installed as a package even though the verified Poppler cohort has no OpenJPEG dependency/import; this is not a claim of zero findings. Package, source, installation and closure receipts were copied only as eight exact regular files from a never-started container, which was removed with absence verified.

The build and metadata slots are released. The tester must verify the actual combined worker's runtime, PDF policy, profiles, rollback and rendering before further acceptance. Application/browser checks, restored-database unsuppressed security scanning and license review remain separate. No database, provider, scanner, deployment or environment promotion was used.
