import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  createLocalContainerOcrAdapter,
  type DockerCommand,
} from "../app/lib/server/ocr/local-container";
import {
  LocalOcrExecutionError,
  runSelectiveLocalOcr,
  type SelectiveOcrRequest,
} from "../app/lib/server/ocr/selective";
import { extractPdfTextLayers } from "../app/lib/server/ocr/pdf-detection";
import {
  createEncryptedOcrControl,
  createOversizedRasterOcrControl,
} from "../tests/fixtures/ocr-adverse";

const imageId = process.argv[2];
assert.match(
  imageId ?? "",
  /^sha256:[a-f0-9]{64}$/u,
  "Pass the explicitly built immutable local image ID",
);
assert.equal(process.argv.length, 3, "No extra options permitted");
// Every subprocess is bounded; document-bearing stdout/stderr is discarded on
// failure. Only aggregate metadata and immutable source hashes reach this report.
const docker: DockerCommand = (args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn("docker", [...args], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    });
    const chunks: Buffer[] = [];
    let count = 0,
      failed = false;
    const fail = (
      code: "engine_failure" | "timeout" | "cancelled" | "resource_limit",
    ) => {
      if (failed) return;
      failed = true;
      child.kill("SIGKILL");
      reject(new LocalOcrExecutionError(code));
    };
    const abort = () => fail("cancelled");
    const timer = setTimeout(() => fail("timeout"), options.timeoutMs);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const collect = (chunk: Buffer, keep: boolean) => {
      count += chunk.length;
      if (count > (options.maxOutputBytes ?? 4 * 1024 * 1024))
        fail("resource_limit");
      else if (keep) chunks.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => collect(chunk, true));
    child.stderr.on("data", (chunk: Buffer) => collect(chunk, false));
    child.on("error", () => fail("engine_failure"));
    child.stdin.on("error", () => fail("engine_failure"));
    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (!failed) {
        if (code === 0) resolve(Buffer.concat(chunks).toString("utf8"));
        else reject(new LocalOcrExecutionError("engine_failure"));
      }
    });
    child.stdin.end(options.input);
  });
const owned = async () =>
  (
    await docker(
      ["ps", "--all", "--quiet", "--filter", "label=resumide.ocr.attempt"],
      { timeoutMs: 3000 },
    )
  )
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
const baseline = await owned();
const results = [];
const fixtures = [
  createEncryptedOcrControl(),
  createOversizedRasterOcrControl(),
];
const receipt = {
  imageId,
  config: { psm: 3 as const, maxDpi: 150 as const },
  sources: fixtures.map((fixture) => ({
    id: fixture.id,
    properties: fixture.properties,
    sourceSha256: fixture.sourceSha256,
    datasetType: fixture.datasetType,
    partition: fixture.partition,
    annotatorType: fixture.annotatorType,
    humanValidation: fixture.humanValidation,
    representativeValidity: fixture.representativeValidity,
    persistedRawAssets: fixture.persistedRawAssets,
  })),
};
const receiptSha256 = createHash("sha256")
  .update(JSON.stringify(receipt))
  .digest("hex");
process.stdout.write(
  JSON.stringify({
    status: "adverse_receipt_pre_execution",
    receiptSha256,
    ...receipt,
  }) + "\n",
);
for (const fixture of fixtures) {
  const native = await extractPdfTextLayers(fixture.bytes, {
    maxPages: 10,
    maxCharacters: 100_000,
  });
  assert.deepEqual(native.pageTexts, [""]);
  const request: SelectiveOcrRequest = {
    schemaVersion: "selective-ocr-request-v1",
    attemptId: randomUUID(),
    ownerId: randomUUID(),
    analysisId: randomUUID(),
    sourceId: randomUUID(),
    createdAt: new Date().toISOString(),
    retentionPolicyId: "synthetic-local-30d/1.0.0",
    sourceSha256: fixture.sourceSha256,
    nativePageTexts: native.pageTexts,
    selectedPages: [{ pageNumber: 1, pageId: "page-1" }],
    limits: { maxCharacters: 100_000, maxPages: 10 },
    remainingDeadlineMs: 15_000,
    allocation: {
      id: "owner-approved-synthetic-local-2026-10-04",
      maxWallTimeMs: 10_000,
      maxPages: 10,
      externalApiFeeMicros: 0,
    },
    policy: {
      executionMode: "self_hosted",
      purpose: "synthetic_local_test",
      allowThirdPartyProcessing: false,
    },
  };
  let isolationObserved = false;
  let createMs: number | null = null,
    attachMs: number | null = null;
  let terminalState: {
    exitCode: number;
    oomKilled: boolean;
    running: boolean;
  } | null = null;
  let creationId: string | null = null;
  const command: DockerCommand = async (args, options) => {
    const started = performance.now();
    try {
      const output = await docker(args, options);
      if (args[0] === "create") {
        createMs = performance.now() - started;
        creationId = output.trim();
        assert.match(creationId, /^[a-f0-9]{64}$/u);
        const observed = JSON.parse(
          await docker(
            [
              "inspect",
              "--format",
              '{"host":{{json .HostConfig}},"user":{{json .Config.User}}}',
              creationId,
            ],
            { timeoutMs: 3000, maxOutputBytes: 32768 },
          ),
        );
        assert.equal(observed.user, "10001:10001");
        const host = observed.host;
        assert.equal(host.NetworkMode, "none");
        assert.equal(host.ReadonlyRootfs, true);
        assert.equal(host.Memory, 1073741824);
        assert.equal(host.MemorySwap, 1073741824);
        assert.equal(host.NanoCpus, 2000000000);
        assert.equal(host.PidsLimit, 64);
        assert.deepEqual(host.CapDrop, ["ALL"]);
        assert.ok(host.SecurityOpt.includes("no-new-privileges"));
        assert.equal(host.LogConfig.Type, "none");
        assert.equal(host.Binds, null);
        assert.ok(host.Tmpfs["/scratch"].includes("size=268435456"));
        isolationObserved = true;
      }
      return output;
    } finally {
      if (args[0] === "start" && creationId) {
        attachMs = performance.now() - started;
        const state = JSON.parse(
          await docker(
            [
              "inspect",
              "--format",
              '{"exitCode":{{json .State.ExitCode}},"oomKilled":{{json .State.OOMKilled}},"running":{{json .State.Running}}}',
              creationId,
            ],
            { timeoutMs: 3000, maxOutputBytes: 1024 },
          ),
        );
        assert.equal(state.running, false);
        assert.equal(state.oomKilled, false);
        terminalState = state;
      }
    }
  };
  const started = performance.now();
  const outcome = await runSelectiveLocalOcr(
    request,
    createLocalContainerOcrAdapter({
      bytes: fixture.bytes,
      imageId,
      command,
      evaluationConfig: receipt.config,
    }),
    new AbortController().signal,
  );
  assert.equal(isolationObserved, true);
  assert.ok(creationId);
  assert.ok(
    (await owned()).every((id) => baseline.includes(id)),
    "Exact-owned cleanup failed",
  );
  assert.deepEqual(native.pageTexts, [""]);
  if (fixture.id.startsWith("encrypted")) {
    assert.equal(outcome.status, "failed");
    if (outcome.status === "failed")
      assert.equal(outcome.code, "engine_failure");
  } else {
    assert.equal(outcome.status, "insufficient");
    if (outcome.status === "insufficient") {
      assert.equal(outcome.scoringEligible, false);
      assert.equal(outcome.pages[0].text, "");
      assert.ok(
        outcome.pages[0].widthPixels * outcome.pages[0].heightPixels <=
          10_000_000,
      );
    }
  }
  results.push({
    id: fixture.id,
    sourceSha256: fixture.sourceSha256,
    sourceBytes: fixture.bytes.length,
    properties: fixture.properties,
    status: outcome.status,
    errorCode: outcome.status === "failed" ? outcome.code : null,
    wallMs: performance.now() - started,
    createMs,
    attachMs,
    terminalState,
    isolation: "verified",
    cleanup: "verified",
    nativePreservation: "verified",
    startupScope:
      "new_container_create_and_attach_wall_times_cached_image_not_host_or_engine_cold_start",
    resourceUsage:
      outcome.status === "insufficient"
        ? (outcome.resourceUsage ?? null)
        : null,
    failedResourceReason:
      outcome.status === "failed"
        ? "failed_attempt_cpu_and_memory_unmeasured"
        : null,
    renderedPixels:
      outcome.status === "insufficient"
        ? outcome.pages[0].widthPixels * outcome.pages[0].heightPixels
        : null,
  });
}
process.stdout.write(
  JSON.stringify(
    {
      status: "adverse_runtime_verified",
      receiptSha256,
      completedAt: new Date().toISOString(),
      datasetType: "synthetic_engineering_only",
      humanValidation: "not_evaluated",
      representativeValidity: "not_evaluated",
      persistedRawAssets: false,
      calibration: "not_evaluated",
      productionEnablement: false,
      automaticRetries: 0,
      results,
    },
    null,
    2,
  ) + "\n",
);
