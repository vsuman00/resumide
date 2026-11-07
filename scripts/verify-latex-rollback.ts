import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  buildLatexContainerArgs,
  compileLatex,
} from "../app/lib/server/latex-sandbox";
import { prepareLatexDocument } from "../app/lib/server/latex-source";
import {
  assertLatexIsolation,
  assertNoOwnedContainers,
  docker,
} from "./latex-test-fixtures";
import { SYNTHETIC_LATEX } from "../tests/fixtures/latex";

const imageId = process.argv.find((arg) => arg.startsWith("sha256:")) ?? "";
assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
const prepared = prepareLatexDocument({
  source: SYNTHETIC_LATEX,
  profile: "document",
});
const childEnvironment = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  AI_ENABLED: "false",
  ...(process.env.RESUMIDE_PRIVATE_VERIFY === undefined
    ? {}
    : { RESUMIDE_PRIVATE_VERIFY: process.env.RESUMIDE_PRIVATE_VERIFY }),
};
function node(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      process.execPath,
      args,
      {
        env: childEnvironment,
        timeout: 40000,
        maxBuffer: 131072,
      },
      (error, stdout) => {
        if (error) reject(Error("Isolated rollback verification failed"));
        else resolve(stdout);
      },
    );
  });
}

if (process.argv.includes("--fresh")) {
  await assertNoOwnedContainers();
  const result = await compileLatex(prepared, { imageId });
  assert.ok(result.pdf.byteLength > 0);
  await assertNoOwnedContainers();
  process.stdout.write(
    JSON.stringify({
      freshProcessCompile: "pass",
      pdfBytes: result.pdf.byteLength,
      pages: result.pages,
      pdfSha256: createHash("sha256").update(result.pdf).digest("hex"),
    }) + "\n",
  );
} else {
  await assertNoOwnedContainers();
  // The flag-off stage exercises the real Request/Response service boundary
  // with mocked identity/storage/compiler; it is not a live HTTP acceptance test.
  await node([
    "node_modules/vitest/vitest.mjs",
    "run",
    "tests/unit/latex-service.test.ts",
    "-t",
    "keeps disabled converter unavailable for compilation",
  ]);
  const name = `resumide-latex-${randomUUID()}`;
  let cleanupVerified = false;
  try {
    const args = buildLatexContainerArgs(name, imageId);
    const created = await docker(["create", ...args.slice(1)]);
    assert.equal(created.code, 0);
    const containerId = created.stdout.trim();
    assert.match(containerId, /^[a-f0-9]{64}$/);
    const inspected = await docker(["inspect", containerId]);
    assert.equal(inspected.code, 0);
    const container = JSON.parse(inspected.stdout)[0];
    assertLatexIsolation(container);
    assert.equal(container.State.Running, false);
    await assert.rejects(compileLatex(prepared, { imageId }), {
      code: "cleanup_failed",
    });
    const retained = await docker([
      "ps",
      "-aq",
      "--no-trunc",
      "--filter",
      "label=resumide.latex.service=converter",
    ]);
    assert.equal(retained.code, 0);
    assert.equal(retained.stdout.trim(), containerId);
    const removed = await docker(["rm", "-f", containerId]);
    assert.equal(removed.code, 0);
    await assertNoOwnedContainers();
    cleanupVerified = true;
    // Removing the exact abandoned resource does not silently clear process quarantine.
    await assert.rejects(compileLatex(prepared, { imageId }), {
      code: "cleanup_failed",
    });
    await assertNoOwnedContainers();
  } finally {
    if (!cleanupVerified) {
      const removed = await docker(["rm", "-f", name]);
      assert.ok(
        removed.code === 0 ||
          /No such (object|container)/i.test(removed.stderr),
      );
      await assertNoOwnedContainers();
    }
  }
  const fresh = JSON.parse(
    await node([
      "node_modules/vite-node/vite-node.mjs",
      "--config",
      "vitest.config.ts",
      fileURLToPath(import.meta.url),
      "--fresh",
      imageId,
    ]),
  );
  assert.equal(fresh.freshProcessCompile, "pass");
  await assertNoOwnedContainers();
  process.stdout.write(
    JSON.stringify(
      {
        imageId,
        flagOffUnitHttpBoundary: "pass",
        stoppedOwnedContainerRefusesAdmission: "pass",
        exactOwnedContainerRemoved: "pass",
        sameProcessRetainsQuarantine: "pass",
        ...fresh,
        ownedContainersRemaining: 0,
      },
      null,
      2,
    ) + "\n",
  );
}
