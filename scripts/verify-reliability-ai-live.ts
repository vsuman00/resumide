import { createHash } from "node:crypto";
import { readFile, lstat, open, realpath, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const POLICY = "reliability-ai-live/1";
const OBSERVATION_POLICY = "BOUNDED_METADATA_OBSERVATION";
const CASE_NAMES = [
  "qualitative",
  "rewrite",
  "build_fix",
  "build_rewrite",
  "build_resume",
] as const;
type CaseName =
  "qualitative" | "rewrite" | "build_fix" | "build_rewrite" | "build_resume";
export function resolveAllocatedCases(
  selection: unknown,
  maxRequests: unknown,
  maxRequestedOutputTokens: unknown,
) {
  const input = selection === undefined ? CASE_NAMES : selection;
  if (!Array.isArray(input) || input.length < 1 || input.length > 5)
    fail("allocation_rejected");
  const cases: CaseName[] = [];
  for (const item of input) {
    const name = CASE_NAMES.find((candidate) => candidate === item);
    if (!name || cases.includes(name)) fail("allocation_rejected");
    cases.push(name);
  }
  const tokens = cases.reduce(
    (sum, name) => sum + (name.startsWith("build_") ? 768 : 1024),
    0,
  );
  if (
    maxRequests !== cases.length ||
    maxRequestedOutputTokens !== tokens ||
    tokens > 4352
  )
    fail("allocation_rejected");
  return { cases, maxRequests: cases.length, maxRequestedOutputTokens: tokens };
}
type Classification =
  | "passed"
  | "unsafe_output"
  | "no_useful_change"
  | "honest_advice"
  | "output_invalid"
  | "authentication_blocked"
  | "rate_limited"
  | "model_unavailable"
  | "provider_unavailable"
  | "timeout"
  | "allocation_rejected";
type Usage = { inputTokens: number; outputTokens: number };
type Assessment = {
  classification: Classification;
  changedBullets: number;
  irSupported: boolean;
  changedSelection?: boolean;
};
type IrCheck = (request: {
  kind: "rewrite" | "editorial" | "summary";
  original?: string;
  proposed: string;
}) => { state: string };
export type ProbeCase = {
  name: CaseName;
  cap: number;
  controller: AbortController;
  fetchDispatches: number;
  statuses: number[];
  usage: Usage | null;
  responseModel: string | null;
  providerError?: {
    code: string | null;
    type: string | null;
    param: string | null;
  } | null;
  deadlineExceeded?: boolean;
  expectedIdempotencyKey?: string;
};
class ProbeFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function fail(code: string): never {
  throw new ProbeFailure(code);
}
const sha = (bytes: string | Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
const modelName = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(value);

const ENVIRONMENT_KEYS = new Set([
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "__CF_USER_TEXT_ENCODING",
  "NODE_ENV",
  "NO_COLOR",
  "FORCE_COLOR",
  "TERM",
  "RESUMIDE_PRIVATE_VERIFY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "OPENAI_TIMEOUT_MS",
  "OPENAI_MAX_OUTPUT_TOKENS",
]);
export function parseLiveProviderEnvironment(
  env: Record<string, string | undefined>,
) {
  if (
    Object.keys(env).some(
      (key) => env[key] !== undefined && !ENVIRONMENT_KEYS.has(key),
    ) ||
    env.RESUMIDE_PRIVATE_VERIFY !== "aa7-owned-synthetic"
  )
    fail("environment_rejected");
  const key = env.OPENAI_API_KEY;
  if (!key || key.trim() !== key || !modelName(env.OPENAI_MODEL))
    fail("environment_rejected");
  let base: URL;
  try {
    base = new URL(env.OPENAI_BASE_URL ?? "");
  } catch {
    return fail("environment_rejected");
  }
  if (
    base.origin !== "https://api.openai.com" ||
    base.pathname.replace(/\/$/, "") !== "/v1" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    fail("environment_rejected");
  const timeoutMs = Number(env.OPENAI_TIMEOUT_MS),
    outputTokens = Number(env.OPENAI_MAX_OUTPUT_TOKENS);
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1000 ||
    timeoutMs > 120000 ||
    !Number.isSafeInteger(outputTokens) ||
    outputTokens < 256 ||
    outputTokens > 8000
  )
    fail("environment_rejected");
  return {
    apiKey: key,
    baseUrl: base.href.replace(/\/$/, ""),
    model: env.OPENAI_MODEL,
    timeoutMs: Math.min(timeoutMs, 30000),
    outputTokens: Math.min(outputTokens, 1024),
  };
}

function usageFrom(raw: unknown): Usage | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (
    !Number.isSafeInteger(record.prompt_tokens) ||
    Number(record.prompt_tokens) < 0 ||
    !Number.isSafeInteger(record.completion_tokens) ||
    Number(record.completion_tokens) < 0
  )
    return null;
  return {
    inputTokens: Number(record.prompt_tokens),
    outputTokens: Number(record.completion_tokens),
  };
}
function safeProviderError(raw: unknown) {
  const error =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const admit = (value: unknown, allowed: string[]) =>
    typeof value === "string" && allowed.includes(value) ? value : null;
  return {
    code: admit(error.code, [
      "invalid_api_key",
      "insufficient_quota",
      "rate_limit_exceeded",
      "model_not_found",
      "unsupported_parameter",
    ]),
    type: admit(error.type, [
      "invalid_request_error",
      "authentication_error",
      "rate_limit_error",
      "insufficient_quota",
      "server_error",
      "permission_error",
    ]),
    param: admit(error.param, [
      "reasoning_effort",
      "max_completion_tokens",
      "response_format",
      "messages",
      "model",
    ]),
  };
}
export function safeObservationMetadata(active: ProbeCase) {
  return {
    fetchDispatches: active.fetchDispatches,
    requestedOutputTokens: active.fetchDispatches ? active.cap : 0,
    httpStatuses: active.statuses,
    usage: active.usage,
    responseModel: active.responseModel,
    providerError: active.providerError ?? null,
  };
}
async function observeResponse(
  response: Response,
  active: ProbeCase,
  expectedModel: string,
) {
  active.statuses.push(response.status);
  const reader = response.clone().body?.getReader();
  if (!reader) return;
  const pieces: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 131072) {
        void reader.cancel().catch(() => undefined);
        return;
      }
      pieces.push(part.value);
    }
    const value = JSON.parse(Buffer.concat(pieces).toString("utf8")) as Record<
      string,
      unknown
    >;
    active.usage = usageFrom(value.usage);
    active.responseModel =
      typeof value.model === "string" &&
      (value.model === expectedModel ||
        (value.model.startsWith(`${expectedModel}-`) &&
          /^\d{4}-\d{2}-\d{2}$/.test(
            value.model.slice(expectedModel.length + 1),
          )))
        ? value.model
        : null;
    active.providerError = response.ok ? null : safeProviderError(value.error);
  } catch {
    active.usage = null;
  }
}
export function createLiveFetchObserver(options: {
  model: string;
  current: () => ProbeCase | null;
  fetch: typeof fetch;
  caseAllocation?: ReturnType<typeof resolveAllocatedCases>;
}) {
  const budget = options.caseAllocation
    ? resolveAllocatedCases(
        options.caseAllocation.cases,
        options.caseAllocation.maxRequests,
        options.caseAllocation.maxRequestedOutputTokens,
      )
    : resolveAllocatedCases(undefined, 5, 4352);
  let fetchDispatches = 0,
    requestedOutputTokens = 0;
  return {
    metadata: () => ({ fetchDispatches, requestedOutputTokens }),
    fetch: (async (input, init) => {
      const active = options.current();
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (
        !active ||
        !Number.isSafeInteger(active.cap) ||
        active.cap < 1 ||
        (active.name.startsWith("build_")
          ? active.cap !== 768
          : active.cap > 1024) ||
        active.controller.signal.aborted ||
        active.fetchDispatches ||
        !budget.cases.includes(active.name) ||
        fetchDispatches >= budget.maxRequests ||
        url.href !== "https://api.openai.com/v1/chat/completions" ||
        (init?.method ?? (input instanceof Request ? input.method : "GET")) !==
          "POST" ||
        init?.redirect !== "error" ||
        typeof init.body !== "string" ||
        Buffer.byteLength(init.body) > 65536
      )
        fail("allocation_rejected");
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        return fail("allocation_rejected");
      }
      if (
        body.model !== options.model ||
        body.max_completion_tokens !== active.cap ||
        body.stream === true ||
        (body.n !== undefined && body.n !== 1) ||
        requestedOutputTokens + active.cap > budget.maxRequestedOutputTokens
      )
        fail("allocation_rejected");
      const headers = new Headers(
        init.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      if (
        active.expectedIdempotencyKey &&
        headers.get("Idempotency-Key") !== active.expectedIdempotencyKey
      )
        fail("allocation_rejected");
      if (
        headers.has("x-stainless-retry-count") &&
        headers.get("x-stainless-retry-count") !== "0"
      )
        fail("allocation_rejected");
      active.fetchDispatches++;
      fetchDispatches++;
      requestedOutputTokens += active.cap;
      const signals = [
        active.controller.signal,
        init.signal,
        input instanceof Request ? input.signal : null,
      ].filter((signal): signal is AbortSignal => Boolean(signal));
      const response = await options.fetch(input, {
        ...init,
        signal: AbortSignal.any(signals),
      });
      await observeResponse(response, active, options.model);
      return response;
    }) as typeof fetch,
  };
}

function plain(value: string) {
  return value
    .replace(/^\s*[-•]\s*/, "")
    .replace(/\\item\s*/g, "")
    .replace(/\\(?:textbf|textit|emph)\{([^{}]*)\}/g, "$1")
    .replace(/\\%/g, "%")
    .trim();
}
function words(value: string) {
  const synonyms: Record<string, string> = {
    developed: "built",
    created: "built",
    helped: "supported",
  };
  return (
    plain(value)
      .normalize("NFC")
      .toLowerCase()
      .replace(/(?<=\p{L})\.$/u, "")
      .match(/\.?[\p{L}\p{N}]+(?:[.%][\p{N}]*)?/gu)
      ?.filter((word) => !["a", "an", "the", "and"].includes(word))
      .map((word) => synonyms[word] ?? word)
      .sort() ?? []
  );
}
function materiallyChanged(original: string, proposed: string) {
  const wording = (value: string) =>
    plain(value)
      .toLowerCase()
      .match(/[\p{L}\p{N}%]+/gu)
      ?.filter((word) => !["a", "an", "the", "and"].includes(word)) ?? [];
  return (
    JSON.stringify(wording(original)) !== JSON.stringify(wording(proposed))
  );
}
export function summarizeWritingStages(
  proposalCount: number | null,
  retained: Parameters<typeof assessWriterProbe>[0] | null,
) {
  const bullets = retained?.bullets;
  const textChanged =
    bullets?.filter(
      (bullet) => plain(bullet.original) !== plain(bullet.rewrite),
    ).length ?? null;
  return {
    proposalCount,
    retainedCount: bullets?.length ?? null,
    filteredAfterProposalBoundary:
      proposalCount !== null && bullets ? proposalCount - bullets.length : null,
    retainedUnchangedCount:
      bullets && textChanged !== null ? bullets.length - textChanged : null,
    retainedTextChangedCount: textChanged,
    retainedMateriallyChangedCount:
      bullets?.filter((bullet) =>
        materiallyChanged(bullet.original, bullet.rewrite),
      ).length ?? null,
  };
}
export function assessLiteralSupport(original: string, proposed: string) {
  if (
    !proposed.trim() ||
    /[\\{}]|\b(?:score|rating|probability|guarantee|hiring|hire)\b/i.test(
      plain(proposed),
    )
  )
    return false;
  const metrics = (text: string) =>
    plain(text)
      .match(/[+−-]?\d+(?:[.,]\d+)*(?:%)?/g)
      ?.sort() ?? [];
  return (
    JSON.stringify(metrics(original)) === JSON.stringify(metrics(proposed)) &&
    JSON.stringify(words(original)) === JSON.stringify(words(proposed))
  );
}
const hasScoreClaim = (value: unknown) =>
  /\b(?:scores?|ratings?|probabilit(?:y|ies)|guarantee(?:d|s)?|hiring)\b/i.test(
    JSON.stringify(value),
  );
export function assessWriterProbe(
  writer: {
    summary: string | null;
    bullets: Array<{ original: string; rewrite: string; reasoning: string }>;
  },
  originals: string[],
  ir: IrCheck,
): Assessment {
  let changedBullets = 0;
  const irSupported =
    !hasScoreClaim(writer) &&
    (writer.summary === null ||
      (originals.some((original) =>
        assessLiteralSupport(original, writer.summary!),
      ) &&
        ir({ kind: "summary", proposed: writer.summary }).state ===
          "supported")) &&
    writer.bullets.every((bullet) => {
      const supported =
        originals.includes(bullet.original) &&
        assessLiteralSupport(bullet.original, bullet.rewrite) &&
        ir({
          kind: "rewrite",
          original: bullet.original,
          proposed: bullet.rewrite,
        }).state === "supported" &&
        ir({
          kind: "editorial",
          original: bullet.original,
          proposed: bullet.reasoning,
        }).state === "supported";
      if (supported && materiallyChanged(bullet.original, bullet.rewrite))
        changedBullets++;
      return supported;
    });
  return {
    classification: !irSupported
      ? "unsafe_output"
      : changedBullets
        ? "passed"
        : "no_useful_change",
    changedBullets,
    irSupported,
  };
}
export function assessBuildProbe(
  mode: "fix" | "rewrite" | "resume",
  original: string,
  suggestion: {
    operation: string;
    replacement: string | null;
    explanation: string;
    questions: string[];
  },
  ir: IrCheck,
): Assessment {
  if (hasScoreClaim(suggestion))
    return {
      classification: "unsafe_output",
      changedBullets: 0,
      irSupported: false,
    };
  if (suggestion.operation !== "replace")
    return {
      classification:
        suggestion.operation === "advice"
          ? "honest_advice"
          : "no_useful_change",
      changedBullets: 0,
      irSupported: false,
    };
  const replacement = suggestion.replacement;
  if (
    replacement === null ||
    suggestion.questions.length ||
    /\b(?:score|rating|probability|guarantee|hiring)\b/i.test(
      replacement + suggestion.explanation,
    )
  )
    return {
      classification: "unsafe_output",
      changedBullets: 0,
      irSupported: false,
    };
  if (mode === "fix") {
    const repaired =
      original === "\\textbf{Signal Dashboard" &&
      replacement.trim() === "\\textbf{Signal Dashboard}";
    return {
      classification: repaired ? "passed" : "unsafe_output",
      changedBullets: 0,
      changedSelection: repaired,
      irSupported: false,
    };
  }
  const before = plain(original),
    after = plain(replacement);
  const irSupported =
    assessLiteralSupport(before, after) &&
    ir({ kind: "rewrite", original: before, proposed: after }).state ===
      "supported";
  const changed = materiallyChanged(before, after);
  return {
    classification: !irSupported
      ? "unsafe_output"
      : changed
        ? "passed"
        : "no_useful_change",
    changedBullets: 0,
    changedSelection: irSupported && changed,
    irSupported,
  };
}

const CONTRIBUTIONS = [
  "- Built a TypeScript dashboard; Maintained a Python API.",
  "- Built a TypeScript API.",
];
const RESUME = [
  "Casey Morgan",
  "casey.morgan@example.test",
  "https://example.org/casey",
  "Projects",
  "Signal Dashboard",
  CONTRIBUTIONS[0],
  "",
  "Queue Worker",
  CONTRIBUTIONS[1],
].join("\n");
const JOB = {
  jobTitle: "Python Backend Engineer",
  jobDescription:
    "Prioritize Python API maintenance before TypeScript dashboard work, using only existing contributions.",
};
function buildFixture(
  mode: "fix" | "rewrite" | "resume",
  policyVersion: unknown,
) {
  if (policyVersion !== "build-ai-selected-context-v2")
    fail("allocation_rejected");
  const source = [
    "\\documentclass{article}",
    "\\begin{document}",
    "Casey Morgan",
    "casey.morgan@example.test",
    "https://example.org/casey",
    "\\section*{Projects}",
    mode === "fix" ? "\\textbf{Signal Dashboard" : "\\textbf{Signal Dashboard}",
    "\\begin{itemize}",
    `\\item ${CONTRIBUTIONS[0].slice(2).replace(/%/g, "\\%")}`,
    "\\end{itemize}",
    "\\textbf{Queue Worker}",
    "\\begin{itemize}",
    `\\item ${CONTRIBUTIONS[1].slice(2)}`,
    "\\end{itemize}",
    "\\end{document}",
  ].join("\n");
  const line = mode === "fix" ? 7 : 9;
  return {
    source,
    sourceHash: sha(source),
    startLine: line,
    endLine: line,
    mode,
    consent: true as const,
    policyVersion,
  };
}

/** Local production-path control only: no key, SDK construction or HTTP. */
export async function assertProductionFixtureReadiness(
  root = dirname(dirname(fileURLToPath(import.meta.url))),
) {
  const load = (path: string) =>
    import(pathToFileURL(resolve(root, path)).href);
  const [
    ir,
    sourceBuilder,
    proposals,
    grounding,
    qualitative,
    rewrite,
    build,
    shared,
  ] = await Promise.all([
    load("app/lib/server/writing-support.ts"),
    load("app/lib/server/rewrite-sources.ts"),
    load("app/lib/server/writer-proposals.ts"),
    load("app/lib/server/writer-grounding.ts"),
    load("app/lib/server/qualitative-ai.ts"),
    load("app/lib/server/rewrite-ai.ts"),
    load("app/lib/server/build-assist.ts"),
    load("app/lib/build-assist.ts"),
  ]);
  const sources = sourceBuilder.buildRewriteSources(RESUME) as Array<{
    id: number;
    text: string;
  }>;
  if (
    sources.length !== 2 ||
    CONTRIBUTIONS.some(
      (text, id) => sources[id]?.id !== id || sources[id]?.text !== text,
    )
  )
    fail("fixture_not_ready");
  const knownRewrites = [
    "Maintained a Python API; Built a TypeScript dashboard.",
    "Developed a TypeScript API.",
  ];
  if (
    !CONTRIBUTIONS[0].startsWith("- Built a TypeScript dashboard;") ||
    !knownRewrites[0].startsWith("Maintained a Python API;")
  )
    fail("fixture_not_ready");
  const proposal = {
    summary: null,
    bullets: sources.map((source, id) => ({
      sourceId: source.id,
      rewrite: knownRewrites[id],
      reasoning: "Clarifies wording.",
    })),
  };
  const document = ir.buildWritingSupportDocument(RESUME);
  const assess: IrCheck = (request) =>
    ir.assessWritingSupport(document, request);
  const resolved = proposals.resolveWriterProposals(proposal, sources);
  const grounded = grounding.groundWriterSuggestions(resolved, RESUME);
  if (assessWriterProbe(grounded, CONTRIBUTIONS, assess).changedBullets !== 2)
    fail("fixture_not_ready");
  const category = {
    tips: [
      {
        type: "improve",
        tip: "Clarify wording.",
        explanation: "Use the existing contribution.",
        quote: CONTRIBUTIONS[0],
      },
    ],
  };
  const qualitativeControl = await qualitative.runQualitativeAi(
    {
      enabled: true,
      remainingTokenBudget: 1024,
      model: "offline-fixture-control",
      maxOutputTokens: 1024,
      timeoutMs: 1000,
      idempotencyKey: "offline-fixture-control",
      resumeText: RESUME,
      ...JOB,
    },
    {
      execute: async () => ({
        output: {
          toneAndStyle: category,
          content: category,
          structure: category,
          skills: category,
          writer: resolved,
        },
        usage: { inputTokens: 0, outputTokens: 0 },
      }),
    },
  );
  const rewriteControl = await rewrite.generateGroundedRewrite(
    { resumeText: RESUME, ...JOB, idempotencyKey: "offline-fixture-control" },
    {
      execute: async () => ({
        output: proposal,
        usage: { inputTokens: 0, outputTokens: 0 },
      }),
    },
    1000,
  );
  if (
    assessWriterProbe(qualitativeControl.prose.writer, CONTRIBUTIONS, assess)
      .changedBullets !== 2 ||
    assessWriterProbe(rewriteControl.writer, CONTRIBUTIONS, assess)
      .changedBullets !== 2
  )
    fail("fixture_not_ready");
  for (const mode of ["fix", "rewrite", "resume"] as const) {
    const prepared = build.validateBuildAssistRequest(
      buildFixture(mode, shared.BUILD_AI_POLICY_VERSION),
    );
    const replacement =
      mode === "fix"
        ? "\\textbf{Signal Dashboard}"
        : `\\item ${knownRewrites[0]}`;
    const response = build.validateBuildSuggestion(prepared, {
      operation: "replace",
      replacement,
      explanation: mode === "fix" ? "Closes the brace." : "Clarifies wording.",
      questions: [],
    });
    if (
      assessBuildProbe(mode, prepared.originalText, response.suggestion, assess)
        .classification !== "passed"
    )
      fail("fixture_not_ready");
    if (mode === "resume") {
      let refused = false;
      try {
        await shared.applyBuildSuggestion(prepared.source, response, false);
      } catch (error) {
        refused =
          !!error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "fact_confirmation_required";
      }
      if (!response.requiresFactConfirmation || !refused)
        fail("fixture_not_ready");
    }
    const applied = await shared.applyBuildSuggestion(
      prepared.source,
      response,
      mode === "resume",
    );
    if (
      applied !==
      prepared.source.slice(0, prepared.startOffset) +
        replacement +
        prepared.source.slice(prepared.endOffset)
    )
      fail("fixture_not_ready");
  }
  return {
    positiveOpportunity: "jd_relevant_independent_clause_order" as const,
    registeredSources: 2,
    knownSupportedChanges: 2,
    qualitativeChangedBullets: 2,
    rewriteChangedBullets: 2,
    validatedBuildModes: 3,
  };
}

export const REQUIRED_SOURCES = [
  "scripts/verify-reliability-ai-live.ts",
  "tests/unit/reliability-ai-live.test.ts",
  "app/lib/server/qualitative-ai.ts",
  "app/lib/server/provider-attempt.ts",
  "app/lib/server/qualitative-prose.ts",
  "app/lib/server/rewrite-ai.ts",
  "app/lib/server/rewrite-sources.ts",
  "app/lib/server/writer-proposals.ts",
  "app/lib/server/writer-grounding.ts",
  "app/lib/server/writing-support.ts",
  "app/lib/server/build-assist.ts",
  "app/lib/server/build-assist-support.ts",
  "app/lib/build-assist.ts",
  "app/lib/server/latex-source.ts",
  "app/lib/server/openai-model.ts",
  "app/lib/server/egress-policy.ts",
  "app/lib/server/schema.ts",
  "package.json",
  "package-lock.json",
  "vitest.config.ts",
];
type Allocation = {
  schema: string;
  status: string;
  runId: string;
  model: string;
  maxRequests: number;
  maxRequestedOutputTokens: number;
  cases?: unknown;
  sourceHashes: Record<string, string>;
};
async function checkSources(root: string, hashes: Record<string, string>) {
  if (
    !hashes ||
    typeof hashes !== "object" ||
    REQUIRED_SOURCES.some((path) => !Object.hasOwn(hashes, path))
  )
    fail("allocation_rejected");
  for (const [path, expected] of Object.entries(hashes)) {
    if (
      !/^(?:(?:app|scripts|tests)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|json)|package(?:-lock)?\.json|vitest\.config\.ts)$/.test(
        path,
      ) ||
      path.split("/").includes("..") ||
      !/^[a-f0-9]{64}$/.test(expected)
    )
      fail("allocation_rejected");
    const absolute = resolve(root, path),
      info = await lstat(absolute);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      (await realpath(absolute)) !== absolute ||
      sha(await readFile(absolute)) !== expected
    )
      fail("allocation_rejected");
  }
}
async function privateFile(path: string, bytes: string) {
  const handle = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
}
function failureClassification(
  active: ProbeCase,
  error: unknown,
): Classification {
  if (active.statuses.includes(401) || active.statuses.includes(403))
    return "authentication_blocked";
  if (active.statuses.includes(429)) return "rate_limited";
  if (active.statuses.includes(404)) return "model_unavailable";
  if (active.deadlineExceeded) return "timeout";
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  if (code === "allocation_rejected") return "allocation_rejected";
  if (code === "AI_TIMEOUT" || code === "timeout") return "timeout";
  return ["AI_OUTPUT_INVALID", "AI_REFUSED", "output_invalid"].includes(
    String(code),
  )
    ? "output_invalid"
    : "provider_unavailable";
}

export function stopAfterCase(statuses: number[], classification: string) {
  return (
    statuses.some((status) => status < 200 || status >= 300) ||
    [
      "authentication_blocked",
      "rate_limited",
      "model_unavailable",
      "provider_unavailable",
      "timeout",
      "allocation_rejected",
    ].includes(classification)
  );
}

export async function runAllocatedLiveProbe(args: string[]) {
  if (
    args.length !== 7 ||
    args[0] !== "--run-ai-live" ||
    args[1] !== "--allocation" ||
    args[3] !== "--allocation-sha" ||
    args[5] !== "--output-dir" ||
    !/^[a-f0-9]{64}$/.test(args[4])
  )
    fail("allocation_rejected");
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  if (process.cwd() !== root) fail("allocation_rejected");
  const output = args[6],
    directory = await lstat(output);
  if (
    (await realpath(output)) !== output ||
    dirname(output) !== (await realpath("/tmp")) ||
    !/^resumide-ai-live-[a-f0-9-]{36}$/.test(output.split("/").at(-1) ?? "") ||
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    directory.uid !== process.getuid?.() ||
    (directory.mode & 0o777) !== 0o700 ||
    args[2] !== join(output, "allocation.json")
  )
    fail("allocation_rejected");
  if (JSON.stringify(await readdir(output)) !== '["allocation.json"]')
    fail("allocation_rejected");
  const checkOutput = async () => {
    const now = await lstat(output);
    if (
      !now.isDirectory() ||
      now.isSymbolicLink() ||
      now.dev !== directory.dev ||
      now.ino !== directory.ino ||
      now.uid !== directory.uid ||
      (now.mode & 0o777) !== 0o700 ||
      (await realpath(output)) !== output
    )
      fail("allocation_rejected");
  };
  const allocationInfo = await lstat(args[2]);
  if (
    !allocationInfo.isFile() ||
    allocationInfo.isSymbolicLink() ||
    allocationInfo.uid !== directory.uid ||
    (allocationInfo.mode & 0o777) !== 0o600 ||
    allocationInfo.size > 262144
  )
    fail("allocation_rejected");
  const bytes = await readFile(args[2]);
  if (sha(bytes) !== args[4]) fail("allocation_rejected");
  const allocation = JSON.parse(bytes.toString("utf8")) as Allocation;
  const config = parseLiveProviderEnvironment(process.env);
  if (
    allocation.schema !== POLICY ||
    allocation.status !== "ALLOCATED_ONE_AI_FEATURE_RUN" ||
    !/^[a-f0-9-]{36}$/.test(allocation.runId) ||
    allocation.model !== config.model
  )
    fail("allocation_rejected");
  const caseAllocation = resolveAllocatedCases(
    allocation.cases,
    allocation.maxRequests,
    allocation.maxRequestedOutputTokens,
  );
  await checkSources(root, allocation.sourceHashes);
  await checkOutput();
  await privateFile(
    join(output, "attempt.json"),
    JSON.stringify({
      schema: POLICY,
      runId: allocation.runId,
      allocationSha256: args[4],
    }),
  );
  const started = performance.now(),
    deadline = started + 120000;
  const originalFetch = globalThis.fetch;
  let active: ProbeCase | null = null;
  const observer = createLiveFetchObserver({
    model: config.model,
    current: () => active,
    fetch: originalFetch,
    caseAllocation,
  });
  const cases: Array<Record<string, unknown>> = [];
  let sourceStable = true;
  let executionError: string | null = null;
  let fixtureReadiness: Awaited<
    ReturnType<typeof assertProductionFixtureReadiness>
  > | null = null;
  globalThis.fetch = observer.fetch;
  try {
    // Resolve the actual executing checkout only after explicit allocation and
    // environment admission. Offline unit imports never load these modules.
    const load = (path: string) =>
      import(pathToFileURL(resolve(root, path)).href);
    const [qualitative, qualitativeProse, rewrite, build, ir, limits] =
      await Promise.all([
        load("app/lib/server/qualitative-ai.ts"),
        load("app/lib/server/qualitative-prose.ts"),
        load("app/lib/server/rewrite-ai.ts"),
        load("app/lib/server/build-assist.ts"),
        load("app/lib/server/writing-support.ts"),
        load("app/lib/build-assist.ts"),
      ]);
    if (
      limits.BUILD_AI_LIMITS.outputTokens !== 768 ||
      limits.BUILD_AI_LIMITS.timeoutMs > 30000 ||
      limits.BUILD_AI_POLICY_VERSION !== "build-ai-selected-context-v2"
    )
      fail("allocation_rejected");
    fixtureReadiness = await assertProductionFixtureReadiness();
    const document = ir.buildWritingSupportDocument(RESUME);
    const assess: IrCheck = (request) =>
      ir.assessWritingSupport(document, request);
    for (const name of caseAllocation.cases) {
      const remaining = deadline - performance.now();
      if (remaining <= 0) break;
      const cap = name.startsWith("build_") ? 768 : config.outputTokens;
      const current: ProbeCase = {
        name,
        cap,
        controller: new AbortController(),
        fetchDispatches: 0,
        statuses: [],
        usage: null,
        responseModel: null,
        ...(name.startsWith("build_")
          ? {}
          : { expectedIdempotencyKey: `${allocation.runId}:${name}` }),
      };
      active = current;
      const caseStarted = performance.now();
      const timeoutMs = Math.min(config.timeoutMs, remaining);
      let timer: ReturnType<typeof setTimeout> | undefined;
      let assessment: Assessment;
      let groundedCitedTips: number | null = null;
      let responseBindingVerified: boolean | null = null;
      let outsideBytesUnchanged: boolean | null = null;
      let resumeConfirmationRequired: boolean | null = null;
      let proposalCount: number | null = null;
      let proposalBoundary:
        | "qualitative_transport_source_resolved"
        | "rewrite_service_validated_proposals"
        | null = null;
      let retainedWriter: Parameters<typeof assessWriterProbe>[0] | null = null;
      let buildOperation: "none" | "advice" | "replace" | null = null;
      try {
        const work = (async (): Promise<Assessment> => {
          const idempotencyKey = `${allocation.runId}:${name}`;
          if (name === "qualitative") {
            const transport = new qualitative.OpenAIQualitativeTransport(
              config.apiKey,
              timeoutMs,
              config.baseUrl,
            );
            const result = await qualitative.runQualitativeAi(
              {
                enabled: true,
                remainingTokenBudget: cap,
                model: config.model,
                maxOutputTokens: cap,
                timeoutMs,
                idempotencyKey,
                resumeText: RESUME,
                ...JOB,
              },
              {
                execute: async (request: unknown) => {
                  const response = await transport.execute(request);
                  const parsed = qualitativeProse.ProseAnalysisSchema.safeParse(
                    response.output,
                  );
                  if (parsed.success) {
                    proposalCount = parsed.data.writer.bullets.length;
                    proposalBoundary = "qualitative_transport_source_resolved";
                  }
                  return response;
                },
              },
            );
            retainedWriter = result.prose.writer;
            const categories = [
              "toneAndStyle",
              "content",
              "structure",
              "skills",
            ];
            if (
              hasScoreClaim(result.prose) ||
              !categories.every((category) =>
                result.prose[category].tips.every((tip: { quote: string }) =>
                  RESUME.includes(tip.quote),
                ),
              )
            )
              fail("output_invalid");
            groundedCitedTips = categories.reduce(
              (count, category) => count + result.prose[category].tips.length,
              0,
            );
            const assessed = assessWriterProbe(
              result.prose.writer,
              CONTRIBUTIONS,
              assess,
            );
            return assessed.classification === "passed" && !groundedCitedTips
              ? { ...assessed, classification: "no_useful_change" }
              : assessed;
          }
          if (name === "rewrite") {
            const result = await rewrite.generateGroundedRewrite(
              { resumeText: RESUME, ...JOB, idempotencyKey },
              rewrite.createRewriteTransport({
                OPENAI_API_KEY: config.apiKey,
                OPENAI_BASE_URL: config.baseUrl,
                OPENAI_MODEL: config.model,
                OPENAI_TIMEOUT_MS: timeoutMs,
                OPENAI_MAX_OUTPUT_TOKENS: cap,
              }),
              timeoutMs,
            );
            if (
              !Number.isSafeInteger(result.proposedBullets) ||
              result.proposedBullets < 0 ||
              result.proposedBullets > 4
            )
              fail("output_invalid");
            proposalCount = result.proposedBullets;
            proposalBoundary = "rewrite_service_validated_proposals";
            retainedWriter = result.writer;
            return assessWriterProbe(result.writer, CONTRIBUTIONS, assess);
          }
          const mode = name.slice(6) as "fix" | "rewrite" | "resume";
          const prepared = build.validateBuildAssistRequest(
            buildFixture(mode, limits.BUILD_AI_POLICY_VERSION),
          );
          const result = await build.executeBuildAssist(prepared, {
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
            model: config.model,
            signal: current.controller.signal,
          });
          buildOperation =
            result.response.suggestion.operation === "no_change"
              ? "none"
              : result.response.suggestion.operation;
          responseBindingVerified =
            result.response.sourceHash === prepared.sourceHash &&
            result.response.mode === prepared.mode &&
            result.response.startLine === prepared.startLine &&
            result.response.endLine === prepared.endLine &&
            result.response.originalText === prepared.originalText;
          if (!responseBindingVerified) fail("output_invalid");
          const assessed = assessBuildProbe(
            mode,
            prepared.originalText,
            result.response.suggestion,
            assess,
          );
          if (assessed.classification === "passed") {
            if (mode === "resume") {
              resumeConfirmationRequired =
                result.response.requiresFactConfirmation === true;
              try {
                await limits.applyBuildSuggestion(
                  prepared.source,
                  result.response,
                  false,
                );
                resumeConfirmationRequired = false;
              } catch (error) {
                resumeConfirmationRequired =
                  resumeConfirmationRequired &&
                  typeof error === "object" &&
                  error !== null &&
                  "code" in error &&
                  error.code === "fact_confirmation_required";
              }
              if (!resumeConfirmationRequired) fail("output_invalid");
            }
            // Fixture truth is known. This in-memory apply is not a real user's
            // confirmation, stored edit, browser workflow or compiler result.
            const applied = await limits.applyBuildSuggestion(
              prepared.source,
              result.response,
              mode === "resume",
            );
            const expected =
              prepared.source.slice(0, prepared.startOffset) +
              result.response.suggestion.replacement +
              prepared.source.slice(prepared.endOffset);
            outsideBytesUnchanged = Buffer.from(applied).equals(
              Buffer.from(expected),
            );
            if (!outsideBytesUnchanged) fail("output_invalid");
          }
          return assessed;
        })();
        assessment = await Promise.race([
          work,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              current.deadlineExceeded = true;
              current.controller.abort();
              reject(new ProbeFailure("timeout"));
            }, timeoutMs);
          }),
        ]);
      } catch (error) {
        assessment = {
          classification: failureClassification(current, error),
          changedBullets: 0,
          irSupported: false,
        };
      } finally {
        if (timer) clearTimeout(timer);
        current.controller.abort();
      }
      if (current.statuses.some((status) => status < 200 || status >= 300))
        assessment = {
          classification: failureClassification(
            current,
            new ProbeFailure("provider_unavailable"),
          ),
          changedBullets: 0,
          irSupported: false,
        };
      cases.push({
        name,
        classification: assessment.classification,
        dispatchState: current.fetchDispatches
          ? "DISPATCHED"
          : "NOT_DISPATCHED",
        changedBullets: assessment.changedBullets,
        changedSelection: assessment.changedSelection ?? null,
        groundedCitedTips,
        responseBindingVerified,
        outsideBytesUnchanged,
        resumeConfirmationRequired,
        writingStages: {
          proposalBoundary,
          providerProposalCount:
            proposalBoundary === "rewrite_service_validated_proposals"
              ? proposalCount
              : null,
          ...summarizeWritingStages(proposalCount, retainedWriter),
        },
        buildOperation,
        irSupported: assessment.irSupported,
        syntaxRepaired:
          name === "build_fix" && assessment.classification === "passed",
        ...safeObservationMetadata(current),
        elapsedMs: Math.round(performance.now() - caseStarted),
        providerIdempotency: name.startsWith("build_")
          ? "unsupported"
          : "unique_key",
        noScoreClaimObserved:
          assessment.classification === "passed" ? true : null,
      });
      active = null;
      if (stopAfterCase(current.statuses, assessment.classification)) break;
    }
    try {
      await checkSources(root, allocation.sourceHashes);
    } catch {
      sourceStable = false;
    }
  } catch (error) {
    executionError =
      error instanceof ProbeFailure ? error.code : "execution_failed";
    try {
      await checkSources(root, allocation.sourceHashes);
    } catch {
      sourceStable = false;
    }
  } finally {
    active?.controller.abort();
    globalThis.fetch = originalFetch;
  }
  for (const name of caseAllocation.cases)
    if (!cases.some((item) => item.name === name))
      cases.push({
        name,
        classification: "not_dispatched",
        dispatchState: "NOT_DISPATCHED",
        reason: "batch_stopped_or_deadline",
        fetchDispatches: 0,
        requestedOutputTokens: 0,
        httpStatuses: [],
        usage: null,
        writingStages: {
          proposalBoundary: null,
          providerProposalCount: null,
          ...summarizeWritingStages(null, null),
        },
        buildOperation: null,
      });
  const receipt = {
    schema: POLICY,
    observationPolicy: OBSERVATION_POLICY,
    runId: allocation.runId,
    tier: "production_service_transport_validation_only",
    model: config.model,
    allocationSha256: args[4],
    sourceHashes: allocation.sourceHashes,
    sourceStable,
    executionError,
    fixtureReadiness,
    selectedCases: caseAllocation.cases,
    excludedCases: CASE_NAMES.filter(
      (name) => !caseAllocation.cases.includes(name),
    ),
    limits: {
      maxRequests: caseAllocation.maxRequests,
      maxRequestedOutputTokens: caseAllocation.maxRequestedOutputTokens,
      perCaseMs: 30000,
      aggregateMs: 120000,
      sdkRetries: 0,
    },
    ...observer.metadata(),
    cases,
    status:
      !executionError &&
      sourceStable &&
      observer.metadata().fetchDispatches === caseAllocation.maxRequests &&
      cases.length === caseAllocation.cases.length &&
      cases.every((item) => item.classification === "passed")
        ? "PASSED_SERVICE_TIER"
        : "FAILED_OR_INCOMPLETE",
    elapsedMs: Math.round(performance.now() - started),
    rawMaterialRetained: false,
    productionBuildFactGateAcceptance: false,
    durableIdempotencyAcceptance: false,
    databaseAuthBrowserCompileAcceptance: false,
  };
  const text = JSON.stringify(receipt, null, 2);
  if (Buffer.byteLength(text) > 262144) fail("receipt_bound");
  await checkOutput();
  await privateFile(join(output, "receipt.json"), text);
  return receipt;
}

if (process.argv.includes("--run-ai-live")) {
  const index = process.argv.indexOf("--run-ai-live");
  runAllocatedLiveProbe(process.argv.slice(index))
    .then((receipt) => {
      process.stdout.write(
        JSON.stringify({
          status: receipt.status,
          fetchDispatches: receipt.fetchDispatches,
          requestedOutputTokens: receipt.requestedOutputTokens,
        }) + "\n",
      );
      process.exitCode = receipt.status === "PASSED_SERVICE_TIER" ? 0 : 1;
    })
    .catch(() => {
      process.stderr.write(
        JSON.stringify({ status: "ADMISSION_OR_EXECUTION_FAILED" }) + "\n",
      );
      process.exitCode = 1;
    });
}
