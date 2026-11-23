# AA7 sealed Fontconfig preparation

Status: PREPARED; native comparison PASS; combined image attempt1 FAILED before final image creation; engine verification PENDING. CVE-2025-66382 remains OPEN.

Coordinator: `/root`. Owner: `/root/aa7_frontend_review`. Base HEAD: `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. All proposed source files are frozen in `/Users/vaibhavsuman/.codex/worktrees/aa7-20261106-accessible-preview/resume_ats`. This source preparation did not change shared runtime files, Dockerfile, dependencies, database, provider, or images. The coordinator subsequently integrated the reviewed files and separately assigned one combined image build; its distinct receipts are `docs/evaluation/AA7_SEALED_NATIVE_BUILD_ATTEMPT1_20261106*`.

## Proposed change

The new `scripts/latex-runtime/build-fontconfig.py` clones the installed immutable Fontconfig XML configuration into `/opt/latex/fontconfig`. It preserves ordered system aliases, matching rules, font directories, comments, and pre-root vendor notices. Static directory includes are expanded in native numeric-filename order. HOME/XDG/user includes, directories, and caches are removed and recorded. Missing optional `local.conf` is recorded. Unknown path attributes, prefixes, dynamic paths, escaping symlinks, nested path directives, cycles, and ambiguous source aliases fail the build.

The helper records each original logical path, resolved path, source SHA256, generated file path, generated SHA256, and removed user entry. It emits no external DTD. It adds no font read permissions. The closure keeps the existing font and immutable-cache file grants, replaces original `/etc/fonts` XML grants with exact generated XML files, includes the sealed entry point in `requiredRuntime`, and stores the helper receipt as `closure.fontconfig`.

Both the fixed native launcher environment and the supervisor child environment set:

```text
FONTCONFIG_FILE=/opt/latex/fontconfig/fonts.conf
FONTCONFIG_PATH=/opt/latex/fontconfig
```

HOME remains `/scratch`. Source policy, supported fonts, bbox/XML extraction, precision, PDF output, and geometry checks remain unchanged. The coordinator must add the helper to the Dockerfile COPY and private build-context allowlist before building.

## Native diagnostic

One hardened, nonroot, read-only, network-disabled container used existing image `sha256:8f7cbabfb247412220b1fa3b27aa9dff8e8c7c316173c0edad6b7690ce082fb8`. It had no host mounts or credentials. The helper wrote only a temporary clone under the container's Scratch tmpfs. Fresh subprocesses called the installed native Fontconfig API through `ctypes`.

- All 40 requests matched exactly by family, style, file, and face index: generic serif/sans-serif/monospace; Latin Modern Roman/Sans/Mono/Math; DejaVu Serif/Sans/Sans Mono; each with Regular/Bold/Italic/Bold Italic.
- The clone retained all 36 ordered vendor XML inputs as 36 generated XML files. It removed eight user entries: two font directories, four includes, and two caches. One absent optional `/etc/fonts/local.conf` was recorded.
- Native sealed font directories retained the system font tree, Latin Modern, Latin Modern Math, DejaVu, and X11 directories. Its only cache directory was `/var/cache/fontconfig`.
- The default control loaded a safe `/scratch/.fonts.conf` alias canary and changed four Roman matches. With the same canary present, the sealed configuration loaded only generated XML files and produced an unchanged complete snapshot.
- Vendor source hashes remained unchanged. Container exit code was 0; stderr was empty. Exact named-container absence was checked after cleanup, and the slot was released to the coordinator and backend agent.

This is a mutable Scratch clone and native API diagnostic. It does not establish immutable-image enforcement, actual confined-engine behavior, complete rendering equivalence, or a CVE fix. The reviewed combined image still requires font/semantic/geometry/render profiles, runtime isolation and canary checks, rollback, browser tests, and an unsuppressed scan. Do not mark the Expat CVE resolved from this diagnostic.

## Checks and artifacts

Helper fixture self-test, closure completeness self-test, and Python syntax checks passed. The fixture verifies ordered aliases and exact source notice retention, known user-path removal, generated hashes, and rejection of unknown paths and include cycles. Linux C compilation is deferred to the reviewed image build.

The [full diagnostic receipt](2026-11-06-aa7-sealed-fontconfig.json) retains source and generated hashes, every removed entry, all four native snapshots, the exact command, probe source, exit codes, and cleanup evidence. The exact owned host temporary directory was also removed after its hashes and raw data were saved. The [unified source patch](2026-11-06-aa7-sealed-fontconfig.patch) changes only the four owned files.

| File | SHA256 |
| --- | --- |
| `build-fontconfig.py` | `005e348a5342057ec43901e0be1e5b5ac254165f79930be26f0ee1f077d90b3e` |
| `landlock.c` | `8f4f7caa93f2a875db2038e17fa4558cd5577c59f883d07cd313c06d2993ea7e` |
| `supervisor.py` | `31f37b52a65b46ebce0625026ae4faaa3ea4b35e62b440635af621eb33b26e7c` |
| `build-closure.py` | `dd25c526769167236927eb4fee308894e6d7e2883e3affb71990794044df187f` |

The Fontconfig loading contract was checked against the [upstream 2.15 parser](https://raw.githubusercontent.com/fontconfig/fontconfig/2.15.0/src/fcxml.c) and [configuration documentation](https://fontconfig.pages.freedesktop.org/fontconfig/fontconfig-user.html). The actual installed native diagnostic supplies the bounded behavioral evidence.

## Separately authorized combined build

The coordinator integrated the four exact frozen files, the helper COPY/context entry, the reviewed native Expat recipe, and the exact six optional purges. One Linux arm64 build ran with `--pull=false`, a unique tag, no project environment or secrets, and a durable terminal wrapper. The three helper self-tests and Python syntax checks passed first.

Attempt1 exited 1 after 70.371 seconds; no IID was created. All 53 inventoried runtime source files were unchanged before/after. Runtime APT installation and the exact guarded six-package purge passed. The offline native Expat verification step then failed: APT returned 100 with `Internal Error, Pathname to install is not absolute`, although the supplied local `.deb` argument was absolute. The command included `--no-download`; the failure occurred before Fontconfig closure generation. No retry was started. All existing images remain.

The coordinator received the proposed narrow correction: remove only `--no-download` from the local-file native APT command while retaining `RUN --network=none`, `--no-remove`, and all package/hash/architecture/ABI checks. This is a proposal, not a proven diagnosis or applied source change by this agent.

Durable root receipts: `docs/evaluation/AA7_SEALED_NATIVE_BUILD_ATTEMPT1_20261106_PREFLIGHT.json`, `AA7_SEALED_NATIVE_BUILD_ATTEMPT1_20261106.json`, and `AA7_SEALED_NATIVE_BUILD_ATTEMPT1_20261106.log`. Terminal log SHA256: `5844a308b331b8d6f78e4c4613e819862fa5d696aa01fe5e6089b6eb9983c4fc`. The build process is terminal; the slot was released.
