import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readAiReadiness } from "../../app/lib/server/ai-readiness";
import { runAiDoctor } from "../../scripts/doctor-ai";

const syntheticKey = "sk-" + "UNIT_ONLY_".repeat(5);
const otherKey = "sk-" + "OTHER_UNIT_ONLY_".repeat(4);
const folders: string[] = [];
async function workspace(contents?: string) {
  const path = await mkdtemp(join(tmpdir(), "resumide-ai-doctor-unit-"));
  folders.push(path);
  if (contents !== undefined) await writeFile(join(path, ".env"), contents);
  return path;
}
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("offline AI configuration diagnosis without credential exposure", () => {
  it.each([
    ["OPENAI_API_KEY", "sk-" + "x".repeat(4094), "credential_too_long"],
    ["OPENAI_ORG_ID", "synthetic organization", "organization_format_invalid"],
    ["OPENAI_PROJECT_ID", "synthetic project", "project_format_invalid"],
  ])(
    "diagnoses an unusable %s before live mode",
    async (setting, value, issue) => {
      const environment = {
        ...liveEnvironment,
        [setting]: value,
      };
      const result = await runAiDoctor(["--source", "process"], environment);

      expect(result.exitCode).toBe(1);
      expect(result.output).toMatchObject({
        status: "configuration_issues",
        authentication: "not_tested",
        providerRequests: 0,
        issues: [issue],
      });
      expect(JSON.stringify(result.output)).not.toContain(value);

      const fixture = await allocatedFixture();
      const fetch = vi.fn<typeof globalThis.fetch>();
      const live = await runAiDoctor(fixture.args, environment, {
        fetch,
        now: () => admittedAt,
      });
      expect(live.exitCode).toBe(1);
      expect(live.output).toMatchObject({
        status: "configuration_issues",
        failure: "configuration_invalid",
        allocationAccepted: true,
        providerRequests: 0,
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(JSON.stringify(live.output)).not.toContain(value);
    },
  );

  it("reports plausible configuration without claiming authentication or live readiness", async () => {
    const report = await readAiReadiness({
      workspaceRoot: await workspace(`OPENAI_API_KEY=${syntheticKey}\n`),
      environment: {},
    });
    expect(report.status).toBe("configuration_plausible");
    expect(report.authentication).toBe("not_tested");
    expect(report.providerRequests).toBe(0);
    expect(report.credential).toMatchObject({
      present: true,
      formatPlausible: true,
      noSurroundingWhitespace: true,
      source: "env_file",
    });
    expect(report.endpoint).toEqual({ allowed: true, usesDefault: true });
    expect(report.model).toMatchObject({ present: true, usesDefault: true });
    expect(report.cache).toEqual({
      compared: false,
      matchesEffective: null,
      restartRequired: null,
    });
    expect(JSON.stringify(report)).not.toContain(syntheticKey);
  });
  it("does not load a production or local override when the selected file is absent", async () => {
    const root = await workspace();
    await writeFile(
      join(root, ".env.production"),
      `OPENAI_API_KEY=${syntheticKey}`,
    );
    await writeFile(join(root, ".env.local"), `OPENAI_API_KEY=${syntheticKey}`);
    const report = await readAiReadiness({
      workspaceRoot: root,
      environment: {},
    });
    expect(report.status).toBe("configuration_issues");
    expect(report.issues).toContain("env_file_missing");
    expect(report.credential.present).toBe(false);
    expect(report.source.automaticFallback).toBe(false);
  });
  it("matches Node quoted/export syntax and treats an inherited key as the effective source", async () => {
    const root = await workspace(
      `export OPENAI_API_KEY = '${syntheticKey}' # comment\nOPENAI_MODEL='configured-model'\n`,
    );
    const report = await readAiReadiness({
      workspaceRoot: root,
      environment: { OPENAI_API_KEY: otherKey },
    });
    expect(report.credential.source).toBe("process_env");
    expect(report.source.processOverrides.apiKey).toBe(true);
    expect(report.source.processDiffersFromFile.apiKey).toBe(true);
    expect(report.model.usesDefault).toBe(false);
    expect(JSON.stringify(report)).not.toContain("configured-model");
    expect(JSON.stringify(report)).not.toContain(otherKey);
  });
  it("does not fall back from an explicitly empty inherited key", async () => {
    const report = await readAiReadiness({
      workspaceRoot: await workspace(`OPENAI_API_KEY=${syntheticKey}`),
      environment: { OPENAI_API_KEY: "" },
    });
    expect(report.credential).toMatchObject({
      source: "process_env",
      present: false,
    });
    expect(report.issues).toContain("credential_missing");
  });
  it("detects duplicate assignments and their Node last-value precedence without revealing either value", async () => {
    const report = await readAiReadiness({
      workspaceRoot: await workspace(
        `OPENAI_API_KEY=${syntheticKey}\nexport OPENAI_API_KEY='${otherKey}'\n`,
      ),
      environment: {},
      cachedEnvironment: { OPENAI_API_KEY: otherKey },
    });
    expect(report.source.definitions.apiKey).toBe(2);
    expect(report.issues).toContain("duplicate_definitions");
    expect(report.cache.matchesEffective).toBe(true);
    expect(JSON.stringify(report)).not.toContain(syntheticKey);
    expect(JSON.stringify(report)).not.toContain(otherKey);
  });
  it("does not count key-looking lines inside a quoted multiline value", async () => {
    const report = await readAiReadiness({
      workspaceRoot: await workspace(
        `UNRELATED="first\nOPENAI_API_KEY=not-an-assignment\nlast"\nOPENAI_API_KEY=${syntheticKey}\n`,
      ),
      environment: {},
    });
    expect(report.source.definitions.apiKey).toBe(1);
    expect(report.issues).not.toContain("duplicate_definitions");
  });
  it.each([
    {
      label: "backtick multiline value",
      text: `UNRELATED=\`first\nOPENAI_API_KEY=inside-only\nlast\`\nOPENAI_API_KEY=${syntheticKey}\n`,
      count: 1,
    },
    {
      label: "unterminated unrelated quote",
      text: `UNRELATED="unterminated\nOPENAI_API_KEY=${syntheticKey}\nOPENAI_API_KEY=${otherKey}\n`,
      count: 2,
    },
    {
      label: "marker-like unrelated identifier",
      text: `__RESUMIDE_AI_ASSIGNMENT_0=ordinary\nOPENAI_API_KEY=${syntheticKey}\nexport OPENAI_API_KEY=${otherKey}\n`,
      count: 2,
    },
  ])(
    "counts only assignments emitted by Node for $label",
    async ({ text, count }) => {
      const report = await readAiReadiness({
        workspaceRoot: await workspace(text),
        environment: {},
      });
      expect(report.source.definitions.apiKey).toBe(count);
      expect(report.issues.includes("duplicate_definitions")).toBe(count > 1);
      expect(JSON.stringify(report)).not.toContain(syntheticKey);
      expect(JSON.stringify(report)).not.toContain(otherKey);
    },
  );
  it.each([
    "not-a-provider-key",
    ` ${syntheticKey}`,
    `${syntheticKey}\nsecond-line`,
  ])(
    "keeps malformed or whitespace-bearing credential input private",
    async (key) => {
      const report = await readAiReadiness({
        source: "process",
        environment: { OPENAI_API_KEY: key },
      });
      expect(report.status).toBe("configuration_issues");
      expect(report.issues).toContain("credential_format_unrecognized");
      expect(JSON.stringify(report)).not.toContain(key);
      expect(report.authentication).toBe("not_tested");
    },
  );
  it("rejects an unterminated quoted credential as shape-invalid without echoing source text", async () => {
    const report = await readAiReadiness({
      workspaceRoot: await workspace(`OPENAI_API_KEY="${syntheticKey}`),
      environment: {},
    });
    expect(report.status).toBe("configuration_issues");
    expect(JSON.stringify(report)).not.toContain(syntheticKey);
  });
  it.each([
    "https://api.openai.com/v1?secret=unit-only",
    "https://unit-only@api.openai.com/v1",
    "https://other.example.test/v1",
  ])(
    "reports unsafe configured egress without echoing it",
    async (endpoint) => {
      const report = await readAiReadiness({
        source: "process",
        environment: {
          OPENAI_API_KEY: syntheticKey,
          OPENAI_BASE_URL: endpoint,
        },
      });
      expect(report.endpoint.allowed).toBe(false);
      expect(report.issues).toContain("endpoint_not_allowed");
      expect(JSON.stringify(report)).not.toContain(endpoint);
    },
  );
  it("retains empty model/endpoint errors rather than silently using defaults", async () => {
    const report = await readAiReadiness({
      source: "process",
      environment: {
        OPENAI_API_KEY: syntheticKey,
        OPENAI_MODEL: "",
        OPENAI_BASE_URL: "",
      },
    });
    expect(report.model).toMatchObject({ present: false, usesDefault: false });
    expect(report.endpoint).toEqual({ allowed: false, usesDefault: false });
    expect(report.issues).toContain("model_missing_or_malformed");
  });
  it("compares only an explicitly supplied in-memory cache snapshot and reports restart requirements", async () => {
    const report = await readAiReadiness({
      source: "process",
      environment: { OPENAI_API_KEY: syntheticKey },
      cachedEnvironment: { OPENAI_API_KEY: otherKey },
    });
    expect(report.cache).toEqual({
      compared: true,
      matchesEffective: false,
      restartRequired: true,
    });
    expect(report.issues).toContain("cached_configuration_differs");
    expect(JSON.stringify(report)).not.toContain(otherKey);
  });
  it("does not read any file in explicit process-only mode", async () => {
    const report = await readAiReadiness({
      source: "process",
      workspaceRoot: "/definitely-unavailable-unit-workspace",
      environment: { OPENAI_API_KEY: syntheticKey },
    });
    expect(report.status).toBe("configuration_plausible");
    expect(report.source.fileRead).toBe(false);
    expect(report.credential.source).toBe("process_env");
  });
  it("rejects path traversal, outside files and symlink files without reading them", async () => {
    const root = await workspace();
    const outside = await workspace(`OPENAI_API_KEY=${syntheticKey}`);
    for (const envFile of [join(outside, ".env"), "../outside.env"]) {
      const report = await readAiReadiness({
        workspaceRoot: root,
        envFile,
        environment: {},
      });
      expect(report.issues).toContain("env_path_outside_workspace");
      expect(report.source.fileRead).toBe(false);
    }
    await symlink(join(outside, ".env"), join(root, ".env"));
    const report = await readAiReadiness({
      workspaceRoot: root,
      environment: {},
    });
    expect(report.issues).toContain("env_path_symlink");
    expect(report.source.fileRead).toBe(false);
  });
  it("refuses a symlinked parent escaping the workspace and non-regular/oversized files", async () => {
    const root = await workspace();
    const outside = await workspace(`OPENAI_API_KEY=${syntheticKey}`);
    await symlink(outside, join(root, "linked"));
    const escaped = await readAiReadiness({
      workspaceRoot: root,
      envFile: "linked/.env",
      environment: {},
    });
    expect(escaped.issues).toContain("env_path_outside_workspace");
    expect(escaped.source.pathWithinWorkspace).toBe(false);
    await mkdir(join(root, "directory"));
    expect(
      (
        await readAiReadiness({
          workspaceRoot: root,
          envFile: "directory",
          environment: {},
        })
      ).issues,
    ).toContain("env_file_not_regular");
    await writeFile(join(root, "large.env"), "x".repeat(131073));
    expect(
      (
        await readAiReadiness({
          workspaceRoot: root,
          envFile: "large.env",
          environment: {},
        })
      ).issues,
    ).toContain("env_file_too_large");
  });
  it("preserves actual flags and reports malformed flag values without reflecting them", async () => {
    const report = await readAiReadiness({
      source: "process",
      environment: {
        OPENAI_API_KEY: syntheticKey,
        AI_ENABLED: "false",
        BUILD_AI_ASSIST_ENABLED: "unexpected-unit-only",
      },
    });
    expect(report.flags.aiEnabled).toBe(false);
    expect(report.flags.buildAiEnabled).toBeNull();
    expect(report.issues).toContain("flag_invalid");
    expect(JSON.stringify(report)).not.toContain("unexpected-unit-only");
  });
  it("reports ambient SDK context presence/source without revealing values or treating it as an auth diagnosis", async () => {
    const privateOrg = "PRIVATE_UNIT_ORGANIZATION";
    const privateProject = "PRIVATE_UNIT_PROJECT";
    const root = await workspace(
      `OPENAI_API_KEY=${syntheticKey}\nOPENAI_PROJECT_ID=${privateProject}\nOPENAI_LOG=debug\n`,
    );
    const report = await readAiReadiness({
      workspaceRoot: root,
      environment: { OPENAI_ORG_ID: privateOrg },
    });
    expect(report.sdkContext.organization).toEqual({
      present: true,
      source: "process_env",
    });
    expect(report.sdkContext.project).toEqual({
      present: true,
      source: "env_file",
    });
    expect(report.sdkContext.logging).toEqual({
      present: true,
      source: "env_file",
    });
    expect(report.authentication).toBe("not_tested");
    expect(JSON.stringify(report)).not.toContain(privateOrg);
    expect(JSON.stringify(report)).not.toContain(privateProject);
    expect(JSON.stringify(report)).not.toContain("debug");
  });
});

describe("offline doctor CLI boundary", () => {
  it("returns only structured offline metadata and never calls fetch", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network must not run"));
    const result = await runAiDoctor(["--source", "process"], {
      OPENAI_API_KEY: syntheticKey,
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toMatchObject({
      mode: "offline",
      authentication: "not_tested",
      providerRequests: 0,
    });
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it.each(
    [
      ["--live"],
      ["--workspace"],
      ["--source", "untrusted"],
      ["--source", "process", "--env-file", ".env.production"],
      ["--workspace", "one", "--workspace", "two"],
      ["--api-key", syntheticKey],
    ].map((args) => ({ args })),
  )(
    "rejects unsupported/ambiguous arguments without exposing them",
    async ({ args }) => {
      const result = await runAiDoctor(args, {});
      expect(result.exitCode).toBe(2);
      expect(result.output).toMatchObject({
        status: "invalid_arguments",
        authentication: "not_tested",
        providerRequests: 0,
      });
      expect(JSON.stringify(result.output)).not.toContain(syntheticKey);
      expect(JSON.stringify(result.output)).not.toContain(".env.production");
    },
  );
  it("keeps unavailable workspace errors content-free", async () => {
    const root = "/not-found-PRIVATE_UNIT_CANARY";
    const result = await runAiDoctor(["--workspace", root], {});
    expect(result.exitCode).toBe(1);
    expect(JSON.stringify(result.output)).not.toContain(root);
    expect(JSON.stringify(result.output)).not.toContain("ENOENT");
  });
});

const admittedAt = Date.UTC(2026, 10, 14, 0, 0, 0);
const privateModel = "PRIVATE_UNIT:DOCTOR_MODEL";
const liveEnvironment = {
  OPENAI_API_KEY: syntheticKey,
  OPENAI_MODEL: privateModel,
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  AI_ENABLED: "false",
  BUILD_AI_ASSIST_ENABLED: "false",
};
async function allocatedFixture(overrides: Record<string, unknown> = {}) {
  const root = await realpath(await workspace());
  const allocation = {
    schemaVersion: "ai-doctor-live-allocation/1.0.0",
    allocationId: "10000000-0000-4000-8000-000000000001",
    ownerConfirmed: true,
    operation: "model_access",
    workspaceRoot: root,
    source: "process",
    envFile: null,
    model: privateModel,
    expiresAt: new Date(admittedAt + 60_000).toISOString(),
    maxRequests: 1,
    maxOutputTokens: 0,
    timeoutMs: 1000,
    ...overrides,
  };
  const path = join(root, "allocation.json");
  await writeFile(path, JSON.stringify(allocation));
  return {
    root,
    path,
    allocation,
    args: [
      "--live",
      "--allocation",
      path,
      "--workspace",
      root,
      "--source",
      "process",
    ],
  };
}
function modelResponse(id = privateModel) {
  return new Response(
    JSON.stringify({
      id,
      object: "model",
      created: 0,
      owned_by: "unit-fixture",
    }),
    { headers: { "content-type": "application/json" } },
  );
}
describe("allocated doctor interface with real SDK and fake fetch only", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("GLOBAL_NETWORK_FORBIDDEN"),
    );
  });
  afterEach(() => {
    expect(globalThis.fetch).not.toHaveBeenCalled();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  it("accepts the complete explicit allocated-live interface", async () => {
    const fixture = await allocatedFixture();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(modelResponse());
    const result = await runAiDoctor(fixture.args, liveEnvironment, {
      fetch,
      now: () => admittedAt,
    });
    expect({
      exitCode: result.exitCode,
      status: result.output.status,
      calls: fetch.mock.calls.length,
    }).toEqual({
      exitCode: 0,
      status: "model_access_confirmed",
      calls: 1,
    });
  });
});

function safeLiveOutput(output: unknown, canaries: string[] = []) {
  if (!output || typeof output !== "object" || Array.isArray(output))
    throw Error("EXPECTED_SAFE_LIVE_REPORT");
  expect(Object.keys(output).sort()).toEqual(
    [
      "schemaVersion",
      "mode",
      "status",
      "authentication",
      "failure",
      "allocationAccepted",
      "providerRequests",
      "generationRequests",
      "retries",
      "redirects",
      "httpStatus",
      "deadlineAborted",
    ].sort(),
  );
  const json = JSON.stringify(output);
  for (const value of [
    syntheticKey,
    otherKey,
    privateModel,
    "api.openai.com",
    "PRIVATE_PROVIDER_CANARY",
    "PRIVATE_NETWORK_CANARY",
    "PRIVATE_HEADER_CANARY",
    "PRIVATE_ENV_ACCESS_CANARY",
    ...canaries,
  ])
    expect(json).not.toContain(value);
}
function unreadableEnvironment() {
  let reads = 0;
  const environment: Record<string, string | undefined> = {};
  for (const name of [
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "OPENAI_BASE_URL",
    "AI_ENABLED",
    "BUILD_AI_ASSIST_ENABLED",
    "OPENAI_ORG_ID",
    "OPENAI_PROJECT_ID",
    "OPENAI_LOG",
  ])
    Object.defineProperty(environment, name, {
      enumerable: true,
      get: () => {
        reads++;
        throw Error("PRIVATE_ENV_ACCESS_CANARY");
      },
    });
  return { environment, reads: () => reads };
}
function abortingFetch() {
  let signal: AbortSignal | null | undefined;
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        signal = init?.signal;
        if (!signal) {
          reject(Error("MISSING_ABORT_SIGNAL"));
          return;
        }
        if (signal.aborted)
          reject(new DOMException("unit abort", "AbortError"));
        else
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("unit abort", "AbortError")),
            { once: true },
          );
      }),
  );
  return { fetch, signal: () => signal };
}
describe("bounded allocated doctor acceptance", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("GLOBAL_NETWORK_FORBIDDEN"),
    );
  });
  afterEach(() => {
    expect(globalThis.fetch).not.toHaveBeenCalled();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  it("uses the installed SDK for one exact GET with selected context and silent ambient isolation", async () => {
    const f = await allocatedFixture();
    const selectedOrg = "PRIVATE_SELECTED_ORG",
      selectedProject = "PRIVATE_SELECTED_PROJECT";
    vi.stubEnv("OPENAI_ORG_ID", "PRIVATE_AMBIENT_ORG");
    vi.stubEnv("OPENAI_PROJECT_ID", "PRIVATE_AMBIENT_PROJECT");
    vi.stubEnv("OPENAI_ADMIN_KEY", "PRIVATE_AMBIENT_ADMIN");
    vi.stubEnv("OPENAI_WEBHOOK_SECRET", "PRIVATE_AMBIENT_WEBHOOK");
    vi.stubEnv(
      "OPENAI_CUSTOM_HEADERS",
      "x-private-unit: PRIVATE_AMBIENT_HEADER",
    );
    vi.stubEnv("OPENAI_LOG", "debug");
    const logs = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "debug"),
    ];
    for (const log of logs) log.mockImplementation(() => {});
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async (input, init) => {
        expect(input instanceof Request ? input.url : String(input)).toBe(
          `https://api.openai.com/v1/models/${privateModel}`,
        );
        expect(init?.method).toBe("GET");
        expect(init?.body == null).toBe(true);
        expect(init?.redirect).toBe("error");
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe(`Bearer ${syntheticKey}`);
        expect(headers.get("openai-organization")).toBe(selectedOrg);
        expect(headers.get("openai-project")).toBe(selectedProject);
        expect(headers.get("x-private-unit")).toBeNull();
        expect(JSON.stringify([...headers])).not.toContain("AMBIENT");
        return modelResponse();
      });
    const environment = {
        ...liveEnvironment,
        OPENAI_ORG_ID: selectedOrg,
        OPENAI_PROJECT_ID: selectedProject,
        OPENAI_LOG: "debug",
      },
      before = { ...environment };
    const result = await runAiDoctor(f.args, environment, {
      fetch,
      now: () => admittedAt,
    });
    expect(result.exitCode).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toEqual({
      schemaVersion: "ai-readiness/live-v1",
      mode: "live",
      status: "model_access_confirmed",
      authentication: "model_access_confirmed",
      failure: null,
      allocationAccepted: true,
      providerRequests: 1,
      generationRequests: 0,
      retries: 0,
      redirects: 0,
      httpStatus: 200,
      deadlineAborted: false,
    });
    safeLiveOutput(result.output, [
      f.root,
      f.path,
      selectedOrg,
      selectedProject,
      "PRIVATE_AMBIENT_HEADER",
    ]);
    expect(environment).toEqual(before);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
  it("shares selected-file parsing and inherited precedence without changing the supplied environment", async () => {
    const f = await allocatedFixture({
      source: "env_file",
      envFile: "selected.env",
    });
    await writeFile(
      join(f.root, "selected.env"),
      `export OPENAI_API_KEY='${syntheticKey}'\nOPENAI_MODEL='${privateModel}'\nOPENAI_ORG_ID=PRIVATE_FILE_ORG\nAI_ENABLED=false\nBUILD_AI_ASSIST_ENABLED=false\n`,
    );
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async (_input, init) => {
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe(`Bearer ${otherKey}`);
        expect(headers.get("openai-organization")).toBe("PRIVATE_FILE_ORG");
        return modelResponse();
      });
    const environment = { OPENAI_API_KEY: otherKey };
    const result = await runAiDoctor(
      [
        "--live",
        "--allocation",
        f.path,
        "--workspace",
        f.root,
        "--source",
        "env-file",
        "--env-file",
        "selected.env",
      ],
      environment,
      { fetch, now: () => admittedAt },
    );
    expect(result.exitCode).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(environment).toEqual({ OPENAI_API_KEY: otherKey });
    safeLiveOutput(result.output, [f.path, "PRIVATE_FILE_ORG"]);
  });
  it.each([
    { ownerConfirmed: false },
    { operation: "generation" },
    { maxRequests: 2 },
    { maxOutputTokens: 1 },
    { timeoutMs: 0 },
    { timeoutMs: 10001 },
    { expiresAt: new Date(admittedAt - 1).toISOString() },
    { expiresAt: new Date(admittedAt + 1_800_001).toISOString() },
    { source: "env_file", envFile: ".env" },
    { workspaceRoot: "/PRIVATE_UNIT_WRONG_ROOT" },
    { unknown: "PRIVATE_EXTRA_CANARY" },
  ])(
    "refuses allocation before selected environment access %#",
    async (override) => {
      const f = await allocatedFixture(override),
        guarded = unreadableEnvironment(),
        fetch = vi.fn<typeof globalThis.fetch>();
      const result = await runAiDoctor(f.args, guarded.environment, {
        fetch,
        now: () => admittedAt,
      });
      expect(result.exitCode).toBe(2);
      expect(result.output).toMatchObject({
        status: "allocation_refused",
        allocationAccepted: false,
        authentication: "not_tested",
        providerRequests: 0,
      });
      expect(guarded.reads()).toBe(0);
      expect(fetch).not.toHaveBeenCalled();
      safeLiveOutput(result.output, [f.root, "PRIVATE_EXTRA_CANARY"]);
    },
  );
  it.each(["duplicate", "utf8", "oversized", "symlink", "outside", "same-env"])(
    "rejects allocation-file %s before selected key access",
    async (kind) => {
      const f = await allocatedFixture(),
        guarded = unreadableEnvironment(),
        fetch = vi.fn<typeof globalThis.fetch>();
      let path = f.path,
        args = f.args;
      if (kind === "duplicate")
        await writeFile(
          path,
          JSON.stringify(f.allocation).slice(0, -1) + ',"maxRequests":1}',
        );
      if (kind === "utf8") await writeFile(path, Buffer.from([0xff, 0xfe]));
      if (kind === "oversized") await writeFile(path, " ".repeat(16_385));
      if (kind === "symlink") {
        path = join(f.root, "linked.json");
        await symlink(f.path, path);
      }
      if (kind === "outside") path = (await allocatedFixture()).path;
      if (kind === "same-env") {
        path = join(f.root, ".env");
        await writeFile(path, "PRIVATE_ENV_ACCESS_CANARY");
        args = ["--live", "--allocation", path, "--workspace", f.root];
      } else
        args = [
          "--live",
          "--allocation",
          path,
          "--workspace",
          f.root,
          "--source",
          "process",
        ];
      const result = await runAiDoctor(args, guarded.environment, {
        fetch,
        now: () => admittedAt,
      });
      expect(result.exitCode).toBe(2);
      expect(result.output).toMatchObject({
        status: "allocation_refused",
        allocationAccepted: false,
        providerRequests: 0,
      });
      expect(guarded.reads()).toBe(0);
      expect(fetch).not.toHaveBeenCalled();
      safeLiveOutput(result.output, [path, f.root]);
    },
  );
  it.each([
    "duplicate",
    "duplicate-live",
    "missing-value",
    "unknown",
    "no-live",
  ])(
    "rejects ambiguous live argv %s without config or dispatch",
    async (kind) => {
      const f = await allocatedFixture(),
        guarded = unreadableEnvironment(),
        fetch = vi.fn<typeof globalThis.fetch>();
      const args =
        kind === "duplicate"
          ? [...f.args, "--allocation", f.path]
          : kind === "duplicate-live"
            ? [...f.args, "--live"]
            : kind === "missing-value"
              ? ["--live", "--allocation"]
              : kind === "unknown"
                ? [...f.args, "--secret-unit", "PRIVATE_ARG_CANARY"]
                : f.args.slice(1);
      const result = await runAiDoctor(args, guarded.environment, {
        fetch,
        now: () => admittedAt,
      });
      expect(result.exitCode).toBe(2);
      expect(result.output).toMatchObject({
        status: "invalid_arguments",
        providerRequests: 0,
      });
      expect(guarded.reads()).toBe(0);
      expect(fetch).not.toHaveBeenCalled();
      expect(JSON.stringify(result.output)).not.toContain("PRIVATE_ARG_CANARY");
    },
  );
  it.each(["key", "endpoint", "model"])(
    "denies invalid effective %s after allocation admission and before dispatch",
    async (kind) => {
      const f = await allocatedFixture(),
        fetch = vi.fn<typeof globalThis.fetch>();
      const environment = { ...liveEnvironment };
      let reads = 0;
      Object.defineProperty(environment, "OPENAI_API_KEY", {
        enumerable: true,
        get: () => {
          reads++;
          return kind === "key" ? "PRIVATE_INVALID_KEY" : syntheticKey;
        },
      });
      if (kind === "endpoint")
        environment.OPENAI_BASE_URL = "https://PRIVATE_ENDPOINT.invalid/v1";
      if (kind === "model")
        environment.OPENAI_MODEL = "PRIVATE_DIFFERENT_MODEL";
      const result = await runAiDoctor(f.args, environment, {
        fetch,
        now: () => admittedAt,
      });
      expect(result.exitCode).toBe(1);
      expect(result.output).toMatchObject({
        status: "configuration_issues",
        failure: "configuration_invalid",
        allocationAccepted: true,
        authentication: "not_tested",
        providerRequests: 0,
      });
      expect(reads).toBeGreaterThan(0);
      expect(fetch).not.toHaveBeenCalled();
      safeLiveOutput(result.output, [
        "PRIVATE_INVALID_KEY",
        "PRIVATE_ENDPOINT",
        "PRIVATE_DIFFERENT_MODEL",
      ]);
    },
  );
  it.each([401, 429, 503, "network"])(
    "keeps actual SDK %s failures single-dispatch and content-free",
    async (status) => {
      const f = await allocatedFixture();
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(async () => {
          if (status === "network")
            throw Error(`PRIVATE_NETWORK_CANARY ${syntheticKey}`);
          return new Response(
            JSON.stringify({
              error: {
                message: "PRIVATE_PROVIDER_CANARY",
                type: "unit_error",
                code: "PRIVATE_CODE",
              },
            }),
            {
              status: Number(status),
              headers: {
                "content-type": "application/json",
                "x-request-id": "PRIVATE_HEADER_CANARY",
              },
            },
          );
        });
      const result = await runAiDoctor(f.args, liveEnvironment, {
        fetch,
        now: () => admittedAt,
      });
      expect(result.exitCode).toBe(1);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.output).toMatchObject({
        status: "model_access_failed",
        authentication: status === 401 ? "failed" : "not_tested",
        failure: status === "network" ? "network_error" : "provider_error",
        providerRequests: 1,
        retries: 0,
        redirects: 0,
        generationRequests: 0,
      });
      safeLiveOutput(result.output);
    },
  );
  it("refuses a redirect without following it", async () => {
    const f = await allocatedFixture(),
      fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(async (_input, init) => {
          expect(init?.redirect).toBe("error");
          return new Response(null, {
            status: 302,
            headers: { location: "https://PRIVATE_REDIRECT.invalid/path" },
          });
        });
    const result = await runAiDoctor(f.args, liveEnvironment, {
      fetch,
      now: () => admittedAt,
    });
    expect(result.exitCode).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toMatchObject({
      failure: "transport_refused",
      httpStatus: 302,
      providerRequests: 1,
      redirects: 0,
      authentication: "not_tested",
    });
    safeLiveOutput(result.output, ["PRIVATE_REDIRECT"]);
  });
  it.each(["json", "model", "metadata"])(
    "does not claim model access for invalid response %s",
    async (kind) => {
      const f = await allocatedFixture(),
        fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () =>
          kind === "json"
            ? new Response("PRIVATE_INVALID_JSON", {
                headers: { "content-type": "application/json" },
              })
            : kind === "model"
              ? modelResponse("PRIVATE_OTHER_MODEL")
              : new Response(
                  JSON.stringify({ id: privateModel, object: "model" }),
                  { headers: { "content-type": "application/json" } },
                ),
        );
      const result = await runAiDoctor(f.args, liveEnvironment, {
        fetch,
        now: () => admittedAt,
      });
      expect(result.exitCode).toBe(1);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result.output).toMatchObject({
        failure: "response_invalid",
        authentication: "not_tested",
        providerRequests: 1,
      });
      safeLiveOutput(result.output, [
        "PRIVATE_INVALID_JSON",
        "PRIVATE_OTHER_MODEL",
      ]);
    },
  );
  it("caps actual response bytes even when content-length understates the body", async () => {
    const f = await allocatedFixture(),
      body = JSON.stringify({
        id: privateModel,
        object: "model",
        created: 0,
        owned_by: "unit",
        padding: "\u0800".repeat(22_000),
      });
    expect(body.length).toBeLessThan(65_536);
    expect(Buffer.byteLength(body, "utf8")).toBeGreaterThan(65_536);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(body, {
        headers: {
          "content-type": "application/json",
          "content-length": "1",
        },
      }),
    );
    const result = await runAiDoctor(f.args, liveEnvironment, {
      fetch,
      now: () => admittedAt,
    });
    expect(result.exitCode).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toMatchObject({
      failure: "response_too_large",
      authentication: "not_tested",
      providerRequests: 1,
    });
    safeLiveOutput(result.output);
  });
  it("aborts a pending SDK fetch at the allocated deadline without retries", async () => {
    const f = await allocatedFixture({ timeoutMs: 200 }),
      pending = abortingFetch();
    const result = await runAiDoctor(f.args, liveEnvironment, {
      fetch: pending.fetch,
      now: () => admittedAt,
    });
    expect(result.exitCode).toBe(1);
    expect(pending.fetch).toHaveBeenCalledTimes(1);
    expect(pending.signal()?.aborted).toBe(true);
    expect(result.output).toMatchObject({
      failure: "deadline_exceeded",
      deadlineAborted: true,
      authentication: "not_tested",
      providerRequests: 1,
      retries: 0,
    });
    safeLiveOutput(result.output);
  });
  it("keeps response streaming and parsing inside the allocated deadline", async () => {
    const f = await allocatedFixture({ timeoutMs: 200 });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async (_input, init) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"id":'));
            init?.signal?.addEventListener(
              "abort",
              () =>
                controller.error(
                  new DOMException("unit body abort", "AbortError"),
                ),
              { once: true },
            );
          },
        });
        return new Response(body, {
          headers: { "content-type": "application/json" },
        });
      });
    const result = await runAiDoctor(f.args, liveEnvironment, {
      fetch,
      now: () => admittedAt,
    });
    expect(result.exitCode).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.output).toMatchObject({
      failure: "deadline_exceeded",
      deadlineAborted: true,
      authentication: "not_tested",
      providerRequests: 1,
    });
    safeLiveOutput(result.output);
  });
  it("honors caller cancellation during the actual SDK fetch", async () => {
    const f = await allocatedFixture(),
      pending = abortingFetch(),
      caller = new AbortController();
    const result = runAiDoctor(f.args, liveEnvironment, {
      fetch: pending.fetch,
      now: () => admittedAt,
      signal: caller.signal,
    });
    await vi.waitFor(() => expect(pending.fetch).toHaveBeenCalledTimes(1));
    caller.abort();
    const settled = await result;
    expect(settled.exitCode).toBe(1);
    expect(pending.signal()?.aborted).toBe(true);
    expect(settled.output).toMatchObject({
      failure: "cancelled",
      deadlineAborted: false,
      authentication: "not_tested",
      providerRequests: 1,
      retries: 0,
    });
    safeLiveOutput(settled.output);
  });
});

describe("guarded legacy doctor delegation", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("GLOBAL_NETWORK_FORBIDDEN"),
    );
  });
  afterEach(() => {
    expect(globalThis.fetch).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it("imports without a request and preserves no-argument refusal and help", async () => {
    const legacy = await import("../../scripts/verify-live-openai-model");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    const refused = await legacy.runLiveOpenAiModel([], {});
    expect(refused.exitCode).toBe(2);
    expect(refused.output).toMatchObject({
      status: "invalid_arguments",
      authentication: "not_tested",
      providerRequests: 0,
    });
    const help = await legacy.runLiveOpenAiModel(["--help"], {});
    expect(help.exitCode).toBe(0);
    expect(help.output).toMatchObject({
      status: "help",
      authentication: "not_tested",
      providerRequests: 0,
    });
  });
  it.each([true, false])(
    "delegates the same bounded allocation with explicit live=%s",
    async (explicit) => {
      const legacy = await import("../../scripts/verify-live-openai-model"),
        f = await allocatedFixture();
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(modelResponse());
      const result = await legacy.runLiveOpenAiModel(
        explicit ? f.args : f.args.slice(1),
        liveEnvironment,
        { fetch, now: () => admittedAt },
      );
      expect(result.exitCode).toBe(0);
      expect(result.output).toMatchObject({
        status: "model_access_confirmed",
        providerRequests: 1,
        generationRequests: 0,
        retries: 0,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      safeLiveOutput(result.output, [f.path]);
    },
  );
});

describe("allocated response deadline after dispatch", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("GLOBAL_NETWORK_FORBIDDEN"),
    );
  });
  afterEach(() => {
    expect(globalThis.fetch).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it("refuses access confirmation when the admitted clock passes expiry during a complete response", async () => {
    const model = "PRIVATE_PLAIN_MODEL";
    const f = await allocatedFixture({ model });
    let clock = admittedAt;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => {
        clock = Date.parse(f.allocation.expiresAt) + 1;
        return modelResponse(model);
      });
    const result = await runAiDoctor(
      f.args,
      { ...liveEnvironment, OPENAI_MODEL: model },
      {
        fetch,
        now: () => clock,
      },
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatchObject({
      status: "model_access_failed",
      failure: "deadline_exceeded",
      deadlineAborted: true,
      authentication: "not_tested",
      providerRequests: 1,
    });
    safeLiveOutput(result.output, [model]);
  });
});
