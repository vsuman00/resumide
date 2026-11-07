# AA7 standalone LaTeX converter: engineering closeout

Status: IMPLEMENTED and VERIFIED for bounded synthetic engineering, 2026-10-30. Formal AA7 security, accessibility and release acceptance remain open. The feature stays default off. A compiled visual PDF is not ATS-verified.

## Candidate and authorization

The owner approved the revised standalone editor/preview design and local compiler implementation, then authorized temporary synthetic accounts in the configured managed Supabase project. No hosted migration, reset, deployment, private document, provider activation, commit or publication occurred.

The candidate is uncommitted on base `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. Existing PaddleOCR, model and Phase 7 dirty work is preserved. [The integrated manifest](AA7_INTEGRATED_MANIFEST_20261030.json) identifies source bytes. Tests used Node 22.23.4 and Docker Server 29.9.2.

Compiler image: `sha256:600c3815bdf12a4e3df6d332c0aea11685fd122f0fc3240b7be3c802fd23bf4f`. Runtime files, package inventory and sealed read closure are hash-bound in the receipt. Landlock ABI availability and actual enforcement were tested separately; the kernel exposed ABI 8.

## Verification

| Check                                                | Result                                                                                           | Evidence                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `npm run verify`                                     | PASS: formatting/source checks, lint, 126 test files / 1,052 tests, types, web and worker builds | Includes 94 converter unit cases                        |
| `npm run verify:latex -- <immutable-image-id>`       | PASS: 19 runtime groups, including 19 PDF-policy cases                                           | [Runtime receipt](AA7_RUNTIME_RECEIPT_20261030.json)    |
| `npm run benchmark:latex -- <immutable-image-id>`    | PASS: three profiles on A4 and US Letter                                                         | [Six-case benchmark](AA7_LATEX_BENCHMARK_20261030.json) |
| Focused layout checks                                | PASS: neutral wrapper, Latin Unicode, missing glyph, specific overflow rejection                 | [Layout receipt](AA7_LAYOUT_RECEIPT_20261030.json)      |
| Dedicated Playwright suite                           | PASS: 6/6, 16.7 seconds, actual app and authorized managed Supabase                              | [Browser receipt](AA7_BROWSER_RECEIPT_20261030.json)    |
| Secret scan, alerts and application-container checks | PASS                                                                                             | Existing repository checks                              |
| `npm audit --omit=dev --audit-level=high`            | PASS: zero reported application dependency vulnerabilities                                       | Not a compiler OS/package CVE scan                      |

Actual Docker checks cover configuration, Landlock reads/writes/exec, denied network access, process/open-file limits, 8 MiB file size, 128 MiB scratch exhaustion, memory OOM and 10-second CPU enforcement. Active cancellation, a paused worker exceeding its wall deadline, two active jobs with a third refused, and exact-container cleanup pass. Concurrency is per server process, not distributed.

Real compiled output passes independent PDF.js text/order/link recovery. PDF-policy probes reject active/chained actions, unsafe links, attachments, dormant scripts, unembedded fonts, malformed/encrypted/oversized output, unsupported geometry and excess pages. Direct/constructed file access, outside writes, unavailable packages and CPU loops fail safely. Source scanning remains admission control, not proof of TeX isolation.

The browser suite verifies exact-buffer compilation, visible canvas ink, page/zoom controls, download, stale-output invalidation, safe failure/retry, authentication, Origin checks, keyboard resizing and mobile buffer retention. Desktop/mobile Axe report zero violations. Browser cancellation uses delayed transport fault injection; real compiler cancellation is tested independently. [The success frame](aa7-latex-success-20261030.png) contains only synthetic source/output.

Six examples measured p95 735 ms. This small sample has no approved performance target. All six PDFs had zero tagged pages. These results do not establish PDF/UA, assistive-technology acceptance, representative validity, complete source-to-PDF parity or ATS/hiring guarantees.

## Corrected findings

Tests exposed a TeX control-word/register-digit admission bug, missing runtime font/package/configuration dependencies, and readable `shellesc` through an unnecessary tools directory. Owners fixed these; the tools directory was removed. Desktop Axe exposed an interactive separator nesting a button and a non-focusable scrollable PDF viewport; both were corrected without suppressing assertions.

An initial overflow payload produced only generic compile failure. The final test proves its neutral wrapper compiles before requiring `layout_overflow`; unsupported glyphs require `missing_glyph`. [Historical evidence](AA7_RUNTIME_HISTORICAL_20261030.json) is superseded, not final acceptance. Testing-only type, locator and diagnostic expectations were corrected and affected checks rerun.

## Cleanup and remaining gates

The final run's five synthetic accounts and their profile/membership/organization rows are absent. Exact SQL cleanup removed two user-rate buckets; none of the five exact ledger keys remain. Private environment/ledger files were deleted, port 3110 stopped, and no owned compiler container remains. See [cleanup receipt](AA7_CLEANUP_RECEIPT_20261030.json).

Earlier attempts cleaned their own accounts but did not retain exact rate keys. A bounded synthetic-audit lookup found no recovery entries. Earlier pseudonymous rate rows are logically expired but physically unpurged. The shared global bucket was retained without a pre-test baseline. This is not a zero-test-metadata claim.

The owner-requested Docker DB cleanup removed only the owned stack/volumes and eleven unused Supabase image references. Existing unrelated analytics/logflare resources were preserved. Managed Supabase tests did not reset data or apply migrations.

Not run: compiler OS/package CVE scanning, formal security-owner release review, tagged-PDF/assistive-technology acceptance, representative evaluation, remote CI, deployment, full upstream database/browser drills or `verify:ci`. The broader suite's local database assumptions/mutations exceed this managed-project authorization. These gates remain separate from the engineering passes.
