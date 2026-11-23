import { isAbsolute } from "node:path";
import { defineConfig } from "vite";

const privateMode = process.env.RESUMIDE_PRIVATE_VERIFY;
if (privateMode !== undefined && privateMode !== "aa7-owned-synthetic")
  throw new Error("Invalid private verification mode");

export default defineConfig({
  envDir: privateMode === "aa7-owned-synthetic" ? false : undefined,
  build: {
    target: "node22",
    outDir: "build/worker",
    emptyOutDir: true,
    lib: {
      entry: "scripts/run-worker.ts",
      formats: ["es"],
      fileName: () => "analysis.mjs",
    },
    rollupOptions: {
      // Bundle application TS, retain production package imports (including
      // the PDF engine's runtime assets) for Node to resolve normally.
      external: (id) => !id.startsWith(".") && !isAbsolute(id),
    },
  },
});
