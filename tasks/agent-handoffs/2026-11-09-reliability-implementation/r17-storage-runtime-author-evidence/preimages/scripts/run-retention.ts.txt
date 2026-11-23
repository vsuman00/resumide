import { getServerConfig } from "../app/lib/server/config";
import {
  createRetentionObjectRemover,
  runRetentionSweep,
  SupabaseRetentionRepository,
} from "../app/lib/server/retention";

const config = getServerConfig();
const report = await runRetentionSweep(
  new SupabaseRetentionRepository(),
  createRetentionObjectRemover(),
  new Date(),
  config.RETENTION_DAYS,
);
console.log(
  JSON.stringify({ retentionDays: config.RETENTION_DAYS, ...report }),
);
