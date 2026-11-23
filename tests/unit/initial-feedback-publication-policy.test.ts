import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createInitialFeedbackPublicationPolicy,
  encodeInitialFeedbackPublicationPolicy,
  hashInitialFeedbackPublicationPolicy,
  validateInitialFeedbackPublicationPolicy,
  InitialFeedbackPublicationPolicySchema,
  INITIAL_FEEDBACK_POLICY_ATOM_ORDER,
  INITIAL_FEEDBACK_POLICY_HEADER,
  INITIAL_FEEDBACK_PUBLICATION_PROMPT_VERSION,
} from "../../app/lib/server/initial-feedback-publication-policy";
import { LEGACY_SCORING_INPUT_PROFILE } from "../../app/lib/server/legacy-scoring-input-profile";
import { INITIAL_FEEDBACK_PLAN_PROFILE } from "../../app/lib/server/initial-feedback-plan-profile";
import { DEFAULT_OPENAI_MODEL } from "../../app/lib/server/openai-model";
import { parseAnalysisConfig } from "../../app/lib/server/config";
import { WRITING_SUPPORT_POLICY_VERSION } from "../../app/lib/server/writing-support";
const args = {
  model: DEFAULT_OPENAI_MODEL,
  maxOutputTokens: 1200,
  attemptLimit: 1,
  budgetPolicyVersion: null,
};
const descriptor = () => {
  const { sha256, ...d } = createInitialFeedbackPublicationPolicy(args);
  return { d, sha256 };
};
describe("publication source policy, no registry selection/provider", () => {
  it("derives frozen dependencies and requires explicit technical inputs", () => {
    const p = createInitialFeedbackPublicationPolicy(args);
    expect(p.scoringInputProfile).toEqual(LEGACY_SCORING_INPUT_PROFILE);
    expect(p.planProfile).toEqual(INITIAL_FEEDBACK_PLAN_PROFILE);
    expect(p.writingSupportPolicyVersion).toBe(WRITING_SUPPORT_POLICY_VERSION);
    expect(() => createInitialFeedbackPublicationPolicy({})).toThrow();
    expect(() =>
      createInitialFeedbackPublicationPolicy({ ...args, enabled: true }),
    ).toThrow();
    expect(
      Object.isFrozen(p) &&
        Object.isFrozen(p.scoringInputProfile) &&
        Object.isFrozen(p.planProfile),
    ).toBe(true);
  });
  it("uses exact27-atom UTF8 framing and preserves the historical golden, not JSON serialization", () => {
    const { d, sha256 } = historicalDescriptor();
    const atoms = [
      d.version,
      d.provider,
      d.model,
      d.promptVersion,
      String(d.maxOutputTokens),
      String(d.attemptLimit),
      d.budgetPolicyVersion,
      d.supportVersion,
      d.supportSha256,
      d.planVersion,
      d.planSha256,
      d.writingSupportPolicyVersion,
      d.scoringInputProfile.schemaVersion,
      d.scoringInputProfile.profileVersion,
      d.scoringInputProfile.checkerSha256,
      d.scoringInputProfile.readerSha256,
      d.scoringInputProfile.finishSha256,
      d.scoringInputProfile.contextSha256,
      d.scoringInputProfile.exportSha256,
      d.scoringInputProfile.metadataSha256,
      d.planProfile.schemaVersion,
      d.planProfile.profileVersion,
      d.planProfile.policyVersion,
      d.planProfile.policySha256,
      d.planProfile.checkerSha256,
      d.planProfile.rendererSha256,
      d.planProfile.metadataSha256,
    ];
    const expected = Buffer.from(
      "INITIAL-FEEDBACK-POLICY/1\n" +
        atoms
          .map((v) =>
            v === null ? "N;" : `T${Buffer.byteLength(v, "utf8")}:${v};`,
          )
          .join(""),
      "utf8",
    );
    expect(INITIAL_FEEDBACK_POLICY_ATOM_ORDER).toHaveLength(27);
    expect(INITIAL_FEEDBACK_POLICY_HEADER).toBe("INITIAL-FEEDBACK-POLICY/1\n");
    expect(encodeInitialFeedbackPublicationPolicy(d)).toEqual(expected);
    expect(sha256).toBe(createHash("sha256").update(expected).digest("hex"));
    expect(sha256).not.toBe(
      createHash("sha256").update(JSON.stringify(d)).digest("hex"),
    );
    expect(sha256).toBe(
      "5f5eace5226885c3bbaf6c430e656034edbb3f12e42ffa4634faffd8f94619ca",
    );
  });
  it("ignores input property order while retaining every value", () => {
    const { d, sha256 } = descriptor();
    const reverse = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(reverse)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v)
                .reverse()
                .map(([k, x]) => [k, reverse(x)]),
            )
          : v;
    expect(hashInitialFeedbackPublicationPolicy(reverse(d))).toBe(sha256);
  });
  it("distinguishes null budget mode from string null and explicit synthetic on policy", () => {
    const off = historicalPolicy(args),
      on = historicalPolicy({
        ...args,
        budgetPolicyVersion: "synthetic-budget-policy/1",
      }),
      literal = historicalPolicy({
        ...args,
        budgetPolicyVersion: "null",
      });
    expect(on.sha256).toBe(
      "fd7f080752a0aaddd1f9330aa27f2c8bad7daee0feb342030105258c5713de8a",
    );
    expect(new Set([off.sha256, on.sha256, literal.sha256]).size).toBe(3);
  });
  it.each([
    { model: "GPT-6-luna" },
    { maxOutputTokens: 256 },
    { attemptLimit: 2 },
  ])("does not normalize technical changes %j", (delta) => {
    expect(
      createInitialFeedbackPublicationPolicy({ ...args, ...delta }).sha256,
    ).not.toBe(createInitialFeedbackPublicationPolicy(args).sha256);
  });
  it.each([
    { maxOutputTokens: 255 },
    { maxOutputTokens: 8001 },
    { attemptLimit: 0 },
    { attemptLimit: 4 },
    { model: "bad model" },
    { model: "bad\uD800" },
    { model: "bad\0name" },
    { budgetPolicyVersion: "" },
  ])("refuses unsupported parameters %j", (delta) => {
    expect(() =>
      createInitialFeedbackPublicationPolicy({ ...args, ...delta }),
    ).toThrow();
  });
  it("matches current source output/attempt bounds and exact prompt", () => {
    for (const value of [256, 8000]) {
      expect(
        parseAnalysisConfig({
          OPENAI_API_KEY: "synthetic-offline",
          OPENAI_MAX_OUTPUT_TOKENS: String(value),
        }).OPENAI_MAX_OUTPUT_TOKENS === value,
      ).toBe(true);
      expect(
        createInitialFeedbackPublicationPolicy({
          ...args,
          maxOutputTokens: value,
        }).maxOutputTokens,
      ).toBe(value);
    }
    for (const value of [1, 3])
      expect(
        parseAnalysisConfig({
          OPENAI_API_KEY: "synthetic-offline",
          QUALITATIVE_MAX_ATTEMPTS: String(value),
        }).QUALITATIVE_MAX_ATTEMPTS === value,
      ).toBe(true);
    const stage = readFileSync(
      new URL("../../app/lib/server/qualitative-stage.ts", import.meta.url),
      "utf8",
    );
    expect(stage).toContain(
      `export const PROMPT_VERSION = "${INITIAL_FEEDBACK_PUBLICATION_PROMPT_VERSION}";`,
    );
  });
  it("rejects drifted source profiles, changed hashes and unknown nested fields safely", () => {
    const p = createInitialFeedbackPublicationPolicy(args);
    for (const bad of [
      { ...p, sha256: "0".repeat(64) },
      { ...p, model: "bad model" },
      { ...p, extra: true },
      {
        ...p,
        scoringInputProfile: {
          ...p.scoringInputProfile,
          readerSha256: "0".repeat(64),
        },
      },
      { ...p, planProfile: { ...p.planProfile, extra: true } },
    ])
      expect(
        InitialFeedbackPublicationPolicySchema.safeParse(bad).success,
      ).toBe(false);
    expect(validateInitialFeedbackPublicationPolicy(p)).toEqual(p);
    expect(() => hashInitialFeedbackPublicationPolicy(p)).toThrow();
  });
});

const historicalScoringProfile = {
  schemaVersion: "legacy-scoring-readiness/1.0.0",
  profileVersion: "legacy-scoring-profile/1.0.0",
  checkerSha256:
    "56a92f65d533a2f1b053078dbb372b1271728224e5df1c74b201b4cffb21a8d3",
  readerSha256:
    "2ea3c5071d8d56e421a37053127dea08fe8eb08ce91e4de9f5c3b4c4b1172ccf",
  finishSha256:
    "5db61206ed04f32af7052fce2d64e2ccf414d6fea13645f58eecf67f616b61a2",
  contextSha256:
    "d64ba9ac11ba732c983cd195cd7d83fba878e67f4ae0bffc8b6e166a600a8bd9",
  exportSha256:
    "e4c17997fdbec81d931e4838b3522c6c7d3c861b0bfa07b6fb3ab5ece160f0a2",
  metadataSha256:
    "f18e6abfd698c4dbf4f7f6040fb577b2e49e78e4125bfd9d31e8166d0e678da8",
} as const;
it("preserves the exact historical descriptor and hash while fresh admission uses renewed readiness", () => {
  const current = createInitialFeedbackPublicationPolicy(args);
  const { sha256: _currentHash, ...base } = current;
  void _currentHash;
  const historical = { ...base, scoringInputProfile: historicalScoringProfile };
  const oldHash = hashInitialFeedbackPublicationPolicy(historical);
  expect(
    validateInitialFeedbackPublicationPolicy({
      ...historical,
      sha256: oldHash,
    }),
  ).toEqual({ ...historical, sha256: oldHash });
  expect(
    JSON.stringify(
      validateInitialFeedbackPublicationPolicy({
        ...historical,
        sha256: oldHash,
      }),
    ),
  ).toBe(JSON.stringify({ ...historical, sha256: oldHash }));
  expect(current.scoringInputProfile.checkerSha256).not.toBe(
    historicalScoringProfile.checkerSha256,
  );
  expect(current.sha256).not.toBe(oldHash);
  expect(() =>
    validateInitialFeedbackPublicationPolicy({
      ...historical,
      scoringInputProfile: {
        ...historicalScoringProfile,
        checkerSha256: "f".repeat(64),
      },
      sha256: oldHash,
    }),
  ).toThrow();
});

function historicalPolicy(
  input:
    | typeof args
    | {
        model: string;
        maxOutputTokens: number;
        attemptLimit: number;
        budgetPolicyVersion: string | null;
      },
) {
  const { sha256: ignored, ...current } =
    createInitialFeedbackPublicationPolicy(input);
  void ignored;
  const d = { ...current, scoringInputProfile: historicalScoringProfile };
  return validateInitialFeedbackPublicationPolicy({
    ...d,
    sha256: hashInitialFeedbackPublicationPolicy(d),
  });
}
function historicalDescriptor() {
  const { sha256, ...d } = historicalPolicy(args);
  return { d, sha256 };
}
it("retains the frozen old policy hash without rewriting history", () => {
  expect(historicalPolicy(args).sha256).toBe(
    "5f5eace5226885c3bbaf6c430e656034edbb3f12e42ffa4634faffd8f94619ca",
  );
  const fresh = createInitialFeedbackPublicationPolicy(args);
  expect(fresh.scoringInputProfile).toEqual(LEGACY_SCORING_INPUT_PROFILE);
  expect(
    new Set(
      [null, "null", "synthetic-budget-policy/1"].map(
        (budgetPolicyVersion) =>
          createInitialFeedbackPublicationPolicy({
            ...args,
            budgetPolicyVersion,
          }).sha256,
      ),
    ).size,
  ).toBe(3);
});
