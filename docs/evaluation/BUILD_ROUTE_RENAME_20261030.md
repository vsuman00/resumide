# Build route rename: verification closeout

Status: VERIFIED for the authorized route/naming slice, 2026-10-30. The uncommitted candidate retains default-off compilation and all AA7 release/security/accessibility gates. AI-specific work remains held pending the credential decision; no AI design, code, tests, model call or live-key verification occurred.

## Behavior and evidence

The current page is `/build`, titled Build; compilation uses `/build/compile`. Legacy GET `/latex` returns a private/no-store 308 to fixed `/build`, without echoing its query. The legacy compile resource redirects with method/body preservation to fixed `/build/compile`.

[The machine receipt](BUILD_ROUTE_RECEIPT_20261030.json) records source hashes and the tested base HEAD `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. Existing unrelated dirty work is preserved. Node 22.23.4 was used.

| Check                                      | Result                                                          |
| ------------------------------------------ | --------------------------------------------------------------- |
| Initial route/service tests                | 2 files / 42 tests PASS                                         |
| `npm run test:latex`                       | 5 files / 106 tests PASS                                        |
| `npm test`                                 | 127 files / 1,064 tests PASS                                    |
| `npm run check:latex:source`               | Formatting, focused lint and existing Python syntax checks PASS |
| `npm run lint` and `npm run typecheck`     | PASS                                                            |
| `npm run build` and `npm run build:worker` | PASS                                                            |
| Dedicated Build browser flows              | 6/6 PASS in 20.4 seconds; desktop/mobile Axe zero violations    |

The browser suite compiled the exact current buffer into a real visible PDF, recovered download text/order/links independently and exercised page/zoom controls. A separate authenticated POST through the legacy URL produced a PDF containing its distinct submitted source, confirming actual redirect body preservation. Authentication, private/no-store responses, Origin checks, safe failure/retry, source invalidation, keyboard resizing, mobile buffer retention and cancel/stale-response assertions remain enabled. Cancellation fault injection tests browser state; prior AA7 runtime evidence covers actual compiler cancellation.

[The Build success screenshot](build-route-success-20261030.png) contains only synthetic source and actual PDF output. Historical AA7 screenshots and receipts were not overwritten.

## Cleanup and boundaries

Tests used only the owner-approved managed Supabase synthetic fixture. Five exact recorded test users and their profile/membership/organization rows are absent after cleanup. Two user-rate buckets were deleted by exact private ledger keys; none of the five recorded keys remain. SDK cleanup and narrowly scoped SQL confirmed this. Private environment/ledger files were removed, port 3110 stopped and no owned compiler container remains.

The shared global counter was retained without a pre-test baseline. The previously disclosed AA7 limitation for earlier expired pseudonymous rate metadata is unchanged; no broad cleanup or zero-total-metadata claim is made. No Docker database, hosted migration/reset, real document, deployment or Git publication occurred.

The compiler image and adapter are unchanged. The expensive AA7 resource/security/benchmark matrix was not repeated for this URL-only change; real compilation and the affected browser paths passed. No full upstream database/browser suite, compiler CVE scan or formal release acceptance is claimed. See the [coordinator record](../../tasks/agent-handoffs/2026-10-30-build-assist-coordinator.md) for the independent AI credential gate and next authorized assignment.
