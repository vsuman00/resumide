# Phase 7 incident and rollback runbooks

All actions are recorded against the incident ID. Do not paste resume text,
emails, cookies, tokens, or provider payloads into incident systems.

## Provider outage or throttling

1. Confirm `provider` errors, token/cost metrics, and queue age.
2. Disable qualitative AI through the approved configuration kill switch or
   set `AI_ENABLED=false`; deterministic analysis must continue to a partial
   result where possible.
3. Stop repeated retries if provider errors are persistent. Preserve the
   analysis ID and request ID only.
4. Verify one synthetic analysis reaches a terminal state, then re-enable under
   the approved rollout window.

## Worker backlog or stalled lease

1. Check readiness, worker process health, queue age, lease age, and dead letters.
   A quarantined upload is awaiting worker validation, not an extraction-quality
   rejection. Confirm an analysis worker is running against the web server's same
   database. `npm run dev` starts both; `npm run dev:web` and production `start`
   require a separate `npm run worker:start` service.
   If startup reports migration `20261011140000`, install the reviewed additive
   migration through the authorized database rollout before restarting. Do not
   bypass evidence score guards or manually advance analysis status.
2. Restart or scale the worker within the approved five-concurrent-analysis
   baseline. Do not increase concurrency during a cost incident.
3. Confirm expired leases are reclaimed once and no duplicate AI run is stored.
4. If the queue remains unhealthy, pause new analysis acceptance and communicate
   the degraded state.

## Corrupt or abusive upload

1. Use the request ID and analysis ID, not the uploaded filename, to locate the
   event.
2. Confirm signature, MIME, size, page, extraction, and timeout outcomes.
3. Keep the upload rejected/quarantined and remove any orphan object through the
   scoped cleanup path. Never broaden a delete path.
4. Add a synthetic regression fixture if the boundary allowed unsafe input.

## Compromised key

1. Disable the affected key in the provider immediately.
2. Rotate it in the secret manager, restart web and worker processes, and verify
   readiness with the new value.
3. Review audit events and provider usage for the exposure window.
4. Do not place the old or new key in logs, tickets, commits, or screenshots.

## AI cancellation and usage outcomes

Qualitative feedback and explicit rewrite requests now propagate wrapper deadlines and caller aborts to the SDK fetch signal. `AI_TIMEOUT` is a bounded timeout; `AI_CANCELLED` is a caller cancellation. The previous saved rewrite draft is preserved. Abort signaling does not prove provider billing stopped or complete worker lease fencing.

For legacy qualitative feedback and rewrites, `AI_PROVIDER_AUTH` indicates upstream HTTP 401 or 403. The qualitative worker keeps deterministic feedback and ends the AI attempt. `AI_PROVIDER_TRANSIENT` indicates an upstream 5xx and follows the existing bounded worker retry policy. An expired Resumide session has its own sign-in prompt. [SDK and action verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/a02-source-u10-closeout.md#cr-u10-s04-legacy-rewrite-and-qualitative-recovery).

Worker stage calls now carry the runner's abort signal. In the default-off fenced branch, each stage also carries its exact worker, attempt and lease token; the guarded result RPC checks that tuple atomically with the write. Cancellation and fence failures cannot become a new partial or successful AI result. Explicit rewrites check cancellation again after the final asynchronous source lookup and before draft CAS. These paths passed the [affected local gate](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/r07-r10-admission-worker-closeout.md); actual SQL, recovery and privacy serialization remain open.

Safe typed failures retain observed token counters when refusal or output validation fails. Missing or invalid counters stay unknown, never zero. Current count-only persistence cannot accept an unknown-usage success; it returns `AI_OUTPUT_INVALID` without accepting output. Do not treat that code as evidence of a bad API key or free capacity. CR-R03 now has default-off caller branches for qualitative feedback, explicit rewrites and Build; known usage settles before product persistence and unknown usage keeps its hold. Database execution, cutover and activation remain open. Follow the [inactive budget runbook](AI_BUDGETS.md) before any managed test or activation. Build also recognizes the actual SDK timeout class rather than relying only on its error name. Never log response bodies, prompts or raw provider error messages while investigating. [Caller integration evidence](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/r04-r06-entrypoints-closeout.md).

## Offline AI configuration doctor

Use Node.js 22. Run `npm run doctor:ai -- --workspace <selected-workspace>`
to inspect the selected `.env` and inherited settings. Use `--source process`
for process-only configuration, or `--env-file <workspace-relative-file>` to
choose another file explicitly. The doctor never searches for a production key
or automatically loads alternate mode files.

Exit 0 means configuration is plausible; exit 1 reports configuration issues;
exit 2 rejects arguments. Authentication remains `not_tested`, with zero provider
requests. Presence, format, SDK context and precedence checks do not authenticate
the key or prove the cause of a provider 401. Preserve failed receipts and stop
repeated live requests until there is a concrete correction.

Offline and live mode use the same limits for the selected credential and SDK
context. If the doctor reports `credential_too_long`,
`organization_format_invalid` or `project_format_invalid`, correct the value
in its reported source before allocating a provider check. The report shows the
issue code and source without exposing the value.

Cache comparisons use a caller-supplied in-memory snapshot. The CLI cannot inspect
a running server's cached configuration. Restart owned web/worker processes after
an authorized configuration change. Keep credentials in local configuration or the
approved secret store, outside chat and logs.

Explicit model access uses `--live --allocation FILE` with the same workspace and
source flags. A bare `--live` is refused. Allocate a new check with the owner before
using it; this implementation task allocates no provider request. The command
checks the allocation's scope and expiry before reading selected configuration,
then checks its model against the exact effective configuration. It never falls
back to another environment file or a separate server configuration.

The operator record is strict flat JSON, at most 16 KiB, in a regular non-symlink
file inside the selected real workspace and distinct from the selected environment
file. Replace the placeholders only for a separately approved check:

```json
{
  "schemaVersion": "ai-doctor-live-allocation/1.0.0",
  "allocationId": "<new lowercase UUID>",
  "ownerConfirmed": true,
  "operation": "model_access",
  "workspaceRoot": "<canonical absolute workspace>",
  "source": "env_file",
  "envFile": ".env",
  "model": "<exact effective configured model>",
  "expiresAt": "<approved UTC expiry within 30 minutes>",
  "maxRequests": 1,
  "maxOutputTokens": 0,
  "timeoutMs": 10000
}
```

For `--source process`, use `"source": "process"` and `"envFile": null`.
The expiry must be in the future and no more than 30 minutes from admission;
`timeoutMs` must be an integer from 1 through 10000. Duplicate or unknown fields,
invalid scope, unsafe configuration and an unexpected model are refused without
dispatch. The record declares operator scope; it does not prove ownership or
supply a cross-process spend ledger. Reuse needs separate owner authorization.

The admitted path makes one SDK model-metadata GET, with zero retries or
redirects, no generation request, a 64 KiB response cap and an absolute deadline
that also aborts transport. Caller cancellation is supported. Output contains
fixed safe statuses and counters, without credentials, configured identifiers,
paths, provider bodies or SDK messages. Live exit 0 confirms that model access
only; exit 1 reports failure and exit 2 refuses arguments or allocation. Access
does not establish generation quality or useful resume edits. The legacy
`scripts/verify-live-openai-model.ts` is import-safe and delegates to this same
path; running it without allocation refuses before reading configuration.

## Failed migration

1. Stop rollout and preserve the migration error plus release ID.
2. Check whether the migration is expand-only and whether the application can
   continue on the prior artifact.
3. Restore only in the isolated drill environment first. Never run destructive
   repair SQL manually against production without a reviewed forward migration.
4. Roll back the application artifact if safe, then ship a forward-compatible
   repair migration after review.

## Rollback rehearsal

The release owner records the current artifact, prior artifact, migration state,
start/end times, health/readiness results, and user-flow result. Rollback is
blocked if a migration has removed data or columns without a compatible contract.
The concrete deployment command is provider-owned; a staging rehearsal and
human release approval are required for A4.

## Document evidence review recovery

Apply the additive document-evidence migration before deploying its read/scoring
guards or activating `EVIDENCE_REVIEW_ENABLED`. The flag defaults off and the
production worker supplies no local OCR adapter. Synthetic local tests do not
authorize processing real scanned resumes.

If review ingestion fails, disable the flag, retain source attempts/corrections
and keep score/read guards installed. An old application artifact can expose
legacy scores and is not a safe rollback after evidence attempts exist. Repair
forward; never delete attempts to bypass withholding. Retry the same correction
key after a transport failure; reload after a revision conflict.

The release benchmark intentionally exits nonzero while validity/calibration is
missing. The held-out synthetic field gate currently fails independently of that
deferral. Its CI failure must remain visible; do not relax thresholds or reclassify
those labels to publish AA1 acceptance.

## Quarantined development upload incident — 2026-10-11

Diagnosis: the local web server was running on port 5173 without an analysis
worker. The configured hosted database contained one quarantined analysis and
was missing `document_evidence_attempts` (PostgREST PGRST205). No resume content,
owner details or credentials were read for this diagnosis. Starting the prior
worker alone would also encounter the required evidence scoring guard.

Repair implemented: development supervises both web and worker; worker idle waits
keep the process alive; read-only startup checks require evidence/correction
storage before any queue claim. The existing score guard continues to fail closed.
The standalone idle-process regression fails with the original unreferenced
wait and passes with the fix. Full unit/integration suite: 77 files / 531 tests;
lint, typecheck and production build pass. A separate development startup probe
against the unmigrated database exits nonzero, stops both child processes and
claims no jobs. The existing port-5173 server was left running.

Recovery authorized by the owner with “do it test yourself” and completed on
2026-10-11. The exact reviewed local migration
`20261011140000_document_evidence_review.sql` was applied to hosted Resumide as
version `20261011151855` (`document_evidence_review`). The hosted SQL verifier
passes and rolls back its synthetic fixtures; zero synthetic users remain.

The first recovery attempt revealed stale in-memory status after quarantine was
advanced to queued. Extraction now updates its local status after each successful
transition and enters extracting before reading/persisting the PDF. Regression
coverage includes quarantine, queue, retry, terminal state and rejected transition;
real native/mixed worker fixtures now start quarantined and verify both transitions.

The original queued analysis reached `partial` through the normal leased retry
path with both deterministic and saved result rows present. The hosted queue is
empty, all three analyses are partial, and AI runs remain zero. A continuous
analysis worker is running with `AI_ENABLED=false`; evidence review stays disabled.
No status was manually advanced and no score guard was bypassed. This resolves
this incident, not the failed AA1 locked accuracy or production acceptance gates.

Final recovery verification: `npm run verify:ci` passes 78 files / 536 tests,
all 46 browser tests, formatting/lint/typecheck/build, operational checks and
zero production dependency vulnerabilities. The four real local native/mixed
quarantined-worker cases pass with zero external/provider calls and exact fixture
cleanup. Logs: `/tmp/resumide-quarantine-verify-ci.log` and
`/tmp/resumide-quarantine-worker-final.log`. Hosted transition metadata confirms
quarantined → queued → extracting → scoring → qualitative_review → partial;
both saved result rows are present. The browser partial-result link is covered by
the smoke suite; no claim of inspecting the owner's authenticated result page
is made. The temporary local Supabase test stack is stopped with backup retained;
the hosted AI-disabled worker and existing web server remain running.
