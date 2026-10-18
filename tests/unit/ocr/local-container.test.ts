import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLocalContainerOcrAdapter,
  LOCAL_OCR_VERSIONS,
  type DockerCommand,
} from "../../../app/lib/server/ocr/local-container";
import type { SelectiveOcrRequest } from "../../../app/lib/server/ocr/selective";
import { TEXT_FUSION_VERSIONS } from "../../../app/lib/server/ocr/profiles";

const bytes = new TextEncoder().encode("%PDF-synthetic");
const imageId = `sha256:${"a".repeat(64)}`;
const containerId = "b".repeat(64);
const request = {
  schemaVersion: "selective-ocr-request-v1",
  attemptId: "00000000-0000-4000-8000-000000000001",
  ownerId: "00000000-0000-4000-8000-000000000002",
  analysisId: "00000000-0000-4000-8000-000000000003",
  sourceId: "00000000-0000-4000-8000-000000000004",
  createdAt: "2026-10-04T12:00:00.000Z",
  retentionPolicyId: "synthetic-local-30d/1.0.0",
  sourceSha256: createHash("sha256").update(bytes).digest("hex"),
  nativePageTexts: [""],
  selectedPages: [{ pageId: "page-1", pageNumber: 1 }],
  remainingDeadlineMs: 1000,
  limits: { maxCharacters: 100_000, maxPages: 10 },
  allocation: {
    id: "local-test",
    maxWallTimeMs: 1000,
    maxPages: 10,
    externalApiFeeMicros: 0,
  },
  policy: {
    executionMode: "self_hosted",
    purpose: "synthetic_local_test",
    allowThirdPartyProcessing: false,
  },
} as SelectiveOcrRequest;

function mockDocker() {
  let ownership = "";
  const calls: string[][] = [];
  const command: DockerCommand = vi.fn(async (args) => {
    calls.push([...args]);
    if (args[0] === "create") {
      ownership = args[args.indexOf("--label") + 1].split("=")[1];
      return containerId;
    }
    if (args[0] === "inspect") return `${containerId} ${ownership}`;
    if (args[0] === "start")
      return JSON.stringify({ durationMs: 1, pages: [] });
    return "";
  });
  return { command, calls };
}

describe("isolated local OCR container", () => {
  afterEach(() => vi.useRealTimers());
  it("identifies the fixed two-model text profile", async () => {
    const { command, calls } = mockDocker();
    const adapter = createLocalContainerOcrAdapter({
      bytes,
      imageId,
      command,
      evaluationConfig: { psm: 3, maxDpi: 150, model: "text-fusion" },
    });
    await adapter.recognize(request, new AbortController().signal);
    expect(calls[0].slice(-5)).toEqual([
      imageId,
      "1",
      "3",
      "150",
      "text-fusion",
    ]);
    expect(adapter.versions).toEqual(TEXT_FUSION_VERSIONS);
  });

  it.each([undefined, 2] as const)(
    "pins best model with threshold %s and fixed internal paths",
    async (thresholdingMethod) => {
      const { command, calls } = mockDocker();
      const adapter = createLocalContainerOcrAdapter({
        bytes,
        imageId,
        command,
        evaluationConfig: {
          psm: 3,
          maxDpi: 150,
          model: "best",
          ...(thresholdingMethod === undefined ? {} : { thresholdingMethod }),
        },
      });
      await adapter.recognize(request, new AbortController().signal);
      const expected = [
        imageId,
        "1",
        "3",
        "150",
        ...(thresholdingMethod === undefined ? [] : ["2"]),
        "best",
      ];
      expect(calls[0].slice(-expected.length)).toEqual(expected);
      expect(adapter.versions.languageData).toBe(
        "sha256:8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba",
      );
      expect(adapter.versions.engine).toBe(
        LOCAL_OCR_VERSIONS.engine +
          "/lstm-best" +
          (thresholdingMethod === undefined ? "" : "/sauvola"),
      );
      const dockerfile = readFileSync("scripts/ocr-runtime/Dockerfile", "utf8");
      expect(dockerfile).toContain(
        "--checksum=" + adapter.versions.languageData,
      );
      expect(dockerfile).toContain(
        "e2aad9b983032bb1beff9133104a67cdbb87ca4d/eng.traineddata",
      );
    },
  );

  it.each([
    [1, "leptonica-otsu"],
    [2, "sauvola"],
  ] as const)(
    "identifies and passes threshold method %i",
    async (thresholdingMethod, suffix) => {
      const { command, calls } = mockDocker();
      const adapter = createLocalContainerOcrAdapter({
        bytes,
        imageId,
        command,
        evaluationConfig: { psm: 3, maxDpi: 150, thresholdingMethod },
      });
      await adapter.recognize(request, new AbortController().signal);
      expect(calls[0].slice(-5)).toEqual([
        imageId,
        "1",
        "3",
        "150",
        String(thresholdingMethod),
      ]);
      expect(adapter.versions.engine).toBe(
        LOCAL_OCR_VERSIONS.engine + "/" + suffix,
      );
      expect(adapter.versions.renderer).toBe(
        LOCAL_OCR_VERSIONS.renderer + "/dpi-150",
      );
    },
  );

  it("preserves original default argv and metadata for explicit 3/300 evaluation config", async () => {
    const { command, calls } = mockDocker();
    const adapter = createLocalContainerOcrAdapter({
      bytes,
      imageId,
      command,
      evaluationConfig: { psm: 3, maxDpi: 300 },
    });
    await adapter.recognize(request, new AbortController().signal);
    expect(calls[0].slice(-2)).toEqual([imageId, "1"]);
    expect(adapter.versions).toEqual(LOCAL_OCR_VERSIONS);
  });

  it.each([
    [3, 150],
    [6, 150],
    [6, 300],
  ] as const)(
    "passes allowlisted PSM %i / DPI %i as fixed argv with identifiable metadata",
    async (psm, maxDpi) => {
      const { command, calls } = mockDocker();
      const adapter = createLocalContainerOcrAdapter({
        bytes,
        imageId,
        command,
        evaluationConfig: { psm, maxDpi },
      });
      await adapter.recognize(request, new AbortController().signal);
      expect(calls[0].slice(-4)).toEqual([
        imageId,
        "1",
        String(psm),
        String(maxDpi),
      ]);
      expect(adapter.versions.engine).toBe(
        LOCAL_OCR_VERSIONS.engine + (psm === 3 ? "" : "/psm-6"),
      );
      expect(adapter.versions.renderer).toBe(
        LOCAL_OCR_VERSIONS.renderer + (maxDpi === 300 ? "" : "/dpi-150"),
      );
      expect(adapter.versions.languageData).toBe(
        LOCAL_OCR_VERSIONS.languageData,
      );
    },
  );

  it.each([
    { psm: 7, maxDpi: 300 },
    { psm: 3, maxDpi: 301 },
    { psm: "3;echo", maxDpi: 300 },
    { psm: 3, maxDpi: NaN },
    { psm: 3, maxDpi: 300, flags: "--any" },
    { psm: 3, maxDpi: 150, thresholdingMethod: 0 },
    { psm: 3, maxDpi: 150, thresholdingMethod: 3 },
    { psm: 3, maxDpi: 150, thresholdingMethod: "2;echo" },
    { psm: 3, maxDpi: 150, model: "/host/data" },
    { psm: 3, maxDpi: 150, model: "best --any" },
    { psm: 3, maxDpi: 150, model: "fast" },
    { psm: 6, maxDpi: 150, model: "text-fusion" },
    { psm: 3, maxDpi: 300, model: "text-fusion" },
    { psm: 3, maxDpi: 150, model: "text-fusion", thresholdingMethod: 2 },
  ])(
    "rejects non-allowlisted evaluation configuration %# before invocation",
    (evaluationConfig) => {
      const { command } = mockDocker();
      expect(() =>
        createLocalContainerOcrAdapter({
          bytes,
          imageId,
          command,
          evaluationConfig: evaluationConfig as never,
        }),
      ).toThrow();
      expect(command).not.toHaveBeenCalled();
    },
  );

  it("makes its root-owned entrypoint explicitly readable by the non-root runtime", () => {
    const dockerfile = readFileSync("scripts/ocr-runtime/Dockerfile", "utf8");
    expect(dockerfile).toContain(
      "COPY --chown=root:root --chmod=0444 runner.py /opt/ocr-runner.py",
    );
    expect(dockerfile).toContain("USER 10001:10001");
  });

  it("resolves its owned name for cleanup after malformed create output", async () => {
    const { command, calls } = mockDocker();
    const wrapped: DockerCommand = async (args, options) => {
      const result = await command(args, options);
      return args[0] === "create" ? "malformed private diagnostics" : result;
    };
    await expect(
      createLocalContainerOcrAdapter({
        bytes,
        imageId,
        command: wrapped,
      }).recognize(request, new AbortController().signal),
    ).rejects.toMatchObject({ code: "engine_failure" });
    expect(calls.at(-1)).toEqual(["rm", "--force", containerId]);
    expect(
      calls.some((args) => args.includes("malformed private diagnostics")),
    ).toBe(false);
  });

  it("bounds concurrent attempts to two and releases capacity after cancellation", async () => {
    vi.useFakeTimers();
    const firstController = new AbortController();
    const secondController = new AbortController();
    const pending = [firstController, secondController].map((controller) => {
      const { command } = mockDocker();
      const wrapped: DockerCommand = async (args, options) => {
        if (args[0] !== "start") return command(args, options);
        return new Promise((_resolve, reject) =>
          options.signal?.addEventListener(
            "abort",
            () => reject(new Error("cancelled")),
            { once: true },
          ),
        );
      };
      return createLocalContainerOcrAdapter({
        bytes,
        imageId,
        command: wrapped,
      })
        .recognize(request, controller.signal)
        .catch((error: unknown) => error);
    });
    await vi.advanceTimersByTimeAsync(0);
    const { command } = mockDocker();
    await expect(
      createLocalContainerOcrAdapter({ bytes, imageId, command }).recognize(
        request,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "resource_limit" });
    expect(command).not.toHaveBeenCalled();
    firstController.abort();
    secondController.abort();
    for (const result of await Promise.all(pending))
      expect(result).toMatchObject({ code: "cancelled" });
    await createLocalContainerOcrAdapter({ bytes, imageId, command }).recognize(
      request,
      new AbortController().signal,
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refuses invalid inherited limits before any Docker command", async () => {
    const { command } = mockDocker();
    const adapter = createLocalContainerOcrAdapter({ bytes, imageId, command });
    await expect(
      adapter.recognize(
        { ...request, limits: { maxPages: 0, maxCharacters: 1 } },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "engine_failure" });
    expect(command).not.toHaveBeenCalled();
  });

  it("aborts active execution and removes its owned container on deadline", async () => {
    vi.useFakeTimers();
    const { command, calls } = mockDocker();
    let started = false;
    let recognitionSignal: AbortSignal | undefined;
    const wrapped: DockerCommand = async (args, options) => {
      if (args[0] !== "start") return command(args, options);
      started = true;
      recognitionSignal = options.signal;
      return new Promise((_resolve, reject) =>
        options.signal?.addEventListener(
          "abort",
          () => reject(new Error("untrusted private diagnostics")),
          { once: true },
        ),
      );
    };
    const result = createLocalContainerOcrAdapter({
      bytes,
      imageId,
      command: wrapped,
    })
      .recognize(request, new AbortController().signal)
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toMatchObject({ code: "timeout", message: "timeout" });
    expect(recognitionSignal?.aborted).toBe(true);
    expect(calls.at(-1)).toEqual(["rm", "--force", containerId]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("uses fixed isolation argv, PDF stdin and exact-owned cleanup", async () => {
    const { command, calls } = mockDocker();
    const adapter = createLocalContainerOcrAdapter({ bytes, imageId, command });
    await adapter.recognize(request, new AbortController().signal);
    const create = calls[0];
    for (const flag of [
      "--read-only",
      "--cap-drop=ALL",
      "--network=none",
      "--security-opt=no-new-privileges",
      "--memory=1g",
      "--memory-swap=1g",
      "--cpus=2",
      "--pids-limit=64",
      "--log-driver=none",
      "--pull=never",
    ])
      expect(create).toContain(flag);
    expect(create).toContain("--user=10001:10001");
    expect(create.join(" ")).not.toMatch(
      /--privileged|--volume|--mount|docker.sock|--env-file/,
    );
    expect(command).toHaveBeenCalledWith(
      ["start", "--attach", "--interactive", containerId],
      expect.objectContaining({ input: bytes }),
    );
    expect(calls.at(-1)).toEqual(["rm", "--force", containerId]);
  });

  it("rejects unpinned images and mismatched bytes before any Docker command", async () => {
    const { command } = mockDocker();
    expect(() =>
      createLocalContainerOcrAdapter({ bytes, imageId: "latest", command }),
    ).toThrow();
    const adapter = createLocalContainerOcrAdapter({ bytes, imageId, command });
    await expect(
      adapter.recognize(
        { ...request, sourceSha256: "0".repeat(64) },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "engine_failure" });
    expect(command).not.toHaveBeenCalled();
  });

  it("never removes a container whose ownership label mismatches", async () => {
    const { command, calls } = mockDocker();
    const wrapped: DockerCommand = async (args, options) =>
      args[0] === "inspect"
        ? `${containerId} another-owner`
        : command(args, options);
    await expect(
      createLocalContainerOcrAdapter({
        bytes,
        imageId,
        command: wrapped,
      }).recognize(request, new AbortController().signal),
    ).rejects.toMatchObject({ code: "engine_failure" });
    expect(calls.some((args) => args[0] === "start" || args[0] === "rm")).toBe(
      false,
    );
  });

  it("cleans up exact-owned container after engine failure without exposing diagnostics", async () => {
    const { command, calls } = mockDocker();
    const wrapped: DockerCommand = async (args, options) => {
      if (args[0] === "start") throw new Error("private document text");
      return command(args, options);
    };
    await expect(
      createLocalContainerOcrAdapter({
        bytes,
        imageId,
        command: wrapped,
      }).recognize(request, new AbortController().signal),
    ).rejects.toMatchObject({
      code: "engine_failure",
      message: "engine_failure",
    });
    expect(calls.at(-1)).toEqual(["rm", "--force", containerId]);
  });
});
