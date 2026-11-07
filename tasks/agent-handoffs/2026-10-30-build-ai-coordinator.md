# BUILD-AI-20261030: Reviewable inline assistance

Coordinator /root; frontend aa7_workspace, backend aa7_source, testing aa7_sandbox. Base HEAD a0b239299d75b0bd64b588fe743ebe2975fb28b9 with uncommitted tested Build candidate. Owner answered “yes go for it” to explicit reuse of the configured OpenAI key; credential gate resolved. No key creation/write/model change. Approves bounded implementation and a minimal synthetic live smoke, not private document testing, unbounded spend, deployment or publication.

## Accepted request and concrete implementation contract

Retain `/build` and separate compiler workflow. Hovering or selecting editor lines opens a dismissible, keyboard-accessible inline AI popover. The popover offers Fix code, Rewrite and Resume wording. Explicit Ask AI plus a selected-context disclosure/consent is required before a provider request; hovering alone never spends tokens or sends text. Show plain-text before/after/explanation, Apply/Discard, stale detection and undo for the last unchanged AI edit. Applying invalidates the old PDF; user recompiles through existing controls. Never auto-apply or auto-run model output.

Only bounded selected text and nearby context go to the configured OpenAI endpoint. Full source may reach our server for patch binding but is not persisted or forwarded wholesale. Do not claim grounded/canonical verification: resume drafts require explicit fact-preservation confirmation, numeric/email/URL protected-token preservation, and questions for missing evidence. No invented experience/skills/employers/credentials/metrics or numeric scores. Candidate confirmation is not source validation. No analyzer/canonical imports.

Shared browser-safe `app/lib/build-assist.ts` (backend-owned):

- Policy `build-ai-selected-context-v1`; modes fix|rewrite|resume.
- Request `{source,sourceHash,startLine,endLine,mode,consent:true,policyVersion}`. 48KiB source, at most20 selected lines/4000 selected chars, at most2 context lines each side and8000 total provider-context chars. Preserve CRLF/line offsets.
- Model response strict `{operation:'replace'|'advice'|'no_change',replacement:string|null,explanation:string,questions:string[]}` with bounded fields.
- API response binds hash/range/originalText/mode and validated suggestion. Candidate source after replacement must pass existing `prepareLatexDocument` before an applicable patch is offered. Resume patches preserve protected numbers/emails/URLs and require explicit confirmation; semantic factual truth is not guaranteed by the token check.
- Apply/undo reject stale current source/range/original mismatch; no new state persistence. Protocol/schema helpers must be browser-safe (no node:crypto import).

Backend `POST /build/suggest`: authenticated, strict Origin, private/no-store, bounded streamed JSON/deadline, default-off BUILD_AI_ASSIST_ENABLED plus existing AI_ENABLED, deployment Supabase admission keys build-ai:user:<hash> (3/min), build-ai:global:v1 (20/min), max2 active per process. Use configured model/base URL/key, existing official egress policy, SDK maxRetries0, timeout<=10s, output<=768 tokens. No tools or provider-body/log exposure. Abort/timeouts stop requests; no automatic retry. Check existing monthly usage/guard and record safe token usage if supported; do not invent an atomic credit guarantee. No schema migration.

Versioned consent metadata uses existing managed Supabase consents purpose qualitative_ai with new policy version, membership-derived owner organization and content-free audit. Request/hash binding requires fresh explicit consent per request. No source/prompt/output in DB/logs/receipts. Reuse existing application usage schema by inspection, never broaden permissions or write models/keys.

## Exact ownership and services

| Role     | Exclusive production files                                                                                                                                                        | Verification/other ownership                                                                                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend | app/components/BuildAiAssistant.tsx, app/components/BuildAiAssistant.module.css, app/routes/latex.tsx; new thin app/routes/build.suggest.ts + registration app/routes.ts          | Own frontend-only UX/manual checks; no backend/test edits                                                                                                                                                      |
| Backend  | app/lib/build-assist.ts; app/lib/server/build-assist.ts, build-assist-service.ts; app/lib/server/config.ts; .env.example; loader AI-enabled boolean in latex-converter-service.ts | Own static model adapter/source checks; no UI/test/credentials edits                                                                                                                                           |
| Testing  | tests/unit/build-assist*.test.ts, e2e/build-assist.spec.ts, playwright.build-ai.config.ts, scripts/verify-build-ai.ts; package scripts; sanitized reports/handoff                 | All acceptance/fault/privacy/guard/keyboard/hover/selection/diff/apply/stale/undo tests, mock provider, one bounded live synthetic smoke, managed Supabase test users+private exact cleanup ledger, server3110 |

Coordinator alone owns context/canonical docs and integration. Existing AA7/Build rename receipts are historical; save new evidence. No extra dependencies or Docker DB. Compiler remains its verified worker; no compiler/security matrix rerun unless affected. Model calls only after explicit UI consent in product, and one or at most2 public synthetic smoke calls in testing with total output<=1024 tokens; report auth/model/capability failure without switching model/provider or claiming live success.

Current reviewed root baseline and packet are copied explicitly to each worktree before implementation. Workers communicate interfaces and return exact diffs/checks. Root reviews frozen candidate, delegates final whole-suite verification to testing, updates context and reports actual omissions. Existing default-off/release and private-data boundaries stay unchanged.

## Integration status

The reviewed eleven production files are integrated in the root dirty candidate, preserving pre-existing file modes and unrelated work. Frontend own lint/types/web build and backend own focused lint/typecheck passed; these do not replace combined acceptance. Testing owns unit/provider/service/browser checks and exact managed Supabase cleanup. The owner answered that they will update the key themselves after the first synthetic probe returned HTTP 401. No further live call is authorized until the update is confirmed; no credential file was changed.

The generic atomic quota RPC now guards a `build-ai:month:YYYY-MM:<orgHash>` key for 32 days, allowing the floor of remaining analysis-token allowance divided by a conservative 25,000-token reservation. Context UTF-8 bytes, serialized provider payload and fixed prompt/schema sizes are enforced alongside 768 output tokens. Failures are not refunded. This is conservative Build request admission, not a shared actual-token billing transaction with concurrent analysis requests.

## Final local verification

See the [engineering closeout](../../docs/evaluation/BUILD_AI_ENGINEERING_CLOSEOUT_20261030.md) for the tested manifest, receipts and limitations.

The integrated dirty candidate passed `npm run check:build-ai:source`, `npm run test:build-ai` (4 files / 88 tests), and `npm run verify` (131 files / 1,152 tests, formatting, lint, types, web and worker builds). Six local browser scenarios passed in 36.8 seconds with a controlled provider stub and desktop/mobile Axe scans. The browser build preceded the narrow malformed monthly-usage guard; the final focused and integrated unit checks cover that guard. The live synthetic probe remains HTTP 401, and the owner will update the key. No additional live call was made.

Testing recorded 14 temporary synthetic users/organizations and 42 exact rate keys across attempts. Scoped cleanup deleted 19 existing owned buckets; verification found zero remaining recorded users, profiles, memberships, organizations, consent/audit/analysis usage rows or recorded rate keys. No global rate rows were modified. Private ledger/environment files were deleted after verification; port 3110 and owned compiler containers were cleared. Earlier AA7 global/expired-counter caveats remain in the historical closeout.

`verify:ci` was not run because its broader browser/database assumptions are not isolated to the authorized managed-project test. Live AI access, formal security/accessibility review and release approval remain open.

## Live credential recheck

The owner requested another live test. One additional synthetic request using the current configured key and model returned HTTP 401. It had a 128-token output cap, no retries and a ten-second timeout; no usage was returned. The previous receipt remains unchanged. See the [recheck receipt](../../docs/evaluation/BUILD_AI_LIVE_PROBE_RECHECK_20261030T175544Z.json). Live AI remains unverified; no key was changed or exposed.

## Owner-requested live retry

On 2026-10-30 the owner explicitly requested another test. One neutral synthetic request using the configured `gpt-6-luna` credential returned the expected structured response in 1,872 ms. Reported usage was 72 input and 15 output tokens. The request had a 128-output-token limit, no retries and a ten-second timeout. [The new receipt](../../docs/evaluation/BUILD_AI_LIVE_PROBE_RECHECK_20261030T180033Z.json) preserves both earlier HTTP 401 receipts. This is provider capability evidence, not a live end-to-end browser test or production approval.
