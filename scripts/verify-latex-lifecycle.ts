import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  compileLatex,
  LatexSandboxError,
  type LatexSandboxCode,
} from "../app/lib/server/latex-sandbox";
import { prepareLatexDocument } from "../app/lib/server/latex-source";
import { inspectLatexPdf, SYNTHETIC_LATEX } from "../tests/fixtures/latex";
import {
  assertLatexIsolation,
  assertNoOwnedContainers,
  docker,
} from "./latex-test-fixtures";

const fixture = prepareLatexDocument({
  source: SYNTHETIC_LATEX,
  profile: "document",
});

function requireCode(value: unknown, code: LatexSandboxCode) {
  assert(
    value instanceof LatexSandboxError && value.code === code,
    `Expected compiler result ${code}`,
  );
}

async function runningWorkers(
  host: string,
  imageId: string,
  started: string,
  expected: number,
) {
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    const active = await docker(
      [
        "--host",
        host,
        "ps",
        "-q",
        "--no-trunc",
        "--filter",
        "label=resumide.latex.service=converter",
      ],
      undefined,
      4096,
      3000,
    );
    assert.equal(active.code, 0);
    const ids = active.stdout.trim().split(/\s+/u).filter(Boolean);
    assert(ids.length <= expected);
    if (ids.length === expected) {
      for (const id of ids) assert.match(id, /^[0-9a-f]{64}$/u);
      const result = await docker(
        ["--host", host, "inspect", ...ids],
        undefined,
        65536,
        3000,
      );
      assert.equal(result.code, 0);
      const containers = JSON.parse(result.stdout);
      const names = new Set(
        (await readFile(started, "utf8")).trim().split("\n"),
      );
      assert.deepEqual(
        containers.map((row: { Id: string }) => row.Id),
        ids,
      );
      for (const row of containers) {
        assert.equal(row.Image, imageId);
        assert.equal(row.State.Running, true);
        assert.match(row.Name, /^\/resumide-latex-[a-f0-9-]{36}$/u);
        assert(
          names.has(row.Name.slice(1)),
          "Container did not enter through the fixture",
        );
        assertLatexIsolation(row);
      }
      return ids;
    }
    await delay(30);
  }
  throw Error("Expected owned converter did not enter running state");
}

async function reconcileFixtureWorkers(
  host: string,
  imageId: string,
  started: string,
) {
  const names = [
    ...new Set(
      (await readFile(started, "utf8")).trim().split("\n").filter(Boolean),
    ),
  ];
  const outcomes = await Promise.allSettled(
    names.map(async (name) => {
      assert.match(name, /^resumide-latex-[a-f0-9-]{36}$/u);
      const inspect = await docker(
        ["--host", host, "container", "inspect", name],
        undefined,
        65536,
        5000,
      );
      if (
        inspect.code === 1 &&
        /No such (object|container)/iu.test(inspect.stderr)
      )
        return;
      assert.equal(inspect.code, 0);
      const [worker] = JSON.parse(inspect.stdout);
      assert.match(worker.Id, /^[0-9a-f]{64}$/u);
      assert.equal(worker.Name, `/${name}`);
      assert.equal(worker.Image, imageId);
      assert.equal(worker.Config.Labels["resumide.latex.service"], "converter");
      assertLatexIsolation(worker);
      try {
        if (worker.State.Paused === true)
          await docker(
            ["--host", host, "unpause", worker.Id],
            undefined,
            4096,
            5000,
          );
        await docker(
          ["--host", host, "rm", "-f", worker.Id],
          undefined,
          4096,
          5000,
        );
        const remaining = await docker(
          [
            "--host",
            host,
            "container",
            "inspect",
            "--format",
            "{{.Id}}",
            worker.Id,
          ],
          undefined,
          4096,
          5000,
        );
        assert.equal(remaining.code, 1);
        assert.match(remaining.stderr, /No such (object|container)/iu);
      } catch (cause) {
        throw Error(`Fixture worker ${worker.Id} absence is unverified`, {
          cause,
        });
      }
    }),
  );
  const failures = outcomes.flatMap((result, index) =>
    result.status === "rejected"
      ? [
          Error(`Could not reconcile fixture worker ${names[index]}`, {
            cause: result.reason,
          }),
        ]
      : [],
  );
  if (failures.length)
    throw new AggregateError(failures, "Fixture worker cleanup incomplete");
}

export async function verifyLatexLifecycle(imageId: string) {
  assert.match(imageId, /^sha256:[0-9a-f]{64}$/u);
  const host =
    process.env.DOCKER_HOST ??
    (
      await docker(
        ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
        undefined,
        4096,
        5000,
      )
    ).stdout.trim();
  assert.match(
    host,
    /^unix:\/\/\/[^\r\n]+$/u,
    "Lifecycle verification requires a local Docker socket",
  );
  await assertNoOwnedContainers(host);
  const early = new AbortController();
  const earlyResult = compileLatex(fixture, { imageId, signal: early.signal });
  early.abort();
  await assert.rejects(earlyResult, (error: unknown) => {
    requireCode(error, "cancelled");
    return true;
  });
  await assertNoOwnedContainers(host);

  const directory = await mkdtemp(join(tmpdir(), "resumide-latex-lifecycle-"));
  const fifo = join(directory, "hold-stdin");
  const names = join(directory, "started-containers");
  const previousPath = process.env.PATH;
  const pending: Array<{
    controller: AbortController;
    outcome: Promise<unknown>;
  }> = [];
  const launch = () => {
    const controller = new AbortController();
    const outcome = compileLatex(fixture, {
      imageId,
      signal: controller.signal,
    }).then(
      (result) => result,
      (error: unknown) => error,
    );
    const run = { controller, outcome };
    pending.push(run);
    return run;
  };
  const keepers: Array<Awaited<ReturnType<typeof open>>> = [];
  let elapsedMs = 0;
  let armed = false;
  try {
    const cli = execFileSync("/usr/bin/which", ["docker"], {
      encoding: "utf8",
      timeout: 3000,
    }).trim();
    assert(isAbsolute(cli) && !cli.includes("\n"));
    execFileSync("mkfifo", ["-m", "600", fifo], { timeout: 3000 });
    keepers.push(await open(fifo, constants.O_RDONLY | constants.O_NONBLOCK));
    keepers.push(await open(fifo, constants.O_WRONLY | constants.O_NONBLOCK));
    await writeFile(names, "", { mode: 0o600, flag: "wx" });
    const quote = (text: string) => "'" + text.replaceAll("'", "'\\''") + "'";
    // Replace only the input stream of the real attach client. The wrapper has the same PID after exec.
    await writeFile(
      join(directory, "docker"),
      [
        "#!/bin/sh",
        'if [ "$#" = 4 ] && [ "$1" = start ] && [ "$2" = -a ] && [ "$3" = -i ]; then',
        `  printf '%s\\n' "$4" >> ${quote(names)} || exit 1`,
        `  exec ${quote(cli)} "$@" < ${quote(fifo)}`,
        "fi",
        `exec ${quote(cli)} "$@"`,
        "",
      ].join("\n"),
      { mode: 0o700, flag: "wx" },
    );
    process.env.PATH = `${directory}:${previousPath ?? "/usr/bin:/bin"}`;
    armed = true;

    const active = launch();
    await runningWorkers(host, imageId, names, 1);
    active.controller.abort();
    requireCode(await active.outcome, "cancelled");
    await assertNoOwnedContainers(host);

    const started = performance.now();
    const timed = launch();
    const [id] = await runningWorkers(host, imageId, names, 1);
    assert.equal(
      (await docker(["--host", host, "pause", id], undefined, 4096, 5000)).code,
      0,
    );
    const state = await docker(
      ["--host", host, "inspect", "--format", "{{.State.Paused}}", id],
      undefined,
      4096,
      5000,
    );
    assert.equal(state.code, 0);
    assert.equal(state.stdout.trim(), "true");
    requireCode(await timed.outcome, "timeout");
    elapsedMs = Math.round(performance.now() - started);
    await assertNoOwnedContainers(host);

    const concurrent = [launch(), launch()];
    await runningWorkers(host, imageId, names, 2);
    await assert.rejects(
      compileLatex(fixture, { imageId }),
      (error: unknown) => {
        requireCode(error, "busy");
        return true;
      },
    );
    concurrent.forEach(({ controller }) => controller.abort());
    for (const { outcome } of concurrent)
      requireCode(await outcome, "cancelled");
    await assertNoOwnedContainers(host);
  } catch (error) {
    pending.forEach(({ controller }) => controller.abort());
    await Promise.all(pending.map(({ outcome }) => outcome));
    try {
      if (armed) await reconcileFixtureWorkers(host, imageId, names);
    } catch (reconcileError) {
      throw new AggregateError(
        [error, reconcileError],
        "Lifecycle verification and fixture cleanup failed",
      );
    }
    throw error;
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    try {
      await Promise.all(keepers.map((file) => file.close()));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  const recovered = await compileLatex(fixture, { imageId });
  const parsed = await inspectLatexPdf(recovered.pdf);
  assert.equal(recovered.pages, 2);
  assert.equal(parsed.pages, recovered.pages);
  assert(parsed.text.trim());
  await assertNoOwnedContainers(host);
  return [
    { name: "production-cancel-cleanup", pass: true },
    { name: "active-production-cancellation-cleanup", pass: true },
    { name: "real-paused-worker-wall-timeout-cleanup", pass: true, elapsedMs },
    { name: "actual-two-active-admission-and-cleanup", pass: true },
    {
      name: "same-process-benign-recovery",
      pass: true,
      pages: recovered.pages,
      pdfSha256: createHash("sha256").update(recovered.pdf).digest("hex"),
    },
  ];
}
