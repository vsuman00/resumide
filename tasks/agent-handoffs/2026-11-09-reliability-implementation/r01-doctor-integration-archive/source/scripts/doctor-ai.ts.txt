import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  readAiReadiness,
  readAiReadinessAllocation,
  refusedAiReadinessAllocation,
  runAllocatedAiReadiness,
  type AiReadinessDependencies,
} from "../app/lib/server/ai-readiness.ts";
export type { AiReadinessDependencies } from "../app/lib/server/ai-readiness.ts";

type Environment = Readonly<Record<string, string | undefined>>;
const invalidArguments = () => ({
  exitCode: 2,
  output: {
    schemaVersion: "ai-readiness/offline-v1",
    mode: "offline",
    status: "invalid_arguments",
    authentication: "not_tested",
    providerRequests: 0,
  },
});
/** Parse and admit live scope before selected configuration or credentials are read. */
export async function runAiDoctor(
  argv: readonly string[],
  environment: Environment = process.env,
  dependencies: AiReadinessDependencies = {},
) {
  if (argv.length === 1 && argv[0] === "--help")
    return {
      exitCode: 0,
      output: {
        mode: "offline",
        status: "help",
        authentication: "not_tested",
        providerRequests: 0,
        usage:
          "doctor-ai [--workspace PATH] [--source env-file|process] [--env-file PATH]. Offline metadata only. Explicit model access: --live --allocation FILE with the same selection flags; requires a bounded operator allocation and makes no generation request.",
      },
    };
  const values = new Map<string, string>();
  let live = false;
  for (let index = 0; index < argv.length;) {
    const name = argv[index];
    if (name === "--live") {
      if (live) return invalidArguments();
      live = true;
      index += 1;
      continue;
    }
    const value = argv[index + 1];
    if (
      !["--workspace", "--source", "--env-file", "--allocation"].includes(
        name,
      ) ||
      values.has(name) ||
      !value ||
      value.startsWith("--")
    )
      return invalidArguments();
    values.set(name, value);
    index += 2;
  }
  const source = values.get("--source") ?? "env-file";
  if (
    !["env-file", "process"].includes(source) ||
    (source === "process" && values.has("--env-file")) ||
    live !== values.has("--allocation")
  )
    return invalidArguments();
  const input = {
    source: source === "process" ? ("process" as const) : ("env_file" as const),
    workspaceRoot: values.get("--workspace"),
    envFile: values.get("--env-file"),
    environment,
  };
  if (live) {
    const declared = await readAiReadinessAllocation(
      input,
      values.get("--allocation")!,
    );
    const report =
      declared.state === "available"
        ? await runAllocatedAiReadiness(
            input,
            declared.allocation,
            dependencies,
          )
        : refusedAiReadinessAllocation(declared.failure);
    return {
      exitCode:
        report.status === "allocation_refused"
          ? 2
          : report.status === "model_access_confirmed"
            ? 0
            : 1,
      output: report,
    };
  }
  const report = await readAiReadiness(input);
  return {
    exitCode: report.status === "configuration_plausible" ? 0 : 1,
    output: report,
  };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const result = await runAiDoctor(process.argv.slice(2));
    process.stdout.write(JSON.stringify(result.output, null, 2) + "\n");
    process.exitCode = result.exitCode;
  } catch {
    process.stdout.write(
      JSON.stringify({
        schemaVersion: "ai-readiness/offline-v1",
        mode: "offline",
        status: "diagnostic_unavailable",
        authentication: "not_tested",
        providerRequests: 0,
      }) + "\n",
    );
    process.exitCode = 1;
  }
}
