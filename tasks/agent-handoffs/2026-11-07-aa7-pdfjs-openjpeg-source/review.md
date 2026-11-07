# PDF.js OpenJPEG distribution provenance review

Observed 2026-11-07. This is a bounded source/metadata review. It does not execute the decoder, WASM, browser, native source or a malformed document, and it supplies no vulnerability clearance or release approval.

The installed PDF.js build marker `295fb3ec4` and official `v5.4.54` tag both resolve to `295fb3ec4fe04c6c60102442f904163dccc5a226`. The installed OpenJPEG WASM, JavaScript fallback and two nested license files match the official exact-release Git blob identities and sizes. Local SHA-256 values are recorded in `artifact-binding.json`; the upstream identity comparison uses Git's blob SHA-1 metadata. This binds the installed distribution bytes to the release, not to a reproducible codec-source build.

| Installed artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `openjpeg.wasm` | 257382 | `cb031f36245b389e1f5bffc59d10eed35bb0f85d7368b46c3f0b462042ec8e9e` |
| `openjpeg_nowasm_fallback.js` | 462316 | `53c228428a8861035a34738966af263fc9d4cee6df25a0ad942af947469a0bd9` |
| `LICENSE_OPENJPEG` | 2112 | `a6af136f3e15038a666b61f376612a07d9a4e48cb7c01adbf3e33b3f14ab49b6` |
| `LICENSE_PDFJS_OPENJPEG` | 1285 | `717fc62da03292dbb4dd0c8280bd4ce7bb8550dcf31d772bc93455fb50313425` |

The [exact-release README](https://github.com/mozilla/pdf.js/blob/295fb3ec4fe04c6c60102442f904163dccc5a226/external/openjpeg/README.md) points to Mozilla's separate `pdf.js.openjpeg` builder repository and documents Docker-based generation through `node build.js -C` and `node build.js -co /pdf.js/external/openjpeg/`. It does not pin that builder's checkout, OpenJPEG C-source version, patch list, Emscripten/toolchain version or container input. The retained WASM path history identifies commit `ac925f4f1be258ee90a7bb16be78fa33a8a0e344`, describing downscaling during JPEG 2000 decoding. Its retained metadata does not identify the separate builder checkout. No separate fallback source revision was established.

The remaining gap is finite: identify an authoritative build-input record for these exact WASM and fallback bytes, including the codec revision, patches and toolchain. Current builder-main contents would not establish that history. No OpenJPEG version or CVE status is inferred from a release number, strings, license dates, byte equality or native Debian package evidence. The application's missing `wasmUrl` and observed source-level load-failure path are not an explicit security admission policy.

Five official HTTPS text responses total 23,344 bytes; the largest is 6,475 bytes. Every retained response passes its recorded length and SHA-256 check. No binary was downloaded, no package changed and no service was started. The initial web connector open returned an internal error without source content; bounded direct HTTPS metadata retrieval supplied the five retained responses. `receipts.json` preserves exact URLs, statuses and hashes. There was no additional fetch of an unpinned external builder checkout.

| Retained response | Bytes | SHA-256 |
| --- | ---: | --- |
| [build-commit.json](https://api.github.com/repos/mozilla/pdf.js/commits/295fb3ec4) | 6475 | `b1a3879606df13ae9ae0965f143a57fb00648f020992fa446a541b8080c90944` |
| [openjpeg-directory.json](https://api.github.com/repos/mozilla/pdf.js/contents/external/openjpeg?ref=295fb3ec4fe04c6c60102442f904163dccc5a226) | 6289 | `e8bad1d40c2e1d67671998d1ce00a16567ed0d2dc0f1e79604fbb0c74a01c4d4` |
| [openjpeg-README.md](https://raw.githubusercontent.com/mozilla/pdf.js/295fb3ec4fe04c6c60102442f904163dccc5a226/external/openjpeg/README.md) | 767 | `bfa14fb932a9bb737b980a407148ac976d82f608f16641484286cc9041a10fa3` |
| [release-tag-commit.json](https://api.github.com/repos/mozilla/pdf.js/commits/v5.4.54) | 6475 | `b1a3879606df13ae9ae0965f143a57fb00648f020992fa446a541b8080c90944` |
| [wasm-last-change.json](https://api.github.com/repos/mozilla/pdf.js/commits?path=external/openjpeg/openjpeg.wasm&sha=295fb3ec4fe04c6c60102442f904163dccc5a226&per_page=1) | 3338 | `f333fe3bb766a1059dd1e44fa9f3559734d441703805b1e6f7a0b40da4a70d8c` |

Local verification also recomputed the Git blob identities from the installed bytes and checked all four against the official directory metadata. The original installed-package audit remains unchanged at `../2026-11-06-aa7-pdfjs-jpx-provenance.md`. No root source, image, environment, database or earlier receipt was modified.
