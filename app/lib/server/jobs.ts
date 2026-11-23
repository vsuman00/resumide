import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  JOB_LEASE_SECONDS,
  MAX_JOB_ATTEMPTS,
  retryDelaySeconds,
} from "./job-policy";
import { createSupabaseAdminClient } from "./supabase";
import { getAnalysisConfig } from "./config";
import type { ClaimedAnalysisJob, WorkerLeaseContext } from "./worker-runner";

const contextSchema = z.strictObject({
  workerId: z.string().regex(/^[\x20-\x7e]{1,128}$/u),
  leaseFence: z.uuid(),
  attempt: z.number().int().min(1).max(MAX_JOB_ATTEMPTS),
});
const claimSchema = z.strictObject({
  schemaVersion: z.literal("analysis-job-lease/2.0.0"),
  analysisId: z.uuid(),
  attempt: contextSchema.shape.attempt,
  runAfter: z.iso.datetime({ offset: true }),
  leaseFence: z.uuid(),
  leaseExpiresAt: z.iso.datetime({ offset: true }),
});

export class AnalysisJobQueue {
  private readonly workerId = `worker-${randomUUID()}`;
  private readonly fenced =
    getAnalysisConfig().ANALYSIS_FENCING_ENABLED === true;
  private readonly leases = new Map<string, WorkerLeaseContext>();

  constructor(private readonly observeQueue = false) {}

  private context(
    analysisId: string,
    value?: WorkerLeaseContext,
  ): WorkerLeaseContext | null {
    const parsed = contextSchema.safeParse(value);
    if (!z.uuid().safeParse(analysisId).success || !parsed.success)
      throw new Error("Analysis job lease context is invalid.");
    const expected = this.leases.get(analysisId);
    if (
      !expected ||
      parsed.data.workerId !== this.workerId ||
      expected.leaseFence !== parsed.data.leaseFence ||
      expected.attempt !== parsed.data.attempt
    )
      return null;
    return parsed.data;
  }

  async claim(): Promise<ClaimedAnalysisJob | null> {
    const client = createSupabaseAdminClient();
    const routine = this.fenced
      ? "claim_analysis_job_v2"
      : "claim_analysis_job";
    const args = {
      p_worker_id: this.workerId,
      p_lease_seconds: JOB_LEASE_SECONDS,
    };
    let response = this.observeQueue
      ? await client.rpc("claim_analysis_job_observed", {
          ...args,
          p_fenced: this.fenced,
        })
      : await client.rpc(routine, args);
    // This schema-cache error means the observed routine did not execute.
    if (this.observeQueue && response.error?.code === "PGRST202")
      response = await client.rpc(routine, args);
    const { data, error } = response;
    if (error) throw new Error("Analysis job claim failed.");
    if (this.fenced) {
      if (data === null) return null;
      const parsed = claimSchema.safeParse(data);
      if (!parsed.success)
        throw new Error("Analysis job claim returned an invalid result.");
      const { schemaVersion, ...job } = parsed.data;
      void schemaVersion;
      this.leases.set(job.analysisId, {
        workerId: this.workerId,
        leaseFence: job.leaseFence,
        attempt: job.attempt,
      });
      return { ...job, workerId: this.workerId };
    }
    if (!data) return null;
    if (
      typeof data !== "object" ||
      !("analysisId" in data) ||
      !("attempt" in data)
    ) {
      throw new Error("Analysis job claim returned an invalid result.");
    }
    const result: {
      analysisId: string;
      attempt: number;
      runAfter?: string;
    } = {
      analysisId: String(data.analysisId),
      attempt: Number(data.attempt),
    };
    if ("runAfter" in data && typeof data.runAfter === "string") {
      result.runAfter = data.runAfter;
    }
    return result;
  }

  async complete(
    analysisId: string,
    lease?: WorkerLeaseContext,
  ): Promise<boolean> {
    if (this.fenced)
      return this.mutate("complete_analysis_job_v2", analysisId, lease);
    const { data, error } = await createSupabaseAdminClient().rpc(
      "complete_analysis_job",
      { p_analysis_id: analysisId, p_worker_id: this.workerId },
    );
    if (error) throw new Error("Analysis job completion failed.");
    return data === true;
  }

  async heartbeat(
    analysisId: string,
    lease?: WorkerLeaseContext,
  ): Promise<boolean> {
    if (this.fenced)
      return this.mutate("heartbeat_analysis_job_v2", analysisId, lease, {
        p_lease_seconds: JOB_LEASE_SECONDS,
      });
    const { data, error } = await createSupabaseAdminClient().rpc(
      "heartbeat_analysis_job",
      {
        p_analysis_id: analysisId,
        p_worker_id: this.workerId,
        p_lease_seconds: JOB_LEASE_SECONDS,
      },
    );
    if (error) throw new Error("Analysis job heartbeat failed.");
    return data === true;
  }

  async release(args: {
    analysisId: string;
    attempt: number;
    errorCode: string;
    leaseFence?: string;
    workerId?: string;
  }): Promise<boolean> {
    if (this.fenced) {
      if (!/^[A-Z0-9_]{1,64}$/.test(args.errorCode))
        throw new Error("Analysis job release context is invalid.");
      const lease = contextSchema.safeParse({
        workerId: args.workerId,
        leaseFence: args.leaseFence,
        attempt: args.attempt,
      });
      if (!lease.success)
        throw new Error("Analysis job release context is invalid.");
      return this.mutate(
        "release_analysis_job_v2",
        args.analysisId,
        lease.data,
        {
          p_retry_delay_seconds: retryDelaySeconds(args.attempt),
          p_error_code: args.errorCode,
        },
      );
    }
    const { data, error } = await createSupabaseAdminClient().rpc(
      "release_analysis_job",
      {
        p_analysis_id: args.analysisId,
        p_worker_id: this.workerId,
        p_retry_delay_seconds: retryDelaySeconds(args.attempt),
        p_error_code: args.errorCode,
      },
    );
    if (error) throw new Error("Analysis job release failed.");
    return data === true;
  }

  private async mutate(
    name: string,
    analysisId: string,
    lease: WorkerLeaseContext | undefined,
    extra: Record<string, unknown> = {},
  ): Promise<boolean> {
    const owned = this.context(analysisId, lease);
    if (!owned) return false;
    const { data, error } = await createSupabaseAdminClient().rpc(name, {
      p_analysis_id: analysisId,
      p_worker_id: this.workerId,
      p_attempt: owned.attempt,
      p_lease_fence: owned.leaseFence,
      ...extra,
    });
    if (error) throw new Error("Analysis job lease mutation failed.");
    if (typeof data !== "boolean")
      throw new Error(
        "Analysis job lease mutation returned an invalid result.",
      );
    if (
      (!data || name !== "heartbeat_analysis_job_v2") &&
      this.leases.get(analysisId)?.leaseFence === owned.leaseFence
    )
      this.leases.delete(analysisId);
    return data;
  }
}
