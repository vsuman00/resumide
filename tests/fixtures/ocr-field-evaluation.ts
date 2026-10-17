export const OCR_CRITICAL_FIELDS = [
  "name",
  "email",
  "phone",
  "employer",
  "role",
  "dates",
  "education",
  "certification",
] as const;
type Field = (typeof OCR_CRITICAL_FIELDS)[number];
type Span = { id: string; text: string; pageId: string };
type Candidate = {
  field: string;
  value: string;
  evidence: readonly { spanId: string; start: number; end: number }[];
};
type Label = { field: string; value: string; pageNumber: number };
const normalize = (value: string) =>
  value.normalize("NFKC").replace(/\s+/gu, " ").trim();

// Receives real parser predictions. Expected values are used only for one-to-one
// scoring after extraction; duplicates, wrong field/value/page and invalid
// source citations are false positives. No substring-preservation metric.
export function evaluateOcrFields(
  labels: readonly Label[],
  candidates: readonly Candidate[],
  spans: readonly Span[],
) {
  const claimed = new Set<number>();
  const counts = new Map<
    Field,
    { truePositive: number; falsePositive: number; falseNegative: number }
  >(
    OCR_CRITICAL_FIELDS.map((field) => [
      field,
      { truePositive: 0, falsePositive: 0, falseNegative: 0 },
    ]),
  );
  let ungroundedPredictions = 0;
  for (const candidate of candidates) {
    const count = counts.get(candidate.field as Field);
    if (!count) throw new Error("Unknown critical field prediction");
    const references = candidate.evidence.map((reference) => {
      const span = spans.find((source) => source.id === reference.spanId);
      if (
        !span ||
        !Number.isInteger(reference.start) ||
        !Number.isInteger(reference.end) ||
        reference.start < 0 ||
        reference.end <= reference.start ||
        reference.end > Array.from(span.text).length
      )
        return null;
      return {
        text: Array.from(span.text)
          .slice(reference.start, reference.end)
          .join(""),
        pageId: span.pageId,
      };
    });
    const grounded =
      references.length > 0 &&
      references.every((reference) => reference !== null) &&
      normalize(
        references.map((reference) => reference?.text ?? "").join(" "),
      ) === normalize(candidate.value);
    if (!grounded) ungroundedPredictions++;
    const labelIndex = grounded
      ? labels.findIndex(
          (label, index) =>
            !claimed.has(index) &&
            label.field === candidate.field &&
            normalize(label.value) === normalize(candidate.value) &&
            references.every(
              (reference) => reference?.pageId === `page-${label.pageNumber}`,
            ),
        )
      : -1;
    if (labelIndex < 0) count.falsePositive++;
    else {
      claimed.add(labelIndex);
      count.truePositive++;
    }
  }
  labels.forEach((label, index) => {
    const count = counts.get(label.field as Field);
    if (!count) throw new Error("Unknown critical field reference");
    if (!claimed.has(index)) count.falseNegative++;
  });
  const rate = (count: {
    truePositive: number;
    falsePositive: number;
    falseNegative: number;
  }) => ({
    ...count,
    precision:
      count.truePositive + count.falsePositive
        ? count.truePositive / (count.truePositive + count.falsePositive)
        : null,
    recall:
      count.truePositive + count.falseNegative
        ? count.truePositive / (count.truePositive + count.falseNegative)
        : null,
  });
  const perField = OCR_CRITICAL_FIELDS.map((field) => ({
    field,
    ...rate(counts.get(field)!),
  }));
  const total = perField.reduce(
    (sum, count) => ({
      truePositive: sum.truePositive + count.truePositive,
      falsePositive: sum.falsePositive + count.falsePositive,
      falseNegative: sum.falseNegative + count.falseNegative,
    }),
    { truePositive: 0, falsePositive: 0, falseNegative: 0 },
  );
  return {
    ...rate(total),
    ungroundedPredictions,
    referenceCount: labels.length,
    predictionCount: candidates.length,
    perField,
  };
}
