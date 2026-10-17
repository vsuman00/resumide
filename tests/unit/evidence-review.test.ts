import { describe, expect, it, vi } from "vitest";
import { buildNativeEvidence } from "../../app/lib/server/native-evidence";
import { reconcileDocumentEvidence } from "../../app/lib/server/document-evidence";
import {
  correctEvidenceReview,
  loadEvidenceReview,
  readEvidenceCorrectionForm,
  type EvidenceReviewClient,
} from "../../app/lib/server/evidence-review";

const ids = Array.from(
  { length: 7 },
  (_, index) =>
    `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const [attemptId, ownerId, analysisId, sourceId, key, eventId] = ids;
const evidence = reconcileDocumentEvidence(
  {
    id: attemptId,
    ownerId,
    analysisId,
    sourceId,
    inputSha256: "a".repeat(64),
    createdAt: "2026-10-11T00:00:00.000Z",
    retentionPolicyId: "synthetic-local-30d/1.0.0",
  },
  buildNativeEvidence(["Name: Demo Person\nEmployer: Fictional Co"]),
);
const analysis = {
  id: analysisId,
  owner_id: ownerId,
  resume_version_id: sourceId,
};
const attempt = {
  id: attemptId,
  analysis_id: analysisId,
  owner_id: ownerId,
  resume_version_id: sourceId,
  input_sha256: "a".repeat(64),
  attempt_number: 1,
  envelope: evidence,
};
const input = {
  attemptId,
  expectedRevision: 0,
  field: "employer",
  operation: "confirm",
  value: "Fictional Co",
  candidateId: evidence.assertions.find(
    (candidate) => candidate.field === "employer",
  )!.id,
  idempotencyKey: key,
};
function client(
  rows: unknown[],
  rpcResult: unknown = {
    status: "applied",
    revision: 1,
    id: eventId,
    idempotent: false,
  },
  rpcError: unknown = null,
) {
  const calls: Array<{
    table: string;
    filters: unknown[][];
    orders: unknown[][];
  }> = [];
  const from = vi.fn((table: string) => {
    const record = {
      table,
      filters: [] as unknown[][],
      orders: [] as unknown[][],
    };
    calls.push(record);
    const result = { data: rows.shift(), error: null };
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((...args: unknown[]) => {
        record.filters.push(args);
        return chain;
      }),
      order: vi.fn((...args: unknown[]) => {
        record.orders.push(args);
        return chain;
      }),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => result),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return chain;
  });
  const rpc = vi.fn(async () => ({ data: rpcResult, error: rpcError }));
  return { db: { from, rpc } as unknown as EvidenceReviewClient, calls, rpc };
}
function form(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string> = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, String(value)]),
  );
  for (const [key, value] of Object.entries(overrides))
    if (value !== undefined) values[key] = value;
  return new URLSearchParams(values);
}
function request(body: BodyInit) {
  return new Request("https://example.test/analysis/evidence", {
    method: "POST",
    body,
  });
}
describe("owner evidence read and immutable correction service", () => {
  it("filters analysis, latest attempt and correction history by authenticated owner", async () => {
    const mock = client([analysis, attempt, []]);
    const review = await loadEvidenceReview(mock.db, analysisId, ownerId);
    expect(review.scoringEligible).toBe(false);
    expect(review.evidence).toEqual(evidence);
    expect(review.revision).toBe(0);
    expect(
      mock.calls.every((call) =>
        call.filters.some(
          (filter) => filter[0] === "owner_id" && filter[1] === ownerId,
        ),
      ),
    ).toBe(true);
    expect(mock.calls[1].orders).toEqual([
      ["attempt_number", { ascending: false }],
    ]);
    expect(mock.calls[2].orders).toEqual([["revision", { ascending: true }]]);
  });
  it("returns owner-scoped not-found before reading another user's evidence", async () => {
    const mock = client([null]);
    await expect(
      loadEvidenceReview(mock.db, analysisId, ids[6]),
    ).rejects.toMatchObject({ status: 404 });
    expect(mock.calls).toHaveLength(1);
  });
  it.each(["owner", "source", "score", "text"])(
    "rejects forged stored %s on replay",
    async (mutation) => {
      const forged = structuredClone(attempt);
      if (mutation === "owner") forged.envelope.ownerId = ids[6];
      if (mutation === "source") forged.envelope.sourceId = ids[6];
      if (mutation === "score")
        Object.assign(forged.envelope, { scoringEligible: true });
      if (mutation === "text")
        forged.envelope.spans[0].text = "Invented source";
      await expect(
        loadEvidenceReview(client([analysis, forged]).db, analysisId, ownerId),
      ).rejects.toMatchObject({ status: 422 });
    },
  );
  it("rejects revision gaps and wrong-owner correction events", async () => {
    const event = {
      id: eventId,
      attempt_id: attemptId,
      analysis_id: analysisId,
      owner_id: ownerId,
      actor_id: ids[6],
      revision: 2,
      expected_revision: 1,
      field: "employer",
      operation: "correct",
      value: "Owner-supplied Co",
      candidate_id: null,
      created_at: "2026-10-11T00:00:00.000Z",
    };
    await expect(
      loadEvidenceReview(
        client([analysis, attempt, [event]]).db,
        analysisId,
        ownerId,
      ),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("passes authenticated identity, CAS and idempotency to the authority RPC", async () => {
    const mock = client([analysis, attempt]);
    expect(
      await correctEvidenceReview(
        mock.db,
        analysisId,
        ownerId,
        input,
        "test-request",
      ),
    ).toMatchObject({ revision: 1, scoringEligible: false });
    expect(mock.rpc).toHaveBeenCalledWith("correct_document_evidence", {
      p_analysis_id: analysisId,
      p_attempt_id: attemptId,
      p_user_id: ownerId,
      p_expected_revision: 0,
      p_field: "employer",
      p_operation: "confirm",
      p_value: "Fictional Co",
      p_candidate_id: input.candidateId,
      p_idempotency_key: key,
      p_request_id: "test-request",
    });
    expect(attempt.envelope).toEqual(evidence);
  });
  it("permits exact idempotent retries and returns stale/key-reuse conflicts", async () => {
    const retry = client([analysis, attempt], {
      status: "applied",
      revision: 1,
      id: eventId,
      idempotent: true,
    });
    expect(
      (
        await correctEvidenceReview(
          retry.db,
          analysisId,
          ownerId,
          input,
          "retry-request",
        )
      ).idempotent,
    ).toBe(true);
    await expect(
      correctEvidenceReview(
        client([analysis, attempt], { status: "conflict", revision: 2 }).db,
        analysisId,
        ownerId,
        input,
        "test-request",
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("does not confirm changed values, forged candidate IDs or a candidate from another field", async () => {
    for (const changed of [
      { value: "Fictional changed" },
      { candidateId: "invented" },
      { field: "name" },
    ]) {
      const mock = client([analysis, attempt]);
      await expect(
        correctEvidenceReview(
          mock.db,
          analysisId,
          ownerId,
          { ...input, ...changed },
          "test-request",
        ),
      ).rejects.toMatchObject({ status: 422 });
      expect(mock.rpc).not.toHaveBeenCalled();
    }
  });
  it("records corrections separately, disallows source candidates on edits and enforces 500 characters", async () => {
    const mock = client([analysis, attempt]);
    await correctEvidenceReview(
      mock.db,
      analysisId,
      ownerId,
      {
        ...input,
        operation: "correct",
        candidateId: null,
        value: "Owner-supplied Co",
      },
      "test-request",
    );
    expect(mock.rpc.mock.calls[0]).toBeDefined();
    for (const changed of [
      { operation: "correct" },
      { value: "x".repeat(501) },
      { expectedRevision: -1 },
      { userId: ids[6] },
    ])
      await expect(
        correctEvidenceReview(
          client([]).db,
          analysisId,
          ownerId,
          { ...input, ...changed },
          "test-request",
        ),
      ).rejects.toMatchObject({ status: 422 });
  });
  it("maps not-found, rejected and malformed RPC results safely", async () => {
    await expect(
      correctEvidenceReview(
        client([analysis, attempt], { status: "not_found" }).db,
        analysisId,
        ownerId,
        input,
        "req",
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      correctEvidenceReview(
        client([analysis, attempt], null, { code: "22023" }).db,
        analysisId,
        ownerId,
        input,
        "req",
      ),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      correctEvidenceReview(
        client([analysis, attempt], { status: "applied", revision: "bad" }).db,
        analysisId,
        ownerId,
        input,
        "req",
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});
describe("bounded evidence correction form", () => {
  it("reads exact fields and parses an unambiguous revision", async () => {
    expect(await readEvidenceCorrectionForm(request(form()))).toEqual(input);
  });
  it.each([
    { expectedRevision: "1e2" },
    { expectedRevision: "01" },
    { expectedRevision: "-1" },
    { value: " " },
    { userId: ids[6] },
    { value: "x".repeat(501) },
  ])("rejects malformed or owner-injected form %j", async (overrides) => {
    await expect(
      readEvidenceCorrectionForm(request(form(overrides))),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("rejects duplicate fields and file uploads", async () => {
    const duplicate = form();
    duplicate.append("field", "name");
    await expect(
      readEvidenceCorrectionForm(request(duplicate)),
    ).rejects.toMatchObject({ status: 422 });
    const files = new FormData();
    for (const [k, v] of form()) files.set(k, v);
    files.set("value", new Blob(["fake"]), "resume.txt");
    await expect(
      readEvidenceCorrectionForm(request(files)),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("bounds actual bytes when content length is missing or falsely small", async () => {
    const large = new Request("https://example.test/evidence", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": "1",
      },
      body: "value=" + "x".repeat(8192),
    });
    await expect(readEvidenceCorrectionForm(large)).rejects.toMatchObject({
      status: 422,
    });
  });
});
