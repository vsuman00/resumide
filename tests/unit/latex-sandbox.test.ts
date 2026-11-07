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
  replies: { code: number; stdout?: string; after?: () => void }[],
) {
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
        end: () =>
          queueMicrotask(() => {
            (child as unknown as { stdout: EventEmitter }).stdout.emit(
              "data",
              Buffer.from(reply.stdout ?? ""),
            );
            reply.after?.();
            child.emit("close", reply.code);
          }),
      }),
    });
    return child as ReturnType<typeof spawn>;
  });
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
