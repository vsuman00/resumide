import fs from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { runProviderAttempt } from "./provider-attempt";

const maximum = 9223372036854775807n;
const maxBytes = 1024 * 1024;
const maxRecords = 4096;
const fields = ["schemaVersion", "generation", "revision", "fence", "phase"];
export type RestoreFloorState = Readonly<{
  schemaVersion: "restore-floor/1.0.0";
  generation: string;
  revision: string;
  fence: string;
  phase: "quarantined" | "ready";
}>;
export type RestoreDeadlineOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};
export class RestoreFloorError extends Error {
  constructor() {
    super("Independent restore authority is unavailable.");
    this.name = "RestoreFloorError";
  }
}
const unavailable = () => new RestoreFloorError();
export function floorNumber(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]{0,18})$/u.test(value) ||
    BigInt(value) > maximum
  )
    throw unavailable();
  return value;
}
function next(value: string) {
  return floorNumber((BigInt(floorNumber(value)) + 1n).toString());
}
export function decodeRestoreFloor(value: unknown): RestoreFloorState {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw unavailable();
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw unavailable();
  const raw = value as Record<string, unknown>,
    keys = Reflect.ownKeys(raw);
  if (
    keys.length !== fields.length ||
    fields.some((key) => !keys.includes(key))
  )
    throw unavailable();
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(raw, key);
    if (!d || d.get || d.set || !d.enumerable) throw unavailable();
  }
  if (
    raw.schemaVersion !== "restore-floor/1.0.0" ||
    (raw.phase !== "quarantined" && raw.phase !== "ready")
  )
    throw unavailable();
  return Object.freeze({
    schemaVersion: "restore-floor/1.0.0",
    generation: floorNumber(raw.generation),
    revision: floorNumber(raw.revision),
    fence: floorNumber(raw.fence),
    phase: raw.phase,
  });
}
export function sameFloor(a: RestoreFloorState, b: RestoreFloorState) {
  return fields.every(
    (key) => a[key as keyof typeof a] === b[key as keyof typeof b],
  );
}
type Active = () => void;
/** Explicit independent volume only; filesystem code cannot prove physical rollback protection. */
export class RestoreFloorStore {
  readonly directory: string;
  private readonly journal: string;
  private readonly lock: string;
  private uncertain = false;
  private quarantineUnconfirmed = false;
  constructor(directory: string) {
    if (!isAbsolute(directory) || resolve(directory) !== directory)
      throw unavailable();
    this.directory = directory;
    this.journal = join(directory, "restore-floor.jsonl");
    this.lock = join(directory, "restore-floor.lock");
  }
  private async bounded<T>(
    options: RestoreDeadlineOptions,
    execute: (active: Active) => Promise<T>,
  ): Promise<T> {
    const ms = options.timeoutMs ?? 5000;
    if (
      !Number.isSafeInteger(ms) ||
      ms < 1 ||
      ms > 5000 ||
      options.signal?.aborted
    )
      throw unavailable();
    const end = performance.now() + ms;
    try {
      const result = await runProviderAttempt({
        timeoutMs: ms,
        signal: options.signal,
        failure: unavailable,
        execute: async (signal) => {
          const active = () => {
            if (signal.aborted || performance.now() >= end) throw unavailable();
          };
          active();
          const result = await execute(active);
          active();
          return result;
        },
      });
      if (options.signal?.aborted || performance.now() >= end)
        throw unavailable();
      return result;
    } catch {
      throw unavailable();
    }
  }
  private async directoryCheck(active: Active) {
    if (this.uncertain || this.quarantineUnconfirmed) throw unavailable();
    const st = await fs.promises.lstat(this.directory);
    active();
    if (
      !st.isDirectory() ||
      st.isSymbolicLink() ||
      (st.mode & 0o777) !== 0o700 ||
      st.uid !== process.getuid?.()
    )
      throw unavailable();
    const actual = await fs.promises.realpath(this.directory);
    active();
    if (actual !== this.directory) throw unavailable();
  }
  private async syncDirectory(active: Active) {
    const fd = await fs.promises.open(
      this.directory,
      fs.constants.O_RDONLY |
        fs.constants.O_NOFOLLOW |
        fs.constants.O_DIRECTORY |
        fs.constants.O_NONBLOCK,
    );
    try {
      active();
      const st = await fd.stat();
      active();
      if (!st.isDirectory()) throw unavailable();
      await fd.sync();
      active();
    } finally {
      await fd.close();
    }
  }
  private async exists(path: string) {
    try {
      await fs.promises.lstat(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
  private async load(
    active: Active,
    ignoreLock = false,
  ): Promise<{ state: RestoreFloorState; advanced: boolean }> {
    await this.directoryCheck(active);
    if (!ignoreLock && (await this.exists(this.lock))) throw unavailable();
    active();
    const before = await fs.promises.lstat(this.journal);
    active();
    if (!before.isFile() || before.isSymbolicLink()) throw unavailable();
    const fd = await fs.promises.open(
      this.journal,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    try {
      active();
      const st = await fd.stat();
      active();
      if (
        !st.isFile() ||
        st.nlink !== 1 ||
        st.uid !== process.getuid?.() ||
        (st.mode & 0o777) !== 0o600 ||
        st.size < 1 ||
        st.size > maxBytes ||
        st.ino !== before.ino ||
        st.dev !== before.dev
      )
        throw unavailable();
      const bytes = Buffer.alloc(st.size),
        read = await fd.read(bytes, 0, bytes.length, 0);
      active();
      if (read.bytesRead !== bytes.length || bytes.at(-1) !== 10)
        throw unavailable();
      const after = await fd.stat();
      active();
      if (after.size !== st.size) throw unavailable();
      const lines = bytes.toString("utf8").slice(0, -1).split("\n");
      if (lines.length > maxRecords) throw unavailable();
      let prior: RestoreFloorState | undefined,
        advanced = false;
      for (const line of lines) {
        active();
        if (line.length > 256) throw unavailable();
        const state = decodeRestoreFloor(JSON.parse(line));
        if (JSON.stringify(state) !== line) throw unavailable();
        if (!prior) {
          if (
            state.generation !== "0" ||
            state.revision !== "0" ||
            state.fence !== "0" ||
            state.phase !== "quarantined"
          )
            throw unavailable();
        } else {
          if (state.revision !== next(prior.revision)) throw unavailable();
          if (
            state.fence === next(prior.fence) &&
            state.generation === prior.generation &&
            state.phase === "quarantined"
          )
            advanced = false;
          else if (
            state.fence === prior.fence &&
            state.generation === next(prior.generation) &&
            state.phase === "quarantined" &&
            prior.phase === "quarantined" &&
            !advanced &&
            prior.fence !== "0"
          )
            advanced = true;
          else if (
            state.fence === prior.fence &&
            state.generation === prior.generation &&
            state.phase === "ready" &&
            prior.phase === "quarantined" &&
            state.generation !== "0" &&
            state.fence !== "0"
          )
            advanced = false;
          else throw unavailable();
        }
        prior = state;
      }
      if (!prior) throw unavailable();
      if (!ignoreLock && (await this.exists(this.lock))) throw unavailable();
      active();
      return { state: prior, advanced };
    } finally {
      await fd.close();
    }
  }
  read(options: RestoreDeadlineOptions = {}): Promise<RestoreFloorState> {
    return this.bounded(
      options,
      async (active) => (await this.load(active)).state,
    );
  }
  /** Controlled initialization only. Read, restore and recovery never bootstrap missing state.
   * A crash-left physical lock cannot be recovered by this store. Actual fenced
   * quiescence and a separately controlled recovery procedure remain required. */
  bootstrap(options: RestoreDeadlineOptions = {}): Promise<RestoreFloorState> {
    return this.mutate(undefined, "bootstrap", options);
  }
  quarantine(
    expected: RestoreFloorState,
    options: RestoreDeadlineOptions = {},
  ) {
    return this.mutate(expected, "quarantine", options);
  }
  advance(expected: RestoreFloorState, options: RestoreDeadlineOptions = {}) {
    return this.mutate(expected, "advance", options);
  }
  ready(expected: RestoreFloorState, options: RestoreDeadlineOptions = {}) {
    return this.mutate(expected, "ready", options);
  }
  private mutate(
    expected: RestoreFloorState | undefined,
    action: "bootstrap" | "quarantine" | "advance" | "ready",
    options: RestoreDeadlineOptions,
  ): Promise<RestoreFloorState> {
    let dirty = false;
    return this.bounded(options, async (active) => {
      let acquired = false;
      try {
        await this.directoryCheck(active);
        active();
        await fs.promises.mkdir(this.lock, { mode: 0o700 });
        acquired = true;
        await this.syncDirectory(active);
        active();
        let state: RestoreFloorState;
        if (action === "bootstrap") {
          if (await this.exists(this.journal)) throw unavailable();
          active();
          state = decodeRestoreFloor({
            schemaVersion: "restore-floor/1.0.0",
            generation: "0",
            revision: "0",
            fence: "0",
            phase: "quarantined",
          });
        } else {
          const current = await this.load(active, true);
          if (
            !expected ||
            !sameFloor(decodeRestoreFloor(expected), current.state)
          )
            throw unavailable();
          state = { ...current.state, revision: next(current.state.revision) };
          if (action === "quarantine")
            state = {
              ...state,
              fence: next(state.fence),
              phase: "quarantined",
            };
          else if (action === "advance") {
            if (
              state.phase !== "quarantined" ||
              state.fence === "0" ||
              current.advanced
            )
              throw unavailable();
            state = { ...state, generation: next(state.generation) };
          } else {
            if (
              state.phase !== "quarantined" ||
              state.generation === "0" ||
              state.fence === "0"
            )
              throw unavailable();
            state = { ...state, phase: "ready" };
          }
        }
        const record = Buffer.from(JSON.stringify(state) + "\n");
        if (action !== "bootstrap") {
          const st = await fs.promises.lstat(this.journal);
          active();
          if (
            st.size + record.length > maxBytes ||
            Number(state.revision) >= maxRecords
          )
            throw unavailable();
        }
        active();
        const fd = await fs.promises.open(
          this.journal,
          fs.constants.O_WRONLY |
            fs.constants.O_NOFOLLOW |
            fs.constants.O_NONBLOCK |
            (action === "bootstrap"
              ? fs.constants.O_CREAT | fs.constants.O_EXCL
              : fs.constants.O_APPEND),
          0o600,
        );
        try {
          active();
          const st = await fd.stat();
          active();
          if (
            !st.isFile() ||
            st.nlink !== 1 ||
            (st.mode & 0o777) !== 0o600 ||
            st.uid !== process.getuid?.()
          )
            throw unavailable();
          dirty = true;
          const written = await fd.write(record);
          active();
          if (written.bytesWritten !== record.length) throw unavailable();
          await fd.sync();
          active();
        } finally {
          await fd.close();
        }
        await this.syncDirectory(active);
        active();
        // The last unlink can also be ambiguous. On failure, restore a quarantine lock.
        await fs.promises.rmdir(this.lock);
        acquired = false;
        await this.syncDirectory(active);
        active();
        return Object.freeze({ ...state });
      } catch {
        if (!acquired && dirty) {
          try {
            await fs.promises.mkdir(this.lock, { mode: 0o700 });
          } catch {
            this.quarantineUnconfirmed = true;
          }
        }
        // Only pre-write, non-cancelled validation failures may release our own lock.
        if (acquired && !dirty) {
          try {
            active();
            await fs.promises.rmdir(this.lock);
            await this.syncDirectory(active);
          } catch {
            this.uncertain = true;
          }
        }
        throw unavailable();
      }
    }).catch((error) => {
      if (dirty) {
        this.uncertain = true;
        // A post-write deadline can race the final unlink acknowledgement. Keep
        // this handle unavailable immediately and reinstall the physical lock.
        // No automatic recovery is allowed while already-issued I/O can finish.
        void fs.promises.mkdir(this.lock, { mode: 0o700 }).catch(() => {
          this.quarantineUnconfirmed = true;
        });
      }
      throw error;
    });
  }
}
