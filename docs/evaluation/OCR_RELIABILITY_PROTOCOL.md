# OCR reliability development protocol

Status as of 2026-11-22. The workplace-header candidate recovered all 48 fields in six new development PDFs. The earlier development and calibration results are recorded below. CR-A05 remains open, and the locked partition is still unused.

Two original content/layout families each produce the existing clean, challenging and mixed segments. All six are DEVELOPMENT. No calibration or locked family, label, failed receipt, threshold, font, dependency, profile or runtime runner changed. Native PDF text extraction and fixture generation are not OCR recognition. This batch ran zero OCR calls, Docker commands, providers or database operations. Root's earlier daemon inspection failed; this preparation did not retry it, start Docker or rebuild an image.

## Source envelope and lineage

The unchanged pinned normal-font generator renders 12-point Liberation Sans on Letter pages. Clean and mixed scanned pages use 300-DPI source images; challenging uses its existing 150-DPI, ±0.35-degree skew, 0.3-pixel blur and JPEG quality 85. Mixed documents have two image-only pages around the generator's native middle page. These fixtures do not select or alter a runtime profile. The existing fast adapter defaults to a maximum 300 DPI and allows 150/300; only the fusion profile fixes 150 DPI. Any later comparison must record its actual admitted image/profile/render settings.

Every document has eight authored critical-field references and raw code-point spans, exact expected page text and line order. The tests check those spans against raw expected text, hidden scanned text absence, preserved native text, ink/crop bounds and repeat generation. They do not infer OCR predictions from labels or score expected text as recognition output. Maximum source PDF is 10 MiB, pages 3 and raster pixels per scanned page 10,000,000, retaining existing limits.

Family IDs and full-text differences establish only distinct identifiers and nonidentical authored content. They do **not** prove template or near-duplicate independence. These families share the same pinned font/generator and boilerplate with each other and historical sources. The `nearDuplicateGroup` records the authored family; future frozen evaluation must review shared template/generator/content lineage across groups, not rely on different IDs. Historical declared family modules, including held-out/locked families, are inspected only for ID and full-text identity screening. No historical PDF is generated or recognized, no historical quality evaluation is run, and historical labels do not populate the new families. This screening supplies neither a fresh unconsumed held-out set nor an independent-template quality claim.

The registration binds source bytes, the authored family, raw labels, expected text, line order and generator versions. Byte hashes below are specific to the recorded platform/runtime. Other platforms require their own pre-recognition byte receipt; matching content hashes do not permit substituting different PDF bytes into a frozen evaluation. Source permission is original synthetic authorship with the unchanged licensed font. Labels are AI-authored engineering truth, without independent-human agreement or representative validity.

```json
{
  "schemaVersion": "ocr-development-registration/1.0.0",
  "collectionVersion": "ocr-reliability-development/1.0.0",
  "partition": "development",
  "recognitionExecuted": false,
  "qualityStatus": "not_evaluated",
  "generator": {
    "path": "tests/fixtures/ocr-print-pilot.ts",
    "sourceSha256": "b9081984b4865676ca25fe5301cc00e96c57d747075192453b24f8605559ab74",
    "version": "normal-font-pdf-v1",
    "fontSha256": "f8ace1f892b2bd9dc1792ba7f097fa7588f84fed48321480e04de5390828221f",
    "fontLicense": "SIL-OFL-1.1",
    "canvasVersion": "0.1.77",
    "nodeVersion": "22.23.4",
    "rasterPlatform": "darwin/arm64",
    "zlibVersion": "1.3.1-e00f703",
    "byteHashPortability": "platform_bound_runtime_lock_required"
  },
  "families": [
    {
      "id": "reliability-dev-saffron-data-20261110",
      "partition": "development",
      "familyDefinitionSha256": "c49f1e966c910e386b2eddadadbebbbd305bfe6d31bb96a4058955306dd1fbf3"
    },
    {
      "id": "reliability-dev-mistral-security-20261110",
      "partition": "development",
      "familyDefinitionSha256": "dfc87e74018a2d15aa389b0e8278aec9b2001c67e7d16c0530f90e992321c48d"
    }
  ],
  "documents": [
    {
      "id": "print-reliability-dev-saffron-data-20261110-clean-v1",
      "sourceFamily": "reliability-dev-saffron-data-20261110",
      "nearDuplicateGroup": "reliability-dev-saffron-data-20261110",
      "partition": "development",
      "sourceSha256": "0833ae1bcdef1d739864a197218bb562a55b38bcda72ec65c87b237b087d5b0a",
      "authoredSourceSha256": "26b1f4de10d104ca98160ef8d423d302361d2dfcdcc87b14367069349e7184ed",
      "labelsSha256": "53411851a6e49e2b14839ab8e95c0ae1b7daeb493c86d6df2c7afcfbba0cb457",
      "expectedTextSha256": "16e317cf364c75aa9695bb97361188916f6fab68c7024adf7040855fefc0fede",
      "lineOrderSha256": "1f37edd66f29c542b08b7df98464a2fa9db16d96145e3ce0a51d2f5e6f9ca471"
    },
    {
      "id": "print-reliability-dev-saffron-data-20261110-challenging-v1",
      "sourceFamily": "reliability-dev-saffron-data-20261110",
      "nearDuplicateGroup": "reliability-dev-saffron-data-20261110",
      "partition": "development",
      "sourceSha256": "6ae3fd7b9c5e174e9f3853e8c2fa2284f9555646ec7d99f4611bc7e92d5b1e85",
      "authoredSourceSha256": "26b1f4de10d104ca98160ef8d423d302361d2dfcdcc87b14367069349e7184ed",
      "labelsSha256": "53411851a6e49e2b14839ab8e95c0ae1b7daeb493c86d6df2c7afcfbba0cb457",
      "expectedTextSha256": "16e317cf364c75aa9695bb97361188916f6fab68c7024adf7040855fefc0fede",
      "lineOrderSha256": "1f37edd66f29c542b08b7df98464a2fa9db16d96145e3ce0a51d2f5e6f9ca471"
    },
    {
      "id": "print-reliability-dev-saffron-data-20261110-mixed-v1",
      "sourceFamily": "reliability-dev-saffron-data-20261110",
      "nearDuplicateGroup": "reliability-dev-saffron-data-20261110",
      "partition": "development",
      "sourceSha256": "6d967a2ea6d1990d95fa16fa5eeff11feb58485187b876c24b37c04069d07d22",
      "authoredSourceSha256": "0dee03b83ab99e04c6f3d588e6aea3fbabbec79be5f81f5523c574f009a0f64b",
      "labelsSha256": "c7279a4e2093407ab265236ad5b7d97744abc75e50794c747ba004e6a25a5163",
      "expectedTextSha256": "72ea1847bb171d9f520e941cb53448ed1e6dd405eaa52edd97cd8c1590f6c9a4",
      "lineOrderSha256": "f9122c23850a15915f6282fd4563b59613b4ecd427811069f20c78c6ebc8ce8b"
    },
    {
      "id": "print-reliability-dev-mistral-security-20261110-clean-v1",
      "sourceFamily": "reliability-dev-mistral-security-20261110",
      "nearDuplicateGroup": "reliability-dev-mistral-security-20261110",
      "partition": "development",
      "sourceSha256": "1074aef3bcae7d2b229cc191d59858cd58d15dffd20beb2a85473baa7ece6ca9",
      "authoredSourceSha256": "e28bb9700a5555414aed7e414781afa862df24168e7baf72a984715829666e77",
      "labelsSha256": "2a6852816738712cb7306a63f0ebf749bebe1c56db0f6bd34ef4579ed02838d3",
      "expectedTextSha256": "3a30b762707518c89df381c61b7f06fe7e817bf6d83f9bb8a5104e3407f02e8e",
      "lineOrderSha256": "70a498242ebc94433d76d9350d90782e8f183efc0867812b09a54e7517193a18"
    },
    {
      "id": "print-reliability-dev-mistral-security-20261110-challenging-v1",
      "sourceFamily": "reliability-dev-mistral-security-20261110",
      "nearDuplicateGroup": "reliability-dev-mistral-security-20261110",
      "partition": "development",
      "sourceSha256": "5f1318594036b2fb7a3c327aac1465eb03afb9ae8c4a43c7cfb10e6d739e4f66",
      "authoredSourceSha256": "e28bb9700a5555414aed7e414781afa862df24168e7baf72a984715829666e77",
      "labelsSha256": "2a6852816738712cb7306a63f0ebf749bebe1c56db0f6bd34ef4579ed02838d3",
      "expectedTextSha256": "3a30b762707518c89df381c61b7f06fe7e817bf6d83f9bb8a5104e3407f02e8e",
      "lineOrderSha256": "70a498242ebc94433d76d9350d90782e8f183efc0867812b09a54e7517193a18"
    },
    {
      "id": "print-reliability-dev-mistral-security-20261110-mixed-v1",
      "sourceFamily": "reliability-dev-mistral-security-20261110",
      "nearDuplicateGroup": "reliability-dev-mistral-security-20261110",
      "partition": "development",
      "sourceSha256": "f4aba8e5dc66f3688ab14744f5a2f809da8045a551c1f50c62539bbf20897ee8",
      "authoredSourceSha256": "14f7bb443e41f92042e28d0b5f024ea9732528268163275b631e53259ebea8ab",
      "labelsSha256": "79c295774e1380ca1d31117b5f8aa02a02673a6dd1f525510dd17e15448362f0",
      "expectedTextSha256": "a5e05050645092a5c0773819c4f7eddcc94b04efe4c110a79aff830052b1e7c1",
      "lineOrderSha256": "35c403f32e4c0697186ef5b9d3616e6e28ecb74f1aa63b1a29acc50d1f07afb6"
    }
  ]
}
```

## Existing evidence and unchanged gates

[The consumer validation](CONSUMER_VALIDATION_20261109.md#actual-ocr-execution-and-limits) retains normal-font development results of 72 known fields over nine documents/three families, and the original authored 5×7 block-glyph scanned failures: legacy 13/76 errors (17.105% CER), fusion 14/76 (18.421%). Those failures are not a verdict that every normal-font scan fails; the limited field sample is not whole-document or general resume accuracy. [Prior OCR repair evidence](OCR_CI_REPAIR_20261017.md) also retains its challenging exact-line lower-bound failure despite other field/CER/coverage passes. None is overwritten or relabelled by this registration.

The existing [constraints](../../CONSTRAINTS.md#3-proposed-accuracy-v2-release-gates), source-family confidence-interval gates and frozen checker assertions remain unchanged:

| Measure                                        | Existing floor retained                                 |
| ---------------------------------------------- | ------------------------------------------------------- |
| Clean scan CER                                 | At most 1%                                              |
| Declared challenging scan CER                  | At most 3%                                              |
| Critical-field precision / recall              | At least 98% / 97%                                      |
| Native character accuracy / page text coverage | At least 99.5%                                          |
| Ordered-line agreement                         | At least 98% single-column / 95% supported multi-column |

Document and family clustering, interval bounds, exact citations, abstention and all other current segment gates still apply. Uncalibrated, unsafe, unsupported or insufficient evidence remains ineligible for scoring. Representative resumes and multi-column, damaged, low-contrast, rotated, multilingual and block-glyph coverage still require separate evidence.

## Development comparison on 2026-11-22

The runner matched all six preregistered records before recognition. The PSM 3 comparison used the existing pinned Linux ARM64 worker image and ran serially on Node.js 22.23.4. Both settings recorded zero character errors, 100% exact-position line agreement and full page coverage in each segment. Both recognized eight scanned pages, preserved the two native middle pages and cleared their owned containers. All six outputs per run required review, with scoring denied. The 150 DPI run used 3.36 seconds of observed child CPU time and had a 49.3 MiB observed container peak. The 300 DPI run used 6.97 seconds and reached 167.4 MiB. These are observations from one run per setting on this host.

The separate 150 DPI structured-field check received the same registered sources. It returned exact values and grounded citations for 47 of 48 expected fields, with zero extra or ungrounded predictions. The clean and challenging segments each recovered 16 of 16 fields. The mixed segment recovered 15 of 16, yielding 100% precision and 93.75% recall against the 97% recall floor. The omitted employer text was present on the first scanned page. Its role and dates continued on page three, across a native skills page. The parser did not propose the employer from the available layout evidence. Overall recall of 97.92% masks that segment failure.

Keep 150 DPI as the development comparison setting. A repair must cite the original employer span and avoid proposing an employer from unrelated headings or joining separate entries across the native page. The held-out registration and development repair are recorded below. Source hashes, settings and per-document counts for the baseline are in the [verification receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-a05-development-verification.json).

Reproduce the development checks with a reviewed immutable local image ID in `$ocr_image_id`.

```sh
npm run test:ocr:pilot -- "$ocr_image_id" --reliability-development --psm=3 --dpi=300 --manifest-only
npm run test:ocr:pilot -- "$ocr_image_id" --reliability-development --psm=3 --dpi=300 --require-quality
npm run test:ocr:pilot -- "$ocr_image_id" --reliability-development --psm=3 --dpi=150 --manifest-only
npm run test:ocr:pilot -- "$ocr_image_id" --reliability-development --psm=3 --dpi=150 --require-quality
npm run test:ocr:fields -- "$ocr_image_id" --reliability-development
```

## Next bounded steps

1. Keep the preregistered development, calibration and locked family groups, labels, manifests and renderer lineage under the governing AA003/A5 protocol. Previously consumed locked sets remain consumed regardless of their historical names. Keep known failures and regression receipts visible.
2. Use only registered development outcomes for repair choices. Bind the exact image, profile, model and source candidate before each allocated comparison. Freeze the repaired candidate after development and before locked execution. A diagnostic green exit does not pass quality gates.
3. Run only a reviewed bounded local worker allocation against an admitted immutable image with network/host-mount denial, resource/deadline limits and exact owned cleanup. Verify native controls, scanned/mixed selective OCR, exact preserved native pages, CER, critical fields/source citations, coverage and reading order per segment. The real upload/leased-worker path is a separate CR-A06/R15/R10 acceptance requirement.
4. Once a held-out set is consumed, preserve every result. A failure requires a development repair and a new untouched evaluation, not label edits, threshold changes, easier replacements, repeated selection against the same lock or a proprietary-ATS/hiring claim.

The default OCR test corpora and authorization requirements still apply. The six-document development corpus requires the explicit `--reliability-development` option. Provider or hosted OCR adoption, numerical calibration, representative validity and release approval remain open.

## Held-out registration and mixed field candidate

Independent agents authored three calibration families and three locked families before the parser change. Each family has clean, challenging, and mixed PDF variants. The registration binds 18 PDFs to source, label, page order, platform, image and profile hashes. Source-family IDs, declared near-duplicate groups, PDF bytes and reference text hashes do not overlap across the three partitions. All partitions share the normal-font renderer and font. Distinct authored content and layouts establish synthetic coverage. Broader template independence and representative validity remain open. [Registration](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-a05-holdout-registration.json)

`mixed-ocr-review/1.0.0` can propose the exact source span of a laboratory employer immediately under a same-page employment heading at the end of an OCR page. The proposal requires review and carries uncalibrated confidence. Later pages contribute no facts, citations, or employment relationship to that proposal. Review found that an inherited fallback could borrow labelled roles and dates from a later page. The candidate now requires those labels on the employer page. The application still projects saved evidence through its existing parser version.

The candidate recovered 16 of 16 fields in each development segment, with zero extra or ungrounded predictions, using the same image, 150 DPI setting and six source PDFs as the baseline. The citation and withholding tests cover unrelated headings, a heading from another page and native text. Existing parser-version and SQL contract tests passed. Keep the miss in the baseline receipt. [Candidate verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-a05-mixed-field-candidate.json)

## First calibration result

The field checker bound the registered PDF and label hashes, the 150 DPI image and the tested parser before recognizing nine PDFs across three synthetic source families. The extraction benchmark applied its existing family-bootstrap thresholds per segment. The checker returned exit 1 for field recall in all three segments. Each segment recovered 22 of 24 fields with 100% precision and 91.67% recall. The lower confidence bound was 75%, against a 97% minimum. The same family was missing one employer and one date range in each scan variant. No field citation was ungrounded.

Character error rate was zero in every segment. Page coverage, exact line order and mixed-document native accuracy were all 100%. Every document stayed in review, scoring was withheld, and all owned containers were removed. The missed fields require a parser repair. Another transcription run with this candidate would leave the recall gap in place.

Keep the calibration result as a consumed failure. Use new development examples to isolate and repair the two field cases without reading the locked documents or changing labels or thresholds. Freeze any revised candidate and register fresh calibration evidence before considering locked execution. [Calibration receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-a05-calibration-first.json)

## Expanded development and second calibration

The six new development PDFs reproduced missing employer and date proposals after an employment heading the parser did not recognise. A separate header exposed a second issue. The parser retained the employer as part of the job title. OCR transcribed the six development PDFs exactly. The original profile recovered 36 of 48 fields and emitted three extra role values. [Development receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-a05-employment-field-candidate.json)

The revised profile recognises the employment headings and the role, employer and date separators verified by these fixtures. New headings apply only on their original OCR page. Tests exclude project sections, email addresses and native text from the new rules, and require every proposal to cite its exact span. The revised profile recovered all 96 fields across both development sets, with zero extra or ungrounded proposals. It remains available through the field checker. The application still uses its existing evidence parser. [Development receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-a05-employment-field-candidate.json)

Three fresh synthetic families were authored independently and registered before the parser change. The second calibration ran their nine PDFs on the frozen candidate and returned exit 1. Each segment recovered 23 of 24 fields at 100% precision. One employer was missing from all three variants of one family. Recall was 95.83%, and its lower confidence bound was 87.5%, below 97%. The lower bound for exact line agreement ranged from 94.44% to 95.24%, below 98%. Character error rate, page coverage and native accuracy passed their floors. Scoring stayed withheld for every document, and owned containers were removed. [Registration](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-a05-calibration-round2-registration.json) · [Calibration receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-a05-calibration-round2.json)

Both calibration failures remain part of the record. The locked set has never been recognised. Treat the new evidence as two open issues, an employer proposal gap and OCR line accuracy. A parser change alone cannot satisfy both measures.

## Workplace headers and OCR line comparison

Two new synthetic development families isolate a missing employer in pipe-delimited work headers that contain an explicit workplace mode. With the same recognised spans, the previous parser recovered 42 of 48 fields and omitted the employer in all six PDFs. The review-only `mixed-ocr-review/1.0.2` profile recovered 48 of 48, with zero extra or ungrounded proposals.

The rule requires an OCR employment heading on the same page, a role and recognisable organization, a workplace mode, and a recognised date expression in the same line. Tests cover employer-first and role-first headers and reject the new proposal for native text, an earlier-page heading, a project section, arbitrary text in the workplace cell, a second organization or a missing date. Every proposal cites the exact source text and remains uncalibrated. The application continues to use its existing parser.

The pinned local worker processed the same six clean, challenging and mixed PDFs at 150 DPI, at 300 DPI, and with the existing 150 DPI text-fusion profile. All three runs recovered the same 48 fields and matched 75 of 78 line positions exactly. One line in each Copper variant differed by one character. No rendering or recognition setting in this comparison improved the line result. Mixed PDFs kept their native page, all results required review, scores stayed withheld, and all owned containers were removed.

This comparison identifies a repeatable development case for the line-quality investigation. The cause of the second calibration's employer omission remains unverified. Preserve its failed receipt and the untouched locked set. [Paired development results](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-a05-workplace-development.json)

## Locate the clean-fixture line mismatch

On the exact Copper clean development PDF, both the fast and best Tesseract models at 150 DPI returned a hyphen (U+002D) where the source contains an en dash (U+2013). Each model recovered all eight fields and preserved all 12 line positions, with one character substitution on line six. The mismatch is in recognition and still counts against exact line agreement. Both owned runs cleaned up, and the only recorded content difference was the pair of punctuation code points. [Development probe](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-a05-synthetic-dash-probe.json)

Keep the exact-line floor and both glyphs distinct. A future recognition change needs separate hyphen and dash controls on new development inputs. Calibration results and the locked set remain as recorded.

## Compare hyphen and en dash controls

Four development PDFs paired the original Copper failure with new Cedar clean, challenging and mixed controls. Each of the three 150 DPI settings preserved all 19 hyphens. None recovered an exact en dash among the ten references. Seven en dashes became hyphens, and the other three lines could not be aligned for an exact punctuation comparison. Each setting matched 41 of 51 line positions with ten character errors in 1,957 reference characters. Keep the existing worker settings. [Pre-execution registration](OCR_DASH_DEVELOPMENT_REGISTRATION.json) · [Verification receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-a05-dash-controls.json)

The comparison also identified a missed employer. The previous parser recovered 29 of 32 fields. The review-only profile `mixed-ocr-review/1.0.3` recovered 32 of 32 from the same recognized text, with zero extra or ungrounded proposals. It cites the employer text when a proper name ending in `Lab` appears beside a role, workplace mode and date range under an employment heading on the same OCR page. Native, cross-page, project, incomplete and unnamed cases retain the previous handling.

All 12 candidate runs cleaned up their owned workers, preserved the mixed native page and withheld scores. Existing application profile selection stays in effect. A new recognition approach must pass both punctuation controls before fresh calibration. The two previously consumed calibrations and the untouched locked set remain as recorded.

Repeat the comparison on the registered platform with the reviewed local worker image.

```sh
node node_modules/vite-node/vite-node.mjs --config vitest.config.ts \
  scripts/verify-ocr-dash-development.ts "$ocr_image_id" \
  --run-registered docs/evaluation/OCR_DASH_DEVELOPMENT_REGISTRATION.json
```

## Compare character geometry on synthetic punctuation

An experimental worker compared the width and height of a recognized mark with nearby characters on the same line. It accepted character boxes only when the hOCR symbols matched the primary TSV words in order. The first version changed an already misread unary minus from an em dash to an en dash. The revised version kept the primary symbol before a number unless both adjacent characters were digits in the same word. [Tesseract character-box support](https://tesseract-ocr.github.io/tessdoc/ReleaseNotes.html)

On seven development PDFs, the revised experiment recovered 16 of 19 en dashes. The primary OCR recovered zero. Both outputs preserved 34 hyphens and three em dashes. Exact line matches rose from 68 to 84 of 90. Every document retained all eight source-backed fields, and both mixed controls preserved the native page. [Registration](OCR_DASH_GEOMETRY_REGISTRATION.json) · [Verification and retained failures](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-a05-dash-geometry.json)

Three Cedar en dashes still read as hyphens. Three Slate unary minus signs still read as em dashes, matching the primary OCR. Keep this candidate in development. Evaluate a different method for the six remaining line errors before fresh calibration. All results require review and withhold scores. Production profile selection and the two previous calibration results remain in effect.

Reproduce the Copper and Slate comparison with the registered local worker image.

```sh
node node_modules/vite-node/vite-node.mjs --config vitest.config.ts \
  scripts/verify-ocr-dash-geometry.ts \
  --run-registered docs/evaluation/OCR_DASH_GEOMETRY_REGISTRATION.json
```

## Recover marks next to digits

The Cedar range marks had two usable digit references. The earlier rule required three nearby characters, and two variants also had partially overlapping OCR boxes. The new candidate uses the digits on each side of an uninterrupted range. It tolerates an overlap only when most of the mark is outside the neighboring box. For a mark attached to the front of a digit, separate height and width bands distinguish a minus sign from an en dash. Measurements outside those bands keep the primary symbol.

Across ten development PDFs, exact lines improved from 117 of 129 to 129 of 129. The candidate recovered all nine minus signs and all 28 en dashes. It preserved all 46 hyphens and nine em dashes, including marks attached to digits in the three new Granite controls. It recovered all 80 source-backed fields without extra or ungrounded proposals, kept all three native middle pages, and removed every worker it started. [Registration](OCR_NUMERIC_PUNCTUATION_REGISTRATION.json) · [Verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-a05-numeric-punctuation.json)

The sources use original synthetic text and the same pinned font generator. A fresh calibration must test the frozen candidate on separate source families. The two previous calibration results and the locked set remain in force. The experiment runs only in the development worker, with scoring withheld.

```sh
node node_modules/vite-node/vite-node.mjs --config vitest.config.ts \
  scripts/verify-ocr-numeric-punctuation.ts \
  --run-registered docs/evaluation/OCR_NUMERIC_PUNCTUATION_REGISTRATION.json
```

## Third calibration result

Five new synthetic families supplied 15 PDFs. The pre-execution registration bound the frozen numeric punctuation worker, field profile, source bytes, labels and page order. Source IDs, family IDs, byte hashes and reference text hashes were checked against the numeric punctuation development manifest and the prior calibration and locked manifests. The batch shares the existing font and generator. It measures synthetic performance. [Registration](OCR_CALIBRATION_ROUND3_REGISTRATION.json)

The unmodified engineering benchmark returned exit 1. Character error, text coverage and native text met their applicable floors. The exact line agreement lower bounds were 90.57% for clean, 87.04% for challenging and 94.12% for mixed against the 98% floor. Clean and mixed each recovered all 40 critical fields. One incorrect proposal in a challenging scan left 39 of 40 correct. Precision and recall each had a 92.5% lower bound, below their 98% and 97% floors. [Consumed calibration receipt](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-a05-calibration-round3.json)

All 15 documents stayed in review and withheld scores. The five mixed documents preserved their native page and every owned worker was removed. The runner refused both a drifted registration and an attempt to consume the same exact calibration again. Keep the failed result and the untouched locked set. Any revised candidate needs a fresh calibration after repair in development.
