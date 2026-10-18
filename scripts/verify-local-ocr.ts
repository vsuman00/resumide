import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { createLocalContainerOcrAdapter } from "../app/lib/server/ocr/local-container";
import { TEXT_FUSION_VERSIONS } from "../app/lib/server/ocr/profiles";
import {
  detectPdfTextProfile,
  extractPdfTextLayers,
} from "../app/lib/server/ocr/pdf-detection";
import {
  runSelectiveLocalOcr,
  type SelectiveOcrRequest,
  type SelectiveOcrOutcome,
} from "../app/lib/server/ocr/selective";
import { createOcrSyntheticFixture } from "../tests/fixtures/ocr-synthetic";

const docker = promisify(execFile);
const imageId = process.argv[2];
assert.ok(
  process.argv.length === 3 ||
    (process.argv.length === 4 && process.argv[3] === "--text-fusion"),
  "Only an explicit image ID and optional --text-fusion are supported.",
);
const textFusion = process.argv[3] === "--text-fusion";
const evaluationConfig = textFusion
  ? { psm: 3 as const, maxDpi: 150 as const, model: "text-fusion" as const }
  : undefined;
assert.match(
  imageId ?? "",
  /^sha256:[a-f0-9]{64}$/,
  "Pass the explicitly built local image ID; this checker never pulls/builds images.",
);

async function ownedContainers() {
  const { stdout } = await docker(
    "docker",
    ["ps", "--all", "--quiet", "--filter", "label=resumide.ocr.attempt"],
    { timeout: 3000 },
  );
  return stdout.trim().split(/\s+/u).filter(Boolean);
}

async function waitForCleanup(baseline: string[]) {
  const until = performance.now() + 7000;
  while (performance.now() < until) {
    const current = await ownedContainers();
    if (current.every((id) => baseline.includes(id))) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    "Owned OCR container cleanup did not complete; no broad cleanup attempted.",
  );
}

async function observeIsolation(
  baseline: string[],
  finished: () => boolean,
  onRunning?: (phase: "render" | "fast" | "best") => void,
) {
  let observed = false;
  while (!finished()) {
    for (const id of (await ownedContainers()).filter(
      (id) => !baseline.includes(id),
    )) {
      let stdout: string;
      try {
        ({ stdout } = await docker(
          "docker",
          [
            "inspect",
            "--format",
            '{"host":{{json .HostConfig}},"user":{{json .Config.User}},"running":{{json .State.Running}}}',
            id,
          ],
          { timeout: 3000, maxBuffer: 32768 },
        ));
      } catch {
        continue; // Exact-ID removal may win this read-only observation race.
      }
      const configuration = JSON.parse(stdout);
      assert.equal(configuration.user, "10001:10001");
      assert.equal(configuration.host.NetworkMode, "none");
      assert.equal(configuration.host.ReadonlyRootfs, true);
      assert.equal(configuration.host.Memory, 1073741824);
      assert.equal(configuration.host.MemorySwap, 1073741824);
      assert.equal(configuration.host.NanoCpus, 2000000000);
      assert.equal(configuration.host.PidsLimit, 64);
      assert.deepEqual(configuration.host.CapDrop, ["ALL"]);
      assert.ok(configuration.host.SecurityOpt.includes("no-new-privileges"));
      assert.equal(configuration.host.LogConfig.Type, "none");
      assert.equal(configuration.host.Binds, null);
      assert.ok(
        configuration.host.Tmpfs["/scratch"].includes("size=268435456"),
      );
      observed = true;
      if (configuration.running && onRunning) {
        try {
          const processes = await docker(
            "docker",
            ["top", id, "-eo", "pid,args"],
            {
              timeout: 3000,
              maxBuffer: 4096,
            },
          );
          if (/\btesseract\b/u.test(processes.stdout))
            onRunning(
              processes.stdout.includes("--tessdata-dir /opt/tessdata-best")
                ? "best"
                : "fast",
            );
          else if (/\bpdftoppm\b/u.test(processes.stdout)) onRunning("render");
        } catch {
          // The bounded engine or exact-ID cleanup can finish before inspection.
          continue;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return observed;
}

// Whitespace-normalized edit distance is engineering smoke evidence only.
function characterErrors(actual: string, expected: string) {
  const chars = Array.from(actual.replace(/\s+/gu, " ").trim());
  const reference = Array.from(expected.replace(/\s+/gu, " ").trim());
  let previous = Array.from({ length: chars.length + 1 }, (_, i) => i);
  reference.forEach((char, i) => {
    const row = [i + 1];
    chars.forEach((other, j) =>
      row.push(
        Math.min(
          row[j] + 1,
          previous[j + 1] + 1,
          previous[j] + Number(char !== other),
        ),
      ),
    );
    previous = row;
  });
  return {
    errors: previous[chars.length],
    referenceCharacters: reference.length,
  };
}

const baseline = await ownedContainers();
const results = [];
let mixedProbe: { request: SelectiveOcrRequest; bytes: Uint8Array } | undefined;
for (const kind of ["scanned", "mixed", "native"] as const) {
  const fixture = createOcrSyntheticFixture(kind);
  const native = await extractPdfTextLayers(fixture.bytes, {
    maxPages: 10,
    maxCharacters: 100_000,
  });
  const profile = detectPdfTextProfile(native);
  const request: SelectiveOcrRequest = {
    schemaVersion: "selective-ocr-request-v1",
    attemptId: randomUUID(),
    ownerId: randomUUID(),
    analysisId: randomUUID(),
    sourceId: randomUUID(),
    createdAt: new Date().toISOString(),
    retentionPolicyId: "synthetic-local-30d/1.0.0",
    sourceSha256: fixture.manifest.sourceSha256,
    nativePageTexts: native.pageTexts,
    limits: { maxCharacters: 100_000, maxPages: 10 },
    selectedPages: profile.pagesNeedingOcr.map((pageNumber) => ({
      pageNumber,
      pageId: `page-${pageNumber}`,
    })),
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
  const original = structuredClone(request.nativePageTexts);
  const started = performance.now();
  let finished = false;
  const controller = new AbortController();
  const pending = runSelectiveLocalOcr(
    request,
    createLocalContainerOcrAdapter({
      bytes: fixture.bytes,
      imageId,
      evaluationConfig,
    }),
    controller.signal,
  ).finally(() => {
    finished = true;
  });
  let isolationObserved: boolean;
  try {
    isolationObserved = await observeIsolation(baseline, () => finished);
  } catch (error) {
    controller.abort();
    await pending;
    await waitForCleanup(baseline);
    throw error;
  }
  const outcome = await pending;
  await waitForCleanup(baseline);
  assert.deepEqual(request.nativePageTexts, original);
  if (kind === "native") {
    assert.equal(outcome.status, "not_needed");
    results.push({
      kind,
      sourceSha256: fixture.manifest.sourceSha256,
      status: outcome.status,
      selectedPages: [],
      wallMs: performance.now() - started,
    });
    continue;
  }
  assert.equal(
    outcome.status,
    "review_required",
    `Real scanned/mixed recognition must produce inspectable evidence, never a score (${outcome.status === "failed" ? outcome.code : outcome.status}).`,
  );
  if (outcome.status !== "review_required")
    throw new Error("Local OCR smoke verification failed.");
  assert.equal(
    isolationObserved,
    true,
    "Actual Docker resource/isolation configuration must be observed.",
  );
  assert.equal(outcome.scoringEligible, false);
  if (textFusion) {
    assert.deepEqual(outcome.provider.versions, TEXT_FUSION_VERSIONS);
    assert.equal(outcome.resourceUsage?.rendererCalls, outcome.pages.length);
    assert.equal(
      outcome.resourceUsage?.recognitionCalls,
      outcome.pages.length * 2,
    );
  }
  assert.deepEqual(
    outcome.pages.map((page) => page.pageNumber),
    profile.pagesNeedingOcr,
  );
  if (kind === "mixed") {
    assert.deepEqual(profile.pagesNeedingOcr, [1, 3]);
    assert.equal(outcome.request.nativePageTexts[1], native.pageTexts[1]);
    mixedProbe = { request, bytes: fixture.bytes };
  }
  results.push({
    kind,
    sourceSha256: fixture.manifest.sourceSha256,
    status: outcome.status,
    selectedPages: profile.pagesNeedingOcr,
    wallMs: performance.now() - started,
    engineDurationMs: outcome.durationMs,
    versions: outcome.provider.versions,
    pages: outcome.pages.map((page) => ({
      pageNumber: page.pageNumber,
      wordCount: page.words.length,
      ...characterErrors(
        page.text,
        fixture.expectedPageTexts[page.pageNumber - 1],
      ),
    })),
    cost: outcome.cost,
    resourceUsage: outcome.resourceUsage,
  });
}
assert.ok(mixedProbe);
const safeFailures = [];
const modes = [
  "cancelled",
  ...(textFusion ? ["cancelled_second_pass" as const] : []),
  "timeout",
  "invalid_pdf",
] as const;
for (const mode of modes) {
  const request: SelectiveOcrRequest = structuredClone(mixedProbe.request);
  request.attemptId = randomUUID();
  request.createdAt = new Date().toISOString();
  let bytes: Uint8Array = mixedProbe.bytes;
  if (mode !== "invalid_pdf") {
    const longScan = createOcrSyntheticFixture("scanned", 10);
    bytes = longScan.bytes;
    request.sourceSha256 = longScan.manifest.sourceSha256;
    request.nativePageTexts = Array.from({ length: 10 }, () => "");
    request.selectedPages = Array.from({ length: 10 }, (_, index) => ({
      pageNumber: index + 1,
      pageId: `page-${index + 1}`,
    }));
  }
  if (mode === "timeout") request.allocation.maxWallTimeMs = 500;
  if (mode === "invalid_pdf") {
    bytes = new TextEncoder().encode("%PDF-1.4\ninvalid synthetic input");
    request.sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  }
  const controller = new AbortController();
  let finished = false;
  let engineObserved = false;
  const started = performance.now();
  const pending: Promise<SelectiveOcrOutcome> = runSelectiveLocalOcr(
    request,
    createLocalContainerOcrAdapter({ bytes, imageId, evaluationConfig }),
    controller.signal,
  ).finally(() => {
    finished = true;
  });
  try {
    await observeIsolation(
      baseline,
      () => finished,
      (phase) => {
        if (mode === "cancelled_second_pass") {
          if (phase === "best") {
            engineObserved = true;
            controller.abort();
          }
        } else if (!textFusion || phase === "fast") {
          engineObserved = true;
          if (mode === "cancelled") controller.abort();
        }
      },
    );
  } catch (error) {
    controller.abort();
    await pending;
    await waitForCleanup(baseline);
    throw error;
  }
  const outcome: SelectiveOcrOutcome = await pending;
  await waitForCleanup(baseline);
  assert.equal(outcome.status, "failed", `Expected safe failure for ${mode}`);
  if (outcome.status !== "failed")
    throw new Error("Expected safe OCR failure.");
  assert.equal(
    outcome.code,
    mode === "invalid_pdf"
      ? "engine_failure"
      : mode === "cancelled_second_pass"
        ? "cancelled"
        : mode,
  );
  if (mode === "cancelled" || mode === "cancelled_second_pass")
    assert.equal(
      engineObserved,
      true,
      "Cancellation must interrupt an observed renderer/OCR process.",
    );
  safeFailures.push({
    mode,
    code: outcome.code,
    engineObserved,
    cleanup: "verified",
    wallMs: performance.now() - started,
  });
}
process.stdout.write(
  JSON.stringify(
    {
      status: "engineering_smoke_passed",
      imageId,
      profile: textFusion ? TEXT_FUSION_VERSIONS.engine : "legacy-fast",
      datasetType: "synthetic_engineering_only",
      partition: "development",
      humanValidation: "not_evaluated",
      calibration: "not_evaluated",
      representativeValidity: "not_evaluated",
      fullAA1Gate: "open",
      accuracyGate: "not_passed",
      cleanup: "no_new_owned_containers_remaining",
      results,
      safeFailures,
    },
    null,
    2,
  ) + "\n",
);
