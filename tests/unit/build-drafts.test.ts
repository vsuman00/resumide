import { describe, expect, it } from "vitest";
import {
  BUILD_DRAFT_KEY,
  listBuildSnapshots,
  loadBuildDraft,
  saveBuildDraft,
} from "../../app/lib/build-drafts";

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  } as unknown as Storage;
};
const throwing = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
} as unknown as Storage;

describe("build drafts", () => {
  it("round-trips a source", () => {
    const s = memory();
    saveBuildDraft(s, "\\documentclass{article}", 1000);
    expect(loadBuildDraft(s)).toEqual({
      source: "\\documentclass{article}",
      savedAt: 1000,
    });
  });
  it("returns null for invalid JSON or wrong shape", () => {
    const s = memory();
    s.setItem(BUILD_DRAFT_KEY, "{nope");
    expect(loadBuildDraft(s)).toBeNull();
    s.setItem(BUILD_DRAFT_KEY, JSON.stringify({ source: 5 }));
    expect(loadBuildDraft(s)).toBeNull();
  });
  it("neither saves nor loads a source over 49,152 bytes", () => {
    const s = memory();
    const big = "a".repeat(49_153);
    saveBuildDraft(s, big, 1);
    expect(loadBuildDraft(s)).toBeNull();
    s.setItem(BUILD_DRAFT_KEY, JSON.stringify({ source: big, savedAt: 1 }));
    expect(loadBuildDraft(s)).toBeNull();
  });
  it("keeps the newest 5 snapshots, one per 60 seconds", () => {
    const s = memory();
    for (let i = 0; i < 8; i++) saveBuildDraft(s, `v${i}`, i * 61_000);
    saveBuildDraft(s, "v-quick", 7 * 61_000 + 10_000);
    const snaps = listBuildSnapshots(s);
    expect(snaps.map((x) => x.source)).toEqual(["v7", "v6", "v5", "v4", "v3"]);
    expect(loadBuildDraft(s)?.source).toBe("v-quick");
  });
  it("is a no-op for null or throwing storage", () => {
    for (const s of [null, throwing]) {
      expect(() => saveBuildDraft(s, "x", 1)).not.toThrow();
      expect(loadBuildDraft(s)).toBeNull();
      expect(listBuildSnapshots(s)).toEqual([]);
    }
  });
});
