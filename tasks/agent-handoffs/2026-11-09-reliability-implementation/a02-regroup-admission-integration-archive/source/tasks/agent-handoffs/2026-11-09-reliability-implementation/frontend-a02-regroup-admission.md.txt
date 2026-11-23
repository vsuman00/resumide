# Saved entry regroup consumer

Status: IMPLEMENTED at the source, mock and DOM tier. Root integration and its combined gate remain separate. No native SQL, browser, hosted-write or release acceptance is claimed.

Contract: `757a93d38723d6211fd4574d2414bbe800c2a27c8aa80c4f5c2b23168d97f75b`. Worktree: `/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-frontend/resume_ats`. Preserved base HEAD: `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. The four app/test files are frozen; this handoff is the fifth owned file.

| File                                                    | SHA256                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `app/routes/analysis.canonical.tsx`                     | `533b24c2e1fcfefd4ce5787492946f6dd9951cb433150dd466785791fcdf6af1` |
| `app/components/CanonicalEntryRegroupReview.tsx`        | `f47a7b609da2f44acf1d902c7d22e6fa57cd22d4a1822361e509a93432ba19fc` |
| `tests/unit/canonical-route.test.ts`                    | `c1a934ce8c12822b18f4c53a96010f286336240932887f9ac395f33b3d2c0438` |
| `tests/components/CanonicalEntryRegroupReview.test.tsx` | `441e29250642baa237b6d6d5cab16c85185c562ad29308e019e1fbcde5d53e4b` |

The canonical route adds a separate owned regroup workspace and `?regroup=preview|resume|commit` dispatch. Mixed or duplicate import/regroup intents fail before a body read. Existing method, origin, authentication, private headers, refresh cookies, loader keys, first-import actions, corrections, drafts, history and fact confirmations remain intact. Successful preview/resume avoids revalidation; commit/error revalidates.

The new component requires explicit source-group and saved-fact choices. It displays source/current wording separately and reuses unchanged `CanonicalEntryRegroupDiff` for the actual complete affected sections, carried facts/bullets, ordering and retired destinations. The original locale is read-only. Saving requires a fresh unchecked named whole-entry acknowledgement; it does not confirm fact accuracy. Saving remains unavailable when the actual capability is false.

A separate tab-scoped 30-minute record retains only the exact strict command and its original timestamp before submission. It never stores checkbox acceptance, diff, facts or source text, never renews its lifetime on retry, and never overwrites an unresolved different request. The command's prospective `acknowledgement:true` remains unchanged protocol data. Explicit manual resume recovers the historical diff and original command. Valid historical context can permit the same-key retry despite current-state unavailability. Missing historical diff retains metadata and offers no apply. Automatic cleanup requires an exact resolved command and correlated SDK receipt; the saved UUID is linked even when it is no longer head. Storage failure is visible and keeps an honest in-memory retry.

Root amended only local recovery after an actual conflict/review-again dead end was reproduced. A non-submitting, busy-guarded button now discards this tab's retry details explicitly. It does not cancel a server save or delete a saved version; a history link lets the user check what was saved. Conflict and unknown outcomes never discard automatically. Successful storage removal resets pending/historical state and the fresh-preview generation, requiring a new preview and unchecked acknowledgement. A removal exception or failed readback keeps the request and historical view and reports failure. No dialog, route, query, SDK or server change was added.

The actual dependencies were synchronized by Root: SDK `c464bfdfe5829782076037d61ff4f7caa1d174b529fda8f621eb687688ed9399`, schema `b3ceb38d62d6087a4e91a096da5fa86222fc2be97aaed154440ed1e73dfa2108`. Existing core/command/diff semantics were reused. No placeholders or missing-import RED were used.

Private packet, mode 0700: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a02-regroup-ui-n2fqx3mo`. Exact source snapshots use `.txt`.

| Receipt                                                          | Evidence                                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `red-actual`                                                     | Actual old canonical DOM rendered with validated SDK/producer data; one expected missing-heading failure before route changes. |
| `focused`                                                        | Initial 48 cases passed, including all 47 original route cases.                                                                |
| `focused-controls`                                               | 71 passed; two new harness expectations failed and remain archived.                                                            |
| `followup-controls`                                              | Four affected recovery/receipt/history controls passed after correcting the harness.                                           |
| `focused-terminal`                                               | Fresh 75 cases in two files passed against final SDK.                                                                          |
| `focused-types-followup`                                         | Six affected controls passed after three test-only type corrections.                                                           |
| `router-late-reachability`                                       | Two fresh actual-Router cancellation controls passed; kept distinct from the 75-case receipt.                                  |
| `types-reachability`, `lint-reachability`, `format-reachability` | Scoped types: six roots, 53 sources, zero diagnostics; lint/format passed.                                                     |

Local amendment receipts: `red-local-recovery` captures the real conflict with retained metadata, a blocked new save and no discard control. `focused-local` passes six selected cases: four new discard controls and two existing retry/receipt controls. `types-local` reports four roots, 52 sources and zero diagnostics; `lint-local` and `format-local` pass. The prior 75-case and two-case Router receipts remain separate.

The amended UI files contain 81 cases. No fresh 81-case run is claimed. The local follow-up adds four cases and reruns two affected existing controls. Earlier failures include comparing the changing HTTP trace ID instead of the frozen command, expecting a checkbox after an ambiguous response had correctly hidden the historical diff, and three test-only TypeScript harness issues. Their receipts/logs remain. The initial formatter-write receipt records intentional owned source changes; the process exited zero and later format checks passed.

Root's suspected late-preview race is NOT_REPRODUCED through the actual route. Busy fieldset/submit guards blocked user edits and rapid resubmission; real Router history cancellation discarded late A both without B and after B completed. The product remains unchanged. Two unsupported `busy=false` prop-sequence failures are preserved in `red-late-preview` and exact `.txt` sources. Root explicitly approved replacing only those newly added tests with the two actual-Router controls. No correlation token or protocol change was added.

`preservation.json` verifies all 36 original test-call nodes and 186 original assertion-call nodes remain exact. `preservation-local.json` additionally retains all 12 prior DOM test-call nodes, 122 assertion-call nodes, eight protected helpers and six effects exactly, including automatic receipt cleanup. Route, route tests, SDK and server remain unchanged by this amendment. Only four allocated source files and Root's authorized SDK dependency changed in the initial leaf. The local amendment changes only the component, its DOM test and this handoff. The original packet SHA256 `3460f16b8818267255b470ce9999023e0164f58e01c5133f605e62fe7a4cfe25` is preserved as read-only `final-packet-before-local-recovery.json`; prior metadata and exact source snapshots are in `before-local-recovery`. A successor packet records the local receipts and frozen hashes. Log hashes and absent owned process groups are checked independently. `source-freeze-local.json`, `reviewed-test-model-correction.json` and cleanup records retain the details.

Only sealed Node 22 synthetic checks were run. No full author build, broad suite, browser, service, SQL parser/execution, database, provider, real environment/keys/PII, dependency, Git or deployment operations were performed. The apply writer remains denied by the contract; synthetic mocks exercise permitted-capability behavior without activating it.
