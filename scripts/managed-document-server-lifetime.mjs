// Loaded only by the managed document verifier's owned app process.
import process from "node:process";
import { setTimeout } from "node:timers";

if (!process.connected)
  throw new Error("Managed document app requires its supervisor connection");

process.once("disconnect", () => {
  // Hand off to the app's normal drain path. The guard also covers an
  // interrupted supervisor that cannot wait for the HTTP server to finish.
  const deadline = setTimeout(() => process.exit(1), 12_000);
  deadline.unref();
  process.kill(process.pid, "SIGTERM");
});
