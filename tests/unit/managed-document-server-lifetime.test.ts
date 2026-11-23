import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const preload = fileURLToPath(
  new URL(
    "../../scripts/managed-document-server-lifetime.mjs",
    import.meta.url,
  ),
);
const server = `
  const { createServer } = require("node:http");
  const app = createServer((_request, response) => response.end("synthetic-ready"));
  process.once("SIGTERM", () => app.close());
  app.listen(0, "127.0.0.1", () => process.send(app.address().port));
`;
const env = { PATH: process.env.PATH };

function killFixture(pid: number) {
  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

describe("document worker local app lifetime", () => {
  it("refuses direct entry without the owning IPC channel", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", preload, "-e", "process.stdout.write('unexpected startup')"],
      { env, encoding: "utf8", timeout: 3_000 },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
  });

  it("drains a listening app after the verifier explicitly disconnects", async () => {
    const child = spawn(process.execPath, ["--import", preload, "-e", server], {
      env,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    const closed = once(child, "exit");
    try {
      const [port] = await once(child, "message");
      const url = `http://127.0.0.1:${port}`;
      expect(
        await (await fetch(url, { headers: { Connection: "close" } })).text(),
      ).toBe("synthetic-ready");
      child.disconnect();
      await expect(closed).resolves.toEqual([0, null]);
      await expect(
        fetch(url, { signal: AbortSignal.timeout(1_000) }),
      ).rejects.toThrow();
    } finally {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      await closed;
    }
  });

  it("closes the owned app socket after abrupt supervisor death", async () => {
    const code = `
      const { spawn } = require("node:child_process");
      const app = spawn(process.execPath, ["--import", ${JSON.stringify(preload)}, "-e", ${JSON.stringify(server)}], {
        env: { PATH: process.env.PATH },
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      });
      app.on("message", (port) => process.send({ port, pid: app.pid }));
    `;
    const supervisor = spawn(process.execPath, ["-e", code], {
      env,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    const closed = once(supervisor, "exit");
    let ownedPid: number | undefined;
    let stopped = false;
    try {
      const [{ port, pid }] = await once(supervisor, "message");
      ownedPid = pid;
      const url = `http://127.0.0.1:${port}`;
      expect(
        await (await fetch(url, { headers: { Connection: "close" } })).text(),
      ).toBe("synthetic-ready");
      supervisor.kill("SIGKILL");
      await expect(closed).resolves.toEqual([null, "SIGKILL"]);
      await expect
        .poll(
          async () => {
            try {
              const reply = await fetch(url, {
                headers: { Connection: "close" },
                signal: AbortSignal.timeout(250),
              });
              await reply.body?.cancel();
              return false;
            } catch {
              return true;
            }
          },
          { timeout: 2_000 },
        )
        .toBe(true);
      await expect
        .poll(
          () => {
            const state = spawnSync(
              "ps",
              ["-o", "stat=", "-p", String(ownedPid)],
              {
                env,
                encoding: "utf8",
                timeout: 1_000,
              },
            );
            return state.status === 1 || state.stdout.trim().startsWith("Z");
          },
          { timeout: 2_000 },
        )
        .toBe(true);
      stopped = true;
    } finally {
      if (supervisor.exitCode === null && supervisor.signalCode === null)
        supervisor.kill("SIGKILL");
      if (!stopped && ownedPid) killFixture(ownedPid);
      await closed;
    }
  });
});
