import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { benchmarkJobIntelligence } from "../app/lib/server/job-intelligence-benchmark";
import { JOB_INTELLIGENCE_FIXTURES } from "../tests/fixtures/job-intelligence";
const args = process.argv.slice(2);
const release = args.includes("--release");
const output = args.find((a) => a.startsWith("--output="))?.slice(9);
if (args.some((a) => a !== "--release" && !a.startsWith("--output=")))
  throw Error("Unsupported benchmark option");
const result = {
  ...benchmarkJobIntelligence(JOB_INTELLIGENCE_FIXTURES),
  parserSha256: createHash("sha256")
    .update(readFileSync("app/lib/server/job-requirements.ts"))
    .digest("hex"),
  annotationProvenance:
    "manually specified fictional source truth; no independent annotation",
  executedAt: new Date().toISOString(),
};
if (output) writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
process.stdout.write(JSON.stringify(result) + "\n");
if (release ? !result.releasePassed : !result.engineeringPassed)
  process.exitCode = 1;
