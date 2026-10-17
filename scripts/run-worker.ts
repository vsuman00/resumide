import { processQueuedAnalysis } from "../app/lib/server/analysis-worker";
import { AnalysisJobQueue } from "../app/lib/server/jobs";
import { runWorkerLoop } from "../app/lib/server/worker-runner";
import { assertWorkerSchemaReady } from "../app/lib/server/worker-readiness";
import { createSupabaseAdminClient } from "../app/lib/server/supabase";

const shutdown = new AbortController();
process.once("SIGINT", () => shutdown.abort());
process.once("SIGTERM", () => shutdown.abort());

try {
  await assertWorkerSchemaReady(createSupabaseAdminClient());
  process.stdout.write("[resumide] analysis worker ready\n");
  await runWorkerLoop(new AnalysisJobQueue(), processQueuedAnalysis, {
    signal: shutdown.signal,
  });
} catch {
  process.stderr.write(
    "[resumide] worker startup failed; verify configuration, database connectivity and document-evidence migration 20261011140000. No jobs were claimed during startup.\n",
  );
  process.exitCode = 1;
}
