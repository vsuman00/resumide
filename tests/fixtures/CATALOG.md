# Test Fixture Catalog

Only synthetic or irreversibly anonymized documents may be committed. Fixtures
must not contain real candidate PII, credentials, or confidential job data.

| Fixture                      | Provenance                                                                                                                               | Expected use                                                                                                                                         | PII classification |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `scripts/dummy.pdf`          | Synthetic minimal PDF created for this repository                                                                                        | Browser upload and safe API error paths                                                                                                              | None               |
| `parsing/t051-labeled.json`  | Fully synthetic text labels                                                                                                              | Parser precision/recall benchmark                                                                                                                    | None               |
| `matching/t052-labeled.json` | Fully synthetic skill/JD labels                                                                                                          | Matching-quality and deterministic-scoring benchmark                                                                                                 | None               |
| `phase5-manifest.json`       | Repository-authored manifest                                                                                                             | Provenance and permitted-use record                                                                                                                  | None               |
| `ocr-synthetic.ts`           | Original source-authored bitmap glyphs and fictional English/India software-engineering labels; byte-hash-pinned development controls    | Scanned/mixed/native adapter smoke tests and bounded cancellation workload; AI-only annotation, not representative accuracy                          | None               |
| `ocr-pilot.ts`               | Twenty-four source-hash-pinned variants of the original block-glyph family; labels fixed before extraction, disclosed AI-only provenance | Development diagnostics: six clean, six adverse scan transforms, six mixed, six controls; one correlated family, no held-out or representative claim | None               |

Add each new fixture here with its origin, expected parser/scoring outcome, and
PII classification before using it in automated tests.

`ocr-print-pilot.ts`: 18 original fictional English/India software-engineering
documents from six authored content/layout families, plus six retained diagnostic
controls. Existing unmodified Liberation Sans (SIL OFL 1.1, pinned SHA-256) is
rasterized by pinned Canvas 0.1.77; no downloaded font or host-font selection.
Clean 300-DPI, actual 150-DPI skew/blur/JPEG and native-middle mixed variants share
their family partition: 15 development / 3 calibration / 6 locked documents.
Labels and ordered line/code-point truth precede rasterization and recognition;
byte hashes are locked before each run and are explicitly platform-bound.
AI-only engineering annotation; human/representative validation not evaluated.
PII: none. Same font/renderer across families remains a generalization limitation.

`ocr-adverse.ts`: repository-authored authenticated encrypted PDF and 16MP blank
embedded raster for bounded safe-failure/downsampling controls. Synthetic, no PII.
`ocr-field-evaluation.ts`: fixed original print-family critical-field labels used
only for disclosed synthetic development diagnostics; never passed to the parser.
`extraction-benchmark-engineering.ts` builds three native PDFs and nine existing
development print fixtures; frozen hashes and AI annotation disclosure precede
recognition. No representative, independent-human or held-out acceptance claim.
