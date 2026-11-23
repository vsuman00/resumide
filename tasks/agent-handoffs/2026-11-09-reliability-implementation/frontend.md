# Reliability implementation: frontend

Updated 2026-11-09, Asia/Kolkata. Initial coordinator assignment: CR-C00 documentation, then a proposed CR-A03 UI interface/red-test packet. Detached worktree reliability-20261109-frontend/resume_ats at a0b239299d75b0bd64b588fe743ebe2975fb28b9 contains the explicit 1,999-input dirty-root snapshot plus separately recorded owned changes. Root CONTEXT/coordinator are authoritative. No .env or owner PDF was copied. Preserve all prior dirty work; current allocation is the bounded privacy UI/test slice below, with no service/hosted/provider/runtime operation.

Current slice: **CR-R19 privacy download UI**, reflecting visible deletion history. Current owned scope is app/routes/privacy.tsx, new tests/components/Privacy.test.tsx and this handoff only. CR-C00/CR-R01/CR-U05/interface records below preserve earlier evidence; their source files remain released and unchanged.

## CR-R19: completed-export links reflect visible deletion history

Status: implemented and verified at focused component/static tier; root review/integration pending. This slice does not close full CR-R19/CR-U17, actual hosted privacy enforcement, complete-history reads, deletion serialization or account erasure. The integrated download API remains authoritative for all owned requests, including deletion rows outside the page's capped 20-row history.

The route and handoff matched root before edits: app/routes/privacy.tsx SHA256 8f72f592ab17156b7cbdd95be246ba35f53acf203c09f183ace19c779e83fbe3; frontend.md d9f36b532816be4379d5b07428897b6381114131852bfe6c4e35481752fb7723. The pre-existing dirty route content is preserved. A root/candidate comparison has exactly three UI hunks; all bytes before the Privacy component, including its loader, action, server imports and headers, remain identical.

If the loader-visible history includes a deletion with status other than failed, the component hides completed-export download links and announces: "Export downloads are unavailable because an account deletion request is on record." This follows the existing API policy for queued, processing, completed and cancelled deletions. It does not describe a cancelled request as pending or claim data was erased. Normal completed exports and those accompanied only by a failed deletion keep their existing browser-handled attachment links. History rows/statuses, queued cancellation forms, export/deletion forms, dialog behavior, consent section and layout/tokens are unchanged. Availability is recomputed from loader data after revalidation; no loader query, admission policy, mutation, DTO, dependency or account-level client authorization was added.

### Red, green and scope

1. Before changing the component, npm test -- tests/components/Privacy.test.tsx tests/components/PrivacyRepairs.test.tsx failed with **five failed/four passed**. Four parameter cases reproduced stale links for each allowed nonfailed deletion status, and the revalidation case reproduced the stale link after a deletion appeared. Existing two repair cases and new failed-deletion/normal-cap controls passed. Receipt: /private/tmp/resumide-r19-privacy-ui-red.log.
2. After the three-hunk UI change, the same command passed **nine tests in two files**: seven new component cases plus both unchanged PrivacyRepairs tests. The final formatted candidate was checked with the same focused command. Receipts retain the initial green and final check separately: /private/tmp/resumide-r19-privacy-ui-green.log and /private/tmp/resumide-r19-privacy-ui-final.log.
3. The cases use the real component and React Router memory-loader/revalidation path. They cover all four nonfailed deletion states, failed-deletion downloads, pending-export exclusion, normal downloads with 20 visible rows, unchanged request/cancel controls and withdrawal/restoration as loader-visible deletion status changes. Auth/database factories throw if invoked by the new renderer cases. Fixture metadata is synthetic; no resume/JD, account secret or provider payload is involved.
4. Node.js 22.23.4, RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic and AI_ENABLED=false keep dotenv disabled. npm run typecheck passed (React Router typegen + TypeScript); scoped ESLint and Prettier pass. The clean-user-facing-text and whitespace checks apply only to owned prose/source. No browser, server, Supabase, provider, Docker, build or compiler input was changed or operated. Root owns the next integrated web/worker verification and any later runtime allocation.

Final source/test bindings:

| File                              | SHA256                                                           |
| --------------------------------- | ---------------------------------------------------------------- |
| app/routes/privacy.tsx            | 172824d73acc770d1ba3c0796bfc55a50ba5a5939611b246fffcd38ddc3a178f |
| tests/components/Privacy.test.tsx | 3aa18013e1e1e3d824650874ce6f97ca9bff94d432328aa2b551c63bea735fbe |

The client has no proof that its capped list contains every deletion. A visible permitted download remains subject to the API's complete owner-scoped checks; no "no deletion exists" claim is made. Component evidence does not establish atomic enqueue/response ordering, hosted tenant policy, actual file delivery or full data deletion. Roll back only these three UI hunks and the newly allocated test file if needed, preserving the copied dirty baseline and all earlier receipts. No deployment, Git staging, commit or publication is authorized.

## CR-C00 candidate

Exclusive files are this handoff, [SUPPORTED_CAPABILITIES.md](../../../docs/design/SUPPORTED_CAPABILITIES.md), and the additive [product-spec clarification](../../../docs/ATS_SCORING_AND_AUTHORING_SPEC.md#current-capability-and-repair-contract). Root owns canonical plans/checklists/index/CONTEXT and integration. The initial product spec matched root SHA256 eb5e4f67d157ccd73863cafb48a62c08ccb111f807700767aa950aa5b3c96315. The only intended spec change is the new link/clarification before section 1; existing objectives, decisions, labels, floors and history remain byte-identical.

The capability contract freezes current PDF-only consumer input, canonical PDF/DOCX output and authenticated standalone LaTeX-to-PDF Build. It separates advertised surfaces, measured engineering evidence and required positive repair targets. The approved first evaluation domain remains software engineering and the segment English / India-focused; release support still requires the existing segment gates. Native/scanned/mixed support, real grounded AI, corrected import/confirmation/export and the actual compiler remain repair targets; an unsupported state, warning-only fix or hidden button cannot close them. All services remain free of commercial charges; technical limits and deployment/publication hold remain. Default-off flags, default uncalibrated review, immutable evidence, candidate-authored provenance, score withholding and separate G01/G02/G03 evidence are explicit. No threshold or failed receipt was changed or waived.

CR-C00 acceptance is documentation/contract review only, pending root review/integration. It does not close CV01-CV08 or establish repaired/live/release behavior. No application, test, configuration, dependency, migration, DB, Docker, provider call, credential, service, build or Git publication change was performed. Document checks and final hashes are returned with this handoff; root records canonical completion after review.

## CR-A03: proposed UI projection contract, not implementation

Backend CR-A02 grouping and reviewed CR-A03 provenance/command semantics precede behavior. CR-C02 must settle compatibility/admission before new persisted fields. This packet introduces no DTO/type/schema/RPC or UI code. A source citation is evidence of an original assertion, never a replacement citation for candidate-authored text.

The server should produce a private owner-bound projection with a binding containing analysis/source version/source SHA256, evidence attempt, target-model/producer version, correction revision and expected canonical head (nullable before import). Each item identifies a stable entity/assertion/slot target; displays the original candidate and current canonical value separately; and provides the latest applicable correction event/revision, proposed value, candidate-authored provenance reference, exact canonical target if known, and resolution mapped/ambiguous/requires_add/stale. Every corrected imported fact requires a separate canonical confirmation. Display indices, field labels and browser hashes are not authority.

For ambiguity, the server supplies permitted target choices bound to that projection. The candidate must choose the intended entry; a correction to an employer cannot overwrite every employer. If no fact exists, the candidate chooses an explicit reviewed add/clarification operation and entity location; do not drop the correction or pretend it came from a native citation. Historical or source-mismatched corrections remain readable but cannot silently retarget current content.

An apply command should contain the exact projection binding, selected correction/target IDs and explicit mapping/add choices, expected canonical head, operation and idempotency key. The server authenticates current ownership/membership/consent/deletion scope, reloads authoritative records, derives values/provenance itself, validates exact target/source/revision compatibility and performs the CAS child transaction. A client-submitted proposed value or projection snapshot cannot authorize a write. Manual value edits remain explicit candidate-authored operations. Replays resolve the original identical operation; conflicting payloads or stale revisions keep the draft and require review rather than silent retarget/retry. Existing manual edits need a diff and explicit selection. Undo/restore appends a child; confirmation does not survive changed content or clear extraction calibration.

### Concrete server gaps for coordinator/backend agreement

1. The existing evidence review is flat by critical field; its correction ledger returns separately from the immutable envelope. Stable contact/entity/slot IDs and a target-model version are not yet in the consumer read contract. CR-A02/CR-A03 must define them; frontend cannot invent stable IDs from row order.
2. Existing correct operations have no assertion candidate ID, so older field-wide corrections may be ambiguous across employment/education entries. Define migration-free legacy projection and explicit target selection; newest-by-field is unsafe.
3. Canonical import currently receives only review.evidence and reads original assertions. The new correction event/provenance/reference and initial corrected/unconfirmed fact need a reviewed projection plus materialization path. Any stored shape/SQL admission change belongs behind CR-C02 with historical readers.
4. Current strict canonical commands support import/edit/confirm/section rename/rollback, not the full target-bound reconcile/add command. Define the server operation and payload-bound replay/CAS first; no client-only overlay or direct service-table write can supply it.
5. A preview can race a new evidence attempt, correction revision, canonical edit, source deletion or membership withdrawal. Specify stale/conflict responses and exact saved operation result; do not have a retry adopt a newly changed latest correction.
6. Artifact source-link admission/privacy export/delete must understand the reviewed candidate-authored provenance without an invented citation. Confirmed manual export stays independent of AI generation. Unconfirmed/unsupported facts and uncalibrated scores remain blocked under their own contracts.

### Focused red-test proposal after allocation

First preserve the already failed carry-or-disclose receipt. Add a stronger synthetic consumer expectation: correct one source field, import, and assert the exact corrected canonical value, candidate-authored correction reference and unconfirmed state; separately assert the original envelope/assertion did not change. A warning cannot satisfy this test. Confirm the exact canonical fact, check its immutable child and checked PDF/DOCX export; no authoritative numerical score appears. This requires the approved backend contract/schema/admission before persistence green results.

Pure projection cases should cover two employers/roles/dates, same-target supersession, different targets at equal field type, no matching fact/add, ambiguous legacy event, source/attempt/model-version changes, older confirmed canonical text, duplicate/conflicting keys and stale head/revision. Managed/browser cases then prove the actual server path: selection/preview, exact apply, two-tab race, retained draft, one materialization on replay, undo/history and ownership/deletion denial. Do not label compile errors from a missing new helper as a meaningful red result; target the current observable incorrect import before the minimal fix.

Prospective bounded UI ownership remains at most five files: app/routes/analysis.evidence.tsx, app/routes/analysis.canonical.tsx, proposed app/lib/correction-preview.ts, proposed tests/unit/correction-preview.test.ts and proposed e2e/correction-materialization.spec.ts. These are a proposal, not an allocation. Current focused baselines are the existing evidence-review/canonical-content/canonical-route unit tests and evidence/canonical browser specs. New red/green commands will be npm test -- tests/unit/correction-preview.test.ts and the approved private browser-only launcher for e2e/correction-materialization.spec.ts once files/fixtures are assigned. Root owns browser port/environment/build and managed-target cleanup allocation. No test is run for this proposal.

Next action: root reviews/integrates CR-C00, coordinates backend grouping/projection and CR-C02, then assigns the exact UI interface/tests/files. Wait for that allocation before UI implementation. No fresh reviewer-team, pricing or deployment approval request is introduced.

## Documentation checks

Node.js 22 scoped Prettier passes all three owned files. Seventeen local file links resolve; final-newline/trailing-whitespace and scoped git diff checks pass. Removing the sole new product-spec section reproduces the copied root file byte-for-byte. clean-user-facing-text reports low density for all three files (capability 0.1225; product spec/handoff 0.0325) with no suspicious Unicode; deterministic cleanup changes none. No application tests are needed or run for this prose-only slice. Root accepted the contract in principle and will record reviewed status/task evidence at integration.

## CR-U19 read-only test inventory

This is source-inspected coverage, not a new test result or a reproduced UI defect. No browser, service or provider was started. The existing [anonymous Axe matrix](../../../e2e/a11y.spec.ts) names six routes; its Account request follows sign-in, so it does not prove authenticated Account controls. The privacy entry likewise does not prove authenticated privacy-request controls. The [Phase6 matrix](../../../e2e/phase6.spec.ts) primarily tests upload at selected widths, reduced motion, forced colors and 200% zoom; its route console loop is not an interaction matrix for every private workspace.

Owner-authenticated Axe/keyboard checks exist in evidence review (main-scoped), canonical, JD, scoring, authoring and artifact suites. Scoring/authoring include selected mobile checks. Navigation has its own width/nav-scoped Axe checks, and browser repairs cover mobile privacy/signout. Build AI covers popover selection/Escape/context/mobile and Axe. The LaTeX suite contains splitter/mobile/current-page text fallback/theme/forced-color checks, but compiler-dependent paths were blocked in the current consumer audit; existing test source is not new runtime evidence.

Later CR-U19 allocation should cover the new correction target/diff/add/confirmation controls, authenticated Account/privacy states, advertised auth delivery/OAuth, typed worker/OCR/provider/compiler recovery announcements and focus return, and stale/unconfirmed corrected-export errors. Extend the selected keyboard/mobile matrix on changed private views. Keep role/label assertions bound to the intended control: the same progress label legitimately occurs in an H1 and timeline H2, so use the H1 level rather than claiming every identical heading label is unique. Missing coverage alone is not proof of an application defect. Existing code remains unchanged pending focused allocation.

## CR-R01 independent read-only review and endpoint child

Final disposition: **the two reported source findings are resolved on the runtime agent's frozen candidate; no additional blocking finding from this review**. This is code review, not a new test or authentication result. No runtime source/test was modified by this agent; no application test, service, credential read or provider request ran during review. The Node.js source was read as documentation to resolve parser semantics.

The first review found that the duplicate-definition counter implemented a second incomplete quote grammar. A backtick multiline value could cause false duplicate API-key assignments; an unmatched unrelated quote could hide later real duplicates. [Node.js 22.23.4 ParseContent](https://raw.githubusercontent.com/nodejs/node/v22.23.4/src/node_dotenv.cc) supports backticks and line fallback for an unterminated quote. The fix counts only unique synthetic assignment markers actually emitted by Node parseEnv, using a private transformed copy for counts while original parsing still owns effective values. The inspected tests preserve the backtick, unterminated-quote and marker-collision regressions without reflecting values.

The second finding was inherited shared endpoint admission: HTTPS hostname/path checks accepted non-default ports. The separate bounded endpoint child now requires the URL's normalized default HTTPS port, preserving explicit 443 and rejecting alternate ports. Fixed error strings do not echo URLs/credentials. The new tests include permitted canonical/default 443 origins and rejected alternate ports, other hosts, credentials, query/fragment and invalid paths. This is endpoint-policy repair, not proof of successful network authentication.

The final doctor preserves effective inherited precedence, including explicit empty overrides; duplicate counts; selected-file/process source metadata; absent-file no-fallback behavior; bounded regular-file/workspace checks; actual default/invalid flags; opaque organization/project/logging presence/source; no value/hash/fragment disclosure; fixed invalid-argument/error output and zero provider requests. Cache comparison remains only an optional caller-supplied in-memory snapshot. The CLI does not inspect or refresh a running process, and no cache comparison is claimed when none is supplied. No production-key fallback or live mode exists. Configuration plausibility remains distinct from authenticated readiness; CV01 is still open.

The runtime agent reports meaningful red quote/port regressions, then 31 passing doctor tests and 131 passing tests across 12 affected files with scoped lint. These are author-reported test results, not re-executed by this reviewer. Root separately confirmed implicit SDK context absence in its configured file/process as booleans only; that is not a causal authentication correction and does not justify another blind 401 request.

Reviewed frozen source hashes (not credential hashes):

| File                             | SHA256                                                           |
| -------------------------------- | ---------------------------------------------------------------- |
| app/lib/server/ai-readiness.ts   | fc94be6bcf99b7c49266e7fff8cc93fb51fc1f8baff037fd99852712cc92bbec |
| scripts/doctor-ai.ts             | 62a9ebf803643533d22197631f289c6ec9a6c96c2f3b57dde97f3680ff207abb |
| tests/unit/ai-readiness.test.ts  | 410ce738586858c141227e022d7b43abce4a070cc37abd15bbf47b92da6cf4eb |
| app/lib/server/egress-policy.ts  | b814506191c1c47232b4c446ccd392d407e1a61b11a93a47e21cabda4da25883 |
| tests/unit/egress-policy.test.ts | 4a7c15d858ca375894d5bfa3a1654d743d13e0c7befbdb9e151706714f1d283d |

Root may integrate the offline slice and endpoint child at their own recorded tiers after combined checks. This review does not close actual authentication, live provider behavior, the remainder of R02 or G01. A03 UI behavior still waits for backend grouped targets, reviewed provenance/commands and C02 storage compatibility plus exclusive allocation. C00 capability/spec files remain released and untouched.

## CR-U05-S01: reviewable legacy drafts and Copy semantics

Status: implemented and verified at focused component/static tier; root integration/review pending. This bounded UI slice does **not** close CV03 or the full CR-U05 factual-validation gate. Backend CR-A11 support filtering and actual successful provider/server evidence remain mandatory. No server DTO, support-policy attestation, score/confirmation state or new filtering was invented. Core output is not hidden or disabled.

The owned UI baseline matched root exactly before edits: ResumeWriter.tsx a12aaac976d9284a4460cbc3cf453592164b5ec09a05b1e5f00510d71f497158; RewriteGenerator.tsx bc4ea44c71af54bc1b58560190ed230f67900f2962ca48828e9452f34761c41f; existing ResumeWriter.test.tsx d16e61142f0b300c6441d6d2bf25b7cb4ab0bc1518899c42c5b05d5ea7290c9b. Those include earlier user-owned dirty changes, which remain preserved. The WT does not contain root's later doctor/egress/A01 transfers; root must verify the combined candidate after importing only these exact owned files.

ResumeWriter now calls retained output writing drafts, preserves summary/Original/Suggested/reasoning and all Copy controls, and asks the candidate to compare/check facts. Its accessible Copy note gives concise clipboard guidance and directs review, saving and fact confirmation to the resume workspace. It makes no success claim about export verification or score improvement. Retained drafts remain visible with an announced status if the writing stage failed. Empty and unavailable-only recovery messages/links remain distinct and do not invent an evidence reason.

The Copied indicator now binds the copied text as well as the summary/bullet key. A replacement draft at the same index is not falsely labelled already copied. Failed or missing clipboard access still announces an error without losing the draft or claiming a copy/save. Copy buttons retain type=button and inherit existing brand classes; no CSS, palette, route or network behavior was changed.

RewriteGenerator's heading/intro/pending status now describe writing drafts rather than guaranteed grounding. A successful response says writing drafts were saved for review and directs resume editing/saving to its workspace. Required consent, exact POST action, pending duplicate-request controls, preserved server errors and retry availability remain. No provider request was made by this component test; useFetcher was controlled in the renderer test, not exercised as a live route.

### Meaningful red and green chronology

1. Before application edits, the exact two-file focused command returned exit 1: 13 tests, eight failed and five passed. Failures demonstrated the unconditional grounded label/intro and generator promise, missing Copy-versus-workspace explanation, stale Copied indicator, missing retained-draft unavailable status, and generator pending/save wording. Original positive/empty/unavailable test assertions remained intact.
2. After the minimal two-component change, the same 13 tests passed. Two additional positive controls then proved summary Copy does not submit a parent edit form and missing clipboard API keeps the text usable.
3. Final focused command returned exit 0: **15 tests passed in two files**, with all original/red assertions retained. Node.js 22.23.4, RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic, AI_ENABLED=false; command: npm test -- tests/components/ResumeWriter.test.tsx tests/components/RewriteGenerator.test.tsx. No .env was loaded. No browser, server, provider, Supabase, Docker or build was started.
4. Final npm run typecheck (React Router typegen + tsc) returned exit 0 in the same sealed environment. Scoped ESLint for the two components and two test files returned exit 0. Node 22 scoped Prettier and git diff/whitespace checks pass. The extracted new UI prose scores 0.0325/low with zero suspicious Unicode; no code/identifiers were rewritten by the prose-cleaning workflow.

The tests exercise truthful labels, original/proposed content, accessible Copy guidance, clipboard success/error/unavailable handling with a mocked browser API, text-stale copying, no fetch on Copy, no parent-form submit, retained drafts on unavailable, generator consent/action, pending disabled states, draft-save semantics and retryable errors. This is renderer/static evidence, not a browser visual/Axe, actual generation, backend truth filter, accepted canonical version or verified export result. Root owns integrated web/worker builds and later browser/service allocation.

Final owned code/test hashes:

| File                                       | SHA256                                                           |
| ------------------------------------------ | ---------------------------------------------------------------- |
| app/components/ResumeWriter.tsx            | 5e486e008fb15c4a4c1bd5f44a57185607c2abc328c675d86c2b31ed9574836e |
| app/components/RewriteGenerator.tsx        | 8ce7ac0affd281c489811a0fbf84a99cad2f56de40f274b0efdc357f23b27a7d |
| tests/components/ResumeWriter.test.tsx     | 08b8c05b47e1c2b38100b59b30d72e848068d5e1ae6b2a0416ffedd2ac8c3b87 |
| tests/components/RewriteGenerator.test.tsx | 21ca68e55d7b8ba6ec9565795aaa4a7bed883cc9db27287c4538b96cfb944ce9 |

Rollback only this bounded delta to the recorded copied-root contents; never reset these dirty files to Git HEAD or remove pre-existing untracked components/tests. The new RewriteGenerator test is the only wholly new code/test file. Preserve the original red chronology and full CV03 failures. Next: root reviews/imports the exact four source/test files plus this handoff, runs the combined candidate checks and records CR-U05-S01 without closing backend grounding, live generation or the full task. C00 capability/spec files remain released and unchanged; CR-A03 UI still awaits grouped-target/provenance/C02 allocation.

### Reviewed action-copy refinement

Before integration, root requested concise action-focused Copy guidance rather than an unnecessary export/score caveat list. The final note reads: "Copy a draft to your clipboard. Review and save resume edits in the resume workspace, where you confirm the facts." Generator success reads: "Writing drafts saved for review. Review and save resume edits in the resume workspace."

Only newly authored exact warning-word assertions were replaced with clear clipboard/save/confirmation guidance and absence of export/score success claims, as explicitly reviewed by root. Original three baseline tests remain unchanged. Observable Copy checks still prove one exact clipboard call, zero fetch requests and no parent edit-form submission; stale Copied, clipboard errors/unavailable, retained drafts, pending/consent and retry controls remain intact. No behavior, server DTO or backend support gate was relaxed. The affected 15 tests pass again after this prose change; current scoped lint/Prettier/prose/whitespace checks pass. Prior typecheck passed; the copy refinement changes no types/imports/control flow, and root owns combined candidate verification. No browser, service, provider or DB operation ran.
