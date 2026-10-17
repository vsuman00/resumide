import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  importTaxonomyRelease,
  mapTaxonomy,
  TaxonomyRegistry,
  domainAvailability,
  marketAvailability,
  FIRST_DOMAIN_PACK,
  domainFromJobTitle,
} from "../../app/lib/server/job-domain";
function fixture(version = "31.0") {
  const raw = JSON.stringify({
    provider: "onet",
    version,
    language: "en",
    sourceUrl: "https://www.onetcenter.org/database.html",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "Synthetic test data; not O*NET content",
    modifications: "Entirely fictional fixture",
    concepts: [
      {
        id: "synthetic-python",
        kind: "skill",
        label: "Python",
        aliases: ["Python programming"],
      },
      {
        id: "synthetic-occupation",
        kind: "occupation",
        label: "Fictional Engineer",
        aliases: [],
      },
    ],
  });
  return {
    raw,
    approval: {
      provider: "onet" as const,
      version,
      sha256: createHash("sha256").update(raw).digest("hex"),
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      reviewId: "synthetic-test-only",
    },
  };
}
describe("taxonomy/domain/market boundaries", () => {
  it("pins release hash/license/version and retains alias wording", () => {
    const f = fixture();
    const release = importTaxonomyRelease(f.raw, f.approval);
    expect(mapTaxonomy("Python programming", "skill", release)).toMatchObject({
      state: "proposal",
      candidates: [
        {
          id: "synthetic-python",
          version: "31.0",
          originalWording: "Python programming",
          derivation: "alias",
        },
      ],
    });
    expect(mapTaxonomy("unlisted", "skill", release).state).toBe("unmapped");
    expect(mapTaxonomy("Python", "skill").state).toBe("unmapped");
  });
  it.each(["sha256", "version", "licenseUrl", "reviewId"])(
    "rejects mismatched %s approval",
    (key) => {
      const f = fixture();
      expect(() =>
        importTaxonomyRelease(f.raw, { ...f.approval, [key]: "" }),
      ).toThrow();
    },
  );
  it("exposes ambiguous aliases and rejects duplicate concept IDs", () => {
    const f = fixture(),
      raw = JSON.parse(f.raw);
    raw.concepts.push({
      id: "other",
      kind: "skill",
      label: "Python",
      aliases: [],
    });
    const bytes = JSON.stringify(raw);
    const r = importTaxonomyRelease(bytes, {
      ...f.approval,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    expect(mapTaxonomy("Python", "skill", r).state).toBe("ambiguous");
    raw.concepts[1].id = raw.concepts[0].id;
    expect(() =>
      importTaxonomyRelease(JSON.stringify(raw), f.approval),
    ).toThrow();
  });
  it("updates and rolls back pinned releases without changing old mappings", () => {
    const a = fixture(),
      b = fixture("32.0"),
      r = new TaxonomyRegistry();
    const key = r.add(importTaxonomyRelease(a.raw, a.approval));
    r.activate(key);
    const old = r.current();
    r.activate(r.add(importTaxonomyRelease(b.raw, b.approval)));
    expect(r.current()?.version).toBe("32.0");
    r.activate(key);
    expect(r.current()).toEqual(old);
  });
  it("keeps the first domain under review and other domains unsupported", () => {
    expect(FIRST_DOMAIN_PACK.scoringEligible).toBe(false);
    expect(domainAvailability("software-engineering", "en-IN")).toBe(
      "review_required",
    );
    expect(domainAvailability("nursing", "en-IN")).toBe("unsupported");
    expect(domainFromJobTitle("Senior Software Engineer")).toBe(
      "software-engineering",
    );
    expect(domainFromJobTitle("Civil Engineer")).toBe("unsupported");
    expect(domainFromJobTitle("Nurse")).toBe("unsupported");
  });
  it("disables market claims without valid permission, review, coverage and expiry", () => {
    expect(marketAvailability(null).available).toBe(false);
    const d = {
      id: "synthetic",
      sourceUrl: "https://example.test",
      license: "synthetic",
      permissionReceipt: "test",
      capturedAt: "2026-10-01T00:00:00Z",
      expiresAt: "2026-10-15T00:00:00Z",
      geography: "IN",
      seniority: "mid",
      occupationVersion: "synthetic/1",
      sampleSize: 10,
      queryVersion: "1",
      biasCoverageReport: "synthetic",
      reviewReceipt: "test",
    };
    const pin = createHash("sha256").update(JSON.stringify(d)).digest("hex");
    expect(marketAvailability(d, new Date("2026-10-12")).available).toBe(false);
    expect(marketAvailability(d, new Date("2026-10-12"), pin).available).toBe(
      true,
    );
    expect(marketAvailability(d, new Date("2026-10-16"), pin).available).toBe(
      false,
    );
    expect(marketAvailability({ ...d, reviewReceipt: "" }).available).toBe(
      false,
    );
  });
});
