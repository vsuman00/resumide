import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout } from "node:timers";

// Keep web and queue processing together in development. Fail visibly rather
// than leaving an apparently healthy web process accepting unprocessed uploads.
const children = [
  spawn(
    process.execPath,
    ["node_modules/@react-router/dev/bin.js", "dev", ...process.argv.slice(2)],
    { stdio: "inherit" },
  ),
  spawn(
    process.execPath,
    [
      "node_modules/vite-node/vite-node.mjs",
      "--config",
      "vitest.config.ts",
      "scripts/run-worker.ts",
    ],
    { stdio: "inherit" },
  ),
];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children)
    if (child.exitCode === null) child.kill("SIGTERM");
  const deadline = setTimeout(() => {
    for (const child of children)
      if (child.exitCode === null) child.kill("SIGKILL");
  }, 10_000);
  deadline.unref();
}
for (const child of children) {
  child.once("error", () => stop(1));
  child.once("exit", (code) => stop(code ?? 1));
}
process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));
