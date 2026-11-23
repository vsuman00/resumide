import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parsePaddleOcrConfig,
  PADDLEOCR_CONSENT_VERSION,
  PADDLEOCR_JOBS_URL,
} from "../../../app/lib/server/ocr/paddle-config";
import {
  runPaddleOcrReview as runReview,
  type PaddleOcrReviewRequest,
} from "../../../app/lib/server/ocr/paddle";

function runPaddleOcrReview(
  input: Parameters<typeof runReview>[0],
  policy: Parameters<typeof runReview>[1],
  dependencies: Omit<Parameters<typeof runReview>[2], "recordAttempt"> & {
    recordAttempt?: Parameters<typeof runReview>[2]["recordAttempt"];
  },
) {
  return runReview(input, policy, {
    recordAttempt: async () => undefined,
    ...dependencies,
  });
}

const bytes = new TextEncoder().encode("%PDF-synthetic-contract-only");
const hash = createHash("sha256").update(bytes).digest("hex");
const ownerId = "10000000-0000-4000-8000-000000000001";
const sourceId = "10000000-0000-4000-8000-000000000002";
const analysisId = "10000000-0000-4000-8000-000000000003";
const resultUrl =
  "https://contract-test.bj.bcebos.com/result.jsonl?signature=synthetic";
const config = () =>
  parsePaddleOcrConfig({
    PADDLEOCR_ENABLED: "true",
    PADDLEOCR_ACCESS_TOKEN: "synthetic-test-token",
    PADDLEOCR_RESULT_HOSTS: "contract-test.bj.bcebos.com",
    PADDLEOCR_DISCLOSURE_POLICY_ID: "synthetic-policy-only",
  });
function request(
  nativePageTexts = ["Native page must remain exact", ""],
): PaddleOcrReviewRequest {
  return {
    bytes,
    ownerId,
    sourceId,
    analysisId,
    sourceSha256: hash,
    nativePageTexts,
    consent: {
      ownerId,
      sourceId,
      sourceSha256: hash,
      analysisId,
      policyVersion: PADDLEOCR_CONSENT_VERSION,
      disclosurePolicyId: "synthetic-policy-only",
      wholeDocumentDisclosureAccepted: true,
    },
  };
}
const envelope = (data: unknown) => Response.json({ code: 0, data });
const result = (texts = ["Name: Synthetic Candidate", "Role: Developer"]) =>
  new Response(
    JSON.stringify({
      result: {
        ocrResults: [
          {
            prunedResult: {
              rec_texts: texts,
              rec_scores: texts.map(() => 0.98),
            },
          },
        ],
      },
    }),
  );
function transport(
  responses: Response[] = [
    envelope({ jobId: "job/2" }),
    envelope({ state: "done", resultUrl: { jsonUrl: resultUrl } }),
    result(),
  ],
) {
  return vi.fn<typeof fetch>().mockImplementation(async () => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected network call");
    return response;
  });
}
const admission = () => vi.fn(async () => true);
afterEach(() => vi.useRealTimers());

describe("hosted PaddleOCR review boundary (mock HTTP only)", () => {
  it("submits a fixed model and one missing page, preserves native text, withholds scores", async () => {
    const fetch = transport();
    const admit = admission();
    const input = request();
    const before = structuredClone(input);
    const output = await runPaddleOcrReview(input, config(), { fetch, admit });
    expect(output.status).toBe("review_required");
    expect(output.scoringEligible).toBe(false);
    expect(output.nativePageTexts).toEqual(before.nativePageTexts);
    expect(input).toEqual(before);
    if (output.status !== "review_required") throw new Error("Expected review");
    expect(output.pages[0]).toMatchObject({
      pageNumber: 2,
      pageId: "page-2",
      method: "hosted_ocr",
      text: "Name: Synthetic Candidate\nRole: Developer",
      geometry: { status: "unavailable", reason: "not_bound_to_rendered_page" },
    });
    expect(output.pages[0].lines[0]).toMatchObject({
      start: 0,
      end: 25,
      confidence: { kind: "uncalibrated", scale: "paddle_0_1", value: 0.98 },
    });
    expect(admit).toHaveBeenCalledWith({
      ownerId,
      sourceId,
      sourceSha256: hash,
      analysisId,
      pageCount: 1,
      pageNumbers: [2],
      uploadBytes: bytes.length,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(PADDLEOCR_JOBS_URL);
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer synthetic-test-token",
    );
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
    const form = init?.body as FormData;
    expect(form.get("model")).toBe("PP-OCRv6");
    expect(form.get("pageRanges")).toBe("2");
    expect(form.get("file")).toBeInstanceOf(Blob);
    expect(await (form.get("file") as Blob).text()).toBe(
      new TextDecoder().decode(bytes),
    );
    expect(fetch.mock.calls[1][0]).toBe(`${PADDLEOCR_JOBS_URL}/job%2F2`);
    expect(
      new Headers(fetch.mock.calls[2][1]?.headers).has("Authorization"),
    ).toBe(false);
    expect(
      fetch.mock.calls.every(([, options]) => options?.redirect === "error"),
    ).toBe(true);
  });
  it("uses no admission or external call for native PDFs, including Unicode", async () => {
    const fetch = transport([]);
    const admit = admission();
    const output = await runPaddleOcrReview(
      request(["Native text 😀 preserved"]),
      config(),
      { fetch, admit },
    );
    expect(output.status).toBe("not_needed");
    expect(fetch).not.toHaveBeenCalled();
    expect(admit).not.toHaveBeenCalled();
  });
  it.each([
    "disabled",
    "consent",
    "source",
    "pages",
    "characters",
    "bytes",
    "budget",
  ])("refuses %s before disclosure", async (scenario) => {
    const input = request();
    const policy = config();
    const fetch = transport([]);
    const admit = admission();
    if (scenario === "disabled") policy.PADDLEOCR_ENABLED = false;
    if (scenario === "consent")
      input.consent.wholeDocumentDisclosureAccepted = false;
    if (scenario === "source") input.sourceSha256 = "b".repeat(64);
    if (scenario === "pages") {
      policy.PADDLEOCR_MAX_PAGES = 1;
      input.nativePageTexts = ["", ""];
    }
    if (scenario === "characters") policy.PADDLEOCR_MAX_CHARACTERS = 1;
    if (scenario === "bytes") policy.PADDLEOCR_MAX_UPLOAD_BYTES = 1;
    if (scenario === "budget") admit.mockResolvedValue(false);
    const output = await runPaddleOcrReview(input, policy, { fetch, admit });
    expect(output.status).toBe("failed");
    expect(output.scoringEligible).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    "http://127.0.0.1/result",
    "https://evil.example/result",
    "https://contract-test.bj.bcebos.com.evil.example/result",
    "https://token@contract-test.bj.bcebos.com/result",
    "https://contract-test.bj.bcebos.com:8443/result",
    "https://contract-test.bj.bcebos.com/result#fragment",
  ])("rejects result URL %s without fetching it", async (url) => {
    const fetch = transport([
      envelope({ jobId: "job" }),
      envelope({ state: "done", resultUrl: { jsonUrl: url } }),
    ]);
    expect(
      await runPaddleOcrReview(request(), config(), {
        fetch,
        admit: admission(),
      }),
    ).toMatchObject({ status: "failed", code: "policy" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([401, 403, 429, 500, 503, 302])(
    "maps HTTP %i safely, never resubmits",
    async (status) => {
      const fetch = transport([
        new Response("sensitive provider text", { status }),
      ]);
      const output = await runPaddleOcrReview(request(), config(), {
        fetch,
        admit: admission(),
      });
      expect(output).toMatchObject({
        status: "failed",
        code:
          status === 401 || status === 403
            ? "auth"
            : status === 429
              ? "rate_limited"
              : "outage",
      });
      expect(JSON.stringify(output)).not.toContain("sensitive provider text");
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    "not-json",
    JSON.stringify({ result: { ocrResults: [] } }),
    JSON.stringify({
      result: {
        ocrResults: [{ prunedResult: { rec_texts: ["text"], rec_scores: [] } }],
      },
    }),
    JSON.stringify({
      result: {
        ocrResults: [
          { prunedResult: { rec_texts: ["text"], rec_scores: [1.01] } },
        ],
      },
    }),
  ])("rejects malformed or incomplete OCR output", async (body) => {
    const fetch = transport([
      envelope({ jobId: "job" }),
      envelope({ state: "done", resultUrl: { jsonUrl: resultUrl } }),
      new Response(body),
    ]);
    expect(
      await runPaddleOcrReview(request(), config(), {
        fetch,
        admit: admission(),
      }),
    ).toMatchObject({ status: "failed", code: "invalid_output" });
  });
  it("requires exactly one page per selected-page job", async () => {
    const page = {
      prunedResult: { rec_texts: ["synthetic"], rec_scores: [1] },
    };
    const fetch = transport([
      envelope({ jobId: "job" }),
      envelope({ state: "done", resultUrl: { jsonUrl: resultUrl } }),
      new Response(JSON.stringify({ result: { ocrResults: [page, page] } })),
    ]);
    expect(
      await runPaddleOcrReview(request(), config(), {
        fetch,
        admit: admission(),
      }),
    ).toMatchObject({ status: "failed", code: "invalid_output" });
  });
  it("caps streamed results without trusting Content-Length", async () => {
    const policy = config();
    policy.PADDLEOCR_MAX_RESULT_BYTES = 16;
    const fetch = transport([
      envelope({ jobId: "job" }),
      envelope({ state: "done", resultUrl: { jsonUrl: resultUrl } }),
      new Response("x".repeat(17)),
    ]);
    expect(
      await runPaddleOcrReview(request(), policy, {
        fetch,
        admit: admission(),
      }),
    ).toMatchObject({ status: "failed", code: "resource_limit" });
  });
  it("uses Unicode code-point offsets and does not invent word geometry", async () => {
    const fetch = transport([
      envelope({ jobId: "job" }),
      envelope({ state: "done", resultUrl: { jsonUrl: resultUrl } }),
      result(["😀 Name", "Role: Test"]),
    ]);
    const output = await runPaddleOcrReview(request(), config(), {
      fetch,
      admit: admission(),
    });
    if (output.status !== "review_required") throw new Error("Expected review");
    expect(output.pages[0].lines[1]).toMatchObject({ start: 7, end: 17 });
    expect(output.pages[0]).not.toHaveProperty("words");
  });
  it("bounds pending polling and does not retry the POST", async () => {
    const policy = config();
    policy.PADDLEOCR_MAX_POLLS = 1;
    const fetch = transport([
      envelope({ jobId: "job" }),
      envelope({ state: "running" }),
    ]);
    expect(
      await runPaddleOcrReview(request(), policy, {
        fetch,
        admit: admission(),
      }),
    ).toMatchObject({ status: "failed", code: "timeout" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("aborts and settles a hung request at the overall deadline", async () => {
    vi.useFakeTimers();
    const policy = config();
    policy.PADDLEOCR_TIMEOUT_MS = 100;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(() => new Promise(() => undefined));
    const pending = runPaddleOcrReview(request(), policy, {
      fetch,
      admit: admission(),
    });
    await vi.advanceTimersByTimeAsync(101);
    expect(await pending).toMatchObject({ status: "failed", code: "timeout" });
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("does not call the provider after caller cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = transport([]);
    expect(
      await runPaddleOcrReview(request(), config(), {
        fetch,
        admit: admission(),
        signal: controller.signal,
      }),
    ).toMatchObject({ status: "failed", code: "cancelled" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("records submission intent and acknowledgement before polling, then completion", async () => {
    const recordAttempt = vi.fn<
      Parameters<typeof runReview>[2]["recordAttempt"]
    >(async () => undefined);
    const fetch = transport();
    const output = await runPaddleOcrReview(request(), config(), {
      fetch,
      admit: admission(),
      recordAttempt,
    });
    expect(recordAttempt.mock.calls.map(([receipt]) => receipt)).toEqual([
      { pageNumber: 2, state: "submit_started", jobId: null },
      { pageNumber: 2, state: "acknowledged", jobId: "job/2" },
      { pageNumber: 2, state: "completed", jobId: "job/2" },
    ]);
    expect(recordAttempt.mock.invocationCallOrder[0]).toBeLessThan(
      fetch.mock.invocationCallOrder[0],
    );
    expect(recordAttempt.mock.invocationCallOrder[1]).toBeLessThan(
      fetch.mock.invocationCallOrder[1],
    );
    expect(output.attempts).toEqual([
      { pageNumber: 2, state: "completed", jobId: "job/2" },
    ]);
  });

  it("preserves acknowledgement when later status polling fails", async () => {
    const fetch = transport([
      envelope({ jobId: "retained-job" }),
      new Response("private error", { status: 503 }),
    ]);
    expect(
      await runPaddleOcrReview(request(), config(), {
        fetch,
        admit: admission(),
      }),
    ).toMatchObject({
      status: "failed",
      code: "outage",
      attempts: [
        { pageNumber: 2, state: "acknowledged", jobId: "retained-job" },
      ],
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("stops before POST if the durable intent cannot be saved", async () => {
    const fetch = transport([]);
    expect(
      await runPaddleOcrReview(request(), config(), {
        fetch,
        admit: admission(),
        recordAttempt: async () => {
          throw new Error("storage unavailable");
        },
      }),
    ).toMatchObject({ status: "failed", code: "outage", attempts: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stops before polling if a job acknowledgement cannot be saved", async () => {
    const fetch = transport([envelope({ jobId: "retained-job" })]);
    let writes = 0;
    expect(
      await runPaddleOcrReview(request(), config(), {
        fetch,
        admit: admission(),
        recordAttempt: async () => {
          if (++writes === 2) throw new Error("storage unavailable");
        },
      }),
    ).toMatchObject({
      status: "failed",
      code: "outage",
      attempts: [{ state: "acknowledged", jobId: "retained-job" }],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retains completed and ambiguous receipts if a later selected page fails", async () => {
    const fetch = transport([
      envelope({ jobId: "first-page" }),
      envelope({ state: "done", resultUrl: { jsonUrl: resultUrl } }),
      result(),
      new Response("private", { status: 500 }),
    ]);
    const admit = admission();
    const output = await runPaddleOcrReview(
      request(["", "Keep this exact native page", ""]),
      config(),
      { fetch, admit },
    );
    expect(output).toMatchObject({
      status: "failed",
      attempts: [
        { pageNumber: 1, state: "completed", jobId: "first-page" },
        { pageNumber: 3, state: "submit_started", jobId: null },
      ],
    });
    expect(output).not.toHaveProperty("pages");
    expect(admit).toHaveBeenCalledWith(
      expect.objectContaining({ pageCount: 2, uploadBytes: bytes.length * 2 }),
    );
    expect((fetch.mock.calls[0][1]?.body as FormData).get("pageRanges")).toBe(
      "1",
    );
    expect((fetch.mock.calls[3][1]?.body as FormData).get("pageRanges")).toBe(
      "3",
    );
  });

  it("preserves sparse original page IDs instead of renumbering selected results", async () => {
    const fetch = transport([
      envelope({ jobId: "first" }),
      envelope({ state: "done", resultUrl: { jsonUrl: resultUrl } }),
      result(),
      envelope({ jobId: "third" }),
      envelope({ state: "done", resultUrl: { jsonUrl: resultUrl } }),
      result(),
    ]);
    const output = await runPaddleOcrReview(
      request(["", "Native middle page", ""]),
      config(),
      { fetch, admit: admission() },
    );
    if (output.status !== "review_required") throw new Error("Expected review");
    expect(
      output.pages.map(({ pageId, pageNumber }) => ({ pageId, pageNumber })),
    ).toEqual([
      { pageId: "page-1", pageNumber: 1 },
      { pageId: "page-3", pageNumber: 3 },
    ]);
  });

  it("never grants scoring for a blank successful result", async () => {
    const fetch = transport([
      envelope({ jobId: "blank" }),
      envelope({ state: "done", resultUrl: { jsonUrl: resultUrl } }),
      result([]),
    ]);
    expect(
      await runPaddleOcrReview(request(), config(), {
        fetch,
        admit: admission(),
      }),
    ).toMatchObject({ status: "insufficient", scoringEligible: false });
  });

  it("rejects non-PDF bytes even when their hash is correct", async () => {
    const input = request();
    input.bytes = new TextEncoder().encode("not a pdf");
    input.sourceSha256 = createHash("sha256").update(input.bytes).digest("hex");
    const fetch = transport([]);
    const admit = admission();
    expect(
      await runPaddleOcrReview(input, config(), { fetch, admit }),
    ).toMatchObject({ status: "failed", code: "invalid_input" });
    expect(admit).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    "ownerId",
    "sourceId",
    "analysisId",
    "sourceSha256",
    "policyVersion",
    "disclosurePolicyId",
  ] as const)("rejects consent with a different %s", async (key) => {
    const input = request();
    input.consent[key] =
      key === "sourceSha256"
        ? "b".repeat(64)
        : key.endsWith("Id") && key !== "disclosurePolicyId"
          ? "10000000-0000-4000-8000-000000000009"
          : "another-policy";
    const fetch = transport([]);
    expect(
      await runPaddleOcrReview(input, config(), { fetch, admit: admission() }),
    ).toMatchObject({ status: "failed", code: "consent" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed UTF-8 as invalid output", async () => {
    const fetch = transport([
      envelope({ jobId: "job" }),
      envelope({ state: "done", resultUrl: { jsonUrl: resultUrl } }),
      new Response(new Uint8Array([0xff])),
    ]);
    expect(
      await runPaddleOcrReview(request(), config(), {
        fetch,
        admit: admission(),
      }),
    ).toMatchObject({ status: "failed", code: "invalid_output" });
  });

  it("caps OCR characters across native plus hosted text", async () => {
    const policy = config();
    policy.PADDLEOCR_MAX_CHARACTERS = 35;
    const fetch = transport();
    expect(
      await runPaddleOcrReview(request(), policy, {
        fetch,
        admit: admission(),
      }),
    ).toMatchObject({ status: "failed", code: "resource_limit" });
  });

  it("handles explicit provider failure without exposing error messages", async () => {
    const fetch = transport([
      envelope({ jobId: "job" }),
      envelope({ state: "failed", errorMsg: "sensitive document detail" }),
    ]);
    const output = await runPaddleOcrReview(request(), config(), {
      fetch,
      admit: admission(),
    });
    expect(output).toMatchObject({ status: "failed", code: "provider_failed" });
    expect(JSON.stringify(output)).not.toContain("sensitive document detail");
  });

  it("cancels pending polling without dropping the acknowledged job", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetch = transport([
      envelope({ jobId: "job" }),
      envelope({ state: "pending" }),
    ]);
    const pending = runPaddleOcrReview(request(), config(), {
      fetch,
      admit: admission(),
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    expect(await pending).toMatchObject({
      status: "failed",
      code: "cancelled",
      attempts: [{ jobId: "job", state: "acknowledged" }],
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out a stalled result body and cancels its reader", async () => {
    vi.useFakeTimers();
    const policy = config();
    policy.PADDLEOCR_TIMEOUT_MS = 100;
    const cancelled = vi.fn();
    const stream = new ReadableStream({ cancel: cancelled });
    const fetch = transport([
      envelope({ jobId: "job" }),
      envelope({ state: "done", resultUrl: { jsonUrl: resultUrl } }),
      new Response(stream),
    ]);
    const pending = runPaddleOcrReview(request(), policy, {
      fetch,
      admit: admission(),
    });
    await vi.advanceTimersByTimeAsync(101);
    expect(await pending).toMatchObject({ status: "failed", code: "timeout" });
    expect(cancelled).toHaveBeenCalledOnce();
  });
});

describe("PaddleOCR configuration", () => {
  it("defaults off without credentials or guessed result hosts", () => {
    expect(parsePaddleOcrConfig({})).toMatchObject({
      PADDLEOCR_ENABLED: false,
      PADDLEOCR_ACCESS_TOKEN: "",
      PADDLEOCR_RESULT_HOSTS: [],
    });
  });
  it("requires credentials, exact approved result hosts and a disclosure policy when enabled", () => {
    expect(() => parsePaddleOcrConfig({ PADDLEOCR_ENABLED: "true" })).toThrow(
      "Invalid PaddleOCR configuration",
    );
    expect(() =>
      parsePaddleOcrConfig({ PADDLEOCR_RESULT_HOSTS: "*.bcebos.com" }),
    ).toThrow();
  });
});
