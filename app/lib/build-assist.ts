export const BUILD_AI_POLICY_VERSION = "build-ai-selected-context-v1";
export const BUILD_AI_LIMITS = Object.freeze({
  sourceBytes: 49152,
  selectedLines: 20,
  selectedChars: 4000,
  contextLines: 2,
  contextChars: 8000,
  contextBytes: 8000,
  providerPayloadBytes: 17000,
  promptSchemaBytes: 6000,
  reservedTokens: 25000,
  replacementChars: 6000,
  explanationChars: 1200,
  questions: 4,
  questionChars: 300,
  timeoutMs: 10000,
  outputTokens: 768,
  concurrency: 2,
});
export type BuildAssistMode = "fix" | "rewrite" | "resume";
export type BuildAssistRequest = {
  source: string;
  sourceHash: string;
  startLine: number;
  endLine: number;
  mode: BuildAssistMode;
  consent: true;
  policyVersion: typeof BUILD_AI_POLICY_VERSION;
};
export type BuildSuggestion = {
  operation: "replace" | "advice" | "no_change";
  replacement: string | null;
  explanation: string;
  questions: string[];
};
export type BuildAssistResponse = {
  sourceHash: string;
  startLine: number;
  endLine: number;
  originalText: string;
  mode: BuildAssistMode;
  suggestion: BuildSuggestion;
  requiresFactConfirmation: boolean;
};
export type BuildSelection = {
  startOffset: number;
  endOffset: number;
  originalText: string;
  beforeContext: string;
  afterContext: string;
};
export class BuildAssistInputError extends Error {
  constructor(
    public readonly code:
      | "invalid_request"
      | "selection_invalid"
      | "stale_source"
      | "fact_confirmation_required",
  ) {
    super("The suggestion cannot be used with this source or selection.");
    this.name = "BuildAssistInputError";
  }
}
export async function hashBuildSource(source: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function buildLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\r") {
      if (source[i + 1] === "\n") i++;
      starts.push(i + 1);
    } else if (source[i] === "\n") starts.push(i + 1);
  }
  return starts;
}
function offsets(
  source: string,
  starts: number[],
  startLine: number,
  endLine: number,
) {
  const startOffset = starts[startLine - 1];
  let endOffset = starts[endLine] ?? source.length;
  if (endLine < starts.length) {
    if (source[endOffset - 1] === "\n") endOffset--;
    if (source[endOffset - 1] === "\r") endOffset--;
  }
  return { startOffset, endOffset };
}
export function getBuildSelection(
  source: string,
  startLine: number,
  endLine: number,
): BuildSelection {
  const starts = buildLineStarts(source);
  if (
    !Number.isInteger(startLine) ||
    !Number.isInteger(endLine) ||
    startLine < 1 ||
    endLine < startLine ||
    endLine > starts.length ||
    endLine - startLine + 1 > BUILD_AI_LIMITS.selectedLines
  )
    throw new BuildAssistInputError("selection_invalid");
  const range = offsets(source, starts, startLine, endLine),
    originalText = source.slice(range.startOffset, range.endOffset);
  const before =
    startLine > 1
      ? offsets(source, starts, Math.max(1, startLine - 2), startLine - 1)
      : null;
  const after =
    endLine < starts.length
      ? offsets(
          source,
          starts,
          endLine + 1,
          Math.min(starts.length, endLine + 2),
        )
      : null;
  const beforeContext = before
      ? source.slice(before.startOffset, before.endOffset)
      : "",
    afterContext = after
      ? source.slice(after.startOffset, after.endOffset)
      : "";
  if (
    !originalText.trim() ||
    originalText.length > BUILD_AI_LIMITS.selectedChars ||
    originalText.length + beforeContext.length + afterContext.length >
      BUILD_AI_LIMITS.contextChars ||
    new TextEncoder().encode(originalText + beforeContext + afterContext)
      .byteLength > BUILD_AI_LIMITS.contextBytes
  )
    throw new BuildAssistInputError("selection_invalid");
  return { ...range, originalText, beforeContext, afterContext };
}
export function selectionLineRange(
  source: string,
  startOffset: number,
  endOffset: number,
) {
  const starts = buildLineStarts(source);
  const lineAt = (offset: number) => {
    let line = 0;
    while (line + 1 < starts.length && starts[line + 1] <= offset) line++;
    return line + 1;
  };
  return {
    startLine: lineAt(Math.max(0, startOffset)),
    endLine: lineAt(
      Math.max(
        startOffset,
        endOffset > startOffset ? endOffset - 1 : endOffset,
      ),
    ),
  };
}
export async function applyBuildSuggestion(
  source: string,
  result: BuildAssistResponse,
  factConfirmed = false,
): Promise<string> {
  if ((await hashBuildSource(source)) !== result.sourceHash)
    throw new BuildAssistInputError("stale_source");
  const range = getBuildSelection(source, result.startLine, result.endLine);
  if (
    range.originalText !== result.originalText ||
    result.suggestion.operation !== "replace" ||
    typeof result.suggestion.replacement !== "string"
  )
    throw new BuildAssistInputError("stale_source");
  if (
    (result.requiresFactConfirmation || result.mode === "resume") &&
    !factConfirmed
  )
    throw new BuildAssistInputError("fact_confirmation_required");
  return (
    source.slice(0, range.startOffset) +
    result.suggestion.replacement +
    source.slice(range.endOffset)
  );
}
export type BuildUndo = { beforeSource: string; afterSource: string };
export function undoBuildSuggestion(source: string, undo: BuildUndo): string {
  if (source !== undo.afterSource)
    throw new BuildAssistInputError("stale_source");
  return undo.beforeSource;
}
