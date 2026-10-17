import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { scoringEngineeringBenchmark } from "./scoring-validity-engineering";
const args = process.argv.slice(2);
const release = args.includes("--release");
const output = args.find((a) => a.startsWith("--output="))?.slice(9);
if (args.some((a) => a !== "--release" && !a.startsWith("--output=")))
  throw Error("Unsupported scoring benchmark option");
const result = {
  ...scoringEngineeringBenchmark(),
  sourceSha256: createHash("sha256")
    .update(
      readFileSync(
        new URL("../app/lib/server/score-v2-engine.ts", import.meta.url),
      ),
    )
    .digest("hex"),
  executedAt: new Date().toISOString(),
};
if (output) writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
process.stdout.write(JSON.stringify(result) + "\n");
if (release && !result.releasePassed) process.exitCode = 1;
