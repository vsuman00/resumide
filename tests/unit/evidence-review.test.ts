import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { extractDocumentForReviewWithMetadata } from "../../app/lib/server/document-extraction";
import { verifyDocumentReviewEvidence } from "../../scripts/verify-managed-document-review";
import { CONTACT_PDF_STREAM, syntheticPdf } from "../fixtures/native-pdf";
import { buildNativeEvidence } from "../../app/lib/server/native-evidence";
import { reconcileDocumentEvidence } from "../../app/lib/server/document-evidence";
import {
  correctEvidenceReview,
  loadEvidenceReview,
  readEvidenceCorrectionForm,
  type EvidenceReviewClient,
} from "../../app/lib/server/evidence-review";
import {
  CANONICAL_CORRECTION_PROJECTION_VERSION,
  projectCanonicalCorrections,
} from "../../app/lib/server/canonical-corrections";

afterEach(() => vi.restoreAllMocks());

const ids = Array.from(
  { length: 7 },
  (_, index) =>
    `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const [attemptId, ownerId, analysisId, sourceId, key, eventId] = ids;
const evidenceContext = {
  id: attemptId,
  ownerId,
  analysisId,
  sourceId,
  inputSha256: "a".repeat(64),
  createdAt: "2026-10-11T00:00:00.000Z",
  retentionPolicyId: "synthetic-local-30d/1.0.0",
};
const evidence = reconcileDocumentEvidence(
  evidenceContext,
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
type HistoryControls = {
  serverCap?: number;
  headError?: unknown;
  headData?: unknown;
  pageErrorAt?: number;
  pageData?: (index: number, values: unknown[]) => unknown;
  onPage?: (index: number, events: unknown[]) => void;
  onHeadWait?: (signal: AbortSignal) => void;
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
  controls: HistoryControls = {},
) {
  const calls: Array<{
    table: string;
    filters: unknown[][];
    orders: unknown[][];
    ranges: unknown[][];
    limit: number | null;
    signal?: AbortSignal;
  }> = [];
  let history: unknown;
  let historyRead = false;
  let pageCount = 0;
  const from = vi.fn((table: string) => {
    const record = {
      table,
      filters: [] as unknown[][],
      orders: [] as unknown[][],
      ranges: [] as unknown[][],
      limit: null as number | null,
      signal: undefined as AbortSignal | undefined,
    };
    calls.push(record);
    const data = table === "evidence_corrections" ? undefined : rows.shift();
    if (table === "evidence_corrections" && !historyRead) {
      history = rows.shift();
      historyRead = true;
    }
    const result = async (single: boolean) => {
      if (record.signal?.aborted)
        return { data: null, error: { message: "synthetic query aborted" } };
      if (table !== "evidence_corrections") return { data, error: null };
      const descending = record.orders.some(
        (order) =>
          order[0] === "revision" &&
          (order[1] as { ascending: boolean }).ascending === false,
      );
      if (descending && controls.onHeadWait) {
        if (!record.signal)
          return {
            data: null,
            error: { message: "missing synthetic abort signal" },
          };
        const signal = record.signal;
        return new Promise<{ data: unknown; error: unknown }>((resolve) => {
          signal.addEventListener(
            "abort",
            () =>
              resolve({
                data: null,
                error: { message: "synthetic query aborted" },
              }),
            { once: true },
          );
          controls.onHeadWait!(signal);
        });
      }
      if (descending && controls.headError)
        return { data: null, error: controls.headError };
      if (descending && "headData" in controls)
        return { data: controls.headData, error: null };
      if (!Array.isArray(history)) return { data: history, error: null };
      if (!descending) {
        pageCount++;
        controls.onPage?.(pageCount, history);
        if (controls.pageErrorAt === pageCount)
          return { data: null, error: { message: "synthetic page error" } };
      }
      let values = [...history].sort(
        (a, b) =>
          (Number((a as { revision: number })?.revision) -
            Number((b as { revision: number })?.revision)) *
          (descending ? -1 : 1),
      );
      for (const [operator, value] of record.ranges)
        values = values.filter((event) =>
          operator === "gt"
            ? Number((event as { revision: number }).revision) > Number(value)
            : Number((event as { revision: number }).revision) <= Number(value),
        );
      values = values.slice(
        0,
        Math.min(record.limit ?? Infinity, controls.serverCap ?? Infinity),
      );
      const selected =
        !descending && controls.pageData
          ? controls.pageData(pageCount, values)
          : values;
      return {
        data: single ? ((selected as unknown[])[0] ?? null) : selected,
        error: null,
      };
    };
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
      gt: vi.fn((column: string, value: number) => {
        record.ranges.push(["gt", value, column]);
        return chain;
      }),
      lte: vi.fn((column: string, value: number) => {
        record.ranges.push(["lte", value, column]);
        return chain;
      }),
      abortSignal: vi.fn((signal: AbortSignal) => {
        record.signal = signal;
        return chain;
      }),
      limit: vi.fn((value: number) => {
        record.limit = value;
        return chain;
      }),
      maybeSingle: vi.fn(async () => result(true)),
      then: (resolve: (value: unknown) => unknown) =>
        result(false).then(resolve),
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
  it("verifies the two-page worker PDF when no correction-history pages were read", async () => {
    const pdf = syntheticPdf([CONTACT_PDF_STREAM, ""]);
    const inputSha256 = createHash("sha256").update(pdf).digest("hex");
    const { envelope, pageCount } = await extractDocumentForReviewWithMetadata({
      bytes: pdf,
      context: { ...evidenceContext, inputSha256 },
      maxBytes: 10_000,
      maxPages: 2,
      maxCharacters: 1_000,
      timeoutMs: 5_000,
    });
    const mock = client([
      analysis,
      { ...attempt, input_sha256: inputSha256, envelope },
      [],
    ]);
    const review = await loadEvidenceReview(mock.db, analysisId, ownerId);
    expect(pageCount).toBe(2);
    expect(review.historyAttestation.pageCount).toBe(0);
    expect(() => verifyDocumentReviewEvidence(review, pageCount)).not.toThrow();
    expect(() => verifyDocumentReviewEvidence(review, 1)).toThrow(
      "EVIDENCE_MISMATCH",
    );
  });

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
    // Capture the owned high-water event before ascending prefix pages.
    expect(mock.calls[2].orders).toEqual([["revision", { ascending: false }]]);
  });
  it("adds a private source-bound derived target model without rewriting raw evidence", async () => {
    const original = JSON.stringify(attempt);
    const review = await loadEvidenceReview(
      client([analysis, attempt, []]).db,
      analysisId,
      ownerId,
    );
    expect(review.targets).toMatchObject({
      modelVersion: "evidence-targets/1.0.0",
      authority: "derived_review_only",
      scoringEligible: false,
      binding: {
        ownerId,
        analysisId,
        sourceId,
        inputSha256: "a".repeat(64),
        attemptId,
        evidenceSchemaVersion: evidence.schemaVersion,
        fieldExtractorVersion: evidence.fieldExtractorVersion,
      },
    });
    expect(
      review.targets.observations.map((value) => value.assertionId),
    ).toEqual(evidence.assertions.map((value) => value.id));
    expect(review.targets.coverage).toEqual(
      expect.arrayContaining(
        evidence.fields.map((value) =>
          expect.objectContaining({
            field: value.field,
            rawState: value.state,
          }),
        ),
      ),
    );
    expect(JSON.stringify(attempt)).toBe(original);
    expect(review.evidence).toEqual(evidence);
  });
  it("preserves legitimate contact multiplicity and the immutable raw conflict state", async () => {
    const multiple = reconcileDocumentEvidence(
      {
        id: attemptId,
        ownerId,
        analysisId,
        sourceId,
        inputSha256: "b".repeat(64),
        createdAt: "2026-10-11T00:00:00.000Z",
        retentionPolicyId: "synthetic-local-30d/1.0.0",
      },
      buildNativeEvidence([
        "Name: Demo Person\nfirst@example.invalid\nsecond@example.invalid",
      ]),
    );
    const review = await loadEvidenceReview(
      client([
        analysis,
        { ...attempt, input_sha256: multiple.inputSha256, envelope: multiple },
        [],
      ]).db,
      analysisId,
      ownerId,
    );
    expect(
      review.targets.targets.filter((target) => target.field === "email"),
    ).toHaveLength(2);
    expect(
      review.targets.targets
        .filter((target) => target.field === "email")
        .every(
          (target) =>
            target.kind === "contact_slot" &&
            target.state === "review_required",
        ),
    ).toBe(true);
    expect(
      review.evidence.fields.find((value) => value.field === "email")?.state,
    ).toBe("conflict");
    expect(
      review.targets.notices.some(
        (notice) =>
          notice.code === "multiple_contact_slots" && notice.field === "email",
      ),
    ).toBe(true);
    expect(
      review.targets.notices.every(
        (notice) => notice.relationship === "unresolved",
      ),
    ).toBe(true);
  });
  it("does not apply an old-attempt field correction to the active source targets", async () => {
    const event = {
      id: eventId,
      attempt_id: ids[6],
      analysis_id: analysisId,
      owner_id: ownerId,
      actor_id: ownerId,
      revision: 1,
      expected_revision: 0,
      field: "employer",
      operation: "correct",
      value: "Candidate-supplied historic employer",
      candidate_id: null,
      created_at: "2026-10-11T00:00:00.000Z",
    };
    const review = await loadEvidenceReview(
      client([analysis, attempt, [event]]).db,
      analysisId,
      ownerId,
    );
    expect(review.corrections).toEqual([event]);
    expect(review.targets.binding.attemptId).toBe(attemptId);
    expect(
      review.targets.observations.map((value) => value.value),
    ).not.toContain(event.value);
    expect(review.evidence).toEqual(evidence);
  });
  it("does not treat a derived review-target ID as authority for an existing correction write", async () => {
    const review = await loadEvidenceReview(
      client([analysis, attempt, []]).db,
      analysisId,
      ownerId,
    );
    const target = review.targets.targets.find(
      (value) => value.field === "employer",
    )!;
    const mock = client([analysis, attempt]);
    await expect(
      correctEvidenceReview(
        mock.db,
        analysisId,
        ownerId,
        {
          ...input,
          candidateId: target.id,
        },
        "target-read-only",
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(mock.rpc).not.toHaveBeenCalled();
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

function historyEvents(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    attempt_id: attemptId,
    analysis_id: analysisId,
    owner_id: ownerId,
    actor_id: ownerId,
    revision: index + 1,
    expected_revision: index,
    field: "employer",
    operation: "correct",
    value: `Synthetic correction ${index + 1}`,
    candidate_id: null,
    created_at: "2026-10-11T00:00:00.000Z",
  }));
}
const readClient = (events: unknown[], controls: HistoryControls = {}) =>
  client([analysis, attempt, events], undefined, null, controls);
describe("complete captured correction-history prefix", () => {
  it("reads past a simulated server cap lower than the requested page size without skipping", async () => {
    const events = historyEvents(5);
    const mock = readClient(events, { serverCap: 2 });
    const review = await loadEvidenceReview(mock.db, analysisId, ownerId);
    expect(review.corrections).toEqual(events);
    expect(review.revision).toBe(5);
    expect(review.historyAttestation).toMatchObject({
      schemaVersion: "evidence-review-history/1.0.0",
      state: "complete_captured_prefix",
      binding: {
        ...review.targets.binding,
        targetModelVersion: review.targets.modelVersion,
      },
      highWaterRevision: 5,
      highWaterEventId: events[4].id,
      receivedCount: 5,
      pageCount: 3,
    });
    const pages = mock.calls.filter(
      (call) =>
        call.table === "evidence_corrections" &&
        call.orders.some(
          (order) => (order[1] as { ascending: boolean }).ascending,
        ),
    );
    expect(
      pages.map((page) => page.ranges.find((range) => range[0] === "gt")?.[1]),
    ).toEqual([0, 2, 4]);
    expect(
      pages.every((page) =>
        page.ranges.some((range) => range[0] === "lte" && range[1] === 5),
      ),
    ).toBe(true);
    expect(pages.every((page) => page.limit === 100)).toBe(true);
    expect(
      mock.calls.every((call) =>
        call.filters.some(
          (filter) => filter[0] === "owner_id" && filter[1] === ownerId,
        ),
      ),
    ).toBe(true);
  });
  it("attests an empty captured prefix without inventing a history event or fetching a page", async () => {
    const mock = readClient([]);
    const review = await loadEvidenceReview(mock.db, analysisId, ownerId);
    expect(review.historyAttestation).toMatchObject({
      highWaterRevision: 0,
      highWaterEventId: null,
      receivedCount: 0,
      pageCount: 0,
    });
    expect(
      mock.calls.filter((call) => call.table === "evidence_corrections"),
    ).toHaveLength(1);
  });
  it("retains historical evidence replay and an explicit null extractor binding", async () => {
    const legacy = structuredClone(attempt);
    delete legacy.envelope.fieldExtractorVersion;
    const before = JSON.stringify(legacy);
    const review = await loadEvidenceReview(
      client([analysis, legacy, []]).db,
      analysisId,
      ownerId,
    );
    expect(review.evidence.fieldExtractorVersion).toBeUndefined();
    expect(review.historyAttestation.binding.fieldExtractorVersion).toBeNull();
    expect(JSON.stringify(legacy)).toBe(before);
  });
  it("finishes the captured prefix when another immutable event is appended mid-paging", async () => {
    const events = historyEvents(3);
    const expected = structuredClone(events);
    const mock = readClient(events, {
      serverCap: 1,
      onPage: (index, all) => {
        if (index === 1) all.push(historyEvents(4)[3]);
      },
    });
    const review = await loadEvidenceReview(mock.db, analysisId, ownerId);
    expect(review.corrections).toEqual(expected);
    expect(review.revision).toBe(3);
    expect(events).toHaveLength(4);
    expect(review.historyAttestation.highWaterRevision).toBe(3);
    expect(
      mock.calls.filter(
        (call) =>
          call.table === "evidence_corrections" &&
          call.orders.some(
            (order) => (order[1] as { ascending: boolean }).ascending === false,
          ),
      ),
    ).toHaveLength(1);
  });
  it("never returns a supposedly complete DTO when a page disappears before the captured head", async () => {
    const mock = readClient(historyEvents(5), {
      serverCap: 2,
      pageData: (index, values) => (index === 2 ? [] : values),
    });
    await expect(
      loadEvidenceReview(mock.db, analysisId, ownerId),
    ).rejects.toMatchObject({ status: 503 });
  });
  it.each([
    "gap",
    "foreign_owner",
    "foreign_actor",
    "foreign_analysis",
    "malformed",
    "out_of_prefix",
    "duplicate_id",
  ])("rejects an unsafe captured page: %s", async (kind) => {
    const events = historyEvents(5);
    const mock = readClient(events, {
      serverCap: 2,
      pageData: (index, values) => {
        if (index !== 2) return values;
        if (kind === "gap") return values.slice(1);
        if (kind === "malformed") return null;
        if (kind === "out_of_prefix") return [...values, historyEvents(6)[5]];
        const changed = { ...(values[0] as Record<string, unknown>) };
        if (kind === "foreign_owner") changed.owner_id = ids[6];
        if (kind === "foreign_actor") changed.actor_id = ids[6];
        if (kind === "foreign_analysis") changed.analysis_id = ids[6];
        if (kind === "duplicate_id") changed.id = events[0].id;
        return [changed, ...values.slice(1)];
      },
    });
    await expect(
      loadEvidenceReview(mock.db, analysisId, ownerId),
    ).rejects.toMatchObject({ status: 422 });
  });
  it.each(["head", "page"])(
    "fails closed on a %s query error",
    async (where) => {
      const mock = readClient(historyEvents(5), {
        serverCap: 2,
        ...(where === "head"
          ? { headError: { message: "synthetic head error" } }
          : { pageErrorAt: 2 }),
      });
      await expect(
        loadEvidenceReview(mock.db, analysisId, ownerId),
      ).rejects.toMatchObject({ status: 503 });
    },
  );
  it.each(["owner", "revision", "event_id"])(
    "rejects a captured head that cannot be verified: %s",
    async (kind) => {
      const events = historyEvents(2);
      const head: Record<string, unknown> = { ...events[1] };
      if (kind === "owner") head.owner_id = ids[6];
      if (kind === "revision") head.revision = "2";
      if (kind === "event_id") head.id = ids[6];
      const mock = readClient(events, { headData: head });
      await expect(
        loadEvidenceReview(mock.db, analysisId, ownerId),
      ).rejects.toMatchObject({ status: 422 });
    },
  );
  it.each(["rows", "pages", "text"])(
    "returns explicit unavailability rather than truncating an over-limit %s operation",
    async (kind) => {
      const events = historyEvents(
        kind === "rows" ? 1001 : kind === "pages" ? 33 : 2,
      );
      const mock = readClient(events, {
        ...(kind === "pages" ? { serverCap: 1 } : {}),
        ...(kind === "text"
          ? {
              pageData: (_index: number, values: unknown[]) => [
                {
                  ...(values[0] as Record<string, unknown>),
                  value: "x".repeat(2_000_001),
                },
                ...values.slice(1),
              ],
            }
          : {}),
      });
      await expect(
        loadEvidenceReview(mock.db, analysisId, ownerId),
      ).rejects.toMatchObject({ status: 503 });
      expect(
        mock.calls.filter(
          (call) =>
            call.table === "evidence_corrections" &&
            call.orders.some(
              (order) => (order[1] as { ascending: boolean }).ascending,
            ),
        ),
      ).toHaveLength(kind === "rows" ? 0 : kind === "pages" ? 32 : 1);
    },
  );
  it("does not dispatch an already-aborted read", async () => {
    const controller = new AbortController();
    controller.abort();
    const mock = readClient([]);
    await expect(
      loadEvidenceReview(mock.db, analysisId, ownerId, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(mock.calls).toEqual([]);
  });
  it("passes a finite operation deadline to every query and stops an aborting head query", async () => {
    const deadline = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(deadline.signal);
    const mock = readClient([], { onHeadWait: () => deadline.abort() });
    await expect(
      loadEvidenceReview(mock.db, analysisId, ownerId),
    ).rejects.toMatchObject({ status: 503 });
    expect(timeout).toHaveBeenCalledWith(5000);
    expect(mock.calls.every((call) => call.signal === deadline.signal)).toBe(
      true,
    );
  });
  it("honors caller cancellation while a captured-head query is pending", async () => {
    const controller = new AbortController();
    const mock = readClient([], { onHeadWait: () => controller.abort() });
    await expect(
      loadEvidenceReview(mock.db, analysisId, ownerId, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(controller.signal.aborted).toBe(true);
  });
  it("passes a loader-attested prefix into the read-only canonical projection", async () => {
    const review = await loadEvidenceReview(
      readClient(historyEvents(3), { serverCap: 1 }).db,
      analysisId,
      ownerId,
    );
    const result = projectCanonicalCorrections({
      review,
      ownedContext: {
        ownerId,
        analysisId,
        sourceId,
        inputSha256: evidence.inputSha256,
        attemptId,
        resumeId: ids[4],
        organizationId: ids[6],
      },
      expectedBinding: {
        ...review.targets.binding,
        resumeId: ids[4],
        organizationId: ids[6],
        targetModelVersion: review.targets.modelVersion,
        projectionModelVersion: CANONICAL_CORRECTION_PROJECTION_VERSION,
        reviewRevision: review.revision,
        canonicalHeadId: null,
      },
      canonicalSnapshot: null,
      selections: [],
    });
    expect(result.historyCompleteness).toBe("complete_captured_prefix");
    expect(result.materialized).toBe(false);
    expect(result.authority).toBe("review_projection_only");
  });
});
