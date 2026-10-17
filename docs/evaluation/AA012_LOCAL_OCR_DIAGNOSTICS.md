# AA012 local OCR diagnostic report

Status: **PARTIAL — normal-font held-out transcription passes the scoped engineering screen; original block-font transcription fails; AA012/AA1 acceptance open.**
Evaluation: 2026-10-04, synthetic-only English / India-focused software-engineering content. Governing protocol: [ADR-0008](../decisions/0008-selective-ocr-evaluation.md), [ADR-0009](../decisions/0009-aa0-truth-contract-and-evaluation-design.md), scoped AI-label permission [ADR-0010](../decisions/0010-ai-assisted-synthetic-annotation.md). No production integration, real data, managed OCR, external fees or threshold changes.

## Reproduction and receipt

Use the reviewed local image built under ADR-0008. Neither checker builds/downloads an image, reads `.env` nor calls application services:

```sh
npm run test:ocr:pilot -- sha256:38e6a126b40ade4bfb6dd189b4bd69a037c672e6bdb25fefa63a698dc61756e0
npm run test:ocr:pilot -- sha256:38e6a126b40ade4bfb6dd189b4bd69a037c672e6bdb25fefa63a698dc61756e0 --require-quality
```

The default command completes diagnostics, not accuracy acceptance. `--require-quality` exits **1** for this corpus; observed live execution confirmed that nonzero result. A green diagnostic CI step cannot close AA012 or AA1. The authoritative extraction-v2 release benchmark remains unimplemented.

Image receipt: Tesseract `5.3.0-2`, English data SHA-256 `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`, Poppler `22.12.0-2+deb12u3`; image package-manifest receipt in ADR-0008/todo. Source/label manifest SHA-256 locked before recognition: `793787e16eb83eac77c8da0eb9b09fc1456c922edcc05284bbdab55cf0054b8a`. Every source PDF hash is separately pinned in `tests/unit/ocr/ocr-pilot.test.ts` and original smoke hashes are unchanged. This is a reproducibility receipt, not a held-out test lock.

The measured run completed at `2026-10-04T14:40:08.126Z`; its hypothetical raw expiry is `2026-11-03T14:40:08.126Z`. PDFs, OCR rasters and recovered text were not persisted. Only generators, source hashes, labels and aggregate non-PII evidence remain; container scratch was removed after each attempt.

## Results

CER uses Unicode code points, case-sensitive comparison, whitespace collapsed to one space. Missing/abstained pages contribute their entire reference length as deletions. OCR-only segment denominators exclude native text, so native preservation cannot dilute mixed OCR errors. Ordered-line agreement is exact-line longest-common-subsequence divided by authored line count. Page availability means nonblank recovered pages / nonblank authored pages; it is not full character coverage or factual correctness.

| Diagnostic segment      | Documents | OCR CER |       Unchanged maximum | Abstentions | Observed wall p50 / p95 |
| ----------------------- | --------: | ------: | ----------------------: | ----------: | ----------------------- |
| Clean block-glyph scans |         6 | 17.105% |                      1% |           0 | 591 / 683 ms            |
| Challenging variants    |         6 | 70.833% |                      3% |           2 | 575 / 628 ms            |
| Mixed, OCR pages only   |         6 |  8.333% | 1% clean-scan screening |           0 | 1,026 / 1,042 ms        |

All three screening gates fail. Latencies include native routing and cleanup, on an already-built local image; six correlated observations are not completion SLOs or cold-start measurements. CER on a deliberately simple block-font generator cannot be generalized to ordinary document fonts.

Six controls: native-only correctly avoids OCR; blank returns `insufficient`; corrupt input returns safe engine failure; an over-10-MiB source is refused before container creation; duplicate and missing provider-page outputs are rejected as `invalid_output`. The last two are contract injections, **not real engine failures**. Native text remains immutable; mixed OCR selects original pages 1 and 3 only. All returned OCR evidence is scoring-ineligible and raw confidence remains uncalibrated. Exact-owned containers are absent after every attempt; no unrelated containers are deleted. Runtime isolation/cancellation/deadline checks are separately provided by `test:ocr:local`.

Critical-value substring recovery is diagnostic only: clean scans recover 1/3 authored contact values; mixed documents recover 5/8 values. This is not structured-field precision/recall. The harness never invents field precision, memory peaks, CPU time, calibrated confidence or human agreement; those remain null/not measured. No automatic retries are implemented. External API fees are zero; local compute cost remains unknown under the owner-approved allocation.

## Protocol gaps and exit decision

The 24 diagnostics include six translations of clean and mixed fixtures, actual ±6.84° shears, 90°/180° raster rotations and 72/36-DPI downsampling. All remain one correlated original block-glyph **development** family. They do not satisfy independent development/calibration/locked family partitions, the specified 150-DPI/blur/compression mix, encrypted-input or oversized-raster execution, or the representative corpus. The over-10-MiB PDF control tests the byte boundary, not the image-pixel bound. Expected runtime-attempt counts are declared workload, not observed process/billing accounting. LCS ordering is a diagnostic, not the approved exact-position reading-order gate. Twenty-four unique byte hashes do not establish twenty-four independent samples.

The metric helper supports fixed-seed whole-family bootstrap (10,000 resamples, seed `20261004`), with deterministic regression tests. This dataset has only one family, so a meaningful family-level 95% interval is **null**, reason `fewer_than_two_independent_source_families`, rather than a fabricated narrow interval. Independent human validation and calibration remain not evaluated under ADR-0010.

Exit: **revise and review; no production enablement**. Retain these failing fixtures as regressions. Complete the original independent-family pilot and missing measurements/adverse classes before claiming adapter quality acceptance. AA013 requires immutable reconciliation, persisted review/no-score guards and visible uncertainty; AA014 requires owner-authorized, concurrent-safe audited corrections; AA015 requires its locked benchmark. Their gates remain open. Changing the accepted phase dependencies or redefining completion as engineering-only requires a named owner decision; general continuation is not such a waiver.

## Normal-font accuracy investigation (2026-10-04)

The failed bitmap corpus uses an original 5×7 block glyph alphabet, not a normal
resume font. That is a useful adverse regression, but not sufficient evidence for
ordinary printed scans. Its labels, bytes, failed measurements and unchanged
targets remain intact above. No recovered characters are replaced using truth
labels. [Tesseract's quality guidance](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html)
identifies unusual fonts, resolution and page segmentation as possible causes;
the comparisons below measure them rather than assuming a setting will help.

`ocr-print-pilot.ts` adds 18 fictional documents across six authored content/layout
families: clean 300-DPI scans, actual 150-DPI ±0.35° skew/0.3-pixel blur/JPEG-85
scans, and mixed documents with a native page between two scanned pages. Six
retained controls produce 24 total documents. Family variants stay together:
15 development / 3 calibration / 6 declared locked documents. They share one font
and renderer and remain AI-labelled synthetic engineering data, not independent
human validation or a representative population.

Source field and exact-position line/code-point labels precede rasterization and
recognition. Liberation Sans is unmodified, SIL OFL 1.1, SHA-256
`f8ace1f892b2bd9dc1792ba7f097fa7588f84fed48321480e04de5390828221f`;
Canvas is pinned to existing version `0.1.77` (MIT), now explicitly declared as a
development dependency. No font download, host-font substitution, new engine
dependency or real candidate data is used. Generated raster bytes are explicitly
platform-bound; authored hashes are pinned independently. Glyph and raster ink
bounds are checked to reject cropping/blank fixture defects.

Reviewed quality-comparison image:
`sha256:6fa3e4a4c000c5f70e3689bc51166eaa6fce9c81648da97f01653baafc397b2f`
(arm64, user `10001:10001`). The pinned base/package/language-data assertions are
unchanged. Runtime configuration is allowlisted to PSM 3/6 and maximum DPI
150/300, identified in metadata; no arbitrary engine flags are accepted.
Production settings are unchanged. Real isolation, cancellation, timeout and
cleanup smoke checks pass on this image; original block scan error remains 13/76.

The first development comparison (PSM 3 / maximum 300 DPI) fails screening:
clean CER 0.479846% with family-bootstrap 95% interval [0, 1.036269%]; mixed
OCR-only CER 0.481232% with interval [0, 1.038961%]. Both interval upper bounds
exceed the unchanged 1% target. Challenging CER is 0%, interval [0, 0]. Clean and
mixed exact-position line agreement is 94.6581%, below 98%; challenging is 100%.
Exact critical-value text recovery is 22/24 clean, 22/24 mixed and 24/24
challenging, **not structured-field precision/recall**.
Development manifest: `42455794d6e025af3e55ea0ad3c47e788a2f09e3976c48965f8cefe632540d6b`;
first comparison receipt: `d216e30105d10d5749ba4504cc4e6d1472564182e9ad7cfad4e1e9534ba9de9f`.

Exact-position agreement now penalizes missing, reversed and extra lines/pages;
the previous LCS metric remains separately labelled. `--require-quality` checks
CER interval upper bounds and the 98% single-column line floor, not full AA012
acceptance. No supported multi-column claim is made. `--manifest-only` freezes
sources/settings without Docker; locked recognition requires a matching
`--lock-receipt=<sha256>` binding sources, labels, image and configuration.
That receipt must be recorded before recognition, not manufactured after results.

Successful runs report measured child CPU and actual renderer/recognition starts.
RSS is the maximum **individual child**, not whole-container peak; failed-attempt
resources and whole-container peak remain unknown. The first development run
observed 13 renderer and 13 recognition starts (including blank), 8,388.593 ms
child CPU and 117,460,992 bytes maximum single-child RSS. Fees remain zero,
local compute price unknown. Neither raw assets nor recovered text are persisted.

### Development selection and pre-recognition lock

All four development settings used the same 15 sources and unchanged labels:

| PSM / maximum DPI | Clean CER | Challenging CER | Mixed OCR CER | Clean / mixed exact-position agreement | Decision                                |
| ----------------- | --------: | --------------: | ------------: | -------------------------------------: | --------------------------------------- |
| 3 / 300           | 0.479846% |              0% |     0.481232% |                               94.6581% | Fails                                   |
| 6 / 300           | 0.479846% |              0% |     0.481232% |                               94.6581% | Fails                                   |
| 3 / 150           |        0% |              0% |            0% |                                   100% | Selected for held-out engineering check |
| 6 / 150           |        0% |              0% |            0% |                                   100% | No measured text advantage over PSM 3   |

The two 150-DPI settings have CER bootstrap intervals [0, 0], full original-page
coverage and 24/24 critical source values recovered in each segment. This is an
observation on three authored development families, not a population guarantee.
PSM 3 is retained because changing to uniform-block segmentation adds no measured
benefit here and is not suitable as a blanket multi-column policy. Resolution
sensitivity is measured; a specific glyph-level causal mechanism is not proven.
The selected maximum-DPI cap is **test-only**, not a general recommendation to
downsample every resume. No labels, templates or quality floors changed after
development comparisons.

Selected development receipt:
`2edfa33d38e696478da89d62b7637a6688fdc79f50a3a1a4fc2af5dda4c123b1`.
Other comparison receipts: PSM 6 / 300
`312cf48977f7f380244f65934e147d84b000852a35d426ad631ab966d54178f0`;
PSM 6 / 150
`b6ed506fddf0cc9f2434cb15e09640aae63c4354d5de47f216fe8e761f354cbb`.

**Frozen before any held-out recognition:** PSM 3 / maximum DPI 150, reviewed
arm64 image above, `normal-font-pdf-v1`, held-out families `epsilon-quality` and
`zeta-data`. `--manifest-only` completed without Docker/recognition, binding six
held-out documents to source/label manifest
`a73a59315970aa80936ef37eaded868f267dca70cbcc08b1268d645d7c130c03`
and execution receipt
`d753f080ab6a23291bf00c6557c81e533b3a89f4da8cf20327a99f0cc1bc4a7a`.
Platform: darwin/arm64, zlib 1.2.12. These hashes cannot be reused for a different
platform/image/settings/source. A changed held-out configuration requires a new
development decision and new untouched sources; this receipt cannot authorize
tuning on these six outputs. Their authored family hashes were already pinned
before all OCR comparisons. Calibration-family recognition remains separate from
confidence calibration and representative validation.

### Frozen held-out results

At source revision `f78a53ebbeeb6a7e6cf3e33b485dd235cfd6bb87`, the pre-recorded
receipt was supplied unchanged. Actual locked recognition completed at
`2026-10-04T15:35:57.959Z`; `--require-quality` exited **0**. No output-directed
tuning or rerendering was performed on these held-out families.

| Held-out segment | Documents / authored families | OCR CER / 95% family-bootstrap interval | Exact-position lines / page coverage | Critical source values | Wall p50 / p95 |
| ---------------- | ----------------------------: | --------------------------------------- | ------------------------------------ | ---------------------: | -------------- |
| Clean            |                         2 / 2 | 0% / [0, 0]                             | 100% / 100%                          |                  16/16 | 551 / 598 ms   |
| Challenging      |                         2 / 2 | 0% / [0, 0]                             | 100% / 100%                          |                  16/16 | 515 / 517 ms   |
| Mixed OCR-only   |                         2 / 2 | 0% / [0, 0]                             | 100% / 100%                          |                  16/16 | 726 / 733 ms   |

Every held-out document returned `review_required`, scoring-ineligible evidence;
zero failures/abstentions. Original mixed pages 1/3 were recognized and native
page 2 remained immutable. Geometry/output contract and exact-owned cleanup pass.
Eight renderer and eight recognition starts were observed, child CPU 2,528.877 ms,
maximum individual-child RSS 57,147,392 bytes. All six successful observations
have resource receipts; whole-container peak is still unmeasured. The tiny
two-family zero-error interval is descriptive, not a population guarantee.

The three preassigned calibration-family documents were then executed with the
same settings, without fitting a confidence model. Each has zero character errors,
100% line/page agreement and all eight critical source values preserved. Its
per-segment intervals remain **null** and `screeningGate=not_passed` because there
is only one source family. This is recognition verification, not confidence
calibration or an accepted statistical gate. Receipt:
`5c68bcd1c62f63a3af4b1d9f482aa84127c07c456a5447d3c3b49a11ad01b098`;
manifest: `aba65fc337d25b6c1ec41e7379e9d336c4c9d219ae07f76c3b051cb5d666ed7a`;
completion: `2026-10-04T15:36:51.954Z`. Neither raw images nor recovered text were
persisted. Hypothetical raw expiry is 30 days after each recorded completion.

Reproduce the frozen held-out observation on the matching platform/image:

```sh
npm run test:ocr:pilot -- sha256:6fa3e4a4c000c5f70e3689bc51166eaa6fce9c81648da97f01653baafc397b2f --print-pilot --partition=locked --psm=3 --dpi=150 --lock-receipt=d753f080ab6a23291bf00c6557c81e533b3a89f4da8cf20327a99f0cc1bc4a7a --require-quality
```

**Retained failure:** original block-glyph diagnostics at the selected settings
still exit **1**: clean CER 19.2982%, challenging 70.1754% (two of six abstentions),
mixed OCR-only 8.3333%. Their one-family intervals remain null. Receipt:
`b689e946e627c1bf3e781d4c52742f91ae9425b12c0c301a4378f5763b5b523a`;
original manifest/labels are unchanged. No normal-font result relabels those
failures as successes or removes them from the diagnostic record.

**Completion boundary:** the normal-font, single-column local transcription
repair and its frozen held-out engineering check are verified. Full AA012 is not
accepted: structured-field precision/recall, all specified adverse classes
(including actual encrypted/oversized-raster inputs), whole-container peak/cold
start measurements and final protocol/acceptance review are still outstanding.
The calibration partition is too small for statistical acceptance. Independent
human/representative validation, calibrated confidence, AA013 reconciliation,
AA014 correction workflow and AA015 release evaluation remain separate open
requirements. Original block-font scans remain unsupported/review-required.
No production enablement or authoritative score is authorized by this report.

## Container memory measurement slice (2026-10-11)

Status: **IMPLEMENTED and locally VERIFIED for completed synthetic OCR attempts;
AA012 acceptance remains PARTIAL.** The runner now reads the kernel's
[`memory.peak` cgroup-v2 high-water counter](https://docs.kernel.org/admin-guide/cgroup-v2.html)
after recognition and scratch-file deletion, before result serialization. This
includes the container cgroup and its descendants through that snapshot. It is
separate from the largest individual-child RSS and excludes later serialization
or shutdown allocations, failed/cancelled attempts and Docker/host overhead.
There is no new memory acceptance threshold or compute-price estimate.

The reader accepts only namespace-root membership `0::/` with the approved
1,073,741,824-byte `memory.max`. Unsupported scope, unreadable counters or invalid
values return null with a reason; they never substitute current usage, child RSS,
host memory or zero. The optional additive receipt preserves compatibility with
older reviewed images. Contract validation rejects contradictory value/reason,
unsafe integers, misleading source/snapshot metadata and unknown fields. All OCR
evidence remains review-required or insufficient and scoring-ineligible.

The local arm64 image was built from the reviewed Dockerfile with unchanged
engine, renderer, language-data and isolation settings:

- Image: `sha256:2038f4a280f279e155b05861395dda0d7739c5f7f4f4904d1d2092ab72a30727`.
- Installed-package manifest SHA-256: `1760e33fe98735108c9d5a8fd24e3e232ce5771b59ff84cbcba33009e1fa5673`.
- Development receipt: `e006f9ab4828ca618ce71d20b049261643dc7177d278ab99d4345d1f4bdff3da`.
- Source/label manifest: `42455794d6e025af3e55ea0ad3c47e788a2f09e3976c48965f8cefe632540d6b`.
- Completed: `2026-10-11T05:36:08.439Z`.

`test:ocr:pilot -- <image-id> --print-pilot --partition=development --psm=3
--dpi=150 --require-quality` exits 0. Nine authored documents across clean,
challenging and mixed segments retain 0% CER and 100% exact-position line/page
agreement. Ten completed OCR attempts, including the blank control, return
container peak receipts; their maximum is **51,126,272 bytes**. Five other
controls have no peak observation (native-only, corrupt/oversized source and two
contract injections), and are counted as unmeasured rather than zero. Original
native pages and exact-owned cleanup pass. No calibration or locked partition
was recognized; the earlier held-out receipt/results remain unchanged. No raw
PDF, raster or recovered text is persisted.

`test:ocr:local` separately passes real isolation, scanned/mixed/native routing,
observed renderer/OCR cancellation and timeout, malformed input and exact-owned
cleanup. Reader/contract regressions cover supported, unverified, unreadable and
invalid-counter paths. Full verification evidence is recorded with the AA012
slice in [the todo](../../tasks/todo.md).

Remaining acceptance work includes structured-field precision/recall, encrypted
and oversized-raster controls, failed-attempt and final-lifetime memory/cold-start
measurements and final protocol review. Representative validity, calibrated
confidence, AA013–AA015, AA1 and production approval remain open. This measurement
slice does not accept an OCR provider or enable production OCR.
