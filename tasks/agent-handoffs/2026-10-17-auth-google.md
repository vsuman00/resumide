# AUTH-GOOGLE handoff

- Updated: 2026-10-17, Asia/Kolkata. Role: Google planning worker.
- Status: **PLANNED**; documentation/source review only. No implementation, activation or release claim.
- Worktree: `/Users/vaibhavsuman/.codex/worktrees/d5c8/resume_ats`; branch `auth/google-plan-20261017`; base HEAD `fab804841183169a8d9a2a6a3fd1b702f979565d`.
- Authorization: [coordinator packet](2026-10-17-auth-coordinator.md). Only this handoff and [Google plan](../../docs/design/AUTH_GOOGLE_PLAN.md) are deliverables. Copied untracked instructions, workflow, template and coordinator context are excluded.

## Result and boundaries

The plan reuses Supabase's server PKCE callback and cookie session, preserves email login and proposes default-off Google sign-in. It separates Google identity from ChatGPT identity, AI consent and funding. Provider settings, credentials, SQL, services, migrations, app code, dependencies and Git publication were untouched.

Source inspection found an origin mismatch between local Supabase settings and the app default, missing callback allowlist paths and a weak return-path predicate. A read-only Node reproduction used `/\untrusted.example`: the current predicate accepts it, while URL normalization against `https://app.resumide.example` yields `https://untrusted.example`. No live callback exploit was attempted. G0 addresses this before Google integration.

Supabase documents same-email automatic linking; actual account preservation remains unverified. Different-email manual linking remains deferred and disabled. The plan includes exact prospective file ownership, two callback roles, local/hosted setup, tenant/session checks and required provider evidence.

## Sources and checks

Governing sources read: repository AGENTS, coordinator packet, constraints floor/exceptions, architecture, identity ADR, phase-3 plan/T031, Accuracy-v2 status/boundaries, design authentication sections and agent workflow. `CONTEXT.md` is absent in this isolated base; the supplied coordinator packet is the current task context. Memory was used only to locate the governing-document preference; live files supersede its stale AA0 status.

Official sources checked: [Supabase Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google), [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking), [redirect allowlists](https://supabase.com/docs/guides/auth/redirect-urls), [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Google branding](https://developers.google.com/identity/branding-guidelines) and [Supabase changelog](https://supabase.com/changelog). Changelog `.md` retrieval failed; HTML fallback succeeded. The discovery probe for `e2e/routes.spec.ts` found no such file; use existing `e2e/smoke.spec.ts` and a new focused auth spec instead.

Document checks: both files passed the clean-user-facing-text inspection with zero suspicious Unicode hits and low measured density (0.0325 before cleaning). The first inspector invocation supplied two paths and failed its single-path argument check; separate invocations succeeded. Deterministic cleaning made no changes. Focused Prettier, local-link/script-name checks and `git diff --check` passed. An explicit whitespace check covers both untracked deliverables because Git diff does not include them by default. No stylometry rewrite was needed because measured density was low. Application tests, CI, browser/provider login, SQL, services and deployment were not run; no executable behavior changed. Node URL normalization is the only executed behavioral probe.

## Next action

Coordinator reviews and integrates only the two owned documents. Then assign G0 redirect safety and focused callback tests before the default-off Google slice. Resolve implementation authorization, exact origins, Google client/consent ownership and isolated test-account permission before dependent provider work. Preserve all upstream Accuracy-v2 gates and unrelated dirty work.
