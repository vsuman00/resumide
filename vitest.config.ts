import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const privateMode = process.env.RESUMIDE_PRIVATE_VERIFY;
if (privateMode !== undefined && privateMode !== "aa7-owned-synthetic")
  throw new Error("Invalid private verification mode");

export default defineConfig({
  envDir: privateMode === "aa7-owned-synthetic" ? false : undefined,
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/components/**/*.test.tsx",
    ],
    exclude: ["**/._*"],
    restoreMocks: true,
  },
});
