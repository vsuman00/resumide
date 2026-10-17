import { processQueuedAnalysis } from "../app/lib/server/analysis-worker";
import { AnalysisJobQueue } from "../app/lib/server/jobs";
import { runWorkerCycle } from "../app/lib/server/worker-runner";
import { assertWorkerSchemaReady } from "../app/lib/server/worker-readiness";
import { createSupabaseAdminClient } from "../app/lib/server/supabase";

await assertWorkerSchemaReady(createSupabaseAdminClient());
await runWorkerCycle(new AnalysisJobQueue(), processQueuedAnalysis);
