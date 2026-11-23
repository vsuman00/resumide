# A13 publication service: Node peer review

**No new scoped source finding.** Reviewed Frontend's service and publication repository independently; comparison with Native `6bc`/`95258` is a cross-check of code I authored, not an independent Native audit. No tests, SQL parsing/execution, database, provider, environment, service or Git operation occurred. Root's existing 176-test/nine-file gate is prior evidence, not a rerun by this reviewer.

Reviewed exact hashes:

| File | SHA256 |
| --- | --- |
| `initial-feedback-service.ts` | `e59757235b63940b12fd027d07eaee1297426f2e12db1b9db18dc9d70d206dd7` |
| `initial-feedback-publication-repository.ts` | `43aff60fd4233f89e3bc3a8e42d0ab39a60deba775ee5b4d85915ac438d127e2` |
| `initial-feedback-service.test.ts` | `4eb30aef79cc20ee2f73b10a55dfcaa9f044c0953150e7b8ac7b93b2b437f21e` |
| `initial-feedback-publication-repository.test.ts` | `c4b9f2db35eec1a2915070da270a41854a295a982ca7965516d8a4122b2a4408` |

## Source conclusions

- Service lines 207–243 return an owned publication or pending state before fresh authorization, quota, budget or provider construction. A concurrent/uncertain prepare is resolved by the owned reader. It does not adopt a published operation through the frozen open-only foundation repository.
- Lines 329–450 require the repository-issued winning dispatch capability in both budget modes. Generic R03 claim is intercepted into the atomic Native claim. A false or uncertain claim returns pending; the loser neither constructs transport nor settles/releases/marks the winner. The instance-owned capability and exact pending-settlement input protect the later technical calls.
- Lines 288–301 retain observed usage before awaiting technical settlement. Raw transport observation precedes parsing; R03 accounting also sees usage carried by refusal/malformed failures. Accounting uncertainty returns pending rather than compiling or publishing a falsely accounted result. Lines 470–551 resolve raw output and invoke the actual compiler once, retaining either its full capture or a separate generation failure. Questions/unsupported outputs are not promoted into assessed facts.
- Lines 159–205 resolve an uncertain finish through an exact owned read and compare operation, attempt, binding and completion. An unavailable lookup stays unresolved; it is not evidence that no commit occurred. The path does not stamp `storage_failed` onto an ambiguously committed publication or overwrite saved content.
- Repository lines 275–389 apply one bounded deadline/abort scope to readiness plus RPC work, sanitize errors and distinguish sent/unknown mutation outcomes. Lines 565–615 send the exact Native finish arguments and reject a response for another completion. The strict publication contract checks compatibility numbers, retained maps and proof correspondence; Node treats Native JSONB hashes as opaque instead of emulating them.
- Read-only facades at lines 620–650 expose only read or owner export. Runtime scope checks prevent finish with a lease-free scope. Export uses only the supplied server-owned owner identity, not an invented worker lease or a current-org filter; strict row/link checks and whole-envelope limits preserve all owned organizations. These adapter checks do not themselves authenticate an HTTP user or prove deployed Native grants.

## Known lifecycle dependency

`exportOwned` at lines 526–533 refuses a retained published operation when its publication is missing. A legitimate Native content cascade can produce exactly that metadata-only collection. This is the Node counterpart of the already-recorded retirement/counter gap, not a newly reproduced service race. The forthcoming explicit retirement/disposition wire must update this consumer as well. Simply removing its completeness check would accept corrupted omissions. No code change or new test campaign is proposed in this review.

The reviewed service preserves AI-off/historical deterministic-only paths and does not implicitly enable a provider, worker, route or feature. Native transactions, two-session races, actual ownership/grants, retirement/expiry/privacy export, adoption and representative usefulness remain unverified or separately allocated. This is not a full security or feature certification.
