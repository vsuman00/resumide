import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { benchmarkWriterGrounding } from "./writer-grounding-engineering";
const args = process.argv.slice(2),
  release = args.includes("--release"),
  output = args.find((v) => v.startsWith("--output="))?.slice(9);
if (args.some((v) => v !== "--release" && !v.startsWith("--output=")))
  throw Error("Unsupported writer benchmark option");
const report = {
  ...(await benchmarkWriterGrounding()),
  sourceHashes: Object.fromEntries(
    [
      "app/lib/server/authoring-contract.ts",
      "app/lib/server/authoring-repository.ts",
      "app/lib/server/authoring-proposals.ts",
      "app/lib/writing-quality.ts",
      "supabase/migrations/20261012160703_candidate_authoring_transactions.sql",
    ].map((path) => [
      path,
      createHash("sha256").update(readFileSync(path)).digest("hex"),
    ]),
  ),
  executedAt: new Date().toISOString(),
};
if (output) writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify(report) + "\n");
if (release && !report.releasePassed) process.exitCode = 1;
