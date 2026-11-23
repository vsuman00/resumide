# Agent guidance setup: initial context checkpoint

- Recorded: 2026-10-17, Asia/Kolkata; documentation snapshot, not a live assignment registry.
- Author/role: primary agent; no workers assigned for this documentation task.
- Objective: research the supplied AGENTS.md slide and create repository instructions that support project continuity and future multi-agent work.
- Authorization: owner's request to research and create the guidance. No application implementation, Git publication, database changes, or deployment requested.
- Branch/base HEAD: `main`, `fab804841183169a8d9a2a6a3fd1b702f979565d`.
- Work status: VERIFIED at the documentation tier; validation recorded below. Files remain uncommitted.

## Sources inspected

Read `CONSTRAINTS.md`, the architecture's product/status/boundary sections, the plan and task rules/current direction, the Accuracy-v2 subplan, existing `CLAUDE.md`, package scripts, CI, design guidance, and recent AA6/browser/JD closeouts. Primary-source research and the supplied image are summarized in [the workflow guide](../../docs/AGENT_WORKFLOW.md).

Current source records distinguish approved AA0 design, accepted local engineering, failed/open accuracy obligations, and formal release gates. This task did not rerun any application checks or adjudicate those gates. Before implementation, re-read the relevant current task, ADR, and evidence. October 17 extraction repair work is changing in the checkout; this checkpoint does not determine its final outcome.

## Existing checkout conditions

The checkout was already dirty and continued receiving changes during research. Pre-existing edits include CI/settings/README, document-evidence and evidence-field code, extraction benchmark scripts, hosted verification and operations documentation, OCR fixtures, new field-version migration/tests, and extraction repair receipts. Their ownership and acceptance are not established by this task. Preserve and inspect them before integration; do not stage them with this documentation change by default.

The current root `README.md` and committed `docs/README.md` start with the Accuracy-v2 implementation-plan heading rather than their expected product/documentation-index headings. The root README is already modified. This task leaves both files intact and provides direct context links in `AGENTS.md`; review the README contents separately if requested.

## Files owned by this documentation task

- `AGENTS.md`: standing instructions, context map, boundaries, commands, verification, and agent handoffs.
- `CLAUDE.md`: imports the shared root guidance instead of duplicating phase snapshots.
- `docs/AGENT_WORKFLOW.md`: image analysis, research sources, coordination procedure, and reuse guidance.
- `tasks/agent-handoffs/TEMPLATE.md`: task packet and evidence format.
- This checkpoint: dated observations and scope.

## Validation and limits

- Prettier formatting checked for all five task files.
- Local Markdown links and repository paths checked; listed npm script names matched `package.json`. The `CLAUDE.md` import resolves to the root guide.
- `git diff --check` and whitespace checks include the new documentation files.
- The installed `clean-user-facing-text` inspection and deterministic cleaning scripts ran on all five files. No suspicious Unicode was found; all measured prose was in the low density tier, so no stylistic rewrite was needed. Protected code, commands, paths, and links were preserved.

No application/runtime behavior is changed, and existing test counts in closeout reports are inherited evidence only. Application CI was not rerun for this documentation-only task. No fresh Codex or Claude Code session was launched to test instruction discovery.

## Next action

For the next implementation request, identify its existing task ID and authorized scope, inspect the latest extraction changes and relevant acceptance record, then take the next bounded slice. Do not automatically advance to AA7 or a deployment phase from this documentation task.

For a multi-agent request, the coordinator creates a fresh run handoff from [the template](TEMPLATE.md), establishes the base revision and file/service ownership, and supplies the packet to each worker. No parallel implementation assignment is active in this checkpoint.
