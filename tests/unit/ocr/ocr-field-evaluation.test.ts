import { describe, expect, it } from "vitest";
import { evaluateOcrFields } from "../../fixtures/ocr-field-evaluation";
const spans = [
  {
    id: "s1",
    text: "Demo Candidate\nRole Software Engineer",
    pageId: "page-1",
  },
];
const labels = [
  { field: "name", value: "Demo Candidate", pageNumber: 1 },
  { field: "role", value: "Software Engineer", pageNumber: 1 },
];
const name = {
  field: "name",
  value: "Demo Candidate",
  evidence: [{ spanId: "s1", start: 0, end: 14 }],
};
describe("grounded structured OCR field evaluation", () => {
  it("penalizes absent fields rather than treating preserved text as extraction", () => {
    expect(evaluateOcrFields(labels, [name], spans)).toMatchObject({
      truePositive: 1,
      falsePositive: 0,
      falseNegative: 1,
      precision: 1,
      recall: 0.5,
    });
  });
  it("counts duplicate predictions, wrong semantic fields and source citation failures", () => {
    const wrongField = { ...name, field: "role" };
    const wrongCitation = {
      ...name,
      evidence: [{ spanId: "s1", start: 1, end: 15 }],
    };
    expect(
      evaluateOcrFields(labels, [name, name, wrongField, wrongCitation], spans),
    ).toMatchObject({
      truePositive: 1,
      falsePositive: 3,
      falseNegative: 1,
      precision: 0.25,
      recall: 0.5,
      ungroundedPredictions: 1,
    });
  });
  it("rejects citations to the wrong page and invalid unicode-code-point bounds", () => {
    expect(
      evaluateOcrFields([{ ...labels[0], pageNumber: 2 }], [name], spans),
    ).toMatchObject({ truePositive: 0, falsePositive: 1, falseNegative: 1 });
    expect(
      evaluateOcrFields(
        labels,
        [{ ...name, evidence: [{ spanId: "s1", start: -1, end: 14 }] }],
        spans,
      ).ungroundedPredictions,
    ).toBe(1);
    expect(evaluateOcrFields(labels, [], spans).precision).toBeNull();
  });
  it("measures both facts only after actual typed, grounded extraction", () => {
    expect(
      evaluateOcrFields(
        labels,
        [
          name,
          {
            field: "role",
            value: "Software Engineer",
            evidence: [{ spanId: "s1", start: 20, end: 37 }],
          },
        ],
        spans,
      ),
    ).toMatchObject({
      truePositive: 2,
      falsePositive: 0,
      falseNegative: 0,
      precision: 1,
      recall: 1,
    });
  });
});
