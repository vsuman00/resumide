# CR-A01-S02 shared page-text review

2026-11-13, Asia/Kolkata. **SOURCE IMPLEMENTED; 60 SYNTHETIC CASES VERIFIED; ROOT INTEGRATION PENDING.** Root allocated four files under [the shared-core allocation](a01-s02-shared-core-allocation.json), SHA256 `8ab60ecc0a7e67b2083d2a60c6aad81a1b48fdec13ec570238bdf2e86e4458fd`. Base HEAD supplied by Root remains `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, with preserved dirty prerequisites. Root owns Git/context evidence, contracts, integration and the combined gate.

## Contract and implementation

The [legacy display extension](a01-s02-legacy-projection-contract.json), SHA256 `c6cf8f4716b7eb94b501d325d8bc7c1f2d8b93ca58795aaaebebb5becec52b17`, extends the original derived native review contract. It preserves the versioned legacy producer and stored results while supplying one shared content scanner for the separately allocated frontend display.

New `app/lib/page-text-diagnostics.ts` exports `inspectPageText(pages: unknown, expectedPageCount: unknown): PageTextReview` and `PAGE_TEXT_AVAILABILITY_UNITS = 8`. The module has no imports. Both result variants carry `page-text-observations/1.0.0` and `reliability: unassessed`. Available output contains only page ordinals, counts, availability, generic reason codes and matching page ordinals. It emits no raw text, source IDs or hashes.

Guards require a dense array with its own indexed slots, one to twenty sequential page objects, string text and matching expected count. Aggregate raw UTF16 units include two separator units per page boundary and may not exceed 500,000. Validation precedes content scans. Missing data, invalid metadata and unsupported bounds return explicit unavailable results without truncation or fabricated page boundaries. Unrelated metadata is ignored. The shared scanner owns Unicode checks, exact eligible duplicate grouping and the eight-unit availability rule.

`deriveNativePageDiagnostics` delegates to the scanner, translates generic reason codes and maps duplicate ordinals to original native IDs. Its API, model version, field order, reason order and valid-source behavior are preserved. The existing PDF availability constant references the shared constant. Other profile/routing code is unchanged. The native wrapper still requires previously validated immutable native evidence.

## Verification and preservation

Receipts and snapshots are in `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a01-shared-b174zs99`.

- `green.json`: one affected Node22.23.4 command, `node_modules/vitest/vitest.mjs run tests/unit/native-page-diagnostics.test.ts --no-cache`, passes **60/60**. The original 28 native controls remain unchanged; 32 new cases cover unknown inputs, missing/sparse/inherited slots, count and ordinal mismatches, duplicate metadata, raw aggregate limits, maximum bounds, exact grouping, metadata-only output and native adapter parity. `assertion-preservation.json` verifies the original test source is identical apart from the new import and appended describe block.
- `types.json`: project-options no-emit checking passes with five roots, 25 transitive project source files and zero diagnostics. `lint.json` and `format.json` pass for the three owned source/test files.
- Every command records 703 nonsecret source inputs with no drift. The sealed synthetic runner disables dotenv and AI, uses fake credentials, enforces a 60-second deadline and 8 MiB log cap, and records process identities and cleanup. `cleanup-final.json` independently confirms all four process groups absent.
- `frozen-producers-before.json` and `frozen-producers-after.json` match the contract's five hashes. No parse producer, scoring, rules, evidence replay/schema or readmodel file changed. Legacy DOM RED/GREEN belongs to the frontend allocation; none is claimed here. Original native adverse RED receipts remain preserved in the earlier backend packet.

## Frozen source packet

| File                                         | SHA256                                                             |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/page-text-diagnostics.ts`           | `c1fdfc504c39fde015ea6a0453c901c42151df3d56ef66847c797564e75326ee` |
| `app/lib/server/ocr/pdf-detection.ts`        | `4dce57465137393df13f7bdd2a027a2d061e0c5ac9eee4592d522db18eaf9bf0` |
| `tests/unit/native-page-diagnostics.test.ts` | `156f97e1730c6358ed58f891e183b01f299b23ac3940691c662a83cdcd94b010` |

Only these three files and this handoff changed in this allocation. The installed `clean-user-facing-text` workflow applies to handoff prose while preserving exact paths, code and claims. No database/SQL, provider, OCR engine, Docker, real environment, owner data, Git or deployment action ran. Root should integrate the frozen scanner only after frontend's actual DOM RED, then run the single combined affected gate. Shared source verification does not establish calibrated quality, original legacy PDF page boundaries, native/OCR provenance, native consumer behavior, full A1 extraction acceptance or release approval.
