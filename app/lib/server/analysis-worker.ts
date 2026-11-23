import { processExtractionStage } from "./extraction-stage";
import { processQualitativeStage } from "./qualitative-stage";
import { processScoringStage } from "./scoring-stage";
import {
  assertAnalysisStageActive,
  AnalysisStageFenceError,
} from "./analysis-stage-fence";
import type { WorkerLeaseContext } from "./worker-runner";

export async function processQueuedAnalysis(
  analysisId: string,
  attempt: number,
  signal: AbortSignal,
  lease?: WorkerLeaseContext,
): Promise<void> {
  const options = { signal, ...(lease ? { lease } : {}) };
  assertAnalysisStageActive(options);
  if (lease && lease.attempt !== attempt)
    throw new AnalysisStageFenceError("ANALYSIS_FENCE_UNAVAILABLE");
  await processExtractionStage(analysisId, options);
  assertAnalysisStageActive(options);
  await processScoringStage(analysisId, options);
  assertAnalysisStageActive(options);
  await processQualitativeStage(analysisId, attempt, undefined, options);
  assertAnalysisStageActive(options);
}
