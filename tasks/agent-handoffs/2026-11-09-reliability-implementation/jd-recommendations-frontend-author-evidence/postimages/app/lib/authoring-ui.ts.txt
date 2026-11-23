export const CLARIFICATION_KINDS = [
  "result",
  "measurement",
  "scope",
  "method",
  "ownership",
] as const;
export const QUESTIONS = {
  result: "What result can you truthfully attribute to this contribution?",
  measurement:
    "How was that result measured? Leave it unanswered if no measurement is known.",
  scope: "What was the verified scope or context?",
  method: "What did you do to achieve the result?",
  ownership: "What was your own responsibility rather than the team's?",
};

export function describeWritingPattern(pattern: string) {
  switch (pattern) {
    case "xyz":
      return "When its clarifications are present, this pattern puts the result first, followed by the recorded measurement and method.";
    case "action_impact_context":
      return "When its clarifications are present, this pattern keeps the original action first, followed by the recorded result as impact and scope as context.";
    case "action_scope_result":
      return "When its clarifications are present, this pattern keeps the original action first, followed by the recorded scope and result. It does not require a measurement.";
    default:
      return "Review the wording against the bound fact; no structural improvement has been assessed for this pattern.";
  }
}
