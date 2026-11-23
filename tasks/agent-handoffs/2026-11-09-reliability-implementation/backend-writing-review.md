# Independent A11 writing-support review

Reviewed 2026-11-09. Source-only peer review requested by the coordinator; no tests, services, provider/network calls or source edits ran. This is the reviewer's only file for this leaf. C02 remains checkpointed separately; A08's released files were not edited.

## Reviewed snapshot and scope

Frontend worktree `reliability-20261109-frontend/resume_ats`:

| File                                            | Reviewed SHA-256                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| `app/lib/server/writing-support.ts`             | 6ce0a8ec01ee2e234865f5919f6b40baf2a7ff5a2afa92defa41356bf76503d3 |
| `tests/unit/writing-support.test.ts`            | d128d26203169d671b33680ff85fe919ac95a6d20d50394fe4cf4fe0b3210441 |
| `tests/unit/writing-support-usefulness.test.ts` | 7f4d14dd7569417bf8d3286933e24503461f604df03796f31f30156cfebf5b5a |

Read the changed implementation, rewrite/summary/support admission paths and the new context/usefulness controls. Reviewed schema1.1.0/policy1.0.2. The reported 83 tests and original seven positive reds were author/coordinator evidence, not rerun or independently observed by this reviewer.

## Findings and disposition

No additional concrete trust or association regression was found in this reviewed snapshot. Meaningful/unknown qualifier IDs accumulate without clearing at contact metadata, recognized headings or later layout entries. Whole mailbox/URL metadata does not convert adjacent mixed prose into metadata. The bounded engineering entry grammar retains section/header anchors and marks layout authority derived-only and attribution not inferred. A separate employer/title tuple does not become an explicit role fact or adjacent-role summary source. Explicit summary composition still requires the unique source role@employer, an immediately adjacent unqualified contribution and the same literal employer in its object. Metric/agency changes, duplicate originals and cross-entry claims remain subject to the existing clause reconstruction rather than bag-of-words overlap. Caller-modified context is rejected by rebuilding source/policy anchors before support.

The coordinator/author separately identified A11-F01: repeated entrySpan.text could expand a valid 100k-source/512-anchor document toward50MiB. This review does not duplicate or soften that accepted finding. The author is replacing repeated text with exact id/start/end references and a linear work bound. **Terminal source acceptance is pending the final F01 hashes and a narrow diff review.** No old snapshot is approved as the terminal fixed candidate by this report.

Finite grammar coverage remains limited: mixed/unsupported entry layouts may withhold useful suggestions. That is a current usefulness gap, not a new product-segment exclusion. Source-transformation support is not independent factual verification, canonical confirmation, multi-surface/live-provider validation or full A11/CV03 closure. No automatic saved fabrication claim is made.

## Terminal A11-F01 replacement review

The coordinator supplied the frozen replacement; its exact hashes were verified locally before a narrow review of the reference/type construction, provenance copy, anti-tamper comparison and changed dense/source-span tests:

| File                                            | Terminal SHA-256                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| `app/lib/server/writing-support.ts`             | 6dcac128e26dec55bd3d462281adb5ee621a9e7421b8e5fe955b40d19f89d261 |
| `tests/unit/writing-support.test.ts`            | 4c0e5e5dc91e4636816bf6fdff0cfa44d2c4b7a84ff2e64722003e12039b2ebc |
| `tests/unit/writing-support-usefulness.test.ts` | 7f4d14dd7569417bf8d3286933e24503461f604df03796f31f30156cfebf5b5a |

**PASS for this source-only slice.** Entry metadata now repeats only id/start/end references. Exact entry text is constructed once per disjoint entry for its source-bound ID rather than stored again in every contribution. Header/source/policy binding remains intact; changing a range, header, ID or attribution, or injecting an extra text property, is rejected by canonical source reconstruction. The F01 delta does not add role inference, clear meaningful qualifiers or permit cross-entry metric/agency borrowing. No additional concrete trust/association regression was found.

The author/coordinator reports 84 affected passes and the preserved dense fixture: source17,135 units/82 anchors, serialized1,636,831 before versus259,551 after, under the same541,492 assertion budget with support retained. Those are reported execution receipts, not independent reviewer runs. The linear budget is a test assertion for that dense fixture; this source review does not claim a universally enforced runtime serialization budget or representative performance evidence. No tests, provider/network/service calls or application writes were performed by this reviewer.

The initial hashes and pending disposition above remain the historical pre-fix review. This terminal disposition supersedes that hold for the exact hashes listed here. The policy/schema are still draft/unactivated; full A11/CV03, canonical/all-surface and actual live usefulness gates remain separate.
