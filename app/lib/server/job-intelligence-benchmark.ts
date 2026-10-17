import { createHash } from "node:crypto";
import { parseJobRequirements, JD_PARSER_VERSION } from "./job-requirements";
import { mapTaxonomy, type TaxonomyRelease } from "./job-domain";
type GoldRequirement = {
  type: string;
  value: string;
  quote: string;
  importance: string;
};
type Fixture = {
  id: string;
  family: string;
  segment: string;
  text: string;
  gold: readonly GoldRequirement[];
};
const ctx = {
  ownerId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  analysisId: "33333333-3333-4333-8333-333333333333",
  jobId: "44444444-4444-4444-8444-444444444444",
};
const key = (r: { type: string; value: string; quote: string }) =>
  JSON.stringify([r.type, r.value, r.quote]);
export function benchmarkJobIntelligence(
  fixtures: readonly Fixture[],
  mapping?: {
    release: TaxonomyRelease;
    gold: ReadonlyArray<{
      value: string;
      kind: "skill" | "occupation";
      expectedId: string | null;
    }>;
  },
) {
  if (
    !fixtures.length ||
    new Set(fixtures.map((f) => f.id)).size !== fixtures.length
  )
    throw Error("INVALID_JD_BENCHMARK_MANIFEST");
  const documents = fixtures.map((f) => {
    const start = performance.now();
    const r = parseJobRequirements(f.text, ctx);
    const latencyMs = performance.now() - start;
    const actual = r.requirements.map((item) => ({
      type: item.type,
      value: item.value,
      quote: item.evidence.quote,
      importance: item.importance,
    }));
    const expected = new Map(f.gold.map((item) => [key(item), item]));
    const actualMap = new Map(actual.map((item) => [key(item), item]));
    if (expected.size !== f.gold.length) throw Error("DUPLICATE_JD_GOLD");
    const types = [
      ...new Set([...actual.map((x) => x.type), ...f.gold.map((x) => x.type)]),
    ];
    const byType = Object.fromEntries(
      types.map((type) => {
        const a = actual.filter((x) => x.type === type),
          g = f.gold.filter((x) => x.type === type);
        const tp = [...actualMap.values()].filter(
          (x) => x.type === type && expected.has(key(x)),
        ).length;
        return [type, { tp, fp: a.length - tp, fn: g.length - tp }];
      }),
    );
    const importanceByClass = Object.fromEntries(
      ["required", "preferred", "contextual", "unknown"].map((i) => {
        const a = actual.filter((x) => x.importance === i),
          g = f.gold.filter((x) => x.importance === i);
        const tp = [...actualMap.values()].filter(
          (x) => x.importance === i && expected.get(key(x))?.importance === i,
        ).length;
        return [i, { tp, fp: a.length - tp, fn: g.length - tp }];
      }),
    );
    const signature = JSON.stringify(actual);
    const variance = [1, 2].some(
      () =>
        JSON.stringify(
          parseJobRequirements(f.text, ctx).requirements.map((item) => ({
            type: item.type,
            value: item.value,
            quote: item.evidence.quote,
            importance: item.importance,
          })),
        ) !== signature,
    );
    return {
      id: f.id,
      family: f.family,
      segment: f.segment,
      byType,
      importanceByClass,
      citationValid: r.requirements.every(
        (x) =>
          Array.from(f.text)
            .slice(x.evidence.start, x.evidence.end)
            .join("") === x.evidence.quote,
      ),
      citationCount: actual.length,
      citationRecall:
        f.gold.filter((g) => actualMap.has(key(g))).length /
        (f.gold.length || 1),
      abstainedLines: f.text
        .split("\n")
        .filter(
          (line) => line.trim() && !actual.some((a) => a.quote === line.trim()),
        ).length,
      variance,
      latencyMs,
    };
  });
  const metric = (counts: { tp: number; fp: number; fn: number }) => ({
    ...counts,
    precision: counts.tp / (counts.tp + counts.fp || 1),
    recall: counts.tp / (counts.tp + counts.fn || 1),
    f1: (2 * counts.tp) / (2 * counts.tp + counts.fp + counts.fn || 1),
  });
  const segments = [...new Set(documents.map((d) => d.segment))].map(
    (segment) => {
      const subset = documents.filter((d) => d.segment === segment);
      const aggregate = (field: "byType" | "importanceByClass") => {
        const keys = [...new Set(subset.flatMap((d) => Object.keys(d[field])))];
        return Object.fromEntries(
          keys.map((k) => [
            k,
            metric(
              subset.reduce(
                (a, d) => ({
                  tp: a.tp + (d[field][k]?.tp ?? 0),
                  fp: a.fp + (d[field][k]?.fp ?? 0),
                  fn: a.fn + (d[field][k]?.fn ?? 0),
                }),
                { tp: 0, fp: 0, fn: 0 },
              ),
            ),
          ]),
        );
      };
      const typed = aggregate("byType"),
        importance = aggregate("importanceByClass");
      const macro = (m: typeof typed) => {
        const values = Object.values(m).filter((x) => x.tp + x.fp + x.fn > 0);
        return values.reduce((s, x) => s + x.f1, 0) / (values.length || 1);
      };
      return {
        segment,
        documents: subset.length,
        typed,
        importance,
        typedMacroF1: macro(typed),
        importanceMacroF1: macro(importance),
        citationPrecision: subset.every((d) => d.citationValid) ? 1 : 0,
        citationRecall:
          subset.reduce((s, d) => s + d.citationRecall, 0) / subset.length,
        variance: subset.some((d) => d.variance),
      };
    },
  );
  const mappingQuality =
    mapping && mapping.gold.length
      ? {
          total: mapping.gold.length,
          correct: mapping.gold.filter((g) => {
            const r = mapTaxonomy(g.value, g.kind, mapping.release);
            return g.expectedId === null
              ? r.state === "unmapped"
              : r.state === "proposal" && r.candidates[0]?.id === g.expectedId;
          }).length,
          abstentions: mapping.gold.filter(
            (g) =>
              mapTaxonomy(g.value, g.kind, mapping.release).state !==
              "proposal",
          ).length,
          releaseSha256: mapping.release.sha256,
          scope: "exact_or_alias_proposals_only",
        }
      : null;
  return {
    schemaVersion: "job-intelligence-benchmark/1.0.0",
    manifestSha256: createHash("sha256")
      .update(JSON.stringify(fixtures))
      .digest("hex"),
    producerVersion: JD_PARSER_VERSION,
    scope: "known-synthetic-engineering-only",
    documents,
    segments,
    floors: {
      typedMacroF1: 0.95,
      importanceMacroF1: 0.93,
      citationPrecision: 1,
    },
    engineeringPassed: segments.every(
      (s) =>
        s.typedMacroF1 >= 0.95 &&
        s.importanceMacroF1 >= 0.93 &&
        s.citationPrecision === 1 &&
        s.citationRecall >= 0.98 &&
        !s.variance,
    ),
    mappingQuality,
    modelVariance: null,
    mappingReason: mappingQuality ? null : "no_adopted_licensed_taxonomy",
    providerCalls: 0,
    providerCostUsd: 0,
    marketDatasetAvailable: false,
    releasePassed: false,
    releaseBlockers: [
      "representative_corpus_unavailable",
      "independent_annotation_unavailable",
      "domain_pack_review_pending",
      "taxonomy_mapping_validation_unavailable",
      "confidence_uncalibrated",
    ],
    intervals: null,
    intervalReason:
      "two_synthetic_source_families_are_insufficient_for_representative_intervals",
    excludedTypes: ["other"],
  };
}
