import { describe, expect, it } from "vitest";
import { groundWriterSuggestions } from "../../app/lib/server/writer-grounding";

describe("rewrite grounding regressions", () => {
  it("does not treat a smaller number as evidence because it is a substring", () => {
    const original = "Improved throughput by 120%.";
    expect(
      groundWriterSuggestions(
        {
          summary: null,
          bullets: [
            {
              original,
              rewrite: "Improved throughput by 20%.",
              reasoning: "Clarifies the result.",
            },
          ],
        },
        original,
      ).bullets,
    ).toEqual([]);
  });
  it("retains a factual rewrite with a sentence-initial editorial explanation", () => {
    const original =
      "Built React services with PostgreSQL and reduced latency by 20%.";
    const writer = {
      summary: null,
      bullets: [
        {
          original,
          rewrite:
            "Developed React services with PostgreSQL; reduced latency by 20%.",
          reasoning:
            "Emphasizes the existing technical contribution without adding claims.",
        },
      ],
    };
    expect(groundWriterSuggestions(writer, original).bullets).toHaveLength(1);
  });
  it("does not borrow a metric or technology from a different contribution", () => {
    const original = "Built React services.";
    const writer = {
      summary: null,
      bullets: [
        {
          original,
          rewrite:
            "Built React services with PostgreSQL and reduced latency by 20%.",
          reasoning: "Makes the source clearer.",
        },
      ],
    };
    expect(
      groundWriterSuggestions(
        writer,
        original +
          "\nMaintained PostgreSQL reporting and reduced latency by 20%.",
      ).bullets,
    ).toEqual([]);
  });
});
