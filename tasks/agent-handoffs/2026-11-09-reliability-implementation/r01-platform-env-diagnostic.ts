// Offline platform-name diagnostic; no real credential or provider requests.
import { parseLiveProviderEnvironment } from "../../../scripts/verify-reliability-ai-live";
globalThis.fetch = async () => {
  throw new Error("offline_network_forbidden");
};
let accepted = false;
try {
  parseLiveProviderEnvironment(process.env);
  accepted = true;
} catch {
  /* fixed metadata below */
}
process.stdout.write(
  JSON.stringify({
    mode: "offline_names_only",
    accepted,
    environmentNames: Object.keys(process.env).sort(),
    providerRequests: 0,
  }) + "\n",
);
