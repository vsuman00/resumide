# BUILD-20261030: Build naming and AI suggestion request

Coordinator /root; base HEAD a0b239299d75b0bd64b588fe743ebe2975fb28b9; integrated AA7 candidate is uncommitted. Status: route rename IMPLEMENTATION AUTHORIZED; AI-specific implementation held for the installed OpenAI API-key skill's mandatory reuse/new-key decision. Existing key presence was checked safely; no value printed, no live access verified.

## Owner request and boundaries

The owner requests Build naming instead of the LaTeX route, and contextual inline AI code fixes/rewrites/resume improvements. Rename `/latex` to `/build`, navigation/title to Build, resource endpoint `/build/compile`. Preserve old URLs as safe compatibility redirects. User source/preview, worker isolation, Supabase-only database/storage, default-off flags and no analyzer integration remain. URL naming alone makes no security/reliability claim.

The AI credential question is pending. Before it is answered, do not implement/design/test API-dependent functionality, provision secrets, draft AI implementation plans or call a model. Route rename is independent and may proceed. Never share keys/private source, change the configured model or promise working live credentials from presence alone.

## Three-subagent assignments

One manager and exactly three agents; current reviewed integrated root files/context are explicitly synchronized before edits. Read AGENTS/CONTEXT/constraints and AA7 design/ADR/closeout, but do not preload whole history.

| Role/agent               | Exclusive files now                                                                                               | Acceptance                                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend / aa7_workspace | `app/routes/latex.tsx`, WorkspaceShell, route registry `app/routes.ts`, new legacy redirect route(s), own handoff | Build title/navigation/fetch URLs; legacy GET redirect; preserve two-pane interaction/keyboard/Axe fixes; no AI code until key decision                                                           |
| Backend / aa7_source     | `app/lib/server/latex-converter-service.ts`, own handoff                                                          | Auth return URL `/build`; fixed same-origin resource contract unchanged. No new API/provider calls until key decision                                                                             |
| Testing / aa7_sandbox    | `e2e/latex-converter.spec.ts`, converter service/route tests, `playwright.latex.config.ts`, own handoff           | New Build route/endpoint assertions and legacy redirect regression, focused tests. Managed Supabase only, scoped synthetic account/key ledger+cleanup; no Docker DB, model calls or secret output |

Frontend owns public resource registration; backend owns compiled service. A resource legacy POST may redirect307/308 to fixedsame-origin newendpoint preservingbody/auth, never a user-provided Location. GET oldpage redirects308 tofixed`/build` without echoing arbitraryqueries. Newpage keeps PDF manual-upload workflow separate.

Coordinator owns canonical plans, currentcontext, integration and approval records. Historical AA7receipts stay immutable; this change requires separate evidence. No commit/push/deploy, hosted migrations/reset, real/private documents or provider spend authorized by route rename. Existing managed Supabase synthetic test authorization persists; no broad database cleanup. A later key choice authorizes that credential decision only, not unbounded spend or private-data testing.

Next: complete/test the independent route rename while waiting for credential decision; then issue bounded AI feature assignments using current authorization.

## Verified rename return

Frontend/backend/testing returned the independent naming slice. Integrated Build route/title/navigation, fixed legacy redirects and auth return. Full1,064tests/127files and focused106tests, sourcechecks/full lint/types/web+worker builds and actual6/6browserflows pass (desktop/mobileAxe0). Legacy authenticated POST retains its distinct source body through actualPDF output. Compilerimage/limits unchanged; no expensiveworker/securitybenchmark repeat or newmodelcall. See [closeout](../../docs/evaluation/BUILD_ROUTE_RENAME_20261030.md), [receipt](../../docs/evaluation/BUILD_ROUTE_RECEIPT_20261030.json) and [successframe](../../docs/evaluation/build-route-success-20261030.png).

Five exactsyntheticaccounts/cascades and recordeduser-ratekeys cleaned; privateenv/ledger deleted,3110stopped,ownedcompilercontainers0. Existingexpired/globalmetadata caveat remains. OldAA7receipts untouched. APIcredentialchoice remains unresolved; the user's “continue” does not select reuseexisting versusnew. No AI-specific implementation/design, modelrequest or secretwrite occurred. Next bounded action is the explicitcredentialdecision, then delegateAIwork; no fakefeature or AIcompletionclaim.
