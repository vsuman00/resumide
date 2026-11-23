import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { expect } from "@playwright/test";
import { withLocalFixtureBrowser } from "./local-fixture-browser";
import { localBrowserAccount } from "./local-postgres-supabase";

const image =
  "sha256:5e5c2436bcac0a97c4616d7392d1089ecf7ef7d6d5df9063c02e4498d1e0d431";
const authOrigin = "https://local-build.invalid";
const docker = process.argv[2];
assert.equal(process.argv.length, 3);
assert.match(docker, /^\/[A-Za-z0-9_./-]+\/docker$/u);
assert.equal(process.env.RESUMIDE_PRIVATE_VERIFY, "aa7-owned-synthetic");
assert.equal(process.env.SUPABASE_URL, authOrigin);
assert.equal(process.env.SUPABASE_PUBLISHABLE_KEY, "synthetic-build-fixture");
assert.equal(process.env.SUPABASE_SECRET_KEY, "synthetic-build-fixture");
assert.equal(process.env.OPENAI_API_KEY, "build-ai-harness-no-live-key");
assert.equal(process.env.AI_ENABLED, "false");
assert.equal(process.env.LATEX_CONVERTER_ENABLED, "true");
assert.equal(process.env.LATEX_COMPILER_IMAGE, image);
assert.equal(process.env.DOCKER_HOST, undefined);
assert.equal(process.env.DOCKER_CONTEXT, undefined);
const dockerHost = execFileSync(
  docker,
  ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
  { encoding: "utf8", timeout: 5_000 },
).trim();
assert.match(dockerHost, /^unix:\/\/\/[^\r\n]+$/u);
const inspect = ["image", "inspect", "--format", "{{.Id}}", image];
const list = [
  "ps",
  "-aq",
  "--filter",
  "label=resumide.latex.service=converter",
];
const dockerEnv = {
  PATH: "/usr/bin:/bin",
  HOME: process.env.HOME,
  DOCKER_HOST: dockerHost,
};
const dockerRead = {
  encoding: "utf8",
  timeout: 5_000,
  env: dockerEnv,
} as const;
const unavailable = spawnSync(docker, inspect, dockerRead);
assert.equal(unavailable.status, 1);
assert.match(unavailable.stderr, /No such image/u);
assert.equal(execFileSync(docker, list, dockerRead).trim(), "");

const directory = mkdtempSync("/tmp/resumide-build-absent-");
const calls = join(directory, "docker-calls");
const proxy = join(directory, "docker");
const originalPath = process.env.PATH;
const originalFetch = globalThis.fetch;
const ownerId = "69110000-0000-4000-8000-000000000001";
const account = localBrowserAccount(ownerId, "build-missing@example.test");
const userBucket = `latex:user:${createHash("sha256").update(ownerId).digest("hex")}`;
const admissions: string[] = [];
try {
  // Any path beyond the expected read-only preflight fails before it reaches Docker.
  writeFileSync(calls, "", { mode: 0o600 });
  writeFileSync(
    proxy,
    `#!/bin/sh
case "$*" in
  '${list.join(" ")}') echo 'list' >> '${calls}' ;;
  '${inspect.join(" ")}') echo 'inspect' >> '${calls}' ;;
  *) echo 'unexpected' >> '${calls}'; exit 65 ;;
esac
exec '${docker}' "$@"
`,
    { mode: 0o700 },
  );
  process.env.PATH = `${directory}:${originalPath ?? "/usr/bin:/bin"}`;
  process.env.DOCKER_HOST = dockerHost;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, authOrigin);
    const auth = await account.reply(request, url);
    if (auth) return auth;
    assert.equal(request.method, "POST");
    assert.equal(url.pathname, "/rest/v1/rpc/consume_analysis_rate_limit");
    const key = admissions.length % 2 === 0 ? userBucket : "latex:global:v1";
    assert.deepEqual(await request.json(), {
      p_key: key,
      p_limit: key === userBucket ? 3 : 20,
      p_window_seconds: 60,
    });
    admissions.push(key);
    return Response.json(true);
  };

  await withLocalFixtureBrowser(
    { authOrigin, ...account, buildAiEnabled: false },
    "/build",
    async (_context, page, base) => {
      const response = await page.goto(`${base}/build`);
      assert.equal(response?.status(), 200);
      const editor = page.getByRole("textbox", { name: "LaTeX source" });
      const compile = page.getByRole("button", {
        name: "Recompile",
        exact: true,
      });
      const download = page.getByRole("button", { name: "Download PDF" });
      const compilation = page.getByRole("region", {
        name: "Compilation workspace",
      });
      for (const content of [
        "Neutral synthetic document.",
        "Second local edit.",
      ]) {
        const source = [
          "\\documentclass{article}",
          "\\begin{document}",
          content,
          "\\end{document}",
        ].join("\n");
        await editor.fill(source);
        const compileResponse = page.waitForResponse(
          (reply) =>
            reply.url() === `${base}/build/compile` &&
            reply.request().method() === "POST",
        );
        await compile.click();
        const failed = await compileResponse;
        assert.equal(failed.status(), 503);
        assert.match(failed.headers()["cache-control"], /no-store/u);
        assert.equal((await failed.json()).code, "runtime_unavailable");
        await expect(compilation.getByRole("alert")).toContainText(
          "PDF compilation is unavailable right now.",
        );
        await expect(editor).toHaveValue(source);
        await expect(compile).toBeEnabled();
        await expect(download).toBeDisabled();
        await expect(compilation.getByText(/PDF ready/u)).toHaveCount(0);
      }
    },
  );
  assert.equal(admissions.length, 4);
  assert.deepEqual(readFileSync(calls, "utf8").trim().split("\n"), [
    "list",
    "inspect",
    "inspect",
  ]);
  assert.equal(execFileSync(docker, list, dockerRead).trim(), "");
  process.stdout.write(
    JSON.stringify({
      status: "missing_compiler_recovery_verified",
      image,
      scope:
        "local_chromium_simulated_auth_and_rate_admission_real_docker_preflight",
      retryAttempts: 2,
      confirmedAbsentInspections: 2,
      ownedContainersRemaining: 0,
      sourcePreserved: true,
      downloadWithheld: true,
      actualPdfGenerated: false,
    }) + "\n",
  );
} finally {
  globalThis.fetch = originalFetch;
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  delete process.env.DOCKER_HOST;
  unlinkSync(proxy);
  unlinkSync(calls);
  rmdirSync(directory);
}
