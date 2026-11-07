# Worker deployment alongside Vercel

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
