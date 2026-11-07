import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnv } from "vite";
import { expect, it, vi } from "vitest";

it("seals real Vite env loading and rejects unsafe private browser configuration", async () => {
  const id = randomUUID();
  const envDirectory = mkdtempSync(join(tmpdir(), "aa7-fake-vite-env-"));
  const directory = `/tmp/resumide-aa7-private-${id}`;
  const ledger = `/tmp/resumide-auth-audit-aa7-unit-${id}.jsonl`;
  const aa7Ledger = `/tmp/resumide-aa7-unit-${id}.jsonl`;
  const evidence = `docs/evaluation/aa7-completion-${id}`;
  const sentinel = `AA7_SENTINEL_${id.replaceAll("-", "")}`;
  mkdirSync(directory, { mode: 0o700 });
  mkdirSync(join(directory, "playwright"), { mode: 0o700 });
  mkdirSync(evidence, { mode: 0o700 });
  writeFileSync(ledger, "", { mode: 0o600, flag: "wx" });
  writeFileSync(aa7Ledger, "", { mode: 0o600, flag: "wx" });
  writeFileSync(
    join(envDirectory, ".env.production"),
    `${sentinel}=synthetic\n`,
  );
  const url = "https://synthetic-project.supabase.co";
  const configs = [
    () => import("../../vite.config"),
    () => import("../../vite.worker.config"),
    () => import("../../vitest.config"),
  ];
  try {
    for (const [name, value] of Object.entries({
      RESUMIDE_PRIVATE_VERIFY: "aa7-owned-synthetic",
      SUPABASE_URL: url,
      BROWSER_TEST_SUPABASE_URL: url,
      BROWSER_SUPABASE_AUTHORIZATION: "synthetic-owned-records-only",
      BROWSER_TEST_LEDGER: ledger,
      AA7_AUTH_RECEIPT_FILE: aa7Ledger,
      AA7_TEST_SUPABASE_URL: url,
      AA7_HOSTED_TEST_AUTHORIZATION: "temporary-synthetic-users-20261030",
      AI_ENABLED: "false",
      OPENAI_API_KEY: "build-ai-harness-no-live-key",
      OPENAI_BASE_URL: "https://api.openai.com/v1",
      LATEX_COMPILER_IMAGE: `sha256:${"a".repeat(64)}`,
      BROWSER_EVIDENCE_DIR: evidence,
      BROWSER_PRIVATE_OUTPUT_DIR: join(directory, "playwright"),
    }))
      vi.stubEnv(name, value);
    vi.resetModules();
    for (const config of configs)
      expect((await config()).default.envDir).toBe(false);
    // Positive control reads only the authored temporary sentinel, never root.env.
    expect(loadEnv("production", envDirectory, "")[sentinel]).toBe("synthetic");
    expect(
      loadEnv("production", (await configs[0]()).default.envDir!, ""),
    ).not.toHaveProperty(sentinel);
    const browser = (await import("../../playwright.config")).default;
    expect(browser.testMatch).toBeUndefined();
    expect(browser).toMatchObject({
      fullyParallel: false,
      workers: 1,
      use: { trace: "off", screenshot: "off" },
      webServer: {
        command:
          "node --import ./scripts/build-ai-test-preload.mjs --experimental-strip-types scripts/server.mjs",
        env: {
          AI_ENABLED: "false",
          OPENAI_API_KEY: "build-ai-harness-no-live-key",
          BUILD_AI_TEST_HARNESS: "selected-context-synthetic-only",
        },
      },
    });
    expect(browser.testIgnore).toContain("**/build-assist.spec.ts");
    const aiBrowser = (await import("../../playwright.build-ai.config"))
      .default;
    expect(aiBrowser).toMatchObject({
      testMatch: "build-assist.spec.ts",
      testIgnore: ["**/._*"],
      use: { trace: "off", screenshot: "off" },
      webServer: {
        env: { AI_ENABLED: "true", BUILD_AI_ASSIST_ENABLED: "true" },
      },
    });
    vi.stubEnv("BROWSER_TEST_SUPABASE_URL", "https://other.supabase.co");
    vi.resetModules();
    await expect(import("../../playwright.config")).rejects.toThrow(
      "Managed browser tests require",
    );
    vi.stubEnv("BROWSER_TEST_SUPABASE_URL", url);
    vi.stubEnv("AA7_AUTH_RECEIPT_FILE", ledger);
    vi.resetModules();
    await expect(import("../../playwright.config")).rejects.toThrow(
      "owned fixture ledgers",
    );
    vi.stubEnv("AA7_AUTH_RECEIPT_FILE", aa7Ledger);
    chmodSync(ledger, 0o644);
    vi.resetModules();
    await expect(import("../../playwright.config")).rejects.toThrow(
      "ledger is not private",
    );
    chmodSync(ledger, 0o600);
    vi.stubEnv("RESUMIDE_PRIVATE_VERIFY", undefined);
    vi.resetModules();
    for (const config of configs)
      expect((await config()).default.envDir).toBeUndefined();
    expect((await import("../../playwright.config")).default).toMatchObject({
      fullyParallel: true,
      use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
      webServer: {
        command:
          "node --env-file-if-exists=.env --experimental-strip-types scripts/server.mjs",
      },
    });
    vi.stubEnv("RESUMIDE_PRIVATE_VERIFY", "wrong-mode");
    vi.resetModules();
    for (const config of [...configs, () => import("../../playwright.config")])
      await expect(config()).rejects.toThrow(
        "Invalid private verification mode",
      );
  } finally {
    vi.unstubAllEnvs();
    vi.resetModules();
    rmSync(envDirectory, { recursive: true });
    rmSync(directory, { recursive: true });
    rmSync(evidence, { recursive: true });
    rmSync(ledger);
    rmSync(aa7Ledger);
  }
});

it("inventories Git-aware source changes and aborts the actual owned process group", () => {
  const directory = mkdtempSync(join(tmpdir(), "aa7-runner-regression-"));
  const moduleUrl = new URL(
    "../../scripts/verify-private-aa7.mjs",
    import.meta.url,
  ).href;
  const program = `
    import { sourceHashes, runCommand } from ${JSON.stringify(moduleUrl)};
    import { execFileSync } from 'node:child_process';
    import { mkdirSync, writeFileSync, readFileSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
    import { setTimeout as delay } from 'node:timers/promises';
    execFileSync('git', ['init', '--quiet']);
    mkdirSync('app'); mkdirSync('app/private');
    mkdirSync('docs/evaluation', {recursive:true});
    writeFileSync('.gitignore', 'app/ignored.ts\\n');
    writeFileSync('app/main.ts', 'export const value = 1;\\n');
    execFileSync('git', ['add', '.gitignore', 'app/main.ts']);
    writeFileSync('app/ignored.ts', 'ignored');
    writeFileSync('app/private/credentials.ts', 'private');
    writeFileSync('.env', 'SECRET=synthetic-only\\n');
    writeFileSync('credentials.json', '{}');
    writeFileSync('docs/evaluation/artifact.json', '{}');
    writeFileSync('app/binary.ts', Buffer.from([0,255]));
    const before = sourceHashes(process.cwd());
    writeFileSync('app/new.ts', 'export const added = true;\\n');
    const added = sourceHashes(process.cwd());
    unlinkSync('app/main.ts');
    const removed = sourceHashes(process.cwd());
    const grandchild = "process.on('SIGTERM',()=>{});require('node:fs').writeFileSync('ready','ready');setInterval(()=>{},1000)";
    writeFileSync('fixture.cjs', "process.on('SIGTERM',()=>{});require('node:child_process').spawn(process.execPath,['-e',"+JSON.stringify(grandchild)+"],{stdio:'ignore'});setInterval(()=>{},1000)");
    const fd = openSync('child.log', 'wx', 0o600);
    const operation = runCommand(process.execPath, ['fixture.cjs'], {
      cwd:process.cwd(),env:process.env,logFd:fd,terminationGraceMs:100,
      onStart(state){writeFileSync('owned.json',JSON.stringify(state),{mode:0o600})},
      onClose(state){writeFileSync('closed.json',JSON.stringify(state),{mode:0o600})}
    });
    for(let i=0;i<80&&!existsSync('ready');i++)await delay(10);
    if(!existsSync('ready'))throw Error('Neutral child did not initialize');
    process.kill(process.pid,'SIGTERM');
    const result = await operation;
    const failure = await runCommand(process.execPath,['-e','process.exit(7)'],{cwd:process.cwd(),env:process.env,logFd:fd});
    closeSync(fd);
    const closed = JSON.parse(readFileSync('closed.json','utf8'));
    process.stdout.write(JSON.stringify({
      tracked:!!before['app/main.ts'],added:!!added['app/new.ts'],deleted:!removed['app/main.ts'],
      excluded:!Object.keys(before).some(x=>/ignored|private|credentials|binary|artifact|^\\.env/.test(x)),
      actualSignal:result.signal,actualCode:result.code,abortRequested:result.abortRequested,failureCode:failure.code,
      groupCleanupConfirmed:result.groupCleanupConfirmed,closeReceiptMatches:closed.code===result.code&&closed.signal===result.signal
    }));
  `;
  try {
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        ["--input-type=module", "--eval", program],
        {
          cwd: directory,
          encoding: "utf8",
          timeout: 4000,
          killSignal: "SIGKILL",
          env: Object.fromEntries(
            ["PATH", "HOME", "TMPDIR", "LANG"]
              .filter((name) => process.env[name] !== undefined)
              .map((name) => [name, process.env[name]!]),
          ),
        },
      ),
    );
    expect(result).toEqual({
      tracked: true,
      added: true,
      deleted: true,
      excluded: true,
      failureCode: 7,
      actualSignal: "SIGKILL",
      actualCode: null,
      abortRequested: "SIGTERM",
      groupCleanupConfirmed: true,
      closeReceiptMatches: true,
    });
  } finally {
    // Exact neutral fixture cleanup if a regression interrupts the helper itself.
    try {
      const owned = JSON.parse(
        readFileSync(join(directory, "owned.json"), "utf8"),
      );
      const identity = execFileSync(
        "ps",
        ["-o", "pid=,pgid=,lstart=", "-p", String(owned.processGroup)],
        { encoding: "utf8" },
      ).trim();
      if (identity && identity === owned.startIdentity)
        process.kill(-owned.processGroup, "SIGKILL");
    } catch (error) {
      expect(
        ["ENOENT", "ESRCH"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        ) || (error as { status?: number }).status === 1,
        "Neutral process fixture cleanup must have an expected absence result",
      ).toBe(true);
    } finally {
      rmSync(directory, { recursive: true });
    }
  }
});
