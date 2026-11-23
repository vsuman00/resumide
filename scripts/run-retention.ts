import { getServerConfig } from "../app/lib/server/config";
import {
  createRetentionObjectRemover,
  runRetentionSweep,
  SupabaseRetentionRepository,
} from "../app/lib/server/retention";

const shutdown = new AbortController();
const stop = () => shutdown.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  const config = getServerConfig();
  const report = await runRetentionSweep(
    new SupabaseRetentionRepository(),
    createRetentionObjectRemover(),
    new Date(),
    config.RETENTION_DAYS,
    100,
    { signal: shutdown.signal },
  );
  if (shutdown.signal.aborted) throw new Error("Retention sweep interrupted.");
  process.stdout.write(
    `${JSON.stringify({ retentionDays: config.RETENTION_DAYS, ...report })}\n`,
  );
} catch {
  process.stderr.write(
    "[resumide] retention sweep could not be confirmed; retry to reconcile pending items.\n",
  );
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
