import { retentionCutoff } from "./privacy-operations";
import { createResumeStorage } from "./storage";
import { createSupabaseAdminClient } from "./supabase";

export interface RetentionRepository {
  claimExpiredObjects(
    before: string,
    limit: number,
  ): Promise<Array<{ id: string; storageKey: string }>>;
  complete(id: string): Promise<void>;
  fail(id: string, errorCode: string): Promise<void>;
}

export async function runRetentionSweep(
  repository: RetentionRepository,
  removeObject: (storageKey: string) => Promise<void>,
  now: Date,
  retentionDays: number,
  limit = 100,
): Promise<{ claimed: number; completed: number; failed: number }> {
  const items = await repository.claimExpiredObjects(
    retentionCutoff(now, retentionDays).toISOString(),
    limit,
  );
  let completed = 0;
  let failed = 0;
  for (const item of items) {
    try {
      await removeObject(item.storageKey);
      await repository.complete(item.id);
      completed += 1;
    } catch {
      await repository.fail(item.id, "STORAGE_DELETE_FAILED");
      failed += 1;
    }
  }
  return { claimed: items.length, completed, failed };
}

export class SupabaseRetentionRepository implements RetentionRepository {
  async claimExpiredObjects(before: string, limit: number) {
    const { data, error } = await createSupabaseAdminClient().rpc(
      "claim_expired_resume_objects",
      { p_before: before, p_limit: limit },
    );
    if (error) throw new Error("Retention claim failed.");
    return (Array.isArray(data) ? data : []).map((item) => ({
      id: String(item.item_id),
      storageKey: String(item.storage_key),
    }));
  }

  async complete(id: string) {
    const { error } = await createSupabaseAdminClient().rpc(
      "complete_retention_item",
      { p_item_id: id },
    );
    if (error) throw new Error("Retention completion failed.");
  }

  async fail(id: string, errorCode: string) {
    const { error } = await createSupabaseAdminClient().rpc(
      "fail_retention_item",
      { p_item_id: id, p_error_code: errorCode },
    );
    if (error) throw new Error("Retention failure could not be recorded.");
  }
}

export function createRetentionObjectRemover() {
  const storage = createResumeStorage();
  return (storageKey: string) => storage.remove(storageKey);
}
