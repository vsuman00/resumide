import type { Response as BrowserResponse } from "@playwright/test";
import { describe, expect, it } from "vitest";
import {
  clauseOrderRequestForm,
  isClauseOrderResponse,
} from "../../e2e/jd-clause-order-session";

const baseURL = "http://127.0.0.1:3110";
const analysisId = "00000000-0000-4000-8000-000000000001";
const url = `${baseURL}/analysis/${analysisId}/author/clause-order`;
const observationFailure = "Clause-order request observation failed";

// Only a passive response/request view is doubled. Native Request serializes
// each form in memory; no page, fetch, fixture, PDF or hosted operation runs.
async function observed(request: Request) {
  const body = Buffer.from(await request.arrayBuffer());
  return observedBytes(
    body,
    request.headers.get("content-type") ?? "",
    request.url,
    request.method,
  );
}

function observedBytes(
  body: Buffer | null,
  contentType: string,
  responseUrl = url,
  method = "POST",
) {
  return {
    url: () => responseUrl,
    request: () => ({
      method: () => method,
      headers: () => ({ "content-type": contentType }),
      postDataBuffer: () => body,
    }),
  } as unknown as BrowserResponse;
}

function multipart(fields: Array<[string, string | Blob]>) {
  const form = new FormData();
  for (const [name, value] of fields) form.append(name, value);
  return new Request(url, { method: "POST", body: form });
}

describe("passive clause-order request capture", () => {
  it("reads native multipart decision bytes with exact Unicode and acknowledgement", async () => {
    const command = JSON.stringify({
      source: "neutral α + & = claim",
      operation: "accept",
    });
    const response = await observed(
      multipart([
        ["action", "decision"],
        ["command", command],
        ["reviewAcknowledgement", "accepted"],
      ]),
    );
    const form = await clauseOrderRequestForm(response);
    expect(Array.from(form.entries())).toEqual([
      ["action", "decision"],
      ["command", command],
      ["reviewAcknowledgement", "accepted"],
    ]);
  });

  it("preserves absence of an acknowledgement on native multipart rejection", async () => {
    const form = await clauseOrderRequestForm(
      await observed(
        multipart([
          ["action", "decision"],
          ["command", '{"operation":"reject"}'],
        ]),
      ),
    );
    expect(form.get("reviewAcknowledgement")).toBeNull();
    expect(form.get("command")).toBe('{"operation":"reject"}');
  });

  it("reads actual multipart undo receipt and key fields", async () => {
    const form = await clauseOrderRequestForm(
      await observed(
        multipart([
          ["action", "undo"],
          ["receipt", '{"eventId":"neutral"}'],
          ["idempotencyKey", "neutral-key"],
        ]),
      ),
    );
    expect(Array.from(form.entries())).toEqual([
      ["action", "undo"],
      ["receipt", '{"eventId":"neutral"}'],
      ["idempotencyKey", "neutral-key"],
    ]);
  });

  it.each([
    { name: "missing command", fields: [["action", "decision"]] },
    {
      name: "unknown decision field",
      fields: [
        ["action", "decision"],
        ["command", "{}"],
        ["extra", "x"],
      ],
    },
    {
      name: "duplicate command",
      fields: [
        ["action", "decision"],
        ["command", "{}"],
        ["command", "{}"],
      ],
    },
    {
      name: "duplicate action",
      fields: [
        ["action", "decision"],
        ["action", "decision"],
        ["command", "{}"],
      ],
    },
    {
      name: "missing undo receipt",
      fields: [
        ["action", "undo"],
        ["idempotencyKey", "x"],
      ],
    },
    {
      name: "unknown undo field",
      fields: [
        ["action", "undo"],
        ["receipt", "{}"],
        ["idempotencyKey", "x"],
        ["command", "{}"],
      ],
    },
    {
      name: "unknown action",
      fields: [
        ["action", "other"],
        ["receipt", "{}"],
        ["idempotencyKey", "x"],
      ],
    },
  ])("refuses $name", async ({ fields }) => {
    await expect(
      clauseOrderRequestForm(
        await observed(multipart(fields as Array<[string, string]>)),
      ),
    ).rejects.toThrow(observationFailure);
  });

  it("refuses file fields rather than coercing them into command text", async () => {
    await expect(
      clauseOrderRequestForm(
        await observed(
          multipart([
            ["action", "decision"],
            ["command", new Blob(["{}"], { type: "text/plain" })],
          ]),
        ),
      ),
    ).rejects.toThrow(observationFailure);
  });

  it.each([
    { body: null, contentType: "multipart/form-data; boundary=neutral" },
    {
      body: Buffer.from("broken"),
      contentType: "multipart/form-data; boundary=neutral",
    },
    {
      body: Buffer.from("action=decision&command=%7B%7D"),
      contentType: "application/x-www-form-urlencoded",
    },
    { body: Buffer.from("{}"), contentType: "application/json" },
    { body: Buffer.from("broken"), contentType: "multipart/form-data;" },
  ])(
    "refuses unavailable, malformed or unsupported bytes %#",
    async ({ body, contentType }) => {
      await expect(
        clauseOrderRequestForm(observedBytes(body, contentType)),
      ).rejects.toThrow(observationFailure);
    },
  );

  it("admits the exact raw-byte bound and refuses one additional byte", async () => {
    const request = multipart([
      ["action", "decision"],
      ["command", "bounded-value"],
    ]);
    const contentType = request.headers.get("content-type")!;
    const original = Buffer.from(await request.arrayBuffer());
    const marker = Buffer.from("bounded-value");
    const offset = original.indexOf(marker);
    expect(offset).toBeGreaterThan(0);
    const command = "x".repeat(131_072 - original.length + marker.length);
    const bytes = Buffer.concat([
      original.subarray(0, offset),
      Buffer.from(command),
      original.subarray(offset + marker.length),
    ]);
    expect(bytes.length).toBe(131_072);
    expect(
      (await clauseOrderRequestForm(observedBytes(bytes, contentType))).get(
        "command",
      ),
    ).toBe(command);
    await expect(
      clauseOrderRequestForm(
        observedBytes(Buffer.concat([bytes, Buffer.from("x")]), contentType),
      ),
    ).rejects.toThrow(observationFailure);
  });
});

describe("passive clause-order response selection", () => {
  it.each([
    { responseUrl: url, method: "POST", accepted: true },
    { responseUrl: `${url}?retained=1`, method: "POST", accepted: true },
    {
      responseUrl: url.replace(baseURL, "https://foreign.example"),
      method: "POST",
      accepted: false,
    },
    {
      responseUrl: url.replace("3110", "3111"),
      method: "POST",
      accepted: false,
    },
    { responseUrl: `${url}/extra`, method: "POST", accepted: false },
    {
      responseUrl: url.replace(analysisId, "another-analysis"),
      method: "POST",
      accepted: false,
    },
    { responseUrl: url, method: "GET", accepted: false },
  ])(
    "matches the exact origin/path/method %#",
    ({ responseUrl, method, accepted }) => {
      expect(
        isClauseOrderResponse(
          observedBytes(null, "", responseUrl, method),
          analysisId,
          baseURL,
        ),
      ).toBe(accepted);
    },
  );
});
