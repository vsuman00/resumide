import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    throw Error("Unexpected external process during pure preflight");
  }),
}));
import { getLatexExample } from "../../app/lib/latex-converter";
import { prepareLatexDocument } from "../../app/lib/server/latex-source";
import {
  buildLatexContainerArgs,
  compileLatex,
  LATEX_SANDBOX_LIMITS,
} from "../../app/lib/server/latex-sandbox";
const imageId = "sha256:" + "a".repeat(64);
describe("LaTeX sandbox adapter policy (no compiler execution)", () => {
  it("constructs fixed containment/resource arguments without host mounts or secrets", () => {
    const name = `resumide-latex-${randomUUID()}`;
    const args = buildLatexContainerArgs(name, imageId);
    const value = (key: string) => args[args.indexOf(key) + 1];
    expect(args[0]).toBe("run");
    expect(args).toContain("--pull=never");
    expect(args.at(-1)).toBe(imageId);
    expect(value("--name")).toBe(name);
    expect(value("--network")).toBe("none");
    expect(value("--user")).toBe("65532:65532");
    expect(value("--cap-drop")).toBe("ALL");
    expect(value("--security-opt")).toBe("no-new-privileges");
    expect(args).toContain("--read-only");
    expect(args).not.toContain("--pid"); // Docker's default PID namespace is isolated; "private" is not a valid --pid value.
    expect(value("--ipc")).toBe("private");
    expect(value("--cgroupns")).toBe("private");
    expect(value("--memory")).toBe("512m");
    expect(value("--memory-swap")).toBe("512m");
    expect(value("--pids-limit")).toBe("64");
    expect(value("--cpus")).toBe("2");
    expect(value("--log-driver")).toBe("none");
    for (const limit of ["nofile=64:64", "fsize=8388608:8388608", "cpu=10:10"])
      expect(args).toContain(limit);
    expect(value("--tmpfs")).toContain("size=128m");
    for (const forbidden of [
      "--volume",
      "-v",
      "--mount",
      "--env",
      "-e",
      "--env-file",
      "--privileged",
      "--device",
      "--publish",
      "--pid=host",
    ])
      expect(args).not.toContain(forbidden);
    expect(LATEX_SANDBOX_LIMITS.timeoutMs).toBe(20000);
    expect(LATEX_SANDBOX_LIMITS.concurrency).toBe(2);
  });
  it.each([
    "latest",
    "resumide-latex:latest",
    "sha256:abc",
    "sha256:" + "A".repeat(64),
    "sha256:" + "a".repeat(64) + ";id",
  ])("refuses mutable or malformed image reference %s", (image) => {
    expect(() =>
      buildLatexContainerArgs(`resumide-latex-${randomUUID()}`, image),
    ).toThrow();
  });
  it.each([
    "other-container",
    "resumide-latex-../../etc",
    "resumide-latex-$(id)",
  ])("refuses an unsafe container name %s", (name) => {
    expect(() => buildLatexContainerArgs(name, imageId)).toThrow();
  });
  it("revalidates prepared source before any dispatch and handles pre-cancelled work", async () => {
    const prepared = prepareLatexDocument({
      source: getLatexExample("document", "A4"),
      profile: "document",
    });
    await expect(
      compileLatex({ ...prepared, sourceHash: "forged" }, { imageId }),
    ).rejects.toMatchObject({ code: "source_invalid" });
    const controller = new AbortController();
    controller.abort();
    await expect(
      compileLatex(prepared, { imageId, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "cancelled" });
    await expect(
      compileLatex(prepared, { imageId: "mutable:latest" }),
    ).rejects.toMatchObject({ code: "runtime_unavailable" });
    expect(spawn).not.toHaveBeenCalled();
  });
});

function mockDockerReplies(
  replies: {
    code: number;
    stdout?: string;
    stderr?: string;
    after?: () => void;
    defer?: boolean;
    error?: boolean;
  }[],
) {
  const inputWrites: (string | undefined)[] = [],
    releases: (() => void)[] = [];
  vi.mocked(spawn).mockClear();
  vi.mocked(spawn).mockImplementation(() => {
    const reply = replies.shift();
    if (!reply) throw Error("Unexpected Docker dispatch");
    const child = new EventEmitter();
    Object.assign(child, {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
      stdin: Object.assign(new EventEmitter(), {
        end: (input?: string) => {
          inputWrites.push(input);
          const emit = () =>
            queueMicrotask(() => {
              (child as unknown as { stdout: EventEmitter }).stdout.emit(
                "data",
                Buffer.from(reply.stdout ?? ""),
              );
              (child as unknown as { stderr: EventEmitter }).stderr.emit(
                "data",
                Buffer.from(reply.stderr ?? ""),
              );
              if (reply.error)
                child.emit("error", Error("PRIVATE_UNIT_CANARY"));
              reply.after?.();
              child.emit("close", reply.code);
            });
          if (reply.defer) releases.push(emit);
          else emit();
        },
      }),
    });
    return child as ReturnType<typeof spawn>;
  });
  return { inputWrites, releases };
}

describe("LaTeX startup failure recovery", () => {
  it("retries transient startup failure without restarting the server", async () => {
    vi.resetModules();
    vi.stubEnv("DOCKER_HOST", "unix:///synthetic/docker.sock");
    const controller = new AbortController();
    mockDockerReplies([
      { code: 1 },
      { code: 0, after: () => controller.abort() },
    ]);
    const adapter = await import("../../app/lib/server/latex-sandbox");
    const prepared = prepareLatexDocument({
      source: getLatexExample("document", "A4"),
      profile: "document",
    });
    try {
      await expect(
        adapter.compileLatex(prepared, { imageId }),
      ).rejects.toMatchObject({ code: "runtime_unavailable" });
      await expect(
        adapter.compileLatex(prepared, { imageId, signal: controller.signal }),
      ).rejects.toMatchObject({ code: "cancelled" });
      expect(spawn).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("retains quarantine instead of retrying when prior containers exist", async () => {
    vi.resetModules();
    vi.stubEnv("DOCKER_HOST", "unix:///synthetic/docker.sock");
    mockDockerReplies([{ code: 0, stdout: "synthetic-owned-container\n" }]);
    const adapter = await import("../../app/lib/server/latex-sandbox");
    const prepared = prepareLatexDocument({
      source: getLatexExample("document", "A4"),
      profile: "document",
    });
    try {
      await expect(
        adapter.compileLatex(prepared, { imageId }),
      ).rejects.toMatchObject({ code: "cleanup_failed" });
      await expect(
        adapter.compileLatex(prepared, { imageId }),
      ).rejects.toMatchObject({ code: "cleanup_failed" });
      expect(spawn).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

const syntheticPdf = JSON.stringify({
  pdf: Buffer.from("%PDF-" + "x".repeat(120)).toString("base64"),
  pages: 1,
  text: "Neutral synthetic document",
  diagnostics: [],
});
const createdId = "b".repeat(64);
const preparedSynthetic = () =>
  prepareLatexDocument({
    source: getLatexExample("document", "A4"),
    profile: "document",
  });
const commands = () =>
  vi.mocked(spawn).mock.calls.map((call) => call[1] as string[]);

it.each([0, 1])(
  "checks the decoded PDF byte ceiling plus %i",
  async (extra) => {
    vi.resetModules();
    vi.stubEnv("DOCKER_HOST", "unix:///synthetic/docker.sock");
    const bytes = LATEX_SANDBOX_LIMITS.pdfBytes + extra;
    // Test the adapter envelope independently of PDF parsing in the worker.
    const data = Buffer.alloc(bytes);
    data.write("%PDF-");
    mockDockerReplies([
      { code: 0 },
      { code: 0, stdout: imageId },
      { code: 0, stdout: createdId },
      {
        code: 0,
        stdout: JSON.stringify({
          ...JSON.parse(syntheticPdf),
          pdf: data.toString("base64"),
        }),
      },
      { code: 0 },
      { code: 1, stderr: "No such container" },
    ]);
    try {
      const { compileLatex: compile } =
        await import("../../app/lib/server/latex-sandbox");
      const output = compile(preparedSynthetic(), { imageId });
      if (extra === 0) expect((await output).pdf.byteLength).toBe(bytes);
      else
        await expect(output).rejects.toMatchObject({ code: "output_invalid" });
      expect(
        commands()
          .slice(-2)
          .map((args) => args[0]),
      ).toEqual(["rm", "container"]);
    } finally {
      vi.unstubAllEnvs();
    }
  },
);

describe("known image absence before container creation", () => {
  it("reserves capacity for slow image checks and releases it on early exits", async () => {
    vi.resetModules();
    vi.stubEnv("DOCKER_HOST", "unix:///synthetic/docker.sock");
    const missing = { code: 1, stderr: "No such image" };
    const mocked = mockDockerReplies([
      { code: 0 },
      { ...missing, defer: true },
      { ...missing, defer: true },
      missing,
      missing,
    ]);
    const adapter = await import("../../app/lib/server/latex-sandbox");
    const prepared = preparedSynthetic();
    const abort = new AbortController();
    const first = adapter.compileLatex(prepared, {
      imageId,
      signal: abort.signal,
    });
    const second = adapter.compileLatex(prepared, { imageId });
    const settled = Promise.allSettled([first, second]);
    try {
      await vi.waitFor(() => expect(mocked.releases).toHaveLength(2));
      await expect(
        adapter.compileLatex(prepared, { imageId }),
      ).rejects.toMatchObject({
        code: "busy",
      });
      expect(commands().map((args) => args[0])).toEqual([
        "ps",
        "image",
        "image",
      ]);
      abort.abort();
      mocked.releases.splice(0).forEach((release) => release());
      expect(await settled).toMatchObject([
        { status: "rejected", reason: { code: "cancelled" } },
        { status: "rejected", reason: { code: "runtime_unavailable" } },
      ]);
      await expect(
        adapter.compileLatex(prepared, { imageId }),
      ).rejects.toMatchObject({
        code: "runtime_unavailable",
      });
      expect(commands().map((args) => args[0])).toEqual([
        "ps",
        "image",
        "image",
        "image",
      ]);
      expect(mocked.inputWrites.every((input) => input === undefined)).toBe(
        true,
      );
    } finally {
      mocked.releases.splice(0).forEach((release) => release());
      await settled;
      vi.unstubAllEnvs();
    }
  });
  it("reports unavailable with no create/source/cleanup/quarantine, then recovers after image installation", async () => {
    vi.resetModules();
    vi.stubEnv("DOCKER_HOST", "unix:///synthetic/docker.sock");
    const mocked = mockDockerReplies([
      { code: 0 },
      { code: 1, stderr: "No such image PRIVATE_UNIT_CANARY" },
      { code: 0, stdout: imageId + "\n" },
      { code: 0, stdout: createdId },
      { code: 0, stdout: syntheticPdf },
      { code: 0 },
      { code: 1, stderr: "No such container" },
    ]);
    const adapter = await import("../../app/lib/server/latex-sandbox");
    try {
      await expect(
        adapter.compileLatex(preparedSynthetic(), { imageId }),
      ).rejects.toMatchObject({
        code: "runtime_unavailable",
        message: "The isolated compiler is unavailable.",
      });
      expect(commands()).toEqual([
        ["ps", "-aq", "--filter", "label=resumide.latex.service=converter"],
        ["image", "inspect", "--format", "{{.Id}}", imageId],
      ]);
      expect(mocked.inputWrites.every((input) => input === undefined)).toBe(
        true,
      );
      expect(
        await adapter.compileLatex(preparedSynthetic(), { imageId }),
      ).toMatchObject({ pages: 1, text: "Neutral synthetic document" });
      expect(commands().filter((args) => args[0] === "create")).toHaveLength(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it.each([
    { code: 0, stdout: "sha256:" + "c".repeat(64) },
    { code: 0, stdout: imageId + "\nPRIVATE_UNIT_CANARY" },
    { code: 0, stdout: "x".repeat(4097) },
    { code: 1, error: true },
  ])(
    "rejects unknown image admission safely before creation: %j",
    async (reply) => {
      vi.resetModules();
      vi.stubEnv("DOCKER_HOST", "unix:///synthetic/docker.sock");
      const mocked = mockDockerReplies([{ code: 0 }, reply]);
      const adapter = await import("../../app/lib/server/latex-sandbox");
      try {
        await expect(
          adapter.compileLatex(preparedSynthetic(), { imageId }),
        ).rejects.toMatchObject({
          code: "runtime_unavailable",
          message: "The isolated compiler is unavailable.",
        });
        expect(
          commands().some((args) =>
            ["create", "start", "rm", "container"].includes(args[0]),
          ),
        ).toBe(false);
        expect(mocked.inputWrites.every((input) => input === undefined)).toBe(
          true,
        );
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );
  it("rechecks cancellation after image inspection without creating resources", async () => {
    vi.resetModules();
    vi.stubEnv("DOCKER_HOST", "unix:///synthetic/docker.sock");
    const controller = new AbortController();
    mockDockerReplies([
      { code: 0 },
      { code: 0, stdout: imageId, after: () => controller.abort() },
    ]);
    const adapter = await import("../../app/lib/server/latex-sandbox");
    try {
      await expect(
        adapter.compileLatex(preparedSynthetic(), {
          imageId,
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ code: "cancelled" });
      expect(commands().map((args) => args[0])).toEqual(["ps", "image"]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("retains quarantine when image disappearance or daemon ambiguity occurs during create", async () => {
    vi.resetModules();
    vi.stubEnv("DOCKER_HOST", "unix:///synthetic/docker.sock");
    mockDockerReplies([
      { code: 0 },
      { code: 0, stdout: imageId },
      { code: 1, stderr: "No such image PRIVATE_UNIT_CANARY" },
      { code: 0 },
      { code: 1, stderr: "No such container" },
    ]);
    const adapter = await import("../../app/lib/server/latex-sandbox");
    try {
      await expect(
        adapter.compileLatex(preparedSynthetic(), { imageId }),
      ).rejects.toMatchObject({ code: "cleanup_failed" });
      const count = commands().length;
      await expect(
        adapter.compileLatex(preparedSynthetic(), { imageId }),
      ).rejects.toMatchObject({ code: "cleanup_failed" });
      expect(commands()).toHaveLength(count);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

it("limits simultaneous jobs to two image checks and two creates", async () => {
  vi.resetModules();
  vi.stubEnv("DOCKER_HOST", "unix:///synthetic/docker.sock");
  const mocked = mockDockerReplies([
    { code: 0 },
    { code: 0, stdout: imageId },
    { code: 0, stdout: imageId },
    { code: 0, stdout: createdId, defer: true },
    { code: 0, stdout: createdId, defer: true },
    { code: 0, stdout: syntheticPdf },
    { code: 0, stdout: syntheticPdf },
    { code: 0 },
    { code: 0 },
    { code: 1, stderr: "No such container" },
    { code: 1, stderr: "No such container" },
  ]);
  const adapter = await import("../../app/lib/server/latex-sandbox");
  const jobs = Array.from({ length: 3 }, () =>
    adapter.compileLatex(preparedSynthetic(), { imageId }).then(
      (value) => ({ value }),
      (error) => ({ error }),
    ),
  );
  try {
    await vi.waitFor(() =>
      expect(commands().filter((args) => args[0] === "create")).toHaveLength(2),
    );
    expect(await jobs[2]).toMatchObject({ error: { code: "busy" } });
    expect(commands().filter((args) => args[0] === "image")).toHaveLength(2);
    for (const release of mocked.releases) release();
    expect(await Promise.all(jobs.slice(0, 2))).toEqual([
      expect.objectContaining({ value: expect.objectContaining({ pages: 1 }) }),
      expect.objectContaining({ value: expect.objectContaining({ pages: 1 }) }),
    ]);
    expect(commands().filter((args) => args[0] === "create")).toHaveLength(2);
  } finally {
    vi.unstubAllEnvs();
  }
});

it("honors quarantine raised by another request while image inspection was pending", async () => {
  vi.resetModules();
  vi.stubEnv("DOCKER_HOST", "unix:///synthetic/docker.sock");
  const mocked = mockDockerReplies([
    { code: 0 },
    { code: 0, stdout: imageId },
    { code: 0, stdout: createdId },
    { code: 0, stdout: syntheticPdf, defer: true },
    { code: 0, stdout: imageId, defer: true },
    { code: 0 },
    { code: 0, stdout: createdId },
  ]);
  const adapter = await import("../../app/lib/server/latex-sandbox");
  const first = adapter.compileLatex(preparedSynthetic(), { imageId }).then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  try {
    await vi.waitFor(() => expect(mocked.releases).toHaveLength(1));
    const second = adapter.compileLatex(preparedSynthetic(), { imageId }).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await vi.waitFor(() => expect(mocked.releases).toHaveLength(2));
    mocked.releases[0]();
    expect(await first).toMatchObject({ error: { code: "cleanup_failed" } });
    mocked.releases[1]();
    expect(await second).toMatchObject({ error: { code: "cleanup_failed" } });
    expect(commands().filter((args) => args[0] === "create")).toHaveLength(1);
  } finally {
    vi.unstubAllEnvs();
  }
});

describe("structured compiler diagnostics (BX-05)", () => {
  async function compileWith(stdout: string) {
    vi.resetModules();
    vi.stubEnv("DOCKER_HOST", "unix:///synthetic/docker.sock");
    mockDockerReplies([
      { code: 0 },
      { code: 0, stdout: imageId },
      { code: 0, stdout: createdId },
      { code: 0, stdout },
      { code: 0 },
      { code: 1, stderr: "No such container" },
    ]);
    try {
      const { compileLatex: compile } =
        await import("../../app/lib/server/latex-sandbox");
      return await compile(preparedSynthetic(), { imageId }).then(
        (value) => ({ value, error: undefined }),
        (error: unknown) => ({ value: undefined, error }),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  }
  const warning = (line: number | null) => ({
    kind: "overfull_box",
    line,
    severity: "warning",
  });

  it("carries an error diagnostic on the sandbox error", async () => {
    const { error } = await compileWith(
      JSON.stringify({
        error: "compile_failed",
        diagnostic: { kind: "undefined_command", line: 12 },
      }),
    );
    expect(error).toMatchObject({
      code: "compile_failed",
      diagnostic: { kind: "undefined_command", line: 12, severity: "error" },
    });
  });
  it("returns success warnings", async () => {
    const { value } = await compileWith(
      JSON.stringify({
        ...JSON.parse(syntheticPdf),
        diagnostics: [warning(3), warning(9), warning(null)],
      }),
    );
    expect(value?.diagnostics).toHaveLength(3);
    expect(value?.diagnostics[0]).toEqual(warning(3));
  });
  it.each([
    ["a line over 100,000", { diagnostics: [warning(100_001)] }],
    ["an unknown kind", { diagnostics: [{ ...warning(2), kind: "secret" }] }],
    ["extra keys", { diagnostics: [{ ...warning(2), text: "log excerpt" }] }],
    [
      "more than 20 warnings",
      { diagnostics: Array.from({ length: 21 }, (_, i) => warning(i + 1)) },
    ],
  ])("rejects %s as output_invalid", async (_, patch) => {
    const { error } = await compileWith(
      JSON.stringify({ ...JSON.parse(syntheticPdf), ...patch }),
    );
    expect(error).toMatchObject({ code: "output_invalid" });
  });
  it("rejects error replies with extra keys or a bad diagnostic", async () => {
    for (const reply of [
      { error: "compile_failed", log: "x" },
      {
        error: "compile_failed",
        diagnostic: { kind: "other", line: 2, text: "x" },
      },
    ])
      expect((await compileWith(JSON.stringify(reply))).error).toMatchObject({
        code: "output_invalid",
      });
  });
});
