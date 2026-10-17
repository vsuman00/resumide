import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  // Keep React Router's framework components and React DOM on the same React
  // instance. Without this, Vite's dependency optimizer can load a second
  // copy in development and hooks used by <Meta /> fail at runtime.
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  // These are reached through lazy route modules. Prebundle them before the
  // first navigation so opening Upload does not replace the dependency graph
  // underneath an already mounted React tree.
  optimizeDeps: {
    include: [
      "react",
      "react-dom/client",
      "react-router",
      "react-dropzone",
      "zustand",
      "clsx",
      "tailwind-merge",
      "@supabase/ssr",
      "@supabase/supabase-js",
      "zod",
    ],
  },
});
