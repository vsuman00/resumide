import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { LATEX_LIMITS } from "../app/lib/latex-converter";
import {
  compileLatex,
  LatexSandboxError,
} from "../app/lib/server/latex-sandbox";
import {
  LatexSourceError,
  prepareLatexDocument,
} from "../app/lib/server/latex-source";
import {
  inspectLatexPdf,
  LATEX_EXPECTED_ORDER,
  SYNTHETIC_LATEX,
} from "../tests/fixtures/latex";
import {
  assertNoOwnedContainers,
  docker,
  rawLatexAttempt,
} from "./latex-test-fixtures";

const pageText = (page: number) => `Boundary fixture page ${page}.`;

function documentWithPages(pages: number) {
  const body = Array.from({ length: pages }, (_, i) => pageText(i + 1)).join(
    "\n\\newpage\n",
  );
  return `\\documentclass{article}\n\\pagestyle{empty}\n\\begin{document}\n${body}\n\\end{document}\n`;
}

function padWithComments(source: string, bytes: number) {
  // Use bounded ordinary UTF-8 comment lines so the visible pages stay small.
  const comment = "%" + "é".repeat(120) + "\n";
  const prefix = comment.repeat(
    Math.floor(
      (bytes - Buffer.byteLength(source) - 2) / Buffer.byteLength(comment),
    ),
  );
  const remaining = bytes - Buffer.byteLength(prefix + source);
  return prefix + "%" + " ".repeat(remaining - 2) + "\n" + source;
}

const prepare = (source: string) =>
  prepareLatexDocument({ source, profile: "document" });

async function localDockerHost(imageId: string) {
  assert.match(imageId, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(process.env.DOCKER_HOST, undefined);
  assert.equal(process.env.DOCKER_CONTEXT, undefined);
  const context = await docker(
    ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
    undefined,
    4096,
    5000,
  );
  const host = context.stdout.trim();
  assert.equal(context.code, 0);
  assert.match(host, /^unix:\/\/\/[^\r\n]+$/u);
  await assertNoOwnedContainers(host);
  return host;
}

export async function verifyLatexBoundaries(imageId: string) {
  const host = await localDockerHost(imageId);
  process.env.DOCKER_HOST = host;
  try {
    const source = padWithComments(
      documentWithPages(LATEX_LIMITS.pages),
      LATEX_LIMITS.sourceBytes,
    );
    assert.equal(Buffer.byteLength(source), LATEX_LIMITS.sourceBytes);
    const maximum = prepare(source);
    assert.equal(maximum.source, source);
    const tooLarge = source + " ";
    assert.equal(Buffer.byteLength(tooLarge), LATEX_LIMITS.sourceBytes + 1);
    assert(tooLarge.length < LATEX_LIMITS.sourceBytes);
    assert.throws(
      () => prepare(tooLarge),
      (error) =>
        error instanceof LatexSourceError && error.code === "source_too_large",
    );
    await assertNoOwnedContainers(host);

    const compiled = await compileLatex(maximum, { imageId });
    const pdf = await inspectLatexPdf(compiled.pdf);
    assert.equal(compiled.pages, LATEX_LIMITS.pages);
    assert.equal(pdf.pages, LATEX_LIMITS.pages);
    assert.equal(
      pdf.text,
      Array.from({ length: pdf.pages }, (_, i) => pageText(i + 1)).join(" "),
    );
    await assertNoOwnedContainers(host);

    const overflow = prepare(documentWithPages(LATEX_LIMITS.pages + 1));
    await assert.rejects(
      compileLatex(overflow, { imageId }),
      (error) =>
        error instanceof LatexSandboxError && error.code === "output_invalid",
    );
    await assertNoOwnedContainers(host);

    const recovered = await compileLatex(prepare(documentWithPages(1)), {
      imageId,
    });
    const recoveryPdf = await inspectLatexPdf(recovered.pdf);
    assert.equal(recovered.pages, 1);
    assert.equal(recoveryPdf.pages, 1);
    assert.equal(recoveryPdf.text, pageText(1));
    return [
      {
        name: "source-byte-limit-plus-one",
        pass: true,
        sourceBytes: Buffer.byteLength(tooLarge),
        code: "source_too_large",
      },
      {
        name: "exact-source-and-page-limits",
        pass: true,
        sourceBytes: Buffer.byteLength(source),
        pages: pdf.pages,
        pdfBytes: compiled.pdf.byteLength,
        pdfSha256: createHash("sha256").update(compiled.pdf).digest("hex"),
      },
      {
        name: "page-limit-plus-one",
        pass: true,
        requestedPages: LATEX_LIMITS.pages + 1,
        code: "output_invalid",
      },
      {
        name: "same-process-boundary-recovery",
        pass: true,
        pages: recoveryPdf.pages,
        pdfSha256: createHash("sha256").update(recovered.pdf).digest("hex"),
      },
    ];
  } finally {
    delete process.env.DOCKER_HOST;
    await assertNoOwnedContainers(host);
  }
}

export async function verifyLatexOutputCeiling(imageId: string) {
  const host = await localDockerHost(imageId);
  const script = await readFile(
    "scripts/latex-runtime/verify-pdf-output-ceiling.py",
    "utf8",
  );
  const supervisorSha256 = createHash("sha256")
    .update(await readFile("scripts/latex-runtime/supervisor.py"))
    .digest("hex");
  const source = prepare(
    documentWithPages(1).replace(
      pageText(1),
      "Neutral output boundary fixture.",
    ),
  ).source;
  try {
    const checks = [];
    for (const bytes of [LATEX_LIMITS.pdfBytes, LATEX_LIMITS.pdfBytes + 1]) {
      const { value } = await rawLatexAttempt(imageId, source, {
        entrypoint: "/usr/bin/python3",
        args: ["-c", script, String(bytes)],
        input: JSON.stringify({ source }),
        host,
      });
      assert.equal(value.outputBytes, bytes);
      assert.equal(value.paddingRuns, 1);
      assert.equal(value.supervisorSha256, supervisorSha256);
      if (bytes === LATEX_LIMITS.pdfBytes) {
        assert.equal(value.outputReads, 1);
        assert.equal(value.textRuns, 1);
        assert.equal(value.pages, 1);
        assert.match(value.pdfSha256, /^[a-f0-9]{64}$/u);
      } else {
        assert.equal(value.outputReads, 0);
        assert.equal(value.textRuns, 0);
        assert.equal(value.code, "output_invalid");
      }
      checks.push({
        name:
          bytes === LATEX_LIMITS.pdfBytes
            ? "exact-pdf-output-byte-ceiling"
            : "pdf-output-byte-ceiling-plus-one",
        pass: true,
        ...value,
      });
      await assertNoOwnedContainers(host);
    }
    return checks;
  } finally {
    await assertNoOwnedContainers(host);
  }
}

export async function verifyLatexResourceSettings(imageId: string) {
  const host = await localDockerHost(imageId);
  const probe = await readFile(
    "scripts/latex-runtime/verify-resource-settings.py",
    "utf8",
  );
  try {
    const { value } = await rawLatexAttempt(imageId, "", {
      entrypoint: "/usr/bin/python3",
      args: ["-c", probe],
      host,
    });
    assert(Number.isSafeInteger(value.cpuPeriodMicros));
    assert(value.cpuPeriodMicros > 0);
    assert.equal(value.cpuQuotaMicros, 2 * value.cpuPeriodMicros);
    assert.deepEqual(value.cpuTimeLimitSeconds, [10, 10]);
    assert.equal(value.memoryMaxBytes, 512 * 1024 * 1024);
    assert.equal(value.swapMaxBytes, 0);
    assert.equal(value.pidsMax, 64);
    assert.equal(value.childProcessesBeforeDenial, 63);
    assert.deepEqual(value.descriptorLimit, [64, 64]);
    assert.equal(value.openDescriptorsBeforeDenial, 61);
    assert.equal(value.fileSizeLimitBytes, 8 * 1024 * 1024);
    assert.equal(value.fileSizePlusOneDenied, true);
    assert.equal(value.scratchCapacityBytes, 128 * 1024 * 1024);
    assert.equal(value.scratchNoExec, true);
    assert.equal(value.scratchNoDevice, true);
    assert.equal(value.scratchNoSetUid, true);
    assert.equal(value.rootReadOnly, true);
    assert(value.interfaces.includes("lo"));
    assert.deepEqual(value.interfacesUp, ["lo"]);
    assert.equal(value.nonLoopbackIpv4RouteCount, 0);
    assert.equal(value.nonLoopbackIpv6RouteCount, 0);
    assert.equal(value.routeDeniedWithoutSending, true);
    assert.equal(value.uid, 65532);
    assert.equal(value.gid, 65532);
    assert.equal(value.effectiveCapabilities, 0);
    assert.equal(value.noNewPrivileges, 1);
    assert.equal(value.seccompMode, 2);
    return [
      { name: "effective-worker-resource-settings", pass: true, ...value },
    ];
  } finally {
    await assertNoOwnedContainers(host);
  }
}

export async function verifyLatexResourceSaturation(imageId: string) {
  const host = await localDockerHost(imageId);
  const probe = await readFile(
    "scripts/latex-runtime/verify-resource-saturation.py",
    "utf8",
  );
  try {
    const { value } = await rawLatexAttempt(imageId, "", {
      entrypoint: "/usr/bin/python3",
      args: ["-c", probe],
      host,
    });
    assert.equal(value.memoryChildSignal, 9);
    assert.equal(value.localOomKills, 1);
    assert.equal(value.cpuChildSignal, 9);
    assert(value.cpuChildSeconds >= 9.5 && value.cpuChildSeconds < 11);
    assert.equal(value.scratchAllocatedBytes, 128 * 1024 * 1024);
    assert.equal(value.extraScratchBlockDenied, true);
    assert.equal(value.scratchRecovered, true);
    return [{ name: "exact-worker-resource-saturation", pass: true, ...value }];
  } finally {
    await assertNoOwnedContainers(host);
  }
}

export async function verifyLatexPdfMockBoundaries(
  imageId: string,
  host?: string,
) {
  const probe = await readFile(
    "scripts/latex-runtime/verify-image-boundaries-mock.py",
    "utf8",
  );
  const { value } = await rawLatexAttempt(imageId, "", {
    entrypoint: "/usr/bin/python3",
    args: ["-I", "-B", "-c", probe],
    host,
  });
  assert.equal(value.cases, 5);
  assert.equal(value.passed, true);
  assert.deepEqual(value.attempts, {
    originalEncodedData: 0,
    imageDecoder: 0,
    inlineScanner: 0,
  });
  assert.equal(value.pdfBytesGenerated, false);
  assert.equal(value.realPdfReaderCalled, false);
  assert.equal(value.nativeDecoderExecuted, false);
  assert.equal(value.checks.length, value.cases);
  for (const item of value.checks) {
    assert.equal(item.pass, true, item.name);
    assert.equal(item.configurationRestored, true, item.name);
    assert.equal(item.getDataHookRestored, true, item.name);
    assert.equal(item.inlineHookRestored, true, item.name);
  }
  return {
    name: "pdf-image-boundaries-mock-policy-checks",
    probeSha256: createHash("sha256").update(probe).digest("hex"),
    ...value,
  };
}

export async function verifyLatexPdfPolicy(imageId: string) {
  const host = await localDockerHost(imageId);
  const probe = await readFile(
    "scripts/latex-runtime/verify-pdf-structural-policy.py",
    "utf8",
  );
  const inspectorSha256 = createHash("sha256")
    .update(await readFile("scripts/latex-runtime/inspect_pdf.py"))
    .digest("hex");
  process.env.DOCKER_HOST = host;
  try {
    const { value } = await rawLatexAttempt(imageId, "", {
      entrypoint: "/usr/bin/python3",
      args: ["-c", probe],
      host,
    });
    assert.equal(value.inspectorSha256, inspectorSha256);
    assert(Array.isArray(value.checks));
    assert.equal(value.checks.length, 16);
    assert.equal(value.checks.filter((item) => item.pages === 1).length, 4);
    assert.equal(value.checks.filter((item) => item.rejected).length, 12);
    await assertNoOwnedContainers(host);

    const mockBoundaries = await verifyLatexPdfMockBoundaries(imageId, host);
    await assertNoOwnedContainers(host);

    const rendered = await compileLatex(prepare(SYNTHETIC_LATEX), { imageId });
    const pdf = await inspectLatexPdf(rendered.pdf);
    assert.equal(rendered.pages, 2);
    assert.equal(pdf.pages, 2);
    assert.deepEqual(pdf.links, ["https://example.org/reference"]);
    let position = -1;
    for (const phrase of LATEX_EXPECTED_ORDER) {
      position = pdf.text.indexOf(phrase, position + 1);
      assert(position >= 0, "Rendered PDF changed the fixture's text order");
    }
    return [
      { name: "exact-worker-structural-pdf-policy", pass: true, ...value },
      { ...mockBoundaries, pass: true },
      {
        name: "exact-worker-rendered-links-and-order",
        pass: true,
        pages: pdf.pages,
        safeLinks: pdf.links.length,
        orderedTextChecks: LATEX_EXPECTED_ORDER.length,
        pdfSha256: createHash("sha256").update(rendered.pdf).digest("hex"),
      },
    ];
  } finally {
    delete process.env.DOCKER_HOST;
    await assertNoOwnedContainers(host);
  }
}
