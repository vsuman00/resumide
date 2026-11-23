import {
  sweepOwnedAiExpiry,
  OwnedAiExpiryError,
  OwnedAiExpirySweepSchema,
} from "../app/lib/server/owned-ai-expiry";
const shutdown = new AbortController();
const stop = () => shutdown.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  const args = process.argv.slice(2);
  let execute = false,
    limit = 100,
    hasLimit = false;
  for (const arg of args) {
    if (arg === "--execute" && !execute) execute = true;
    else if (
      arg.startsWith("--limit=") &&
      !hasLimit &&
      /^(?:[1-9]|[1-9][0-9]|100)$/u.test(arg.slice(8))
    ) {
      limit = Number(arg.slice(8));
      hasLimit = true;
    } else throw new Error("INVALID_EXPIRY_ARGUMENTS");
  }
  if (!execute) throw new Error("EXPLICIT_EXPIRY_EXECUTE_REQUIRED");
  const [{ createSupabaseAdminClient }, { OWNED_AI_EXPIRY_PROFILE }] =
    await Promise.all([
      import("../app/lib/server/supabase"),
      import("../app/lib/server/owned-ai-expiry-profile"),
    ]);
  const client = createSupabaseAdminClient();
  let report;
  try {
    report = await sweepOwnedAiExpiry(client, OWNED_AI_EXPIRY_PROFILE, limit, {
      signal: shutdown.signal,
    });
  } catch (error) {
    if (error instanceof OwnedAiExpiryError && error.report) {
      const counts = OwnedAiExpirySweepSchema.safeParse(error.report);
      if (counts.success)
        process.stderr.write(`${JSON.stringify(counts.data)}\n`);
    }
    throw error;
  }
  if (shutdown.signal.aborted) throw new OwnedAiExpiryError();
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch {
  process.stderr.write(
    "[resumide] expiry sweep was not confirmed cleanly. Use explicit --execute and optional --limit=N (1..100); no automatic retry was attempted.\n",
  );
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
