import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  finishLegacyScoringInput,
  validateLegacyScoringInputContext,
  LegacyScoringInputContextSchema,
  LegacyScoringResultSchema,
  LegacyScoringInputError,
  loadLegacyScoringContext,
  loadLegacyScoringInput,
  type LegacyScoringInputContext,
  type LegacyScoringInputProfile,
  type LegacyScoringReceipt,
} from "../../app/lib/server/legacy-scoring-input";
import { scoreExtractedResume } from "../../app/lib/server/scoring-stage";

// Explicit synthetic metadata vectors, never catalog attestations.
const profile: LegacyScoringInputProfile = {
  schemaVersion: "legacy-scoring-readiness/1.0.0",
  profileVersion: "legacy-scoring-profile/1.0.0",
  checkerSha256: "1".repeat(64),
  readerSha256: "2".repeat(64),
  finishSha256: "3".repeat(64),
  contextSha256: "4".repeat(64),
  exportSha256: "5".repeat(64),
  metadataSha256: "6".repeat(64),
};
const ids = {
  analysis: "00000000-0000-4000-8000-000000000101",
  owner: "00000000-0000-4000-8000-000000000102",
  org: "00000000-0000-4000-8000-000000000103",
  resume: "00000000-0000-4000-8000-000000000104",
  version: "00000000-0000-4000-8000-000000000105",
  job: "00000000-0000-4000-8000-000000000106",
};
const lease = {
  workerId: "worker-unit",
  attempt: 1,
  leaseFence: "00000000-0000-4000-8000-000000000107",
};
const options = { expectedProfile: profile };
function context(): LegacyScoringInputContext {
  const text =
    "Unit Engineer\n\nExperience\nBuilt services using Python\n\nSkills\nPython";
  const textChecksum = createHash("sha256").update(text).digest("hex");
  return LegacyScoringInputContextSchema.parse({
    schemaVersion: "legacy-scoring-input/1.0.0",
    analysisId: ids.analysis,
    ownerId: ids.owner,
    organizationId: ids.org,
    requestId: "unit-request",
    source: {
      resumeId: ids.resume,
      resumeVersionId: ids.version,
      fileChecksum: "a".repeat(64),
      bytes: 1000,
      mediaType: "application/pdf",
    },
    extraction: {
      text,
      textChecksum,
      pageCount: 1,
      pageTexts: [text],
      extractorVersion: "unpdf-v1",
      contentSha256: "b".repeat(64),
    },
    job: {
      kind: "owned_job",
      id: ids.job,
      title: "Unit role",
      description: "Python required",
      companyName: "",
      contentSha256: "c".repeat(64),
    },
    binding: {
      schemaVersion: "legacy-scoring-binding/1.0.0",
      analysisId: ids.analysis,
      ownerId: ids.owner,
      organizationId: ids.org,
      resumeId: ids.resume,
      resumeVersionId: ids.version,
      fileChecksum: "a".repeat(64),
      textChecksum,
      extractionSha256: "b".repeat(64),
      jobId: ids.job,
      jobSha256: "c".repeat(64),
      inputBindingSha256: "d".repeat(64),
    },
    producer: {
      parserVersion: "parse-sim-v1",
      rulesetVersion: "ats-rules-v4",
      normalizerVersion: "normalizer-v1",
      taxonomyVersion: "skills-taxonomy-v1",
    },
  });
}
function result(c = context()) {
  return scoreExtractedResume({
    text: c.extraction.text,
    pageCount: c.extraction.pageCount,
    pageTexts: c.extraction.pageTexts,
    textChecksum: c.extraction.textChecksum,
    jobDescription: c.job.kind === "none" ? "" : c.job.description,
  });
}
function receipt(c = context()): LegacyScoringReceipt {
  return {
    schemaVersion: "legacy-scoring-receipt/1.0.0",
    analysisId: c.analysisId,
    ownerId: c.ownerId,
    organizationId: c.organizationId,
    resumeVersionId: c.source.resumeVersionId,
    inputBindingSha256: c.binding.inputBindingSha256,
    resultChecksum: result(c).resultChecksum,
    deterministicContentSha256: "e".repeat(64),
    createdAt: "2026-11-15T00:00:00.123456Z",
    replayed: false,
  };
}
function client(
  data: unknown,
  metadata: unknown = { ...profile, schemaReady: true, writerExecutable: true },
) {
  return {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      void args;
      return {
        data: name === "read_legacy_scoring_readiness" ? metadata : data,
        error: null,
      };
    }),
  };
}
const ready = (c = context()) => ({
  schemaVersion: "legacy-scoring-read/1.0.0",
  status: "ready",
  context: c,
});
const command = () => ({
  analysisId: ids.analysis,
  lease,
  binding: context().binding,
  result: result(),
  processId: "scorer-unit",
  requestId: "unit-request",
});

describe("legacy scoring owned-input adapter with synthetic native metadata", () => {
  it("reuses the full pure decoder and rejects malformed native Unicode", () => {
    const c = context();
    expect(
      validateLegacyScoringInputContext(c, ids.analysis, ids.owner),
    ).toEqual(c);
    expect(() =>
      validateLegacyScoringInputContext(c, ids.analysis, ids.org),
    ).toThrow(LegacyScoringInputError);
    for (const value of ["unit\0text", "unit\uD800text"]) {
      const bad = context();
      bad.extraction.text = value;
      bad.extraction.textChecksum = createHash("sha256")
        .update(value)
        .digest("hex");
      bad.binding.textChecksum = bad.extraction.textChecksum;
      expect(() =>
        validateLegacyScoringInputContext(bad, ids.analysis, ids.owner),
      ).toThrow(LegacyScoringInputError);
    }
    const good = context();
    good.extraction.text += " \u{1F600}";
    good.extraction.textChecksum = createHash("sha256")
      .update(good.extraction.text)
      .digest("hex");
    good.binding.textChecksum = good.extraction.textChecksum;
    expect(
      validateLegacyScoringInputContext(good, ids.analysis, ids.owner),
    ).toEqual(good);
  });
  it("admits exact original text/pages/JD without changing deterministic output", async () => {
    const c = context(),
      store = client(ready(c));
    expect(
      await loadLegacyScoringInput(store, ids.analysis, lease, options),
    ).toEqual(ready(c));
    expect(result(c)).toEqual(result());
    expect(store.rpc.mock.calls.map(([n]) => n)).toEqual([
      "read_legacy_scoring_readiness",
      "read_legacy_scoring_input",
    ]);
    expect(store.rpc.mock.calls[1][1]).toEqual({
      p_analysis_id: ids.analysis,
      p_lease: lease,
    });
  });
  it("preserves actual no-job and empty-page-array inputs", async () => {
    const c = context();
    c.job = { kind: "none" };
    c.binding.jobId = null;
    c.binding.jobSha256 = null;
    c.extraction.pageTexts = [];
    expect(
      await loadLegacyScoringInput(
        client(ready(c)),
        ids.analysis,
        lease,
        options,
      ),
    ).toEqual(ready(c));
  });
  it("returns committed or skipped without inventing context", async () => {
    const saved = {
      schemaVersion: "legacy-scoring-read/1.0.0",
      status: "committed",
      receipt: receipt(),
    };
    expect(
      await loadLegacyScoringInput(client(saved), ids.analysis, lease, options),
    ).toEqual(saved);
    const skipped = {
      schemaVersion: "legacy-scoring-read/1.0.0",
      status: "skipped",
      analysisId: ids.analysis,
      reason: "not_scoring",
    };
    expect(
      await loadLegacyScoringInput(
        client(skipped),
        ids.analysis,
        lease,
        options,
      ),
    ).toEqual(skipped);
  });
  it.each(["schema", "profile", "pin", "extra", "schemaReady", "missing"])(
    "fails closed on %s metadata before a data call",
    async (kind) => {
      const metadata = {
        ...profile,
        schemaReady: true,
        writerExecutable: true,
      };
      const bad =
        kind === "schema"
          ? { ...metadata, schemaVersion: "old" }
          : kind === "profile"
            ? { ...metadata, profileVersion: "old" }
            : kind === "pin"
              ? { ...metadata, readerSha256: "f".repeat(64) }
              : kind === "extra"
                ? { ...metadata, privateCanary: true }
                : kind === "schemaReady"
                  ? { ...metadata, schemaReady: false }
                  : null;
      const store = client(ready(), bad);
      await expect(
        loadLegacyScoringInput(store, ids.analysis, lease, options),
      ).rejects.toMatchObject({ code: "unavailable" });
      expect(store.rpc).toHaveBeenCalledTimes(1);
    },
  );
  it("does not dispatch finish while staged or retry a native refusal", async () => {
    const store = client(receipt(), {
      ...profile,
      schemaReady: true,
      writerExecutable: false,
    });
    await expect(
      finishLegacyScoringInput(store, command(), options),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(store.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["text", "source", "owner", "job", "digest", "extra"])(
    "refuses mismatched %s in a ready owned context",
    async (kind) => {
      const c = context();
      if (kind === "text") c.extraction.text += " changed";
      if (kind === "source") c.source.resumeVersionId = ids.job;
      if (kind === "owner") c.binding.ownerId = ids.org;
      if (kind === "job") c.binding.jobId = null;
      if (kind === "digest") c.binding.extractionSha256 = "f".repeat(64);
      const raw =
        kind === "extra" ? { ...ready(c), callerProof: true } : ready(c);
      await expect(
        loadLegacyScoringInput(client(raw), ids.analysis, lease, options),
      ).rejects.toMatchObject({ code: "unavailable" });
    },
  );
  it("uses exact original result/binding on finish replay, without fresh source reads", async () => {
    let finishes = 0;
    const seen: unknown[] = [];
    const store = {
      rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
        if (name === "read_legacy_scoring_readiness")
          return {
            data: { ...profile, schemaReady: true, writerExecutable: true },
            error: null,
          };
        seen.push(args);
        return {
          data: { ...receipt(), replayed: finishes++ > 0 },
          error: null,
        };
      }),
    };
    const first = await finishLegacyScoringInput(store, command(), options);
    const replay = await finishLegacyScoringInput(
      store,
      { ...command(), processId: "scorer-new-audit" },
      options,
    );
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toMatchObject({
      p_binding: command().binding,
      p_result: command().result,
    });
    expect(
      store.rpc.mock.calls.every(
        ([n]) =>
          n === "read_legacy_scoring_readiness" ||
          n === "finish_legacy_scoring_input",
      ),
    ).toBe(true);
  });
  it("keeps changed-JD history separate and old results explicitly unbound", async () => {
    const c = context(),
      history = {
        schemaVersion: "legacy-scoring-context/1.0.0",
        status: "bound",
        currentness: "historical",
        context: c,
        result: result(c),
        receipt: receipt(c),
      };
    expect(
      await loadLegacyScoringContext(
        client(history),
        ids.analysis,
        ids.owner,
        options,
      ),
    ).toEqual(history);
    const old = {
      schemaVersion: "legacy-scoring-context/1.0.0",
      status: "legacy_unbound",
      analysisId: ids.analysis,
      reason: "original_input_binding_missing",
    };
    expect(
      await loadLegacyScoringContext(
        client(old),
        ids.analysis,
        ids.owner,
        options,
      ),
    ).toEqual(old);
    expect(old).not.toHaveProperty("context");
    await expect(
      loadLegacyScoringContext(client(history), ids.analysis, ids.org, options),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
  it("correlates all result/receipt fields and refuses malformed numeric output before IO", async () => {
    const badReceipt = { ...receipt(), inputBindingSha256: "f".repeat(64) };
    await expect(
      finishLegacyScoringInput(client(badReceipt), command(), options),
    ).rejects.toMatchObject({ code: "unavailable" });
    const store = client(receipt()),
      cmd = command();
    cmd.result.score = 101;
    await expect(
      finishLegacyScoringInput(store, cmd, options),
    ).rejects.toBeInstanceOf(LegacyScoringInputError);
    expect(store.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ["22023", "invalid"],
    ["42501", "not_found"],
    ["P0C01", "stale"],
    ["P0C03", "unavailable"],
    ["P0002", "not_found"],
    ["UNKNOWN", "unavailable"],
  ])("maps %s safely without raw messages", async (native, code) => {
    const store = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: native, message: "PRIVATE_UNIT_CANARY" },
      })),
    };
    const error = await loadLegacyScoringInput(
      store,
      ids.analysis,
      lease,
      options,
    ).catch((e) => e);
    expect(error).toBeInstanceOf(LegacyScoringInputError);
    expect(error.code).toBe(code);
    expect(error.message).not.toContain("PRIVATE_UNIT_CANARY");
    expect(store.rpc).toHaveBeenCalledTimes(1);
  });
  it("admits only bounded data and strict valid lease/owner identities", async () => {
    const c = context();
    c.job = {
      kind: "owned_job",
      id: ids.job,
      title: "",
      description: "x".repeat(4 * 1024 * 1024),
      companyName: "",
      contentSha256: "c".repeat(64),
    };
    await expect(
      loadLegacyScoringInput(client(ready(c)), ids.analysis, lease, options),
    ).rejects.toMatchObject({ code: "unavailable" });
    const store = client(ready());
    await expect(
      loadLegacyScoringInput(
        store,
        ids.analysis,
        { ...lease, attempt: 0 },
        options,
      ),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(store.rpc).not.toHaveBeenCalled();
  });
  it("bounds synchronous throws, pre-abort, stalled RPC, and elapsed deadline across both calls", async () => {
    const thrown = {
      rpc: vi.fn(() => {
        throw new Error("PRIVATE_UNIT_CANARY");
      }),
    };
    await expect(
      loadLegacyScoringInput(thrown, ids.analysis, lease, options),
    ).rejects.toMatchObject({ code: "unavailable" });
    const aborted = new AbortController();
    aborted.abort();
    const store = client(ready());
    await expect(
      loadLegacyScoringInput(store, ids.analysis, lease, {
        ...options,
        signal: aborted.signal,
      }),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(store.rpc).not.toHaveBeenCalled();
    const stalled = {
      rpc: vi.fn(
        () => new Promise<{ data: unknown; error: unknown }>(() => {}),
      ),
    };
    await expect(
      loadLegacyScoringInput(stalled, ids.analysis, lease, {
        ...options,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
    let now = 0;
    const clock = {
      rpc: vi.fn(async (name: string) => {
        now += 3;
        return {
          data:
            name === "read_legacy_scoring_readiness"
              ? { ...profile, schemaReady: true, writerExecutable: true }
              : ready(),
          error: null,
        };
      }),
    };
    await expect(
      loadLegacyScoringInput(clock, ids.analysis, lease, {
        ...options,
        timeoutMs: 5,
        now: () => now,
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("existing producer checksum self-consistency", () => {
  it("refuses a changed in-domain score retaining the original checksum before any RPC", async () => {
    const input = command();
    input.result.score =
      input.result.score === 100 ? 99 : input.result.score + 1;
    const store = client(receipt());
    await expect(
      finishLegacyScoringInput(store, input, options),
    ).rejects.toBeInstanceOf(LegacyScoringInputError);
    expect(store.rpc).not.toHaveBeenCalled();
  });
});

// Deliberately different recursive object insertion order, as can occur after
// JSONB transport. Arrays and values are preserved; no new checksum is invented.
function differentObjectKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(differentObjectKeyOrder);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, child]) => [key, differentObjectKeyOrder(child)]),
    );
  return value;
}
const checksumBranches = [
  {
    name: "original unit producer",
    pages: null,
    text: null,
    jd: "Python required",
  },
  {
    name: "full contact, fractional credit and uncertain lexical evidence",
    pages: null,
    text: "Unit Engineer\nunit@example.invalid\n+1 555 010 2000\nRemote\nhttps://example.invalid/unit\n\nExperience\n2020 - 2022\n- Built resonant services using Python\n- Created APIs using Python\n\nEducation\nUnit degree\n\nSkills\nPython",
    jd: "Python TypeScript resonant",
  },
  {
    name: "no JD and absent optional evidence/credit",
    pages: [],
    text: "x",
    jd: null,
  },
  {
    name: "all page confidence branches and exact snapshots",
    pages: [
      "Unit Engineer\nExperience\n- Built services using Python\nSkills\nPython",
      "Unit data",
      "Q",
      "",
    ],
    text: null,
    jd: "Python",
  },
  {
    name: "layout warnings, fallback pages and alias spans",
    pages: [],
    text: "Unit Engineer\nExperience    Skills\nunit@example.invalid\nExperience\n- Built services using JS and Postgres\nSkills\nJavaScript PostgreSQL\nEducation\nUnit programme",
    jd: "JavaScript PostgreSQL",
  },
  {
    name: "non-ASCII and astral text",
    pages: [],
    text: "Unit Engineer\nExperience\n- Built Python services for résumé search 😀\nSkills\nPython",
    jd: "Python résumé",
  },
];
describe("existing producer checksum self-consistency branches", () => {
  it.each(checksumBranches)(
    "admits actual $name after object-key reordering on finish and saved read",
    async (branch) => {
      const c = context();
      if (branch.pages?.length) {
        c.extraction.pageTexts = branch.pages;
        c.extraction.pageCount = branch.pages.length;
        c.extraction.text = branch.pages.join("\n");
      } else if (branch.text !== null) {
        c.extraction.text = branch.text;
        c.extraction.pageTexts = branch.pages ?? [branch.text];
        if (branch.name.includes("fallback")) c.extraction.pageCount = 2;
      }
      c.extraction.textChecksum = createHash("sha256")
        .update(c.extraction.text)
        .digest("hex");
      c.binding.textChecksum = c.extraction.textChecksum;
      if (branch.jd === null) {
        c.job = { kind: "none" };
        c.binding.jobId = null;
        c.binding.jobSha256 = null;
      } else if (c.job.kind === "owned_job") c.job.description = branch.jd;
      const actual = result(c),
        nativeOrder = differentObjectKeyOrder(
          JSON.parse(JSON.stringify(actual)),
        );
      expect(JSON.stringify(nativeOrder)).not.toBe(JSON.stringify(actual));
      const transported = LegacyScoringResultSchema.parse(nativeOrder);
      const nativeReceipt = receipt(c);
      const cmd = { ...command(), binding: c.binding, result: transported };
      expect(
        await finishLegacyScoringInput(client(nativeReceipt), cmd, options),
      ).toEqual(nativeReceipt);
      const saved = {
        schemaVersion: "legacy-scoring-context/1.0.0",
        status: "bound",
        currentness: "historical",
        context: c,
        result: nativeOrder,
        receipt: nativeReceipt,
      };
      expect(
        await loadLegacyScoringContext(
          client(saved),
          ids.analysis,
          ids.owner,
          options,
        ),
      ).toMatchObject({
        status: "bound",
        // JSON/JSONB omits undefined optional evidence; every JSON value stays exact.
        result: JSON.parse(JSON.stringify(actual)),
      });
      if (branch.name.includes("fractional")) {
        expect(
          actual.ruleTrace.some(
            (r) => r.credit !== undefined && r.credit > 0 && r.credit < 1,
          ),
        ).toBe(true);
        expect(
          actual.keywordCoverage.evidence.some(
            (e) =>
              e.uncertain &&
              e.job.spans.length > 0 &&
              e.resume.spans.length > 0,
          ),
        ).toBe(true);
        expect(actual.parseView.contact).toMatchObject({
          name: "Unit Engineer",
          email: "unit@example.invalid",
          location: "Remote",
        });
        expect(actual.parseView.contact.links).toHaveLength(1);
        expect(actual.parseView.contact.phone).not.toBeNull();
      }
      if (branch.jd === null) {
        expect(
          actual.ruleTrace.some(
            (r) => r.outcome === "not_evaluated" && r.credit === undefined,
          ),
        ).toBe(true);
        expect(actual.ruleTrace.some((r) => r.evidence === undefined)).toBe(
          true,
        );
        expect(actual.keywordCoverage.evidence).toEqual([]);
      }
      if (branch.name.includes("confidence"))
        expect(actual.parseView.pages.map((p) => p.confidence)).toEqual([
          "high",
          "medium",
          "low",
          "low",
        ]);
      if (branch.name.includes("layout"))
        expect(
          actual.parseView.warnings.some((w) => w.field === "overall"),
        ).toBe(true);
    },
  );
  it("rejects altered saved numeric content even when its original receipt/checksum strings match", async () => {
    const c = context(),
      altered = result(c);
    altered.ruleTrace[0].weight += 1;
    const saved = {
      schemaVersion: "legacy-scoring-context/1.0.0",
      status: "bound",
      currentness: "current",
      context: c,
      result: altered,
      receipt: receipt(c),
    };
    await expect(
      loadLegacyScoringContext(client(saved), ids.analysis, ids.owner, options),
    ).rejects.toBeInstanceOf(LegacyScoringInputError);
  });
  it("refuses checksum-only and unsupported-producer/domain mutations before finish IO", async () => {
    const checksum = command();
    checksum.result.resultChecksum = "f".repeat(64);
    const unknown = JSON.parse(JSON.stringify(command()));
    unknown.result.rulesetVersion = "ats-rules-v3";
    const extra = JSON.parse(JSON.stringify(command()));
    extra.result.parseView.contact.authority = true;
    for (const raw of [checksum, unknown, extra]) {
      const store = client(receipt());
      await expect(
        finishLegacyScoringInput(store, raw, options),
      ).rejects.toBeInstanceOf(LegacyScoringInputError);
      expect(store.rpc).not.toHaveBeenCalled();
    }
  });
});
