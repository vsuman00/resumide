# Project context and multi-agent workflow

Reviewed: 2026-10-17. This guide explains the repository's agent workflow. Standing instructions live in [AGENTS.md](../AGENTS.md); task acceptance and approval remain in the existing plans and ADRs.

## What the image gets right

The supplied slide shows a small CI-oriented `AGENTS.md`: reproduce the failing test before and after a fix, supply the real test command, keep investigation notes, report tests in a PR, preserve tests, and avoid unnecessary large CI runs. Its lower lines are partly obscured; no additional rule is inferred from them.

For this repository, investigation notes belong in task-specific handoffs. A single shared `ci-notes.md` would invite concurrent edits. Opening a PR also remains subject to the repository's publication authorization.

## Research and design choices

| Primary source                                                                        | Finding                                                                                                                | Applied here                                                                                                                                                                             |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [AGENTS.md specification and examples](https://agents.md/)                            | Standard Markdown can cover setup, commands, conventions, tests, and security; nested files can scope guidance.        | One concise repository entry point, with links to existing contracts. Add nested instructions only when a subtree needs different rules.                                                 |
| [Codex instruction discovery](https://developers.openai.com/codex/guides/agents-md/)  | Codex builds a root-to-working-directory instruction chain; override files and a combined size limit affect discovery. | Keep essential rules at the root. Check active instruction sources and restart a session after instruction changes. Explicitly read applicable deeper instructions before editing there. |
| [Codex subagent guidance](https://developers.openai.com/codex/concepts/multi-agents/) | Bounded delegated work can keep noisy exploration out of the main conversation; concurrent writes need more care.      | The coordinator keeps requirements and integration responsibility; workers return concise evidence and own bounded files.                                                                |
| [Codex worktrees](https://developers.openai.com/codex/app/worktrees/)                 | Worktrees provide separate file checkouts while sharing Git repository metadata.                                       | Parallel writers use separate worktrees. Service isolation and transfer of uncommitted context are explicit coordination steps.                                                          |
| [Claude Code memory and imports](https://code.claude.com/docs/en/memory)              | `CLAUDE.md` supports importing a shared instruction file with `@path` syntax.                                          | `CLAUDE.md` imports `AGENTS.md` so both tools use the same standing project rules.                                                                                                       |

The handoff format, assignment ownership, and integration procedure below are project workflow choices informed by these sources. They are not features that Markdown enforces. This change does not configure an agent orchestrator, file locks, shared chat memory, or service isolation.

## Switching agents with a small startup context

Start with `AGENTS.md` and [CONTEXT.md](../CONTEXT.md). The first holds standing rules; the second holds the current task and next action. The outgoing agent refreshes the current baton before stopping. Keep CONTEXT.md near 450 words, moving completed history, long investigations, and receipts to linked handoffs. Never omit required constraints just to meet the word target.

Use this prompt in a new tool or session:

```text
Read AGENTS.md and CONTEXT.md. Use my request if no active task is recorded.
Verify Git state, authorization, and dependencies. Load only the relevant
governing sections and code. Continue the next bounded step, verify it,
and refresh CONTEXT.md before handing off. Preserve unrelated changes.
```

In the outgoing session, this is enough:

```text
Prepare the handoff in CONTEXT.md: current task, authorization, changed files,
checks and limits, unresolved attempts, and the next bounded action.
Link detailed evidence and keep the entry near 450 words.
```

An agent needs repository access to read these files. If a tool does not discover project instructions, explicitly supply the startup prompt; do not assume automatic support. For a chat without repository access, attach the two files and required task excerpts. Different checkouts or machines need an explicit transfer of the updated files and relevant uncommitted work. Do not paste the full conversation or all project documentation.

Use `rg -n` to locate task IDs and headings in long plans, then read the applicable sections, dependencies, exceptions, and contracts. Expand the reading when the scope changes or a source conflicts. This reduces repeated onboarding text, but no fixed token saving or complete reconstruction of omitted chat history is guaranteed.

The current baton is a single-writer file. During parallel work, only the coordinator updates it; workers update their own handoffs. Include the active run/worker links there, and do not let multiple agents overwrite it as a shared diary.

## Where project context belongs

| Context                        | Canonical location                                                      | Maintenance                                                               |
| ------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Standing working agreements    | Root `AGENTS.md`; `CLAUDE.md` imports it                                | Change when a recurring rule changes, rather than after every session     |
| Current task and next step     | Root `CONTEXT.md`                                                       | Outgoing agent or coordinator replaces the current baton before a switch  |
| Architecture and rationale     | `ARCHITECTURE.md`, `docs/decisions/`                                    | Preserve accepted decisions and record supersession                       |
| Execution order and acceptance | `tasks/plan.md`, `tasks/todo.md`, active subplan                        | Coordinator updates evidence for the integrated result                    |
| Product semantics and UX       | Scoring/authoring spec and applicable `docs/design/` contract           | Update with behavior and approved contract changes                        |
| Evidence                       | Focused tests, CI, `docs/evaluation/` reports and receipts              | Name revision, environment, scope, and limits                             |
| In-progress context            | One run handoff and separate worker handoffs in `tasks/agent-handoffs/` | Update before interruption or reassignment; retain useful failed attempts |

Do not copy whole plans or transcripts into `AGENTS.md`. A new agent needs enough context to find and verify the relevant source, not every project's document in its initial prompt. A handoff summarizes state; it cannot grant approval or supersede a contract.

## Starting one agent or resuming a session

1. Read root instructions and `CONTEXT.md`, then the task's applicable governing sections. Identify any applicable nested instructions. Do not preload the full documentation set.
2. Read the handoff explicitly supplied by the owner or coordinator. If none is supplied, inspect candidate records and confirm their task and revision against current Git state; a filename's date alone does not make it authoritative.
3. Check branch, HEAD, dirty files, and any concurrent assignments. Inspect relevant diffs before relying on prior results.
4. State the authorized slice and its unresolved dependencies. Read only the feature-specific documents and implementation needed for that slice.
5. Work and verify. Update the canonical task evidence if acceptance is met, or explain the precise remainder. Save the next action in the handoff.

If a handoff and source disagree, verify the source and current authorization. Keep historical evidence identifiable; do not silently relabel it as current. If the disagreement affects permission or a frozen contract, resolve it before dependent work.

## Starting multiple agents

The coordinator creates a run record from [the template](../tasks/agent-handoffs/TEMPLATE.md), using a unique name such as `YYYY-MM-DD-<task>-coordinator.md`. Each worker gets its own `YYYY-MM-DD-<task>-<agent>.md`. These are ordinary repository documents; commit or publish them only within authorized Git scope.

Before work begins, the coordinator records:

- The owner's objective, task IDs, relevant approval/exception evidence, non-goals, acceptance criteria, and integration base revision.
- Each worker's branch/worktree, exclusive files, interface contracts, dependencies, and expected result.
- Ownership of shared files and services. Treat plans, task checklists, instructions, lockfiles, migration ordering, shared fixtures, and external resources as coordinator-owned unless explicitly assigned.
- An ordered integration and validation plan. Coupled contract changes run sequentially; independent analysis can run in parallel.

Separate branches do not remove semantic conflicts. Two individually valid changes can disagree on schema, producer version, API behavior, or privacy assumptions. The coordinator resolves those interfaces before integration and tests the combined result.

### Files and services

Prefer one branch/worktree per writing agent, based on the agreed revision. Review-only agents can share a checkout if they do not mutate files, generated outputs, or services. In a shared checkout, assign exclusive write ownership before edits; ask the coordinator to move ownership when overlap becomes necessary.

Worktrees share repository metadata, and local services may still be shared. Allocate separate ports, databases, storage namespaces, queues, and worker resources, or serialize their use. Playwright currently uses port 3110. Do not run parallel database resets, migrations, fixture cleanup, or queue workers against a shared environment. Inspect npm scripts before choosing a test command.

A worker based on a commit does not automatically receive another checkout's dirty files, untracked receipts, `.env`, installed dependencies, or conversation. The coordinator sends the task packet and required reviewed diff or files explicitly. Supply secret configuration through approved local mechanisms, never through committed handoffs.

An assignment table is not a lock service. Independently launched chats must receive the coordinator's current assignments explicitly; they cannot infer live ownership from their private branch's copy. If the coordinator is unavailable, preserve work and stop overlapping mutations until ownership is resolved.

### Returning and integrating work

Workers return a small result: task outcome, exact files, branch/commit or reviewed diff location, tests and environment, unresolved findings, and next action. Each worker edits its own handoff. It requests shared documentation or contract changes through the coordinator.

The coordinator reviews each diff, checks authorizations and contract compatibility, integrates in dependency order, and runs the appropriate combined checks. Run full `npm run verify:ci` once on the final implementation candidate when the environment permits; rerun affected checks after subsequent edits. Report an unavailable check accurately. Test success does not close a human approval gate.

Keep the active assignment table current. A stale assignment is not abandoned ownership; confirm a handoff or release before another agent edits those files. Close a run with integrated evidence and a clear next action. Do not delete old notes containing unresolved failures or decisions without preserving their destination.

## Useful handoff content

Use concise facts with repository-relative links. Include timestamps with timezone, base HEAD, dirty-state caveats, authorization, constraints, changed files, failed attempts worth preserving, commands and exit results, remaining gates, and the next bounded action. Mark observations as verified in this session or inherited from a named report. A test receipt should identify the code and environment it exercised.

Avoid raw terminal dumps, private resume/JD contents, secrets, machine-wide personal memory, and speculative claims of completion. Persist facts and decisions in their canonical files; keep temporary session history in the task handoff.

## Reusing the pattern in another project

Write a root `AGENTS.md` around the project's real purpose, source-of-truth map, working boundaries, verified commands, test policy, Git permissions, and handoff procedure. Replace every command and path with that project's values. Use its existing plan/decision conventions. Keep changing progress in task records, give parallel writers bounded ownership, and use small tool-specific adapters only where required. Do not copy Resumide's phase gates or providers into an unrelated project.

## Checking that the setup works

Check Markdown formatting, local links, command names against `package.json`, and `git diff --check`. In a fresh agent session, ask it to list loaded instruction sources, locate the task acceptance criteria, and identify current authorization and unrelated dirty files before editing. For Claude Code, inspect `/context` to confirm the shared instructions are loaded. Do not start extra model sessions merely to validate a documentation edit.

The [initial context checkpoint](../tasks/agent-handoffs/2026-10-17-agent-guidance.md) records what was inspected when this workflow was added. It is a dated starting point, not a live project dashboard.
