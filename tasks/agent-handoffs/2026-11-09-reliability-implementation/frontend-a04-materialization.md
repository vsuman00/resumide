# A04 correction workflow: frontend release

Status: **IMPLEMENTED; focused source, route and component checks PASS.** Root owns integrated verification and acceptance. Base: `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus 710 synchronized nonsecret dirty inputs. This worker owns only the four files below and this handoff.

## Behavior

The flag-gated canonical route loads the owned correction workspace. The new panel shows exact current/proposed values, original source context, the saved target's human label and separate candidate-correction provenance. Forms select server-derived tuples; users never retype an immutable correction. Assignment, apply, add and reapply are distinct acknowledged actions. Absent facts require an explicit placement. Initial import with pending corrections follows this reviewed path.

Changing a target, placement or source/review/assignment/head binding clears acknowledgement. Same-binding Router revalidation preserves the mounted form's original operation key after a retryable failure. Forms contain only `operation=correction` and strict JSON commands with expected bindings, selectors, acknowledgement and key; owner, organization and corrected-value authority are absent. The actual parser rejects injected authority fields. Assignment success does not claim that a version was saved.

Applied/added values remain unconfirmed and use the existing separate exact-fact confirmation control. Restore stays an immutable child. The panel shows retained application history and requires fresh current-head assignment before explicit reapply. False authoritative `writeReady`, historical selection and busy submissions prevent correction mutations. Legacy/default-off authoring, method/origin/auth checks, conflicts and private SSR headers remain intact. Server DTO imports in the component are type-only. Scores and verified export are not granted by applying a correction.

## Reproduction and checks

Failed receipts are distinct: old loader **1 failed / 12 original passed**; absent review UI **7 failed / 1 legacy passed**; focused initial-import bypass and saved-target-label failures; old parser integration **6 failed / 15 passed**. The intermediate 22-case GREEN is preserved separately. Name-filtered reproductions did not disable any source tests.

The final corrected dependency run passed **30 tests: 21 route and 9 component**. The route cases exercise the actual bounded form parser and mocked mutation boundary. Component cases use actual React Router rendering/forms with synthetic server models and actions. They cover initial corrected import, current/proposed/source/target display, no value re-entry, assignment versus apply, add placement, undo/reapply, same-binding retry key, readiness/history/busy denial and legacy rendering. All original 12 route controls remain.

Scoped lint passed. Scoped TypeScript passed with four roots, four ambient inputs, 474 source files and zero diagnostics. The first typing pass found one test-only response-union access; an explicit successful-response guard fixed it, then the four affected command cases passed again. The initial type diagnostic is explicitly transcribed from tool output because the reusable log path was overwritten by the successful run; original behavioral failure logs remain unchanged. No suppression or assertion weakening was added.

The new UI's static prose scored low (0.1525), with no suspicious Unicode and a byte-identical deterministic cleaning pass. Final formatting and whitespace/prose checks accompany the release metadata.

Private receipts: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a04-frontend-vipa_7mh/`.

## Dependencies and review

The first backend release was held before final execution after Root found source/target cross-products for multiple employers. Backend repaired that actual path; no client-side matching workaround was added. Final read-only dependency inputs: repository `aedd0a2c`, commands `7c75b526`, schema `aab78a9a`, projection helper `e8d2eb62`; complete hashes are in `renewed-dependency-release.json`. Root source-ACKed the unchanged route/component implementation.

This worker also source-reviewed frozen SQL `d54ee0b8ca715243a83afbc9684453fb9f085ad55085f66b41853bc626ee5ea8`: three RPC argument/receipt shapes, strict selectors, explicit current-head reassignment/reapply, unconfirmed children and real write-readiness metadata align with the UI/DTO. That ACK applies only to this exact source hash, not native execution or deeper transactional/grant acceptance.

No provider, network, database, SQL execution, Docker, browser, owner-file access, build, deployment or Git mutation occurred. These tests do not prove hosted atomicity, tenant isolation, browser accessibility or a complete native consumer journey. Root retains those gates and the default-off feature boundary.

## Owned files

| File                                             | SHA-256                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `app/routes/analysis.canonical.tsx`              | `b5028d5a6fd1cf89068a75331056f37812ebdb17a48749136f3afe0d6eb43445` |
| `app/components/CanonicalCorrectionReview.tsx`   | `b81f27a43ae29b3be2858496f4de6314991c4b25991c5926c744bcfb14217b23` |
| `tests/unit/canonical-route.test.ts`             | `0256c28fedaa6959417d478ebf316a6803596ea46af9c50eabebdfa2c0e592b1` |
| `tests/components/CanonicalCorrections.test.tsx` | `d331699908f7bd201bbb5577e208f78c60d7a9f2c891184f6f20922f4b7ef60b` |

## Original-import readiness follow-up

Root allocated this narrow A04-S03 change after approving the transaction-fresh original-import contract. The original import button now respects authoritative `writeReady:false` when correction data is present. Busy submissions remain disabled. Readiness returning enables the button, and the legacy workspace without correction data retains its existing behavior. No form fields, source values, confirmation, scoring or browser authority changed.

One actual component regression failed against the released `b5028d5a` route: original import was enabled while correction writes were unavailable. After the route fix, that same case passed. It also checks that the disabled button submits nothing, that revalidation enables import when readiness returns, and that removing correction data preserves legacy import. The nine previous component cases were unselected by the test-name filter; no assertions were removed or disabled. The earlier 30-case campaign was not repeated, and a new full 31-case pass is not claimed.

New sealed Node 22 receipts are in `/private/tmp/resumide-a04-readiness-5kbrt8_o/`: `red.json/log` and `green.json/log`. Both runs had stable scoped source hashes and ended with their owned process groups absent. No live credentials or dotenv configuration were loaded. No database, provider, Docker, browser, owner-file or Git operation ran.

After the interruption, the earlier temporary receipt directory named above was absent. The previous handoff and released source hashes remain, but those historical raw logs could not be rechecked. Their earlier results are retained as historical evidence rather than recreated. Root's integrated gate remains pending. The proposed original-import wrapper needs no additional browser fields; its final source review is separate from this component result.

Scoped formatting, lint and whitespace checks passed for this delta. Root owns final project-wide types and the combined affected gate.

| Current changed file                             | SHA-256                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `app/routes/analysis.canonical.tsx`              | `50f0f0061efba370ab1cc40d0ff8b0c9f687b574dbccedc1aaa073bf8e808ebf` |
| `tests/components/CanonicalCorrections.test.tsx` | `c4512586717e37ce498b452f78921e17c2448d784717486c731badbdcecd6fad` |
