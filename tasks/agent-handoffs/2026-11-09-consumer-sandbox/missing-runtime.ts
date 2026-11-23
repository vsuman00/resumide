import assert from "node:assert/strict";
import { compileLatex } from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/app/lib/server/latex-sandbox";
import { prepareLatexDocument } from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/app/lib/server/latex-source";
import { assertNoOwnedContainers } from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/scripts/latex-test-fixtures";
await assertNoOwnedContainers();
const started = performance.now();
await assert.rejects(
  compileLatex(
    prepareLatexDocument({
      source:
        "\\documentclass{article}\n\\begin{document}\nNeutral synthetic document.\n\\end{document}",
      profile: "document",
    }),
    {
      imageId:
        "sha256:4b83ffec76083b02a79df7addf5ff1f8e09b6d90135d73915b890b38b7753b16",
    },
  ),
  { code: "runtime_unavailable" },
);
await assertNoOwnedContainers();
console.log(
  JSON.stringify({
    status: "pass",
    evidenceTier: "actual-local-Docker-missing-image-denial",
    code: "runtime_unavailable",
    durationMs: Math.round(performance.now() - started),
    newContainersRemain: false,
    hostCompilerFallback: false,
    requestTimeImagePull: false,
  }),
);
