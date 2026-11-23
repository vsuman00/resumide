import { createHash } from "node:crypto";
import { z } from "zod";
import {
  PADDLEOCR_CONSENT_VERSION,
  PADDLEOCR_JOBS_URL,
  PADDLEOCR_MODEL,
  type PaddleOcrConfig,
} from "./paddle-config";

const binding = z.object({
  ownerId: z.uuid(),
  sourceId: z.uuid(),
  analysisId: z.uuid(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/u),
});
const inputSchema = binding.extend({
  nativePageTexts: z.array(z.string().max(200_000)).min(1).max(20),
  consent: binding.extend({
    policyVersion: z.string(),
    disclosurePolicyId: z.string(),
    wholeDocumentDisclosureAccepted: z.boolean(),
  }),
});
export type PaddleOcrReviewRequest = z.infer<typeof inputSchema> & {
  bytes: Uint8Array;
};
type FailureCode =
  | "disabled"
  | "policy"
  | "consent"
  | "rate_limited"
  | "invalid_input"
  | "auth"
  | "timeout"
  | "cancelled"
  | "outage"
  | "provider_failed"
  | "invalid_output"
  | "resource_limit";
class PaddleFailure extends Error {
  constructor(readonly code: FailureCode) {
    super(code);
  }
}
export type PaddleOcrReviewPage = {
  pageNumber: number;
  pageId: string;
  jobId: string;
  method: "hosted_ocr";
  text: string;
  offsetUnit: "unicode_code_point";
  geometry: { status: "unavailable"; reason: "not_bound_to_rendered_page" };
  lines: {
    text: string;
    start: number;
    end: number;
    confidence: { kind: "uncalibrated"; scale: "paddle_0_1"; value: number };
  }[];
};
export type PaddleOcrReviewOutcome = {
  schemaVersion: "paddle-review/1.0.0";
  nativePageTexts: string[];
  scoringEligible: false;
  attempts: PaddleOcrAttempt[];
} & (
  | { status: "not_needed" }
  | { status: "failed"; code: FailureCode }
  | {
      status: "review_required" | "insufficient";
      source: z.infer<typeof binding>;
      provider: {
        name: "paddleocr";
        model: typeof PADDLEOCR_MODEL;
        executionMode: "hosted_api";
        modelRevision: null;
        physicalRegion: null;
        retentionDays: null;
        apiFeeMicros: null;
      };
      disclosurePolicyId: string;
      pages: PaddleOcrReviewPage[];
    }
);
export type PaddleOcrAttempt = {
  pageNumber: number;
  state: "submit_started" | "acknowledged" | "completed";
  jobId: string | null;
};
export type PaddleOcrAdmissionRequest = z.infer<typeof binding> & {
  pageCount: number;
  pageNumbers: number[];
  uploadBytes: number;
};
type Dependencies = {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  // The trusted caller must atomically authorize the owner/source, consume a
  // durable per-owner rate/page budget, and reject duplicate/ambiguous attempts.
  // A boolean in FormData is never an admission grant.
  admit: (request: PaddleOcrAdmissionRequest) => Promise<boolean>;
  // Persist the intent BEFORE submission and the receipt BEFORE polling. A
  // rejected receipt write stops this attempt; it must not trigger resubmission.
  recordAttempt: (attempt: PaddleOcrAttempt) => Promise<void>;
};
const apiEnvelope = z.object({ code: z.literal(0), data: z.unknown() });
const job = z.object({ jobId: z.string().min(1).max(256) });
const status = z.object({
  state: z.enum(["pending", "running", "done", "failed"]),
  resultUrl: z.object({ jsonUrl: z.string().max(8192) }).optional(),
});
const resultLine = z.object({
  result: z.object({
    ocrResults: z
      .array(
        z.object({
          prunedResult: z.object({
            rec_texts: z
              .array(
                z
                  .string()
                  .max(20_000)
                  .refine((text) => !text.includes(String.fromCharCode(0)))
                  .regex(/^[^\r\n]*$/u),
              )
              .max(10_000),
            rec_scores: z.array(z.number().finite().min(0).max(1)).max(10_000),
          }),
        }),
      )
      .max(1),
  }),
});

async function readBounded(
  response: Response,
  limit: number,
  signal: AbortSignal,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new PaddleFailure("invalid_output");
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new PaddleFailure("resource_limit");
      }
      chunks.push(value);
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat(chunks),
      );
    } catch {
      throw new PaddleFailure("invalid_output");
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
function json(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new PaddleFailure("invalid_output");
  }
}
function allowedResultUrl(raw: string | undefined, hosts: string[]) {
  try {
    const url = new URL(raw ?? "");
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      hosts.includes(url.hostname)
    )
      return url.href;
  } catch {
    /* Fail closed below; never echo signed result URLs. */
  }
  throw new PaddleFailure("policy");
}
async function pause(ms: number, signal: AbortSignal) {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new PaddleFailure("cancelled"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Contract-first hosted integration. Deliberately separate from Tesseract's
 * local_ocr schema and the scoring extraction RPC. No production caller yet:
 * activating uploads requires durable consent/admission and review persistence.
 * Each job selects ONE PDF page, so output ordering cannot rebind sparse pages.
 * The complete PDF is uploaded for each job; consent must disclose that fact.
 */
export async function runPaddleOcrReview(
  input: PaddleOcrReviewRequest,
  suppliedConfig: PaddleOcrConfig,
  dependencies: Dependencies,
): Promise<PaddleOcrReviewOutcome> {
  const parsed = inputSchema.safeParse(input);
  const nativePageTexts = parsed.success
    ? [...parsed.data.nativePageTexts]
    : [];
  const base = {
    schemaVersion: "paddle-review/1.0.0" as const,
    nativePageTexts,
    scoringEligible: false as const,
    attempts: [] as PaddleOcrAttempt[],
  };
  const failed = (code: FailureCode): PaddleOcrReviewOutcome => ({
    ...base,
    status: "failed",
    code,
  });
  if (!parsed.success || !(input.bytes instanceof Uint8Array))
    return failed("invalid_input");
  const request = parsed.data;
  const config = {
    ...suppliedConfig,
    PADDLEOCR_RESULT_HOSTS: [...suppliedConfig.PADDLEOCR_RESULT_HOSTS],
  };
  if (dependencies.signal?.aborted) return failed("cancelled");
  if (
    input.bytes.byteLength > config.PADDLEOCR_MAX_UPLOAD_BYTES ||
    nativePageTexts.join("\n\n").length > config.PADDLEOCR_MAX_CHARACTERS
  )
    return failed("resource_limit");
  const bytes = new Uint8Array(input.bytes);
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
    return failed("invalid_input");
  if (createHash("sha256").update(bytes).digest("hex") !== request.sourceSha256)
    return failed("invalid_input");
  const selected = nativePageTexts.flatMap((text, index) =>
    text.replace(/\s/gu, "").length < 8 ? [index + 1] : [],
  );
  if (!selected.length) return { ...base, status: "not_needed" };
  if (!config.PADDLEOCR_ENABLED) return failed("disabled");
  if (
    !config.PADDLEOCR_ACCESS_TOKEN ||
    !config.PADDLEOCR_RESULT_HOSTS.length ||
    !config.PADDLEOCR_DISCLOSURE_POLICY_ID
  )
    return failed("policy");
  if (selected.length > config.PADDLEOCR_MAX_PAGES)
    return failed("resource_limit");
  const consent = request.consent;
  if (
    !consent.wholeDocumentDisclosureAccepted ||
    consent.policyVersion !== PADDLEOCR_CONSENT_VERSION ||
    consent.disclosurePolicyId !== config.PADDLEOCR_DISCLOSURE_POLICY_ID ||
    (["ownerId", "analysisId", "sourceId", "sourceSha256"] as const).some(
      (key) => consent[key] !== request[key],
    )
  )
    return failed("consent");

  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  dependencies.signal?.addEventListener("abort", cancel, { once: true });
  let abortListener: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    abortListener = () =>
      reject(new PaddleFailure(timedOut ? "timeout" : "cancelled"));
    controller.signal.addEventListener("abort", abortListener, { once: true });
  });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.PADDLEOCR_TIMEOUT_MS);
  const fetchImpl = dependencies.fetch ?? fetch;
  async function get(
    url: string,
    init: RequestInit,
    authenticated: boolean,
    limit: number,
  ) {
    controller.signal.throwIfAborted();
    const response = await fetchImpl(url, {
      ...init,
      redirect: "error",
      signal: controller.signal,
      headers: authenticated
        ? { Authorization: `Bearer ${config.PADDLEOCR_ACCESS_TOKEN}` }
        : {},
    });
    controller.signal.throwIfAborted();
    if (!response.ok) {
      // Provider errors may contain secrets/PII. Do not read, log or return them.
      await response.body?.cancel();
      throw new PaddleFailure(
        response.status === 401 || response.status === 403
          ? "auth"
          : response.status === 429
            ? "rate_limited"
            : "outage",
      );
    }
    return readBounded(response, limit, controller.signal);
  }
  async function api(url: string, init: RequestInit) {
    const parsed = apiEnvelope.safeParse(
      json(await get(url, init, true, 16_384)),
    );
    if (!parsed.success) throw new PaddleFailure("invalid_output");
    return parsed.data.data;
  }
  async function execute(): Promise<PaddleOcrReviewOutcome> {
    const source = binding.parse(request);
    if (
      !(await dependencies.admit({
        ...source,
        pageCount: selected.length,
        pageNumbers: selected,
        uploadBytes: bytes.length * selected.length,
      }))
    )
      throw new PaddleFailure("rate_limited");
    controller.signal.throwIfAborted();
    const pages: PaddleOcrReviewPage[] = [];
    let characters = nativePageTexts.join("\n\n").length;
    for (const pageNumber of selected) {
      controller.signal.throwIfAborted();
      const receipt: PaddleOcrAttempt = {
        pageNumber,
        state: "submit_started",
        jobId: null,
      };
      await dependencies.recordAttempt({ ...receipt });
      controller.signal.throwIfAborted();
      base.attempts.push(receipt);
      const form = new FormData();
      form.append(
        "file",
        new Blob([bytes], { type: "application/pdf" }),
        "resume.pdf",
      );
      form.append("model", PADDLEOCR_MODEL);
      form.append("pageRanges", String(pageNumber));
      form.append(
        "optionalPayload",
        JSON.stringify({
          useDocOrientationClassify: false,
          useDocUnwarping: false,
          useTextlineOrientation: false,
          visualize: false,
        }),
      );
      const submitted = job.safeParse(
        await api(PADDLEOCR_JOBS_URL, { method: "POST", body: form }),
      );
      if (!submitted.success) throw new PaddleFailure("invalid_output");
      receipt.state = "acknowledged";
      receipt.jobId = submitted.data.jobId;
      await dependencies.recordAttempt({ ...receipt });
      controller.signal.throwIfAborted();
      let resultUrl: string | undefined;
      for (let poll = 0; poll < config.PADDLEOCR_MAX_POLLS; poll++) {
        const polled = status.safeParse(
          await api(
            `${PADDLEOCR_JOBS_URL}/${encodeURIComponent(submitted.data.jobId)}`,
            { method: "GET" },
          ),
        );
        if (!polled.success) throw new PaddleFailure("invalid_output");
        if (polled.data.state === "failed")
          throw new PaddleFailure("provider_failed");
        if (polled.data.state === "done") {
          resultUrl = allowedResultUrl(
            polled.data.resultUrl?.jsonUrl,
            config.PADDLEOCR_RESULT_HOSTS,
          );
          break;
        }
        if (poll + 1 < config.PADDLEOCR_MAX_POLLS)
          await pause(config.PADDLEOCR_POLL_INTERVAL_MS, controller.signal);
      }
      if (!resultUrl) throw new PaddleFailure("timeout");
      const body = await get(
        resultUrl,
        { method: "GET" },
        false,
        config.PADDLEOCR_MAX_RESULT_BYTES,
      );
      const records = body
        .trim()
        .split("\n")
        .filter((line) => line.trim());
      if (records.length !== 1) throw new PaddleFailure("invalid_output");
      const result = resultLine.safeParse(json(records[0]));
      if (!result.success || result.data.result.ocrResults.length !== 1)
        throw new PaddleFailure("invalid_output");
      const { rec_texts: texts, rec_scores: scores } =
        result.data.result.ocrResults[0].prunedResult;
      if (texts.length !== scores.length)
        throw new PaddleFailure("invalid_output");
      const text = texts.join("\n");
      characters += text.length + 2;
      if (characters > config.PADDLEOCR_MAX_CHARACTERS)
        throw new PaddleFailure("resource_limit");
      let cursor = 0;
      pages.push({
        pageNumber,
        pageId: `page-${pageNumber}`,
        jobId: submitted.data.jobId,
        method: "hosted_ocr",
        text,
        offsetUnit: "unicode_code_point",
        geometry: {
          status: "unavailable",
          reason: "not_bound_to_rendered_page",
        },
        lines: texts.map((text, index) => {
          const start = cursor,
            end = start + Array.from(text).length;
          cursor = end + 1;
          return {
            text,
            start,
            end,
            confidence: {
              kind: "uncalibrated",
              scale: "paddle_0_1",
              value: scores[index],
            },
          };
        }),
      });
      receipt.state = "completed";
      await dependencies.recordAttempt({ ...receipt });
      controller.signal.throwIfAborted();
    }
    return {
      ...base,
      source,
      status: pages.some((page) => /\S/u.test(page.text))
        ? "review_required"
        : "insufficient",
      provider: {
        name: "paddleocr",
        model: PADDLEOCR_MODEL,
        executionMode: "hosted_api",
        modelRevision: null,
        physicalRegion: null,
        retentionDays: null,
        apiFeeMicros: null,
      },
      disclosurePolicyId: config.PADDLEOCR_DISCLOSURE_POLICY_ID,
      pages,
    };
  }
  try {
    return await Promise.race([execute(), aborted]);
  } catch (error) {
    return failed(
      controller.signal.aborted
        ? timedOut
          ? "timeout"
          : "cancelled"
        : error instanceof PaddleFailure
          ? error.code
          : "outage",
    );
  } finally {
    clearTimeout(timer);
    dependencies.signal?.removeEventListener("abort", cancel);
    if (abortListener)
      controller.signal.removeEventListener("abort", abortListener);
  }
}
