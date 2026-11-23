import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertNoOwnedContainers,
  docker,
  rawLatexAttempt,
} from "./latex-test-fixtures";

const handoff = "tasks/agent-handoffs/2026-11-09-reliability-implementation";
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const buildOutcomeSha256 =
  "b9afe420a6f1eacb7b50a9002c12a6cfbbd8b9531afff7cf7fb6292f7e321f81";

async function artifact(dir: string, name: string, limit: number) {
  const file = await open(
    join(dir, name),
    constants.O_RDONLY | constants.O_NONBLOCK,
  );
  try {
    const info = await file.stat();
    assert(info.isFile() && info.size > 0 && info.size <= limit, name);
    const bytes = Buffer.alloc(info.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    assert.equal(offset, info.size, name);
    return bytes.subarray(0, offset);
  } finally {
    await file.close();
  }
}

export async function verifyLocalPdfAdmission(
  imageId: string,
  directory: string,
) {
  const flattened = JSON.parse(
    await readFile(join(handoff, "cr-r18-flattened-latex-worker.json"), "utf8"),
  );
  assert.equal(
    imageId,
    flattened.candidateBuild.imageId,
    "unreviewed local PDF image",
  );
  const packageEvidence = await readFile(
    join(handoff, "cr-r18-poppler-local-pdf-worker.json"),
  );
  assert.equal(sha(packageEvidence), flattened.predecessorEvidenceSha256);
  const { native } = JSON.parse(packageEvidence.toString("utf8"));
  assert.equal(
    native.receiptSha256,
    flattened.candidateBuild.packageBuildReceiptSha256,
  );
  const names = {
    source: "source-and-test-receipt.json",
    original: "local-pdf-legacy-signature.xml",
    normalized: "upstream-junit.xml",
    binding: "candidate-signature-binding.json",
    acceptance: "local-pdf-signature-acceptance.json",
    outcome: "build-outcome.json",
  } as const;
  const [source, original, normalized, binding, acceptance, outcome] =
    await Promise.all([
      artifact(directory, names.source, 65536),
      artifact(directory, names.original, 65536),
      artifact(directory, names.normalized, 131072),
      artifact(directory, names.binding, 65536),
      artifact(directory, names.acceptance, 4096),
      artifact(directory, names.outcome, 131072),
    ]);
  assert.equal(sha(source), native.receiptSha256, "source and test receipt");
  assert.equal(
    sha(original),
    native.originalFixtureControl.junitSha256,
    "original signature control",
  );
  assert.equal(
    sha(normalized),
    native.paddingNormalizedCtest.junitSha256,
    "normalized suite",
  );
  assert.equal(
    sha(binding),
    native.paddingNormalizedCtest.bindingSha256,
    "signature binding",
  );
  assert.equal(sha(outcome), buildOutcomeSha256, "build outcome");
  assert.deepEqual(JSON.parse(acceptance.toString("utf8")), {
    originalFixtureRestored: true,
    upstreamJunitSha256: sha(normalized),
    pgpBackendsPassed: ["gpg", "nss"],
  });
  const sourceReceipt = JSON.parse(source.toString("utf8"));
  const buildOutcome = JSON.parse(outcome.toString("utf8"));
  assert.equal(buildOutcome.failure, null);
  assert.equal(buildOutcome.runtimeAdopted, false);
  assert.deepEqual(
    buildOutcome.candidateSignatureBinding,
    JSON.parse(binding.toString("utf8")),
  );
  assert.deepEqual(buildOutcome.upstream, sourceReceipt.upstream);
  assert.equal(native.originalFullCtest.acceptedUnderE010, false);
  assert.equal(native.originalFullCtest.passed, 70);
  assert.equal(native.originalFullCtest.tests, 71);

  await assertNoOwnedContainers();
  const inspect = await docker(
    ["image", "inspect", imageId],
    undefined,
    65536,
    5000,
  );
  assert.equal(inspect.code, 0);
  const [image] = JSON.parse(inspect.stdout);
  assert.equal(image.Id, imageId);
  assert.equal(`${image.Os}/${image.Architecture}`, "linux/arm64");
  const expected = flattened.rootfs.candidate;
  assert.deepEqual(image.Config, expected.runtimeConfig);
  assert.deepEqual(
    image.RootFS.Layers,
    expected.layers.map((layer: { diffId: string }) => layer.diffId),
  );

  const [probeSource, suiteSource] = await Promise.all([
    readFile("scripts/latex-runtime/verify-native-frame.py", "utf8"),
    readFile("scripts/latex-runtime/native-poppler/verify_consumer.py", "utf8"),
  ]);
  const frame = await rawLatexAttempt(imageId, "", {
    entrypoint: "/usr/bin/python3",
    args: ["-I", "-B", "-c", probeSource, "--local-pdf"],
    input: JSON.stringify({
      suiteSource,
      localPdfSourceReceipt: source.toString("utf8"),
    }),
  });
  assert.equal(frame.value.passed, true);
  assert.equal(frame.value.protocol, "RESUMIDE_BBOX/1");
  assert.equal(frame.value.sourceReceiptSha256, sha(source));
  assert.equal(frame.value.consumerSuite.cases, 107);
  assert.equal(frame.value.temporaryFilesRemoved, true);
  assert.deepEqual(frame.value.originalSignatureClass, {
    actualExitCode: 8,
    junitSha256: sha(original),
  });
  assert.deepEqual(frame.value.paddingNormalizedSuite, {
    passed: 71,
    qtClasses: 56,
    junitSha256: sha(normalized),
  });

  const confinement = await rawLatexAttempt(imageId, "", {
    entrypoint: "/opt/latex/confine",
    args: ["--probe"],
  });
  assert(confinement.value.abi >= 6);
  assert.deepEqual(confinement.value, {
    abi: confinement.value.abi,
    deniedReads: 2,
    approvedRead: 1,
    scratchWrite: 1,
    outsideWriteDenied: 1,
    shellExecDenied: 1,
  });
  await assertNoOwnedContainers();
  return [
    { name: "flattened-local-pdf-native-admission", ...frame.value },
    { name: "actual-landlock-rights-and-exec", ...confinement.value },
  ];
}
