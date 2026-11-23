# Independent compiler input and browser selector review

Updated 2026-11-09. Reviewer: frontend agent. Root main at `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus the current dirty files is authoritative. This separate review preserves the released U05 handoff and its hash.

## R12(a): initial read-only review

Reviewed the pinned public input helper, its pure unit tests, the source-hash helper and root's public-asset receipts. No fetch, test, build, Docker operation, service, credential, provider or database operation ran during this review. The author's 19 pure test passes and root's independent 543,404-byte artifact/hash/mode check are their recorded evidence, not a new reviewer execution.

The helper's actual CLI loads the exact existing Expat name, URL, byte count and SHA-256 from the reviewed pin contract. It defaults to offline verification; fetching is explicit. Initial URL matching, repository-specific HTTPS redirects, default-port admission, three-redirect maximum, identity encoding, expected-size-plus-one rejection, whole-transfer deadline, read-only atomic publication, exact partial cleanup and content-free errors were inspected. No ambient proxy, authorization header, cookie handler or retry is introduced. The transport-chain receipt correctly avoids claiming one HTTP exchange per chain.

**Finding R12-F01: existing-cache FIFO can block verification.** At the reviewed helper lines 132–145, `os.open` uses blocking `O_RDONLY` before `fstat` rejects non-regular input. A FIFO at the exact cache entry can therefore block before the check. Cached verification at lines 165–169 also runs outside the transfer deadline. This violates the stated non-regular-input rejection and bounded local failure behavior. Root accepted the finding and assigned a separate focused helper/test correction. Require a subprocess-bounded FIFO regression, fast content-free rejection and preserved ordinary cache/transfer behavior. The reviewer has not run a hanging probe. R12-S01 remains PARTIAL until the corrected frozen files are reviewed.

**Source-binding disposition.** `latexSourceHashes` includes the new prefetch helper and test but does not bind its own implementation (`scripts/latex-test-fixtures.ts`), and it resolves files against process working directory. Root accepted these gaps for R12(b): include that implementation and wrapper in the source binding and require an explicit reviewed base directory. This review does not treat the existing manifest as a complete wrapper/build input freeze.

Initial reviewed SHA-256 values:

| File                                       | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `scripts/latex-runtime/prefetch-inputs.py` | `3a2bfdbc9fd989a61d853f2566545a6c19806de3e2b478f1ecc58482c6dafa61` |
| `tests/unit/latex-build-inputs.test.ts`    | `bebb15bceb58f38834b3293fda7e4df932274be531623f302c9469bc8e9ccdbb` |
| `scripts/latex-test-fixtures.ts`           | `395abe9fa55df22181900dc3dc3492b8f50e58a99c4fd680ea21e120d632b803` |
| `runtime-assets.md`                        | `ac82593aa5dc1c88d02067614d27872a530a451fc736a667dc9c58abdfa5b129` |
| `r12-public-asset.json`                    | `9a047f374b305480cc246dff8bbbd043097656b4b1b7c7c0216829ecbf80a145` |

The last two files are in this handoff directory. Preserve these initial bindings and append the correction's disposition rather than replacing the original finding.

### R12-F01 terminal correction review

Root integrated helper SHA-256 `94846c89cf8f2a25742002d0c18049a09810cdef3a45ff855234cc2bdc231e06` and test SHA-256 `8765ca7d79a4fdce5feb9c96838fc70724a0e3de62fd2dc962ac5fb0d16f4ee9`; the corrective runtime handoff was `457b7e176737081acb5cac378cef14e4c0f7acfe24ac02d3e3cea7a163ba67f8`. Read-only terminal source review passes for this finding. The helper now checks a regular file with `lstat` before opening, uses `O_NOFOLLOW | O_NONBLOCK` to reject symlink/FIFO replacement races, checks the opened descriptor with `fstat` and bounds cached verification with the deadline while retaining zero network attempts. The three new tests cover rejection before open, a regular-to-FIFO swap and the offline deadline. They use bounded subprocesses and exact temporary cleanup. Runtime recorded the three original reds and 22/22 final passes; the reviewer did not rerun them. This closes R12-F01 at source/pure-regression review tier, not the compiler runtime gate.

## R12(b): initial frozen wrapper review

Reviewed the first frozen wrapper in the runtime worktree: Dockerfile `6aa5ba0ec551c2bee0373157682e374641400a00be2f24dafe65daa8aa2f196c`, wrapper `306f00314226afee3f6d0c9f92db9801e1f28b3796b8461de739b711b5efee43`, source helper `93afc95fd44dd31ba84c2b1ff3ef2c916401e3514d76a9131ad0da14f883d6ba`, tests `cffae7885d7243fbc3c461391a9b58b38f7a3e342b52117fb410ff46e4419d97` and runtime handoff `2ca678e4f297ed48a455f0c82d5e0b419cb3a98b11b1f83ebf573d28a62e4e21`. Runtime reports 58/58 pure tests and scoped lint/format/types; this reviewer did not repeat those commands.

The prepare-only packet at `/private/tmp/resumide-r12-review-final-1n_659yr/review-packet.json` has fingerprint `28530293873644856b290c318a7534dd2ac5375f06533c812312dc66c9ea66f5`. Independent read-only hashing matched all 66 source bindings and all 61 frozen compiler files. The actual context file list is exact, files are read-only, and the sole public asset matches the pinned bytes/hash. Reversing only the allocated Expat `COPY` restores every byte of root's original Dockerfile; no native policy, source pin or vendor assertion changed. The earlier self-binding/base-directory gap is repaired in the manifest implementation, subject to the executing-checkout finding below.

Fixed local named-context arguments, the allowlisted compiler snapshot, private Docker/Buildx configuration, fresh owned image tag, one-attempt marker, source/context checks, 32-MiB retained-log limit and URL/control-character redaction were inspected. The proposed admission remains 12 GiB host free, with cancellation below 8 GiB; CPU/memory observations are not hard BuildKit limits. The wrapper separates client-group exit, exact-ref terminal history, solve exit and final immutable image/tag/metadata identity. It preserves unknown daemon state and never stops/prunes Docker globally. Installed-version primary sources confirm the [local record path and fields](https://raw.githubusercontent.com/docker/buildx/v0.38.1/localstate/localstate.go), [context/Dockerfile association](https://raw.githubusercontent.com/docker/buildx/v0.38.1/build/localstate.go) and [terminal status values](https://raw.githubusercontent.com/docker/buildx/v0.38.1/commands/history/inspect.go); actual private-ref cancellation still needs the separately reviewed runtime probe.

**Finding R12-F02: executing checkout is not bound.** Preparation and execution hash the caller-selected `binding.workspace`, while the executing wrapper and its imported helper may come from another checkout. A reviewed packet for checkout A could therefore be run by changed code from checkout B while only A's files are checked. Runtime confirmed there is no other admission. Proposed correction: derive the canonical executing root from the wrapper's `import.meta.url`, require the prepared/packet workspace to match it before Docker observation, and add a meaningful separate-checkout regression. The current packet's own file hashes match, but it must be renewed after this correction.

**Finding R12-F03: a stalled monitor can prevent a bounded lifecycle result.** The monitor loop awaits free-space, integrity and owned-ref operations directly. The independent deadline watchdog signals the owned client, but a monitor promise that never settles prevents the loop from reaching history inspection or returning the required unknown-state receipt. Thus the proposed 2400-second total bound is not enforced on the entire lifecycle. The existing fake-clock watchdog test proves scheduled signals only. Require a focused stalled-monitor regression and bounded monitor/deadline handling that preserves exact ownership and reports `daemon_outcome_unknown` when termination cannot be proved. Root/runtime have been notified; the reviewer ran no stalled operation.

At the first freeze, wrapper review remained open for these findings and renewed inputs. No actual Docker build/probe, image adoption or compiler/PDF/confinement/browser pass is supplied by preparation or source review. Killing the Docker client alone does not prove the owned daemon build stopped.

### R12-F02/F03 terminal correction review

Read-only terminal source review passes for both findings at the second frozen candidate:

| File                                    | SHA-256                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| `scripts/build-latex-verified.ts`       | `7e7ca14d6bb16344226d0ef9cc8e9408107cfbb4cd0ea723a9fe5b9aa06b1a50` |
| `tests/unit/latex-build-inputs.test.ts` | `ad4a1c13f0909248fa8fa7b6bfeaf57147ec605306e0b72c37898c64639d6aa4` |
| `scripts/latex-test-fixtures.ts`        | `93afc95fd44dd31ba84c2b1ff3ef2c916401e3514d76a9131ad0da14f883d6ba` |
| `scripts/latex-runtime/Dockerfile`      | `6aa5ba0ec551c2bee0373157682e374641400a00be2f24dafe65daa8aa2f196c` |
| `runtime-assets.md`                     | `7ea592664db13d63821e295e4b18a68880e43b9eb0f475d50a243515b99089a0` |

Preparation and execution now compare the canonical selected workspace with the root derived from the executing wrapper's `import.meta.url` before Docker observation. The imported source helper stays relative to that script. A separate temporary-checkout regression covers the wrong-root rejection. This addresses R12-F02.

Preflight and active free-space, integrity, owned-ref and history observations now race two-second deadlines. Preflight failures return without starting a client. Active observation failures request cancellation of the owned client; exact-ref history and group absence still determine terminal or unknown state. The production history CLI also uses the two-second bound. Pending disk/source/ref/history regressions now return conservative receipts, alongside the independent scheduled-signal test. Runtime recorded the pending-monitor red and 63/63 final pure passes, plus scoped lint/types; the reviewer did not rerun them. This addresses the stalled awaited-monitor failure in R12-F03. It is software lifecycle evidence, not an OS-level termination guarantee or actual daemon cancellation proof.

The packet with fingerprint `28530293873644856b290c318a7534dd2ac5375f06533c812312dc66c9ea66f5` is withdrawn and must not execute. A renewed packet must bind this second source freeze and fresh resources. Root's separately reviewed local-only probe must establish real client-group absence and terminal exact-ref daemon state before a full build allocation. No new packet, probe, compiler image or runtime acceptance is inferred from this review.

### Final owned-process identity delta

Root required an additional PID-reuse correction before integration. Read-only review passes for wrapper SHA-256 `abdefc57403b8c66fbf70faa3b03bf79595e9050bb3cade44adff84d220de679`, tests `6a0104dce30d02129d4c40e46772e5057edd2c484f283e0d700c64e72544e9ff` and runtime handoff `4dc4fc96fc0477a362af4ba34fd27575caece37ffa46f0df5568cac359ac451b`. Recipe `6aa5ba0e…` and source helper `93afc95f…` remain unchanged from the prior review.

The guard captures only the detached leader's PID, PGID and start time, requires the original PID to be its own PGID and rechecks that identity before signaling. Both scheduled watchdog signals and loop escalation use the same guard. A missing, reused, vanished or uncaptured identity suppresses signals and leaves ownership/cleanup unknown; group existence alone is insufficient. The separate group-absence probe and exact daemon ref/history still govern their own outcomes. The receipt records the captured identity and unknown flag without process arguments or environment.

The four new injected regressions cover reused, vanished and uncaptured leaders receiving no signals, plus an unchanged original leader receiving an owned signal and subsequently proving group absence. Runtime reports four original reds and 67/67 final focused passes; this reviewer did not execute them. The F02 executing-checkout and F03 bounded-observation guards remain present. All earlier packets stay withdrawn. Actual spawned-group identity, exact-ref cancellation and compiler runtime acceptance still require the separately allocated probe/build; none ran during this review.

### HOME preservation and current runbook

The subsequent HOME correction passes source review at root wrapper SHA-256 `6d9dd42d3636052b960b30683c8f07a2587577ffc691269a555c7c94de97be17` and tests `92a8774ac89509b22c4208c61069fb18c98316240cc9a58998c645e0cec00b5e`. `cleanEnvironment` now preserves the inherited `HOME`; `buildClientEnvironment` selects private `DOCKER_CONFIG` and `BUILDX_CONFIG`, with explicit `--config` on actual Docker clients. It does not spread inherited application or Docker settings. The new injected test checks unchanged HOME, private configuration and secret-canary exclusion. Runtime reports 68/68 focused passes; this reviewer did not rerun them. No settled F01–F04 requirement was changed.

Root separately allocated `docs/operations/LATEX_CONVERTER.md` for this documentation slice. Its worktree baseline matched root at SHA-256 `42ce4237fc0856330de7dbd9a2abc3f34bba4a943d8acbc1358f6fbc757acd40`. The runbook now distinguishes historical 4b83 runtime/CI receipts and the retained 947 advisories, 80 high/zero critical and E-010 70/71 signer result from the November 9 missing compiler. The current named `verified-expat` context replaces the obsolete raw build instruction. The Node 22/local vite-node `--cli` example is prepare-only, with explicit exact asset/output paths and private mode to prevent `.env` loading. Execution still requires a reviewed packet, toolchain-bound cancellation receipt, fresh source/resource admission and separate allocation; `runtimeAccepted` remains false. No image, environment, flag or runtime acceptance was changed.

The final runbook SHA-256 is `94ea6a414d822bfafc44d9f62a2a66863196134e5b3da200f4d387709be876ef`. Markdown formatting, all relative links against integrated root and all seven referenced npm command names pass. The baseline runbook already had formatting drift; only this allocated document was formatted. Before/after prose density was low, suspicious Unicode count was zero and deterministic cleaning made no changes. No application tests, browser, provider, database, Docker or build/probe operation ran for this review/documentation slice. Runbook commands were inspected against source, not executed.

### Observed Buildx probe-contract correction

Root reports that the first actual probe failed closed before RUN, with no timed marker or cancellation proof. The source policy denied the actual local OCI identifier, the private record used `Target: default`, and the qualified history argument did not retrieve the record. Root independently obtained terminal failed status using its exact suffix ID and builder. That failed attempt, log, terminal observation and separate harness diagnostic remain preserved; none is relabelled as a cancellation pass.

Read-only review compared only the observed-contract controller delta against root's original `6f6c84ae56d9919146aba3af744350ee90a0e665e1ba5a46d8d0a729146d84b3` / tests `49af98f97d5f53da279ff862af64ed79f0f0055b8ea93051344bfbab06ce4b58`. Source review passes at the replacement controller `0eca31f69365964472513f2418eb0408be1ee1bb4c1eb4a48adbb371027800cd`, tests `a79997a9b587a13e046cf4fd4048891263cee59813a39778e9845df329305622` and runtime handoff `c79006d8ff23d11e5c1f61e98607afb8cbe71432390ea6d398b1a0eec57b0a37`.

The deny-all rule remains first; the only later allows are exact owned local context/Dockerfile identifiers and the exact `oci-layout` scheme, `probe-base` alias and selected digest. The Docker registry/image scheme, other aliases/digests and remote sources remain denied. This exact OCI alias is registered from the reviewed local layout; its hostname-like label is not a remote-source allow. The private owned reference admits only omitted/empty or observed default Target. CLI history now receives the validated suffix ID and explicit default builder, then requires the returned short Ref, exact owned Context and expected Dockerfile. The internally qualified reference is retained for private ownership binding.

Timed-marker detection, delivered-signal accounting and separate client-group/daemon outcome fences are unchanged. The added metadata fixture explicitly keeps markerless failed history from passing. Runtime reports four reproduced metadata/log regressions and 23/23 focused pure passes; the reviewer inspected source/tests and ran no tests, Docker, build, provider, database, browser or new tooling. No new runtime proof follows. The heavy compiler wrapper's corresponding observed-contract delta awaits its separate freeze/review.

### Heavy-wrapper observed-contract terminal delta

The corresponding heavy-wrapper delta passes read-only source review against root baseline wrapper `6d9dd42d3636052b960b30683c8f07a2587577ffc691269a555c7c94de97be17` and tests `92a8774ac89509b22c4208c61069fb18c98316240cc9a58998c645e0cec00b5e`. Released runtime source is wrapper `93443ba095ebe8717a30978c09e1fe66a23e71af342d5f55499f8e47dcf5c292`, tests `4ffd367e2c8ffd59377f9c46414583f5cb403fa31f2f5c7c470f24a0710dfe70` and runtime-assets handoff `fdd7ac01f948f9b2cd24612e91f9a66c563453543728ba1857f2abaa9e596080`.

The private reader now accepts only omitted/empty/default Target and treats an empty pre-ref directory as not yet bound. It still requires the single owned context/Dockerfile-bound record and retains the validated qualified reference internally. History CLI receives only its exact suffix with explicit default builder/private configuration/local endpoint. Returned short Ref, exact owned Context, Dockerfile and terminal timestamp are checked before status is used. Wrong targets, qualified/wrong returned IDs, foreign contexts/files and relative-history offsets remain refused.

The diff does not change lifecycle timeout/log/disk bounds, original PID-identity signaling, unknown-daemon classification, image metadata identity, source pins, native checks or E-010 disposition. The actual first markerless failed probe remains nonproof. Runtime reports the default-target/history-argument reds, 71/71 build-input passes and 115/115 combined controller/R13/build-input passes, with scoped lint/format/types. The reviewer inspected only this source/test delta and ran no tests or runtime/external operation. Changed compiler bindings require fresh root source/resource preparation; no old packet, new cancellation proof, heavy build or compiler acceptance is authorized by this terminal source review.

## A02: derived evidence-target source review

Independent read-only review passes for the bounded derived DTO in the backend worktree:

| File                                  | SHA-256                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/evidence-targets.ts`  | `f6c7295a75ce6f88b9891508a945e72660e338a4f9127548ad0085fc2dfad0b8` |
| `app/lib/server/evidence-review.ts`   | `1691fecbf1372e4d8c4428655eb6356425223e326d2e780b98abc2ba65527303` |
| `tests/unit/evidence-targets.test.ts` | `95f7c49ba6ca55014cac310a039831ed292c7ca541446870373052e6e4f809e2` |
| `tests/unit/evidence-review.test.ts`  | `b65040c4c6a6bd20c51600ef1b3aba13a630b2353cac4b4035b869d12e55e11b` |

The model matches the agreed A03 interface: `derived_review_only`, `scoringEligible: false`, complete owner/analysis/source/hash/attempt/schema/extractor binding and explicit null for an absent legacy extractor version. IDs include the target-model version and exact assertion/value/references. Every raw assertion, value, review state, uncalibrated confidence and citation remains present. Citation page/method comes from the replayed immutable span; page offsets add its code-point origin. The existing schema replays the source projection before derivation. The Unicode/reference preservation and deterministic/source-bound ID tests were inspected.

Contacts retain separate slots and multiplicity. Entry groups require unique canonical explicit labels and a single citation inside its matching segment on the same source span. They remain unverified candidates; mixed/repeated/unlabelled contexts and proximity-only associations stay unresolved. Native/OCR differences retain both observations without asserting they concern one entity. Raw aggregate conflict states survive in coverage. Unobserved source fields are not missing job qualifications.

The owned-analysis read precedes attempt access; immutable replay precedes correction-history validation; actor/revision validation precedes DTO derivation. The old correction schema/RPC and canonical behavior are unchanged. The added regression rejects using a derived target ID as authority for an existing confirmation write. No new write privilege, entity truth, candidate confirmation or correction materialization is supplied. A03/C02 still govern those later changes.

Backend reports 78 affected passing tests. This reviewer inspected source/tests only and ran no tests, browser, database, network, Docker or application service for A02. No concrete blocker was found for this bounded DTO; this review does not close correction propagation or a consumer workflow gate.

## A03: initial projection source review

Reviewed backend `app/lib/server/canonical-corrections.ts` at SHA-256 `3cfa8479431c04cfd51308523a36ccdcc3d979cf7bb45327ffedb13110bb0131` and `tests/unit/canonical-corrections.test.ts` at `0513965f530a28da6df96c537d301da12136aa6bb5912006b1f14696fd517bb4`. This is source/test inspection only; no application or runtime command ran.

The reviewed projection replays the immutable envelope, rederives A02 targets and checks supplied history actors/revisions and full expected source/head binding. It assigns exact source targets before per-target supersession. A newer unresolved event remains visible and blocks an older potentially affected target. Old attempts stay stale; optional unobserved fields require reviewed addition. Canonical mapping requires type plus the complete exact source reference set, or stable fact identity through a supplied gapless owned prefix to that source origin. No value-only or arbitrary-fact-ID fallback was found.

Candidate-authored values retain event/actor/revision/source provenance, empty supporting citations, unconfirmed state and null confirmation. Original citations remain separate context. Equal text remains provenance-only review; source-candidate confirmation grants no canonical confirmation. No persisted schema, correction command, importer or canonical object is changed by this pure module. The read model explicitly does not attest complete history; later current-revision/write admission remains separate.

Two corrections were pending at this initial review. Root/backend already own the reachable pre-meter canonical location/choice expansion: a valid zero-event snapshot can build a large index before the event work charge. The backend owns its meaningful regression and minimal pre-allocation budget fix; this reviewer will inspect its final delta rather than duplicate the test.

**A03-L01, supplied-prefix cycle:** the initial `canonicalData` checks unique supplied version IDs and adjacent child-to-parent links, but not a final supplied parent's back-edge. Individually schema-valid `V2(parent V1)` and `V1(parent V2)` therefore pass those checks, and a cleared current fact can map through the exact source origin in V1. This requires rejecting a known cycle among supplied records, not demanding an older root beyond the approved origin prefix. The source observation and proposed focused valid-schema regression were sent to root/backend; no test ran in this review. Final approval awaits the coordinator's disposition and corrected frozen inputs.

### A03 terminal correction review

Both holds pass terminal source review at final backend source SHA-256 `439c6f165f14fdccc388db6afae25455a7fd7c0954e99e885d42e09db9061bc9`, tests `d7da2e2baa9bb84ef25c1ca770eefe2998ad773c0afc594b76ad7d100e3d8357` and backend handoff `8f8b9e48019421953d40d0029ab5d154e0552e53cb58935461b73cfc8a8ec080`.

`admitCanonical` now counts canonical source references and contact/section/entry/bullet placements across supplied snapshots before schema cloning or location/choice index construction. That count seeds the same 20,000-reference budget used for expanded output. The meaningful zero-event regression first validates its canonical fixture, then requires rejection of more than 20,000 placements before projection. This is a fail-closed work bound, not a product-history limit or truncation policy.

The lineage check now indexes all supplied version IDs and rejects any known parent whose index points to the current or an earlier supplied child. This catches the explicit tail back-edge while permitting an unknown older parent after the required gapless source-origin prefix. The new regression confirms both individual documents are schema-valid before requiring the projection's lineage rejection. Direct-current citation mapping and valid partial-origin recovery positives remain present; no accepted authority/provenance/supersession rule changed.

Backend recorded the index case's original one-failure/55-pass red, then the known-cycle case's one-failure/56-pass red. Its final affected result is 123/123: 57 projection cases plus 66 existing consumers, with scoped formatting/lint/typing passes. This reviewer inspected the exact frozen source/tests and ran no application tests or services. Both initial findings remain above as history. The pure read projection is reviewed; actual correction propagation, persisted provenance/CAS, candidate-visible review/confirmation/export/undo and CV04 closure remain behind C02/A04 and their required tests.

### Overflow fixture evidence-tier qualification

Backend's subsequent C02 inspection found stronger constraints in the current SQL save path: each bullet must reference one fact and its text must equal that fact's value. The zero-event overflow fixture is valid under `CanonicalResumeDraftSchema`, but its four-fact bullets are not proved persistable through that SQL path. The regression therefore establishes excessive pre-meter expansion at the pure helper's schema boundary, not a reproduced persisted-record or current-user exploit. The fail-closed resource guard remains appropriate at that boundary; terminal source review stays PASS. No source/test change or new runtime claim follows from this qualification.

## C02: existing consumer-interface constraints

Read-only inspection covered root's `canonical-repository.ts`, `canonical-content.ts`, canonical route/schema, `artifact-contract.ts` and the latest `save_canonical_version` definition in `20261012160703_candidate_authoring_transactions.sql`, with the later producer-compatibility schema. The backend storage draft was not yet available at the start of this review; no storage design, command or UI DTO has been selected or approved by these notes.

Current import reads raw immutable evidence and SQL allows it only with a null head. Edit changes one existing fact, clears source citations/confirmation, marks it unconfirmed and synchronizes its singly linked bullet. Reusing these validators can support mapped corrections only if initial import, subsequent edits, target/application provenance and head changes occur in one database transaction with outer source/target/review/head CAS and exact idempotency. A corrected value cannot masquerade as the original cited import. Separate committed RPC calls do not provide that atomicity. Existing commands have no add operation, so `requires_add` needs an explicit reviewed path; it cannot silently become an edit or arbitrary import.

The consumer preview must show the exact employer/date source target, canonical location, current/proposed values and separate candidate provenance, retaining ambiguous choices until explicitly resolved. Apply needs authoritative current-history attestation under its transaction; A03's supplied contiguous-prefix disclaimer cannot authorize a write. If a separate assignment/application ledger is chosen, its concurrent mapping decisions also need binding so an unchanged correction revision cannot admit a stale target choice.

Canonical confirmation remains an explicit act against the exact current version/fact/value. The PDF/DOCX render contract blocks unconfirmed facts and binds the requested immutable version; historical artifacts must not be presented as newly corrected output. Existing rollback creates a new child restoring historical content. Any chosen application provenance must show that undo and avoid silently reapplying the same correction on replay, while preserving historical confirmation records as historical. No warning-only closure, citation inheritance or automatic canonical confirmation follows. These compatibility constraints were sent to root/backend for the forthcoming packet; this is not an implementation ACK. No services, database, network, browser, Docker or tests ran.

### C02 packet interface ACK

The first frozen proposal, `c02-storage-contract.md` at SHA-256 `59deeb351057f9c3459571d17961bbc75f66592028338d6bab9fe19dcbe6a944`, covered the consumer constraints above: one nested-validator SQL transaction for mapped facts, normalized operation/assignment/application provenance, full review/assignment/head binding, exact-result idempotency, explicit separate add leaf, visible historical/undo state, no silent reapply and exact-version confirmation/export/privacy joins.

One admission clarification was required: current `privacy.ts` inserts deletion requests directly. An enqueue could commit after apply's pending-deletion check without acquiring root/analysis locks; cleanup lock-order changes alone do not serialize that creation boundary. The revised proposal at `8777cce5de501844a5053ce00d1756e6c4e97cce8eaf594b5dd1617327bdc45d` explicitly includes a shared multi-resume enqueue/apply barrier or proved equivalent and forced enqueue/apply plus cleanup/apply interleavings before activation.

The revised packet receives **proposal-level interface ACK**. The exact owner-to-root-to-analysis serialization, authority RPC/direct-DML protocol, ledger DDL/serialization and complete snapshot/continuation interface remain concrete forward-packet review obligations before writes. No mechanism or storage schema was silently selected and no write-ready/DDL/hosted approval follows. The separate candidate-authored add operation and actual corrected consumer flow remain required; `requires_add` alone does not complete them. This review inspected the exact document/source contracts only and ran no tests or services.

### Captured-prefix reader and projection attestation

The independent read-completeness delta passes source review against the prior integrated reader/projection. Frozen backend bindings:

| File                                       | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `app/lib/server/evidence-review.ts`        | `d647226a09336a3740639af6db1fc7a64de4a6c9447d6ea7787ebc1b600323e8` |
| `tests/unit/evidence-review.test.ts`       | `0461233e179dec5f0ba34e572bd634621287141f1f6bd3740d3f7d98c9f207b1` |
| `app/lib/server/canonical-corrections.ts`  | `4561e4e49a7014eeacad5e01592b7c69fe6229160c5dae757cbab49ebe997099` |
| `tests/unit/canonical-corrections.test.ts` | `07bfb8cb78627f3afec7478c5d4cc5c4a7d4c98bf51f49b852f5e780dc68f774` |
| Backend handoff                            | `42124f54587750007514bc31ea7e870ce1ef5f23206cfd87b9e6ba399bbd859c` |

The reader first checks owned analysis and replays the source attempt. It captures an owner/analysis-scoped descending high-water event H/id once, then requests ascending keyset pages through H. Advancement uses actual received rows, which equal the checked contiguous revision, not the requested page size. Every page checks exact revision/expected revision, owner/actor/analysis, schema and unique IDs; final data must equal the captured head. Appends after H are excluded. Empty/missing, malformed, foreign, duplicate, out-of-prefix, failed and over-budget reads cannot produce a supposedly complete DTO. No configured project's row cap was inspected or diagnosed.

The read limit is 1,000 events, 32 pages and 2,000,000 value text units, with explicit unavailable/continuation state instead of truncation. A shared five-second read AbortSignal, combined with caller cancellation when supplied, reaches ownership/attempt/head/page queries. The installed PostgREST method mutates its builder's signal as used here. Existing query/schema failure messages remain bounded; already-aborted reads dispatch nothing. These are source and injected-query checks, not a hosted transport or absolute OS timing guarantee.

The loader emits versioned `evidence-review-history/1.0.0` metadata bound to owner/analysis/source/hash/attempt/evidence/extractor/target model, captured head revision/id, count and pages. Projection version `canonical-corrections/1.0.1` validates present metadata strictly against rederived source/history before reporting `complete_captured_prefix`. Tampered or dropped-suffix metadata rejects; absent legacy metadata remains an explicitly unattested preview. Its authority stays `review_projection_only`, materialized/scoring flags stay false and no canonical confirmation is granted.

Backend reports the capped-response regression and 185/185 affected passing tests. The reviewer inspected only the frozen source/test delta and ran no tests, services, DB, provider, browser or Docker operation. Compiler-bound sources were untouched during the coordinator's build. A complete captured prefix is not the latest head at return and cannot replace apply-time ownership/review/assignment/canonical-head CAS. Full storage/materialization, larger-history continuation, tenant/runtime and customer-flow acceptance remain separate.

## U05: bounded browser selector follow-up

Read-only search found one stale executable selector: `e2e/native-layout.spec.ts:308` expected `Rewrite with evidence`. The component now renders an H2 named `Review writing drafts`. Root allocated this locator-only follow-up. The locator now uses that name with `exact: true` and `level: 2`.

Preserve the surrounding business assertions at lines 279–325: the empty state and feedback navigation, retained draft visibility, Copy availability, explicit AI consent, disabled-provider error and retained draft after the failed request. `Generate suggestions`, `Copy`, the Rewrite tab, `#rewrite` and `No rewrite was saved` remain unchanged. No other stale old heading/status selector was found in `e2e` or the owned consumer drivers. The new component tests deliberately assert that the old grounding guarantee is absent; those assertions should remain. Historical browser reports must retain the labels they actually observed.

The worktree file matched root before editing: SHA-256 `e5623c1db0284adcfb0e5c0db6b511ceaccd8aaf6350ee7527aaf802ba46cb7b`. Replacing only the new locator expression with its old expression reproduces every byte of that root baseline. The stale locator is source-confirmed, not an executed browser red. No browser, service or fixture operation ran. This updates test compatibility with the reviewed copy; it does not close the full U05/CV03 factual-support gate. Root will run the actual browser case on the integrated candidate under its separate allocation.

Final selector-file SHA-256: `300665cce087975ce3038b62573c4b8b778713a38da426a926927e8df7288583`. Scoped Node 22 Prettier, ESLint and `git diff --check` passed. The byte comparison confirmed that only the locator expression changed. The separate prose check found no suspicious Unicode; the deterministic cleaning pass made no changes. The stylometry density tier was low, so the prose was preserved. No application test or browser pass is claimed by these static checks.

## R16/R17: managed admission source review

Read-only review of the runtime worktree's five-file row-1 candidate, compared with the integrated browser guard. No test, provider, DB, Docker, browser, GitHub, service or child process was run by this reviewer. Runtime reports 95 passing pure cases across the two guard files and unchanged private-verification suite, with the initial 10, seven and two negative regressions retained. Those are author-reported results, not independently executed evidence. The parent reports the compiler build and verify04 completed separately; neither result is supplied by this guard review.

Frozen source bindings:

| File                                   | SHA-256                                                          |
| -------------------------------------- | ---------------------------------------------------------------- |
| scripts/browser-test-target.ts         | 4c9dd70c51bd5ad7fc81314be31a3585938e89b9f718d0e1ba20d9cc3eaf4e40 |
| scripts/managed-test-target.ts         | 0f9507eb1e8723b6c437ee186ce7cdc57e3c0aad0ee3418a62efbedb184f2d35 |
| tests/unit/browser-test-target.test.ts | 481c241d7135714a01cb793f5a9ab9de8105649f81918e57e7b5cbbf73c4da9b |
| tests/unit/managed-test-target.test.ts | a99f81ed4718b3b4fcb6276482128540f63da1789614d4807a96ba74b1097812 |
| runtime-ci-plan.md                     | 6ff3ecbbcda1160bb65faf9c67d6b0fc47a67ef5a3f8e00473110636b2c74089 |

The managed URL check admits only an exactly spelled root HTTPS Supabase API URL, with an optional explicit default 443 port/slash and matching request/environment declarations. It rejects user info, alternate ports, paths, even empty query/fragment delimiters, normalized child paths and suffix-host lookalikes. Purpose/run/authorization/capability fields are explicit; only owned-fixtures is implemented. Declared isolation cannot admit global queues, native SQL or restore. Existing local browser behavior is preserved as a legacy branch and remains ineligible for this owner's DB testing.

The new guard inspects its supplied environment argument, requires disabled AI/private verification and the non-live sentinel/official endpoint, and refuses contradictory target/acknowledgment declarations, unexpected OpenAI context/log/model/limit values, proxy/Node/dotenv injection and legacy DB connection declarations. It does not construct the child environment or prove a runner uses it. Its immutable public return deliberately labels the result configuration-and-local-ledger-only, without authentication, isolation, cached-app, network or cleanup proof. Actual runners still need the reviewed operation packet and exact supplied child environment.

Ledger admission checks an owned nonsymlink 0700 run directory and owned single-link regular 0600 file. File open uses NOFOLLOW/NONBLOCK, checks before/opened/after device/inode identity and rejects special, substituted, public, foreign and hardlinked files. Append uses the checked descriptor, detects a short write, syncs that descriptor and closes it. These checks do not establish mutation intent journaling, crash reconciliation, complete deletion or freshness; those remain the later fixture-journal/recovery leaf. No broad cleanup, directory sweep or DB operation is introduced here.

**Finding R16-F01: the purported compatible browser environment cannot pass both guards.** The managed guard requires ledgerPath=/tmp/resumide-managed-&lt;runId&gt;/fixtures.jsonl (lines 167–168) and requires any BROWSER_TEST_LEDGER to equal it (184–188). The browser guard accepts only /tmp/resumide-auth-audit-*.jsonl (line 25). Its existing browser/canonical fixture factories call that guard before creating a user. Thus no one ledger configuration can satisfy both guards when composed. The positive named "retains compatible exact browser declarations" calls only the managed guard and does not expose this disagreement. This is a fail-closed compatibility defect, not an observed unauthorized mutation or provider call.

The coordinator was notified before any implementation. Require one pure composition regression using the same supplied environment and both guards, then either a narrowly reviewed secure managed-ledger browser branch or an explicit separate/future-only contract that removes the composition claim. Preserve the existing legacy path and its private ledger tests. This review does not select a new path/admission policy or edit either guard. Other inspected row-1 checks match their scoped source contract; the compatibility disposition remains open pending the coordinator's decision and any corrective source freeze.

### R16-F01 terminal correction review

The coordinator accepted R16-F01 and assigned its same-five-file correction. Replacement bindings independently matched:

| File                                   | SHA-256                                                          |
| -------------------------------------- | ---------------------------------------------------------------- |
| scripts/browser-test-target.ts         | d778b68589a9366564eac2f3faedbd1ef7e35c5628ee63e214eef460c62130a0 |
| scripts/managed-test-target.ts         | be04eefb20fdbd05f23921597c2f035ba4bd9eb2204a22abb27177c42067cb5a |
| tests/unit/browser-test-target.test.ts | 481c241d7135714a01cb793f5a9ab9de8105649f81918e57e7b5cbbf73c4da9b |
| tests/unit/managed-test-target.test.ts | d97047606ba618ee0201f83c18ab6a64e9e90b6488bdbfe99aaed0ea6f5eae6e |
| runtime-ci-plan.md                     | 12abc55fa264b448de2e6f1c55a1a4cf2befd856ce4bb0b93030dbb15706c729 |

**Terminal source disposition: PASS for R16-F01's two-guard composition boundary.** The nested primary journal remains required. Any browser URL/authorization/ledger declaration now requires the full exact bundle and a distinct private flat /tmp/resumide-auth-audit-managed-&lt;sameRunId&gt;.jsonl ledger. The shared file checks validate it separately. Both returned ledger paths are explicit in a separately frozen ledgerBindings object, not silently conflated or granted cleanup authority. Cross-run paths, the nested primary as browser fallback, missing acknowledgment, public files and symlinks remain rejected.

The browser guard's only corrective delta is its explicit .ts module extension for native Node loading; its legacy local branch, flat-path protocol and security checks remain intact. Its unit-test file is byte-identical to the initial reviewed freeze. The new composition positive imports both real guards into one standalone Node child, calls the browser guard before and after managed admission using the same actual child process environment, and checks the frozen returned bindings. The subprocess has a 1500 ms deadline and 16 KiB output bound. This is not a positive that calls only the new guard.

Runtime reports four relevant red cases before the correction and 98 passing final cases with focused lint/type/format checks. The reviewer inspected the frozen source/test delta without executing tests, subprocesses or services. No further concrete ledger issue was found within local configuration/metadata admission. Full private Playwright/AA7 receipt/evidence-directory/runner wiring, transport use of the supplied environment, mutation-intent journaling, crash reconciliation and actual cleanup remain later row-2/row-7 obligations. No authentication, target isolation, global queue/native SQL/restore permission, hosted mutation or completed R16/R17 gate follows from this source PASS.

## A07-S01: opt-in local alias discovery review

Reviewed the five-file backend candidate as source only. No test, provider, DB, browser, Docker, service or application execution ran. Frozen bindings:

| File                                | SHA-256                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| app/lib/server/job-requirements.ts  | aecd3109508163b25b957e35776dba17e016e04555c0b3cc7fd54ca316da9606 |
| app/lib/server/job-aliases.ts       | 762babce05d5678cd7757326c3c98e776918b2479d60f4a5680ddd00df3f49f2 |
| tests/unit/job-requirements.test.ts | d2f5929b6372b686164fff99b29337a7368a596029e10e0ef3a6b7bb19e3aaff |
| tests/unit/job-aliases.test.ts      | 449bad095c3906a98d5b64828994f8f5f00aa8bcfa735a6323ad8d69cba4e1d9 |
| backend.md                          | 4bbb6171656fb60dc4713b4f60aa5657b918b0532cad9c2f706b9ee148dfce43 |

Independent byte comparison confirmed that removing only the new alias import restores the original schema/parser/vocabulary/helper prefix exactly to root SHA256 21d541ee26daca3f9159a7ac1fe140a3f1617b8bab7dc3f275d113e3c01cb20a. The original test bodies remain, with added imports and appended local-model tests. The application repository still calls the default parser; search found no application writer, reader or scorer adopting the new function or prospective groups. The strict old schema does not admit its different schema/model/extra fields or missing stored producer label. Default CV06 alias misses therefore remain unchanged rather than silently closed.

The explicit local model copies validated source/owner/org/analysis/job/hash/context metadata, keeps raw clause/value quotations, and attaches token quotations separately from normalized concepts. The only equivalent pairs are JS/JavaScript and Postgres/PostgreSQL; Java, SQL and other engineering vocabulary remain unnormalized by this local lexicon. Alias and canonical observations keep separate source records, with shared prospective credit identity rather than numeric credit. Policy and boundary identity are included in the lexicon hash; externalTaxonomy is null, confidence remains uncalibrated and authority is local_review_only with persistable/scoringEligible false.

Code-point span conversion accounts for astral characters and combining marks. Dotted Node.js/file.js/JS.config and dotted astral-letter fragments are excluded; old qualified canonical observations remain visible without mapping if they lack an eligible local token. Required/preferred/conflicting and negated clauses retain their original review status. Unknown explicit/conflicting clauses and residual text beside recognized vocabulary remain exact-spanned review records. No new proficiency, duration, OR evaluation, score, canonical fact or accepted taxonomy is inferred. Existing source/item bounds and new token/mention/clause bounds reject rather than silently truncate.

**Finding A07-F01: dollar-bearing identifiers are promoted into concepts.** The local token boundary at job-aliases.ts:78 excludes letters/numbers/marks/underscore but omits dollar signs. Consequently `$JS`, `JS$`, `$JavaScript` and `JavaScript$` are eligible language mentions even though dollar is a valid Java/JavaScript identifier character. The same character is absent from the following-dotted-identifier check at line 88. In `$JavaScript required`, the frozen parser's raw fragment can therefore gain an exact local concept mapping instead of remaining an unmapped observation. Current identifier negatives cover underscores, letters, digits, marks and dots but not this case. This is a new local mapping-policy defect, not a default parser change or observed persisted/scored result.

The coordinator received the finding with a bounded proposed regression: dollar-bearing fragments plus an ordinary standalone positive, then a minimal consistent token/dotted-identifier boundary correction. The reviewer did not execute it or edit backend files. All other inspected authority/source/default-admission invariants match the scoped candidate; terminal alias-policy approval waits for the corrective disposition.

Backend reports 106 affected passing cases and an unchanged default-parser synthetic benchmark with engineering true, release false, mapping quality unmeasured and zero provider calls. These are author results only. No default parser adoption, producer/schema/SQL/flag activation or compiler-bound input change is part of this candidate. Full A07/A08/A09 relation/storage/scorer integration, representative mapping accuracy and current consumer CV06 repair remain later gates.

### A07-F01 terminal correction review

The replacement five-file freeze matched these SHA-256 values:

| File                                | SHA-256                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| app/lib/server/job-requirements.ts  | aecd3109508163b25b957e35776dba17e016e04555c0b3cc7fd54ca316da9606 |
| app/lib/server/job-aliases.ts       | 6b00cee1969c4680296277c5ff2905184df53c89d6604a0e56e1a6d66d45b73a |
| tests/unit/job-requirements.test.ts | 3aae94906be165597633c0f31827e4ea8a9a0b006cbfd84cc242ddb64631702e |
| tests/unit/job-aliases.test.ts      | cab591e8e58b913691fd0df33a85acef2da896e44022fcaad798760908d1f2bf |
| backend.md                          | 1b9ef618e5be352d9d2d11524cb353e5c1d9172c52c9dc161c06625eb2ba7c35 |

**A07-F01 source disposition: PASS.** The alias implementation changes only its boundary identity to unicode-identifier-and-dot/1.0.1 and adds dollar signs to both immediate token classes and the dotted-following identifier class. This changes the policy digest without introducing another equivalent or scoring credit. Six scanner negatives now cover dollar-prefixed/suffixed and dotted-dollar fragments; two downstream negatives retain legacy canonical fragments as unmapped with no local token. The standalone positive retains all four intended literals. The entire requirement source is byte-identical to the initial freeze, so its default parser/admission remains untouched.

Backend records eight relevant red cases with 56 passes, then 64 focused and 115 affected passing tests plus scoped type/lint/format checks. The reviewer inspected source and assertions only and ran none of those tests. This resolves the local boundary finding without closing default CV06 behavior, local-policy accuracy, storage/scorer adoption or A07/A08/A09 acceptance.

## R14: prepared private functional-runner review

The coordinator requested read-only review before allocating one synthetic local run on compiler image sha256:5e5c2436bcac0a97c4616d7392d1089ecf7ef7d6d5df9063c02e4498d1e0d431. No runner, Docker, test, child process, provider, DB, browser or service was executed by this reviewer. The initial private packet at /private/tmp/resumide-latex-functional-20261109-runtime matched:

| Artifact                    | SHA-256                                                          |
| --------------------------- | ---------------------------------------------------------------- |
| operation.json              | f1dd90ea2d9ded116c21e57fec05a4c4e12defcf666d54fdb24fa0acfdb0d1a8 |
| runner.mjs                  | 9dd3e83049acc0dfe5a5a3a6893de0add05db18832ac5e50b18bd0a1bc2cf0f6 |
| bin/docker                  | f2b67860ec59e68d62f78ff2b6127f6bc0f8af478cefb9216d2ea5d0ea82bf10 |
| licenses.ts                 | 3be528ea064f49bf1c52f7d42855c1b3d347b086fbfff6c3a80c093a8800e922 |
| runtime-image-validation.md | 9170e1d3ce442cf13b54aabed4b484b1ada91a4c191e116c785d8db79d83da52 |

Independent read-only hashing matched all 77 declared source inputs. At inspection, allocation/attempt files were absent and the exact creation journal was empty. The prepared runner needs a reviewed allocation hash and exact runner/shim/license bindings before its exclusive attempt marker. It supplies fixed commands and an environment whitelist with original HOME unchanged, private empty Docker/npm configuration and no provider/DB credentials. It pins Docker/Node/Python/npm hashes, the exact Unix endpoint and immutable image; root independently reported its read-only socket/image/zero-converter preflight, not a functional pass.

The fixed five stages reuse existing source, sandbox, profile, rollback and license checks. Their 30 MiB stage log allocation is below the 32 MiB aggregate cap; kernel file-size limits accompany stage timers/disk/log monitoring. The proposed total is 1,200 seconds with 60 seconds reserved for cleanup and unchanged initial 12 GiB/abort 8 GiB admission. The actual settlement defect below prevents acceptance of that total bound in the initial source.

The Docker shim forces the private config and Unix endpoint even when an existing helper drops Docker environment variables. Its exact create prefix preserves no pull, nonroot/read-only/no-network/no-host-mount/capability/CPU/memory/PID/file/log/tmpfs limits, and allows only the existing Python/confine entrypoint overrides. It journals an absent-name/run/image creation intent under lock and fsync before exec, without recording stdin/forwarded arguments. Later mutations require journal-bound names or resolved full IDs with matching image/policy labels. Pull/build/tag/prune and unrelated mutation verbs are not admitted. Existing create, context/image inspect, start, cancel and removal calls otherwise match this command grammar.

**Finding R14-F01: unknown client identity can defeat total settlement.** Runner lines 281–282 react to missing startIdentity by calling stop. The unchanged shared runCommand then refuses signals if its original ps identity is missing/changed, records manual-cleanup-required and awaits the child close event without a deadline. Its stop handler becomes one-shot after abortRequested. A still-running child with failed identity capture can therefore keep the private runner awaiting indefinitely after its stage/overall timers fire. Identity-safe refusal is correct; unbounded settlement is not. Root accepted a private-runner-only correction for independently bounded settlement, persistent unknown lifecycle/quarantine, no later stages or destructive cleanup, and bounded explicit parent exit when active handles prevent ordinary exit. The shared helper must remain unchanged. A narrow injected missing-identity/nonsettling check is required before allocation; no such check was run by this reviewer.

**Finding R14-F02: the actual pause check supplies a short Docker ID.** The existing sandbox verifier's runningConverters calls docker ps -q without --no-trunc and returns the short IDs. Its paused-worker case passes one to docker pause. Initial shim owned(ref) line 76 accepts only generated exact names or 64-hex IDs, so it refuses that real check before timeout/cleanup behavior executes. Root received the finding for the same corrective batch. Preserve exact ownership by using real no-trunc read dispatch or resolving to the exact owned full ID/image/labels; accepting arbitrary short prefixes without that proof is insufficient.

The initial runner remains unaccepted for execution pending both corrective dispositions. No new harness framework, project source change, compiler input change, allocation, retry, scan or current-image advisory/functional/release acceptance is implied. Actual runtime/PDF/confinement/cleanup evidence can follow only the separately reviewed bounded run; current advisories remain unknown.

### R14-F01/F02 terminal correction review

Reviewed only the private settlement/full-ID fixes and changed artifact admission. Corrected bindings:

| Artifact                    | SHA-256                                                          |
| --------------------------- | ---------------------------------------------------------------- |
| operation.json, unchanged   | f1dd90ea2d9ded116c21e57fec05a4c4e12defcf666d54fdb24fa0acfdb0d1a8 |
| runner.mjs                  | e99bcda279ab8babc06d5e6ac9be41116ad6444478d4ed5451025f232cc07172 |
| bin/docker                  | 2bb1913548b7f2acd45e89166d31b5dc10affcb9f417c89cd59b0353e0f85cfa |
| settlement.mjs              | 130e96f00fd10cf3de7153f1a99faea050f5af6e9f5090324ae0e8fb9ff4e304 |
| licenses.ts, unchanged      | 3be528ea064f49bf1c52f7d42855c1b3d347b086fbfff6c3a80c093a8800e922 |
| settlement.test.mjs         | 1d997a8a4ed32329d5b0c369a2ddc208aa68d6e2b9c9e2d21452c4c2a905a732 |
| shim-contract.test.py       | f517e77ef1980fd4d2c79d4367133900e4c2ed0418f7fa5d9babbfee50f583c7 |
| runtime-image-validation.md | fe0468d0c81419c5497df816866a434d692951458cbc99686e3ea4d1a621a2d0 |

**R14-F01 source disposition: PASS.** The separate task-private helper bounds lifecycle settlement at the earlier of the stage deadline and remaining overall budget before cleanup reserve, with a 12-second grace. Missing initial identity requests the existing guarded stop immediately, then becomes unknown if the close observation does not settle; it cannot turn into a successful owned lifecycle. A pending lifecycle with a known initial identity likewise becomes unknown at the deadline plus grace. The helper neither signals PIDs itself nor relaxes the original identity guard.

The runner consumes that unknown state by persisting a quarantine reason, cleanupAllowed false and laterStagesAllowed false, retaining unconfirmed groups, and leaving the stage loop. It skips destructive resource cleanup, retains read-only namespace observation and writes the terminal outcome synchronously before an explicit exit 1 when unresolved child handles would prevent ordinary exit. The shared ROOT runCommand implementation is unchanged. This fixes bounded parent settlement while explicitly preserving unknown child/daemon ownership; it does not prove those resources stopped or grant permission to kill an identity that could not be confirmed.

**R14-F02 source disposition: PASS.** The shim adds real --no-trunc dispatch to its existing converter-filtered ps allowlist. The existing sandbox helper therefore receives full Docker IDs for its pause test. Exact-name/full-64-ID ownership, image/policy checks and mutation grammar remain unchanged; arbitrary short prefixes are still refused. The injected shim test verifies the real binary/config/host argv contains --no-trunc, then verifies a matching journal-owned full-ID pause and refusal of a short prefix before Docker observation.

Allocation now requires exactly four source artifacts, adding settlement.mjs to runner/shim/license bindings. Initial admission and each integrity pass check all four hashes. The fixed operation packet, command list, image, resource floors/caps, environment, original HOME and creation journal protocol are unchanged. At the review read, allocation/attempt files were absent and the journal remained empty. No actual run was allocated or executed by this reviewer.

Runtime reports three offline fake-clock lifecycle cases and two injected shim cases passing, with the earlier ps contract red preserved. The reviewer inspected those test bodies and corrected source, without running tests, subprocesses, Docker or services. This is terminal source approval for the two concrete fixes and four-artifact admission only. It does not supply actual compile/PDF/confinement/cleanup/cancellation behavior, browser acceptance, current-image advisory evidence or release approval. Root retains allocation and execution authority for the one bounded local synthetic run.
