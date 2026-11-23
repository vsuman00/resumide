import { createHash } from "node:crypto";
import { z } from "zod";
import {
  assessEvaluationCorpus,
  evaluationCorpusRecordSchema,
  transitionCorpusRecord,
  type CorpusReasonCode,
  type EvaluationCorpusRecord,
  type EvaluationCorpusAuthority,
} from "./evaluation-corpus";
import type { PrivateStorageBucket } from "./storage";

const opaqueId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const actorSchema = z.strictObject({
  id: opaqueId,
  groups: z.array(opaqueId).max(32),
});
const timestamp = z.iso.datetime({ offset: true });
export const CORPUS_DRILL_MAX_BYTES = 256 * 1024;
export const CORPUS_DRILL_MAX_OBJECTS = 8;
export type CorpusDrillCode =
  | CorpusReasonCode
  | "OK"
  | "INVALID_REQUEST"
  | "LIMIT_EXCEEDED"
  | "HASH_MISMATCH"
  | "KEY_CONFLICT"
  | "ABSENCE_UNVERIFIED"
  | "UPLOAD_FAILED"
  | "READ_FAILED"
  | "DELETE_FAILED"
  | "AUDIT_FAILED"
  | "OPERATION_PENDING";
type Action = "intake" | "read" | "revoke" | "delete";
export type CorpusDrillAudit = {
  schemaVersion: 1;
  runId: string;
  sequence: number;
  action: Action;
  phase: "intent" | "terminal";
  outcome: "allowed" | "success" | "denied" | "failed";
  code: CorpusDrillCode;
  objectKeyHash: string;
  deletionVerified: boolean;
};
export type CorpusDrillReceipt = CorpusDrillAudit & { auditPersisted: boolean };
export type CorpusDrillResult = {
  ok: boolean;
  code: CorpusDrillCode;
  auditPersisted: boolean;
  deletionVerified: boolean;
  bytes?: Uint8Array;
};
export type CorpusDrillPorts = {
  authority?: EvaluationCorpusAuthority;
  storage: Pick<PrivateStorageBucket, "upload" | "download" | "remove">;
  audit(event: Readonly<CorpusDrillAudit>): Promise<void>;
  /** True only for the provider's positively identified not-found response. */
  isNotFound(error: unknown): boolean;
};
type Entry = {
  record: EvaluationCorpusRecord;
  key: string;
  attempted: boolean;
  deleted: boolean;
  uploadPending: boolean;
};
const checksum = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");

/** A bounded run-owned lab session, not an account/corpus persistence service. */
export class EvaluationCorpusDrill {
  private readonly entries = new Map<string, Entry>();
  private readonly journal: CorpusDrillReceipt[] = [];
  private readonly scope: {
    runId: string;
    organizationId: string;
    ownerId: string;
  };

  constructor(
    scope: unknown,
    private readonly ports: CorpusDrillPorts,
  ) {
    const parsed = z
      .strictObject({
        runId: opaqueId,
        organizationId: opaqueId,
        ownerId: opaqueId,
      })
      .safeParse(scope);
    if (!parsed.success) throw new Error("Invalid corpus drill scope");
    this.scope = parsed.data;
  }

  /** Private cleanup inventory; callers must not print keys or persist them publicly. */
  ownedKeys(): readonly string[] {
    return [...this.entries.values()]
      .filter((entry) => entry.attempted)
      .map((entry) => entry.key)
      .sort();
  }
  receipts(): readonly CorpusDrillReceipt[] {
    return this.journal.map((event) => ({ ...event }));
  }
  private key(id: string) {
    return `organizations/${this.scope.organizationId}/evaluation-corpus/${this.scope.runId}/${id}.pdf`;
  }
  private owner(actor: unknown): boolean {
    const parsed = actorSchema.safeParse(actor);
    return parsed.success && parsed.data.id === this.scope.ownerId;
  }
  private eligible(
    record: unknown,
    actor: unknown,
    asOf: string,
  ): CorpusDrillCode | null {
    const parsed = actorSchema.safeParse(actor);
    if (!parsed.success || parsed.data.id !== this.scope.ownerId)
      return "ACCESS_DENIED";
    const assessed = assessEvaluationCorpus(
      { schemaVersion: 1, records: [record] },
      { groups: parsed.data.groups },
      asOf,
      this.ports.authority,
    );
    return assessed.admittedCount === 1
      ? null
      : ((Object.keys(assessed.reasonCounts)[0] as
          CorpusReasonCode | undefined) ?? "INVALID_RECORD");
  }
  private async emit(
    action: Action,
    phase: CorpusDrillAudit["phase"],
    outcome: CorpusDrillAudit["outcome"],
    code: CorpusDrillCode,
    key = "",
    deletionVerified = false,
  ): Promise<boolean> {
    const event: CorpusDrillAudit = {
      schemaVersion: 1,
      runId: this.scope.runId,
      sequence: this.journal.length + 1,
      action,
      phase,
      outcome,
      code,
      objectKeyHash: checksum(key),
      deletionVerified,
    };
    const receipt: CorpusDrillReceipt = { ...event, auditPersisted: false };
    this.journal.push(receipt);
    try {
      await this.ports.audit(Object.freeze({ ...event }));
      receipt.auditPersisted = true;
      return true;
    } catch {
      return false;
    }
  }
  private async terminal(
    action: Action,
    code: CorpusDrillCode,
    key = "",
    deletionVerified = false,
    denied = false,
    priorAudit = true,
  ): Promise<CorpusDrillResult> {
    const persisted = await this.emit(
      action,
      "terminal",
      code === "OK" ? "success" : denied ? "denied" : "failed",
      code,
      key,
      deletionVerified,
    );
    const auditPersisted = priorAudit && persisted;
    return {
      ok: code === "OK" && auditPersisted,
      code: code === "OK" && !auditPersisted ? "AUDIT_FAILED" : code,
      auditPersisted,
      deletionVerified,
    };
  }
  private async inspect(
    key: string,
  ): Promise<{ state: "absent" | "present" | "unknown"; bytes?: Uint8Array }> {
    try {
      const { data, error } = await this.ports.storage.download(key);
      if (!data && error && this.ports.isNotFound(error))
        return { state: "absent" };
      if (error || !data || data.size > CORPUS_DRILL_MAX_BYTES)
        return { state: "unknown" };
      const bytes = new Uint8Array(await data.arrayBuffer());
      return bytes.byteLength <= CORPUS_DRILL_MAX_BYTES
        ? { state: "present", bytes }
        : { state: "unknown" };
    } catch {
      return { state: "unknown" };
    }
  }

  async intake(
    record: unknown,
    bytes: Uint8Array,
    actor: unknown,
    asOf: string,
  ): Promise<CorpusDrillResult> {
    const denied = this.eligible(record, actor, asOf);
    if (denied) return this.terminal("intake", denied, "", false, true);
    const parsed = evaluationCorpusRecordSchema.safeParse(record);
    if (!parsed.success)
      return this.terminal("intake", "INVALID_RECORD", "", false, true);
    if (
      !(bytes instanceof Uint8Array) ||
      !bytes.byteLength ||
      bytes.byteLength > CORPUS_DRILL_MAX_BYTES ||
      this.entries.size >= CORPUS_DRILL_MAX_OBJECTS
    )
      return this.terminal("intake", "LIMIT_EXCEEDED");
    const copy = new Uint8Array(bytes);
    if (checksum(copy) !== parsed.data.contentHash)
      return this.terminal("intake", "HASH_MISMATCH");
    if (this.entries.has(parsed.data.id))
      return this.terminal("intake", "KEY_CONFLICT");
    const entry: Entry = {
      record: parsed.data,
      key: this.key(parsed.data.id),
      attempted: false,
      deleted: false,
      uploadPending: true,
    };
    this.entries.set(parsed.data.id, entry);
    try {
      if (!(await this.emit("intake", "intent", "allowed", "OK", entry.key))) {
        this.entries.delete(parsed.data.id);
        return this.terminal(
          "intake",
          "AUDIT_FAILED",
          entry.key,
          false,
          false,
          false,
        );
      }
      const existing = await this.inspect(entry.key);
      if (existing.state !== "absent") {
        this.entries.delete(parsed.data.id);
        return this.terminal(
          "intake",
          existing.state === "present" ? "KEY_CONFLICT" : "ABSENCE_UNVERIFIED",
          entry.key,
        );
      }
      entry.attempted = true;
      try {
        const { error } = await this.ports.storage.upload(entry.key, copy, {
          contentType: "application/pdf",
          upsert: false,
        });
        if (error) return this.terminal("intake", "UPLOAD_FAILED", entry.key);
      } catch {
        return this.terminal("intake", "UPLOAD_FAILED", entry.key);
      }
      const stored = await this.inspect(entry.key);
      if (stored.state !== "present" || !stored.bytes)
        return this.terminal("intake", "READ_FAILED", entry.key);
      if (checksum(stored.bytes) !== entry.record.contentHash)
        return this.terminal("intake", "HASH_MISMATCH", entry.key);
      return this.terminal("intake", "OK", entry.key);
    } finally {
      entry.uploadPending = false;
    }
  }

  async read(
    id: string,
    actor: unknown,
    asOf: string,
  ): Promise<CorpusDrillResult> {
    if (!this.owner(actor))
      return this.terminal("read", "ACCESS_DENIED", "", false, true);
    const entry = this.entries.get(id);
    if (!entry?.attempted)
      return this.terminal("read", "INVALID_RECORD", "", false, true);
    if (entry.uploadPending)
      return this.terminal("read", "OPERATION_PENDING", entry.key);
    const denied = this.eligible(entry.record, actor, asOf);
    if (denied) return this.terminal("read", denied, entry.key, false, true);
    if (!(await this.emit("read", "intent", "allowed", "OK", entry.key)))
      return this.terminal(
        "read",
        "AUDIT_FAILED",
        entry.key,
        false,
        false,
        false,
      );
    const stored = await this.inspect(entry.key);
    if (stored.state !== "present" || !stored.bytes)
      return this.terminal("read", "READ_FAILED", entry.key);
    if (checksum(stored.bytes) !== entry.record.contentHash)
      return this.terminal("read", "HASH_MISMATCH", entry.key);
    const result = await this.terminal("read", "OK", entry.key);
    if (!result.ok) return result;
    const current = this.entries.get(id);
    const currentDenial =
      current !== entry
        ? "INVALID_RECORD"
        : this.eligible(entry.record, actor, asOf);
    if (currentDenial)
      return this.terminal("read", currentDenial, entry.key, false, true);
    return { ...result, bytes: stored.bytes };
  }

  async revoke(
    id: string,
    actor: unknown,
    asOf: string,
  ): Promise<CorpusDrillResult> {
    if (!this.owner(actor))
      return this.terminal("revoke", "ACCESS_DENIED", "", false, true);
    const entry = this.entries.get(id);
    if (!entry?.attempted) return this.terminal("revoke", "INVALID_RECORD");
    if (entry.uploadPending)
      return this.terminal("revoke", "OPERATION_PENDING", entry.key);
    const transition = transitionCorpusRecord(entry.record, "revoke", asOf);
    if (!transition.record)
      return this.terminal(
        "revoke",
        transition.reason ?? "INVALID_TRANSITION",
        entry.key,
      );
    // Revoke in memory first: an audit outage must never leave access enabled.
    entry.record = transition.record;
    return this.terminal("revoke", "OK", entry.key);
  }

  async remove(
    id: string,
    actor: unknown,
    asOf: string,
  ): Promise<CorpusDrillResult> {
    if (!this.owner(actor))
      return this.terminal("delete", "ACCESS_DENIED", "", false, true);
    const entry = this.entries.get(id);
    if (!entry?.attempted) return this.terminal("delete", "INVALID_RECORD");
    if (entry.uploadPending)
      return this.terminal("delete", "OPERATION_PENDING", entry.key);
    const transition = transitionCorpusRecord(
      entry.record,
      "mark_deleted",
      asOf,
    );
    if (!transition.record)
      return this.terminal(
        "delete",
        transition.reason ?? "INVALID_TRANSITION",
        entry.key,
      );
    const priorAudit = await this.emit(
      "delete",
      "intent",
      "allowed",
      "OK",
      entry.key,
    );
    const before = await this.inspect(entry.key);
    if (before.state === "unknown")
      return this.terminal(
        "delete",
        "ABSENCE_UNVERIFIED",
        entry.key,
        false,
        false,
        priorAudit,
      );
    if (
      before.state === "present" &&
      (entry.deleted ||
        !before.bytes ||
        checksum(before.bytes) !== entry.record.contentHash)
    )
      return this.terminal(
        "delete",
        "HASH_MISMATCH",
        entry.key,
        false,
        false,
        priorAudit,
      );
    let removalFailed = false;
    if (before.state === "present") {
      try {
        removalFailed = Boolean(
          (await this.ports.storage.remove([entry.key])).error,
        );
      } catch {
        removalFailed = true;
      }
    }
    const after = await this.inspect(entry.key);
    const verified = after.state === "absent";
    if (verified) {
      entry.deleted = true;
      entry.record = transition.record;
    }
    return this.terminal(
      "delete",
      removalFailed ? "DELETE_FAILED" : verified ? "OK" : "ABSENCE_UNVERIFIED",
      entry.key,
      verified,
      false,
      priorAudit,
    );
  }

  /** Internal run cleanup, including ambiguous partial uploads; never a global sweep. */
  async cleanup(asOf: string) {
    if (!timestamp.safeParse(asOf).success)
      return {
        ok: false,
        deletionVerified: false,
        attemptedObjects: 0,
        remainingObjects: this.ownedKeys().length,
      };
    const entries = [...this.entries.values()].filter(
      (entry) => entry.attempted,
    );
    const results = [];
    for (const entry of entries)
      results.push(
        await this.remove(
          entry.record.id,
          { id: this.scope.ownerId, groups: [] },
          asOf,
        ),
      );
    return {
      ok: results.every((result) => result.ok),
      deletionVerified:
        results.length > 0 &&
        results.every((result) => result.deletionVerified),
      attemptedObjects: entries.length,
      remainingObjects: results.filter((result) => !result.deletionVerified)
        .length,
    };
  }
}
