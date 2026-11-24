# AI workflow (Claude Pro)

How work is routed between models in this repo. The project subagents live in [`.claude/agents/`](../.claude/agents/). For multi-agent coordination rules, see [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md).

## Routing

| Work | Agent | Model and effort |
| --- | --- | --- |
| Read, search, explain, trivial edits (rename, format, comment) | `code-explorer` | Haiku, low |
| Daily building, bug fixes, tests, routine refactors | `implementer` | Sonnet 5.5, medium. Raise to high for hard bugs, ambiguous requirements, risky refactors, or after a failed medium attempt. |
| Planning, architecture, hard or ambiguous bugs, final review | `architect` | Opus 5.5, medium. High only for security, auth, payments, migrations, or final review of risky changes. |

The main session defaults to Sonnet at medium effort. Switch with `/model` and `/effort` when a task needs more.

## Feature flow

1. **Explore:** `code-explorer` finds the files and explains the current behavior.
2. **Plan:** `architect` writes a short plan. The owner approves it and the task goes into `tasks/todo.md`.
3. **Implement:** `implementer` makes one small step at a time.
4. **Check:** `npm run lint`, `npm run typecheck`, and the focused `npm test -- <file>`.
5. **Review:** for important changes, `architect` reviews the diff.
6. **Commit:** only when the owner asks, using the suggested message.

## Quota tips

- Keep prompts small and do one task at a time.
- Commit often, so each session starts from a clean point.
- Use `/clear` between unrelated tasks and `/compact` when a session gets long.
- Check `/usage` regularly. Opus spends quota fastest, so keep it for planning and review.
