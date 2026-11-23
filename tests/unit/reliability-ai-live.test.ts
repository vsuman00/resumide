import { describe, expect, it } from "vitest";
import {
  assessBuildProbe,
  assessLiteralSupport,
  assessWriterProbe,
  assertProductionFixtureReadiness,
  createLiveFetchObserver,
  parseLiveProviderEnvironment,
  stopAfterCase,
  safeObservationMetadata,
  summarizeWritingStages,
  resolveAllocatedCases,
  REQUIRED_SOURCES,
  type ProbeCase,
} from "../../scripts/verify-reliability-ai-live";

const original =
  "Built Python services with PostgreSQL for Harbor Tools and reduced latency by 20%.";
const safeRewrite =
  "Developed Python services with PostgreSQL for Harbor Tools; reduced latency by 20%.";
const supported = () => ({ state: "supported" as const });
const environment = {
  RESUMIDE_PRIVATE_VERIFY: "aa7-owned-synthetic",
  OPENAI_API_KEY: "synthetic-offline-fixture",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  OPENAI_MODEL: "synthetic-model",
  OPENAI_TIMEOUT_MS: "20000",
  OPENAI_MAX_OUTPUT_TOKENS: "1200",
};

describe("validated stage diagnostics", () => {
  it("binds the shared provider-attempt dependency before live allocation", () => {
    expect(REQUIRED_SOURCES).toContain("app/lib/server/provider-attempt.ts");
  });
  it.each([
    ["Node.js", "Node js"],
    ["Node.js20", "Node js20"],
    [".NET", "NET"],
  ])(
    "preserves dotted identifier %s even with an injected accepting IR",
    (identifier, changed) => {
      const source = `Built a ${identifier} API.`;
      const rewrite = `Created a ${changed} API.`;
      expect(assessLiteralSupport(source, `Created a ${identifier} API.`)).toBe(
        true,
      );
      expect({
        literal: assessLiteralSupport(source, rewrite),
        writer: assessWriterProbe(
          {
            summary: null,
            bullets: [
              { original: source, rewrite, reasoning: "Clarifies wording." },
            ],
          },
          [source],
          supported,
        ).classification,
      }).toEqual({ literal: false, writer: "unsafe_output" });
    },
  );
  it("blocks an excluded Build fix and caps the selected four at 3,584 tokens", async () => {
    const caseAllocation = resolveAllocatedCases(
      ["qualitative", "rewrite", "build_rewrite", "build_resume"],
      4,
      3584,
    );
    let current: ProbeCase = {
      name: "build_fix",
      cap: 768,
      controller: new AbortController(),
      fetchDispatches: 0,
      statuses: [],
      usage: null,
      responseModel: null,
    };
    let calls = 0;
    const observer = createLiveFetchObserver({
      model: "synthetic-model",
      current: () => current,
      caseAllocation,
      fetch: async () => {
        calls++;
        return new Response("{}");
      },
    });
    const dispatch = () =>
      observer.fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        redirect: "error",
        body: JSON.stringify({
          model: "synthetic-model",
          max_completion_tokens: current.cap,
        }),
      });
    await expect(dispatch()).rejects.toThrow("allocation_rejected");
    expect(calls).toBe(0);
    for (const name of caseAllocation.cases) {
      current = {
        name,
        cap: name.startsWith("build_") ? 768 : 1024,
        controller: new AbortController(),
        fetchDispatches: 0,
        statuses: [],
        usage: null,
        responseModel: null,
      };
      await dispatch();
    }
    expect(observer.metadata()).toEqual({
      fetchDispatches: 4,
      requestedOutputTokens: 3584,
    });
    current = {
      name: "qualitative",
      cap: 1024,
      controller: new AbortController(),
      fetchDispatches: 0,
      statuses: [],
      usage: null,
      responseModel: null,
    };
    await expect(dispatch()).rejects.toThrow("allocation_rejected");
    expect(calls).toBe(4);
  });
  it("keeps legacy five cases and admits only an exact unique closed four-case budget", () => {
    expect(resolveAllocatedCases(undefined, 5, 4352).cases).toHaveLength(5);
    const cases = ["qualitative", "rewrite", "build_rewrite", "build_resume"];
    expect(resolveAllocatedCases(cases, 4, 3584)).toEqual({
      cases,
      maxRequests: 4,
      maxRequestedOutputTokens: 3584,
    });
    for (const [selection, requests, tokens] of [
      [[], 0, 0],
      [["rewrite", "rewrite"], 2, 2048],
      [["unknown"], 1, 1024],
      [cases, 5, 4352],
      [cases, 4, 4353],
    ]) {
      expect(() => resolveAllocatedCases(selection, requests, tokens)).toThrow(
        "allocation_rejected",
      );
    }
  });
  it("does not attach sentence periods to different fact words during an independently approved reorder", () => {
    expect(
      assessLiteralSupport(
        "Built a TypeScript dashboard; Maintained a Python API.",
        "Maintained a Python API; Built a TypeScript dashboard.",
      ),
    ).toBe(true);
  });
  it("keeps stages unknown until observed and distinguishes actual zero proposals", () => {
    expect(summarizeWritingStages(null, null)).toEqual({
      proposalCount: null,
      retainedCount: null,
      filteredAfterProposalBoundary: null,
      retainedUnchangedCount: null,
      retainedTextChangedCount: null,
      retainedMateriallyChangedCount: null,
    });
    expect(summarizeWritingStages(0, { summary: null, bullets: [] })).toEqual({
      proposalCount: 0,
      retainedCount: 0,
      filteredAfterProposalBoundary: 0,
      retainedUnchangedCount: 0,
      retainedTextChangedCount: 0,
      retainedMateriallyChangedCount: 0,
    });
  });
  it("distinguishes filtering from retained unchanged and changed output without storing text", () => {
    const writer = {
      summary: null,
      bullets: [
        { original, rewrite: original, reasoning: "CANARY_STAGE_REASON" },
        { original, rewrite: safeRewrite, reasoning: "CANARY_STAGE_REASON" },
      ],
    };
    const metadata = summarizeWritingStages(3, writer);
    expect(metadata).toEqual({
      proposalCount: 3,
      retainedCount: 2,
      filteredAfterProposalBoundary: 1,
      retainedUnchangedCount: 1,
      retainedTextChangedCount: 1,
      retainedMateriallyChangedCount: 1,
    });
    expect(JSON.stringify(metadata)).not.toContain("CANARY_STAGE_REASON");
    expect(JSON.stringify(metadata)).not.toContain(original);
    expect(
      summarizeWritingStages(2, null).filteredAfterProposalBoundary,
    ).toBeNull();
    expect(
      summarizeWritingStages(2, { summary: null, bullets: [] })
        .filteredAfterProposalBoundary,
    ).toBe(2);
  });
});

describe("actual production fixture readiness", () => {
  it("admits the fixed positive through actual source IDs, IR, writer wrappers and Build pure apply before HTTP", async () => {
    expect(await assertProductionFixtureReadiness()).toEqual({
      positiveOpportunity: "jd_relevant_independent_clause_order",
      registeredSources: 2,
      knownSupportedChanges: 2,
      qualitativeChangedBullets: 2,
      rewriteChangedBullets: 2,
      validatedBuildModes: 3,
    });
  });
});

describe("finite live provider admission (offline)", () => {
  it("retains only approved metadata enums and no canary payload, header or key text", async () => {
    const canaries = [
      "CANARY_REQUEST_PROMPT",
      "CANARY_AUTH_KEY",
      "CANARY_RESPONSE_TEXT",
      "CANARY_RESPONSE_MODEL",
    ];
    let current: ProbeCase = {
      name: "qualitative",
      cap: 1024,
      controller: new AbortController(),
      fetchDispatches: 0,
      statuses: [],
      usage: null,
      responseModel: null,
    };
    let raw = JSON.stringify({
      model: canaries[3],
      error: {
        code: "unsupported_parameter",
        type: "invalid_request_error",
        param: "reasoning_effort",
        message: canaries[2],
      },
      choices: [{ message: { content: canaries[2] } }],
    });
    const observer = createLiveFetchObserver({
      model: "synthetic-model",
      current: () => current,
      fetch: async () => new Response(raw, { status: 400 }),
    });
    const request = {
      method: "POST",
      redirect: "error" as const,
      headers: { Authorization: `Bearer ${canaries[1]}` },
      body: JSON.stringify({
        model: "synthetic-model",
        max_completion_tokens: 1024,
        messages: [{ role: "user", content: canaries[0] }],
      }),
    };
    const response = await observer.fetch(
      "https://api.openai.com/v1/chat/completions",
      request,
    );
    expect(await response.text()).toBe(raw);
    expect(safeObservationMetadata(current).providerError).toEqual({
      code: "unsupported_parameter",
      type: "invalid_request_error",
      param: "reasoning_effort",
    });
    const receipt = JSON.stringify({
      ...observer.metadata(),
      observation: safeObservationMetadata(current),
    });
    for (const canary of canaries) expect(receipt).not.toContain(canary);
    current = {
      name: "rewrite",
      cap: 1024,
      controller: new AbortController(),
      fetchDispatches: 0,
      statuses: [],
      usage: null,
      responseModel: null,
    };
    raw = JSON.stringify({
      error: {
        code: canaries[2],
        type: canaries[2],
        param: canaries[2],
        message: canaries[2],
      },
    });
    await observer.fetch("https://api.openai.com/v1/chat/completions", request);
    expect(safeObservationMetadata(current).providerError).toEqual({
      code: null,
      type: null,
      param: null,
    });
    expect(JSON.stringify(safeObservationMetadata(current))).not.toContain(
      canaries[2],
    );
  });
  it("stops shared API failures while allowing independent 2xx local outcomes", () => {
    for (const status of [400, 401, 403, 404, 429, 500]) {
      expect(stopAfterCase([status], "output_invalid")).toBe(true);
    }
    expect(stopAfterCase([], "provider_unavailable")).toBe(true);
    expect(stopAfterCase([200], "output_invalid")).toBe(false);
    expect(stopAfterCase([200], "honest_advice")).toBe(false);
  });
  it("admits only explicit provider configuration and clamps the test allocation", () => {
    expect(() =>
      parseLiveProviderEnvironment({
        ...environment,
        __CF_USER_TEXT_ENCODING: "synthetic-macos-runtime-marker",
        LC_CTYPE: "UTF-8",
      }),
    ).not.toThrow();
    expect(parseLiveProviderEnvironment(environment)).toMatchObject({
      model: "synthetic-model",
      timeoutMs: 20000,
      outputTokens: 1024,
    });
    expect(
      parseLiveProviderEnvironment({
        ...environment,
        OPENAI_MAX_OUTPUT_TOKENS: "256",
      }).outputTokens,
    ).toBe(256);
  });

  it.each([
    { HTTPS_PROXY: "https://example.invalid" },
    { OPENAI_ORG_ID: "synthetic" },
    { OPENAI_PROJECT_ID: "synthetic" },
    { OPENAI_LOG: "debug" },
    { NODE_OPTIONS: "--inspect" },
    { OPENAI_BASE_URL: "https://api.openai.com:8443/v1" },
    { OPENAI_MODEL: "" },
    { RESUMIDE_PRIVATE_VERIFY: "" },
  ])("refuses ambient overrides without returning their values", (patch) => {
    expect(() =>
      parseLiveProviderEnvironment({ ...environment, ...patch }),
    ).toThrow("environment_rejected");
  });

  it("preserves the actual SDK body, redirect mode and abort signal while counting one dispatch", async () => {
    const controller = new AbortController();
    const sdkController = new AbortController();
    const current: ProbeCase = {
      name: "qualitative",
      cap: 1024,
      controller,
      fetchDispatches: 0,
      statuses: [],
      usage: null,
      responseModel: null,
    };
    let observed: RequestInit | undefined;
    const body = JSON.stringify({
      model: "synthetic-model",
      max_completion_tokens: 1024,
      messages: [{ role: "user", content: "neutral synthetic test" }],
    });
    const observer = createLiveFetchObserver({
      model: "synthetic-model",
      current: () => current,
      fetch: async (_input, init) => {
        observed = init;
        return new Response(
          JSON.stringify({
            model: "synthetic-model",
            usage: { prompt_tokens: 12, completion_tokens: 7 },
          }),
          { status: 200 },
        );
      },
    });
    await observer.fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      redirect: "error",
      body,
      signal: sdkController.signal,
    });
    expect(observed?.body).toBe(body);
    expect(observed?.redirect).toBe("error");
    sdkController.abort();
    expect(observed?.signal?.aborted).toBe(true);
    expect(observer.metadata()).toEqual({
      fetchDispatches: 1,
      requestedOutputTokens: 1024,
    });
    expect(current.usage).toEqual({ inputTokens: 12, outputTokens: 7 });
    await expect(
      observer.fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        redirect: "error",
        body,
      }),
    ).rejects.toThrow("allocation_rejected");
    expect(current.fetchDispatches).toBe(1);
  });

  it.each([
    ["https://api.openai.com:8443/v1/chat/completions", "POST", "error", 1024],
    ["https://example.invalid/v1/chat/completions", "POST", "error", 1024],
    ["https://api.openai.com/v1/models", "POST", "error", 1024],
    ["https://api.openai.com/v1/chat/completions", "GET", "error", 1024],
    ["https://api.openai.com/v1/chat/completions", "POST", "follow", 1024],
    ["https://api.openai.com/v1/chat/completions", "POST", "error", 1025],
  ])(
    "rejects nonallocated dispatch before calling fetch",
    async (url, method, redirect, cap) => {
      let calls = 0;
      const current: ProbeCase = {
        name: "qualitative",
        cap: 1024,
        controller: new AbortController(),
        fetchDispatches: 0,
        statuses: [],
        usage: null,
        responseModel: null,
      };
      const observer = createLiveFetchObserver({
        model: "synthetic-model",
        current: () => current,
        fetch: async () => {
          calls++;
          return new Response("{}");
        },
      });
      await expect(
        observer.fetch(String(url), {
          method: String(method),
          redirect: redirect as RequestRedirect,
          body: JSON.stringify({
            model: "synthetic-model",
            max_completion_tokens: cap,
          }),
        }),
      ).rejects.toThrow("allocation_rejected");
      expect(calls).toBe(0);
    },
  );

  it("enforces all five dispatched-request ceilings and preserves unknown usage", async () => {
    let active: ProbeCase | null = null;
    let calls = 0;
    const observer = createLiveFetchObserver({
      model: "synthetic-model",
      current: () => active,
      fetch: async () => {
        calls++;
        return new Response("{}");
      },
    });
    for (const name of [
      "qualitative",
      "rewrite",
      "build_fix",
      "build_rewrite",
      "build_resume",
    ] as const) {
      const cap = name.startsWith("build_") ? 768 : 1024;
      active = {
        name,
        cap,
        controller: new AbortController(),
        fetchDispatches: 0,
        statuses: [],
        usage: null,
        responseModel: null,
      };
      await observer.fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        redirect: "error",
        body: JSON.stringify({
          model: "synthetic-model",
          max_completion_tokens: cap,
        }),
      });
      expect(active.usage).toBeNull();
    }
    expect(observer.metadata()).toEqual({
      fetchDispatches: 5,
      requestedOutputTokens: 4352,
    });
    active = {
      name: "qualitative",
      cap: 256,
      controller: new AbortController(),
      fetchDispatches: 0,
      statuses: [],
      usage: null,
      responseModel: null,
    };
    await expect(
      observer.fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        redirect: "error",
        body: JSON.stringify({
          model: "synthetic-model",
          max_completion_tokens: 256,
        }),
      }),
    ).rejects.toThrow("allocation_rejected");
    expect(calls).toBe(5);
  });
});

describe("independent usefulness/fact assessment (offline)", () => {
  it("accepts only a supported, useful, changed source-bound rewrite", () => {
    expect(assessLiteralSupport(original, safeRewrite)).toBe(true);
    expect(
      assessWriterProbe(
        {
          summary: null,
          bullets: [
            {
              original: `- ${original}`,
              rewrite: safeRewrite,
              reasoning: "Clarifies the contribution.",
            },
          ],
        },
        [`- ${original}`],
        supported,
      ),
    ).toMatchObject({
      classification: "passed",
      changedBullets: 1,
      irSupported: true,
    });
  });

  it.each([
    "Led Python services with PostgreSQL for Harbor Tools and reduced latency by 20%.",
    "Built Python services with PostgreSQL for Beacon Catalog and reduced latency by 20%.",
    "Built Python services with PostgreSQL for Harbor Tools and reduced latency by 40%.",
    "Built Python services with PostgreSQL for Harbor Tools and reduced latency by -20%.",
    "Built Python services with PostgreSQL for Harbor Tools and increased latency by 20%.",
  ])(
    "refuses agency/project/metric/direction changes even if an injected IR accepts them",
    (rewrite) => {
      expect(assessLiteralSupport(original, rewrite)).toBe(false);
      expect(
        assessWriterProbe(
          {
            summary: null,
            bullets: [
              {
                original: `- ${original}`,
                rewrite,
                reasoning: "Clarifies the contribution.",
              },
            ],
          },
          [`- ${original}`],
          supported,
        ).classification,
      ).toBe("unsafe_output");
    },
  );

  it("does not count an empty/identical writer or failed IR as useful success", () => {
    expect(
      assessWriterProbe({ summary: null, bullets: [] }, [original], supported)
        .classification,
    ).toBe("no_useful_change");
    expect(
      assessWriterProbe(
        {
          summary: null,
          bullets: [{ original, rewrite: original, reasoning: "Clarifies." }],
        },
        [original],
        supported,
      ).classification,
    ).toBe("no_useful_change");
    expect(
      assessWriterProbe(
        {
          summary: null,
          bullets: [
            { original, rewrite: safeRewrite, reasoning: "Clarifies." },
          ],
        },
        [original],
        () => ({ state: "rejected" }),
      ).classification,
    ).toBe("unsafe_output");
    expect(
      assessWriterProbe(
        {
          summary: null,
          bullets: [
            {
              original,
              rewrite: original.replace(" and ", "; "),
              reasoning: "Clarifies.",
            },
          ],
        },
        [original],
        supported,
      ).classification,
    ).toBe("no_useful_change");
  });

  it("requires the exact known syntax repair, rather than schema success or no_change", () => {
    const suggestion = {
      operation: "replace",
      replacement: "\\textbf{Signal Dashboard}",
      explanation: "Closes the brace.",
      questions: [],
    };
    expect(
      assessBuildProbe(
        "fix",
        "\\textbf{Signal Dashboard",
        suggestion,
        supported,
      ).classification,
    ).toBe("passed");
    expect(
      assessBuildProbe(
        "fix",
        "\\textbf{Signal Dashboard",
        { ...suggestion, replacement: "\\textbf{Queue Worker}" },
        supported,
      ).classification,
    ).toBe("unsafe_output");
  });

  it("independently rejects unsafe Build content and keeps honest advice out of positives", () => {
    const suggestion = {
      operation: "replace",
      replacement: `\\item ${safeRewrite.replace("20%", "40\\%")}`,
      explanation: "Clarifies.",
      questions: [],
    };
    expect(
      assessBuildProbe(
        "resume",
        `\\item ${original.replace("20%", "20\\%")}`,
        suggestion,
        supported,
      ).classification,
    ).toBe("unsafe_output");
    expect(
      assessBuildProbe(
        "rewrite",
        original,
        {
          operation: "advice",
          replacement: null,
          explanation: "Provide more evidence.",
          questions: [],
        },
        supported,
      ).classification,
    ).toBe("honest_advice");
    expect(
      assessBuildProbe(
        "rewrite",
        original,
        {
          operation: "replace",
          replacement: safeRewrite,
          explanation: "Clarifies.",
          questions: [],
        },
        () => ({ state: "clarification_required" }),
      ).classification,
    ).toBe("unsafe_output");
    expect(
      assessBuildProbe(
        "rewrite",
        original,
        {
          operation: "replace",
          replacement: safeRewrite,
          explanation: "This increases your ATS score to 90.",
          questions: [],
        },
        supported,
      ).classification,
    ).toBe("unsafe_output");
  });
});
