# AA7 native Poppler build readiness

Owner aa7_review, 2026-11-06. FROZEN PROPOSAL; no source build, compiler, native vendor test, package installation or producer execution has run. Root owns launch approval, canonical integration and format adoption. All earlier producer/consumer manifests, failed TSV evidence, fc8 and raw security receipts remain unchanged.

## Frozen packet

Folder: `scripts/latex-runtime/native-poppler` in the licenses worktree. Review manifest SHA256 `f6f3a3bbe7a55c6a8e1f4e4c534499e1d9e94a18b768b129be2d8be0ec7ab54d`; context manifest `58172309995aa90fd254c17f2217ded30f79f089ebdbb4b342d5f1a24cb60853`. Dockerfile `cf7848e70ed993825fa36b5565ace19fda1dfac88421cf77a8f653736d767cf4`; explicit ignore file `fe3aea33afc5ca9f39a971c2a816ea7854ab3112fea96d4947148be08c01c28e`; build.py `4c0db0a63b451fb83cf69b3395a4e03bfc12a470ed8fc7b19802d9b170c34ec8`. The context admits exactly 20 listed public source/helper/input files; environment files, Git metadata, earlier evidence directories and unrelated code are excluded. Actual BuildKit context transfer remains unexecuted.

The exact source remains archive-authenticated Poppler `25.03.0-5+deb13u4`, with all nine original Debian patches. Only the reviewed no-OpenJPEG flag, private formatter and honest local changelog/series entry change. The eventual builder repeats signature, full Sources, archive, patch and final-source hash checks. Developer DSC signature verification is not inferred. The consumer remains `8399d343...`; the producer patch remains `b5b3f124...`.

Official Git smart-HTTP supplied commit `0ef006dca68d2206387eca1d36ae06733812e387` and tree `fc4f06024ef19c51600baba9a4d5fba1ec452ec2`. A bounded tree-only fetch preceded the approved 64 regular fixture-blob fetch. All object IDs, sizes and SHA256 values match; total fixture bytes are 3,160,894. The separate COPYING metadata is preserved. The deterministic 65-file data/license archive is 2,599,472 bytes, SHA256 `79a6904104e3be7640f9ce27f8cc5e5c43cdeb6a2755c911afa0e55dd10b2b90`. Commit/tree hashes were independently recomputed. This is official-HTTPS/Git-object provenance, distinct from the Debian archive-signature chain. No Git developer signature or per-PDF legal acceptance is claimed. No explicit resume/JD filename was identified; fixture text was not extracted or published. These are upstream dependency-test inputs, not a representative candidate corpus. The browser access failure and all data-fetch receipts remain in provenance.

## Native verification contract

The pinned dated Trixie base and November 6 main/security snapshots remain unchanged. Normal original `dpkg-checkbuilddeps` and `dpkg-buildpackage -us -uc -b -j2` run as UID/GID65532, zero capabilities, NNP and network-none. All original architecture and independent build dependencies are explicit, including libcairo2-doc and libglib2.0-doc; no -d, -B, nocheck, test deletion or privilege bypass is used. The existing signed native APT transport keeps its 256-file/256MiB bounds and may fail closed if the actual transitive plan exceeds them.

The independent test gate discovers exactly the original 71 executable names, then runs full CTest fatally. Every test must run and pass; none may skip/fail. All 56 Qt programs must emit real positive totals exceeding init/cleanup, with zero failed/skipped/blacklisted results. Eighteen source-contained programs are explicitly required. The original ignored dh_auto_test exit never supplies acceptance. The exact independent consumer harness must pass all 107 cases/6 methods under builder Python. These are requirements, not actual native results.

The normal build produces the coherent libpoppler147/poppler-utils cohort. Gates require SONAME and every baseline dynamic export, an old-u4-header binary actually resolving the candidate, no opj imports/DT_NEEDED across runtime ELF files, the extractor's actual library graph, and the disabled cache/macro plus neutral inline-JPX EOF diagnostic. Seven pinned PDFs compare baseline/candidate bbox and TSV bytes, every private frame page/word coordinate string, normalized text and order, unchanged layout category and font inventory. No coordinate tolerance is added. The none mode may retain unrelated text after unknown JPX; whole-PDF rejection is not claimed.

A separate clean runtime dependency stage avoids conflicts with old development headers. Normal no-remove APT must propose and install exactly the two runtime packages, preserve flags/all other versions, then pass fresh nonroot CLI, text and installed-ELF hash checks. Package export occurs only after native gates pass. Failure remains fatal with every phase/log metadata entry retained; diagnostic tails alone have a 128KiB aggregate bound.

## Bounds and later acceptance

Static syntax, JSON, archive/object hashes and original source/consumer invariants pass. Actual native test, ABI, parity and APT-plan outcomes are pending. Observed free space was 11,746,246,656 bytes. Require at least 9GiB before launch and preserve a 3GiB floor; never prune automatically. Additional peak disk use is an unmeasured 4-6GiB estimate, mainly development packages, CMake/LTO/debug objects and cached intermediate layers. Context/data are only a few MiB. Export is capped 256MiB, the two runtime DEBs 64MiB, each log 32MiB; a host attempt has a 2400-second deadline. Recheck all hashes/disk before any approved attempt.

A native-package pass is not full converter acceptance. `build-test-contract.json` retains mandatory later root-integrated worker gates: runtime-bound framing, all current runtime/PDF cases, six profile/paper cases, fonts/geometry, rollback, semantic/render review, full private CI/browser tests, component/source/license inventory and fresh unsuppressed scan. Producer and consumer must be bound atomically to one immutable worker. Remaining Expat callers/upstream-open findings and human gates remain separate.

Proposed command, not executed (use a new owned 0700 attempt directory and clean environment):

```sh
docker build --pull=false --platform linux/arm64 --target artifacts --progress plain --iidfile "$ATTEMPT_DIR/image.iid" --tag resumide-latex-native-poppler:aa7-20261106 --file "$WORKTREE/scripts/latex-runtime/native-poppler/Dockerfile" "$WORKTREE/scripts/latex-runtime"
```

The coordinator and independent tester review the frozen recipe before launch. No root source, environment, database, provider, publication or deployment change accompanies this packet.
