import { createHash } from "node:crypto";
import { z } from "zod";
import { SOFTWARE_SKILLS } from "./job-requirements";

const ConceptSchema = z.strictObject({
  id: z.string().min(1).max(200),
  kind: z.enum(["skill", "occupation"]),
  label: z.string().trim().min(1).max(200),
  aliases: z.array(z.string().trim().min(1).max(200)).max(30),
});
const TaxonomySchema = z
  .strictObject({
    provider: z.enum(["onet", "esco"]),
    version: z.string().regex(/^\d+\.\d+(?:\.\d+)?$/u),
    language: z.literal("en"),
    sourceUrl: z.url(),
    licenseUrl: z.url(),
    attribution: z.string().min(1).max(1000),
    modifications: z.string().min(1).max(1000),
    concepts: z.array(ConceptSchema).max(100000),
  })
  .superRefine((r, c) => {
    if (new Set(r.concepts.map((x) => x.id)).size !== r.concepts.length)
      c.addIssue({ code: "custom", message: "Duplicate concept IDs" });
    const host = new URL(r.sourceUrl).hostname;
    if (
      r.provider === "onet"
        ? !["www.onetcenter.org", "onetcenter.org"].includes(host)
        : host !== "esco.ec.europa.eu"
    )
      c.addIssue({ code: "custom", message: "Official source required" });
  });
export type TaxonomyRelease = z.infer<typeof TaxonomySchema> & {
  sha256: string;
  reviewId: string;
};
export function importTaxonomyRelease(
  bytes: string,
  approval: {
    provider: "onet" | "esco";
    version: string;
    sha256: string;
    licenseUrl: string;
    reviewId: string;
  },
): TaxonomyRelease {
  if (Buffer.byteLength(bytes) > 32 * 1024 * 1024)
    throw new Error("TAXONOMY_SIZE_LIMIT");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const release = TaxonomySchema.parse(JSON.parse(bytes));
  if (
    sha256 !== approval.sha256 ||
    release.provider !== approval.provider ||
    release.version !== approval.version ||
    release.licenseUrl !== approval.licenseUrl ||
    !approval.reviewId.trim()
  )
    throw new Error("TAXONOMY_PIN_MISMATCH");
  return structuredClone({ ...release, sha256, reviewId: approval.reviewId });
}
export function mapTaxonomy(
  value: string,
  kind: "skill" | "occupation",
  release?: TaxonomyRelease,
) {
  if (!release)
    return {
      state: "unmapped" as const,
      candidates: [],
      confidence: { kind: "uncalibrated" as const, value: null },
    };
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("en");
  const matches = release.concepts.filter(
    (c) =>
      c.kind === kind &&
      [c.label, ...c.aliases].some(
        (v) =>
          v.normalize("NFKC").trim().toLocaleLowerCase("en") === normalized,
      ),
  );
  return {
    state:
      matches.length === 1
        ? ("proposal" as const)
        : matches.length
          ? ("ambiguous" as const)
          : ("unmapped" as const),
    candidates: matches.map((c) => ({
      id: c.id,
      provider: release.provider,
      version: release.version,
      sha256: release.sha256,
      originalWording: value,
      derivation: c.label === value ? "exact" : "alias",
    })),
    confidence: { kind: "uncalibrated" as const, value: null },
  };
}
export class TaxonomyRegistry {
  private readonly releases = new Map<string, TaxonomyRelease>();
  private activeKey: string | null = null;
  add(release: TaxonomyRelease) {
    const key = `${release.provider}:${release.version}`;
    const old = this.releases.get(key);
    if (old && old.sha256 !== release.sha256)
      throw Error("IMMUTABLE_TAXONOMY_VERSION");
    this.releases.set(key, structuredClone(release));
    return key;
  }
  activate(key: string) {
    if (!this.releases.has(key)) throw Error("UNKNOWN_TAXONOMY_VERSION");
    this.activeKey = key;
  }
  current() {
    return this.activeKey
      ? structuredClone(this.releases.get(this.activeKey)!)
      : undefined;
  }
}
export const FIRST_DOMAIN_PACK = {
  id: "software-engineering-en-IN/1.0.0",
  domain: "software-engineering",
  locale: "en-IN",
  reviewState: "pending_owner_review",
  attribution: "Resumide engineering vocabulary; no O*NET/ESCO release adopted",
  skills: SOFTWARE_SKILLS,
  credentials: ["B.Tech", "Bachelor", "Master", "PhD"],
  scoringEligible: false,
} as const;
export function domainAvailability(domain: string, locale: string) {
  return domain === FIRST_DOMAIN_PACK.domain &&
    locale === FIRST_DOMAIN_PACK.locale
    ? "review_required"
    : "unsupported";
}

export function domainFromJobTitle(title: string) {
  return /\b(software engineer|software developer|web developer|frontend|front-end|backend|back-end|full stack|full-stack|devops|site reliability)\b/iu.test(
    title,
  )
    ? "software-engineering"
    : "unsupported";
}

export const MarketDatasetSchema = z
  .strictObject({
    id: z.string().min(1).max(100),
    sourceUrl: z.url(),
    license: z.string().min(1).max(1000),
    permissionReceipt: z.string().min(1).max(200),
    capturedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    geography: z.string().min(1).max(100),
    seniority: z.string().min(1).max(100),
    occupationVersion: z.string().min(1).max(100),
    sampleSize: z.number().int().positive(),
    queryVersion: z.string().min(1).max(100),
    biasCoverageReport: z.string().min(1).max(1000),
    reviewReceipt: z.string().min(1).max(200),
  })
  .superRefine((d, c) => {
    if (Date.parse(d.expiresAt) <= Date.parse(d.capturedAt))
      c.addIssue({ code: "custom", message: "Invalid dataset dates" });
  });
export function marketAvailability(
  raw: unknown,
  now = new Date(),
  approvedHash?: string,
) {
  const p = MarketDatasetSchema.safeParse(raw);
  return p.success &&
    approvedHash ===
      createHash("sha256").update(JSON.stringify(p.data)).digest("hex") &&
    Date.parse(p.data.capturedAt) <= now.getTime() &&
    Date.parse(p.data.expiresAt) > now.getTime()
    ? { available: true as const, dataset: p.data }
    : {
        available: false as const,
        reason: "missing_expired_or_unapproved_dataset",
      };
}
