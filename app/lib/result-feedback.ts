import type { FeedbackZod } from "./server/schema";

/** Old envelopes contain padding tips. They are availability messages, not repairs. */
export function visibleFeedbackGroups(
  feedback: FeedbackZod,
  unavailable = false,
) {
  const proseOnly =
    feedback.scoreSemantics === "deterministic_baseline_no_model_ratings/1.0.0";
  const groups: Array<{
    source: string;
    tips: Array<{
      type: "good" | "improve";
      tip: string;
      explanation?: string;
    }>;
  }> = [{ source: "ATS compatibility", tips: feedback.ATS.tips }];
  if (unavailable) return groups;
  for (const [key, source] of [
    ["toneAndStyle", "Tone and style"],
    ["content", "Content"],
    ["structure", "Structure"],
    ["skills", "Skills"],
  ] as const) {
    groups.push({
      source,
      tips: feedback[key].tips.filter(
        (tip) => !proseOnly || Boolean(tip.quote),
      ),
    });
  }
  return groups;
}
