/** Bounded, conservative writing diagnostics; no numerical quality score. */
export function checkWritingQuality(proposed: string, source: string) {
  const warnings: string[] = [];
  if (proposed.length > 350)
    warnings.push(
      "Long bullet: consider shortening while preserving every factual claim.",
    );
  if (/\s+[.,;:!?]|[.!?]{2,}|[.!?];/u.test(proposed))
    warnings.push("Review punctuation and sentence flow.");
  const words = proposed.toLocaleLowerCase("en").match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.some((word, i) => i > 0 && word === words[i - 1]))
    warnings.push("Adjacent repeated words need review.");
  const sourceNumbers = new Set(source.match(/\b\d+(?:[.,]\d+)?%?/gu) ?? []);
  const unsupportedNumbers = [
    ...new Set(proposed.match(/\b\d+(?:[.,]\d+)?%?/gu) ?? []),
  ].filter((v) => !sourceNumbers.has(v));
  const sourceLower = source.toLocaleLowerCase("en");
  const newSeniorityTerms = [
    "senior",
    "staff",
    "principal",
    "architect",
  ].filter(
    (term) =>
      new RegExp(`\\b${term}\\b`, "u").test(proposed.toLocaleLowerCase("en")) &&
      !new RegExp(`\\b${term}\\b`, "u").test(sourceLower),
  );
  if (unsupportedNumbers.length)
    warnings.push("A proposed measurement is absent from the source fact.");
  if (newSeniorityTerms.length)
    warnings.push("A proposed seniority term is absent from the source fact.");
  return {
    warnings,
    unsupportedNumbers,
    newSeniorityTerms,
    factualStrength: "candidate-declared; source/domain validation pending",
    domainQuality: null,
  };
}
