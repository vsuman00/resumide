import { z } from "zod";
import { getAnalysisConfig } from "./config";
import type { WorkerLeaseContext } from "./worker-runner";

export type AnalysisStageOptions = {
  signal?: AbortSignal;
  lease?: WorkerLeaseContext;
};
export type AnalysisStageOperation =
  | "transition_analysis"
  | "persist_document_evidence"
  | "persist_analysis_extraction"
  | "persist_native_layout_extraction"
  | "persist_deterministic_analysis"
  | "persist_partial_analysis"
  | "persist_qualitative_analysis";
const operations = new Set<string>([
  "transition_analysis",
  "persist_document_evidence",
  "persist_analysis_extraction",
  "persist_native_layout_extraction",
  "persist_deterministic_analysis",
  "persist_partial_analysis",
  "persist_qualitative_analysis",
]);
const leaseSchema = z.strictObject({
  workerId: z.string().regex(/^[\x20-\x7e]{1,128}$/u),
  leaseFence: z.uuid(),
  attempt: z.number().int().min(1).max(3),
});
export class AnalysisStageFenceError extends Error {
  constructor(
    readonly code:
      | "ANALYSIS_CANCELLED"
      | "ANALYSIS_LEASE_LOST"
      | "ANALYSIS_FENCE_REQUIRED"
      | "ANALYSIS_FENCE_UNAVAILABLE",
  ) {
    super("Analysis stage could not retain its active lease.");
    this.name = "AnalysisStageFenceError";
  }
}
export interface AnalysisStageRpcClient {
  rpc(
    name: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}
export function assertAnalysisStageActive(
  options: AnalysisStageOptions = {},
): void {
  if (options.signal?.aborted)
    throw new AnalysisStageFenceError("ANALYSIS_CANCELLED");
  if (options.lease !== undefined) {
    if (!leaseSchema.safeParse(options.lease).success)
      throw new AnalysisStageFenceError("ANALYSIS_FENCE_UNAVAILABLE");
  } else if (getAnalysisConfig().ANALYSIS_FENCING_ENABLED === true) {
    throw new AnalysisStageFenceError("ANALYSIS_FENCE_REQUIRED");
  }
}
function leaseParameters(analysisId: string, options: AnalysisStageOptions) {
  if (!z.uuid().safeParse(analysisId).success || !options.lease)
    throw new AnalysisStageFenceError("ANALYSIS_FENCE_UNAVAILABLE");
  return {
    p_analysis_id: analysisId,
    p_worker_id: options.lease.workerId,
    p_attempt: options.lease.attempt,
    p_lease_fence: options.lease.leaseFence,
  };
}
function checkedResult(result: { data: unknown; error: unknown }) {
  if (result.error || typeof result.data !== "boolean")
    throw new AnalysisStageFenceError("ANALYSIS_FENCE_UNAVAILABLE");
  if (!result.data) throw new AnalysisStageFenceError("ANALYSIS_LEASE_LOST");
}
async function fencedCall(
  client: AnalysisStageRpcClient,
  operation: string,
  parameters: Record<string, unknown>,
  options: AnalysisStageOptions,
) {
  try {
    const result = await client.rpc(operation, parameters);
    assertAnalysisStageActive(options);
    checkedResult(result);
    return result;
  } catch (error) {
    assertAnalysisStageActive(options);
    if (error instanceof AnalysisStageFenceError) throw error;
    throw new AnalysisStageFenceError("ANALYSIS_FENCE_UNAVAILABLE");
  }
}
export async function assertAnalysisStageLease(
  client: AnalysisStageRpcClient,
  analysisId: string,
  options: AnalysisStageOptions = {},
): Promise<void> {
  assertAnalysisStageActive(options);
  if (options.lease) {
    await fencedCall(
      client,
      "assert_analysis_stage_lease",
      leaseParameters(analysisId, options),
      options,
    );
  }
}
export async function persistAnalysisStage(
  client: AnalysisStageRpcClient,
  analysisId: string,
  operation: AnalysisStageOperation,
  parameters: Record<string, unknown>,
  options: AnalysisStageOptions = {},
): Promise<{ data: unknown; error: unknown }> {
  assertAnalysisStageActive(options);
  if (!operations.has(operation) || parameters.p_analysis_id !== analysisId)
    throw new AnalysisStageFenceError("ANALYSIS_FENCE_UNAVAILABLE");
  const result = options.lease
    ? await fencedCall(
        client,
        "persist_analysis_stage_v2",
        {
          ...leaseParameters(analysisId, options),
          p_operation: operation,
          p_parameters: parameters,
        },
        options,
      )
    : await client.rpc(operation, parameters);
  assertAnalysisStageActive(options);
  return result;
}
