import { expect, it } from "vitest";
import { loadScoreDiagnostics } from "../../app/lib/server/score-v2-repository";
import { createJdClauseOrderFixture } from "../fixtures/jd-clause-order";
import { createJdClauseOrderStore } from "../fixtures/jd-clause-order-store";
it.each(["normal", "bounded_lines", "single_long_line"] as const)(
  "prepares actual synthetic %s source within the unchanged five-second floor",
  async (variant) => {
    const start = performance.now();
    const prefix =
      variant === "normal"
        ? ""
        : variant === "bounded_lines"
          ? Array(120).fill(" ".repeat(900)).join("\n") + "\n"
          : " ".repeat(100001) + "\n";
    const f = await createJdClauseOrderFixture({
      header: prefix + "Experience\nSoftware Engineer at Orchard Labs",
    });
    const model = await loadScoreDiagnostics(
      createJdClauseOrderStore(f.context).client,
      f.owned.analysisId,
      f.owned.ownerId,
      {},
      undefined,
      { clauseOrderPreview: true },
    );
    expect(model).toHaveProperty("typedCoverage.state", "available");
    expect(model.jdRecommendations).toBeDefined();
    expect(model.jdClauseOrderPlan?.state).toBe(
      variant === "normal" ? "available" : "unavailable",
    );
    expect(model.jdClauseOrderPlan?.reason).toBe(
      variant === "normal" ? null : "unsupported_context",
    );
    expect(performance.now() - start).toBeLessThan(5000);
  },
);

it("prepares a whitespace-heavy source below the default character ceiling without withholding its preview", async () => {
  const start = performance.now();
  const f = await createJdClauseOrderFixture({
    header:
      " ".repeat(90000) + "\nExperience\nSoftware Engineer at Orchard Labs",
  });
  expect(f.text.length).toBeLessThan(100000);
  const model = await loadScoreDiagnostics(
    createJdClauseOrderStore(f.context).client,
    f.owned.analysisId,
    f.owned.ownerId,
    {},
    undefined,
    { clauseOrderPreview: true },
  );
  expect(model).toHaveProperty("typedCoverage.state", "available");
  expect(model.jdRecommendations).toBeDefined();
  expect(model.jdClauseOrderPlan?.state).toBe("available");
  expect(model.jdClauseOrderPlan?.reason).toBeNull();
  expect(performance.now() - start).toBeLessThan(5000);
});
