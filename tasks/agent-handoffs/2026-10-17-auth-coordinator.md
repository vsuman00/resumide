# AUTH-PLAN-20261017: Social sign-in and user-funded AI coordinator

- Updated: 2026-10-17, Asia/Kolkata
- Author/role: /root, coordinator
- Objective: Plan Google and ChatGPT sign-in plus optional ChatGPT plan usage for Resumide; create isolated agent assignments as requested by the owner.
- Work status: VERIFIED coordination and documentation handoff; all feature proposals remain PLANNED. Implementation, live provider access and release are separate states.
- Repository: original owner checkout on main.
- Base HEAD: `fab804841183169a8d9a2a6a3fd1b702f979565d`
- Result: uncommitted handoffs; no commit, push, merge or deployment authorized by this coordination request.

## Authorization and context

The owner requested: "Read AGENTS.md, create a coordinator handoff, and divide this task among agents with separate file ownership and worktrees." The antecedent task is the proposed Google/ChatGPT authentication and user-plan AI design, not the concurrent OCR repair. This assignment covers planning and reviewable handoffs; it does not activate accounts, spend, providers, hosted settings, SQL or inference.

Required context: [AGENTS](../../AGENTS.md), [workflow](../../docs/AGENT_WORKFLOW.md), [constraints](../../CONSTRAINTS.md), [architecture](../../ARCHITECTURE.md), [plan](../plan.md), [T031](../todo.md#t031-implement-user-session-and-personal-organization-slice), [Accuracy-v2 plan](../accuracy-authoring-plan.md), [identity ADR](../../docs/decisions/0002-managed-postgres-identity-and-private-storage.md), [AI ADR](../../docs/decisions/0003-versioned-deterministic-scoring-and-bounded-ai.md), and authentication section of the [design blueprint](../../docs/design/PRODUCT_DESIGN_BLUEPRINT.md).

Preserve Supabase cookie sessions, tenant isolation, safe return URLs, consent, bounded qualitative AI and deterministic scoring. Current auth uses email magic links and a PKCE callback. ChatGPT identity and permission to use a plan are separate. The last turn fetched official OpenAI docs showing hosted/private access restrictions; workers must verify current official sources for their proposed contract. An open-source local flow does not by itself approve the hosted site.

## Ownership and isolated resources

Each worker writes only the two listed Markdown files inside its own worktree. Proposed implementation ownership in worker documents is advisory until the coordinator assigns the next run. Coordinator exclusively owns this record and all shared plans, ADRs, instructions, migrations, lockfiles and application files for this run. No DB, queue, browser port or provider resources are allocated; workers must not start services or reset databases.

| Task / agent                        | Branch / worktree                                                                                      | Exclusive writable files                                                              | Dependencies                                                            | State      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------- |
| AUTH-GOOGLE                         | `auth/google-plan-20261017` at `/Users/vaibhavsuman/.codex/worktrees/d5c8/resume_ats`; base `fab8048`  | `tasks/agent-handoffs/2026-10-17-auth-google.md`; `docs/design/AUTH_GOOGLE_PLAN.md`   | Independent source/design analysis; coordinator integration before code | integrated |
| AUTH-CHATGPT / `/root/auth_chatgpt` | `auth/chatgpt-plan-20261017` at `/Users/vaibhavsuman/.codex/worktrees/c121/resume_ats`; base `fab8048` | `tasks/agent-handoffs/2026-10-17-auth-chatgpt.md`; `docs/design/AUTH_CHATGPT_PLAN.md` | Independent source/design analysis; coordinator integration before code | integrated |
| AUTH-ROUTING / `/root/auth_routing` | `auth/routing-plan-20261017` at `/Users/vaibhavsuman/.codex/worktrees/a700/resume_ats`; base `fab8048` | `tasks/agent-handoffs/2026-10-17-auth-routing.md`; `docs/design/AUTH_ROUTING_PLAN.md` | Independent source/design analysis; coordinator integration before code | integrated |

## Interfaces to reconcile

- One stable application user and personal organization; provider identity linking must preserve access and prevent takeover. ChatGPT activation must wait until the documented ownership-confirmation requirement is reconciled with Supabase automatic email linking; matching emails alone are not an implementation acceptance test.
- Separate login identity from optional AI connection and explicit funding preference.
- Server-owned credentials never appear in browser storage, logs, telemetry, job payloads or handoffs.
- Workers receive a connection reference, resolve it for the job owner at execution, and stop on revocation or expiry.
- No silent switch from user-plan funding to app-paid inference; eligible models and capabilities require discovery and validation.
- Google is supported by existing Supabase OAuth; ChatGPT website registration and inference entitlement require separate availability checks. Source observations: `safeReturnTo` needs adversarial return-path coverage; existing AI transports use nonstreaming Chat Completions and cannot be presumed compatible with ChatGPT-plan Responses streaming.

## Reconciled implementation boundaries

The following resolves alternative filenames and overlapping responsibilities proposed by workers. It is an advisory next-run allocation, not authorization to begin application edits.

| Area                                                                                | Sole proposed owner           | Contract                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google login, email regression, callback and return-path hardening                  | Google implementation worker  | One Supabase session; local navigation only. Exact origins and provider access remain prerequisites.                                                                                                                                                                                                |
| ChatGPT identity and optional grant acquisition                                     | ChatGPT implementation worker | Verify upstream identities and permissions; pass a validated grant to the connection service. Do not create another credential store or transport.                                                                                                                                                  |
| Connection storage, encryption, lifecycle, funding resolver and inference transport | Routing implementation worker | Proposed canonical paths: `ai-connections.ts`, `ai-credential-store.ts`, `ai-routing.ts`, `chatgpt-plan-transport.ts` and their tests, under `app/lib/server/` and `tests/unit/`. These supersede alternative `chatgpt-connection.ts` / `chatgpt-plan-provider.ts` names from the ChatGPT proposal. |
| Shared routes, config, migrations, worker dispatch, consent/privacy and ADR updates | Coordinator                   | Assign exact files before each implementation slice. Never run concurrent writers on the same file.                                                                                                                                                                                                 |

A shared callback or credential interface is integrated sequentially. Remote credential revocation must use a documented supported capability; otherwise promise only local disable/credential destruction and direct users to ChatGPT settings. Synthetic streaming cannot prove hosted entitlement, provider-side output-token bounds, model quality or real OAuth linking.

## Dirty-state transfer and preservation

The original checkout contains unrelated OCR parser, evaluation, CI, deployment documentation and settings changes. No dirty implementation files are copied, staged or committed. All worktrees start at the explicit base above. Required untracked standing instructions (`AGENTS.md`, `docs/AGENT_WORKFLOW.md`) and handoff template are copied explicitly; this coordinator packet is copied after writing. These copied files are read-only worker context and excluded from worker deliverables. Private resumes, JD text, environment files, tokens and evidence receipts are never copied.

## Acceptance and integration

1. Workers read governing documents and inspect current source before producing a bounded plan with exact prospective implementation paths, tests, provider prerequisites and risks.
2. Each returns its two owned Markdown files, branch/worktree/base, source links, actual checks, unresolved decisions and next slice. No code or production-completion claim.
3. Coordinator reviews all diffs, reconciles authentication versus funding contracts, transfers only assigned deliverables, and updates this table.
4. Check new local links, focused Markdown formatting, prose hygiene and `git diff --check`. Application CI is not required for this documentation-only run; live OAuth and inference remain untested.
5. Next implementation run begins with Google OAuth and its session/tenant regression tests. ChatGPT hosted access and plan usage stay unavailable until OpenAI grants the relevant permissions and the integration is verified.

## Verification and remaining work

- Verified this session: root instructions, workflow and Git baseline inspected; isolated managed worktrees created at the named revision. All three workers returned; their six owned documents were reviewed and copied into the original checkout. Proposed credential/transport ownership and conditional remote revocation were reconciled above.
- Not run: application tests, browser sessions, provider authentication, inference, SQL, deployment; no executable changes authorized by this packet.
- Existing Accuracy-v2 gates are unaffected; documentation cannot close them.
- Next action: assign G0 return-path hardening with focused callback regression tests; then G1 default-off Google OAuth. ChatGPT activation waits for hosted access, identity-linking protection, transport/schema compatibility and enforceable resource bounds. No implementation work is started by this handoff.

## Integrated deliverables

- [Google plan](../../docs/design/AUTH_GOOGLE_PLAN.md) and [Google worker handoff](2026-10-17-auth-google.md).
- [ChatGPT plan](../../docs/design/AUTH_CHATGPT_PLAN.md) and [ChatGPT worker handoff](2026-10-17-auth-chatgpt.md).
- [AI routing plan](../../docs/design/AUTH_ROUTING_PLAN.md) and [routing worker handoff](2026-10-17-auth-routing.md).

All transfers are uncommitted copies of the exact owned worker files; worker branches and worktrees are retained. Copied instruction context is excluded from integration. Application files, shared canonical plans and original OCR repair changes were not edited by this run. Worker file ownership is released after return; the retained worktrees do not imply active writers.

Final documentation checks PASSED on all seven new documents: focused Prettier (exit 0), repository-local link/anchor resolution (zero errors), prose inspection (zero suspicious Unicode; low density), explicit untracked-file whitespace checks and `git diff --check` (exit 0). A concurrent untracked `CONTEXT.md` appeared after the initial baseline; this run did not create, edit or transfer it. Application CI and live authentication/inference were not run because this run changed documentation only. Node URL-normalization reproduction is a narrow behavioral probe, not proof of a deployed exploit. No app feature, provider, deployment or formal gate is marked complete.
