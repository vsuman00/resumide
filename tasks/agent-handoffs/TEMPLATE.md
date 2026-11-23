# <task or run ID>: <purpose>

Copy this template to a unique task/agent file. Replace placeholders; delete unused sections. Keep one writer per record. This record does not change canonical task acceptance or authorize new work.

- Updated: <ISO timestamp with timezone>
- Author/role: <coordinator or worker ID>
- Objective/task IDs: <owner request and existing task IDs, or documentation task>
- Work status: <IMPLEMENTED / VERIFIED / PARTIAL / PLANNED / TARGET / DEFERRED / BLOCKED; name evidence tier>
- Repository/branch/worktree: <location and branch>
- Base HEAD: <full revision>
- Result revision or diff: <commit if authorized, otherwise reviewed diff location; note uncommitted changes>
- Coordinator/run record: <link or not applicable>

## Authorization and required context

- Owner authorization: <source, date, scope; quote only when needed>
- Applicable plan, constraints, ADR/exception, design: <links and sections>
- Dependencies and formal gates: <satisfied, open, or not applicable; cite evidence>
- Non-goals: <excluded work and actions needing separate authorization>
- Context supplied to worker: <packet version/time and any uncommitted prerequisites transferred>

## Assignment ownership

Coordinator maintains this table in the run record; workers link to that record. Assignment state is separate from acceptance status.

| Agent/task | Branch/worktree and base | Exclusive files/interfaces | Dependencies  | Services/resources                   | Assignment state                                       |
| ---------- | ------------------------ | -------------------------- | ------------- | ------------------------------------ | ------------------------------------------------------ |
| <ID>       | <branch/path/revision>   | <paths and contract>       | <IDs or none> | <isolated names or serialized owner> | <assigned / active / returned / integrated / released> |

## Working-tree baseline and changes

- Pre-existing or concurrent changes: <paths inspected; preserve them; do not infer ownership>
- Files changed by this task: <exact paths and purpose>
- Shared-file requests: <coordinator-owned edits needed, or none>
- Decisions: <canonical ADR/task link, or unresolved question; do not invent approval>

## Verification

| Command/check   | Revision and dirty-state scope                        | Environment/evidence tier                    | Result and receipt                       |
| --------------- | ----------------------------------------------------- | -------------------------------------------- | ---------------------------------------- |
| <exact command> | <code tested, including relevant uncommitted changes> | <unit / local DB / browser / hosted / other> | <exit code, result, durable report path> |

- Not run: <commands and reason; distinguish unavailable from failing>
- Inherited evidence: <named report/revision; explicitly not rerun>
- Attempts worth preserving: <failure, hypothesis, result; omit raw logs>

## Remaining work and next action

- Open issues/gates: <precise condition and owner; separate engineering from release>
- Next authorized action: <one bounded step with files and acceptance criteria>
- Integration/retest needs: <order, conflicts, combined checks>
- Handoff destination/ownership release: <recipient, acknowledgement or pending; do not silently expire an assignment>
- Portable context: <coordinator updates root CONTEXT.md with task, evidence, next action, and this record's link; workers request that update>
