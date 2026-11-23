export const DEFAULT_OPENAI_MODEL = "gpt-6-luna";

/** Bounded prose generation does not need hidden reasoning tokens. */
export function proseModelOptions(model: string) {
  return {
    model,
    ...(model === "gpt-6-luna" ? { reasoning_effort: "none" as const } : {}),
  };
}
