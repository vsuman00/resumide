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
