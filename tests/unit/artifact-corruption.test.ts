import { expect, it } from "vitest";
import { Worker } from "node:worker_threads";
import { resolve } from "node:path";
import { scoreFixture } from "../fixtures/scoring-v2";
import {
  buildRenderPlan,
  verifyArtifact,
  TEMPLATE,
  type ArtifactObservation,
} from "../../app/lib/server/artifact-contract";
import { renderArtifact } from "../../app/lib/server/artifact-renderer";
async function inspect(
  bytes: Uint8Array,
  plan: ReturnType<typeof buildRenderPlan>,
  options: object,
): Promise<ArtifactObservation> {
  return await new Promise((resolveResult, reject) => {
    const worker = new Worker(
      resolve(process.cwd(), "app/lib/server/artifact-worker.mjs"),
      {
        workerData: {
          plan,
          options,
          verifyBytes: bytes,
          fontPath: resolve(process.cwd(), "assets/fonts/NotoSans-Regular.ttf"),
        },
        env: {},
        execArgv: [],
        resourceLimits: { maxOldGenerationSizeMb: 128 },
      },
    );
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(Error("Parse-back timed out"));
    }, 10000);
    worker.once("message", (value) => {
      clearTimeout(timer);
      void worker.terminate();
      if (value.error) reject(Error(value.error));
      else resolveResult(value.observation);
    });
    worker.once("error", reject);
  });
}
it.each(["pdf", "docx"] as const)(
  "real %s bytes with changed critical content or missing structure lose verified state",
  async (format) => {
    const source = scoreFixture().canonical,
      expected = buildRenderPlan(source);
    const options = {
      versionId: source.versionId,
      format,
      pageSize: "A4" as const,
      templateId: TEMPLATE.id,
    };
    const valid = await renderArtifact(source, options);
    expect(
      verifyArtifact(
        expected,
        options,
        await inspect(valid.bytes!, expected, options),
        valid.bytes!,
        0,
      ).state,
    ).toBe("verified");
    const changed = structuredClone(source),
      phone = changed.facts.find((f) => f.type === "phone")!;
    phone.value = "+91 1111111111";
    phone.confirmation!.value = phone.value;
    const forged = await renderArtifact(changed, options);
    expect(forged.report.state).toBe("verified");
    const observed = await inspect(forged.bytes!, expected, options);
    expect(
      verifyArtifact(expected, options, observed, forged.bytes!, 0).state,
    ).toBe("export_verification_failed");
  },
  30000,
);
