# AA7 baseline signature diagnostic fidelity review

2026-11-07. Reviewer: `/root/aa7_frontend_review`. Source fidelity review PASS for frozen backend manifest `5cd81f7e95e1a666ed956108ab234bf3c5a7de3b8da0a620986d316d6ebe3673`, driver `d0411f8b9ce509c2f352c9195c514c11db691b6f954c40d59d8e9068db1081f0`. Operational cache behavior still requires a coordinator decision. No diagnostic/native execution or download occurred.

All16 context files and12,706,296bytes match the manifest and exact Docker allowlist. The prior59 V3 files are unchanged. The dependency-stage prefix is byte-identical to V3. The three new Python scripts parse as AST; none was imported or executed by this review.

The concrete design improves on the illustrative standalone project: it invokes original Debian configure, original CMake autogen metadata, and exact generated compile commands for the signature translation unit and optional moc unit. It retains C++20, strict Qt iterators, actual include paths and warning flags. Link changes are limited to the two exact build-tree Poppler library paths replaced with installed baseline u4 SDK files. Both resolved files must appear with matching hashes in the resolved ldd binding, with no build-tree or missing library accepted.

Source preparation authenticates the complete index/archive chain, preserves original packaging and nine patches, checks original source hashes and verifies all65 fixture files. The SDK installer authenticates the two additional u4 packages and uses normal network-disabled APT with exact-two-install and unchanged-other-package guards. Genuine configuration must show signatures/NSS/GPG enabled and PGP default-off; no feature shim or source-test modification is used.

Review found and the frozen recipe corrected these issues:

- The original Qt6 library version is3.10.0; an initial3.11.0 path would have prevented the exact substitution.
- Raw ldd SONAME paths must be resolved before comparison with installed real-file paths.
- Actual config macros, parsed Qt XML/functions/backend tags/incidents and terminal log-size checks are now retained. Overflow or failed preflights remain incomplete diagnostics.

No full project/library build or native acceptance target is introduced. The entire unfiltered Qt6 class runs under the original UID/capability/NNP/network constraints only after authorization. Real SDK installation, configure, moc, compile, link, loader binding and test behavior remain unexecuted and must fail closed if their assumptions differ. Baseline failure is recorded as failure; a baseline pass cannot clear the candidate or reproduce all prior full-suite state.

One operational distinction remains: the a419 proposal/task calls for stopping on dependency-cache miss, while the frozen manifest explicitly permits the locked511-archive bootstrap only with separate approval. A byte-identical prefix establishes cache eligibility, not cache-only enforcement. This review authorizes neither that bootstrap nor execution. Root must decide and bind the launch policy before running the diagnostic. Existing time, disk/restoration and reporting bounds remain in force.

[review.json](review.json) records the exact checks and limits. [CHECKLIST.md](CHECKLIST.md) retains original target references, including the strict-iterator correction to the frozen illustrative project. The actual failed native assertion remains unknown; no cause or fix is inferred from this source review.
