# CR-A14 v2 browser contract and controlled decision review

Status: IMPLEMENTED / VERIFIED_LOCAL_SOURCE. Four new files only; no route, HTTP, RPC, undo, readiness, grant or activation wiring. Existing projected cards and old 1.0/1.1 protocols remain unchanged. Native transaction/execution, full consumer adoption and release acceptance remain open.

The browser module supplies closed v2 draft-view, command, proposal and 14-field receipt schemas, the frozen 53+8N atom order, bounded portable A11OP2 framing and real async WebCrypto SHA validation. It uses the actual decision-policy envelope and profile pin. UUIDs stay canonical lowercase. Neither the module nor the component imports Node or server runtime code.

The separate controlled review shows complete current/proposed wording, the exact saved JD quote, source clauses/order, recorded citations and pinned version links. Acceptance requires fresh acknowledgement; rejection does not. It verifies the prepared proposal before exposing controls and correlates the entire returned receipt against the original command and computed SHA. Unknown outcomes retain the exact original command/key and review for manual retry; same-source head movement does not rebase it. Cross-source changes clear private review state. Generation and action guards prevent stale validation/results from appearing in another review; a busy ref prevents duplicate actions. No undo control or capability Boolean is supplied.

## Reproduced defect and repair

Actual Node-producer tests reproduced one presenter defect: after heads moved during an in-flight request, the saved receipt could appear beside the new JD quote. RED was 58 passed, 1 failed, 0 skipped across 59 cases. The assertion observed `Git preferred` where the original reviewed quote was `Git required`. The fix stores the captured review beside its confirmed receipt. That exact case then passed. The failed log, JSON report, receipts and original controller bytes remain preserved.

## Verification and evidence

Evidence directory: `/private/tmp/resumide-clause-order-decisions-frontend-l9vj4e2t`.

- `red/receipt.json`: genuine 58/1 failure, 970 unchanged source inputs, group absent.
- `green/receipt.json`: 59/2 passed, zero skips, 970 unchanged inputs: 45 browser cases and 14 DOM cases.
- `green-golden/receipt.json`: fresh 46 browser cases passed after adding one independent Python full-command vector. Exact 61 atoms, 1947 bytes and SHA `1874dac7cdf2dd07ee238002a90b3c78ec723d69e6727452a995a91d9f9e134b` agree. These fabricated codec identifiers do not grant source admission.
- Four-file lint/format checks passed on the 59-case candidate; affected one-file lint/format passed after the golden addition. Other three owned files stayed byte-identical. Combined author evidence covers 60 unique cases; there was no fresh all-60 run.
- Every child used pinned Node 22.23.4, sealed empty HOME, OS network/dotenv/Git-write denial, one test worker, 120-second and 8 MiB bounds. Receipts record source hashes, logs, lifecycle cleanup and independent group absence. No full typecheck/build or broad suite ran in this lane.

Actual helper/producer/codec/writer-scope dependencies tested: `5e9dee79`, `4686d61f`, `953b068b`, `9b3f99b8`; full hashes are in `readonly-dependencies.json`. Policy body SHA is `4d0bac1e65e84b0f3dc8531415a05890c6c7f6f7fe65bbbaf6563499843b9d93`. Root later refreshed formatting-only producer/codec/writer successors `69766bf9`, `c00f25fc`, `3d2e30f4` after all author gates, recorded in `B/decisions-readonly-dependency-sync.json`. The combined gate will check those current bytes. Earlier tests remain attributed to their exact original dependencies.

Read-only Node review found no scoped blocker in the inspected dependency bytes: original-pair reconstruction preserves immutable selected proof without mutating reader heads; fresh creation remains separate; full owned draft and additional writer scope are checked; generic command construction explicitly grants no admission. Browser fake receipts and source tests do not prove Native ownership, atomicity, replay, storage or service behavior.

The installed self-contained text-cleaning workflow inspected new displayed prose only: low density, no flagged Unicode artifacts and zero deterministic changes. Source/JD quotations, code, identifiers, hashes and tests were preserved. No cleaning service or provenance-removal claim is made.

## Frozen source hashes

All four preimages were absent.

```text
app/lib/jd-clause-order-decisions.ts b7bf92c29be21e0b30d1f91566b1fe72945424e7a717b4895a68ec850fb087fc
app/components/JdClauseOrderDecisionReview.tsx 585c9bf1970b8d648276e673bf522e0e117b5b0cc388c09fcd2c8e289d2183ab
tests/unit/jd-clause-order-browser.test.ts b909800b45ad29013789ffd69a95ddc1e6c6052f9323fc063d647b00241a0c09
tests/components/JdClauseOrderDecisionReview.test.tsx f0b2d3415660bfbae8a7ae3f3f0678730027208beba333cc91ee20abfaf330cd
```
