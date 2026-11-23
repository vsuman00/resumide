# A11 proposal preflight tests

Implemented and frozen: `tests/unit/authoring-proposals.test.ts`, SHA `451f46426c436306c4ea86937afa844b3c92f7d93c228debe10b4a40a5bcfdf8`. This allocation changed only that test and this handoff. Production implementation belongs to the backend allocation.

The three original cases and all seven original assertion token sequences are preserved. Their local setup now uses the actual shared builder/strict-reader fixture, real legacy requirement parser and score builder. The previous date-arithmetic fixture left the contribution unplaced; the new setup preserves its real imported placement. No positive diagnostic or complete source fact was fabricated. The output-limit test additionally proves that its transport was called.

Before the product change, the focused run produced three genuine failures and one passing legacy-dispatch control on source `9d4cff397cd5e79a5415a78abb449df14b7a3ac2c016dbfb29f7e3009b78ac9a`: an actual revised confirmed document with stale legacy diagnostics, actual typed diagnostics, and an ambiguous contribution reached dispatch/review. The positive control also proves that the diagnostic fingerprint differs from the raw source hash.

After Root synchronized source `a700d744584f1a127ae671cc95de06dc2023f487843e4569e1f0ba6da1dd7a05`, the finite 21-case file passed once. Controls cover binding/policy mismatches, malformed diagnostics, missing/unconfirmed/non-contribution/unplaced/ambiguous/section-only targets, disabled and absent transports before parsing, unsupported locale, valid legacy dispatch, provider failure, timeout and output limits. Scoped types passed with 3 roots, 51 source files and zero diagnostics; lint and formatting passed. Root owns combined integration checks.

Private packet: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a11-preflight-tests-ayct1qwl`. It retains baseline and RED code snapshots, raw receipts/logs, preservation proof and final pins in `final-packet.json`.

This verifies argument preflight with synthetic builders and injected fake transport. It does not establish live provider behavior, native ownership proof, useful generated content or complete A11 factual/relationship support. Typed proposals remain paused; existing post-output validation and numeric withholding are not waived.
