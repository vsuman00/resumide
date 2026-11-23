# AUTH-CHATGPT handoff

- Updated: 2026-10-17, Asia/Kolkata; worker `/root/auth_chatgpt`.
- Status: **PLANNED; DOCUMENTATION VERIFIED; HOSTED ACCESS UNVERIFIED**.
- Worktree: `/Users/vaibhavsuman/.codex/worktrees/c121/resume_ats`.
- Branch: `auth/chatgpt-plan-20261017`; HEAD/base `fab804841183169a8d9a2a6a3fd1b702f979565d`.
- Authorization: [coordinator packet](2026-10-17-auth-coordinator.md); planning and public documentation/source inspection only. No implementation, provider activation, inference, services, DB, registration, credentials, commit, push or deployment.
- Exclusive deliverables: [ChatGPT plan](../../docs/design/AUTH_CHATGPT_PLAN.md) and this handoff. Supplied untracked instructions/workflow/coordinator files are read-only context and excluded.

## Findings and decisions

Current official [website](https://developers.openai.com/siwc/website), [quickstart](https://developers.openai.com/siwc/quickstart), [plan overview](https://developers.openai.com/siwc/token-sharing-open-source) and [client registration](https://developers.openai.com/siwc/request-client-id) were fetched. Website access is limited to selected commercial partners. Paid/remotely hosted plan usage needs separate access confirmation; Resumide/Vercel/private eligibility was not verified. Local/open-source registration is not a hosted authorization.

Keep one Supabase auth UID and its personal organization. Custom Supabase OAuth/OIDC is a proposed broker, not a tested integration. Third-party JWT trust is not a session bridge. Supabase automatic same-email linking conflicts with the required explicit ownership confirmation; proving prevention before session issuance is an activation stop condition. The coordinator acknowledged this requirement and will reconcile Google and routing contracts.

The plan covers state/PKCE/nonce/JWKS, distinct broker callbacks, safe linking, default-off availability, separate optional plan consent/funding, encrypted credentials, refresh races, revocation and no automatic app-paid fallback. Prospective file assignments remain advisory. No private candidate data was read.

## Verification and limitations

Evidence tier: documentation and source inspection at the stated base plus these two untracked Markdown files. Checked auth routes, server Supabase cookie client, auth helper, membership bootstrap, existing unit-test source and script names; tests were not executed.

- Official OpenAI pages fetched with public web retrieval and Markdown HTTP reads; Supabase custom-provider/linking/third-party OIDC pages also fetched. Web retrieval of the changelog failed internally; direct HTTP succeeded, and the relevant upcoming TLS cipher notice was reviewed. No provider capability was exercised.
- Applied `clean-user-facing-text` locally: measured before/after, deterministic Unicode pass with `--no-normalize-spaces`, fact/link review. Low density needs no prose rewrite. No authorship/detectability claim.
- PASS: existing root-checkout `node_modules/.bin/prettier --check` on both files; Python validation of relative Markdown paths and referenced npm scripts; `git diff --check` plus `git diff --no-index --check /dev/null <file>` for each untracked deliverable.
- Final hygiene: zero suspicious Unicode hits in either file; estimator score 0.0325, low density before/after for both. No rewrite was required.
- Not run: npm install, application tests/CI/builds, browser sign-in, OAuth exchange, Supabase provider setup, DB reset/migration, inference or hosted checks. None are evidence supplied by this documentation run.
- `CONTEXT.md` is absent in this base worktree. This worker cannot create shared context; coordinator owns its refresh.

## Next action and ownership

Coordinator reviews and transfers only the two deliverables, reconciles linking/funding interfaces, and records exact integrated evidence. Next bounded ChatGPT step is approval/compatibility review without activation: verify hosted permission, provisioned authentication method, Supabase support and pre-link protection. If any is unresolved, leave ChatGPT unavailable and proceed with the separately assigned Google slice. Release acceptance and Accuracy-v2 gates remain unchanged. Worker file ownership is held until coordinator integration acknowledgement.
