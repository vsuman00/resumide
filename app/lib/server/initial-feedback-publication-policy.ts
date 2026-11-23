import { createHash } from "node:crypto";
import { z } from "zod";
import {
  LEGACY_SCORING_INPUT_PROFILE,
  HISTORICAL_LEGACY_SCORING_INPUT_PROFILE,
} from "./legacy-scoring-input-profile";
import { INITIAL_FEEDBACK_PLAN_PROFILE } from "./initial-feedback-plan-profile";
import {
  INITIAL_FEEDBACK_PLAN_POLICY_SHA256,
  INITIAL_FEEDBACK_PLAN_POLICY_VERSION,
} from "./initial-feedback-contract";
import {
  QUALITATIVE_SUPPORT_POLICY_SHA256,
  QUALITATIVE_SUPPORT_POLICY,
} from "./qualitative-support";
import { WRITING_SUPPORT_POLICY_VERSION } from "./writing-support";

export const INITIAL_FEEDBACK_PUBLICATION_POLICY_VERSION =
  "initial-feedback-publication/1.0.0";
// Actual qualitative-stage PROMPT_VERSION; source equality is tested without a
// runtime stage import (which would create a worker/contract import cycle).
export const INITIAL_FEEDBACK_PUBLICATION_PROMPT_VERSION =
  "qualitative-cited-prose/3.0.0";
export const INITIAL_FEEDBACK_POLICY_HEADER = "INITIAL-FEEDBACK-POLICY/1\n";
export const INITIAL_FEEDBACK_POLICY_ATOM_ORDER = Object.freeze([
  "version",
  "provider",
  "model",
  "promptVersion",
  "maxOutputTokens",
  "attemptLimit",
  "budgetPolicyVersion",
  "supportVersion",
  "supportSha256",
  "planVersion",
  "planSha256",
  "writingSupportPolicyVersion",
  "scoringInputProfile.schemaVersion",
  "scoringInputProfile.profileVersion",
  "scoringInputProfile.checkerSha256",
  "scoringInputProfile.readerSha256",
  "scoringInputProfile.finishSha256",
  "scoringInputProfile.contextSha256",
  "scoringInputProfile.exportSha256",
  "scoringInputProfile.metadataSha256",
  "planProfile.schemaVersion",
  "planProfile.profileVersion",
  "planProfile.policyVersion",
  "planProfile.policySha256",
  "planProfile.checkerSha256",
  "planProfile.rendererSha256",
  "planProfile.metadataSha256",
] as const);

const sha = z.string().regex(/^[a-f0-9]{64}$/u);
const version = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/u);
const technical = z.strictObject({
  model: version,
  maxOutputTokens: z.number().int().min(256).max(8000),
  attemptLimit: z.number().int().min(1).max(3),
  budgetPolicyVersion: version.nullable(),
});
export type InitialFeedbackPolicyParameters = z.infer<typeof technical>;
const scoringProfile = z.strictObject({
  schemaVersion: z.literal(LEGACY_SCORING_INPUT_PROFILE.schemaVersion),
  profileVersion: z.literal(LEGACY_SCORING_INPUT_PROFILE.profileVersion),
  checkerSha256: z.literal(LEGACY_SCORING_INPUT_PROFILE.checkerSha256),
  readerSha256: z.literal(LEGACY_SCORING_INPUT_PROFILE.readerSha256),
  finishSha256: z.literal(LEGACY_SCORING_INPUT_PROFILE.finishSha256),
  contextSha256: z.literal(LEGACY_SCORING_INPUT_PROFILE.contextSha256),
  exportSha256: z.literal(LEGACY_SCORING_INPUT_PROFILE.exportSha256),
  metadataSha256: z.literal(LEGACY_SCORING_INPUT_PROFILE.metadataSha256),
});
const historicalScoringProfile = z.strictObject({
  schemaVersion: z.literal(
    HISTORICAL_LEGACY_SCORING_INPUT_PROFILE.schemaVersion,
  ),
  profileVersion: z.literal(
    HISTORICAL_LEGACY_SCORING_INPUT_PROFILE.profileVersion,
  ),
  checkerSha256: z.literal(
    HISTORICAL_LEGACY_SCORING_INPUT_PROFILE.checkerSha256,
  ),
  readerSha256: z.literal(HISTORICAL_LEGACY_SCORING_INPUT_PROFILE.readerSha256),
  finishSha256: z.literal(HISTORICAL_LEGACY_SCORING_INPUT_PROFILE.finishSha256),
  contextSha256: z.literal(
    HISTORICAL_LEGACY_SCORING_INPUT_PROFILE.contextSha256,
  ),
  exportSha256: z.literal(HISTORICAL_LEGACY_SCORING_INPUT_PROFILE.exportSha256),
  metadataSha256: z.literal(
    HISTORICAL_LEGACY_SCORING_INPUT_PROFILE.metadataSha256,
  ),
});
const acceptedScoringProfile = z.union([
  scoringProfile,
  historicalScoringProfile,
]);

const planProfile = z.strictObject({
  schemaVersion: z.literal(INITIAL_FEEDBACK_PLAN_PROFILE.schemaVersion),
  profileVersion: z.literal(INITIAL_FEEDBACK_PLAN_PROFILE.profileVersion),
  policyVersion: z.literal(INITIAL_FEEDBACK_PLAN_PROFILE.policyVersion),
  policySha256: z.literal(INITIAL_FEEDBACK_PLAN_PROFILE.policySha256),
  checkerSha256: z.literal(INITIAL_FEEDBACK_PLAN_PROFILE.checkerSha256),
  rendererSha256: z.literal(INITIAL_FEEDBACK_PLAN_PROFILE.rendererSha256),
  metadataSha256: z.literal(INITIAL_FEEDBACK_PLAN_PROFILE.metadataSha256),
});
export const InitialFeedbackPolicyDescriptorSchema = z.strictObject({
  version: z.literal(INITIAL_FEEDBACK_PUBLICATION_POLICY_VERSION),
  provider: z.literal("openai"),
  model: technical.shape.model,
  promptVersion: z.literal(INITIAL_FEEDBACK_PUBLICATION_PROMPT_VERSION),
  maxOutputTokens: technical.shape.maxOutputTokens,
  attemptLimit: technical.shape.attemptLimit,
  budgetPolicyVersion: technical.shape.budgetPolicyVersion,
  supportVersion: z.literal(QUALITATIVE_SUPPORT_POLICY.version),
  supportSha256: z.literal(QUALITATIVE_SUPPORT_POLICY_SHA256),
  planVersion: z.literal(INITIAL_FEEDBACK_PLAN_POLICY_VERSION),
  planSha256: z.literal(INITIAL_FEEDBACK_PLAN_POLICY_SHA256),
  writingSupportPolicyVersion: z.literal(WRITING_SUPPORT_POLICY_VERSION),
  scoringInputProfile: acceptedScoringProfile,
  planProfile,
});
export type InitialFeedbackPolicyDescriptor = z.infer<
  typeof InitialFeedbackPolicyDescriptorSchema
>;
export class InitialFeedbackPolicyError extends Error {
  constructor() {
    super("Initial feedback policy is invalid.");
    this.name = "InitialFeedbackPolicyError";
  }
}
function descriptor(raw: unknown): InitialFeedbackPolicyDescriptor {
  const result = InitialFeedbackPolicyDescriptorSchema.safeParse(raw);
  if (!result.success) throw new InitialFeedbackPolicyError();
  return result.data;
}
/** Exact source codec, not PG JSONB serialization or an activation token. */
export function encodeInitialFeedbackPublicationPolicy(raw: unknown): Buffer {
  const p = descriptor(raw);
  const atoms: Array<string | null> = [
    p.version,
    p.provider,
    p.model,
    p.promptVersion,
    String(p.maxOutputTokens),
    String(p.attemptLimit),
    p.budgetPolicyVersion,
    p.supportVersion,
    p.supportSha256,
    p.planVersion,
    p.planSha256,
    p.writingSupportPolicyVersion,
    p.scoringInputProfile.schemaVersion,
    p.scoringInputProfile.profileVersion,
    p.scoringInputProfile.checkerSha256,
    p.scoringInputProfile.readerSha256,
    p.scoringInputProfile.finishSha256,
    p.scoringInputProfile.contextSha256,
    p.scoringInputProfile.exportSha256,
    p.scoringInputProfile.metadataSha256,
    p.planProfile.schemaVersion,
    p.planProfile.profileVersion,
    p.planProfile.policyVersion,
    p.planProfile.policySha256,
    p.planProfile.checkerSha256,
    p.planProfile.rendererSha256,
    p.planProfile.metadataSha256,
  ];
  return Buffer.from(
    INITIAL_FEEDBACK_POLICY_HEADER +
      atoms
        .map((v) =>
          v === null ? "N;" : `T${Buffer.byteLength(v, "utf8")}:${v};`,
        )
        .join(""),
    "utf8",
  );
}
export function hashInitialFeedbackPublicationPolicy(raw: unknown): string {
  return createHash("sha256")
    .update(encodeInitialFeedbackPublicationPolicy(raw))
    .digest("hex");
}
export const InitialFeedbackPublicationPolicySchema =
  InitialFeedbackPolicyDescriptorSchema.extend({ sha256: sha }).superRefine(
    (p, ctx) => {
      const { sha256, ...value } = p;
      let matches = false;
      try {
        matches = hashInitialFeedbackPublicationPolicy(value) === sha256;
      } catch {
        /* Fixed schema issue below. */
      }
      if (!matches)
        ctx.addIssue({
          code: "custom",
          message: "Policy source hash mismatch.",
        });
    },
  );
export type InitialFeedbackPublicationPolicy = z.infer<
  typeof InitialFeedbackPublicationPolicySchema
>;
function immutable(
  p: InitialFeedbackPublicationPolicy,
): InitialFeedbackPublicationPolicy {
  return Object.freeze({
    ...p,
    scoringInputProfile: Object.freeze({ ...p.scoringInputProfile }),
    planProfile: Object.freeze({ ...p.planProfile }),
  });
}
export const InitialFeedbackPolicySelectorSchema = z.strictObject({
  version: z.literal(INITIAL_FEEDBACK_PUBLICATION_POLICY_VERSION),
  sha256: sha,
});
/** Explicit technical settings only. No env read, model default, seed or selection. */
export function createInitialFeedbackPublicationPolicy(
  raw: unknown,
): InitialFeedbackPublicationPolicy {
  const result = technical.safeParse(raw);
  if (!result.success) throw new InitialFeedbackPolicyError();
  const p = descriptor({
    ...result.data,
    version: INITIAL_FEEDBACK_PUBLICATION_POLICY_VERSION,
    provider: "openai",
    promptVersion: INITIAL_FEEDBACK_PUBLICATION_PROMPT_VERSION,
    supportVersion: QUALITATIVE_SUPPORT_POLICY.version,
    supportSha256: QUALITATIVE_SUPPORT_POLICY_SHA256,
    planVersion: INITIAL_FEEDBACK_PLAN_POLICY_VERSION,
    planSha256: INITIAL_FEEDBACK_PLAN_POLICY_SHA256,
    writingSupportPolicyVersion: WRITING_SUPPORT_POLICY_VERSION,
    scoringInputProfile: { ...LEGACY_SCORING_INPUT_PROFILE },
    planProfile: { ...INITIAL_FEEDBACK_PLAN_PROFILE },
  });
  return immutable(
    InitialFeedbackPublicationPolicySchema.parse({
      ...p,
      sha256: hashInitialFeedbackPublicationPolicy(p),
    }),
  );
}
export function validateInitialFeedbackPublicationPolicy(
  raw: unknown,
): InitialFeedbackPublicationPolicy {
  const result = InitialFeedbackPublicationPolicySchema.safeParse(raw);
  if (!result.success) throw new InitialFeedbackPolicyError();
  return immutable(result.data);
}
