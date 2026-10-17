import { describe, expect, it, vi } from "vitest";
import {
  runSelectiveLocalOcr,
  OcrEvidenceSchema,
  LocalOcrExecutionError,
  type SelectiveOcrRequest,
  type LocalOcrRawResult,
} from "../../../app/lib/server/ocr/selective";

function request(): SelectiveOcrRequest {
  return {
    schemaVersion: "selective-ocr-request-v1",
    attemptId: "10000000-0000-4000-8000-000000000001",
    ownerId: "10000000-0000-4000-8000-000000000002",
    analysisId: "10000000-0000-4000-8000-000000000003",
    sourceId: "10000000-0000-4000-8000-000000000004",
    createdAt: "2026-10-04T12:00:00.000Z",
    retentionPolicyId: "synthetic-local-30d/1.0.0",
    sourceSha256: "a".repeat(64),
    nativePageTexts: ["Usable original native text", ""],
    selectedPages: [{ pageNumber: 2, pageId: "page-2" }],
    remainingDeadlineMs: 1000,
    limits: { maxCharacters: 100_000, maxPages: 10 },
    allocation: {
      id: "local-test-1",
      maxWallTimeMs: 1000,
      maxPages: 10,
      externalApiFeeMicros: 0,
    },
    policy: {
      executionMode: "self_hosted",
      purpose: "synthetic_local_test",
      allowThirdPartyProcessing: false,
    },
  };
}
function raw(): LocalOcrRawResult {
  return {
    durationMs: 10,
    pages: [
      {
        pageNumber: 2,
        pageId: "page-2",
        imageSha256: "b".repeat(64),
        widthPixels: 100,
        heightPixels: 200,
        rotation: 0,
        text: "😀 résumé",
        words: [
          {
            text: "😀",
            start: 0,
            end: 1,
            box: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 },
            confidence: 91,
          },
          {
            text: "résumé",
            start: 2,
            end: 8,
            box: { x: 0.3, y: 0.1, width: 0.4, height: 0.1 },
            confidence: 83,
          },
        ],
      },
    ],
  };
}
function adapter(result = raw()) {
  return {
    versions: {
      engine: "tesseract/5.3.0",
      renderer: "poppler/22.12.0",
      languageData: "eng/sha256-pinned-test",
    },
    recognize: vi.fn(async () => result),
  };
}

describe("selective local OCR contract", () => {
  const resourceUsage = {
    kind: "child_process_rusage" as const,
    cpuTimeMs: 14,
    maxChildRssBytes: 24 * 1024 * 1024,
    rendererCalls: 1,
    recognitionCalls: 1,
  };
  const containerMemoryPeak = {
    kind: "cgroup_v2_memory_peak" as const,
    measuredThrough: "recognition_complete" as const,
    valueBytes: 64 * 1024 * 1024,
    reason: null,
  };
  it.each([
    containerMemoryPeak,
    {
      ...containerMemoryPeak,
      valueBytes: null,
      reason: "cgroup_scope_unverified",
    },
  ])(
    "preserves measured or explicitly unavailable container peak %j",
    async (peak) => {
      const usage = { ...resourceUsage, containerMemoryPeak: peak };
      const result = await runSelectiveLocalOcr(
        request(),
        adapter({ ...raw(), resourceUsage: usage } as LocalOcrRawResult),
      );
      expect(result.status).toBe("review_required");
      expect(result).toHaveProperty("resourceUsage", usage);
      expect(result).toHaveProperty("scoringEligible", false);
    },
  );
  it.each([
    { valueBytes: 0 },
    { valueBytes: -1 },
    { valueBytes: NaN },
    { valueBytes: 1.5 },
    { valueBytes: Number.MAX_SAFE_INTEGER + 1 },
    { valueBytes: null },
    { reason: "cgroup_scope_unverified" },
    { measuredThrough: "container_exit" },
    { kind: "child_rss" },
    { arbitrary: true },
  ])("rejects misleading container memory receipts %j", async (change) => {
    const result = await runSelectiveLocalOcr(
      request(),
      adapter({
        ...raw(),
        resourceUsage: {
          ...resourceUsage,
          containerMemoryPeak: { ...containerMemoryPeak, ...change },
        },
      } as LocalOcrRawResult),
    );
    expect(result).toMatchObject({ status: "failed", code: "invalid_output" });
  });
  it("preserves qualified observed child resource usage without inventing container peak memory", async () => {
    const result = await runSelectiveLocalOcr(
      request(),
      adapter({ ...raw(), resourceUsage }),
    );
    expect(result.status).toBe("review_required");
    expect(result).toHaveProperty("resourceUsage", resourceUsage);
  });
  it.each([
    { cpuTimeMs: NaN },
    { cpuTimeMs: -1 },
    { maxChildRssBytes: 0 },
    { maxChildRssBytes: 1073741825 },
    { rendererCalls: 0 },
    { recognitionCalls: 2 },
    { kind: "container_peak" },
    { arbitrary: true },
  ])(
    "rejects malformed or contradictory observed resource usage %j",
    async (change) => {
      const result = await runSelectiveLocalOcr(
        request(),
        adapter({
          ...raw(),
          resourceUsage: { ...resourceUsage, ...change },
        } as unknown as LocalOcrRawResult),
      );
      expect(result).toMatchObject({
        status: "failed",
        code: "invalid_output",
      });
    },
  );
  it("preserves mixed native pages and original OCR identity with uncalibrated word evidence", async () => {
    const input = request();
    const before = structuredClone(input);
    const runner = adapter();
    const result = await runSelectiveLocalOcr(input, runner);
    expect(result.status).toBe("review_required");
    if (result.status !== "review_required" && result.status !== "insufficient")
      throw new Error("Expected evidence");
    expect(result.schemaVersion).toBe("ocr-evidence-v1");
    expect(result.request.nativePageTexts).toEqual(before.nativePageTexts);
    expect(result.request.createdAt).toBe(before.createdAt);
    expect(result.request.retentionPolicyId).toBe(before.retentionPolicyId);
    expect(result.provider.executionLocation).toBe("local_host");
    expect(result.provider.physicalRegion).toEqual({
      value: null,
      reason: "not_verified",
    });
    expect(result.pages[0].pageId).toBe("page-2");
    expect(result.pages[0].words[1].confidence).toEqual({
      kind: "uncalibrated",
      scale: "tesseract_0_100",
      value: 83,
    });
    expect(result.scoringEligible).toBe(false);
    expect(result.cost.apiFeeMicros).toBe(0);
    expect(result.cost.compute).toEqual({
      status: "unknown",
      valueMicros: null,
      reason: "host_rate_unavailable",
    });
    expect(input).toEqual(before);
    expect(runner.recognize).toHaveBeenCalledTimes(1);
  });
  it("does not call OCR for native-only pages or require third-party disclosure consent", async () => {
    const input = request();
    input.nativePageTexts = ["Native text is usable"];
    input.selectedPages = [];
    const runner = adapter();
    expect((await runSelectiveLocalOcr(input, runner)).status).toBe(
      "not_needed",
    );
    expect(runner.recognize).not.toHaveBeenCalled();
  });

  it.each([
    { createdAt: undefined },
    { createdAt: "invalid" },
    { createdAt: "2026-10-04T12:00:00+05:30" },
    { retentionPolicyId: undefined },
    { retentionPolicyId: "" },
    { retentionPolicyId: " " },
  ])(
    "rejects missing/malformed server envelope field %j before execution",
    async (change) => {
      const runner = adapter();
      expect(
        await runSelectiveLocalOcr({ ...request(), ...change }, runner),
      ).toMatchObject({ status: "failed", code: "invalid_request" });
      expect(runner.recognize).not.toHaveBeenCalled();
    },
  );

  it("rejects a fabricated region or missing location qualification in stored evidence", async () => {
    const result = await runSelectiveLocalOcr(request(), adapter());
    if (result.status !== "review_required")
      throw new Error("Expected evidence");
    expect(
      OcrEvidenceSchema.safeParse({
        ...result,
        provider: {
          ...result.provider,
          physicalRegion: { value: "India", reason: "not_verified" },
        },
      }).success,
    ).toBe(false);
    const incomplete = structuredClone(result);
    Reflect.deleteProperty(incomplete.provider, "executionLocation");
    expect(OcrEvidenceSchema.safeParse(incomplete).success).toBe(false);
  });

  it("keeps blank OCR results insufficient and preserves native text against runtime mutation", async () => {
    const blank = raw();
    blank.pages[0].text = "";
    blank.pages[0].words = [];
    const input = request();
    const runner = {
      ...adapter(blank),
      recognize: vi.fn(async (received: SelectiveOcrRequest) => {
        received.nativePageTexts[0] = "runtime mutation";
        return blank;
      }),
    };
    const result = await runSelectiveLocalOcr(input, runner);
    expect(result.status).toBe("insufficient");
    if (result.status !== "insufficient")
      throw new Error("Expected insufficient evidence");
    expect(result.request.nativePageTexts[0]).toBe(
      "Usable original native text",
    );
    expect(result.scoringEligible).toBe(false);
    expect(input.nativePageTexts[0]).toBe("Usable original native text");
  });

  it("rejects caller limits that exceed the worker maxima or original page budget", async () => {
    const tooLarge = request();
    tooLarge.limits.maxCharacters = 200_001;
    const runner = adapter();
    expect(await runSelectiveLocalOcr(tooLarge, runner)).toMatchObject({
      status: "failed",
      code: "invalid_request",
    });
    const tooMany = request();
    tooMany.limits.maxPages = 1;
    expect(await runSelectiveLocalOcr(tooMany, runner)).toMatchObject({
      status: "failed",
      code: "invalid_request",
    });
    expect(runner.recognize).not.toHaveBeenCalled();
  });
  it.each([
    "duplicate",
    "missing",
    "extra",
    "wrong_id",
    "nonfinite_confidence",
    "nonfinite_geometry",
    "ungrounded",
    "outside",
    "unknown",
    "oversized",
    "over_budget",
  ])("rejects %s output without retry", async (kind) => {
    const result = raw();
    if (kind === "duplicate")
      result.pages.push(structuredClone(result.pages[0]));
    if (kind === "missing") result.pages = [];
    if (kind === "extra")
      result.pages.push({
        ...structuredClone(result.pages[0]),
        pageNumber: 1,
        pageId: "page-1",
      });
    if (kind === "wrong_id") result.pages[0].pageId = "page-1";
    if (kind === "nonfinite_confidence")
      result.pages[0].words[0].confidence = NaN;
    if (kind === "nonfinite_geometry")
      result.pages[0].words[0].box.x = Infinity;
    if (kind === "ungrounded") result.pages[0].words[0].text = "invented";
    if (kind === "outside") result.pages[0].words[0].box.width = 1;
    if (kind === "unknown") Object.assign(result.pages[0], { score: 100 });
    if (kind === "oversized") result.pages[0].widthPixels = 100_001;
    if (kind === "over_budget") result.durationMs = 1001;
    const runner = adapter(result);
    expect(await runSelectiveLocalOcr(request(), runner)).toMatchObject({
      status: "failed",
      code: "invalid_output",
    });
    expect(runner.recognize).toHaveBeenCalledTimes(1);
  });
  it.each([
    "hash",
    "owner",
    "selected_native",
    "missing_selection",
    "external",
    "allocation",
    "deadline",
    "unknown",
  ])("rejects %s request before execution", async (kind) => {
    const input = request();
    if (kind === "hash") input.sourceSha256 = "bad";
    if (kind === "owner") input.ownerId = "bad";
    if (kind === "selected_native")
      input.selectedPages = [{ pageNumber: 1, pageId: "page-1" }];
    if (kind === "missing_selection") input.selectedPages = [];
    if (kind === "external")
      Object.assign(input.policy, {
        executionMode: "external",
        allowThirdPartyProcessing: true,
      });
    if (kind === "allocation") input.allocation.maxWallTimeMs = Infinity;
    if (kind === "deadline") input.remainingDeadlineMs = NaN;
    if (kind === "unknown") Object.assign(input, { score: 100 });
    const runner = adapter();
    expect(await runSelectiveLocalOcr(input, runner)).toMatchObject({
      status: "failed",
      code: "invalid_request",
    });
    expect(runner.recognize).not.toHaveBeenCalled();
  });
  it("settles at the stricter remaining deadline and aborts the runtime signal", async () => {
    vi.useFakeTimers();
    try {
      const input = request();
      input.remainingDeadlineMs = 20;
      let signal: AbortSignal | undefined;
      const runner = {
        ...adapter(),
        recognize: vi.fn(
          (_request: SelectiveOcrRequest, received: AbortSignal) => {
            signal = received;
            return new Promise<LocalOcrRawResult>(() => {});
          },
        ),
      };
      const pending = runSelectiveLocalOcr(input, runner);
      await vi.advanceTimersByTimeAsync(20);
      expect(await pending).toMatchObject({
        status: "failed",
        code: "timeout",
      });
      expect(signal?.aborted).toBe(true);
      expect(runner.recognize).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("honors cancellation before invocation", async () => {
    const controller = new AbortController();
    controller.abort();
    const runner = adapter();
    expect(
      await runSelectiveLocalOcr(request(), runner, controller.signal),
    ).toMatchObject({ status: "failed", code: "cancelled" });
    expect(runner.recognize).not.toHaveBeenCalled();
  });
  it("applies inherited character bounds to native and OCR text together", async () => {
    const input = request();
    input.limits.maxCharacters = input.nativePageTexts.join("\n\n").length + 7;
    expect(await runSelectiveLocalOcr(input, adapter())).toMatchObject({
      status: "failed",
      code: "invalid_output",
    });
  });
  it("enforces measured wall time even when a provider reports a short duration", async () => {
    const clock = vi
      .spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValue(1001);
    try {
      expect(await runSelectiveLocalOcr(request(), adapter())).toMatchObject({
        status: "failed",
        code: "timeout",
      });
    } finally {
      clock.mockRestore();
    }
  });
  it("does not expose an invalid runtime error code", async () => {
    const error = new LocalOcrExecutionError("engine_failure");
    Object.assign(error, { code: "private resume text" });
    const runner = {
      ...adapter(),
      recognize: vi.fn(async () => {
        throw error;
      }),
    };
    expect(await runSelectiveLocalOcr(request(), runner)).toMatchObject({
      status: "failed",
      code: "engine_failure",
    });
  });
  it("rejects corrupted normalized evidence and never emits engine error content", async () => {
    const evidence = await runSelectiveLocalOcr(request(), adapter());
    if (
      evidence.status !== "review_required" &&
      evidence.status !== "insufficient"
    )
      throw new Error("Expected evidence");
    evidence.pages[0].words[0].end = 999;
    expect(OcrEvidenceSchema.safeParse(evidence).success).toBe(false);
    const runner = {
      ...adapter(),
      recognize: vi.fn(async () => {
        throw new Error("private resume text");
      }),
    };
    const failed = await runSelectiveLocalOcr(request(), runner);
    expect(failed).toMatchObject({ status: "failed", code: "engine_failure" });
    expect(JSON.stringify(failed)).not.toContain("private resume text");
  });
});
