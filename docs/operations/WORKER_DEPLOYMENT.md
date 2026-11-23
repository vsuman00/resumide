# Worker deployment alongside Vercel

## Current development status

Deployment remains stopped at the owner's request. The 2026-11-10 [admission and worker report](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/r07-r10-admission-worker-closeout.md) covers local source and mocked checks, not a deployed worker or a real queue drill.

`ANALYSIS_ADMISSION_BINDING_ENABLED` and `ANALYSIS_FENCING_ENABLED` default to `false`. The former needs migration `20261110080809`; the latter needs `20261110080810` and `20261110082455` together for queue tokens and stage writes. The actual `.env` has not been changed. Keep these branches disabled until SQL execution, legacy producer cutover, opening accounting and privacy compatibility pass on an admitted target. A missing new RPC must fail closed, never fall back to tokenless work.

The runner serializes heartbeats, waits for outstanding ownership checks before completion, and bounds its shutdown wait. That library bound does not prove that an ignored processor or network operation was killed. Provider cancellation does not prove billing stopped or refund a reservation. Known usage must settle; unknown usage stays held. A valid terminal result already committed before cancellation remains valid. Restart recovery must handle its remaining queue row without publishing another result.

Real unscoped queue drills require confirmed isolation. The configured shared project's metadata access does not authorize global claims, expired-job sweeps, migrations or a worker launch. Use direct Supabase for admitted database tests; do not start or reset a Docker database. The deployment examples below remain documentation only.

The local `20261110085513` recovery source adds bounded terminal-job cleanup to the opt-in v2 claim. It removes only confirmed finished/current-source review queue metadata after a lease expires or is proved unleased. Failed jobs retain their attempt/error/fence evidence and become dead letters; existing dead letters and malformed owner-without-expiry leases remain untouched. It neither retries AI nor rewrites results. This SQL and its global invocation have not run. The preceding `20261110085512` privacy barrier must be reviewed/applied first on an admitted target; it requires the documented transaction isolation and exact predecessor function/policy definitions. See the [R11/R19 report](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/r11-r19-privacy-recovery-closeout.md).

Both worker entry points now complete bounded readiness before constructing the queue. Legacy mode checks the two evidence tables. Selected fencing or enabled AI-budget mode also requires the service-only `worker_schema_readiness` RPC from local migration `20261110094229`. AI disabled skips budget readiness. The helper has a 2-second default aggregate deadline, accepts at most 5 seconds, and the CLIs pass `READINESS_TIMEOUT_MS` and their shutdown signal. Query aborts and late-response rejection are covered by mocked tests.

The continuous worker can record a successful queue check once migration `20261122061500` is installed. The check can return an empty queue. Status for an owned waiting upload shows whether the worker checked within the past 60 seconds. A long-running job can let that signal expire. Use worker logs and a leased test to verify processing and capacity. One-off and scoped verification commands leave the check-in untouched. If PostgREST cannot resolve the new claim RPC, the worker uses its existing claim mode and the status page can show the generic waiting message. [PostgREST error codes](https://docs.postgrest.org/en/stable/references/errors.html#group-2-schema-cache)

The RPC draft checks selected signatures, types, permissions, privacy triggers, critical transition revision and the selected technical AI policy. Its failure labels are `INVALID_SELECTION`, `SCHEMA_MISSING`, `ACCESS_INVALID`, `PRIVACY_BARRIER_INVALID` and `AI_BUDGET_POLICY_UNAVAILABLE`. It never claims jobs or reserves spend. Four privacy guards must retain VOLATILE semantics. This SQL has not run; a ready catalog response would still not prove transaction or recovery behavior.

The configured Supabase catalog has a missing cancellation RPC and an older transition body. Some taxonomy effects already exist despite absent migration-history names. Follow the [compatibility prerequisites](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/r11-native-compatibility-prerequisites.md); do not replay all missing historical files or start a worker against the shared queue. The 19-case application gate and both builds passed; these native compatibility gaps remain open.

The cancellation route now accepts success only from exact `cancelled` or `already_cancelled` RPC results. Exact `not_found` retains ownership concealment; `already_started` remains a conflict. RPC failures and malformed output return a fixed retryable 503 instead of a false success or 404. This application behavior has mocked coverage; it does not supply the missing database function.

The forward bridge `20261110101800` is local source only. It targets three guarded legacy functions and removes only the exact historical global AI-input index when present. The configured project's index absence is compatible: run UUIDs identify invocations and input hashes preserve provenance. The bridge preserves newer taxonomy/persistence routines and token-protected jobs. Do not apply it, replay historical migrations or start workers without the concrete hosted action approval.

The configured project still lacks the older R08 migration. If a future catch-up packet installs R08 after the standalone bridge, R08 replaces the legacy release body. That packet must reconcile and verify the stricter current bridge after its complete chain before enabling workers. Run the legacy catalog verifier against the final state; a previous bridge history entry alone does not prove the final function definitions.

For the proposed OCI Always Free Mumbai option, prerequisites, ordered tasks and
approval gates, see the [Oracle worker plan](ORACLE_FREE_WORKER_PLAN.md). It is
documentation only and does not replace the selected Fly provider or authorize
hosted deployment.

Prepared and locally container-tested 2026-10-11. No remote worker service has
been provisioned or deployed. Keep `https://resumide.vercel.app` as the web app;
run the analysis worker continuously against the same Supabase project/private
storage bucket. The web app creates leased PostgreSQL jobs; the worker claims,
extracts, scores, saves a terminal result and removes completed jobs. There is
no worker HTTP endpoint, Redis dependency or need to send resume bytes directly
from Vercel to the worker.

## Tested artifact

`npm run build:worker` bundles application TypeScript as
`build/worker/analysis.mjs`, retaining production package imports so the PDF
engine resolves its installed assets. `Dockerfile.worker` builds this entry,
installs only production runtime dependencies, runs as the node user and starts
without a local `.env` file or a development runner. Runtime secrets come from
the host. The worker checks required evidence storage before claiming jobs.

The existing `Dockerfile` is the web image and should not be used as the worker
image with an npm/vite-node command: its runtime omits development dependencies
and npm. `scripts/check-container.mjs` now checks both images for the existing
base-pin, production-dependency, non-root and secret-in-image boundaries.

## Fly.io worker-only deployment

This follows the repository's selected Fly.io/Mumbai worker architecture while
retaining the owner's existing Vercel web deployment. `fly.worker.toml` defines
one worker process, a 1-GiB shared-CPU starting allocation, Mumbai (`bom`), no
HTTP service and AI/review disabled. This allocation is a starting configuration,
not a production capacity/SLO result. Queue-age and worker-lifecycle monitoring
are required; a web readiness endpoint does not prove worker availability.

Choose a unique app name and an authorized Fly organization, then run these
commands from this checkout with Fly CLI installed/authenticated:

```sh
fly apps create YOUR_WORKER_APP
fly secrets import --app YOUR_WORKER_APP < .env.worker-deploy
fly deploy --config fly.worker.toml --app YOUR_WORKER_APP --ha=false
fly scale count worker=1 --config fly.worker.toml --app YOUR_WORKER_APP
fly logs --app YOUR_WORKER_APP
```

Create the ignored `.env.worker-deploy` file privately with only the required
worker values, taken from the same production Supabase configuration as Vercel:

```dotenv
SUPABASE_URL=your-production-supabase-url
SUPABASE_PUBLISHABLE_KEY=your-production-publishable-key
SUPABASE_SECRET_KEY=your-production-server-secret
SUPABASE_RESUME_BUCKET=resumes
OPENAI_API_KEY=disabled-worker
```

`OPENAI_API_KEY` is currently required by config parsing even with AI disabled;
the inert value above avoids installing a provider credential. If the production
bucket differs, use its exact name. Mirror any approved extraction limits and
native-evidence/layout flags. Keep `AI_ENABLED=false` and
`EVIDENCE_REVIEW_ENABLED=false` from the config for the initial rollout. Do not
import the entire local `.env`: it can override the production origin and flags.
The server secret remains private to the worker service. Check actual Mumbai
capacity with the authenticated CLI before provisioning. No region change is
implied by this example.

After the remote worker passes a synthetic deployment test, stop the temporary
worker on the developer's Mac; the deployment must work without that computer.
Keep the tested worker artifact/version compatible with the deployed web build
and installed database migrations. These files are currently local and uncommitted.

## Render alternative

Create a **Background Worker** (not a web service), connect the repository and
select Docker with `Dockerfile.worker`. Keep its default image command and set
the same private environment variables plus:

```dotenv
NODE_ENV=production
APP_ORIGIN=https://resumide.vercel.app
AI_ENABLED=false
EVIDENCE_REVIEW_ENABLED=false
```

Start with one worker instance in an approved region. This is an alternative
provider/region choice to the existing Fly plan, not a completed deployment.
For a native Node service instead of Docker: install Node 22, build with
`npm ci --include=dev && npm run build:worker && npm prune --omit=dev`, and start
with `npm run worker:start:production`. This start command uses platform-provided
environment variables and does not require `.env`.

## Vercel-only alternative

The current polling loop is not a Vercel Function entry point; Functions have
bounded invocation durations. Vercel Queues/Workflow can support an event-driven
consumer design, but require an authenticated dispatch/consumer integration and
explicit lease, retry, cancellation, publication and timeout tests. A cron
invocation is bounded and does not automatically deploy this continuous worker.
Do not launch the polling loop from an upload request.

## Measured deployed-site test

Public checks on `https://resumide.vercel.app`: homepage/upload/health/readiness
return 200; signed-out analysis status returns 401. Two disposable synthetic
end-to-end runs returned upload 202, terminal `partial`, status 200 and saved
HTML result 200, with zero provider calls. One used the native Mac worker; the
second used the new production-only Docker worker on Linux arm64/Node 22.23.2 while
the Mac worker was stopped. The image runs with UID 1000, no vite-node package
and no `.env` file. Exact synthetic users and storage objects were removed.
The test container was stopped and the AI-disabled Mac worker restored.

[Aggregate test receipt](../evaluation/aa1-vercel-worker-deployment-smoke-20261011.json).
This proves the deployed Vercel web flow can use the tested worker artifact and
hosted queue; it does not prove Fly/Render availability or constitute production
Gate A4 or AA1 accuracy acceptance. Vercel deployment metadata inspection was
unavailable because its connector needs reauthentication; the deployed commit
was not identified.

Official references: [Fly process groups](https://fly.io/docs/launch/processes/),
[Fly secrets](https://fly.io/docs/apps/secrets/),
[Render background workers](https://render.com/docs/background-workers),
[Vercel Function limits](https://vercel.com/docs/functions/limitations), and
[Vercel Queues](https://vercel.com/docs/queues).
