import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runAiDoctor, type AiReadinessDependencies } from "./doctor-ai.ts";

type Environment = Readonly<Record<string, string | undefined>>;
/** Legacy name, same explicit allocation/transport. No import-time config or request. */
export function runLiveOpenAiModel(
  argv: readonly string[],
  environment: Environment = process.env,
  dependencies: AiReadinessDependencies = {},
) {
  return runAiDoctor(
    (argv.length === 1 && argv[0] === "--help") || argv.includes("--live")
      ? argv
      : ["--live", ...argv],
    environment,
    dependencies,
  );
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const result = await runLiveOpenAiModel(process.argv.slice(2));
    process.stdout.write(JSON.stringify(result.output, null, 2) + "\n");
    process.exitCode = result.exitCode;
  } catch {
    process.stdout.write(
      JSON.stringify({
        schemaVersion: "ai-readiness/live-v1",
        mode: "live",
        status: "diagnostic_unavailable",
        authentication: "not_tested",
        failure: "diagnostic_unavailable",
        allocationAccepted: false,
        providerRequests: 0,
        generationRequests: 0,
        retries: 0,
        redirects: 0,
        httpStatus: null,
        deadlineAborted: false,
      }) + "\n",
    );
    process.exitCode = 1;
  }
}
