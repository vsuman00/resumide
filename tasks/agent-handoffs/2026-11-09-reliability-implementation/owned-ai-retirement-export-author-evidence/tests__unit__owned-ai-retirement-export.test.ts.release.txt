import { describe, expect, it, vi } from "vitest";
import {
  readOwnedAiRetirementExport,
  snapshotOwnedAiRetirementExport,
  OwnedAiRetirementExportSchema,
  OwnedAiRetirementExportError,
  type OwnedAiRetirementExportClient,
  type OwnedAiRetirementProfile,
} from "../../app/lib/server/owned-ai-retirement-export";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// Explicit synthetic expected catalog only; never an installed source profile.
const profile: OwnedAiRetirementProfile = {
  schemaVersion: "owned-ai-retirement-readiness/1.0.0",
  profileVersion: "owned-ai-retirement-profile/1.0.0",
  checkerSha256: "a".repeat(64),
  captureSha256: "b".repeat(64),
  exportSha256: "c".repeat(64),
  metadataSha256: "d".repeat(64),
};
const row = () => ({
  operation_id: id(1),
  publication_id: id(2),
  attempt_id: null,
  run_id: null,
  owner_id: id(3),
  organization_id: id(4),
  analysis_id: id(5),
  resume_id: id(6),
  resume_version_id: id(7),
  publication_state: "deterministic_only",
  binding_sha256: "e".repeat(64),
  retired_at: "2026-11-15T00:00:00.123456Z",
  deletion_request_id: id(8),
  retention_item_id: null,
});
function fixture() {
  const state: { metadata: unknown; data: unknown } = {
    metadata: { ...profile, schemaReady: true, exportExecutable: true },
    data: {
      schemaVersion: "owned-ai-retirement-export/1.0.0",
      retirements: [row()],
    },
  };
  const rpc = vi.fn<OwnedAiRetirementExportClient["rpc"]>(async (name) => ({
    data: structuredClone(
      name === "read_owned_ai_retirement_readiness"
        ? state.metadata
        : state.data,
    ),
    error: null,
  }));
  return {
    state,
    rpc,
    read: () =>
      readOwnedAiRetirementExport({ rpc }, { ownerId: id(3) }, profile),
  };
}
describe("owned retirement export boundary (synthetic catalog/rows, no Native)", () => {
  it("reads exact owner-only RPCs and keeps all owned organizations", async () => {
    const h = fixture();
    h.state.data = {
      schemaVersion: "owned-ai-retirement-export/1.0.0",
      retirements: [
        row(),
        {
          ...row(),
          operation_id: id(21),
          publication_id: id(22),
          organization_id: id(24),
          analysis_id: id(25),
          resume_id: id(26),
          resume_version_id: id(27),
        },
      ],
    };
    const cap = await h.read();
    expect(snapshotOwnedAiRetirementExport(cap, id(3))).toEqual(h.state.data);
    expect(h.rpc.mock.calls).toEqual([
      ["read_owned_ai_retirement_readiness", {}],
      ["export_owned_ai_retirement_records", { p_user_id: id(3) }],
    ]);
  });
  it("freezes captured data and does not mint authority from JSON/shape parsing", async () => {
    const h = fixture(),
      cap = await h.read(),
      snapshot = snapshotOwnedAiRetirementExport(cap, id(3));
    expect(Object.isFrozen(cap)).toBe(true);
    expect(Object.isFrozen(snapshot.retirements)).toBe(true);
    expect(Object.isFrozen(snapshot.retirements[0])).toBe(true);
    expect(() =>
      Reflect.set(snapshot.retirements[0], "owner_id", id(99)),
    ).not.toThrow();
    expect(snapshot.retirements[0].owner_id).toBe(id(3));
    expect(() =>
      snapshotOwnedAiRetirementExport(JSON.parse(JSON.stringify(cap)), id(3)),
    ).toThrow(OwnedAiRetirementExportError);
    expect(() =>
      Reflect.apply(snapshotOwnedAiRetirementExport, null, [
        OwnedAiRetirementExportSchema.parse(h.state.data),
        id(3),
      ]),
    ).toThrow(OwnedAiRetirementExportError);
    expect(() => snapshotOwnedAiRetirementExport(cap, id(99))).toThrow(
      OwnedAiRetirementExportError,
    );
    h.state.data = null;
    expect(snapshotOwnedAiRetirementExport(cap, id(3)).retirements[0]).toEqual(
      row(),
    );
  });
  it.each([
    "schemaReady",
    "exportExecutable",
    "checkerSha256",
    "captureSha256",
    "exportSha256",
    "metadataSha256",
  ])("refuses missing/staged/drifted metadata %s before data", async (key) => {
    const h = fixture();
    h.state.metadata = {
      ...profile,
      schemaReady: true,
      exportExecutable: true,
      [key]: key.endsWith("Sha256") ? "0".repeat(64) : false,
    };
    await expect(h.read()).rejects.toThrow(OwnedAiRetirementExportError);
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...row(), owner_id: id(99) },
    { ...row(), retention_item_id: id(9) },
    { ...row(), deletion_request_id: null },
    { ...row(), publication_state: "assessed" },
    { ...row(), run_id: id(9) },
    { ...row(), retired_at: "2026-02-30T00:00:00Z" },
    { ...row(), retired_at: "2026-11-15T00:00:00+00:00" },
    { ...row(), binding_sha256: "E".repeat(64) },
    { ...row(), resume_id: "\ud800" },
  ])("refuses foreign/incomplete/invalid row %# whole", async (bad) => {
    const h = fixture();
    h.state.data = {
      schemaVersion: "owned-ai-retirement-export/1.0.0",
      retirements: [bad],
    };
    await expect(h.read()).rejects.toThrow(OwnedAiRetirementExportError);
  });
  it("admits assessed exact IDs and root-retention source instead of deletion request", async () => {
    const h = fixture();
    h.state.data = {
      schemaVersion: "owned-ai-retirement-export/1.0.0",
      retirements: [
        {
          ...row(),
          publication_state: "assessed",
          attempt_id: id(10),
          run_id: id(11),
          deletion_request_id: null,
          retention_item_id: id(12),
        },
      ],
    };
    expect(snapshotOwnedAiRetirementExport(await h.read(), id(3))).toEqual(
      h.state.data,
    );
  });
  it("requires all14 columns and strict envelope without omission fallback", async () => {
    const h = fixture(),
      bad: Record<string, unknown> = row();
    delete bad.resume_version_id;
    for (const data of [
      null,
      {},
      { schemaVersion: "owned-ai-retirement-export/1.0.0", retirements: [bad] },
      {
        schemaVersion: "owned-ai-retirement-export/1.0.0",
        retirements: [],
        extra: 1,
      },
    ]) {
      h.state.data = data;
      await expect(h.read()).rejects.toThrow(OwnedAiRetirementExportError);
    }
  });
  it("refuses duplicate authoritative identities and over-limit collections", async () => {
    const h = fixture();
    for (const rows of [
      [row(), row()],
      Array.from({ length: 4097 }, () => row()),
    ]) {
      h.state.data = {
        schemaVersion: "owned-ai-retirement-export/1.0.0",
        retirements: rows,
      };
      await expect(h.read()).rejects.toThrow(OwnedAiRetirementExportError);
    }
    h.state.data = {
      schemaVersion: "owned-ai-retirement-export/1.0.0",
      retirements: [{ ...row(), extra: "x".repeat(33554433) }],
    };
    await expect(h.read()).rejects.toThrow(OwnedAiRetirementExportError);
  });
  it("fails preaborted/invalid inputs before any RPC and does not cache", async () => {
    const h = fixture(),
      c = new AbortController();
    c.abort();
    await expect(
      readOwnedAiRetirementExport({ rpc: h.rpc }, { ownerId: id(3) }, profile, {
        signal: c.signal,
      }),
    ).rejects.toThrow(OwnedAiRetirementExportError);
    expect(h.rpc).not.toHaveBeenCalled();
    await expect(
      readOwnedAiRetirementExport({ rpc: h.rpc }, { ownerId: id(3) }, profile, {
        timeoutMs: 0,
      }),
    ).rejects.toThrow(OwnedAiRetirementExportError);
    expect(h.rpc).not.toHaveBeenCalled();
    await h.read();
    await h.read();
    expect(h.rpc).toHaveBeenCalledTimes(4);
  });
  it("sanitizes synchronous RPC throw and native private body errors", async () => {
    const h = fixture();
    h.rpc.mockImplementation(() => {
      throw Error("privateCanary");
    });
    await expect(h.read()).rejects.toThrow(
      "Owned AI retirement export is unavailable.",
    );
    h.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "privateCanary" },
    });
    await expect(h.read()).rejects.not.toThrow("privateCanary");
  });
  it("bounds stalled metadata and aborts without a follow-on export", async () => {
    vi.useFakeTimers();
    try {
      const h = fixture();
      h.rpc.mockImplementation(() => new Promise(() => {}));
      const p = expect(
        readOwnedAiRetirementExport(
          { rpc: h.rpc },
          { ownerId: id(3) },
          profile,
          { timeoutMs: 10 },
        ),
      ).rejects.toThrow(OwnedAiRetirementExportError);
      await vi.advanceTimersByTimeAsync(11);
      await p;
      expect(h.rpc).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("shares the deadline across metadata and export and checks elapsed timer lag", async () => {
    const h = fixture();
    let time = 0;
    const actual = h.rpc.getMockImplementation()!;
    h.rpc.mockImplementation((name, args) => {
      time = name === "read_owned_ai_retirement_readiness" ? 4 : 10;
      return actual(name, args);
    });
    await expect(
      readOwnedAiRetirementExport({ rpc: h.rpc }, { ownerId: id(3) }, profile, {
        timeoutMs: 10,
        now: () => time,
      }),
    ).rejects.toThrow(OwnedAiRetirementExportError);
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });
});
