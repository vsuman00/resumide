const root =
  "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats";
const owned =
  "/Users/vaibhavsuman/.codex/worktrees/aa7-20261106-licenses/resume_ats/tasks/agent-handoffs/2026-11-09-consumer-ats";
if (process.env.RESUMIDE_PRIVATE_VERIFY !== "aa7-owned-synthetic") {
  throw new Error("Private synthetic review mode required");
}
export default {
  root: owned,
  envDir: false,
  cacheDir: `${owned}/.vite`,
  resolve: { alias: { "~": `${root}/app` } },
  server: { fs: { allow: [root, owned] } },
};
