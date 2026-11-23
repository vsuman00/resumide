# AUTH-ROUTING worker handoff

- Updated: 2026-10-17, Asia/Kolkata.
- Worker: `/root/auth_routing`; coordinator: [AUTH-PLAN-20261017](2026-10-17-auth-coordinator.md).
- Status: **PLANNED; source review and documentation checks only**.
- Branch: `auth/routing-plan-20261017`.
- Worktree: `/Users/vaibhavsuman/.codex/worktrees/a700/resume_ats`.
- Base/unchanged HEAD: `fab804841183169a8d9a2a6a3fd1b702f979565d`.
- Deliverables: [routing plan](../../docs/design/AUTH_ROUTING_PLAN.md) and this handoff; both uncommitted.

## Authorization and context

The coordinator authorized routing documentation only, with these two exclusive writable files. Read the supplied AGENTS/workflow/coordinator packet, constraints sections 1 and 6, architecture, applicable plan/todo/Accuracy-v2 sections, identity/AI ADRs, design blueprint and security records. `CONTEXT.md` is absent at this worktree's base. Refreshing it belongs to the coordinator and is outside this worker's ownership.

Pre-existing untracked `AGENTS.md`, `docs/AGENT_WORKFLOW.md`, coordinator packet and handoff template are preserved read-only. No application code, shared plan, migrations, lockfile, service, DB, provider inference, real resume data, Git publication or deployment was changed or run.

## Findings and dependencies

Current durable ingestion has consent but no payer/connection snapshot; workers resolve deployment-wide API credentials and model. The current transport uses nonstreaming Chat Completions and a completion token cap. Official OpenAI Docs require a distinct streaming Responses route for ChatGPT-plan inference. The plan's cited official pages were searched and opened on 2026-10-17.

Hosted access remains unestablished. Strict-schema compatibility and a provider-enforced output bound remain explicit implementation gates: preview rejects `max_output_tokens`, and byte/time cancellation alone cannot guarantee the mandatory token/charge ceiling. Keep the feature off pending resolution. Login identity is separate from AI permission, connection ownership and explicit funding. No payer fallback is allowed.

The plan defines owner-scoped encrypted credentials, immutable execution references, distributed refresh serialization, grant versus credential generations, result fencing, unknown-dispatch recovery, safe export and revoke/deletion behavior. Deterministic scoring and all existing withholding rules remain independent.

AUTH-CHATGPT must supply its verified provider subject/workspace/client and optional plan-permission contract. AUTH-GOOGLE supplies only the stable application identity. The coordinator owns shared integration paths, schema/migration ordering, threat/privacy/runbook updates and formal decisions. Routing exclusively owns the proposed credential-store/transport files; AUTH-CHATGPT owns identity and grant acquisition. Remote revocation is conditional on documented capability for the registered integration; otherwise use local credential destruction and ChatGPT Settings recovery. The plan lists exact proposed code/test ownership for later stages; none is assigned for implementation by this handoff.

## Checks and limits

All checks concern these two new Markdown files at the base above, plus the named untracked read-only context. No historical application report is claimed as a rerun.

- `git status --short`, `git branch --show-current`, `git rev-parse HEAD`: assigned branch/base confirmed; copied context preserved.
- Read-only source/test/config/CI inspection: current qualitative transport, worker/lease, ingestion, ownership/consent, egress and privacy behavior identified. Guessed `workers/`, `env.ts`, and `analysis-repository.ts` paths were absent; actual source paths are in the plan.
- `inspect_text.py --stylometry --json` from installed `clean-user-facing-text`: plan initially low density (0.0325), no suspicious Unicode; preserve prose claims and protected spans. Deterministic cleanup and final inspection applied to both deliverables.
- Focused Prettier check, local Markdown-link existence and `git diff --no-index --check /dev/null <file>` passed for both files (exit 0 for the combined validation). Final hygiene inspection found zero suspicious characters and low density (0.0325) in each; cleanup removed/replaced zero characters.
- `git diff --check`: passed; new untracked files also require the no-index checks above.
- Worktree has no installed dependencies. Use the existing original checkout's Prettier binary for focused documentation formatting; no install needed.
- Two optional `.md` official-document fetches failed with unsupported Markdown content type; the corresponding HTML pages were already successfully opened and used.
- Not run: application tests, typecheck, lint, builds, browser, DB, provider OAuth/inference or full CI. This is documentation-only; no services/resources were allocated.

## Next action

Return only the two owned documents to the coordinator for review and explicit transfer. Coordinator reconciliation and implementation authorization precede R1: `app/lib/server/ai-routing.ts` and `tests/unit/ai-routing.test.ts`, a pure injected resolver that rejects foreign/revoked/unconsented or incapable connections and never substitutes funding. R1 needs no provider calls, credentials, migration or activation. It follows the coordinator's Google-first implementation priority. Assignment release remains pending coordinator acknowledgement.
