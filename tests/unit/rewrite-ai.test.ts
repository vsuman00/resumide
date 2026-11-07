import { expect, it, vi } from "vitest";
import {
  generateGroundedRewrite,
  type RewriteTransport,
} from "../../app/lib/server/rewrite-ai";
import { buildRewriteSources } from "../../app/lib/server/rewrite-sources";
import { resolveWriterProposals } from "../../app/lib/server/writer-proposals";

const source =
  "Experience\n– Built React services with PostgreSQL;\nreduced latency by 20%.\nProjects\n– Maintained Python tools for reporting.";
const request = {
  resumeText: source,
  jobTitle: "Engineer",
  jobDescription: "React, PostgreSQL, AWS and Kubernetes",
  idempotencyKey: "synthetic-rewrite",
};
const output = {
  summary: null,
  bullets: [
    {
      sourceId: 0,
      rewrite:
        "Developed React services with PostgreSQL; reduced latency by 20%.",
      reasoning: "Clarifies the existing contribution and measured result.",
    },
  ],
};
const transport = (value: unknown = output): RewriteTransport => ({
  execute: vi.fn().mockResolvedValue({
    output: value,
    usage: { inputTokens: 100, outputTokens: 200 },
  }),
});
it("binds model source IDs to exact wrapped source and retains useful factual wording", async () => {
  const result = await generateGroundedRewrite(request, transport(), 100);
  expect(result.writer.bullets).toHaveLength(1);
  expect(result.writer.bullets[0].original).toBe(
    "– Built React services with PostgreSQL;\nreduced latency by 20%.",
  );
  expect(source.includes(result.writer.bullets[0].original)).toBe(true);
  expect(result.usage.outputTokens).toBe(200);
});
it("does not combine a following heading or unrelated contribution", () => {
  const sources = buildRewriteSources(source);
  expect(sources).toHaveLength(2);
  expect(sources[0].text).not.toContain("Projects");
  expect(sources[1].text).not.toContain("React");
});
it("rejects invented metrics and skills from the JD", async () => {
  const result = await generateGroundedRewrite(
    request,
    transport({
      ...output,
      bullets: [
        {
          ...output.bullets[0],
          rewrite:
            "Built React services with AWS and Kubernetes; reduced latency by 99%.",
        },
      ],
    }),
    100,
  );
  expect(result.writer.bullets).toEqual([]);
});
it("rejects invented source IDs, duplicate references and numeric score fields", async () => {
  expect(
    resolveWriterProposals(
      {
        ...output,
        bullets: [
          output.bullets[0],
          output.bullets[0],
          { ...output.bullets[0], sourceId: 31 },
        ],
      },
      buildRewriteSources(source),
    ).bullets,
  ).toHaveLength(1);
  await expect(
    generateGroundedRewrite(request, transport({ ...output, score: 100 }), 100),
  ).rejects.toMatchObject({ code: "AI_OUTPUT_INVALID" });
});
it("handles missing source, provider refusal and a bounded timeout", async () => {
  expect(buildRewriteSources("")).toEqual([]);
  const refusal = transport();
  vi.mocked(refusal.execute).mockResolvedValue({
    output,
    refused: true,
    usage: { inputTokens: 1, outputTokens: 1 },
  });
  await expect(
    generateGroundedRewrite(request, refusal, 100),
  ).rejects.toMatchObject({ code: "AI_REFUSED" });
  const hanging = transport();
  vi.mocked(hanging.execute).mockImplementation(
    () => new Promise(() => undefined),
  );
  await expect(
    generateGroundedRewrite(request, hanging, 5),
  ).rejects.toMatchObject({ code: "AI_TIMEOUT" });
});
