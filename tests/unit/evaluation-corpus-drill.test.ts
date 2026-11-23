import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  CORPUS_DRILL_MAX_BYTES,
  EvaluationCorpusDrill,
  type CorpusDrillAudit,
  type CorpusDrillPorts,
} from "../../app/lib/server/evaluation-corpus-drill";
import {
  hashEvaluationCorpusRecord,
  REPRESENTATIVE_CORPUS_PURPOSE,
  type EvaluationCorpusAuthority,
} from "../../app/lib/server/evaluation-corpus";
import { createEvaluationCorpusRecord } from "../fixtures/evaluation-corpus";

const missing = { statusCode: "404" };
const bytes = new TextEncoder().encode(
  "%PDF-1.7\nSynthetic storage drill bytes only.\n%%EOF",
);
const asOf = "2026-11-07T00:00:00Z";
const later = "2026-11-08T00:00:00Z";
const scope = {
  runId: "synthetic_run_0001",
  organizationId: "synthetic_org_0001",
  ownerId: "synthetic_owner_0001",
};
const actor = { id: scope.ownerId, groups: ["synthetic-evaluation-group"] };
const hash = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
function fixture(authority?: EvaluationCorpusAuthority) {
  const objects = new Map<string, Uint8Array>();
  const events: CorpusDrillAudit[] = [];
  const storage: CorpusDrillPorts["storage"] = {
    upload: vi.fn(async (key, body, options) => {
      if (objects.has(key) && !options.upsert)
        return { error: { statusCode: "409" } };
      objects.set(key, new Uint8Array(body));
      return { error: null };
    }),
    download: vi.fn(async (key) => ({
      data: objects.has(key)
        ? new Blob([new Uint8Array(objects.get(key)!)])
        : null,
      error: objects.has(key) ? null : missing,
    })),
    remove: vi.fn(async (keys) => {
      keys.forEach((key: string) => objects.delete(key));
      return { error: null };
    }),
  };
  const audit = vi.fn(async (event: CorpusDrillAudit) => {
    events.push({ ...event });
  });
  const drill = new EvaluationCorpusDrill(scope, {
    authority,
    storage,
    audit,
    isNotFound: (error) => error === missing,
  });
  const record = createEvaluationCorpusRecord();
  record.contentHash = hash(bytes);
  return { drill, storage, objects, events, audit, record };
}

// All IO below is injected in-memory control behavior, not a live-storage receipt.
describe("run-owned synthetic corpus storage drill", () => {
  it("checks actual bytes, performs permitted access, revokes, deletes and verifies absence", async () => {
    const { drill, record, objects, storage, events } = fixture();
    expect(await drill.intake(record, bytes, actor, asOf)).toMatchObject({
      ok: true,
      code: "OK",
    });
    const [key] = drill.ownedKeys();
    expect(key).toBe(
      `organizations/${scope.organizationId}/evaluation-corpus/${scope.runId}/${record.id}.pdf`,
    );
    expect(await drill.read(record.id, actor, asOf)).toMatchObject({
      ok: true,
      bytes,
    });
    expect(await drill.revoke(record.id, actor, later)).toMatchObject({
      ok: true,
    });
    const beforeDenied = vi.mocked(storage.download).mock.calls.length;
    expect(await drill.read(record.id, actor, later)).toMatchObject({
      code: "RECORD_REVOKED",
      ok: false,
    });
    expect(vi.mocked(storage.download).mock.calls).toHaveLength(beforeDenied);
    expect(await drill.cleanup(later)).toEqual({
      ok: true,
      deletionVerified: true,
      attemptedObjects: 1,
      remainingObjects: 0,
    });
    expect(objects.size).toBe(0);
    expect(storage.remove).toHaveBeenCalledExactlyOnceWith([key]);
    expect(events.at(-1)).toMatchObject({
      action: "delete",
      outcome: "success",
      deletionVerified: true,
    });
    expect(JSON.stringify(events)).not.toContain(key);
    expect(JSON.stringify(events)).not.toContain(
      "Synthetic storage drill bytes",
    );
    expect(drill.receipts().every((receipt) => receipt.auditPersisted)).toBe(
      true,
    );
  });

  it("denies wrong actor, missing group and expired rights before reading storage", async () => {
    const { drill, storage, record } = fixture();
    expect(
      await drill.intake(
        record,
        bytes,
        { ...actor, id: "different_owner" },
        asOf,
      ),
    ).toMatchObject({ code: "ACCESS_DENIED" });
    expect(storage.download).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(await drill.intake(record, bytes, actor, asOf)).toMatchObject({
      ok: true,
    });
    const before = vi.mocked(storage.download).mock.calls.length;
    for (const access of [
      { ...actor, id: "different_owner" },
      { ...actor, groups: [] },
    ])
      expect(await drill.read(record.id, access, asOf)).toMatchObject({
        ok: false,
        code: "ACCESS_DENIED",
      });
    expect(
      await drill.read(record.id, actor, record.permission.expiresAt),
    ).toMatchObject({ code: "PERMISSION_EXPIRED" });
    expect(vi.mocked(storage.download).mock.calls).toHaveLength(before);
    expect(
      await drill.remove(record.id, { ...actor, id: "different_owner" }, later),
    ).toMatchObject({ code: "ACCESS_DENIED" });
    expect(storage.remove).not.toHaveBeenCalled();
    expect(await drill.cleanup(record.permission.expiresAt)).toMatchObject({
      deletionVerified: true,
      remainingObjects: 0,
    });
  });

  it("rejects mismatched bytes, oversized data and non-synthetic metadata without IO", async () => {
    const { drill, record, storage } = fixture();
    expect(
      await drill.intake(
        { ...record, contentHash: "0".repeat(64) },
        bytes,
        actor,
        asOf,
      ),
    ).toMatchObject({ code: "HASH_MISMATCH" });
    expect(
      await drill.intake(
        record,
        new Uint8Array(CORPUS_DRILL_MAX_BYTES + 1),
        actor,
        asOf,
      ),
    ).toMatchObject({ code: "LIMIT_EXCEEDED" });
    expect(
      await drill.intake(
        { ...record, sourceKind: "candidate_upload" },
        bytes,
        actor,
        asOf,
      ),
    ).toMatchObject({ code: "UNAUTHORIZED_SOURCE" });
    expect(storage.download).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(drill.ownedKeys()).toEqual([]);
  });

  it("does not claim or remove an existing object at its generated key", async () => {
    const { drill, objects, record, storage } = fixture();
    const key = `organizations/${scope.organizationId}/evaluation-corpus/${scope.runId}/${record.id}.pdf`;
    objects.set(key, new TextEncoder().encode("different synthetic bytes"));
    expect(await drill.intake(record, bytes, actor, asOf)).toMatchObject({
      code: "KEY_CONFLICT",
    });
    expect(drill.ownedKeys()).toEqual([]);
    expect(await drill.cleanup(asOf)).toMatchObject({
      attemptedObjects: 0,
      deletionVerified: false,
    });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(objects.has(key)).toBe(true);
  });

  it("never treats an ambiguous download response as absence", async () => {
    const { drill, record, storage } = fixture();
    vi.mocked(storage.download).mockResolvedValue({ data: null, error: null });
    expect(await drill.intake(record, bytes, actor, asOf)).toMatchObject({
      code: "ABSENCE_UNVERIFIED",
    });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(drill.ownedKeys()).toEqual([]);
  });

  it("cleans an ambiguous upload that wrote bytes before returning an error", async () => {
    const { drill, record, storage, objects } = fixture();
    vi.mocked(storage.upload).mockImplementationOnce(async (key, data) => {
      objects.set(key, new Uint8Array(data));
      return { error: { code: "synthetic-private-error" } };
    });
    expect(await drill.intake(record, bytes, actor, asOf)).toMatchObject({
      code: "UPLOAD_FAILED",
    });
    expect(drill.ownedKeys()).toHaveLength(1);
    expect(await drill.cleanup(asOf)).toMatchObject({
      ok: true,
      deletionVerified: true,
      remainingObjects: 0,
    });
    expect(objects.size).toBe(0);
    expect(
      drill.receipts().some((receipt) => receipt.code === "UPLOAD_FAILED"),
    ).toBe(true);
    expect(JSON.stringify(drill.receipts())).not.toContain(
      "synthetic-private-error",
    );
  });

  it("retains failed readback ownership for a later exact cleanup retry", async () => {
    const { drill, record, storage } = fixture();
    const download = vi.mocked(storage.download).getMockImplementation()!;
    vi.mocked(storage.download)
      .mockImplementationOnce(download)
      .mockResolvedValueOnce({ data: null, error: { statusCode: "503" } });
    expect(await drill.intake(record, bytes, actor, asOf)).toMatchObject({
      code: "READ_FAILED",
    });
    expect(await drill.cleanup(asOf)).toMatchObject({ deletionVerified: true });
    expect(
      drill.receipts().some((receipt) => receipt.code === "READ_FAILED"),
    ).toBe(true);
  });

  it("does not fabricate deletion from a successful no-op remove", async () => {
    const { drill, record, storage, objects } = fixture();
    await drill.intake(record, bytes, actor, asOf);
    vi.mocked(storage.remove).mockResolvedValueOnce({ error: null });
    expect(await drill.cleanup(asOf)).toMatchObject({
      ok: false,
      deletionVerified: false,
      remainingObjects: 1,
    });
    expect(objects.size).toBe(1);
    expect(await drill.cleanup(asOf)).toMatchObject({
      ok: true,
      deletionVerified: true,
      remainingObjects: 0,
    });
    expect(
      drill.receipts().some((receipt) => receipt.code === "ABSENCE_UNVERIFIED"),
    ).toBe(true);
  });

  it("preserves remove errors even when exact absence is subsequently verified", async () => {
    const { drill, record, storage, objects } = fixture();
    await drill.intake(record, bytes, actor, asOf);
    vi.mocked(storage.remove).mockImplementationOnce(async (keys) => {
      keys.forEach((key) => objects.delete(key));
      return { error: { statusCode: "503" } };
    });
    expect(await drill.remove(record.id, actor, asOf)).toMatchObject({
      ok: false,
      code: "DELETE_FAILED",
      deletionVerified: true,
    });
    expect(await drill.cleanup(asOf)).toMatchObject({
      ok: true,
      deletionVerified: true,
    });
    expect(
      drill
        .receipts()
        .some(
          (receipt) =>
            receipt.code === "DELETE_FAILED" && receipt.deletionVerified,
        ),
    ).toBe(true);
  });

  it("refuses a changed object until the expected owned bytes are restored", async () => {
    const { drill, record, storage, objects } = fixture();
    await drill.intake(record, bytes, actor, asOf);
    const [key] = drill.ownedKeys();
    objects.set(key, new TextEncoder().encode("changed synthetic object"));
    expect(await drill.read(record.id, actor, asOf)).toMatchObject({
      code: "HASH_MISMATCH",
    });
    expect(await drill.cleanup(asOf)).toMatchObject({
      deletionVerified: false,
      remainingObjects: 1,
    });
    expect(storage.remove).not.toHaveBeenCalled();
    objects.set(key, new Uint8Array(bytes));
    expect(await drill.cleanup(asOf)).toMatchObject({ deletionVerified: true });
  });

  it("stops access before IO on audit failure but still performs exact privacy cleanup", async () => {
    const { drill, record, storage, audit, objects } = fixture();
    audit.mockRejectedValueOnce(new Error("synthetic-private-audit-error"));
    expect(await drill.intake(record, bytes, actor, asOf)).toMatchObject({
      ok: false,
      code: "AUDIT_FAILED",
      auditPersisted: false,
    });
    expect(storage.download).not.toHaveBeenCalled();
    await drill.intake(record, bytes, actor, asOf);
    const before = vi.mocked(storage.download).mock.calls.length;
    audit.mockRejectedValue(new Error("synthetic-private-audit-error"));
    expect(await drill.read(record.id, actor, asOf)).toMatchObject({
      code: "AUDIT_FAILED",
      auditPersisted: false,
    });
    expect(vi.mocked(storage.download).mock.calls).toHaveLength(before);
    expect(await drill.cleanup(asOf)).toMatchObject({
      ok: false,
      deletionVerified: true,
      remainingObjects: 0,
    });
    expect(objects.size).toBe(0);
    audit.mockResolvedValue(undefined);
    expect(await drill.cleanup(asOf)).toMatchObject({
      ok: true,
      deletionVerified: true,
    });
    expect(drill.receipts().some((receipt) => !receipt.auditPersisted)).toBe(
      true,
    );
    expect(JSON.stringify(drill.receipts())).not.toContain(
      "synthetic-private-audit-error",
    );
  });

  it("withholds bytes if the terminal access audit cannot be persisted", async () => {
    const { drill, record, audit } = fixture();
    await drill.intake(record, bytes, actor, asOf);
    audit
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("synthetic-audit-error"));
    const result = await drill.read(record.id, actor, asOf);
    expect(result).toMatchObject({ ok: false, code: "AUDIT_FAILED" });
    expect(result.bytes).toBeUndefined();
  });

  it("keeps revocation effective when its audit fails and rejects backdated deletion", async () => {
    const { drill, record, audit, storage } = fixture();
    await drill.intake(record, bytes, actor, asOf);
    audit.mockRejectedValueOnce(new Error("synthetic-audit-error"));
    expect(await drill.revoke(record.id, actor, later)).toMatchObject({
      ok: false,
      code: "AUDIT_FAILED",
    });
    const before = vi.mocked(storage.download).mock.calls.length;
    expect(await drill.read(record.id, actor, later)).toMatchObject({
      code: "RECORD_REVOKED",
    });
    expect(await drill.remove(record.id, actor, asOf)).toMatchObject({
      code: "INVALID_TRANSITION",
    });
    expect(vi.mocked(storage.download).mock.calls).toHaveLength(before);
    expect(await drill.cleanup(later)).toMatchObject({
      deletionVerified: true,
    });
  });

  it("withholds an in-flight read when rights are revoked during download", async () => {
    const { drill, record, storage } = fixture();
    await drill.intake(record, bytes, actor, asOf);
    let began!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(storage.download).mockImplementationOnce(async () => {
      began();
      await gate;
      return { data: new Blob([bytes]), error: null };
    });
    const reading = drill.read(record.id, actor, asOf);
    await started;
    expect(await drill.revoke(record.id, actor, asOf)).toMatchObject({
      ok: true,
    });
    release();
    const result = await reading;
    expect(result.bytes).toBeUndefined();
    expect(result).toMatchObject({ ok: false, code: "RECORD_REVOKED" });
    expect(await drill.cleanup(asOf)).toMatchObject({ deletionVerified: true });
  });

  it("withholds in-flight bytes after verified deletion", async () => {
    const { drill, record, storage } = fixture();
    await drill.intake(record, bytes, actor, asOf);
    let began!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(storage.download).mockImplementationOnce(async () => {
      began();
      await gate;
      return { data: new Blob([bytes]), error: null };
    });
    const reading = drill.read(record.id, actor, asOf);
    await started;
    expect(await drill.remove(record.id, actor, asOf)).toMatchObject({
      ok: true,
      deletionVerified: true,
    });
    release();
    const result = await reading;
    expect(result.bytes).toBeUndefined();
    expect(result).toMatchObject({ ok: false, code: "RECORD_DELETED" });
  });

  it("keeps cleanup pending while its upload is still in flight", async () => {
    const { drill, record, storage, objects } = fixture();
    let began!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(storage.upload).mockImplementationOnce(async (key, data) => {
      began();
      await gate;
      objects.set(key, new Uint8Array(data));
      return { error: null };
    });
    const intake = drill.intake(record, bytes, actor, asOf);
    await started;
    expect(await drill.cleanup(asOf)).toMatchObject({
      ok: false,
      deletionVerified: false,
      remainingObjects: 1,
    });
    expect(storage.remove).not.toHaveBeenCalled();
    release();
    expect(await intake).toMatchObject({ ok: true });
    expect(await drill.cleanup(asOf)).toMatchObject({
      ok: true,
      deletionVerified: true,
      remainingObjects: 0,
    });
  });

  it("rejects path injection in scope and makes no IO claim for empty or invalid cleanup", async () => {
    const { drill } = fixture();
    expect(
      () =>
        new EvaluationCorpusDrill(
          { ...scope, runId: "../outside" },
          {} as CorpusDrillPorts,
        ),
    ).toThrow("Invalid corpus drill scope");
    expect(await drill.cleanup(asOf)).toEqual({
      ok: true,
      deletionVerified: false,
      attemptedObjects: 0,
      remainingObjects: 0,
    });
    expect(await drill.cleanup("invalid")).toMatchObject({
      ok: false,
      deletionVerified: false,
    });
  });
});

// Future real-data branch uses neutral local bytes and trusted callback controls only.
describe("corpus drill authority forwarding and fresh revocation", () => {
  const representative = (
    record: ReturnType<typeof createEvaluationCorpusRecord>,
  ) => {
    record.sourceKind = "real_resume";
    record.permission.purpose = REPRESENTATIVE_CORPUS_PURPOSE;
    record.provenance.fictionalIdentities = false;
    return record;
  };
  it("forwards exact authority for intake/read and permits owned cleanup after withdrawal", async () => {
    let approvedHash: string | null = null;
    let active = true;
    const authority: EvaluationCorpusAuthority = {
      authorize: (binding) =>
        active &&
        binding.recordHash === approvedHash &&
        binding.actorGroups.join() === actor.groups.join() &&
        binding.asOf === asOf,
    };
    const f = fixture(authority);
    representative(f.record);
    approvedHash = hashEvaluationCorpusRecord(f.record);
    expect((await f.drill.intake(f.record, bytes, actor, asOf)).ok).toBe(true);
    expect((await f.drill.read(f.record.id, actor, asOf)).bytes).toEqual(bytes);
    active = false;
    const before = vi.mocked(f.storage.download).mock.calls.length;
    const denied = await f.drill.read(f.record.id, actor, asOf);
    expect(denied.code).toBe("UNAUTHORIZED_SOURCE");
    expect(denied.bytes).toBeUndefined();
    expect(vi.mocked(f.storage.download).mock.calls).toHaveLength(before);
    expect((await f.drill.cleanup(later)).deletionVerified).toBe(true);
  });
  it("denies real intake before upload when authority is absent", async () => {
    const f = fixture();
    representative(f.record);
    expect((await f.drill.intake(f.record, bytes, actor, asOf)).code).toBe(
      "UNAUTHORIZED_SOURCE",
    );
    expect(f.storage.upload).not.toHaveBeenCalled();
  });
  it.each(["download", "terminal_audit"])(
    "never returns bytes if authority is withdrawn during %s",
    async (boundary) => {
      let active = true;
      const f = fixture({ authorize: () => active });
      representative(f.record);
      expect((await f.drill.intake(f.record, bytes, actor, asOf)).ok).toBe(
        true,
      );
      if (boundary === "download") {
        const download = f.storage.download;
        f.storage.download = vi.fn(async (key) => {
          const result = await download(key);
          active = false;
          return result;
        });
      } else {
        f.audit.mockImplementation(async (event) => {
          f.events.push({ ...event });
          if (
            event.action === "read" &&
            event.phase === "terminal" &&
            event.code === "OK"
          )
            active = false;
        });
      }
      const result = await f.drill.read(f.record.id, actor, asOf);
      expect(result.ok).toBe(false);
      expect(result.code).toBe("UNAUTHORIZED_SOURCE");
      expect(result.bytes).toBeUndefined();
      expect(f.events.at(-1)).toMatchObject({
        action: "read",
        outcome: "denied",
        code: "UNAUTHORIZED_SOURCE",
      });
    },
  );
});
