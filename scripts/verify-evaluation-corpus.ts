import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { TextDecoder } from "node:util";
import { assessEvaluationCorpus } from "../app/lib/server/evaluation-corpus";
import { EVALUATION_CORPUS_DEMO } from "../tests/fixtures/evaluation-corpus";

const MAX_MANIFEST_BYTES = 1_048_576;
type CliReason =
  | "INVALID_ARGUMENTS"
  | "MANIFEST_UNREADABLE"
  | "MANIFEST_TOO_LARGE"
  | "MANIFEST_INVALID_JSON"
  | "INTERNAL_ERROR";

function rejected(reason: CliReason) {
  return {
    schemaVersion: 1,
    status: "rejected",
    totalRecords: 0,
    admittedCount: 0,
    excludedCount: 0,
    reasonCounts: { [reason]: 1 },
    representativeReady: false,
    releaseReady: false,
  };
}

async function readManifest(
  path: string,
): Promise<{ value: unknown } | { reason: CliReason }> {
  let file: FileHandle | undefined;
  try {
    file = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const info = await file.stat();
    if (!info.isFile()) return { reason: "MANIFEST_UNREADABLE" };
    if (info.size > MAX_MANIFEST_BYTES) return { reason: "MANIFEST_TOO_LARGE" };
    const buffer = Buffer.alloc(MAX_MANIFEST_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        length,
        buffer.length - length,
        null,
      );
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > MAX_MANIFEST_BYTES) return { reason: "MANIFEST_TOO_LARGE" };
    try {
      return {
        value: JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            buffer.subarray(0, length),
          ),
        ),
      };
    } catch {
      return { reason: "MANIFEST_INVALID_JSON" };
    }
  } catch {
    return { reason: "MANIFEST_UNREADABLE" };
  } finally {
    await file?.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 68 || args.some((arg) => arg.length > 4096))
    return rejected("INVALID_ARGUMENTS");
  if (args.length === 0) {
    return assessEvaluationCorpus(
      EVALUATION_CORPUS_DEMO.manifest,
      EVALUATION_CORPUS_DEMO.actor,
      EVALUATION_CORPUS_DEMO.asOf,
    );
  }

  let path: string | undefined;
  let asOf: string | undefined;
  const groups: string[] = [];
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!value || value.startsWith("--")) return rejected("INVALID_ARGUMENTS");
    if (option === "--manifest" && path === undefined) path = value;
    else if (option === "--as-of" && asOf === undefined) asOf = value;
    else if (option === "--group" && groups.length < 32) groups.push(value);
    else return rejected("INVALID_ARGUMENTS");
  }
  if (!path || !asOf || groups.length === 0)
    return rejected("INVALID_ARGUMENTS");

  const input = await readManifest(path);
  if ("reason" in input) return rejected(input.reason);
  return assessEvaluationCorpus(input.value, { groups }, asOf);
}

void main()
  .then((result) => {
    process.stdout.write(JSON.stringify(result) + "\n");
    process.exitCode =
      result.status === "assessed" && result.excludedCount === 0 ? 0 : 1;
  })
  .catch(() => {
    process.stdout.write(JSON.stringify(rejected("INTERNAL_ERROR")) + "\n");
    process.exitCode = 1;
  });
