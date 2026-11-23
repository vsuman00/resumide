import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decodeRestoreFloor,
  RestoreFloorStore,
} from "../../app/lib/server/restore-floor";
const directories: string[] = [];
function fixture() {
  const dir = fs.realpathSync(
    fs.mkdtempSync(join(tmpdir(), "resumide-floor-fixture-")),
  );
  fs.chmodSync(dir, 0o700);
  directories.push(dir);
  return { dir, store: new RestoreFloorStore(dir) };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of directories.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});
const initial = {
  schemaVersion: "restore-floor/1.0.0",
  generation: "0",
  revision: "0",
  fence: "0",
  phase: "quarantined",
};
// Faults wrap actual disposable file handles, not a replacement filesystem or production bypass.
function faultHandles(
  fault: (handle: Awaited<ReturnType<typeof fs.promises.open>>) => void,
) {
  const original = fs.promises.open;
  vi.spyOn(fs.promises, "open").mockImplementation(async (...args) => {
    const handle = await original(...args);
    fault(handle);
    return handle;
  });
}
describe("independent restore floor journal", () => {
  it("rejects personal fields in the five-field owner-free state", () => {
    expect(() =>
      decodeRestoreFloor({ ...initial, ownerId: "never-retained" }),
    ).toThrow();
  });
  it("does not initialize missing state and bootstraps only explicitly in quarantine", async () => {
    const { store } = fixture();
    await expect(store.read()).rejects.toThrow();
    expect(await store.bootstrap()).toEqual(initial);
    expect(await store.read()).toEqual(initial);
    await expect(store.bootstrap()).rejects.toThrow();
  });
  it("persists strictly increasing global floor, revision and fencing tokens", async () => {
    const { store, dir } = fixture();
    const zero = await store.bootstrap(),
      q = await store.quarantine(zero),
      advanced = await store.advance(q),
      ready = await store.ready(advanced);
    expect(q).toMatchObject({
      generation: "0",
      revision: "1",
      fence: "1",
      phase: "quarantined",
    });
    expect(advanced).toMatchObject({
      generation: "1",
      revision: "2",
      fence: "1",
      phase: "quarantined",
    });
    expect(ready).toMatchObject({
      generation: "1",
      revision: "3",
      fence: "1",
      phase: "ready",
    });
    expect(await new RestoreFloorStore(dir).read()).toEqual(ready);
    const rows = fs
      .readFileSync(join(dir, "restore-floor.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(rows).toHaveLength(4);
    for (const row of rows)
      expect(Object.keys(row)).toEqual(Object.keys(initial));
  });
  it("CAS and exclusive acquisition reject simultaneous controllers and stale tokens", async () => {
    const { store, dir } = fixture(),
      second = new RestoreFloorStore(dir);
    const zero = await store.bootstrap();
    const results = await Promise.allSettled([
      store.quarantine(zero),
      second.quarantine(zero),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const q = await store.read();
    await expect(second.quarantine(zero)).rejects.toThrow();
    const one = await store.advance(q);
    await expect(store.advance(one)).rejects.toThrow();
    const recovery = await second.quarantine(one),
      two = await second.advance(recovery);
    expect(two.generation).toBe("2");
    await expect(store.ready(one)).rejects.toThrow();
    expect(await second.read()).toEqual(two);
  });
  it("never steals a crash-left lock", async () => {
    const { store, dir } = fixture();
    const zero = await store.bootstrap();
    fs.mkdirSync(join(dir, "restore-floor.lock"), { mode: 0o700 });
    await expect(store.read()).rejects.toThrow();
    await expect(store.quarantine(zero)).rejects.toThrow();
    expect(fs.lstatSync(join(dir, "restore-floor.lock")).isDirectory()).toBe(
      true,
    );
  });
  it("rejects symlink journals, hardlinks, directories and loose permissions", async () => {
    const { store, dir } = fixture();
    await store.bootstrap();
    const path = join(dir, "restore-floor.jsonl");
    fs.chmodSync(path, 0o644);
    await expect(store.read()).rejects.toThrow();
    fs.chmodSync(path, 0o600);
    fs.linkSync(path, join(dir, "second"));
    await expect(store.read()).rejects.toThrow();
    fs.unlinkSync(join(dir, "second"));
    fs.renameSync(path, join(dir, "original"));
    fs.symlinkSync(join(dir, "original"), path);
    await expect(store.read()).rejects.toThrow();
    fs.unlinkSync(path);
    fs.mkdirSync(path);
    await expect(store.read()).rejects.toThrow();
  });
  it("rejects an unsafe or aliased volume path", async () => {
    const { store, dir } = fixture();
    await store.bootstrap();
    fs.chmodSync(dir, 0o755);
    await expect(store.read()).rejects.toThrow();
    fs.chmodSync(dir, 0o700);
    const other = fixture();
    fs.symlinkSync(dir, join(other.dir, "alias"));
    await expect(
      new RestoreFloorStore(join(other.dir, "alias")).read(),
    ).rejects.toThrow();
    expect(() => new RestoreFloorStore("relative")).toThrow();
  });
  it.each([
    "",
    JSON.stringify(initial),
    JSON.stringify({ ...initial, generation: "01" }) + "\n",
    JSON.stringify({ ...initial, generation: "1" }) + "\n",
    JSON.stringify({ ...initial, owner: "x" }) + "\n",
    '{"schemaVersion":"restore-floor/1.0.0","generation":"0","generation":"0","revision":"0","fence":"0","phase":"quarantined"}\n',
    "{bad}\n",
  ])("rejects malformed, noncanonical or torn journal %#", async (raw) => {
    const { store, dir } = fixture();
    fs.writeFileSync(join(dir, "restore-floor.jsonl"), raw, { mode: 0o600 });
    await expect(store.read()).rejects.toThrow();
  });
  it.each(["-1", "01", "1.0", "9223372036854775808", "1".repeat(500), 1, null])(
    "rejects invalid bounded counter %j",
    (value) => {
      expect(() =>
        decodeRestoreFloor({ ...initial, revision: value }),
      ).toThrow();
    },
  );
  it("rejects skipped revisions and oversized storage", async () => {
    const { store, dir } = fixture();
    await store.bootstrap();
    const path = join(dir, "restore-floor.jsonl");
    fs.appendFileSync(
      path,
      JSON.stringify({ ...initial, revision: "2", fence: "1" }) + "\n",
    );
    await expect(store.read()).rejects.toThrow();
    fs.writeFileSync(path, "x".repeat(1024 * 1024 + 1));
    await expect(store.read()).rejects.toThrow();
  });
  it("acknowledges actual file and directory fsync before mutation success", async () => {
    const { store } = fixture();
    await store.bootstrap();
    let files = 0,
      dirs = 0;
    faultHandles((handle) => {
      const original = handle.sync.bind(handle);
      vi.spyOn(handle, "sync").mockImplementation(async () => {
        if ((await handle.stat()).isFile()) files++;
        else dirs++;
        await original();
      });
    });
    await store.quarantine(await store.read());
    expect(files).toBe(1);
    expect(dirs).toBeGreaterThanOrEqual(3);
  });
  it("keeps uncertain file fsync failure locked instead of reporting success", async () => {
    const { store, dir } = fixture();
    const zero = await store.bootstrap();
    faultHandles((handle) => {
      const original = handle.sync.bind(handle);
      vi.spyOn(handle, "sync").mockImplementation(async () => {
        if ((await handle.stat()).isFile()) throw Error("disk failure");
        await original();
      });
    });
    await expect(store.quarantine(zero)).rejects.toThrow();
    expect(fs.existsSync(join(dir, "restore-floor.lock"))).toBe(true);
    await expect(store.read()).rejects.toThrow();
  });
  it("keeps a partial append locked and unavailable", async () => {
    const { store, dir } = fixture();
    const zero = await store.bootstrap();
    faultHandles((handle) => {
      const original = handle.write.bind(handle);
      vi.spyOn(handle, "write").mockImplementation((async (buffer: Buffer) =>
        original(buffer.subarray(0, 8))) as typeof handle.write);
    });
    await expect(store.quarantine(zero)).rejects.toThrow();
    expect(fs.existsSync(join(dir, "restore-floor.lock"))).toBe(true);
    await expect(store.read()).rejects.toThrow();
  });
  it("fails closed if directory durability acknowledgement is lost after append", async () => {
    const { store, dir } = fixture();
    const zero = await store.bootstrap();
    let dirs = 0;
    faultHandles((handle) => {
      const original = handle.sync.bind(handle);
      vi.spyOn(handle, "sync").mockImplementation(async () => {
        if ((await handle.stat()).isDirectory() && ++dirs === 2)
          throw Error("uncertain directory sync");
        await original();
      });
    });
    await expect(store.quarantine(zero)).rejects.toThrow();
    expect(fs.existsSync(join(dir, "restore-floor.lock"))).toBe(true);
  });
  it("returns a bounded unavailable result while an issued disk sync is still pending", async () => {
    const { store, dir } = fixture();
    const zero = await store.bootstrap();
    let release!: () => void;
    const entered = new Promise<void>((done) => {
      faultHandles((handle) => {
        const original = handle.sync.bind(handle);
        vi.spyOn(handle, "sync").mockImplementation(async () => {
          if ((await handle.stat()).isFile()) {
            done();
            await new Promise<void>((r) => {
              release = r;
            });
          }
          await original();
        });
      });
    });
    const pending = store.quarantine(zero, { timeoutMs: 100 });
    const rejection = expect(pending).rejects.toThrow();
    await entered;
    await rejection;
    expect(fs.existsSync(join(dir, "restore-floor.lock"))).toBe(true);
    release();
    await new Promise((r) => setTimeout(r, 20));
    await expect(store.read()).rejects.toThrow();
  });
  it("rejects an actual FIFO without waiting for a writer", async () => {
    const { store, dir } = fixture();
    execFileSync("/usr/bin/mkfifo", [join(dir, "restore-floor.jsonl")], {
      timeout: 1000,
    });
    await expect(store.read({ timeoutMs: 100 })).rejects.toThrow();
  });
  it("retains uncertainty when cancellation races final lock-unlink acknowledgement", async () => {
    const { store, dir } = fixture();
    const initial = await store.bootstrap(),
      q = await store.quarantine(initial),
      advanced = await store.advance(q);
    const ac = new AbortController(),
      original = fs.promises.rmdir;
    vi.spyOn(fs.promises, "rmdir").mockImplementation(async (...args) => {
      await original(...args);
      ac.abort();
    });
    await expect(
      store.ready(advanced, { signal: ac.signal }),
    ).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    await expect(store.read()).rejects.toThrow();
    expect(fs.existsSync(join(dir, "restore-floor.lock"))).toBe(true);
  });
  it("checks cancellation and finite timeout before mutation", async () => {
    const { store } = fixture();
    const zero = await store.bootstrap();
    const ac = new AbortController();
    ac.abort();
    await expect(
      store.quarantine(zero, { signal: ac.signal }),
    ).rejects.toThrow();
    expect(await store.read()).toEqual(zero);
    for (const timeoutMs of [0, 5001, Infinity, NaN])
      await expect(store.quarantine(zero, { timeoutMs })).rejects.toThrow();
  });
});
